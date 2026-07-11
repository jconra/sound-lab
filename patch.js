// patch.js — the Sound Lab's modular patch engine (Phase 1 foundation).
//
// A *patch* is plain data: a set of typed nodes + cables between them. Every node
// maps to a real Web Audio node, so the wiring IS the synthesis — this is what will
// become the live, editable node graph, and the same playPatch() runtime drops into
// the game later (the game currently has no audio at all).
//
//   patch = {
//     name, dur,                       // dur = render/voice length in seconds
//     nodes: [ { id, type, ...params } ],
//     cables: [ { from, to, port } ],  // port omitted/'in' = audio; else a CV param
//   }
//
// Cable kinds:
//   • audio   — source.out → dest.in            (the signal path)
//   • CV/mod  — source.out → dest.params[port]   (envelope/LFO/S&H → a parameter)
//
// Node types (merged/orthogonal palette):
//   osc    — audio source; at low freq + `level` it doubles as an LFO (absorbs old lfo)
//   noise  — looping stepped random source (motor / sample&hold / white via high freq×steps)
//   filter — biquad ; gain — VCA *and* mixer/bus ; shaper — grit
//   env    — ADSR-ish CV (the "off switch") ; value — constant CV (a patchable knob)
//   send (reverb) ; out (→ destination)
//
// Signature mirrors gunsynth's playShot(ctx, noise, dest, reverbInput, …) so the two
// can be A/B rendered against each other for fidelity.

// ── Shared buffers (same as gunsynth, so noise voices match) ──────────────────────
export function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
export function makeImpulse(ctx, dur, decay) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const FLOOR = 0.0005;

// waveshaper curve for grit (identical to gunsynth's)
function distortionCurve(amount) {
  const n = 1024, curve = new Float32Array(n), k = amount * amount * 45;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (3 + k) * x * 0.3490659 / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// ════════════════════════════════════════════════════════════════════════════════
//  NODE BUILDERS — each returns { in, out, params, starts, at }
//    in     : audio input node (or null for sources / CV generators)
//    out    : audio/CV output node
//    params : { name: AudioParam } — the modulatable plugs a CV cable can target
//    starts : scheduled source nodes needing start()/stop()
//    at     : absolute start time for those sources
// ════════════════════════════════════════════════════════════════════════════════

// oscillator — audio source OR (at low freq + wired to a param) an LFO. `level` is the
// output depth, so a slow osc into a param modulates it; this absorbs the old lfo node.
function bOsc(ctx, n, t0) {
  const t = t0;                                                  // sources run from FIRE; timing lives on envelopes
  const out = ctx.createGain(); out.gain.value = n.level ?? 1;   // output level / mod depth
  const voices = n.voices || 1, starts = [];
  for (let i = 0; i < voices; i++) {
    const o = ctx.createOscillator();
    o.type = n.wave || 'sine';
    o.frequency.setValueAtTime(n.freq ?? 440, t);              // pitch sweeps come from an ENV into the freq plug (× freqMod)
    o.detune.value = voices > 1 ? (i * 2 - 1) * (n.detune || 0) : (n.detune || 0);
    o.connect(out);
    starts.push(o);
  }
  // freq CV depth: a CV wired into the 'freq' plug (e.g. an ENV) is scaled to Hz by freqMod and
  // summed onto every voice's pitch — so an envelope can sweep pitch with a full ADSR contour.
  const freqMod = ctx.createGain(); freqMod.gain.value = n.freqMod ?? 0;
  starts.forEach(o => freqMod.connect(o.frequency));
  return { in: null, out, params: { freq: freqMod, detune: starts[0].detune, level: out.gain }, starts, at: t };
}

// noise — the one source node for all "random" needs, looping continuously.
//   `steps` random slots per cycle at `freq` Hz — one knob-set spans it all:
//   • white hiss            : crank freq×steps past the sample rate (~48k) → a fresh value every sample
//   • motor/engine texture  : steps≈24-32 at a low freq
//   • sample & hold         : steps=1 → one held random value per 1/freq sec
//   Use it as audio, or wire its output into a param as random CV modulation.
// `rate` = playbackRate (pitch/rev plug; CV in here revs it). `level` = output / mod depth.
function bNoise(ctx, n, t0) {
  const out = ctx.createGain(); out.gain.value = n.level ?? 1;
  const sr = ctx.sampleRate, f = Math.max(0.1, n.freq || 46);
  const steps = Math.max(1, Math.round(n.steps || 24));
  const period = sr / f;
  const cycles = Math.max(1, Math.round((n.loopLen || 1.2) * f));
  const len = Math.max(1, Math.round(cycles * period));
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const nb = new Float64Array(steps);
  for (let i = 0; i < steps; i++) nb[i] = Math.random() * 2 - 1;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    phase++;
    if (phase >= period) { phase -= period; for (let k = 0; k < steps; k++) nb[k] = Math.random() * 2 - 1; }
    d[i] = nb[Math.min(steps - 1, Math.floor((phase / period) * steps))];
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  src.playbackRate.value = n.rate ?? 1;
  src.connect(out);
  return { in: null, out, params: { rate: src.playbackRate, level: out.gain }, starts: [src], at: t0 };   // runs from FIRE; envelopes do the timing
}

// value — a constant control source. Patch its output into any param to set/offset it
// (AudioParam inputs SUM onto the param's own value), e.g. an idle pitch or a manual level.
function bValue(ctx, n, t0) {
  const cs = ctx.createConstantSource(); cs.offset.value = n.value ?? 0;
  return { in: null, out: cs, params: { value: cs.offset }, starts: [cs], at: t0 + (n.delay || 0) };
}

// math (multiply) — a CV utility. Scales the signal wired into its input by `mul` (itself CV-able),
// so ONE source can drive params at very different scales: an ENV that peaks near 1 can feed
// noise.rate directly AND, through a ×800 MULT, sweep an oscillator's frequency by ~800 Hz.
function bMath(ctx, n, t0) {
  const g = ctx.createGain(); g.gain.value = n.mul ?? 1;   // out = in × mul
  return { in: g, out: g, params: { mul: g.gain }, starts: [], at: t0 };
}

function bFilter(ctx, n, t0) {
  const t = t0 + (n.delay || 0);
  const f = ctx.createBiquadFilter();
  f.type = n.ftype || 'lowpass';
  f.Q.value = n.Q ?? 0.7;
  if (n.freqPeak != null) {                                  // 3-point sweep (roar)
    f.frequency.setValueAtTime(n.freq, t);
    f.frequency.linearRampToValueAtTime(n.freqPeak, t + (n.attack || 0.08));
    f.frequency.linearRampToValueAtTime(n.freqEnd, t + (n.dur || 0.6));
  } else if (n.freqEnd != null) {                            // 2-point glide
    f.frequency.setValueAtTime(n.freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, n.freqEnd), t + (n.glide || n.dur || 0.1));
  } else {
    f.frequency.value = n.freq;
  }
  return { in: f, out: f, params: { freq: f.frequency, Q: f.Q }, starts: [], at: t };
}

function bGain(ctx, n) {
  const g = ctx.createGain();
  g.gain.value = n.gain ?? 0;     // VCA: default 0 (driven by an env); attenuators set gain
  return { in: g, out: g, params: { gain: g.gain }, starts: [], at: 0 };
}

