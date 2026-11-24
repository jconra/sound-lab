// sounds/pi-nebula.js — Pi Nebula's sounds: the station's techno music.
// Plain data (nodes and cables) for the engine in engine.js; every patch says whose it is (project) and what it is
// (group). Tune a sound in the lab, write it here, and sync it to the game: node tools/sync.mjs pi-nebula <the game's file>.
export const PI_NEBULA_PATCHES = {

  // ════════════════════════════════════════════════════════════════════════════════
  //  PI NEBULA — the station's techno music (2026-11-24). The same text as the game's own list,
  //  math-games/pi-nebula/src/music/patches.js (TECHNO_PATCHES): a patch tuned here goes back there
  //  as it is. `project` says whose they are (the engine passes over it). Pitched ones are written
  //  at a C: the basses at C2, the rest at C4.
  // ════════════════════════════════════════════════════════════════════════════════
  // ── drums ──────────────────────────────────────────────────────────────────────────────────────────────────────
  // KICK: a sine with a fast pitch drop (the Sound Lab's SYNTH — KICK, a touch longer)
  'TECHNO — KICK': { group: 'MUSIC', project: 'pi-nebula', name: 'Kick', kind: 'perc', dur: 0.6, nodes: [
    { id: 'k-osc', type: 'osc', name: 'body', wave: 'sine', freq: 48, freqMod: 110 },
    { id: 'k-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.07, sustain: 0 },
    { id: 'k-amp', type: 'env', name: 'amp', peak: 1, attack: 0.002, decay: 0.36, sustain: 0 },
    { id: 'k-g', type: 'gain', name: 'vca' },
    { id: 'out', type: 'out', name: 'output', gain: 0.85 },
  ], cables: [
    { from: 'k-pit', to: 'k-osc', port: 'freq' }, { from: 'k-osc', to: 'k-g' }, { from: 'k-amp', to: 'k-g', port: 'gain' }, { from: 'k-g', to: 'out' },
  ] },
  // LOFI KICK: rounder and shorter, its click filtered off
  'TECHNO — LOFI KICK': { group: 'MUSIC', project: 'pi-nebula', name: 'Lo-fi kick', kind: 'perc', dur: 0.5, nodes: [
    { id: 'k-osc', type: 'osc', name: 'body', wave: 'sine', freq: 46, freqMod: 70 },
    { id: 'k-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.08, sustain: 0 },
    { id: 'k-amp', type: 'env', name: 'amp', peak: 1, attack: 0.003, decay: 0.3, sustain: 0 },
    { id: 'k-g', type: 'gain', name: 'vca' },
    { id: 'k-f', type: 'filter', name: 'soft', ftype: 'lowpass', freq: 900, Q: 0.7 },
    { id: 'out', type: 'out', name: 'output', gain: 0.8 },
  ], cables: [
    { from: 'k-pit', to: 'k-osc', port: 'freq' }, { from: 'k-osc', to: 'k-g' }, { from: 'k-amp', to: 'k-g', port: 'gain' }, { from: 'k-g', to: 'k-f' }, { from: 'k-f', to: 'out' },
  ] },
  // HEAVY KICK: a deeper drop and a longer boom, for the half-time beat
  'TECHNO — HEAVY KICK': { group: 'MUSIC', project: 'pi-nebula', name: 'Heavy kick', kind: 'perc', dur: 0.8, nodes: [
    { id: 'k-osc', type: 'osc', name: 'body', wave: 'sine', freq: 42, freqMod: 130 },
    { id: 'k-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.09, sustain: 0 },
    { id: 'k-amp', type: 'env', name: 'amp', peak: 1, attack: 0.002, decay: 0.5, sustain: 0 },
    { id: 'k-g', type: 'gain', name: 'vca' },
    { id: 'k-sh', type: 'shaper', name: 'warmth', grit: 0.12 },
    { id: 'out', type: 'out', name: 'output', gain: 0.85 },
  ], cables: [
    { from: 'k-pit', to: 'k-osc', port: 'freq' }, { from: 'k-osc', to: 'k-g' }, { from: 'k-amp', to: 'k-g', port: 'gain' }, { from: 'k-g', to: 'k-sh' }, { from: 'k-sh', to: 'out' },
  ] },
  // SNARE: a triangle body and band-passed noise (the Sound Lab's SYNTH — SNARE, its hiss band-passed, not high-passed)
  'TECHNO — SNARE': { group: 'MUSIC', project: 'pi-nebula', name: 'Snare', kind: 'perc', dur: 0.4, nodes: [
    { id: 's-osc', type: 'osc', name: 'body', wave: 'triangle', freq: 180, freqMod: 60 },
    { id: 's-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.05, sustain: 0 },
    { id: 's-tg', type: 'gain', name: 'body vca' },
    { id: 's-te', type: 'env', name: 'body amp', peak: 0.5, attack: 0.001, decay: 0.1, sustain: 0 },
    { id: 's-nz', type: 'noise', name: 'snap', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 's-nf', type: 'filter', name: 'snap tone', ftype: 'bandpass', freq: 1900, Q: 0.8 },
    { id: 's-ng', type: 'gain', name: 'snap vca' },
    { id: 's-ne', type: 'env', name: 'snap amp', peak: 0.8, attack: 0.001, decay: 0.14, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.12 },
    { id: 'out', type: 'out', name: 'output', gain: 0.8 },
  ], cables: [
    { from: 's-pit', to: 's-osc', port: 'freq' }, { from: 's-osc', to: 's-tg' }, { from: 's-te', to: 's-tg', port: 'gain' }, { from: 's-tg', to: 'out' },
    { from: 's-nz', to: 's-nf' }, { from: 's-nf', to: 's-ng' }, { from: 's-ne', to: 's-ng', port: 'gain' }, { from: 's-ng', to: 'out' }, { from: 's-ng', to: 'send' },
  ] },
  // LOFI SNARE: duller and shorter, more room
  'TECHNO — LOFI SNARE': { group: 'MUSIC', project: 'pi-nebula', name: 'Lo-fi snare', kind: 'perc', dur: 0.4, nodes: [
    { id: 's-osc', type: 'osc', name: 'body', wave: 'triangle', freq: 170, freqMod: 40 },
    { id: 's-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.05, sustain: 0 },
    { id: 's-tg', type: 'gain', name: 'body vca' },
    { id: 's-te', type: 'env', name: 'body amp', peak: 0.45, attack: 0.002, decay: 0.09, sustain: 0 },
    { id: 's-nz', type: 'noise', name: 'snap', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 's-nf', type: 'filter', name: 'snap tone', ftype: 'bandpass', freq: 1500, Q: 0.7 },
    { id: 's-nl', type: 'filter', name: 'dull', ftype: 'lowpass', freq: 3200, Q: 0.7 },
    { id: 's-ng', type: 'gain', name: 'snap vca' },
    { id: 's-ne', type: 'env', name: 'snap amp', peak: 0.75, attack: 0.002, decay: 0.11, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.2 },
    { id: 'out', type: 'out', name: 'output', gain: 0.9 },
  ], cables: [
    { from: 's-pit', to: 's-osc', port: 'freq' }, { from: 's-osc', to: 's-tg' }, { from: 's-te', to: 's-tg', port: 'gain' }, { from: 's-tg', to: 'out' },
    { from: 's-nz', to: 's-nf' }, { from: 's-nf', to: 's-nl' }, { from: 's-nl', to: 's-ng' }, { from: 's-ne', to: 's-ng', port: 'gain' }, { from: 's-ng', to: 'out' }, { from: 's-ng', to: 'send' },
  ] },
  // HEAVY SNARE: a big body and a long tail, on the half-time beat's third beat
  'TECHNO — HEAVY SNARE': { group: 'MUSIC', project: 'pi-nebula', name: 'Heavy snare', kind: 'perc', dur: 0.6, nodes: [
    { id: 's-osc', type: 'osc', name: 'body', wave: 'triangle', freq: 190, freqMod: 90 },
    { id: 's-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.06, sustain: 0 },
    { id: 's-tg', type: 'gain', name: 'body vca' },
    { id: 's-te', type: 'env', name: 'body amp', peak: 0.7, attack: 0.001, decay: 0.14, sustain: 0 },
    { id: 's-nz', type: 'noise', name: 'snap', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 's-nf', type: 'filter', name: 'snap tone', ftype: 'bandpass', freq: 1700, Q: 0.7 },
    { id: 's-ng', type: 'gain', name: 'snap vca' },
    { id: 's-ne', type: 'env', name: 'snap amp', peak: 0.8, attack: 0.001, decay: 0.26, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.22 },
    { id: 'out', type: 'out', name: 'output', gain: 0.6 },
  ], cables: [
    { from: 's-pit', to: 's-osc', port: 'freq' }, { from: 's-osc', to: 's-tg' }, { from: 's-te', to: 's-tg', port: 'gain' }, { from: 's-tg', to: 'out' },
    { from: 's-nz', to: 's-nf' }, { from: 's-nf', to: 's-ng' }, { from: 's-ne', to: 's-ng', port: 'gain' }, { from: 's-ng', to: 'out' }, { from: 's-ng', to: 'send' },
  ] },
  // CLAP: three quick bursts of band-passed noise and a short tail (three envelopes, each a little later)
  'TECHNO — CLAP': { group: 'MUSIC', project: 'pi-nebula', name: 'Clap', kind: 'perc', dur: 0.4, nodes: [
    { id: 'c-nz', type: 'noise', name: 'hands', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 'c-f', type: 'filter', name: 'tone', ftype: 'bandpass', freq: 1300, Q: 1.2 },
    { id: 'c-g', type: 'gain', name: 'vca' },
    { id: 'c-e1', type: 'env', name: 'burst 1', peak: 0.6, attack: 0.001, decay: 0.01, sustain: 0 },
    { id: 'c-e2', type: 'env', name: 'burst 2', peak: 0.6, attack: 0.001, decay: 0.01, sustain: 0, delay: 0.011 },
    { id: 'c-e3', type: 'env', name: 'tail', peak: 0.7, attack: 0.001, decay: 0.16, sustain: 0, delay: 0.022 },
    { id: 'send', type: 'send', name: 'room', gain: 0.2 },
    { id: 'out', type: 'out', name: 'output', gain: 0.55 },
  ], cables: [
    { from: 'c-nz', to: 'c-f' }, { from: 'c-f', to: 'c-g' }, { from: 'c-e1', to: 'c-g', port: 'gain' }, { from: 'c-e2', to: 'c-g', port: 'gain' }, { from: 'c-e3', to: 'c-g', port: 'gain' },
    { from: 'c-g', to: 'out' }, { from: 'c-g', to: 'send' },
  ] },
  // HATS: band-passed noise, a very short envelope (closed) or a longer one (open)
  'TECHNO — HAT': { group: 'MUSIC', project: 'pi-nebula', name: 'Hat', kind: 'perc', dur: 0.2, nodes: [
    { id: 'h-nz', type: 'noise', name: 'hat', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 'h-f', type: 'filter', name: 'tone', ftype: 'bandpass', freq: 6800, Q: 0.9 },
    { id: 'h-g', type: 'gain', name: 'vca' },
    { id: 'h-e', type: 'env', name: 'amp', peak: 0.6, attack: 0.001, decay: 0.04, sustain: 0 },
    { id: 'out', type: 'out', name: 'output', gain: 0.9 },
  ], cables: [
    { from: 'h-nz', to: 'h-f' }, { from: 'h-f', to: 'h-g' }, { from: 'h-e', to: 'h-g', port: 'gain' }, { from: 'h-g', to: 'out' },
  ] },
  'TECHNO — OPEN HAT': { group: 'MUSIC', project: 'pi-nebula', name: 'Open hat', kind: 'perc', dur: 0.4, nodes: [
    { id: 'h-nz', type: 'noise', name: 'hat', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 'h-f', type: 'filter', name: 'tone', ftype: 'bandpass', freq: 6400, Q: 0.9 },
    { id: 'h-g', type: 'gain', name: 'vca' },
    { id: 'h-e', type: 'env', name: 'amp', peak: 0.5, attack: 0.002, decay: 0.18, sustain: 0 },
    { id: 'out', type: 'out', name: 'output', gain: 0.75 },
  ], cables: [
    { from: 'h-nz', to: 'h-f' }, { from: 'h-f', to: 'h-g' }, { from: 'h-e', to: 'h-g', port: 'gain' }, { from: 'h-g', to: 'out' },
  ] },
  'TECHNO — LOFI HAT': { group: 'MUSIC', project: 'pi-nebula', name: 'Lo-fi hat', kind: 'perc', dur: 0.2, nodes: [
    { id: 'h-nz', type: 'noise', name: 'hat', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 'h-f', type: 'filter', name: 'tone', ftype: 'bandpass', freq: 5000, Q: 0.8 },
    { id: 'h-g', type: 'gain', name: 'vca' },
    { id: 'h-e', type: 'env', name: 'amp', peak: 0.6, attack: 0.002, decay: 0.05, sustain: 0 },
    { id: 'out', type: 'out', name: 'output', gain: 0.8 },
  ], cables: [
    { from: 'h-nz', to: 'h-f' }, { from: 'h-f', to: 'h-g' }, { from: 'h-e', to: 'h-g', port: 'gain' }, { from: 'h-g', to: 'out' },
  ] },
  // TOM: a pitched sine drop, for the lo-fi fills
  'TECHNO — TOM': { group: 'MUSIC', project: 'pi-nebula', name: 'Tom', kind: 'perc', dur: 0.5, nodes: [
    { id: 't-osc', type: 'osc', name: 'body', wave: 'sine', freq: 130.81, freqMod: 60 },
    { id: 't-pit', type: 'env', name: 'pitch', peak: 1, attack: 0.001, decay: 0.12, sustain: 0 },
    { id: 't-amp', type: 'env', name: 'amp', peak: 1, attack: 0.003, decay: 0.26, sustain: 0 },
    { id: 't-g', type: 'gain', name: 'vca' },
    { id: 'send', type: 'send', name: 'room', gain: 0.15 },
    { id: 'out', type: 'out', name: 'output', gain: 0.5 },
  ], cables: [
    { from: 't-pit', to: 't-osc', port: 'freq' }, { from: 't-osc', to: 't-g' }, { from: 't-amp', to: 't-g', port: 'gain' }, { from: 't-g', to: 'out' }, { from: 't-g', to: 'send' },
  ] },
  // RISER: the build's hiss, noise through a band-pass that glides up across each note (the notes rise a bar at a
  // time, so the band climbs through the build)
  'TECHNO — RISER': { group: 'MUSIC', project: 'pi-nebula', name: 'Riser', kind: 'perc', dur: 2, nodes: [
    { id: 'r-nz', type: 'noise', name: 'hiss', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.6 },
    { id: 'r-f', type: 'filter', name: 'band', ftype: 'bandpass', freq: 400, freqEnd: 650, glide: 1.6, Q: 1.4 },
    { id: 'r-g', type: 'gain', name: 'vca' },
    { id: 'r-e', type: 'env', name: 'amp', peak: 1, attack: 0.08, decay: 0.05, sustain: 0.95, release: 0.08 },
    { id: 'out', type: 'out', name: 'output', gain: 0.22 },
  ], cables: [
    { from: 'r-nz', to: 'r-f' }, { from: 'r-f', to: 'r-g' }, { from: 'r-e', to: 'r-g', port: 'gain' }, { from: 'r-g', to: 'out' },
  ] },

  // ── bass ───────────────────────────────────────────────────────────────────────────────────────────────────────
  // WARM: a sine with a soft triangle an octave up, low-passed (the lo-fi bass)
  'TECHNO — WARM BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'Warm bass', kind: 'bass', dur: 1.5, nodes: [
    { id: 'b-osc', type: 'osc', name: 'body', wave: 'sine', freq: 65.406, level: 1 },
    { id: 'b-oct', type: 'osc', name: 'octave', wave: 'triangle', freq: 130.81, level: 0.22 },
    { id: 'b-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 700, Q: 0.7 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'amp', peak: 1, attack: 0.012, decay: 0.1, sustain: 0.85, release: 0.12 },
    { id: 'out', type: 'out', name: 'output', gain: 0.28 },
  ], cables: [
    { from: 'b-osc', to: 'b-f' }, { from: 'b-oct', to: 'b-f' }, { from: 'b-f', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' },
  ] },
  // PULSE: a saw whose filter snaps shut on each note (the off-beat techno bass)
  'TECHNO — PULSE BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'Pulse bass', kind: 'bass', dur: 0.6, nodes: [
    { id: 'b-osc', type: 'osc', name: 'saw', wave: 'sawtooth', freq: 65.406, level: 1 },
    { id: 'b-f', type: 'filter', name: 'snap', ftype: 'lowpass', freq: 1100, freqEnd: 220, glide: 0.16, Q: 3 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'amp', peak: 1, attack: 0.004, decay: 0.1, sustain: 0.7, release: 0.05 },
    { id: 'out', type: 'out', name: 'output', gain: 0.58 },
  ], cables: [
    { from: 'b-osc', to: 'b-f' }, { from: 'b-f', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' },
  ] },
  // ROLLING: shorter and darker, for sixteenths between the kicks
  'TECHNO — ROLLING BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'Rolling bass', kind: 'bass', dur: 0.4, nodes: [
    { id: 'b-osc', type: 'osc', name: 'saw', wave: 'sawtooth', freq: 65.406, level: 1 },
    { id: 'b-f', type: 'filter', name: 'snap', ftype: 'lowpass', freq: 800, freqEnd: 220, glide: 0.12, Q: 2 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'amp', peak: 1, attack: 0.004, decay: 0.06, sustain: 0.6, release: 0.04 },
    { id: 'out', type: 'out', name: 'output', gain: 0.52 },
  ], cables: [
    { from: 'b-osc', to: 'b-f' }, { from: 'b-f', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' },
  ] },
  // WOBBLE: the growl. Two saws a little apart through a resonant low-pass whose cutoff a slow sine (the LFO, x520
  // through a MULT) swings up and down: the wobble. A plain sine an octave down holds the floor. The player sets the
  // LFO's speed for each note in time with the beat (its 'w-lfo' freq), so it is written here at 2 a second.
  'TECHNO — WOBBLE BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'Wobble bass', kind: 'bass', dur: 1.5, nodes: [
    { id: 'w-osc', type: 'osc', name: 'growl', wave: 'sawtooth', voices: 2, detune: 9, freq: 65.406, level: 1 },
    { id: 'w-lfo', type: 'osc', name: 'wobble', wave: 'sine', freq: 2, level: 1 },
    { id: 'w-mul', type: 'math', name: 'x520', mul: 520 },
    { id: 'w-f', type: 'filter', name: 'mouth', ftype: 'lowpass', freq: 650, Q: 5 },
    { id: 'w-g', type: 'gain', name: 'growl vca' },
    { id: 'w-sub', type: 'osc', name: 'sub', wave: 'sine', freq: 32.703, level: 1.3 },
    { id: 'w-sg', type: 'gain', name: 'sub vca' },
    { id: 'w-e', type: 'env', name: 'amp', peak: 1, attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.06 },
    { id: 'out', type: 'out', name: 'output', gain: 0.17 },
  ], cables: [
    { from: 'w-lfo', to: 'w-mul' }, { from: 'w-mul', to: 'w-f', port: 'freq' },
    { from: 'w-osc', to: 'w-f' }, { from: 'w-f', to: 'w-g' }, { from: 'w-e', to: 'w-g', port: 'gain' }, { from: 'w-g', to: 'out' },
    { from: 'w-sub', to: 'w-sg' }, { from: 'w-e', to: 'w-sg', port: 'gain' }, { from: 'w-sg', to: 'out' },
  ] },

  // FM LADDER: the plucked bass of slap house, made the way an FM synth makes it: four sine operators in a chain, each
  // bending the next one's phase (C, eight times the note, into D into E into F; only F is heard), every bend fading as
  // the note rings, so it starts bright and hollow and settles to a round tone. (The game's maker, 2026-11-24, of a
  // bass he likes: "some FM ladder thing where there is a chain of FM".) The engine's oscillators take a cable on their
  // pitch, not their phase; a phase bend is a pitch bend by the bender's rate of change, and a bandpass filter far below
  // its own pitch gives exactly that. So between two operators: the bender, its fade, that filter ("to phase"), then
  // the next one's pitch plug. HOW HARD each bends (the FM index, radians) = the next operator's freqMod / 3669: 4401
  // is 1.2. Measured against the same ladder worked out by plain arithmetic: every harmonic within 1.1 dB, on pitch to
  // a cent from C1 to C3 (~/pw/space-math/rigs/fmbass-1). The three freqMods and the four fades are the knobs to tune.
  'TECHNO — FM LADDER BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'FM ladder bass', kind: 'bass', dur: 0.45, nodes: [
    { id: 'c', type: 'osc', name: 'C x8', wave: 'sine', freq: 523.248, level: 1 },
    { id: 'c-e', type: 'env', name: 'C fade', peak: 1, attack: 0.002, decay: 0.07, sustain: 0.15, release: 0.08 },
    { id: 'c-v', type: 'gain', name: 'C amount', gain: 0 },
    { id: 'c-d', type: 'filter', name: 'C to phase', ftype: 'bandpass', freq: 5000, Q: 0.7071 },
    { id: 'd', type: 'osc', name: 'D', wave: 'sine', freq: 65.406, freqMod: 4401, level: 1 },
    { id: 'd-e', type: 'env', name: 'D fade', peak: 1, attack: 0.002, decay: 0.14, sustain: 0.35, release: 0.08 },
    { id: 'd-v', type: 'gain', name: 'D amount', gain: 0 },
    { id: 'd-d', type: 'filter', name: 'D to phase', ftype: 'bandpass', freq: 5000, Q: 0.7071 },
    { id: 'e', type: 'osc', name: 'E', wave: 'sine', freq: 65.406, freqMod: 4401, level: 1 },
    { id: 'e-e', type: 'env', name: 'E fade', peak: 1, attack: 0.002, decay: 0.18, sustain: 0.45, release: 0.08 },
    { id: 'e-v', type: 'gain', name: 'E amount', gain: 0 },
    { id: 'e-d', type: 'filter', name: 'E to phase', ftype: 'bandpass', freq: 5000, Q: 0.7071 },
    { id: 'f', type: 'osc', name: 'F (heard)', wave: 'sine', freq: 65.406, freqMod: 4401, level: 1 },
    { id: 'f-e', type: 'env', name: 'pluck', peak: 1, attack: 0.002, decay: 0.25, sustain: 0.55, release: 0.08 },
    { id: 'f-v', type: 'gain', name: 'F level', gain: 0 },
    { id: 'hp', type: 'filter', name: 'no rumble', ftype: 'highpass', freq: 20, Q: 0.7071 },
    { id: 'out', type: 'out', name: 'output', gain: 0.36 },
  ], cables: [
    { from: 'c', to: 'c-v' }, { from: 'c-e', to: 'c-v', port: 'gain' }, { from: 'c-v', to: 'c-d' }, { from: 'c-d', to: 'd', port: 'freq' },
    { from: 'd', to: 'd-v' }, { from: 'd-e', to: 'd-v', port: 'gain' }, { from: 'd-v', to: 'd-d' }, { from: 'd-d', to: 'e', port: 'freq' },
    { from: 'e', to: 'e-v' }, { from: 'e-e', to: 'e-v', port: 'gain' }, { from: 'e-v', to: 'e-d' }, { from: 'e-d', to: 'f', port: 'freq' },
    { from: 'f', to: 'f-v' }, { from: 'f-e', to: 'f-v', port: 'gain' }, { from: 'f-v', to: 'hp' }, { from: 'hp', to: 'out' },
  ] },
  // ── pads (one note of the chord each) ──────────────────────────────────────────────────────────────────────────
  'TECHNO — WARM PAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Warm pad', kind: 'instrument', dur: 4, nodes: [
    { id: 'p-osc', type: 'osc', name: 'saws', wave: 'sawtooth', voices: 2, detune: 7, freq: 261.63, level: 1 },
    { id: 'p-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 900, Q: 0.6 },
    { id: 'p-g', type: 'gain', name: 'vca' },
    { id: 'p-e', type: 'env', name: 'amp', peak: 1, attack: 0.5, decay: 0.3, sustain: 0.85, release: 0.9 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.075 },
  ], cables: [
    { from: 'p-osc', to: 'p-f' }, { from: 'p-f', to: 'p-g' }, { from: 'p-e', to: 'p-g', port: 'gain' }, { from: 'p-g', to: 'out' }, { from: 'p-g', to: 'send' },
  ] },
  'TECHNO — AIRY PAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Airy pad', kind: 'instrument', dur: 4, nodes: [
    { id: 'p-osc', type: 'osc', name: 'triangles', wave: 'triangle', voices: 2, detune: 9, freq: 261.63, level: 1 },
    { id: 'p-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 2400, Q: 0.6 },
    { id: 'p-g', type: 'gain', name: 'vca' },
    { id: 'p-e', type: 'env', name: 'amp', peak: 1, attack: 0.7, decay: 0.3, sustain: 0.85, release: 1.1 },
    { id: 'send', type: 'send', name: 'room', gain: 0.4 },
    { id: 'out', type: 'out', name: 'output', gain: 0.09 },
  ], cables: [
    { from: 'p-osc', to: 'p-f' }, { from: 'p-f', to: 'p-g' }, { from: 'p-e', to: 'p-g', port: 'gain' }, { from: 'p-g', to: 'out' }, { from: 'p-g', to: 'send' },
  ] },
  'TECHNO — DARK PAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Dark pad', kind: 'instrument', dur: 4, nodes: [
    { id: 'p-osc', type: 'osc', name: 'saws', wave: 'sawtooth', voices: 2, detune: 5, freq: 261.63, level: 1 },
    { id: 'p-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 480, Q: 0.8 },
    { id: 'p-g', type: 'gain', name: 'vca' },
    { id: 'p-e', type: 'env', name: 'amp', peak: 1, attack: 0.6, decay: 0.3, sustain: 0.85, release: 1 },
    { id: 'send', type: 'send', name: 'room', gain: 0.3 },
    { id: 'out', type: 'out', name: 'output', gain: 0.11 },
  ], cables: [
    { from: 'p-osc', to: 'p-f' }, { from: 'p-f', to: 'p-g' }, { from: 'p-e', to: 'p-g', port: 'gain' }, { from: 'p-g', to: 'out' }, { from: 'p-g', to: 'send' },
  ] },

  // ── leads ──────────────────────────────────────────────────────────────────────────────────────────────────────
  // KEYS: an electric piano: a sine ringing down, a quick soft octave on the strike
  'TECHNO — KEYS': { group: 'MUSIC', project: 'pi-nebula', name: 'Keys', kind: 'instrument', dur: 1.6, nodes: [
    { id: 'k-osc', type: 'osc', name: 'tine', wave: 'sine', freq: 261.63, level: 1 },
    { id: 'k-g', type: 'gain', name: 'vca' },
    { id: 'k-e', type: 'env', name: 'ring', peak: 1, attack: 0.006, decay: 1.3, sustain: 0 },
    { id: 'k-o2', type: 'osc', name: 'strike', wave: 'sine', freq: 523.25, level: 1 },
    { id: 'k-g2', type: 'gain', name: 'strike vca' },
    { id: 'k-e2', type: 'env', name: 'strike', peak: 0.25, attack: 0.003, decay: 0.2, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.5 },
  ], cables: [
    { from: 'k-osc', to: 'k-g' }, { from: 'k-e', to: 'k-g', port: 'gain' }, { from: 'k-g', to: 'out' }, { from: 'k-g', to: 'send' },
    { from: 'k-o2', to: 'k-g2' }, { from: 'k-e2', to: 'k-g2', port: 'gain' }, { from: 'k-g2', to: 'out' },
  ] },
  // SOFT SAW: two saws a little apart, the filter settling darker after the start
  'TECHNO — SOFT SAW': { group: 'MUSIC', project: 'pi-nebula', name: 'Soft saw', kind: 'instrument', dur: 1.5, nodes: [
    { id: 'l-osc', type: 'osc', name: 'saws', wave: 'sawtooth', voices: 2, detune: 6, freq: 261.63, level: 1 },
    { id: 'l-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 2200, freqEnd: 1300, glide: 0.3, Q: 0.8 },
    { id: 'l-g', type: 'gain', name: 'vca' },
    { id: 'l-e', type: 'env', name: 'amp', peak: 1, attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.15 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.14 },
  ], cables: [
    { from: 'l-osc', to: 'l-f' }, { from: 'l-f', to: 'l-g' }, { from: 'l-e', to: 'l-g', port: 'gain' }, { from: 'l-g', to: 'out' }, { from: 'l-g', to: 'send' },
  ] },
  // SQUARE: a mellow square, low-passed
  'TECHNO — SQUARE LEAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Square lead', kind: 'instrument', dur: 1.5, nodes: [
    { id: 'l-osc', type: 'osc', name: 'square', wave: 'square', freq: 261.63, level: 1 },
    { id: 'l-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 1700, freqEnd: 1000, glide: 0.3, Q: 0.8 },
    { id: 'l-g', type: 'gain', name: 'vca' },
    { id: 'l-e', type: 'env', name: 'amp', peak: 1, attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.15 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.12 },
  ], cables: [
    { from: 'l-osc', to: 'l-f' }, { from: 'l-f', to: 'l-g' }, { from: 'l-e', to: 'l-g', port: 'gain' }, { from: 'l-g', to: 'out' }, { from: 'l-g', to: 'send' },
  ] },

  // ── melodies ───────────────────────────────────────────────────────────────────────────────────────────────────
  'TECHNO — ARP': { group: 'MUSIC', project: 'pi-nebula', name: 'Arp', kind: 'instrument', dur: 0.6, nodes: [
    { id: 'a-osc', type: 'osc', name: 'pluck', wave: 'triangle', freq: 261.63, level: 1 },
    { id: 'a-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 2600, Q: 0.7 },
    { id: 'a-g', type: 'gain', name: 'vca' },
    { id: 'a-e', type: 'env', name: 'amp', peak: 1, attack: 0.004, decay: 0.25, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.3 },
  ], cables: [
    { from: 'a-osc', to: 'a-f' }, { from: 'a-f', to: 'a-g' }, { from: 'a-e', to: 'a-g', port: 'gain' }, { from: 'a-g', to: 'out' }, { from: 'a-g', to: 'send' },
  ] },
  'TECHNO — BELLS': { group: 'MUSIC', project: 'pi-nebula', name: 'Bells', kind: 'instrument', dur: 1.6, nodes: [
    { id: 'b-osc', type: 'osc', name: 'bell', wave: 'sine', freq: 261.63, level: 1 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'ring', peak: 1, attack: 0.004, decay: 1.2, sustain: 0 },
    { id: 'b-o3', type: 'osc', name: 'shimmer', wave: 'sine', freq: 784.89, level: 1 },
    { id: 'b-g3', type: 'gain', name: 'shimmer vca' },
    { id: 'b-e3', type: 'env', name: 'shimmer', peak: 0.15, attack: 0.002, decay: 0.15, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.35 },
    { id: 'out', type: 'out', name: 'output', gain: 0.3 },
  ], cables: [
    { from: 'b-osc', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' }, { from: 'b-g', to: 'send' },
    { from: 'b-o3', to: 'b-g3' }, { from: 'b-e3', to: 'b-g3', port: 'gain' }, { from: 'b-g3', to: 'out' },
  ] },
  // ECHO PLUCK: a pluck into its own echo (a delay with no dry path); a long envelope on the echo's wet level lets
  // the repeats fade and keeps the note alive until they have. The player sets the echo's time to the beat.
  'TECHNO — ECHO PLUCK': { group: 'MUSIC', project: 'pi-nebula', name: 'Echo pluck', kind: 'instrument', dur: 2, nodes: [
    { id: 'e-osc', type: 'osc', name: 'pluck', wave: 'triangle', freq: 261.63, level: 1 },
    { id: 'e-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 2000, Q: 0.7 },
    { id: 'e-g', type: 'gain', name: 'vca' },
    { id: 'e-e', type: 'env', name: 'amp', peak: 1, attack: 0.004, decay: 0.25, sustain: 0 },
    { id: 'e-dl', type: 'delay', name: 'echo', time: 0.36, feedback: 0.4, tone: 1800, wet: 0, dry: 0 },
    { id: 'e-we', type: 'env', name: 'echo fade', peak: 0.6, attack: 0.001, decay: 1.6, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.2 },
    { id: 'out', type: 'out', name: 'output', gain: 0.35 },
  ], cables: [
    { from: 'e-osc', to: 'e-f' }, { from: 'e-f', to: 'e-g' }, { from: 'e-e', to: 'e-g', port: 'gain' }, { from: 'e-g', to: 'out' }, { from: 'e-g', to: 'send' },
    { from: 'e-g', to: 'e-dl' }, { from: 'e-we', to: 'e-dl', port: 'wet' }, { from: 'e-dl', to: 'out' },
  ] },
  // ── end of PI NEBULA ──
};
