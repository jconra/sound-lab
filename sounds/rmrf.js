// sounds/rmrf.js — RMRF's sounds: the four vehicles' guns and engines, and the world's (the elevator, the mine, the squish, the relay).
// Plain data (nodes and cables) for the engine in engine.js; every patch says whose it is (project) and what it is
// (group). Tune a sound in the lab, write it here, and sync it to the game: node tools/sync.mjs rmrf <the game's file>.
export const RMRF_PATCHES = {
  // LURCHER autocannon (tuned 2026-06-14): body noise + pitch-diving sine tone → ×1.53 → grit shaper
  'LURCHER — GUN A': {
    name: 'Lurcher', project: 'rmrf', group: 'GUNS', kind: 'ballistic', dur: 0.6,
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
    name: 'Jotun', project: 'rmrf', group: 'GUNS', kind: 'railgun', dur: 2.2,
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
    name: 'Firebrat', project: 'rmrf', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Valkyrie', project: 'rmrf', group: 'GUNS', kind: 'rocket', dur: 1.2,
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

  // ── VEHICLE ENGINES (ports of the Designer ENGINE_CONFIGS; RPMs value node = throttle 0→1, fanned
  //    out through MULTs to pitch / AM-rate / cutoff). Continuous (static gains → drone till STOP).
  //    Starters — need manual ear-tune. ──────────────────────────────────────────────────────────
  'LURCHER — ENGINE': {   // electric servo (tuned 2026-06-14): square + firing-pulse tremolo, NO hiss layer
    name: 'Lurcher', project: 'rmrf', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Valkyrie', project: 'rmrf', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Jotun', project: 'rmrf', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Firebrat', project: 'rmrf', group: 'GUNS', kind: 'laser', dur: 0.5,
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

  // ── WORLD FX (2026-07-08, for the game's maker to tinker/approve, then port into the game) ─────────────

  // ELEVATOR — SERVO. The game's maker's approved design (2026-07-08): a quiet detuned TRIANGLE pair whose pitch
  // swells up over 1.4s under load, one held env driving both pitch and level. Deliberately low
  // (whine 0.15 × out 0.19 — was 0.1, raised twice by the game's maker's ear 2026-07-10; triangle since same day: saw read too buzzy). In-game the LIFT owns the timing — play on rise, stop() on arrival, so
  // it runs exactly as long as the animation; `dur` 5 is just the lab-preview length (then it releases).
  'ELEVATOR — SERVO': {
    name: 'Elevator', project: 'rmrf', group: 'WORLD', kind: 'mech', dur: 5.0,
    nodes: [
      { id: 'whine', type: 'osc', name: 'servo whine', wave: 'triangle', freq: 100, freqMod: 1643.5, voices: 2, detune: 40 },
      { id: 'whine-g', type: 'gain', name: 'whine', gain: 0.15 },
      { id: 'env3', type: 'env', name: 'ride', peak: 0.01, attack: 1.4, decay: 0.002, sustain: 1, hold: 0, release: 0.464, attackCurve: 'exp' },
      { id: 'out', type: 'out', name: 'output', gain: 1.6 },
    ],
    cables: [
      { from: 'env3', to: 'whine', port: 'freq' },
      { from: 'env3', to: 'whine-g', port: 'gain' },
      { from: 'whine', to: 'whine-g' },
      { from: 'whine-g', to: 'out' },
    ],
  },

  // SOLDIER — SQUISH: 'WORLD — SQUISH (synth)' below is the chosen synth squish (the game's maker dialed it in
  // 2026-07-10, replacing the old rmrf/sounds/squish.mp3 sample). No oscillators — two swelling
  // resonant bandpasses: an up-sweeping wet body (env1×4000 → bp freq) plus a delayed second
  // squelch (env7×613 → filter9, both fired ~0.2s in). squishAt() in the game plays it positioned.

  // MINE — EXPLOSION. The game's maker's own lab design (2026-07-08): a low stepped-noise blast (grit + lowpass)
  // summed with a square "thud" osc (pitch dropping ~317->146 Hz via env4), the whole mix VCA'd by
  // env2 -- a long exp decay to a 0.1 sustain + big release, so it thumps then rings out. env2 is
  // held, so under the envelope rule it auto-stops at `dur` then releases.
  'MINE — EXPLOSION': {
    name: 'Mine', project: 'rmrf', group: 'WORLD', kind: 'perc', dur: 0.85,
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
    name: 'Squish', project: 'rmrf', group: 'WORLD', kind: 'perc', dur: 0.5,
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

  // RELAY CLANK (2026-07-10, the game's maker's tuning) — a light electromechanical clack for GARAGE vehicle
  // selection (plays when the player switches vehicle and the deck light changes). Broadband noise
  // CONTACT CLICK (its bandpass BYPASSED for a fuller tick), a detuned-triangle metallic RING, and
  // a slow-swelling low TOCK for physical weight; bus makeup ×2. Pasted in from his lab export.
  'WORLD — RELAY CLANK': {
    name: 'Relay clank', project: 'rmrf', group: 'WORLD', kind: 'mech', dur: 0.2,
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
  },
};