function bShaper(ctx, n) {
  const grit = n.grit || 0;
  if (grit <= 0) { const g = ctx.createGain(); return { in: g, out: g, params: {}, starts: [], at: 0 }; }
  const drive = ctx.createGain(); drive.gain.value = 1 + grit * grit * 14;
  const ws = ctx.createWaveShaper(); ws.curve = distortionCurve(grit); ws.oversample = '4x';
  const trim = ctx.createGain(); trim.gain.value = 1 / (1 + grit * 1.6);
  drive.connect(ws).connect(trim);
  return { in: drive, out: trim, params: {}, starts: [], at: 0 };
}

// delay / echo: dry passes straight through; a parallel delay line (with a feedback loop) adds the
// wet repeats. time/feedback/wet are live AudioParams (CV-able — modulate time for flange/pitch wob).
function bDelay(ctx, n) {
  const input = ctx.createGain(), out = ctx.createGain();
  const dl = ctx.createDelay(2.0);                                    // max 2s; param tops out at 1.5
  dl.delayTime.value = Math.min(2.0, Math.max(0, n.time ?? 0.3));
  const fb = ctx.createGain(); fb.gain.value = Math.min(0.95, Math.max(0, n.feedback ?? 0.4));   // cap < 1 so it can't run away
  const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = n.tone ?? 4000;   // darkens each repeat (tape feel)
  const wet = ctx.createGain(); wet.gain.value = n.wet ?? 0.5;
  input.connect(out);                                                 // dry passthrough
  input.connect(dl); dl.connect(wet).connect(out);                    // wet path
  dl.connect(damp).connect(fb).connect(dl);                          // feedback loop (lowpass-damped) → repeating echoes
  return { in: input, out, params: { time: dl.delayTime, feedback: fb.gain, tone: damp.frequency, wet: wet.gain }, starts: [], at: 0 };
}

// envelope generator → CV (ConstantSource.offset shaped on trigger)
// envelope → CV (ConstantSource.offset shaped on trigger). One unified ADSR:
//   attack (lin/exp) → decay → sustain. sustain 0 = a one-shot that decays to TRUE 0
//   and lets the voice auto-stop; sustain > 0 holds until note-off (STOP), then release().
function bEnv(ctx, n, t0) {
  const t = t0 + (n.delay || 0);
  const cs = ctx.createConstantSource(); cs.offset.value = 0;
  const o = cs.offset, p = n.peak ?? 1, fl = Math.max(1e-4, n.floor ?? FLOOR);
  const atk = n.attack ?? 0.01, dec = n.decay ?? 0.2, sus = (n.sustain ?? 0) * p;
  const expOK = p > fl;                                     // exp ramps need a positive, above-floor target/start; peak≈0 ⇒ go linear
  let release = null;
  // attack
  if (atk <= 0) { o.setValueAtTime(p, t); }                 // instant
  else if (n.attackCurve === 'lin' || !expOK) { o.setValueAtTime(0, t); o.linearRampToValueAtTime(p, t + atk); }
  else { o.setValueAtTime(fl, t); o.exponentialRampToValueAtTime(p, t + atk); }
  // decay → sustain
  if (sus > fl) {                                           // held: decay to sustain, ring until STOP…
    expOK ? o.exponentialRampToValueAtTime(sus, t + atk + dec) : o.linearRampToValueAtTime(sus, t + atk + dec);
    release = (rt) => { try { o.cancelScheduledValues(rt); o.setTargetAtTime(0, rt, Math.max(0.005, (n.release ?? 0.3) / 3)); } catch (e) {} };
    // …unless a HOLD is set: sustain for `hold` seconds, then auto-release (a timed plateau —
    // lets a long steady sound like the elevator ride end itself, one-shot style).
    if ((n.hold ?? 0) > 0) {
      const rt = t + atk + dec + n.hold;
      o.setValueAtTime(sus, rt);
      o.setTargetAtTime(0, rt, Math.max(0.005, (n.release ?? 0.3) / 3));
    }
  } else {                                                  // one-shot: decay to TRUE 0 (VCA fully shuts, voice can auto-stop)
    if (expOK) o.exponentialRampToValueAtTime(fl, t + atk + dec);
    else o.setValueAtTime(0, t + atk + dec);
    o.linearRampToValueAtTime(0, t + atk + dec + 0.01);
  }
  return { in: null, out: cs, params: {}, starts: [cs], at: t0, release };
}

function bOut(ctx, n, dest) {
  const g = ctx.createGain(); g.gain.value = n.gain ?? 1;
  if (dest) g.connect(dest);
  return { in: g, out: g, params: { gain: g.gain }, starts: [], at: 0 };
}
function bSend(ctx, n, reverbInput) {
  const g = ctx.createGain(); g.gain.value = n.gain ?? 0;
  if (reverbInput) g.connect(reverbInput);
  return { in: g, out: g, params: { gain: g.gain }, starts: [], at: 0 };
}

// (noise/out/send are handled specially — they need the shared buffer / dest / reverb)
const BUILDERS = {
  osc: bOsc, filter: bFilter, gain: bGain, shaper: bShaper, delay: bDelay, env: bEnv, value: bValue, math: bMath,
};

// ════════════════════════════════════════════════════════════════════════════════
//  AUTO-STOP DETERMINATION — the ENVELOPE is the off switch (see patchAutoStopTime):
//  any envelope present ⇒ the voice ends; no envelope ⇒ a deliberate drone (engines).
// ════════════════════════════════════════════════════════════════════════════════
function envEndTime(n) {
  if ((n.sustain ?? 0) > 0.001) {
    if ((n.hold ?? 0) > 0)                                  // timed plateau → ends after hold + release tail
      return (n.delay || 0) + (n.attack ?? 0.01) + (n.decay ?? 0.2) + n.hold + (n.release ?? 0.3) * 1.5;
    return Infinity;                                        // held → sustains until STOP
  }
  return (n.delay || 0) + (n.attack ?? 0.01) + (n.decay ?? 0.2) + 0.02;   // one-shot → ends after decay
}
// Seconds-from-now to auto-stop the voice, or null to run until STOP.
// THE RULE (Jacob's, 2026-07-08): an ENVELOPE is the "off switch" — if the patch has any envelope,
// the voice ENDS; with none, it's a deliberate drone (the engines). Precisely:
//   • all envelopes one-shot / timed-hold → stop right after the LAST one finishes (its natural end),
//   • any HELD envelope (sustain > 0, no hold) → the voice lives for the patch's `dur`, then releases,
//   • no envelopes at all → null (runs until STOP).
// (Replaces the old graph analysis that only auto-stopped when EVERY audio path was gated by an
//  env-VCA — which read as "engine-brain": deleting one env could silently turn an SFX into a drone.)
export function patchAutoStopTime(patch) {
  let maxEnd = 0, hasEnv = false, hasHeld = false;
  for (const n of patch.nodes) {
    if (n.type !== 'env' || n.disabled) continue;
    hasEnv = true;
    const e = envEndTime(n);
    if (!isFinite(e)) hasHeld = true;                       // a held env (sustain>0, no timed hold)
    else maxEnd = Math.max(maxEnd, e);
  }
  if (!hasEnv) return null;                                 // no envelopes → deliberate drone (engines)
  if (hasHeld) return (patch.dur || 3) + 0.2;               // held env → voice lasts `dur`, then release/stop
  return maxEnd + 0.2;                                      // all one-shot → stop after the last envelope
}
// A patch is "finite" (auto-stops) iff the rule above schedules an end.
export function patchIsFinite(patch) { return patchAutoStopTime(patch) != null; }

