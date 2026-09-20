// songtab.js — the Sound Lab's song editor: a full-screen piano roll over seq.js's song format.
//
// A song is sections (A, B, C, D ...), each a whole-band pattern of tracks, and a chain that
// plays them in some order (A B A C ...). This tab edits exactly that structure, so what it
// saves is what the sequencer (and the game) already play — no conversion.
//
// The roll: rows are semitones relative to each instrument's own pitch, columns are steps on a
// sixteenth grid at the song's BPM. A note is a bar. Drag it to move in time or pitch; a short
// click cycles its length 1 → 2 → 4 → 8 steps; click an empty cell to add a note; right-click
// or long-press to delete. Section tabs run along the top; to their right the song strip holds
// the chain as chips you drag into order.
export function createSongTab(host, { SONGS, INSTRUMENTS, Sequencer, getCtx, stopVoice }) {
  const $ = (sel, root = host) => root.querySelector(sel);
  host.innerHTML = `
    <div class="st-top">
      <b>SONG</b>
      <select class="st-song"></select>
      <label>BPM <input class="st-bpm" type="number" min="40" max="240" step="1"></label>
      <label>BARS <input class="st-bars" type="number" min="1" max="8" step="1"></label>
      <button class="st-playsec">&#9654; SECTION</button>
      <button class="st-playsong">&#9654; SONG</button>
      <button class="st-stop ghost">&#9632; STOP</button>
      <span class="st-note"></span>
      <button class="st-export ghost">EXPORT</button>
      <button class="st-close ghost" title="close">&times;</button>
    </div>
    <div class="st-sections">
      <div class="st-tabs"></div>
      <div class="st-chain"><span class="st-chainlbl">SONG</span><div class="st-chips"></div><span class="st-chainhint">drag to reorder · × removes · a tab's + adds it</span></div>
    </div>
    <div class="st-main">
      <div class="st-tracks"></div>
      <div class="st-rollwrap"><canvas class="st-roll"></canvas></div>
    </div>
    <textarea class="st-out" readonly></textarea>`;

  const els = {
    song: $('.st-song'), bpm: $('.st-bpm'), bars: $('.st-bars'), tabs: $('.st-tabs'), chips: $('.st-chips'),
    tracks: $('.st-tracks'), roll: $('.st-roll'), wrap: $('.st-rollwrap'), note: $('.st-note'), out: $('.st-out'),
  };
  const g = els.roll.getContext('2d');

  // ── state ──
  let song = null, songKey = null, section = 'A', trackIdx = 0, seq = null, playhead = -1, playing = null;
  const SEMI_LO = -24, SEMI_HI = 24;                        // rows shown, relative to the instrument's pitch
  const LENGTHS = [1, 2, 4, 8];
  const PERC = new Set(['DRUM', 'SNARE', 'HAT']);

  // songs are edited in place so the sequencer, which reads the same objects, hears edits live;
  // built-in songs are copied first so the originals stay as authored
  const edited = {};
  function loadSong(key) {
    if (!edited[key]) edited[key] = JSON.parse(JSON.stringify(SONGS[key]));
    song = edited[key]; songKey = key;
    if (!song.parts) { song.parts = { A: { tracks: song.tracks || [] } }; delete song.tracks; song.chain = ['A']; }
    if (!song.chain) song.chain = Object.keys(song.parts);
    section = Object.keys(song.parts)[0]; trackIdx = 0;
    els.bpm.value = song.bpm; els.bars.value = song.bars;
    render();
  }
  function newSong() {
    const key = 'NEW ' + (Object.keys(SONGS).filter(k => k.startsWith('NEW')).length + 1);
    SONGS[key] = { name: key, bpm: 120, bars: 1, beats: 4, div: 4, loop: true, chain: ['A'], parts: { A: { tracks: [{ inst: 'BASS', vol: 1, notes: [] }] } } };
    els.song.add(new Option(SONGS[key].name, key)); els.song.value = key;
    loadSong(key);
  }
  const total = () => song.bars * song.beats * song.div;
  const tracks = () => song.parts[section].tracks;
  const track = () => tracks()[trackIdx];

  // ── sections and the chain ──
  function renderTabs() {
    els.tabs.innerHTML = '';
    for (const name of Object.keys(song.parts)) {
      const t = document.createElement('div'); t.className = 'st-tab' + (name === section ? ' on' : '');
      t.innerHTML = `<span class="st-tabname">${name}</span><button class="st-tabadd" title="add to song">+</button>`;
      t.querySelector('.st-tabname').addEventListener('click', () => { section = name; trackIdx = Math.min(trackIdx, tracks().length - 1); render(); if (playing === 'section') playSection(); });
      t.querySelector('.st-tabadd').addEventListener('click', () => { song.chain.push(name); renderChain(); });
      els.tabs.appendChild(t);
    }
    const add = document.createElement('button'); add.className = 'st-tabnew'; add.textContent = '+ section';
    add.addEventListener('click', () => {
      const name = String.fromCharCode(65 + Object.keys(song.parts).length);
      // a new section starts as a copy of the current one: verses are usually near-copies
      song.parts[name] = JSON.parse(JSON.stringify(song.parts[section])); section = name; render();
    });
    els.tabs.appendChild(add);
  }
  let dragChip = null;
  function renderChain() {
    els.chips.innerHTML = '';
    song.chain.forEach((slot, i) => {
      const c = document.createElement('div'); c.className = 'st-chip'; c.dataset.i = i;
      c.innerHTML = `<span>${Array.isArray(slot) ? slot.join('/') : slot}</span><button class="st-chipx" title="remove">×</button>`;
      c.querySelector('.st-chipx').addEventListener('click', e => { e.stopPropagation(); song.chain.splice(i, 1); renderChain(); });
      c.addEventListener('pointerdown', e => { if (e.target.classList.contains('st-chipx')) return; dragChip = { from: i, el: c }; c.classList.add('drag'); c.setPointerCapture(e.pointerId); });
      c.addEventListener('pointermove', e => {
        if (!dragChip) return;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.st-chip');
        if (over && over !== c) { const j = +over.dataset.i; const [m] = song.chain.splice(dragChip.from, 1); song.chain.splice(j, 0, m); dragChip.from = j; renderChain(); const nc = els.chips.children[j]; if (nc) { dragChip.el = nc; nc.classList.add('drag'); } }
      });
      const drop = () => { if (dragChip) { dragChip.el.classList.remove('drag'); dragChip = null; renderChain(); } };
      c.addEventListener('pointerup', drop); c.addEventListener('pointercancel', drop);
      els.chips.appendChild(c);
    });
    if (!song.chain.length) els.chips.innerHTML = '<span class="st-empty">empty — add sections with their + button</span>';
  }

  // ── tracks ──
  function renderTracks() {
    els.tracks.innerHTML = '';
    tracks().forEach((tr, i) => {
      const row = document.createElement('div'); row.className = 'st-track' + (i === trackIdx ? ' on' : '');
      const sel = document.createElement('select'); for (const k of Object.keys(INSTRUMENTS)) sel.add(new Option(k, k)); sel.value = tr.inst;
      sel.addEventListener('change', () => { tr.inst = sel.value; drawRoll(); });
      const vol = document.createElement('input'); vol.type = 'range'; vol.min = 0; vol.max = 1.5; vol.step = 0.05; vol.value = tr.vol ?? 1; vol.title = 'volume';
      vol.addEventListener('input', () => tr.vol = +vol.value);
      const mute = document.createElement('button'); mute.className = 'st-mute' + (tr.mute ? ' on' : ''); mute.textContent = 'M'; mute.title = 'mute';
      mute.addEventListener('click', e => { e.stopPropagation(); tr.mute = !tr.mute; mute.classList.toggle('on', tr.mute); });
      const del = document.createElement('button'); del.className = 'st-trdel'; del.textContent = '×'; del.title = 'remove track';
      del.addEventListener('click', e => { e.stopPropagation(); if (tracks().length <= 1) return; tracks().splice(i, 1); trackIdx = Math.max(0, Math.min(trackIdx, tracks().length - 1)); render(); });
      row.append(sel, vol, mute, del);
      row.addEventListener('click', () => { trackIdx = i; renderTracks(); drawRoll(); });
      els.tracks.appendChild(row);
    });
    const add = document.createElement('button'); add.className = 'st-tradd'; add.textContent = '+ track';
    add.addEventListener('click', () => { tracks().push({ inst: 'LEAD', vol: 1, notes: [] }); trackIdx = tracks().length - 1; render(); });
    els.tracks.appendChild(add);
  }

  // ── the roll ──
  let cellW = 22, cellH = 14, left = 34, top = 18;
  function layout() {
    const W = els.wrap.clientWidth, n = total();
    cellW = Math.max(14, Math.floor((W - left) / n));
    const rows = SEMI_HI - SEMI_LO + 1;
    cellH = Math.max(11, Math.min(18, Math.floor((els.wrap.clientHeight - top) / rows)));
    els.roll.width = left + cellW * n; els.roll.height = top + cellH * rows;
  }
  const rowOf = (semi) => SEMI_HI - semi;                    // high pitches at the top
  const semiOf = (row) => SEMI_HI - row;
  function drawRoll() {
    layout();
    const n = total(), rows = SEMI_HI - SEMI_LO + 1, W = els.roll.width, H = els.roll.height;
    g.fillStyle = '#04090f'; g.fillRect(0, 0, W, H);
    // rows: octave bands, C lines
    for (let r = 0; r < rows; r++) {
      const semi = semiOf(r), y = top + r * cellH;
      g.fillStyle = ((semi % 12) + 12) % 12 === 0 ? 'rgba(0,238,255,0.07)' : (r % 2 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)');
      g.fillRect(left, y, W - left, cellH);
      if (((semi % 12) + 12) % 12 === 0) { g.fillStyle = '#4d7f8f'; g.font = '9px Courier New, monospace'; g.textBaseline = 'middle'; g.fillText((semi >= 0 ? '+' : '') + semi, 4, y + cellH / 2); }
    }
    // columns: beats and bars
    for (let s = 0; s <= n; s++) {
      const x = left + s * cellW;
      g.strokeStyle = s % (song.beats * song.div) === 0 ? 'rgba(0,238,255,0.35)' : s % song.div === 0 ? 'rgba(0,238,255,0.16)' : 'rgba(255,255,255,0.05)';
      g.beginPath(); g.moveTo(x + 0.5, top); g.lineTo(x + 0.5, H); g.stroke();
      if (s < n && s % song.div === 0) { g.fillStyle = '#4d7f8f'; g.font = '9px Courier New, monospace'; g.textBaseline = 'top'; g.fillText(String(Math.floor(s / song.div) % song.beats + 1), x + 3, 3); }
    }
    // other tracks' notes, faint, so the part reads as a whole
    tracks().forEach((tr, i) => {
      if (i === trackIdx) return;
      for (const nt of tr.notes) { const [s, semi, len] = nt; g.fillStyle = PERC.has(tr.inst) ? 'rgba(90,150,255,0.18)' : 'rgba(255,210,74,0.16)'; g.fillRect(left + s * cellW + 1, top + rowOf(semi) * cellH + 2, cellW * Math.max(1, len || 1) - 2, cellH - 4); }
    });
    // this track's notes
    const tr = track(); if (!tr) return;
    const perc = PERC.has(tr.inst);
    for (const nt of tr.notes) {
      const [s, semi, len, vel] = nt, x = left + s * cellW, y = top + rowOf(semi) * cellH, w = cellW * Math.max(1, len || 1);
      g.fillStyle = perc ? `rgba(90,150,255,${0.45 + 0.5 * (vel ?? 1)})` : `rgba(255,210,74,${0.45 + 0.5 * (vel ?? 1)})`;
      g.fillRect(x + 1, y + 1, w - 2, cellH - 2);
      g.strokeStyle = nt === grab?.note ? '#fff' : 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, w - 3, cellH - 3);
    }
    // playhead
    if (playhead >= 0) { g.fillStyle = 'rgba(47,232,138,0.35)'; g.fillRect(left + playhead * cellW, top, cellW, H - top); }
  }
  // pointer → cell
  function cellAt(e) {
    const r = els.roll.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    return { step: Math.floor((x - left) / cellW), row: Math.floor((y - top) / cellH), x, y };
  }
  function noteAt(step, semi) {
    const tr = track(); if (!tr) return null;
    return tr.notes.find(nt => nt[1] === semi && step >= nt[0] && step < nt[0] + Math.max(1, nt[2] || 1)) || null;
  }
  let grab = null, longPress = null;
  els.roll.addEventListener('contextmenu', e => e.preventDefault());
  els.roll.addEventListener('pointerdown', e => {
    const tr = track(); if (!tr) return;
    const c = cellAt(e); if (c.step < 0 || c.row < 0 || c.step >= total()) return;
    const semi = semiOf(c.row), hit = noteAt(c.step, semi);
    if (e.button === 2) { if (hit) { tr.notes.splice(tr.notes.indexOf(hit), 1); drawRoll(); } return; }
    if (!hit) {
      const nt = [c.step, semi, 1, 0.8]; tr.notes.push(nt); tr.notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      auditionNote(tr, nt); drawRoll(); return;
    }
    grab = { note: hit, step0: c.step, semi0: semi, start: [hit[0], hit[1]], moved: false };
    els.roll.setPointerCapture(e.pointerId);
    clearTimeout(longPress); longPress = setTimeout(() => { if (grab && !grab.moved) { tr.notes.splice(tr.notes.indexOf(grab.note), 1); grab = null; drawRoll(); } }, 650);
    drawRoll();
  });
  els.roll.addEventListener('pointermove', e => {
    if (!grab) return;
    const c = cellAt(e), ds = c.step - grab.step0, dsemi = semiOf(c.row) - grab.semi0;
    if (!ds && !dsemi) return;
    grab.moved = true; clearTimeout(longPress);
    const nt = grab.note, len = Math.max(1, nt[2] || 1);
    nt[0] = Math.max(0, Math.min(total() - len, grab.start[0] + ds));
    nt[1] = Math.max(SEMI_LO, Math.min(SEMI_HI, grab.start[1] + dsemi));
    drawRoll();
  });
  const release = () => {
    clearTimeout(longPress);
    if (!grab) return;
    const tr = track(), nt = grab.note;
    if (!grab.moved) { nt[2] = LENGTHS[(LENGTHS.indexOf(Math.max(1, nt[2] || 1)) + 1) % LENGTHS.length]; if (nt[0] + nt[2] > total()) nt[2] = 1; }
    else auditionNote(tr, nt);
    grab = null; tr.notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]); drawRoll();
  };
  els.roll.addEventListener('pointerup', release); els.roll.addEventListener('pointercancel', release);

  // ── playing ──
  function ensureSeq() {
    const ctx = getCtx();
    if (!seq) {
      seq = new Sequencer(ctx.ctx, ctx.dest, ctx.reverb);
      seq.onStep = (step) => { playhead = step; drawRoll(); };
      seq.onPart = (name) => { if (playing === 'song' && name && song.parts[name]) { section = name; render(); } els.note.textContent = 'playing · ' + name; };
      seq.onEnd = () => { playing = null; playhead = -1; els.note.textContent = 'done'; drawRoll(); };
    }
    return seq;
  }
  function playSection() {
    stopVoice(); const s = ensureSeq(); playing = 'section';
    s.setSong({ ...song, chain: [section], loop: true }); s.start(); els.note.textContent = 'playing · ' + section;
  }
  function playSong() {
    stopVoice(); const s = ensureSeq(); playing = 'song';
    s.setSong(song); s.start();
  }
  function stop() { if (seq) seq.stop(); playing = null; playhead = -1; els.note.textContent = ''; drawRoll(); }
  function auditionNote(tr, nt) {
    // one note on its own, so placing it is heard - through a throwaway sequencer of one step
    if (playing) return;
    try {
      const ctx = getCtx(), one = new Sequencer(ctx.ctx, ctx.dest, ctx.reverb);
      one.setSong({ ...song, bars: 1, beats: 1, div: 1, loop: false, chain: ['_'], parts: { _: { tracks: [{ inst: tr.inst, vol: tr.vol, notes: [[0, nt[1], 1, nt[3] ?? 0.8]] }] } } });
      one.start(); setTimeout(() => one.stop(), 60 / song.bpm / song.div * Math.max(1, nt[2] || 1) * 1000 + 200);
    } catch (e) { /* audition is a courtesy */ }
  }

  // ── top bar ──
  for (const k in SONGS) els.song.add(new Option(SONGS[k].name, k));
  els.song.add(new Option('+ new song', '__new'));
  els.song.addEventListener('change', () => { stop(); if (els.song.value === '__new') newSong(); else loadSong(els.song.value); });
  els.bpm.addEventListener('change', () => { song.bpm = +els.bpm.value || 120; if (playing) (playing === 'song' ? playSong : playSection)(); });
  els.bars.addEventListener('change', () => { song.bars = Math.max(1, Math.min(8, +els.bars.value || 1)); render(); });
  $('.st-playsec').addEventListener('click', playSection);
  $('.st-playsong').addEventListener('click', playSong);
  $('.st-stop').addEventListener('click', stop);
  $('.st-export').addEventListener('click', () => {
    const on = els.out.style.display !== 'block'; els.out.style.display = on ? 'block' : 'none';
    if (on) { els.out.value = JSON.stringify(song, null, 1); els.out.select(); try { navigator.clipboard.writeText(els.out.value); } catch (e) {} }
  });
  $('.st-close').addEventListener('click', () => api.close());
  addEventListener('resize', () => { if (host.style.display === 'flex') drawRoll(); });

  function render() { renderTabs(); renderChain(); renderTracks(); drawRoll(); }
  const api = {
    open() { host.style.display = 'flex'; if (!song) loadSong(els.song.value = Object.keys(SONGS)[0]); else drawRoll(); },
    close() { stop(); host.style.display = 'none'; },
    get song() { return song; }, get section() { return section; }, get seq() { return seq; },
    loadSong, playSection, playSong, stop, render,
  };
  return api;
}
