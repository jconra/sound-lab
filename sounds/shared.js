// sounds/shared.js — Shared sounds: the lab's own demos and starting points (SYNTH, DEMO). No game plays them today.
// Plain data (nodes and cables) for the engine in engine.js; every patch says whose it is (project) and what it is
// (group). A game that plays one of these gets it with its own sounds when synced (tools/sync.mjs, SHARED_FOR).
export const SHARED_PATCHES = {

  // KICK — demos envelope-driven PITCH. A one-shot ENV into the osc's freq plug, scaled by the
  // osc's freqMod (300 Hz), snaps pitch up to ~350 Hz then drops it back to the 50 Hz base over
  // 60 ms — the classic synth-kick "thump." A second ENV shapes the amp.
  'SYNTH — KICK': {
    name: 'Kick', project: 'shared', group: 'SYNTH', kind: 'perc', dur: 0.6,
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
    name: 'MULT demo', project: 'shared', group: 'SYNTH', kind: 'demo', dur: 1.6,
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
    name: 'Laser', project: 'shared', group: 'SYNTH', kind: 'perc', dur: 0.5,
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
    name: 'Snare', project: 'shared', group: 'SYNTH', kind: 'perc', dur: 0.4,
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
    name: 'Hi-hat', project: 'shared', group: 'SYNTH', kind: 'perc', dur: 0.2,
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
    name: 'Wobble', project: 'shared', group: 'SYNTH', kind: 'bass', dur: 3,
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
};
