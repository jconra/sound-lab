// editor3d.js — the FULL-3D node editor prototype for the Sound Lab.
//
// Same patch model (patch.js) and same playPatch audio engine as the 2D editor —
// this is purely an alternate LOOK so we can compare head-to-head and pick. Nodes
// are floating slabs in perspective space; params are rotary KNOBS drawn on each
// slab (drag vertically to turn — no sliders); cables are glowing tubes that pulse
// with the audio; OSC/NOISE/ENV/OUT carry a live mini-visualization.
//
// Public API mirrors createEditor(): loadPatch(p), getPatch(), audition(), plus
// onFire()/onStop() the host calls so the in-node viz knows playback state.
//
// opts: { onChange, getLevel():0..1 (cable pulse), getWave():Uint8Array|null (OUT scope) }

import * as THREE from '../math-games/dino-math/js/three.module.js';
import { NODE_SPECS, DEFAULTS, helpFor } from './specs.js?v=20260613x';

const CAT_COLOR = { osc: '#00d8ff', noise: '#4ad07a', filter: '#ffcf4d', shaper: '#ff7a3c', gain: '#5a9bff', delay: '#46c0b8', cv: '#c879ff', reverb: '#7a9ac0', master: '#00eeff' };
const VIZ_NODES = new Set(['osc', 'noise', 'env', 'out']);

const CANVAS_W = 256;            // node canvas LOGICAL px width (height computed per node)
const SS = 3;                    // supersample: render the face texture at SS× native px so it stays crisp when zoomed in
const WORLD_W = 12;              // node slab width in world units
const PX2W = WORLD_W / CANVAS_W; // logical px → world scale for the slab face
const LAYOUT_S = 0.055;          // autoLayout px → world units

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, step) => typeof v !== 'number' ? String(v) : step < 0.01 ? v.toFixed(3) : step < 1 ? v.toFixed(2) : String(Math.round(v));
// position 0..1 along a knob/slider for value `v` — exponential when ps.log (so a wide Hz span gives the low end real travel)
const knobFrac = (ps, v) => ps.log && ps.min > 0
  ? clamp((Math.log(v) - Math.log(ps.min)) / (Math.log(ps.max) - Math.log(ps.min)), 0, 1)
  : clamp((v - ps.min) / (ps.max - ps.min), 0, 1);
const knobVal = (ps, frac) => {                       // inverse of knobFrac, snapped to step
  const raw = ps.log && ps.min > 0
    ? Math.exp(Math.log(ps.min) + frac * (Math.log(ps.max) - Math.log(ps.min)))
    : ps.min + frac * (ps.max - ps.min);
  return clamp(Math.round(raw / ps.step) * ps.step, ps.min, ps.max);
};

let _uid = 0;
const uid = (t) => `${t}${++_uid}`;
const NAME_BY_PREFIX = { ck: 'crack', bd: 'body', tn: 'tone', ch: 'charge', bm: 'boom', ig: 'ignite', ro: 'roar', wh: 'whistle', cr: 'crackle', en: 'engine', bus: 'mix', out: 'output', mtr: 'motor', wob: 'wobble', rev: 'rev' };
const defaultName = (node) => { const id = node.id || ''; return NAME_BY_PREFIX[id] || NAME_BY_PREFIX[id.split('-')[0]] || ''; };