// ════════════════════════════════════════════════════════════════════════════════
//  playPatch — instantiate the whole patch as ONE live voice, triggered now at t0.
//  No scheduled stop: looping sources (noise, oscillators) run continuously and
//  one-shot sounds simply go silent when their envelopes close. Returns a handle
//  whose .stop() tears the voice down — the host stops the previous voice before
//  it fires/re-evaluates a new one, so engines replace instead of piling up.
//  (Offline render rigs ignore the handle; with no stop, sources just play the
//   full OfflineAudioContext length, which is what we want.)
// ════════════════════════════════════════════════════════════════════════════════
export function playPatch(ctx, noise, dest, reverbInput, patch, onEnded) {
  const t0 = ctx.currentTime;
  const built = {};

  for (const node of patch.nodes) {
    const ty = node.type;
    if (node.disabled) {     // BYPASS: a unity gain — passes audio straight through (or stays silent if it's a source/CV)
      const g = ctx.createGain(); built[node.id] = { in: g, out: g, params: {}, starts: [], at: t0 }; continue;
    }
    if (ty === 'out')        built[node.id] = bOut(ctx, node, dest);
    else if (ty === 'send')  built[node.id] = bSend(ctx, node, reverbInput);
    else if (ty === 'noise') built[node.id] = bNoise(ctx, node, t0);
    else {
      const fn = BUILDERS[ty];
      built[node.id] = fn ? fn(ctx, node, t0) : null;
    }
  }

  // wire cables
  for (const c of patch.cables) {
    const s = built[c.from], d = built[c.to];
    if (!s || !d) continue;
    if (!c.port || c.port === 'in') { if (d.in) s.out.connect(d.in); }
    else if (d.params[c.port]) { s.out.connect(d.params[c.port]); }
  }

  // VALUE nodes SET their target param (a remote knob): zero the param's own base so the value node's
  // constant provides the absolute level via the sum. ENV/LFO/osc sources keep modulating additively.
  const _byId = {}; patch.nodes.forEach(n => _byId[n.id] = n);
  for (const c of patch.cables) {
    if (!c.port || c.port === 'in') continue;
    const src = _byId[c.from], d = built[c.to];
    if (!src || src.type !== 'value' || !d) continue;
    const tgt = d.params[c.port];
    if (tgt && typeof tgt.connect !== 'function' && 'value' in tgt) tgt.value = 0;   // AudioParam target → zero its base
  }

  // start every source — no stop scheduled (the voice runs until torn down)
  const sources = [];
  for (const id in built) {
    const b = built[id]; if (!b || !b.starts) continue;
    for (const src of b.starts) { try { src.start(b.at ?? t0); } catch (e) {} sources.push(src); }
  }

  // outputs to fade on teardown (out → dest, send → reverb) so stopping doesn't click
  const outs = patch.nodes.filter(n => n.type === 'out' || n.type === 'send')
    .map(n => built[n.id]).filter(Boolean);
  // ADSR envelopes release on note-off (STOP); collect their hooks + longest release time
  const releasers = [];
  for (const node of patch.nodes) { const b = built[node.id]; if (b && b.release) releasers.push({ fn: b.release, dur: node.release ?? 0.3 }); }
  let stopped = false;
  const handle = {
    stop(fade = 0.02) {
      if (stopped) return; stopped = true;
      if (handle._auto) { clearTimeout(handle._auto); handle._auto = null; }
      const t = ctx.currentTime;
      let rel = 0;
      releasers.forEach(r => { r.fn(t); rel = Math.max(rel, r.dur); });   // note-off: start the ADSR releases now
      const t2 = t + rel;                                                  // …and let them ring out before tearing down
      outs.forEach(o => { try { o.out.gain.setTargetAtTime(0, t2, fade); } catch (e) {} });
      const at = t2 + fade * 5 + 0.02;
      sources.forEach(src => { try { src.stop(at); } catch (e) {} });
      setTimeout(() => Object.values(built).forEach(b => { if (b && b.out) try { b.out.disconnect(); } catch (e) {} }), (rel + fade * 5 + 0.15) * 1000);
    },
    // live-set a VALUE node's output on the PLAYING voice (smooth glide) — lets a slider "rev" the
    // engine without rebuilding/restarting. No-op for non-value nodes (no params.value AudioParam).
    setValue(id, v) {
      const p = built[id] && built[id].params && built[id].params.value;
      if (p && typeof p.setTargetAtTime === 'function') { try { p.setTargetAtTime(v, ctx.currentTime, 0.05); } catch (e) {} }
    },
  };
  // finite (one-shot) patches tear themselves down after the last envelope — live ctx only
  // (offline render contexts have startRendering(); they must play the full render length)
  if (typeof ctx.startRendering !== 'function') {
    const autoT = patchAutoStopTime(patch);
    if (autoT != null) handle._auto = setTimeout(() => { handle.stop(0.05); if (onEnded) onEnded(); }, autoT * 1000);
  }
  return handle;
}

// expose builders/curve for the UI layer (live param tweaks, introspection)
export { BUILDERS, distortionCurve };

// ════════════════════════════════════════════════════════════════════════════════
//  PATCH PRESETS — the existing gunsynth presets re-expressed as patches.
//  One per kind for now (the rest are mechanical ports). These are the fidelity
//  proof: A/B rendered against gunsynth.js in the offline rig.
// ════════════════════════════════════════════════════════════════════════════════
export const PATCH_PRESETS = {
  // LURCHER autocannon (tuned 2026-06-14): body noise + pitch-diving sine tone → ×1.53 → grit shaper
  'LURCHER — GUN A': {
    name: 'Lurcher', group: 'GUNS', kind: 'ballistic', dur: 0.6,
    nodes: [
      { id: 'bd-src', type: 'noise', freq: 600, steps: 256, name: 'body', rate: 1, level: 1, loopLen: 1.2, x: 317.6893825651729, y: 209.07879623555658 },
      { id: 'bd-g', type: 'gain', name: 'body', gain: 0, x: 636.7910163377255, y: 313.5461962741602 },
      { id: 'bd-e', type: 'env', peak: 2.5, attack: 0, decay: 0.494, sustain: 0, name: 'body', release: 0.3, delay: 0, x: 320, y: 431.91919198855015 },
      { id: 'tn-osc', type: 'osc', wave: 'sine', freq: 55, freqMod: 65, name: 'tone', x: 320, y: 646.6320934299174 },
      { id: 'tn-pit', type: 'env', peak: 2.5, attack: 0, decay: 0.924, sustain: 0, name: 'tone', release: 0.3, delay: 0, x: 20.323563194405317, y: 680.2245915568617 },
      { id: 'tn-g', type: 'gain', name: 'tone', gain: 0, x: 640, y: 730.6724974356422 },
      { id: 'tn-e', type: 'env', peak: 2.5, attack: 0, decay: 2, sustain: 0, name: 'tone', release: 0.3, delay: 0, x: 320, y: 861.3480025208264 },
      { id: 'out', type: 'out', name: 'output', gain: 0.85, x: 1411.5683301532538, y: 514.257742103137 },
      { id: 'gain3', type: 'gain', name: '', gain: 1.53, x: 886.6136717517851, y: 505.25986606623496 },
      { id: 'shaper5', type: 'shaper', name: '', grit: 0.42, x: 1154.0289769413255, y: 493.4935926378949 },
    ],
    cables: [
      { from: 'bd-e', to: 'bd-g', port: 'gain' }, { from: 'bd-src', to: 'bd-g' }, { from: 'bd-g', to: 'gain3' },
      { from: 'tn-pit', to: 'tn-osc', port: 'freq' }, { from: 'tn-osc', to: 'tn-g' }, { from: 'tn-e', to: 'tn-g', port: 'gain' }, { from: 'tn-g', to: 'gain3' },
      { from: 'gain3', to: 'shaper5' }, { from: 'shaper5', to: 'out' },
    ],
  },

  // JOTUN railgun — "RAIL D — Your Pick" — official tune (2026-06-14): charge whine+flutter →
  // crack + envelope-driven boom; discharge at ~0.9s. Also the Vehicle Designer's Jotun gun (via RAILGUN_PATCH).
  'JOTUN — RAIL D': {
    name: 'Jotun', group: 'GUNS', kind: 'railgun', dur: 2.2,
    nodes: [
      { id: 'ch-osc', type: 'osc', wave: 'sawtooth', voices: 2, detune: 0, freq: 3000, freqMod: -2664, name: 'charge', x: 0, y: -43.43749999999999 },   // pitch env sweeps 336→3000
      { id: 'ch-pit', type: 'env', peak: 1, attack: 0, decay: 1.31, sustain: 0, name: 'charge', x: -340, y: -43 },
      { id: 'ch-fl', type: 'gain', gain: 0, name: 'charge', x: 320, y: 66.5151513840373 },
      { id: 'ch-lfo', type: 'osc', wave: 'sine', freq: 10, freqMod: 20, level: 1, name: 'charge', x: 0, y: 193.4375 },   // flutter LFO; pitch env sweeps rate 30→10 Hz
      { id: 'chl-pit', type: 'env', peak: 1, attack: 0, decay: 1.31, sustain: 0, name: 'charge', x: -340, y: 193 },
      { id: 'ch-g', type: 'gain', name: 'charge', gain: 0, x: 640, y: 163.6458332022191 },
      { id: 'ch-e', type: 'env', peak: 0.04, attack: 0.575, decay: 0.02, sustain: 0, attackCurve: 'exp', name: 'charge', release: 0.3, delay: 0, x: 320, y: 252.29166660110954 },
      { id: 'ck-src', type: 'noise', freq: 600, steps: 256, rate: 1.05, name: 'crack', level: 1, loopLen: 1.2, x: 0, y: 450 },
      { id: 'ck-f', type: 'filter', ftype: 'highpass', freq: 2530, Q: 0.1, name: 'crack', x: 320, y: 419.04671682694925 },
      { id: 'ck-g', type: 'gain', name: 'crack', gain: 0, x: 640, y: 512.3611107991218 },
      { id: 'ck-e', type: 'env', peak: 2.5, attack: 0, decay: 0.186, sustain: 0, delay: 0.89, name: 'crack', release: 0.114, x: 320.197116202836, y: 574.7222220498383 },
      { id: 'bm-osc', type: 'osc', wave: 'sine', freq: 146, freqMod: 285, name: 'boom', x: 320, y: 789.4381311407474 },
      { id: 'bm-pit', type: 'env', peak: 2.5, attack: 0, decay: 0.42, sustain: 0, delay: 0.9, name: 'boom', release: 0.3, x: 0, y: 750 },
      { id: 'bm-g', type: 'gain', name: 'boom', gain: 0, x: 640, y: 880.9061129942594 },
      { id: 'bm-e', type: 'env', peak: 2.5, attack: 0.004, decay: 0.42, sustain: 0, delay: 0.9, name: 'boom', release: 0.3, x: 320, y: 1011.812225988519 },
      { id: 'bus', type: 'gain', gain: 0.8, name: 'mix', x: 962.365289632772, y: 518.9710189985335 },
      { id: 'out', type: 'out', name: 'output', gain: 0.85, x: 1558.9133784831554, y: 518.9710189985335 },
    ],
    cables: [
      { from: 'ch-pit', to: 'ch-osc', port: 'freq' }, { from: 'chl-pit', to: 'ch-lfo', port: 'freq' },
      { from: 'ch-osc', to: 'ch-fl' }, { from: 'ch-lfo', to: 'ch-fl', port: 'gain' },
      { from: 'ch-fl', to: 'ch-g' }, { from: 'ch-e', to: 'ch-g', port: 'gain' }, { from: 'ch-g', to: 'bus' },
      { from: 'ck-src', to: 'ck-f' }, { from: 'ck-f', to: 'ck-g' }, { from: 'ck-e', to: 'ck-g', port: 'gain' }, { from: 'ck-g', to: 'bus' },
      { from: 'bm-pit', to: 'bm-osc', port: 'freq' }, { from: 'bm-osc', to: 'bm-g' }, { from: 'bm-e', to: 'bm-g', port: 'gain' }, { from: 'bm-g', to: 'bus' },
      { from: 'bus', to: 'out' },
    ],
  },

  // FIREBRAT — turbine/thruster engine (tuned settings 2026-06-14, from ~/firebrad_engine_settings).
  //   motor   = low stepped-noise chug (freq 27.1, steps 38) — RPMs sets its rate
  //   exhaust = broadband noise → resonant BANDPASS (Q 9.9 @ 2380) → max grit; sweeps brighter on revs
  //   turbine = detuned saw spooling up in pitch on revs
  // The "RPMs" VALUE node (drag live to rev) fans out: → motor rate, → ×bright into the exhaust band, → ×spool
  // into the turbine pitch. All gains static so it drones until STOP. RPMs slider range = noise rate (0.25–2).
  'FIREBRAT — ENGINE': {
    name: 'Firebrat', group: 'ENGINES', kind: 'engine', dur: 3,
    nodes: [
      { id: 'rpm', type: 'value', name: 'RPMs', value: 0.25 },
      { id: 'mtr', type: 'noise', name: 'motor', freq: 27.1, steps: 38, loopLen: 1.2, rate: 0.25, level: 1 },
      { id: 'mtr-g', type: 'gain', name: 'motor', gain: 0.4 },
      { id: 'air', type: 'noise', name: 'exhaust', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'air-f', type: 'filter', name: 'exhaust', ftype: 'bandpass', freq: 2380, Q: 9.9 },
      { id: 'air-sh', type: 'shaper', name: 'exhaust', grit: 1 },
      { id: 'air-g', type: 'gain', name: 'exhaust', gain: 0.21 },
      { id: 'turb', type: 'osc', name: 'turbine', wave: 'sawtooth', freq: 190.2, freqMod: 1, voices: 2, detune: 28.5 },
      { id: 'turb-g', type: 'gain', name: 'turbine', gain: 0.1 },
      { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 228.7 },
      { id: 'r-pit', type: 'math', name: 'rev→spool', mul: 150 },
      { id: 'bus', type: 'gain', name: 'mix', gain: 0.8 },
      { id: 'out', type: 'out', name: 'output', gain: 0.08 },
    ],
    cables: [
      { from: 'rpm', to: 'mtr', port: 'rate' },                          // RPMs sets the motor chug rate (idle→rev)
      { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'air-f', port: 'freq' },
      { from: 'rpm', to: 'r-pit' }, { from: 'r-pit', to: 'turb', port: 'freq' },
      { from: 'mtr', to: 'mtr-g' }, { from: 'mtr-g', to: 'bus' },
      { from: 'air', to: 'air-f' }, { from: 'air-f', to: 'air-sh' }, { from: 'air-sh', to: 'air-g' }, { from: 'air-g', to: 'bus' },
      { from: 'turb', to: 'turb-g' }, { from: 'turb-g', to: 'bus' },
      { from: 'bus', to: 'out' },
    ],
  },

  // VALKYRIE missile — "ROCKET A — Fast Launch" (single churning roar: stepped noise → VCA shaped by a long exp swell)
  'VALKYRIE — ROCKET A': {
    name: 'Valkyrie', group: 'GUNS', kind: 'rocket', dur: 1.2,
    nodes: [
      { id: 'ro-src', type: 'noise', freq: 8.8, steps: 214, name: 'roar', rate: 1.15, level: 1, loopLen: 1.2, x: 640.3721083331977, y: 105.51254622655966 },
      { id: 'ro-g', type: 'gain', name: 'roar', gain: 0, x: 960, y: 235.0295916811051 },
      { id: 'ro-e', type: 'env', peak: 1.65, attack: 0.585, decay: 1.442, sustain: 0, attackCurve: 'exp', name: 'roar', release: 0.3, delay: 0, x: 640.3396839340093, y: 364.54663713565054 },
      { id: 'out', type: 'out', name: 'output', gain: 0.15, x: 1226.6241191865204, y: 235.0295916811051 },
    ],
    cables: [
      { from: 'ro-e', to: 'ro-g', port: 'gain' },
      { from: 'ro-g', to: 'out' },
      { from: 'ro-src', to: 'ro-g' },
    ],
  },

  // KICK — demos envelope-driven PITCH. A one-shot ENV into the osc's freq plug, scaled by the
  // osc's freqMod (300 Hz), snaps pitch up to ~350 Hz then drops it back to the 50 Hz base over
  // 60 ms — the classic synth-kick "thump." A second ENV shapes the amp.
  'SYNTH — KICK': {
    name: 'Kick', group: 'SYNTH', kind: 'perc', dur: 0.6,
    nodes: [
      { id: 'k-osc', type: 'osc', name: 'body', wave: 'sine', freq: 50, freqMod: 300 },        // 50 Hz base; pitch env adds up to +300 Hz
      { id: 'k-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.06, sustain: 0 }, // fast pitch drop → osc.freq
      { id: 'k-amp', type: 'env', name: 'amp', peak: 1, attack: 0.001, decay: 0.30, sustain: 0 },   // body amp → VCA
      { id: 'k-g', type: 'gain' },                                                              // VCA (base 0, opened by amp env)
      { id: 'out', type: 'out', gain: 0.9 },
    ],
    cables: [
      { from: 'k-pit', to: 'k-osc', port: 'freq' },        // pitch envelope → freq plug (scaled by freqMod = 300)
      { from: 'k-osc', to: 'k-g' }, { from: 'k-amp', to: 'k-g', port: 'gain' },
      { from: 'k-g', to: 'out' },
    ],
  },

  // MULT demo — one ENV fanned out to THREE destinations at three different scales. Shows why the
  // MULT node exists: the same 0..1 envelope drives noise.rate (range ~0-4, so ×1 direct is plenty)
  // AND the filter cutoff (needs thousands of Hz, so ×3500 through a MULT) AND the amp VCA.
  'DEMO — MULT (one env, 3 scales)': {
    name: 'MULT demo', group: 'SYNTH', kind: 'demo', dur: 1.6,
    nodes: [
      { id: 'env', type: 'env', name: 'mod', peak: 1, attack: 0.5, decay: 1.0, sustain: 0, attackCurve: 'exp' }, // the shared 0..1 modulator
      { id: 'nz', type: 'noise', name: 'src', freq: 60, steps: 28, rate: 1, loopLen: 1.2 },
      { id: 'mul', type: 'math', name: 'x3500', mul: 3500 },         // scales the 0..1 env up to Hz for the cutoff
      { id: 'flt', type: 'filter', ftype: 'lowpass', freq: 400, Q: 6 },  // base cutoff 400; env sweeps it up ~3900 Hz
      { id: 'g', type: 'gain' },                                    // VCA (base 0, opened by the env)
      { id: 'out', type: 'out', gain: 0.85 },
    ],
    cables: [
      { from: 'env', to: 'nz', port: 'rate' },      // scale ×1 (direct): env → noise rate (1..2)
      { from: 'env', to: 'mul' },                   // same env → MULT input
      { from: 'mul', to: 'flt', port: 'freq' },     // scale ×3500: → filter cutoff sweep
      { from: 'env', to: 'g', port: 'gain' },       // scale ×1 (direct): env → amp VCA
      { from: 'nz', to: 'flt' }, { from: 'flt', to: 'g' }, { from: 'g', to: 'out' },
    ],
  },

  // LASER ZAP — a fast downward pitch dive. Tiny-attack ENV into the freq plug × freqMod 1800 snaps
  // the square osc to ~2000 Hz then drops it to the 200 Hz base in 160 ms. Classic sci-fi blaster.
  'SYNTH — LASER ZAP': {
    name: 'Laser', group: 'SYNTH', kind: 'perc', dur: 0.5,
    nodes: [
      { id: 'z-osc', type: 'osc', name: 'zap', wave: 'square', freq: 200, freqMod: 1800 },     // dives ~2000 → 200
      { id: 'z-pit', type: 'env', name: 'dive', peak: 1, attack: 0.001, decay: 0.16, sustain: 0 },
      { id: 'z-amp', type: 'env', name: 'amp', peak: 0.9, attack: 0.001, decay: 0.20, sustain: 0 },
      { id: 'z-g', type: 'gain' },
      { id: 'out', type: 'out', gain: 0.8 },
    ],
    cables: [
      { from: 'z-pit', to: 'z-osc', port: 'freq' },
      { from: 'z-osc', to: 'z-g' }, { from: 'z-amp', to: 'z-g', port: 'gain' },
      { from: 'z-g', to: 'out' },
    ],
  },

  // SNARE — two layers summed at a bus: a short pitched body (triangle + pitch env) and a bright
  // highpassed noise snap. Shows a multi-voice one-shot built from osc + noise + 4 envs.
  'SYNTH — SNARE': {
    name: 'Snare', group: 'SYNTH', kind: 'perc', dur: 0.4,
    nodes: [
      { id: 's-osc', type: 'osc', name: 'body', wave: 'triangle', freq: 180, freqMod: 120 },
      { id: 's-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.05, sustain: 0 },
      { id: 's-tg', type: 'gain' },
      { id: 's-te', type: 'env', name: 'tone amp', peak: 0.6, attack: 0.001, decay: 0.09, sustain: 0 },
      { id: 's-nz', type: 'noise', name: 'snap', freq: 600, steps: 256, rate: 1 },
      { id: 's-nf', type: 'filter', ftype: 'highpass', freq: 2200, Q: 0.7 },
      { id: 's-ng', type: 'gain' },
      { id: 's-ne', type: 'env', name: 'noise amp', peak: 0.9, attack: 0.001, decay: 0.13, sustain: 0 },
      { id: 'bus', type: 'gain', gain: 0.9 },
      { id: 'out', type: 'out', gain: 0.85 },
    ],
    cables: [
      { from: 's-pit', to: 's-osc', port: 'freq' },
      { from: 's-osc', to: 's-tg' }, { from: 's-te', to: 's-tg', port: 'gain' }, { from: 's-tg', to: 'bus' },
      { from: 's-nz', to: 's-nf' }, { from: 's-nf', to: 's-ng' }, { from: 's-ne', to: 's-ng', port: 'gain' }, { from: 's-ng', to: 'bus' },
      { from: 'bus', to: 'out' },
    ],
  },

  // HI-HAT — bright closed hat: white noise through a steep highpass, gated by a very short env.
  'SYNTH — HI-HAT': {
    name: 'Hi-hat', group: 'SYNTH', kind: 'perc', dur: 0.2,
    nodes: [
      { id: 'h-nz', type: 'noise', name: 'hat', freq: 600, steps: 256, rate: 1 },
      { id: 'h-f', type: 'filter', ftype: 'highpass', freq: 7000, Q: 0.8 },
      { id: 'h-g', type: 'gain' },
      { id: 'h-e', type: 'env', name: 'amp', peak: 0.7, attack: 0.001, decay: 0.04, sustain: 0 },
      { id: 'out', type: 'out', gain: 0.8 },
    ],
    cables: [
      { from: 'h-nz', to: 'h-f' }, { from: 'h-f', to: 'h-g' }, { from: 'h-e', to: 'h-g', port: 'gain' },
      { from: 'h-g', to: 'out' },
    ],
  },

  // WOBBLE BASS — a CONTINUOUS drone (static gain → runs until STOP). A slow sine LFO is scaled by a
  // ×900 MULT and summed onto the lowpass cutoff (1200 ± 900 = 300..2100 Hz) for the dubstep wobble.
  'SYNTH — WOBBLE BASS': {
    name: 'Wobble', group: 'SYNTH', kind: 'bass', dur: 3,
    nodes: [
      { id: 'w-osc', type: 'osc', name: 'bass', wave: 'sawtooth', voices: 2, detune: 8, freq: 55 },
      { id: 'w-lfo', type: 'osc', name: 'lfo', wave: 'sine', freq: 4, level: 1 },   // ±1 wobble signal
      { id: 'w-mul', type: 'math', name: 'x900', mul: 900 },                        // ±1 → ±900 Hz
      { id: 'w-f', type: 'filter', ftype: 'lowpass', freq: 1200, Q: 8 },            // cutoff 1200 ± 900
      { id: 'w-g', type: 'gain', gain: 0.5 },                                       // static level = drones until STOP
      { id: 'out', type: 'out', gain: 0.8 },
    ],
    cables: [
      { from: 'w-lfo', to: 'w-mul' }, { from: 'w-mul', to: 'w-f', port: 'freq' },
      { from: 'w-osc', to: 'w-f' }, { from: 'w-f', to: 'w-g' }, { from: 'w-g', to: 'out' },
    ],
  },

  // ── VEHICLE ENGINES (ports of the Designer ENGINE_CONFIGS; RPMs value node = throttle 0→1, fanned
  //    out through MULTs to pitch / AM-rate / cutoff). Continuous (static gains → drone till STOP).
  //    Starters — need manual ear-tune. ──────────────────────────────────────────────────────────
  'LURCHER — ENGINE': {   // electric servo (tuned 2026-06-14): square + firing-pulse tremolo, NO hiss layer
    name: 'Lurcher', group: 'ENGINES', kind: 'engine', dur: 3,
    nodes: [
      { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0, x: 1.0045283921051216, y: 0 },
      { id: 'osc', type: 'osc', name: 'servo', wave: 'square', freq: 70, freqMod: 1, voices: 2, detune: 6, x: 640, y: -107.35795454545453 },
      { id: 'am', type: 'gain', name: 'pulse', gain: 0.4, x: 960, y: -59.204545454545446 },
      { id: 'lfo', type: 'osc', name: 'pulse', wave: 'sine', freq: 20.5, freqMod: 1, level: 0.6, x: 640, y: 107.35795454545453 },
      { id: 'f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 300, Q: 1, x: 1280, y: 0 },
      { id: 'g', type: 'gain', name: 'servo', gain: 0.36, x: 1597.9909432157908, y: 0 },
      { id: 'r-pit', type: 'math', name: 'rev→pitch', mul: 80, x: 320, y: -59.204545454545446 },                 // 70→150
      { id: 'r-am', type: 'math', name: 'rev→pulse', mul: 26.5, x: 320, y: 59.20454545454547 },                  // 20.5→47
      { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 300, x: 960, y: 59.20454545454547 },                 // 300→600
      { id: 'out', type: 'out', name: 'output', gain: 0.85, x: 1902.478460252795, y: 0 },
    ],
    cables: [
      { from: 'rpm', to: 'r-pit' }, { from: 'r-pit', to: 'osc', port: 'freq' },
      { from: 'rpm', to: 'r-am' }, { from: 'r-am', to: 'lfo', port: 'freq' },
      { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'f', port: 'freq' },
      { from: 'osc', to: 'am' }, { from: 'lfo', to: 'am', port: 'gain' }, { from: 'am', to: 'f' }, { from: 'f', to: 'g' }, { from: 'g', to: 'out' },
    ],
  },

  'VALKYRIE — ENGINE': {   // ducted-fan thrum (tuned 2026-06-14): saw under air, square wop-wop AM, final lowpass
    name: 'Valkyrie', group: 'ENGINES', kind: 'engine', dur: 3,
    nodes: [
      { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0, x: 3.848424268399888, y: 0 },
      { id: 'osc', type: 'osc', name: 'fan', wave: 'sawtooth', freq: 333, freqMod: 1, voices: 2, detune: 20, x: 636.114476527073, y: 0 },
      { id: 'osc-g', type: 'gain', name: 'fan', gain: 0.24, x: 924.9560903345994, y: 0 },
      { id: 'nz', type: 'noise', name: 'air', freq: 600, steps: 256, rate: 1, loopLen: 1, level: 1, x: 329.760182687978, y: -255.72629806186734 },
      { id: 'nz-f', type: 'filter', name: 'air', ftype: 'lowpass', freq: 1090, Q: 0.7, x: 638.6389168763083, y: -203.45504510951667 },
      { id: 'g', type: 'gain', name: 'air', gain: 1.14, x: 922.9113057856837, y: -127.86314903093367 },
      { id: 'am', type: 'gain', name: 'wop', gain: 0.5, x: 1185.530273551517, y: -42.62104967697789 },
      { id: 'lfo', type: 'osc', name: 'wop', wave: 'square', freq: 20, freqMod: 1, level: 0.5, x: 632.5861737576805, y: 255.5726010275902 },
      { id: 'r-pit', type: 'math', name: 'rev→pitch', mul: 300, x: 328.7841644191798, y: 0 },
      { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 980, x: 333.66425576316954, y: -59.204545454545446 },
      { id: 'out', type: 'out', name: 'output', gain: 0.07, x: 1733.4363252621874, y: -45.02079240963123 },
      { id: 'math3', type: 'math', name: '', mul: 1, x: 334.24009101074284, y: 59.20454545454547 },
      { id: 'filter4', type: 'filter', name: '', ftype: 'lowpass', freq: 1680, Q: 1, x: 1454.3972044560335, y: -38.0597379681205 },
    ],
    cables: [
      { from: 'rpm', to: 'r-pit' }, { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'nz-f', port: 'freq' },
      { from: 'osc', to: 'osc-g' }, { from: 'nz', to: 'nz-f' }, { from: 'nz-f', to: 'g' }, { from: 'g', to: 'am' },
      { from: 'lfo', to: 'am', port: 'gain' }, { from: 'osc-g', to: 'am' }, { from: 'r-pit', to: 'osc', port: 'freq' },
      { from: 'rpm', to: 'math3' }, { from: 'math3', to: 'lfo', port: 'freq' },
      { from: 'am', to: 'filter4' }, { from: 'filter4', to: 'out' },
    ],
  },

  'JOTUN — ENGINE': {   // pure-noise diesel (tuned 2026-06-14): body lowpass + resonant grit band, firing-pulse chug
    name: 'Jotun', group: 'ENGINES', kind: 'engine', dur: 3,
    nodes: [
      { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0, x: 0, y: 150 },
      { id: 'nz', type: 'noise', name: 'diesel', freq: 600, steps: 256, rate: 1, loopLen: 1, level: 1, x: 320, y: -22.101598219438028 },
      { id: 'body', type: 'filter', name: 'body', ftype: 'lowpass', freq: 490, Q: 0.1, x: 640, y: 55.85988088087603 },
      { id: 'body-g', type: 'gain', name: 'body', gain: 0.6, x: 960, y: 34.553062699057854 },
      { id: 'grit', type: 'filter', name: 'grit', ftype: 'bandpass', freq: 3000, Q: 16, x: 640, y: -50.21205642006614 },
      { id: 'grit-g', type: 'gain', name: 'grit', gain: 0.4, x: 960, y: -38.280238238247954 },
      { id: 'pulse', type: 'gain', name: 'chug', gain: 0.03, x: 1280, y: 47.77022361755371 },
      { id: 'lfo', type: 'osc', name: 'chug', wave: 'sawtooth', freq: 22, freqMod: 1, level: 0.97, x: 960, y: 196.69397884593943 },
      { id: 'lp', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 2320, Q: 16, x: 1600, y: 106.97476907209918 },
      { id: 'r-body', type: 'math', name: 'rev→body', mul: 505, x: 320, y: 150.0006745078347 },
      { id: 'r-rate', type: 'math', name: 'rev→chug', mul: 10, x: 640, y: 186.2007899717851 },
      { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 3680, x: 1280, y: 166.17931452664462 },
      { id: 'bus', type: 'gain', name: 'mix', gain: 0.7, x: 1920, y: 106.97476907209918 },
      { id: 'out', type: 'out', name: 'output', gain: 0.85, x: 2240, y: 106.97476907209918 },
    ],
    cables: [
      { from: 'rpm', to: 'r-body' }, { from: 'r-body', to: 'body', port: 'freq' },
      { from: 'rpm', to: 'r-rate' }, { from: 'r-rate', to: 'lfo', port: 'freq' },
      { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'lp', port: 'freq' },
      { from: 'nz', to: 'body' }, { from: 'body', to: 'body-g' }, { from: 'body-g', to: 'pulse' },
      { from: 'nz', to: 'grit' }, { from: 'grit', to: 'grit-g' }, { from: 'grit-g', to: 'pulse' },
      { from: 'lfo', to: 'pulse', port: 'gain' }, { from: 'pulse', to: 'lp' }, { from: 'lp', to: 'bus' },
      { from: 'bus', to: 'out' },
    ],
  },

  // FIREBRAT gun — light rapid pulse-laser: bright zap (saw 1700→700) + tick + bandpass body (port of GUN_CONFIGS[1])
  'FIREBRAT — GUN': {   // tuned 2026-06-14: swapped to the simpler synth LASER ZAP (square dive 2000→200)
    name: 'Firebrat', group: 'GUNS', kind: 'laser', dur: 0.5,
    nodes: [
      { id: 'z-osc', type: 'osc', name: 'zap', wave: 'square', freq: 200, freqMod: 1800 },     // dives ~2000 → 200
      { id: 'z-pit', type: 'env', name: 'dive', peak: 1, attack: 0.001, decay: 0.16, sustain: 0 },
      { id: 'z-amp', type: 'env', name: 'amp', peak: 0.9, attack: 0.001, decay: 0.20, sustain: 0 },
      { id: 'z-g', type: 'gain' },
      { id: 'out', type: 'out', gain: 0.8 },
    ],
    cables: [
      { from: 'z-pit', to: 'z-osc', port: 'freq' },
      { from: 'z-osc', to: 'z-g' }, { from: 'z-amp', to: 'z-g', port: 'gain' },
      { from: 'z-g', to: 'out' },
    ],
  },

  // ── WORLD FX (2026-07-08, for Jacob to tinker/approve, then port into the game) ─────────────

  // ELEVATOR — SERVO. Jacob's approved design (2026-07-08): a quiet detuned TRIANGLE pair whose pitch
  // swells up over 1.4s under load, one held env driving both pitch and level. Deliberately low
  // (whine 0.15 × out 0.19 — was 0.1, raised twice per Jacob's ear 2026-07-10; triangle since same day: saw read too buzzy). In-game the LIFT owns the timing — play on rise, stop() on arrival, so
  // it runs exactly as long as the animation; `dur` 5 is just the lab-preview length (then it releases).
  'ELEVATOR — SERVO': {
    name: 'Elevator', group: 'WORLD', kind: 'mech', dur: 5.0,
    nodes: [
      { id: 'whine', type: 'osc', name: 'servo whine', wave: 'triangle', freq: 100, freqMod: 1643.5, voices: 2, detune: 40 },
      { id: 'whine-g', type: 'gain', name: 'whine', gain: 0.15 },
      { id: 'env3', type: 'env', name: 'ride', peak: 0.01, attack: 1.4, decay: 0.002, sustain: 1, hold: 0, release: 0.464, attackCurve: 'exp' },
      { id: 'out', type: 'out', name: 'output', gain: 0.65 },
    ],
    cables: [
      { from: 'env3', to: 'whine', port: 'freq' },
      { from: 'env3', to: 'whine-g', port: 'gain' },
      { from: 'whine', to: 'whine-g' },
      { from: 'whine-g', to: 'out' },
    ],
  },

  // SOLDIER — SQUISH: 'WORLD — SQUISH (synth)' below is the chosen synth squish (Jacob dialed it in
  // 2026-07-10, replacing the old rmrf/sounds/squish.mp3 sample). No oscillators — two swelling
  // resonant bandpasses: an up-sweeping wet body (env1×4000 → bp freq) plus a delayed second
  // squelch (env7×613 → filter9, both fired ~0.2s in). squishAt() in the game plays it positioned.

  // MINE — EXPLOSION. Jacob's own lab design (2026-07-08): a low stepped-noise blast (grit + lowpass)
  // summed with a square "thud" osc (pitch dropping ~317->146 Hz via env4), the whole mix VCA'd by
  // env2 -- a long exp decay to a 0.1 sustain + big release, so it thumps then rings out. env2 is
  // held, so under the envelope rule it auto-stops at `dur` then releases.
  'MINE — EXPLOSION': {
    name: 'Mine', group: 'WORLD', kind: 'perc', dur: 0.85,
    nodes: [
      { id: 'body', type: 'noise', name: 'blast', freq: 8.2, steps: 119, rate: 0.4, level: 1, loopLen: 1.25 },
      { id: 'body-sh', type: 'shaper', name: 'blast', grit: 0.38 },
      { id: 'body-lp', type: 'filter', name: 'blast', ftype: 'lowpass', freq: 1510, Q: 0.5 },
      { id: 'osc3', type: 'osc', name: 'thud', wave: 'square', freq: 109.9, freqMod: 285, level: 3 },
      { id: 'env4', type: 'env', name: 'thud', peak: 0.45, attack: 0, decay: 0.28, sustain: 0, release: 0.3, attackCurve: 'lin' },
      { id: 'gain5', type: 'gain', name: 'thud' },
      { id: 'env2', type: 'env', name: 'blast', peak: 2.5, attack: 0, decay: 0.976, sustain: 0.1, release: 2.912, attackCurve: 'exp' },
      { id: 'gain1', type: 'gain', name: 'mix' },
      { id: 'out', type: 'out', name: 'output', gain: 0.82 },
    ],
    cables: [
      { from: 'body', to: 'body-sh' }, { from: 'body-sh', to: 'body-lp' }, { from: 'body-lp', to: 'gain1' },
      { from: 'osc3', to: 'gain5' }, { from: 'env4', to: 'osc3', port: 'freq' }, { from: 'env4', to: 'gain5', port: 'gain' }, { from: 'gain5', to: 'gain1' },
      { from: 'env2', to: 'gain1', port: 'gain' }, { from: 'gain1', to: 'out' },
    ],
  },

  // SQUISH (synth attempt, 2026-07-10) — a wet squelch built from resonant formants, not a sample.
  // Core: white noise through a high-Q bandpass whose cutoff SNAPS up then squelches back down
  // (a mouth-closing formant sweep, base 320 + env×1500) for the "squish"; a parallel static
  // bandpass at 720 Hz adds a second vocal-ish formant (wetness). A triangle sub with a fast pitch
  // drop is the moist low "pop". Soft (non-zero) envelope attacks avoid a dry click. Grit adds body.
  'WORLD — SQUISH (synth)': {
    name: 'Squish', group: 'WORLD', kind: 'perc', dur: 0.5,
    nodes: [
      { id: 'nz', type: 'noise', name: 'wet', freq: 1.9, steps: 191, rate: 0.78, loopLen: 1.45, level: 1.06, x: 477.84, y: -200.26 },
      { id: 'bp', type: 'filter', name: 'formant', ftype: 'bandpass', freq: 1290, Q: 16, x: 762.32, y: -125.45 },
      { id: 'g1', type: 'gain', name: 'formant', gain: 0, x: 1076.32, y: 16.45 },
      { id: 'wamp', type: 'env', name: 'wet amp', peak: 5, attack: 0.345, decay: 0.002, sustain: 0, attackCurve: 'lin', release: 0.002, delay: 0, x: 765.57, y: 96.29 },
      { id: 'out', type: 'out', name: 'output', gain: 1, x: 1341.31, y: 233.16 },
      { id: 'env1', type: 'env', name: '', peak: 5, attack: 0.18, decay: 0.002, sustain: 1, release: 0.002, attackCurve: 'exp', delay: 0, x: 187.49, y: 55.76 },
      { id: 'math2', type: 'math', name: '', mul: 4000, x: 471.19, y: -15.40 },
      { id: 'noise6', type: 'noise', name: '', rate: 1.18, level: 1, freq: 4.1, steps: 140, loopLen: 1.2, x: 475.54, y: 280.13 },
      { id: 'env7', type: 'env', name: '', peak: 10, attack: 0, decay: 0.532, sustain: 0, release: 0.002, attackCurve: 'exp', delay: 0.2, x: 185.52, y: 483.34 },
      { id: 'math8', type: 'math', name: '', mul: 613.7, x: 476.50, y: 461.40 },
      { id: 'filter9', type: 'filter', name: '', ftype: 'bandpass', freq: 230, Q: 9.5, x: 765.57, y: 337.38 },
      { id: 'env10', type: 'env', name: '', peak: 0.91, attack: 0.06, decay: 0.16, sustain: 0, release: 0.002, attackCurve: 'exp', delay: 0.19, x: 761.90, y: 561.40 },
      { id: 'gain11', type: 'gain', name: '', gain: 0, x: 1067.82, y: 414.58 },
    ],
    cables: [
      { from: 'nz', to: 'bp' }, { from: 'env1', to: 'math2' }, { from: 'math2', to: 'bp', port: 'freq' },
      { from: 'wamp', to: 'g1', port: 'gain' }, { from: 'bp', to: 'g1' }, { from: 'g1', to: 'out' },
      { from: 'noise6', to: 'filter9' }, { from: 'env7', to: 'math8' }, { from: 'math8', to: 'filter9', port: 'freq' },
      { from: 'env10', to: 'gain11', port: 'gain' }, { from: 'filter9', to: 'gain11' }, { from: 'gain11', to: 'out' },
    ],
  },

  // RELAY CLANK (2026-07-10, Jacob's tuning) — a light electromechanical clack for GARAGE vehicle
  // selection (plays when the player switches vehicle and the deck light changes). Broadband noise
  // CONTACT CLICK (its bandpass BYPASSED for a fuller tick), a detuned-triangle metallic RING, and
  // a slow-swelling low TOCK for physical weight; bus makeup ×2. Pasted in from his lab export.
  'WORLD — RELAY CLANK': {
    name: 'Relay clank', group: 'WORLD', kind: 'mech', dur: 0.2,
    nodes: [
      { id: 'ck', type: 'noise', name: 'click', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 1.2, x: 1.18, y: -64.88 },
      { id: 'ckf', type: 'filter', name: 'click', ftype: 'bandpass', freq: 12000, Q: 1.4, x: 352.89, y: -164.47, disabled: true },
      { id: 'ckg', type: 'gain', name: 'click', gain: 0, x: 640, y: 43.13 },
      { id: 'cke', type: 'env', name: 'click amp', peak: 2.5, attack: 0.03, decay: 0.03, sustain: 0, release: 0.3, delay: 0, x: 312.92, y: 35.49 },
      { id: 'ring', type: 'osc', name: 'clank', wave: 'triangle', freq: 1500, voices: 2, detune: 240, x: 320, y: 257.49 },
      { id: 'rg', type: 'gain', name: 'clank', gain: 0, x: 640, y: 343.15 },
      { id: 're', type: 'env', name: 'clank amp', peak: 2.5, attack: 0, decay: 0.238, sustain: 0, release: 0.092, delay: 0, x: 320, y: 428.74 },
      { id: 'tk', type: 'osc', name: 'tock', wave: 'sine', freq: 178.5, freqMod: 90, level: 0.5, x: 320, y: 654.54 },
      { id: 'tkg', type: 'gain', name: 'tock', gain: 0, x: 640.77, y: 740.68 },
      { id: 'tke', type: 'env', name: 'tock amp', peak: 1.62, attack: 0.125, decay: 0.156, sustain: 0, release: 0.3, delay: 0, x: 318.99, y: 881.36 },
      { id: 'bus', type: 'gain', name: 'mix', gain: 2, x: 960, y: 375.65 },
      { id: 'out', type: 'out', name: 'output', gain: 0.7, x: 1280, y: 375.65 },
    ],
    cables: [
      { from: 'ck', to: 'ckf' }, { from: 'ckf', to: 'ckg' }, { from: 'cke', to: 'ckg', port: 'gain' }, { from: 'ckg', to: 'bus' },
      { from: 'ring', to: 'rg' }, { from: 're', to: 'rg', port: 'gain' }, { from: 'rg', to: 'bus' },
      { from: 'tk', to: 'tkg' }, { from: 'tke', to: 'tkg', port: 'gain' }, { from: 'tkg', to: 'bus' },
      { from: 'bus', to: 'out' },
    ],
  }
};