// ════════════════════════════════════════════════════════════════════════════════
export function createEditor3D(root, opts = {}) {
  const onChange = opts.onChange || (() => {});
  const getLevel = opts.getLevel || (() => 0);
  const getWave = opts.getWave || (() => null);
  const onLiveValue = opts.onLiveValue || (() => {});   // push a VALUE-node change to the playing voice (no rebuild)
  const onPersist = opts.onPersist || onChange;         // save the edit without rebuilding the voice

  let patch = { name: 'untitled', dur: 2, nodes: [], cables: [] };
  const nodes = {};   // id -> { node, group, face, canvas, c2d, tex, plugs:{port:mesh}, dimsH, hitRects, dirty }
  let cables = [];    // [{ cable, mesh, isCv }]
  let playing = false, fireAt = 0;
  let backdropTick = () => {};   // per-scene backdrop animation, assigned by setBackdrop()
  let inspectorEl = null, inspectorRec = null;   // the CSS edit box for a clicked node
  let tipEl = null, tipTimer = null;             // plug tooltip (hover on desktop, tap-to-reveal on touch)

  // ── three scaffold ──────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04080e');
  // (no scene fog: it's distance-from-camera based, so zooming out sank the whole
  //  flat graph into black — the starfield + perspective give enough depth instead)

  const camera = new THREE.PerspectiveCamera(48, 1, 4, 4000);  // near=4 keeps node panels z-fight-free (the old 0.5 was the culprit); far is roomy so the desert backdrop (planet/mesa at ~1500u) isn't clipped
  const target = new THREE.Vector3(0, 0, 0);
  const sph = { radius: 90, theta: 0, phi: Math.PI / 2 };  // azimuth, polar — head-on (controls are pan/zoom only)
  function applyCam() {
    sph.phi = clamp(sph.phi, 0.25, Math.PI - 0.25);
    sph.radius = clamp(sph.radius, 18, 320);
    const sinP = Math.sin(sph.phi);
    camera.position.set(
      target.x + sph.radius * sinP * Math.sin(sph.theta),
      target.y + sph.radius * Math.cos(sph.phi),
      target.z + sph.radius * sinP * Math.cos(sph.theta));
    camera.lookAt(target);
  }

  // no global ambient/directional — backdrops provide their own lighting

  let paletteEl = null, _addAt = null;   // add-node context menu (declared before buildPalette() assigns paletteEl)
  buildPalette();

  // ── add-node palette (touch-friendly DOM overlay; tap a type → spawns at view center) ──
  function buildPalette() {
    if (!document.getElementById('sl3d-pal-style')) {
      const style = document.createElement('style'); style.id = 'sl3d-pal-style';
      style.textContent =
        `.sl3d-pal{position:absolute;z-index:35;font-family:'Courier New',monospace;display:none;touch-action:none}` +
        `.sl3d-pal.open{display:block}` +
        `.sl3d-pal .plist{background:#07131c;border:1px solid #16505f;border-radius:6px;padding:4px;box-shadow:0 8px 26px rgba(0,0,0,0.7);max-height:72vh;overflow:auto;touch-action:pan-y}` +
        `.sl3d-pal .phd{font-size:9px;letter-spacing:0.14em;color:#5f8294;padding:5px 9px 4px}` +
        `.sl3d-pal .pitem{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;border:none;color:#9fd;font:inherit;font-size:11px;letter-spacing:0.04em;padding:7px 11px;cursor:pointer;border-radius:3px}` +
        `.sl3d-pal .pitem:hover{background:rgba(0,238,255,0.1)}` +
        `.sl3d-pal .pdot{width:9px;height:9px;border-radius:50%;flex:0 0 9px}` +
        // ── inspector panel (CSS editing box for a clicked 3D node) ──
        `.sl3d-insp{position:absolute;z-index:30;width:236px;background:#0a1722;border:1px solid #345;border-radius:7px;box-shadow:0 10px 34px rgba(0,0,0,0.7);font-family:'Courier New',monospace;touch-action:none}` +
        `.sl3d-insp .ihead{display:flex;align-items:center;gap:7px;padding:7px 9px;border-bottom:1px solid #16303f}` +
        `.sl3d-insp .itype{font-size:9px;letter-spacing:0.12em}` +
        `.sl3d-insp .iname{flex:1;min-width:0;background:#02060a;border:1px solid #16505f;color:#cfffff;font:inherit;font-size:11px;padding:2px 5px;border-radius:3px}` +
        `.sl3d-insp .iclose{background:none;border:none;color:#6a8a9a;font-size:17px;line-height:1;cursor:pointer;padding:0 2px}` +
        `.sl3d-insp .iclose:hover{color:#cfffff}` +
        `.sl3d-insp .ibody{padding:6px 9px 9px;max-height:62vh;overflow:auto;touch-action:pan-y}` +
        `.sl3d-insp .ictl{display:flex;align-items:center;gap:7px;padding:4px 0}` +
        `.sl3d-insp .ilbl{font-size:10px;color:#9bbccc;min-width:54px;letter-spacing:0.02em}` +
        `.sl3d-insp .ictl input[type=range]{flex:1;min-width:50px;height:14px;touch-action:none}` +
        `.sl3d-insp .ival{flex:0 0 auto;width:56px;font-family:inherit;font-size:10px;text-align:right;background:#02060a;border:1px solid #16505f;border-radius:3px;padding:2px 4px;touch-action:none}` +
        `.sl3d-insp .ival::-webkit-inner-spin-button,.sl3d-insp .ival::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}` +
        `.sl3d-insp .ival{-moz-appearance:textfield}` +
        `.sl3d-insp .iseg{display:flex;gap:3px;flex-wrap:wrap;flex:1}` +
        `.sl3d-insp .iseg button{background:transparent;border:1px solid #1a3040;color:#7a9aaa;font:inherit;font-size:9px;padding:2px 6px;border-radius:3px;cursor:pointer}` +
        `.sl3d-insp .idel{width:100%;margin-top:8px;background:transparent;border:1px solid #5a2030;color:#c97a8a;font:inherit;font-size:10px;letter-spacing:0.1em;padding:5px;border-radius:4px;cursor:pointer}` +
        `.sl3d-insp .idel:hover{background:rgba(201,122,138,0.12)}` +
        `.sl3d-insp .idesc{font-size:9px;color:#5f8294;line-height:1.35;margin:-1px 0 5px;padding-left:2px}` +
        `.sl3d-tip{position:absolute;z-index:40;max-width:220px;background:rgba(4,12,20,0.96);border:1px solid #2a6a7a;border-radius:5px;color:#bfe6f0;font-family:'Courier New',monospace;font-size:10px;line-height:1.4;padding:5px 8px;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.6)}` +
        `.sl3d-scene{position:absolute;bottom:10px;left:10px;z-index:20;background:rgba(0,238,255,0.1);border:1px solid #1a4050;color:#9fd;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.1em;padding:6px 11px;border-radius:4px;cursor:pointer}` +
        `.sl3d-scene:hover{border-color:#00eeff;color:#cfffff}`;
      document.head.appendChild(style);
    }
    const pal = document.createElement('div'); pal.className = 'sl3d-pal';
    const list = document.createElement('div'); list.className = 'plist';
    const hd = document.createElement('div'); hd.className = 'phd'; hd.textContent = 'ADD NODE';
    list.appendChild(hd);
    Object.entries(NODE_SPECS).forEach(([type, spec]) => {
      const b = document.createElement('button'); b.className = 'pitem';
      b.innerHTML = `<span class="pdot" style="background:${CAT_COLOR[spec.cat] || '#789'}"></span>${spec.title}`;
      b.addEventListener('click', () => { addNode(type); closePalette(); });
      list.appendChild(b);
    });
    pal.appendChild(list); root.appendChild(pal); paletteEl = pal;
    tipEl = document.createElement('div'); tipEl.className = 'sl3d-tip'; tipEl.style.display = 'none'; root.appendChild(tipEl);
  }
  // ── add-node context menu: long-press (touch) or right-click (desktop) on empty canvas ──
  function openPaletteAt(clientX, clientY) {
    if (!paletteEl) return;
    const pt = pointerOnPlane(clientX, clientY);                    // drop the new node where the menu was opened
    _addAt = pt ? { x: pt.x / LAYOUT_S, y: -pt.y / LAYOUT_S } : null;
    const rr = root.getBoundingClientRect();
    paletteEl.classList.add('open');                               // show first so we can measure it
    const w = paletteEl.offsetWidth || 130, h = paletteEl.offsetHeight || 240;
    paletteEl.style.left = clamp(clientX - rr.left, 4, rr.width - w - 4) + 'px';
    paletteEl.style.top = clamp(clientY - rr.top, 4, rr.height - h - 4) + 'px';
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
  }
  function closePalette() { if (paletteEl) paletteEl.classList.remove('open'); _addAt = null; }

  // value node adopts its target param's min/max when wired (so it reads in real units)
  const VALUE_PS = NODE_SPECS.value.params.find(([k]) => k === 'value')[1];
  function effectiveRange(node, key, ps) {
    if (node.type === 'value' && key === 'value') {
      const c = patch.cables.find(cc => cc.from === node.id && cc.port && cc.port !== 'in');
      if (c) {
        const tgt = patch.nodes.find(n => n.id === c.to);
        const tp = tgt && NODE_SPECS[tgt.type] && NODE_SPECS[tgt.type].params.find(([k]) => k === c.port);
        if (tp && tp[1] && tp[1].min !== undefined) return tp[1];
      }
    }
    return ps;
  }

  // ── plug hover tooltip ────────────────────────────────────────────────────────
  function plugHelp(plug) {
    const ud = plug.userData;
    if (ud.port === 'out') return 'OUTPUT — drag to an input to connect';
    if (ud.port === 'in') return 'AUDIO IN — feed a signal here';
    const rec = nodes[ud.nodeId];
    return `CV → ${ud.port}: ${helpFor(rec ? rec.node.type : '', ud.port)}`;
  }
  function hoverTip(x, y) {
    if (!tipEl) return;
    const plug = pickPlug(x, y);
    if (!plug) { tipEl.style.display = 'none'; renderer.domElement.style.cursor = 'grab'; return; }
    tipEl.textContent = plugHelp(plug);
    const rr = root.getBoundingClientRect();
    tipEl.style.left = Math.min(x - rr.left + 14, rr.width - 230) + 'px';
    tipEl.style.top = (y - rr.top + 16) + 'px';
    tipEl.style.display = 'block';
    renderer.domElement.style.cursor = 'crosshair';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  // ── node inspector (CSS box: click a 3D node → edit its params here, not on the slab) ──
  const _wsv = new THREE.Vector3();
  function worldToScreen(obj) {
    obj.getWorldPosition(_wsv); _wsv.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (_wsv.x * 0.5 + 0.5) * r.width + r.left, y: (-_wsv.y * 0.5 + 0.5) * r.height + r.top };
  }
  function closeInspector() { if (inspectorEl) { inspectorEl.remove(); inspectorEl = null; inspectorRec = null; } }
  function openInspector(rec) {
    closeInspector();
    const node = rec.node, spec = NODE_SPECS[node.type], col = CAT_COLOR[spec.cat] || '#789';
    const panel = document.createElement('div'); panel.className = 'sl3d-insp'; panel.style.borderColor = col;
    panel.addEventListener('pointerdown', e => e.stopPropagation());   // don't let the canvas grab these

    const head = document.createElement('div'); head.className = 'ihead';
    const ty = document.createElement('span'); ty.className = 'itype'; ty.style.color = col; ty.textContent = spec.title;
    const name = document.createElement('input'); name.className = 'iname'; name.value = node.name || ''; name.placeholder = 'name…';
    name.addEventListener('input', () => { node.name = name.value; drawNode(rec); });
    const close = document.createElement('button'); close.className = 'iclose'; close.textContent = '×'; close.addEventListener('click', closeInspector);
    head.append(ty, name, close); panel.appendChild(head);

    const body = document.createElement('div'); body.className = 'ibody';
    for (const [key, ps] of visibleParams(node)) {
      const row = document.createElement('div'); row.className = 'ictl';
      const lbl = document.createElement('span'); lbl.className = 'ilbl'; lbl.textContent = key;
      if (ps.options) {
        const segw = document.createElement('div'); segw.className = 'iseg';
        ps.options.forEach(opt => {
          const b = document.createElement('button'); b.textContent = String(opt);
          if (node[key] === opt) { b.style.borderColor = col; b.style.color = col; b.style.background = hexA(col, 0.12); }
          b.addEventListener('click', () => {
            node[key] = opt;
            segw.querySelectorAll('button').forEach(x => { x.style.borderColor = ''; x.style.color = ''; x.style.background = ''; });
            b.style.borderColor = col; b.style.color = col; b.style.background = hexA(col, 0.12);
            drawNode(rec); audition();
          });
          segw.appendChild(b);
        });
        row.append(lbl, segw);
      } else {
        const ps2 = effectiveRange(node, key, ps);
        const logScale = ps2.log && ps2.min > 0;   // log params ride a normalized 0..1000 track, mapped back to real units
        const rng = document.createElement('input'); rng.type = 'range'; rng.style.accentColor = col;
        if (logScale) { rng.min = 0; rng.max = 1000; rng.step = 1; rng.value = knobFrac(ps2, node[key]) * 1000; }
        else { rng.min = ps2.min; rng.max = ps2.max; rng.step = ps2.step; rng.value = node[key]; }
        const num = document.createElement('input'); num.type = 'number'; num.className = 'ival'; num.style.color = col;
        num.step = ps2.step; num.value = fmt(node[key], ps2.step);   // TYPE an exact value here — may go beyond the slider's range
        const commit = (v) => {                       // apply a new value from either control (slider or typed box)
          node[key] = v; drawNode(rec);
          if (node.type === 'value') { redrawValueTargets(node.id); onLiveValue(node.id, v); }   // live rev — no rebuild
        };
        rng.addEventListener('input', () => { const v = logScale ? knobVal(ps2, rng.value / 1000) : parseFloat(rng.value); num.value = fmt(v, ps2.step); commit(v); });
        num.addEventListener('input', () => { const v = parseFloat(num.value); if (!Number.isNaN(v)) { rng.value = logScale ? knobFrac(ps2, v) * 1000 : v; commit(v); } });   // slider follows (pins at its range; node keeps the typed value)
        // value nodes update the live voice already → just persist (no restart click); everything else re-auditions
        const settle = () => { if (node.type === 'value') onPersist(); else audition(); };
        rng.addEventListener('change', settle); num.addEventListener('change', settle);
        row.append(lbl, rng, num);
      }
      body.appendChild(row);
      const desc = helpFor(node.type, key);
      if (desc) { const dd = document.createElement('div'); dd.className = 'idesc'; dd.textContent = desc; body.appendChild(dd); }
    }
    const del = document.createElement('button'); del.className = 'idel'; del.textContent = '✕ DELETE NODE';
    del.addEventListener('click', () => { removeNode(node.id); closeInspector(); });
    body.appendChild(del); panel.appendChild(body);
    root.appendChild(panel);

    // position next to the node (projected to screen), clamped inside the canvas
    const s = worldToScreen(rec.group), rr = root.getBoundingClientRect();
    let left = s.x - rr.left + 16, top = s.y - rr.top - 24;
    left = Math.max(8, Math.min(left, rr.width - 244));
    top = Math.max(8, Math.min(top, rr.height - 260));
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
    inspectorEl = panel; inspectorRec = rec;
  }

  // ── public ───────────────────────────────────────────────────────────────────
  function loadPatch(p) {
    patch = JSON.parse(JSON.stringify(p));
    patch.nodes.forEach(n => {
      if (!('id' in n)) n.id = uid(n.type);
      if (!n.name) n.name = defaultName(n);
      if (n.type === 'out' && n.gain === undefined) n.gain = 0.85;        // OUT gain = master volume
      if (n.type === 'gain' && n.gain === undefined) n.gain = 0;          // VCA: always show the knob (0 = closed, open it or wire an ENV)
      if (n.type === 'noise') { const d = DEFAULTS.noise; for (const k in d) if (n[k] === undefined) n[k] = d[k]; }   // always show the full face (mode toggle etc.)
      if (n.type === 'env') { if (n.sustain === undefined) n.sustain = 0.6; if (n.release === undefined) n.release = 0.3; }   // expose ADSR knobs
      if (['env', 'value'].includes(n.type) && n.delay === undefined) n.delay = 0;   // envelopes/value carry the timing knob (sources run continuously)
    });
    if (patch.nodes.some(n => n.x == null)) autoLayout();
    rebuild();
    frameAll();
  }
  function getPatch() { return patch; }
  const debounce = (fn, ms) => { let h; return () => { clearTimeout(h); h = setTimeout(fn, ms); }; };
  const audition = debounce(() => onChange(), 80);

  // a node's inputs (the nodes feeding it), ordered to match its plug stack: audio input
  // first, then CV params — both in cable order. This is "the children, in input order".
  const _idset = () => { const s = new Set(); patch.nodes.forEach(n => s.add(n.id)); return s; };
  function inputsOrdered(id, ids) {
    const audio = [], cv = [];
    patch.cables.forEach(c => { if (c.to !== id) return; (!c.port || c.port === 'in' ? audio : cv).push(c.from); });
    return audio.concat(cv).filter(k => ids.has(k));
  }

  // ── tidy-tree auto-layout (rooted at the OUTPUT, grows leftward) ───────────────
  // X: rank each node by its LONGEST path forward to a sink (out/send); sinks sit on the RIGHT and
  // inputs march progressively LEFT. So a node hugs as close to what it feeds as its own deepest
  // branch allows — a source wired straight to OUT sits right beside it instead of being flushed to
  // the far-left column (which is what stretched short branches into long diagonals before).
  // Y: walk inputs from the sink(s) — each leaf takes the next slot (siblings contiguous, in input
  // order), each parent sits at the AVERAGE of its children. resolveOverlap() then spreads by height.
  function autoLayout() {
    const COLW = 320, ROWH = 150;
    const ids = _idset();
    const outgoing = {}, rank = {};
    patch.nodes.forEach(n => outgoing[n.id] = []);
    patch.cables.forEach(c => { if (outgoing[c.from] && ids.has(c.to)) outgoing[c.from].push(c.to); });
    const calc = (id, seen) => {                           // longest path from id forward to a sink
      if (rank[id] != null) return rank[id];
      if (seen.has(id)) return 0; seen.add(id);
      const outs = outgoing[id];
      rank[id] = outs.length ? Math.max(...outs.map(t => calc(t, seen) + 1)) : 0;   // sink/dead-end → 0
      return rank[id];
    };
    patch.nodes.forEach(n => calc(n.id, new Set()));
    const maxRank = patch.nodes.reduce((m, n) => Math.max(m, rank[n.id] || 0), 0);

    const slot = {}, busy = new Set(); let cursor = 0;
    const place = (id) => {
      if (slot[id] != null) return slot[id];
      if (busy.has(id)) return cursor;                    // cycle guard
      busy.add(id);
      const kids = inputsOrdered(id, ids);
      if (!kids.length) return (slot[id] = cursor++);     // leaf → next slot
      let s = 0; kids.forEach(k => s += place(k));
      return (slot[id] = s / kids.length);                // parent → mean of its children
    };
    const roots = patch.nodes.filter(n => n.type === 'out' || n.type === 'send');
    (roots.length ? roots : patch.nodes).forEach(r => place(r.id));
    patch.nodes.forEach(n => { if (slot[n.id] == null) place(n.id); });   // orphans

    patch.nodes.forEach(n => { n.x = (maxRank - (rank[n.id] || 0)) * COLW; n.y = (slot[n.id] || 0) * ROWH; });
  }

  // ── (re)build all node slabs + cables ─────────────────────────────────────────
  function clearGraph() {
    closeInspector();
    Object.values(nodes).forEach(o => { scene.remove(o.group); o.tex.dispose(); });
    for (const k in nodes) delete nodes[k];
    cables.forEach(c => { scene.remove(c.mesh); c.mesh.geometry.dispose(); });
    cables = [];
  }
  function rebuild() { clearGraph(); patch.nodes.forEach(buildNode); resolveOverlap(); rebuildCables(); }

  // Height-aware relaxation: keep each parent centered on its children (barycenter on real
  // positions, not indices), and spread overlapping nodes within a column apart — so columns
  // aren't squashed to one midline and downstream nodes follow their inputs' vertical span.
  function resolveOverlap() {
    const recs = Object.values(nodes); if (!recs.length) return;
    const ids = _idset();
    const GAP = 2.2, wH = r => r.H * PX2W;
    const cols = {};
    recs.forEach(r => { const k = Math.round(r.node.x); (cols[k] || (cols[k] = [])).push(r); });
    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
    const y = {}; recs.forEach(r => y[r.node.id] = -r.node.y * LAYOUT_S);   // world Y (up positive)
    const declump = (col) => {                            // push overlaps apart symmetrically, keep order
      col.sort((a, b) => y[b.node.id] - y[a.node.id]);    // top (high Y) first
      for (let i = 1; i < col.length; i++) {
        const a = col[i - 1], b = col[i];
        const need = wH(a) / 2 + wH(b) / 2 + GAP, d = y[a.node.id] - y[b.node.id];
        if (d < need) { const push = (need - d) / 2; y[a.node.id] += push; y[b.node.id] -= push; }
      }
    };
    colKeys.forEach(k => declump(cols[k]));
    for (let it = 0; it < 14; it++) {                     // settle: parents follow children, then de-overlap
      colKeys.forEach(k => cols[k].forEach(r => {
        const kids = inputsOrdered(r.node.id, ids);
        if (kids.length) y[r.node.id] = kids.reduce((s, id) => s + y[id], 0) / kids.length;
      }));
      colKeys.forEach(k => declump(cols[k]));
    }
    recs.forEach(r => { r.group.position.y = y[r.node.id]; r.node.y = -y[r.node.id] / LAYOUT_S; });
  }

  function visibleParams(node) {
    const spec = NODE_SPECS[node.type]; if (!spec) return [];
    return spec.params.filter(([k]) => node[k] !== undefined);
  }

  function buildNode(node) {
    const spec = NODE_SPECS[node.type]; if (!spec) return;
    const params = visibleParams(node);
    const hasViz = VIZ_NODES.has(node.type);
    const rowH = 26, headH = 30, vizH = hasViz ? 52 : 0, pad = 6;
    const PLUG_DY_PX = 28;
    const nLeft = (spec.hasIn ? 1 : 0) + (spec.cv ? spec.cv.length : 0);
    // tall enough for the content OR the left plug stack, whichever needs more room
    const H = Math.max(headH + params.length * rowH + vizH + pad, headH + nLeft * PLUG_DY_PX + pad);

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W * SS; canvas.height = H * SS;   // native px; drawNode scales the ctx so all draw code stays in logical px
    const c2d = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    tex.minFilter = THREE.LinearFilter;

    const wW = WORLD_W, wH = H * PX2W;
    const group = new THREE.Group();

    // slab body (thin box behind the face)
    const color = new THREE.Color(CAT_COLOR[spec.cat] || '#789');
    const DEPTH = 3.2;                      // chunky box so the 3/4 view shows real thickness
    const slab = new THREE.Mesh(new THREE.BoxGeometry(wW + 0.5, wH + 0.5, DEPTH),
      new THREE.MeshStandardMaterial({ color: 0x1b2f42, emissive: color, emissiveIntensity: 0.28, metalness: 0.3, roughness: 0.5 }));
    slab.position.z = -DEPTH / 2 - 0.4;     // front face just behind the panel (no z-fight)
    group.add(slab);

    // glowing edge frame
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(wW + 0.5, wH + 0.5, DEPTH)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    edge.position.z = slab.position.z; group.add(edge);

    // face (canvas texture) — the raycast target for knobs / dragging
    const face = new THREE.Mesh(new THREE.PlaneGeometry(wW, wH),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    face.userData.nodeId = node.id;
    group.add(face);

    // plugs
    const plugs = {};
    const plugGeoA = new THREE.SphereGeometry(0.55, 16, 12);
    const plugGeoC = new THREE.OctahedronGeometry(0.62);
    const leftPorts = [];
    if (spec.hasIn) leftPorts.push(['in', 'audio']);
    (spec.cv || []).forEach(p => leftPorts.push([p, 'cv']));
    const dyW = PLUG_DY_PX * PX2W;
    const firstY = wH / 2 - (headH + PLUG_DY_PX * 0.5) * PX2W;   // center of first plug slot, just under the header
    // world-Y of a setting row's centre, so each CV plug lines up with the bar it modulates
    const rowWorldY = key => {
      const i = params.findIndex(([k]) => k === key);
      return i < 0 ? null : wH / 2 - (headH + 4 + i * rowH + rowH / 2) * PX2W;
    };
    let cvN = 0;
    const headY = wH / 2 - headH * 0.5 * PX2W;        // audio input rides at the HEADER row, clear of the param rows below
    leftPorts.forEach(([port, kind]) => {
      const m = new THREE.Mesh(kind === 'cv' ? plugGeoC : plugGeoA,
        new THREE.MeshBasicMaterial({ color: kind === 'cv' ? 0xc879ff : 0x2fb7c8 }));
      // audio input at the header (so it never collides with a CV plug); CV plugs align to their target setting's row
      const py = kind === 'audio' ? headY : (rowWorldY(port) ?? firstY - (++cvN) * dyW);
      m.position.set(-wW / 2 - 0.2, py, 0.2);
      m.userData = { nodeId: node.id, port, kind, plug: true };
      group.add(m); plugs[port] = m;
    });
    if (spec.out) {
      const kind = spec.out;
      const m = new THREE.Mesh(kind === 'cv' ? plugGeoC : plugGeoA,
        new THREE.MeshBasicMaterial({ color: kind === 'cv' ? 0xc879ff : 0x2fb7c8 }));
      m.position.set(wW / 2 + 0.2, wH / 2 - headH / 2 * PX2W, 0.2);
      m.userData = { nodeId: node.id, port: 'out', kind, plug: true };
      group.add(m); plugs.out = m;
    }

    group.position.set(node.x * LAYOUT_S, -node.y * LAYOUT_S, 0);
    scene.add(group);

    const rec = { node, group, face, canvas, c2d, tex, plugs, H, headH, rowH, vizH, hasViz, color, params, hitRects: [] };
    nodes[node.id] = rec;
    drawNode(rec);
  }

  // ── draw a node's face (header + knobs + viz) to its canvas ───────────────────
  function drawNode(rec) {
    const { c2d: g, canvas, node, headH, rowH, params, hasViz, color } = rec;
    const W = canvas.width / SS, H = canvas.height / SS;   // logical dims; ctx scaled by SS so all draw code below uses logical px
    const col = color.getStyle();
    g.setTransform(SS, 0, 0, SS, 0, 0);
    g.clearRect(0, 0, W, H);
    // body — lighter, top-lit gradient so the panel pops off the dark scene
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(30,50,68,0.97)'); bg.addColorStop(1, 'rgba(15,29,41,0.97)');
    roundRect(g, 1, 1, W - 2, H - 2, 10); g.fillStyle = bg; g.fill();
    g.lineWidth = 2; g.strokeStyle = col; g.globalAlpha = 0.75; g.stroke(); g.globalAlpha = 1;
    // header
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, hexA(col, 0.45)); grad.addColorStop(1, 'rgba(0,0,0,0)');
    roundRect(g, 1, 1, W - 2, headH, 10); g.fillStyle = grad; g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(16, headH / 2 + 1, 5, 0, 7); g.fill();
    g.font = '700 13px Courier New, monospace'; g.textBaseline = 'middle';
    g.fillStyle = hexA(col, 0.85); g.fillText(NODE_SPECS[node.type].title, 28, headH / 2 + 1);
    if (node.name) { g.fillStyle = '#cfffff'; g.font = '13px Courier New, monospace'; g.fillText(node.name, 28 + 56, headH / 2 + 1); }

    // header hit targets: delete (×) and bypass toggle (○) — both DRAWN later (after the dim overlay)
    rec.hitRects = [{ kind: 'del', x: W - 32, y: 0, w: 32, h: headH }, { kind: 'tog', x: W - 58, y: 0, w: 26, h: headH }];
    let y = headH + 4;
    for (const [key, ps] of params) {
      const rect = { key, x: 0, y, w: W, h: rowH };
      if (ps.options) { drawSeg(g, rect, key, ps, node[key], col); rect.kind = 'seg'; rect.opts = ps.options; }
      else {
        const ps2 = effectiveRange(node, key, ps);
        const drv = cvDriverFor(node.id, key);     // CV-driven? value node SETs (show its value), else MOD (show base + '~')
        const showVal = (drv && drv.kind === 'set') ? drv.value : node[key];
        drawBar(g, rect, key, ps2, showVal, col, drv ? drv.kind : null);
        rect.kind = 'num'; rect.ps = ps2;
      }
      rec.hitRects.push(rect);
      y += rowH;
    }

    // viz strip
    if (hasViz) drawViz(rec, y, W, rec.vizH);

    // BYPASS: dim the whole face + label (drawn over the body, under the header controls)
    if (node.disabled) {
      roundRect(g, 1, 1, W - 2, H - 2, 10); g.save(); g.clip();
      g.fillStyle = 'rgba(8,14,20,0.62)'; g.fillRect(0, headH, W, H);
      g.fillStyle = '#8aa6b6'; g.font = '700 11px Courier New, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('— BYPASS —', W / 2, headH + (H - headH) / 2); g.textAlign = 'left'; g.restore();
    }

    // header controls, drawn LAST so they stay crisp over the dim overlay ──
    const tx = W - 44, tcy = headH / 2 + 1;          // bypass toggle: filled ○ = active, hollow = bypassed
    g.beginPath(); g.arc(tx, tcy, 6, 0, 7); g.lineWidth = 1.5;
    g.strokeStyle = node.disabled ? '#5a7a8a' : col; g.stroke();
    if (!node.disabled) { g.fillStyle = hexA(col, 0.85); g.fill(); }
    g.font = '700 17px Courier New, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';   // delete ×
    g.fillStyle = '#c97a8a'; g.fillText('×', W - 16, headH / 2 + 1); g.textAlign = 'left';

    rec.tex.needsUpdate = true;
  }

  // a horizontal fill bar (replaces the old dial). Name + value sit ON the bar: white where the
  // bar is empty behind them, black where the lit fill is behind them — drawn twice, the second
  // pass clipped to the filled region — so they stay sharp wherever the fill boundary lands.
  // driven: null = static · 'set' = a VALUE node sets it (val IS the driven value) · 'mod' = an ENV/LFO/etc
  // modulates it (val is the resting base; a '~' marks that it swings). Both paint the bar CV-purple.
  function drawBar(g, rect, key, ps, val, col, driven) {
    if (driven) col = '#c879ff';                    // CV-driven → paint the bar in CV purple
    const frac = knobFrac(ps, val);
    const pad = 12, x = rect.x + pad, w = rect.w - pad * 2;
    const h = 20, y = rect.y + (rect.h - h) / 2;
    // empty track
    roundRect(g, x, y, w, h, 5); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill();
    // lit fill, clipped to the track's rounded rect
    if (frac > 0) {
      g.save(); roundRect(g, x, y, w, h, 5); g.clip();
      const fg = g.createLinearGradient(x, 0, x + w, 0);
      fg.addColorStop(0, hexA(col, 0.9)); fg.addColorStop(1, hexA(col, 0.55));
      g.fillStyle = fg; g.fillRect(x, y, w * frac, h);
      g.restore();
    }
    // border
    g.lineWidth = 1; g.strokeStyle = hexA(col, 0.6); roundRect(g, x, y, w, h, 5); g.stroke();
    // name (left) + value (right): drawn white, then redrawn black clipped to the filled region
    const cy = y + h / 2 + 0.5;
    const valStr = fmt(val, ps.step) + (driven === 'mod' ? ' ~' : '');   // '~' = this rests here but is swung by CV
    const labels = () => {
      g.textAlign = 'left'; g.fillText(key, x + 8, cy);
      g.textAlign = 'right'; g.fillText(valStr, x + w - 8, cy);
    };
    g.font = '700 16px Courier New, monospace'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; labels();                       // over the empty track
    if (frac > 0) {
      g.save(); g.beginPath(); g.rect(x, y, w * frac, h); g.clip();
      g.fillStyle = '#000000'; labels();                     // over the lit fill
      g.restore();
    }
    g.textAlign = 'left';
  }

  function drawSeg(g, rect, key, ps, val, col) {
    const cy = rect.y + rect.h / 2;
    g.font = '11px Courier New, monospace'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#b6d8e8'; g.fillText(key, 12, cy);
    let x = 70;
    rect.pills = [];
    ps.options.forEach(opt => {
      const label = String(opt).slice(0, 4);
      const w = g.measureText(label).width + 12;
      const on = node_eq(val, opt);
      roundRect(g, x, cy - 8, w, 16, 4); g.fillStyle = on ? hexA(col, 0.28) : 'rgba(255,255,255,0.06)'; g.fill();
      g.lineWidth = 1; g.strokeStyle = on ? col : 'rgba(255,255,255,0.2)'; g.stroke();
      g.fillStyle = on ? col : '#9bbccc'; g.fillText(label, x + 6, cy);
      rect.pills.push({ opt, x, w });
      x += w + 5;
    });
  }

  // synthetic / real per-node viz drawn under the knobs
  function drawViz(rec, y, W, h) {
    const g = rec.c2d, node = rec.node, col = rec.color.getStyle();
    const x0 = 10, w = W - 20, top = y + 2, H = h - 6, mid = top + H / 2;
    g.save();
    roundRect(g, x0, top, w, H, 5); g.clip();
    g.fillStyle = 'rgba(2,8,14,0.45)'; g.fillRect(x0, top, w, H);
    g.strokeStyle = hexA(col, 0.9); g.lineWidth = 1.5; g.beginPath();
    const t = playing ? (performance.now() - fireAt) / 1000 : 0;
    if (node.type === 'osc') {
      const wave = node.wave || 'sine', cycles = 3, ph = t * 2;
      for (let i = 0; i <= w; i++) {
        const u = i / w, p = (u * cycles + ph) % 1;
        let s; if (wave === 'square') s = p < 0.5 ? 1 : -1;
        else if (wave === 'sawtooth') s = 1 - 2 * p;
        else if (wave === 'triangle') s = 1 - 4 * Math.abs(p - 0.5);
        else s = Math.sin(p * Math.PI * 2);
        const yy = mid - s * (H / 2 - 3);
        i ? g.lineTo(x0 + i, yy) : g.moveTo(x0 + i, yy);
      }
      g.stroke();
    } else if (node.type === 'noise') {
      const slots = Math.min(48, Math.max(1, Math.round(node.steps || 24)));   // cap bars so white (steps=256) still reads
      const churn = Math.floor(t * clamp((node.freq || 46) / 8, 4, 30));         // hiss shimmers fast, motor chugs slow
      const bw = w / slots;
      g.fillStyle = hexA(col, 0.7);
      for (let i = 0; i < slots; i++) {
        const v = rec._seed ? pseudo(rec._seed + i + churn) : Math.random();
        const bh = (0.15 + v * 0.85) * (H - 4);
        g.fillRect(x0 + i * bw + 0.5, mid - bh / 2, Math.max(1, bw - 1), bh);
      }
    } else if (node.type === 'env') {
      // ADSR shape with the DELAY as a flat lead-in (so it reads "fires LATER", not at t=0). Playhead while firing.
      const dly = node.delay || 0;
      const pk = (node.peak ?? 1), atk = node.attack || 0.01, dec = node.decay || 0.2;
      const rel = node.release || 0.3, sus = (node.sustain ?? 0) * pk, susHold = (atk + dec + rel) * 0.5 + 0.05;
      const total = dly + atk + dec + susHold + rel;
      const yOf = v => top + H - 3 - clamp(v / Math.max(0.001, pk), 0, 1) * (H - 6);
      const xOf = tt => x0 + clamp(tt / total, 0, 1) * w;
      g.beginPath(); g.moveTo(xOf(0), yOf(0));
      g.lineTo(xOf(dly), yOf(0));                                     // flat delay lead-in before the attack
      g.lineTo(xOf(dly + atk), yOf(pk)); g.lineTo(xOf(dly + atk + dec), yOf(sus)); g.lineTo(xOf(dly + atk + dec + susHold), yOf(sus)); g.lineTo(xOf(total), yOf(0));
      g.stroke();
      if (dly > 0) {                                                 // faint tick marking FIRE (where the delay ends / attack begins)
        g.save(); g.strokeStyle = hexA(col, 0.4); g.lineWidth = 1; g.setLineDash([2, 2]);
        g.beginPath(); g.moveTo(xOf(dly), top); g.lineTo(xOf(dly), top + H); g.stroke(); g.restore();
      }
      if (playing) {
        const px = x0 + clamp((t % (total * 1.4)) / total, 0, 1) * w;
        g.strokeStyle = '#ffffff'; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(px, top); g.lineTo(px, top + H); g.stroke(); g.globalAlpha = 1;
      }
    } else if (node.type === 'out') {
      const wave = getWave();
      if (wave && wave.length) {
        const n = wave.length, step = n / w;
        for (let i = 0; i <= w; i++) {
          const s = (wave[Math.floor(i * step)] - 128) / 128;
          const yy = mid - s * (H / 2 - 2);
          i ? g.lineTo(x0 + i, yy) : g.moveTo(x0 + i, yy);
        }
        g.stroke();
      } else { g.moveTo(x0, mid); g.lineTo(x0 + w, mid); g.stroke(); }
    }
    g.restore();
  }

  // ── cables ─────────────────────────────────────────────────────────────────
  const _wa = new THREE.Vector3(), _wb = new THREE.Vector3();
  function rebuildCables() {
    cables.forEach(c => { scene.remove(c.mesh); c.mesh.geometry.dispose(); });
    cables = [];
    patch.cables.forEach(cable => {
      const a = nodes[cable.from], b = nodes[cable.to];
      if (!a || !b) return;
      const pa = a.plugs.out, pb = b.plugs[cable.port || 'in'];
      if (!pa || !pb) return;
      const isCv = !!cable.port && cable.port !== 'in';
      const mesh = makeCableMesh(pa, pb, isCv);
      scene.add(mesh); cables.push({ cable, mesh, isCv });
    });
  }
  function makeCableMesh(pa, pb, isCv) {
    pa.getWorldPosition(_wa); pb.getWorldPosition(_wb);
    const mid = _wa.clone().add(_wb).multiplyScalar(0.5);
    mid.z += 4 + _wa.distanceTo(_wb) * 0.12;          // bow toward viewer
    const curve = new THREE.QuadraticBezierCurve3(_wa.clone(), mid, _wb.clone());
    const geo = new THREE.TubeGeometry(curve, 22, 0.22, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color: isCv ? 0xc879ff : 0x2fc8d6, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    return new THREE.Mesh(geo, mat);
  }

  // ── backdrops: swappable scenes (Stars / Saturn Desert / Abstract) ────────────
  const backdropGroup = new THREE.Group(); scene.add(backdropGroup);
  const SPACE_BG = new THREE.Color('#04080e');

  function disposeObj(o) {
    o.traverse(n => {
      if (n.geometry) n.geometry.dispose();
      const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
      mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
  function clearBackdrop() {
    while (backdropGroup.children.length) { const c = backdropGroup.children[0]; backdropGroup.remove(c); disposeObj(c); }
    if (scene.background && scene.background.isTexture) scene.background.dispose();
    backdropGroup.position.set(0, 0, 0);            // desert offsets this for parallax; reset for other scenes
    backdropTick = () => {};
  }
  function starField(n, color, size, sx, sy, sz) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i*3] = (Math.random()-0.5)*sx; pos[i*3+1] = (Math.random()-0.5)*sy; pos[i*3+2] = (Math.random()-0.5)*sz; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, sizeAttenuation: true }));
  }
  function vGradient(stops, draw) {                 // vertical-gradient sky as a screen background texture
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512); stops.forEach(([t, col]) => grad.addColorStop(t, col));
    g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
    if (draw) draw(g, 256, 512);
    const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  const BACKDROPS = {
    'Stars': () => {
      scene.background = SPACE_BG.clone();
      const pts = starField(700, 0x2a4a5a, 1.4, 600, 400, 600);
      backdropGroup.add(pts);
      backdropTick = () => { pts.rotation.y += 0.0004; };
    },
    'Saturn Desert': () => {
      // Dusk sky baked into the screen-fixed background. The cracked GROUND is a real FLAT world plane; the camera
      // rides high above it so the floor's horizon falls into the BOTTOM QUARTER, hazing out into a thick dusty
      // band well before its true vanishing line. Planet + mesa + cactus are 3D too. The whole rig follows only a
      // FRACTION of the camera pan (backdropTick), so it parallaxes gently as you drag the graph.
      const W = 1280, H = 768, hor = Math.round(H * 0.74);
      const D = { light: 4, tilt: -0.12, nearY: -55, camY: -35, mesaX: -490, cactusX: 160 };  // baked-in look
      const stars = Array.from({ length: 130 }, () => ({ x: Math.random()*W, y: Math.random()*hor*0.84, a: 0.3 + Math.random()*0.5, r: Math.random() < 0.85 ? 0.8 : 1.5 }));
      const bakeSky = (haze) => {                                      // dusk sky + horizon haze; re-baked when the Haze slider moves
        const bc = document.createElement('canvas'); bc.width = W; bc.height = H; const g = bc.getContext('2d');
        const sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#050518'); sky.addColorStop(0.34, '#120c28'); sky.addColorStop(0.54, '#301836'); sky.addColorStop(0.68, '#542b20'); sky.addColorStop(0.74, '#74462a'); sky.addColorStop(0.8, '#543320'); sky.addColorStop(1, '#2c1c12');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        stars.forEach(s => { g.fillStyle = '#cfe0ff'; g.globalAlpha = s.a; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill(); });
        g.globalAlpha = 1;
        const a = v => Math.min(1, v * haze);                          // Haze slider scales the band opacity (0 = clear, 1 = default)
        const hz = g.createLinearGradient(0, hor - 150, 0, hor + 60);  // dusty haze hugging the horizon — the ground melts up into this
        hz.addColorStop(0, 'rgba(104,68,46,0)'); hz.addColorStop(0.55, `rgba(104,68,46,${a(0.64)})`); hz.addColorStop(0.85, `rgba(92,60,42,${a(0.8)})`); hz.addColorStop(1, `rgba(74,48,34,${a(0.44)})`);
        g.fillStyle = hz; g.fillRect(0, hor - 150, W, 210);
        if (scene.background && scene.background.isTexture) scene.background.dispose();
        scene.background = new THREE.CanvasTexture(bc);
      };
      bakeSky(1);

      // ── cracked ground: REAL 3D horizontal plane, far edge faded to transparent so it melts into dusk ──
      // Two toroidal Voronoi layers (chunky plates + fine hairline cracks). Edge-distance shading curls a
      // recessed shadow into each plate rim and domes the centres, so it reads like dried mud, not flat tile.
      const T = 512, tcn = document.createElement('canvas'); tcn.width = T; tcn.height = T; const tg = tcn.getContext('2d');
      const sites = (n, jit) => {                                       // jittered toroidal grid of Voronoi seeds
        const a = []; const cell = T / n;
        for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++)
          a.push([(cc + 0.5 + (Math.random()-0.5)*jit)*cell, (r + 0.5 + (Math.random()-0.5)*jit)*cell, 0.74 + Math.random()*0.26, (Math.random()-0.5)*0.5]);
        return a;
      };
      const sd = sites(6, 0.85), fd = sites(14, 0.9);                  // major plates, fine secondary cracks
      const edge = (S, x, y) => {                                       // → [edgeDist, tint, hueShift] for nearest cell
        let d1 = 1e12, d2 = 1e12, sh = 0.8, hu = 0;
        for (let k = 0; k < S.length; k++) {
          let dx = Math.abs(x - S[k][0]); if (dx > T/2) dx = T - dx;
          let dy = Math.abs(y - S[k][1]); if (dy > T/2) dy = T - dy;
          const e = dx*dx + dy*dy;
          if (e < d1) { d2 = d1; d1 = e; sh = S[k][2]; hu = S[k][3]; } else if (e < d2) d2 = e;
        }
        return [Math.sqrt(d2) - Math.sqrt(d1), sh, hu];
      };
      const tim = tg.createImageData(T, T), td = tim.data;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const i = (y*T + x)*4;
        const [ed, sh, hu] = edge(sd, x, y);
        const cw = 1.4 + 2.4 * pseudo(x*0.06 + y*0.021);               // crack half-width wanders along its length
        let r, gC, b;
        if (ed < cw) {                                                 // ── deep crack: dark, blackest at its core ──
          const f = ed / cw;                                           // 0 core → 1 plate rim
          const k = 0.5 + 0.5*f;
          r = 60*k; gC = 42*k; b = 28*k;
        } else {                                                       // ── mud plate ──
          const fed = edge(fd, x, y)[0];                               // fine-crack network inside the plate
          const rim = Math.min(1, (ed - cw) / 6);                      // 0 at crack rim → 1 just inside (curl shadow)
          const dome = 0.9 + Math.min(0.16, ed / 130);                 // gentle highlight toward plate centre
          const grain = 0.94 + Math.random()*0.12;
          let m = sh * (0.66 + 0.34*rim) * dome * grain;               // recessed, shadowed rim → bright interior
          if (fed < 1.0) m *= 0.62;                                    // hairline secondary crack darkens the plate
          r = (148 + hu*20) * m; gC = (116 + hu*8) * m; b = (82 - hu*16) * m;     // darker warm tan, hue jitter per plate
        }
        td[i] = r; td[i+1] = gC; td[i+2] = b; td[i+3] = 255;
      }
      tg.putImageData(tim, 0, 0);
      const gtex = new THREE.CanvasTexture(tcn); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(20, 6);
      gtex.anisotropy = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? renderer.capabilities.getMaxAnisotropy() : 8;  // keep distant plates crisp at the grazing angle
      const acn = document.createElement('canvas'); acn.width = 4; acn.height = 256; const acx = acn.getContext('2d');
      const agr = acx.createLinearGradient(0, 0, 0, 256);              // near (v=0) opaque → hazes out well before the true vanishing line so the floor sits low
      agr.addColorStop(0, '#ffffff'); agr.addColorStop(0.34, '#ffffff'); agr.addColorStop(0.52, '#4a4a4a'); agr.addColorStop(0.7, '#0a0a0a'); agr.addColorStop(1, '#000000');
      acx.fillStyle = agr; acx.fillRect(0, 0, 4, 256);
      const atex = new THREE.CanvasTexture(acn);
      const ground_material = new THREE.MeshStandardMaterial({ map: gtex});
      const ground_geometry = new THREE.PlaneGeometry(5600, 2400);
      const ground = new THREE.Mesh(ground_geometry, ground_material);
      // Near edge (geometry y=−GHALF) anchored at NEAR_Y below camera, NEAR_Z in front.
      // Depth 2400 (GHALF=1200) reaches the mesa (z≈−2200) at default tilt.
      const NEAR_Z = 90, GHALF = 1200;
      const groundPosFromTilt = t => ({ rx: -Math.PI/2 + t, py: D.nearY + GHALF*Math.sin(t), pz: NEAR_Z - GHALF*Math.cos(t) });
      // World y on the tilted ground at a given local z (used to plant cactus/mesa correctly).
      const groundYatZ = (t, gz) => { const theta=-Math.PI/2+t, st=Math.sin(theta), ct=Math.cos(theta), {py,pz}=groundPosFromTilt(t); return Math.abs(st)>1e-6 ? py+((gz-pz)/st)*ct : py; };
      const gp0 = groundPosFromTilt(D.tilt);
      ground.rotation.x = gp0.rx; ground.position.set(0, gp0.py, gp0.pz);
      ground.renderOrder = -1;

      // ── distant mesa + saguaro cactus ──
      const silho = (draw, w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(cv); return tx; };
      const mtex = silho((q, w, h) => {                               // a long mesa/butte RIDGE spanning the whole back
        q.fillStyle = '#000000';                                      // pure black silhouette
        q.beginPath(); q.moveTo(0, h);
        const profile = [                                             // [x-frac, height-frac] — flat-topped mesas + buttes across the width
          [0.00, 0.28], [0.05, 0.52], [0.12, 0.54], [0.16, 0.70], [0.24, 0.70], [0.28, 0.48],
          [0.34, 0.42], [0.40, 0.74], [0.51, 0.76], [0.56, 0.54], [0.62, 0.34], [0.70, 0.36],
          [0.74, 0.62], [0.83, 0.62], [0.87, 0.44], [0.93, 0.46], [0.98, 0.30], [1.00, 0.24],
        ];
        profile.forEach(([xf, tf]) => q.lineTo(xf * w, h * (1 - tf)));
        q.lineTo(w, h); q.closePath(); q.fill();
      }, 1024, 160);
      const mesa = new THREE.Mesh(new THREE.PlaneGeometry(3400, 520), new THREE.MeshBasicMaterial({ map: mtex, transparent: true, depthWrite: false }));
      mesa.position.set(D.mesaX, D.nearY + 2*GHALF*Math.sin(D.tilt) + 200, -2200); // y = far edge of ground plane
      const ctex = silho((q, w, h) => {                               // saguaro cactus (green)
        q.strokeStyle = '#001000'; q.lineCap = 'round'; q.lineJoin = 'round';
        const cx = w*0.5; q.lineWidth = w*0.16;
        q.beginPath(); q.moveTo(cx, h); q.lineTo(cx, h*0.12); q.stroke();
        q.lineWidth = w*0.11;
        q.beginPath(); q.moveTo(cx, h*0.52); q.lineTo(cx + w*0.26, h*0.40); q.lineTo(cx + w*0.26, h*0.20); q.stroke();
        q.beginPath(); q.moveTo(cx, h*0.64); q.lineTo(cx - w*0.24, h*0.52); q.lineTo(cx - w*0.24, h*0.30); q.stroke();
      }, 128, 200);
      const cactus = new THREE.Mesh(new THREE.PlaneGeometry(132, 206), new THREE.MeshLambertMaterial({ map: ctex, transparent: true, depthWrite: false }));
      cactus.position.set(D.cactusX, groundYatZ(D.tilt, -700) + 96, -700); // 96 = half cactus height so base sits on ground

      // ── ringed planet (3D, in the sky) ──
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const pg = c.getContext('2d');
      pg.fillStyle = '#5a4226'; pg.fillRect(0, 0, 256, 256);
      const rg = pg.createRadialGradient(92, 84, 18, 128, 128, 162);
      rg.addColorStop(0, '#f6e0b0'); rg.addColorStop(0.42, '#cda468'); rg.addColorStop(0.74, '#6e4f29'); rg.addColorStop(1, '#130c06');
      pg.fillStyle = rg; pg.fillRect(0, 0, 256, 256);
      pg.globalAlpha = 0.14; pg.fillStyle = '#2e2012';
      for (let i = 0; i < 9; i++) { const y = Math.random()*256; pg.fillRect(0, y, 256, 2 + Math.random()*7); }
      pg.globalAlpha = 1;
      const planet = new THREE.Mesh(new THREE.SphereGeometry(46, 48, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
      planet.position.set(-150, 210, -560);
      const ring = new THREE.Mesh(new THREE.RingGeometry(58, 88, 96), new THREE.MeshBasicMaterial({ color: 0xcaa979, side: THREE.DoubleSide, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.copy(planet.position); ring.rotation.set(Math.PI*0.46, 0.18, 0.1);
      // ── lighting: a point light sitting at the graph; the floor/cactus catch it up close and fall into darkness
      // with distance. Planet/ring/mesa are MeshBasic so they ignore it (mesa stays pure black). ──
      const lamp = new THREE.PointLight(0xffe6c2, D.light, 1450, 1.5);   // warm lamp; distance cutoff = where it fades to dark
      backdropGroup.add(ground, mesa, cactus, planet, ring, lamp);
      // Parallax: follow only a FRACTION of the camera pan so the desert drifts gently behind the graph instead
      // of being locked to it. Depth (z) is left world-fixed — a flat floor handles zoom naturally (you move over
      // it, horizon stays centred), which is what the old z-locked version got wrong.
      const PF = 0.78;
      backdropTick = () => {
        planet.rotation.y += 0.0006;
        backdropGroup.position.set(camera.position.x * PF, camera.position.y * PF, 0);
        lamp.position.set(camera.position.x * (1 - PF), camera.position.y * (1 - PF), 0);   // → world ≈ the graph plane (z=0) at the view centre
      };

      target.y = D.camY; applyCam();
    },
    'Abstract': () => {
      scene.background = vGradient([[0, '#180322'], [0.5, '#0a0418'], [1, '#02060f']]);
      const geoms = [() => new THREE.IcosahedronGeometry(1, 0), () => new THREE.OctahedronGeometry(1), () => new THREE.TorusGeometry(1, 0.34, 8, 18), () => new THREE.TetrahedronGeometry(1.2)];
      const cols = [0xff4db8, 0x00eaff, 0xffd24a, 0x7a5cff, 0x3cff9e];
      const shapes = [];
      for (let i = 0; i < 16; i++) {
        const base = geoms[i % geoms.length](); const wf = new THREE.WireframeGeometry(base); base.dispose();
        const seg = new THREE.LineSegments(wf, new THREE.LineBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        seg.scale.setScalar(7 + Math.random()*24);
        seg.position.set((Math.random()-0.5)*440, (Math.random()-0.5)*320, -70 - Math.random()*360);
        seg.userData = { sx: (Math.random()-0.5)*0.006, sy: (Math.random()-0.5)*0.008, sz: (Math.random()-0.5)*0.004 };
        backdropGroup.add(seg); shapes.push(seg);
      }
      backdropTick = () => { shapes.forEach(s => { s.rotation.x += s.userData.sx; s.rotation.y += s.userData.sy; s.rotation.z += s.userData.sz; }); };
    },
  };

  let backdropName = 'Saturn Desert';
  try { const s = localStorage.getItem('sl.backdrop'); if (s && BACKDROPS[s]) backdropName = s; } catch {}
  function setBackdrop(name) {
    if (!BACKDROPS[name]) return;
    clearBackdrop(); backdropName = name; BACKDROPS[name]();
    try { localStorage.setItem('sl.backdrop', name); } catch {}
  }
  function buildScenePicker() {                     // tap to cycle scenes (touch-friendly), bottom-left of canvas
    const names = Object.keys(BACKDROPS);
    const el = document.createElement('button'); el.className = 'sl3d-scene';
    el.textContent = 'SCENE: ' + backdropName;
    el.addEventListener('click', () => { const i = (names.indexOf(backdropName) + 1) % names.length; setBackdrop(names[i]); el.textContent = 'SCENE: ' + names[i]; });
    root.appendChild(el);
  }
  setBackdrop(backdropName); buildScenePicker();

  // ── camera framing ────────────────────────────────────────────────────────────
  function frameAll() {
    const ids = Object.keys(nodes); if (!ids.length) { applyCam(); return; }
    scene.updateMatrixWorld(true);                      // ensure group transforms are current
    const box = new THREE.Box3();
    ids.forEach(id => box.expandByObject(nodes[id].group));
    box.getCenter(target);
    const size = box.getSize(new THREE.Vector3());
    if (!isFinite(target.x) || !isFinite(size.x)) {     // empty/NaN box → safe default
      target.set(0, 0, 0); sph.radius = 80; applyCam(); return;
    }
    const span = Math.max(size.x, size.y) * 0.5;
    sph.radius = clamp(span / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.25 + 8, 18, 320);
    applyCam();
  }

  // ── interaction ────────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ptrs = new Map();           // pointerId -> {x,y}
  let drag = null;                  // active drag state
  let pinchDist = 0;

  function ndc(x, y) { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); }
  function pick(x, y) {
    raycaster.setFromCamera(ndc(x, y), camera);
    const faces = Object.values(nodes).map(o => o.face);
    const hit = raycaster.intersectObjects(faces, false)[0];
    if (!hit) return null;
    const rec = nodes[hit.object.userData.nodeId];
    // uv → logical canvas px (hitRects are stored in logical px, canvas is SS× larger)
    const u = hit.uv.x, v = hit.uv.y;
    const cx = u * rec.canvas.width / SS, cy = (1 - v) * rec.canvas.height / SS;
    const rect = rec.hitRects.find(r => cy >= r.y && cy < r.y + r.h && cx >= r.x && cx < r.x + r.w);
    return { rec, rect, cx, cy };
  }
  function pickPlug(x, y) {
    raycaster.setFromCamera(ndc(x, y), camera);
    const plugs = [];
    Object.values(nodes).forEach(rec => Object.values(rec.plugs).forEach(m => plugs.push(m)));
    const hit = raycaster.intersectObjects(plugs, false)[0];
    return hit ? hit.object : null;
  }
  function pickCable(x, y) {
    if (!cables.length) return null;
    raycaster.setFromCamera(ndc(x, y), camera);
    const hit = raycaster.intersectObjects(cables.map(c => c.mesh), false)[0];
    return hit ? cables.find(c => c.mesh === hit.object) : null;
  }
  const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);   // z=0 plane for projecting the wire end
  const _ppt = new THREE.Vector3();
  function pointerOnPlane(x, y) {
    raycaster.setFromCamera(ndc(x, y), camera);
    return raycaster.ray.intersectPlane(_plane, _ppt) ? _ppt.clone() : null;
  }

  // ── wiring + add/remove ─────────────────────────────────────────────────────
  let wireLine = null;
  const WIRE_R = 0.38;                              // in-progress cable radius (thick + easy to see on touch)
  const SNAP_PX = 54;                               // how close (screen px) the finger must get to an input to snap
  function startWire(plug) {
    const p0 = new THREE.Vector3(); plug.getWorldPosition(p0);
    drag = { type: 'wire', from: plug.userData.nodeId, p0, hoverPlug: null };
    wireLine = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(p0, p0.clone()), 1, WIRE_R, 7, false),
      new THREE.MeshBasicMaterial({ color: 0x8fffe0, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(wireLine);
  }
  function setWireEnd(p1) {
    if (!wireLine) return;
    wireLine.geometry.dispose();
    wireLine.geometry = new THREE.TubeGeometry(new THREE.LineCurve3(drag.p0, p1), 1, WIRE_R, 7, false);
  }
  // highlight the input we're about to drop on: enlarge it (so it reads under a fingertip)
  function setWireTarget(plug) {
    if (drag.hoverPlug === plug) return;
    if (drag.hoverPlug) drag.hoverPlug.scale.setScalar(1);
    drag.hoverPlug = plug || null;
    if (plug) plug.scale.setScalar(2.2);
  }
  // nearest INPUT/CV plug within maxPx of the finger (forgiving hit-test — no pixel-perfect aim needed)
  const _sv = new THREE.Vector3();
  function pickInputPlugNear(x, y, maxPx, excludeNode) {
    const rr = renderer.domElement.getBoundingClientRect();
    let best = null, bestD = maxPx;
    Object.values(nodes).forEach(rec => Object.values(rec.plugs).forEach(m => {
      if (m.userData.port === 'out' || m.userData.nodeId === excludeNode) return;
      m.getWorldPosition(_sv); _sv.project(camera);
      const sx = rr.left + (_sv.x * 0.5 + 0.5) * rr.width, sy = rr.top + (-_sv.y * 0.5 + 0.5) * rr.height;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) { bestD = d; best = m; }
    }));
    return best;
  }
  function showTipFor(plug, x, y) {   // name of the input, above the fingertip so it's not covered
    if (!tipEl) return;
    clearTimeout(tipTimer);
    tipEl.textContent = plugHelp(plug);
    const rr = renderer.domElement.getBoundingClientRect();
    tipEl.style.left = Math.min(Math.max(8, x - rr.left - 60), rr.width - 230) + 'px';
    tipEl.style.top = Math.max(4, y - rr.top - 34) + 'px';
    tipEl.style.display = 'block';
  }
  function endWire(x, y) {
    const tgt = drag.hoverPlug || pickInputPlugNear(x, y, SNAP_PX, drag.from);
    if (drag.hoverPlug) drag.hoverPlug.scale.setScalar(1);
    if (wireLine) { scene.remove(wireLine); wireLine.geometry.dispose(); wireLine = null; }
    hideTip(); clearTimeout(tipTimer);
    if (tgt && tgt.userData.port !== 'out') addCable(drag.from, tgt.userData.nodeId, tgt.userData.port);
  }
  function addCable(from, to, port) {
    if (from === to) return;
    if (patch.cables.some(c => c.from === from && c.to === to && (c.port || 'in') === (port || 'in'))) return;
    patch.cables.push(port && port !== 'in' ? { from, to, port } : { from, to });
    syncValueNode(from);
    if (port && port !== 'in' && nodes[to]) drawNode(nodes[to]);   // target bar now reads as CV-driven (purple)
    rebuildCables(); audition();
  }
  // drop a pass-through node onto a cable A→B → splice it in: A→node, node→B (B keeps the original port)
  function spliceIntoCable(nid, cable) {
    if (!patch.cables.includes(cable)) return;
    const from = cable.from, to = cable.to, port = (cable.port && cable.port !== 'in') ? cable.port : null;
    if (from === nid || to === nid) return;
    patch.cables = patch.cables.filter(c => c !== cable);            // remove the original A→B
    if (!patch.cables.some(c => c.from === from && c.to === nid && !c.port)) patch.cables.push({ from, to: nid });          // A → node (audio in)
    if (!patch.cables.some(c => c.from === nid && c.to === to && (c.port || 'in') === (port || 'in'))) patch.cables.push(port ? { from: nid, to, port } : { from: nid, to });   // node → B (orig port)
    syncValueNode(from);
    if (nodes[to]) drawNode(nodes[to]); if (nodes[nid]) drawNode(nodes[nid]);
    rebuildCables(); audition();
  }
  // what's driving (id, key) via a CV cable: a VALUE node SETS it → {kind:'set', value}; any other
  // source (env/lfo/osc/math) MODULATES it → {kind:'mod'}; nothing wired → null.
  function cvDriverFor(id, key) {
    const cabs = patch.cables.filter(cc => cc.to === id && cc.port === key);
    if (!cabs.length) return null;
    for (const c of cabs) {                                   // a value node wins (it sets an absolute level)
      const src = patch.nodes.find(n => n.id === c.from);
      if (src && src.type === 'value') return { kind: 'set', value: src.value ?? 0 };
    }
    return { kind: 'mod' };
  }
  // redraw every node a VALUE node drives, so the target bars track edits to the value
  function redrawValueTargets(id) {
    patch.cables.forEach(c => { if (c.from === id && c.port && c.port !== 'in' && nodes[c.to]) drawNode(nodes[c.to]); });
  }
  // a value node reads in its target's units — clamp its value into the target's range + redraw
  function syncValueNode(id) {
    const node = patch.nodes.find(n => n.id === id);
    if (!node || node.type !== 'value') return;
    const rng = effectiveRange(node, 'value', VALUE_PS);
    node.value = clamp(node.value ?? 0, rng.min, rng.max);
    const rec = nodes[id]; if (rec) drawNode(rec);
    if (inspectorRec && inspectorRec.node.id === id) openInspector(rec);   // refresh slider range
    redrawValueTargets(id);                                                // refresh the bars this value node drives
  }

  let _addN = 0;
  function addNode(type) {
    const node = Object.assign({ id: uid(type), type, name: '' }, JSON.parse(JSON.stringify(DEFAULTS[type] || {})));
    if (_addAt) { node.x = _addAt.x; node.y = _addAt.y; }       // dropped from the context menu → spawn at that spot
    else { node.x = target.x / LAYOUT_S + (_addN % 5) * 26; node.y = -target.y / LAYOUT_S + (_addN % 5) * 18; }   // fallback: view center, staggered
    _addN++;
    if (type === 'out' && node.gain === undefined) node.gain = 0.85;
    patch.nodes.push(node); buildNode(node); rebuildCables(); audition();
  }

  renderer.domElement.addEventListener('pointerdown', e => {
    renderer.domElement.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (paletteEl && paletteEl.classList.contains('open')) { closePalette(); return; }   // a tap anywhere dismisses the add-node menu
    if (e.button === 2) { openPaletteAt(e.clientX, e.clientY); return; }                  // desktop right-click → add-node menu
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); drag = { type: 'pinch' }; clearLongPress(); return; }
    // tap a plug → show its info (touch has no hover; auto-dismiss after a few seconds)
    const plug = pickPlug(e.clientX, e.clientY);
    if (plug) {
      hoverTip(e.clientX, e.clientY);
      clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 3000);
      if (plug.userData.port === 'out') { startWire(plug); return; }   // output also begins a wire
      return;                                                          // input/CV plug: info only
    }
    // cut: tap on a cable
    const cab = pickCable(e.clientX, e.clientY);
    if (cab) { drag = { type: 'cut', cab, x0: e.clientX, y0: e.clientY }; return; }
    const p = pick(e.clientX, e.clientY);
    if (p && p.rect && p.rect.kind === 'del') {
      drag = { type: 'del', rec: p.rec, x0: e.clientX, y0: e.clientY };
    } else if (p && p.rect && p.rect.kind === 'tog') {
      drag = { type: 'tog', rec: p.rec, x0: e.clientX, y0: e.clientY };   // tap = toggle bypass
    } else if (p) {                                   // tap = open inspector, drag = move node
      const pw = pointerOnPlane(e.clientX, e.clientY);  // grab offset = node pos − cursor-on-plane, so it stays pinned
      drag = { type: 'node', rec: p.rec, startX: e.clientX, startY: e.clientY, moved: false,
               offx: pw ? p.rec.node.x * LAYOUT_S - pw.x : 0, offy: pw ? -p.rec.node.y * LAYOUT_S - pw.y : 0 };
    } else {
      closeInspector();
      drag = { type: 'pan', x: e.clientX, y: e.clientY };
      startLongPress(e.clientX, e.clientY);          // hold on empty canvas → add-node menu
    }
    renderer.domElement.style.cursor = drag.type === 'pan' ? 'grabbing' : 'default';
  });

  // long-press (touch) detection — opens the add-node menu where the finger is held
  let lpTimer = null, lpX = 0, lpY = 0;
  function startLongPress(x, y) { clearLongPress(); lpX = x; lpY = y; lpTimer = setTimeout(() => { lpTimer = null; drag = null; openPaletteAt(lpX, lpY); }, 480); }
  function clearLongPress() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());   // suppress the native long-press/right-click menu (we show our own)

  renderer.domElement.addEventListener('pointermove', e => {
    const rec0 = ptrs.get(e.pointerId); if (rec0) { rec0.x = e.clientX; rec0.y = e.clientY; }
    if (lpTimer && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 8) clearLongPress();   // moved = a pan, not a long-press
    if (!drag) { hoverTip(e.clientX, e.clientY); return; }
    hideTip();
    if (drag.type === 'pinch') {
      const [a, b] = [...ptrs.values()]; if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) { sph.radius *= pinchDist / d; applyCam(); }
      pinchDist = d; return;
    }
    if (drag.type === 'wire') {
      const tgt = pickInputPlugNear(e.clientX, e.clientY, SNAP_PX, drag.from);
      setWireTarget(tgt);
      if (tgt) {                                    // locked on: snap the cable to the plug + name it
        const wp = new THREE.Vector3(); tgt.getWorldPosition(wp); setWireEnd(wp);
        showTipFor(tgt, e.clientX, e.clientY);
      } else {
        const pt = pointerOnPlane(e.clientX, e.clientY); if (pt) setWireEnd(pt);
        hideTip();
      }
      return;
    }
    if (drag.type === 'pan') {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      const vh = renderer.domElement.clientHeight || 1;
      const k = (2 * sph.radius * Math.tan((camera.fov * Math.PI / 180) / 2)) / vh;   // world units per screen px
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      applyCam(); return;
    }
    if (drag.type === 'node') {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 3) drag.moved = true;
      const pw = pointerOnPlane(e.clientX, e.clientY);   // project cursor onto the node's plane → node tracks the cursor exactly
      if (pw) {
        const wx = pw.x + drag.offx, wy = pw.y + drag.offy;
        drag.rec.node.x = wx / LAYOUT_S; drag.rec.node.y = -wy / LAYOUT_S;
        drag.rec.group.position.set(wx, wy, 0);
        rebuildCables();                                  // fresh cable meshes — then we can highlight one for splicing
      }
      // splice preview: a pass-through node hovering over a cable highlights it (drop = insert into that cable)
      drag.spliceCab = null;
      const spec = NODE_SPECS[drag.rec.node.type];
      if (spec && spec.hasIn && spec.out) {
        const cab = pickCable(e.clientX, e.clientY);
        if (cab && cab.cable.from !== drag.rec.node.id && cab.cable.to !== drag.rec.node.id) {
          drag.spliceCab = cab.cable;
          cab.mesh.material.color.setHex(0xffffff); cab.mesh.material.opacity = 0.95;   // bright = "will insert here" (reset next rebuild)
        }
      }
      return;
    }
  });

  function endPtr(e) {
    clearLongPress();
    if (drag && drag.type === 'wire') endWire(e.clientX, e.clientY);
    if (drag && drag.type === 'cut') {
      const moved = Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0);
      if (moved < 8) { const cab = drag.cab.cable, f = cab.from; patch.cables = patch.cables.filter(c => c !== cab); if (nodes[cab.to]) drawNode(nodes[cab.to]); syncValueNode(f); rebuildCables(); audition(); }   // tap a cable → cut (redraw the freed target so its driven bar clears)
    }
    if (drag && drag.type === 'del') {
      const moved = Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0);
      if (moved < 8) removeNode(drag.rec.node.id);          // tap (not drag) on × → delete
    }
    if (drag && drag.type === 'tog') {
      const moved = Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0);
      if (moved < 8) { const n = drag.rec.node; n.disabled = !n.disabled; drawNode(drag.rec); audition(); }   // tap ○ → bypass on/off
    }
    if (drag && drag.type === 'node') {
      if (!drag.moved) openInspector(drag.rec);                       // tap a node → open its CSS editor
      else if (drag.spliceCab) spliceIntoCable(drag.rec.node.id, drag.spliceCab);   // dropped on a cable → insert into the flow
    }
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinchDist = 0;
    if (ptrs.size === 0) { drag = null; renderer.domElement.style.cursor = 'grab'; }
    else if (drag && drag.type === 'pinch' && ptrs.size === 1) { const v = [...ptrs.values()][0]; drag = { type: 'pan', x: v.x, y: v.y }; }
  }
  renderer.domElement.addEventListener('pointerup', endPtr);
  renderer.domElement.addEventListener('pointercancel', endPtr);

  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault(); sph.radius *= e.deltaY < 0 ? 0.9 : 1.1; applyCam();
  }, { passive: false });

  // ── resize + render loop ───────────────────────────────────────────────────────
  function resize() {
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeInspector(); });
  const ro = new ResizeObserver(resize); ro.observe(root);
  resize(); applyCam();

  let lastViz = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    // pulse the cables with the audio level
    const lvl = playing ? getLevel() : 0;
    const base = playing ? 0.45 : 0.32, amp = 0.55;
    cables.forEach(c => { c.mesh.material.opacity = base + lvl * amp; });
    backdropTick();
    // refresh live viz canvases ~24fps while playing (cheap enough; static otherwise)
    if (playing && now - lastViz > 42) {
      lastViz = now;
      Object.values(nodes).forEach(rec => { if (rec.hasViz) drawNode(rec); });
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);

  function removeNode(id) {
    if (inspectorRec && inspectorRec.node.id === id) closeInspector();
    // HEAL the path: reconnect whatever fed this node's INPUT to whatever its OUTPUT fed (keeping each
    // output cable's port), so deleting a mid-chain node bridges its neighbours instead of cutting the
    // signal. The input side is the audio-in cables (port 'in'); the output side keeps its port (audio
    // → audio, or a CV processor like MULT → the param it drove).
    const inSrcs = patch.cables.filter(c => c.to === id && (!c.port || c.port === 'in')).map(c => c.from);
    const outs = patch.cables.filter(c => c.from === id);
    inSrcs.forEach(s => outs.forEach(o => {
      if (s === o.to) return;                                                     // no self-loop
      const port = (o.port && o.port !== 'in') ? o.port : null;
      if (patch.cables.some(c => c.from === s && c.to === o.to && (c.port || 'in') === (port || 'in'))) return;   // skip dupes
      patch.cables.push(port ? { from: s, to: o.to, port } : { from: s, to: o.to });
    }));
    const redrawTargets = new Set(outs.map(o => o.to));                           // downstream nodes whose input changed
    patch.nodes = patch.nodes.filter(n => n.id !== id);
    patch.cables = patch.cables.filter(c => c.from !== id && c.to !== id);
    const rec = nodes[id];
    if (rec) { scene.remove(rec.group); rec.tex.dispose(); delete nodes[id]; }
    patch.nodes.forEach(n => { if (n.type === 'value') syncValueNode(n.id); });   // a value→param range may have changed
    redrawTargets.forEach(t => { if (nodes[t]) drawNode(nodes[t]); });            // refresh driven-bar state on bridged targets
    rebuildCables(); audition();
  }

  function onFire() { playing = true; fireAt = performance.now(); Object.values(nodes).forEach(r => { if (r.node.type === 'noise') r._seed = Math.random() * 1000; }); }
  function onStop() { playing = false; Object.values(nodes).forEach(rec => { if (rec.hasViz) drawNode(rec); }); }

  return { loadPatch, getPatch, audition: () => onChange(), onFire, onStop, frameAll };
}

// ── tiny canvas helpers ──────────────────────────────────────────────────────────
function node_eq(a, b) { return a === b; }
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function hexA(hex, a) {
  const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
// deterministic pseudo-random for stable-ish stepped viz
function pseudo(n) { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); }
