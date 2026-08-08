// seq.js — the Sound Lab's step sequencer, and the songs written with it.
//
// The lab already knows how to make ONE sound: a patch is a node graph, playPatch() fires it once.
// Music is that, many times, at scheduled instants and different pitches — so nothing here teaches
// the synth about notes. A note is a transposed copy of a patch (voicePatch in patch.js) handed to
// the existing runtime with a start time. The sequencer's only real job is deciding WHEN.
//
// WHY A LOOKAHEAD SCHEDULER AND NOT A TIMER PER NOTE. setTimeout is at the mercy of the main
// thread: a garbage collection or a layout pass lands a note late, and late notes are the one
// musical error everybody hears instantly. Web Audio can place a note on an exact sample if you
// give it a time in the future, so the loop below runs often, looks a fraction of a second ahead,
// and schedules everything falling inside that window. The timer only has to be roughly on time;
// the audio clock does the part that has to be exact. Standard practice, and the reason this stays
// steady while the page is busy drawing the patch editor.
//
// THE COST, since this has to run under a game: one Web Audio voice per note, built and torn down
// by the same code that plays a gunshot. A busy bar is a dozen voices — cheaper than the gunfire
// already going on around it. The expensive part was noise-buffer generation per hit, which is why
// bNoise now keeps a small ring of pre-rolled buffers (see patch.js).

import { playPatch, voicePatch } from './patch.js';

// ════════════════════════════════════════════════════════════════════════════════
//  INSTRUMENTS
//  Patches authored to be PLAYED rather than fired once. Two rules make them work
//  as instruments: every pitched voice is authored at a known root (C3 = 130.81Hz,
//  so a note's semitone offset means what it says), and every sustaining voice is
//  gated by an env with sustain > 0 so the sequencer can set its length.
// ════════════════════════════════════════════════════════════════════════════════
const C3 = 130.81;

// BUGLE — the cavalry horn. A bugle has no valves: it can only play the harmonics of one tube,
// which is exactly why bugle calls sound like bugle calls. See BUGLE_HARMONICS below.
// Sawtooth pair, slightly detuned, through a lowpass that opens on the attack — that opening is
// what reads as "blown" rather than "switched on".
const BUGLE = {
  name: 'Bugle', dur: 1.2,
  nodes: [
    { id: 'o', type: 'osc', wave: 'sawtooth', voices: 2, detune: 7, freq: C3 * 4, level: 0.55 },
    { id: 'e', type: 'env', peak: 1, attack: 0.025, decay: 0.09, sustain: 0.85, release: 0.13 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 'f', type: 'filter', ftype: 'lowpass', freq: 900, freqPeak: 4200, freqEnd: 2100, attack: 0.06, dur: 0.5, Q: 2.2 },
    { id: 's', type: 'shaper', grit: 0.16 },
    { id: 'r', type: 'send', gain: 0.22 },
    { id: 'out', type: 'out', gain: 0.085 },
  ],
  cables: [
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 'f' }, { from: 'f', to: 's' },
    { from: 's', to: 'out' }, { from: 's', to: 'r' },
  ],
};

// HORN — a rounder, darker brass for harmony under the bugle. Same idea, less bite.
const HORN = {
  name: 'Horn', dur: 1.6,
  nodes: [
    { id: 'o', type: 'osc', wave: 'sawtooth', voices: 2, detune: 12, freq: C3 * 2, level: 0.42 },
    { id: 'e', type: 'env', peak: 1, attack: 0.07, decay: 0.15, sustain: 0.8, release: 0.25 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 'f', type: 'filter', ftype: 'lowpass', freq: 420, freqPeak: 1500, freqEnd: 900, attack: 0.12, dur: 0.7, Q: 1.4 },
    { id: 'r', type: 'send', gain: 0.3 },
    { id: 'out', type: 'out', gain: 0.055 },
  ],
  cables: [
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 'f' }, { from: 'f', to: 'out' }, { from: 'f', to: 'r' },
  ],
};

// BASS — square through a low filter. Short and firm; it marks the beat, it doesn't sing.
const BASS = {
  name: 'Bass', dur: 0.9,
  nodes: [
    { id: 'o', type: 'osc', wave: 'square', voices: 2, detune: 5, freq: C3 / 2, level: 0.5 },
    { id: 'e', type: 'env', peak: 1, attack: 0.006, decay: 0.11, sustain: 0.65, release: 0.09 },
    { id: 'v', type: 'gain', gain: 0 },
    // STATIC CUTOFF, deliberately — do not add freqEnd/freqPeak here without re-measuring.
    // An automated cutoff on this patch renders ~900x louder than a fixed one at the SAME
    // frequency: 0.13 peak static, 116 with `freqEnd: 190, glide: 0.25`. It is not the sweep
    // (freqEnd == freq still blows up), not resonance (Q 0.1 still blows up), and it is direction-
    // dependent (starting at 190 and rising to 300 is fine). Something in bFilter's automated
    // branch goes unstable for this combination and it has not been run to ground yet.
    { id: 'f', type: 'filter', ftype: 'lowpass', freq: 260, Q: 3.5 },
    { id: 'out', type: 'out', gain: 0.5 },
  ],
  cables: [
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 'f' }, { from: 'f', to: 'out' },
  ],
};

// SNARE — white noise, band-passed, with a very fast decay. The gallop is made of these.
// loopLen deliberately short: the buffer is generated per voice, so a long one is waste at
// sixteenth-note speed (see the ring cache note in patch.js).
const SNARE = {
  name: 'Snare', dur: 0.3,
  nodes: [
    { id: 'n', type: 'noise', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 'e', type: 'env', peak: 1, attack: 0.001, decay: 0.085, sustain: 0, release: 0.05 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 'f', type: 'filter', ftype: 'bandpass', freq: 1900, Q: 0.9 },
    { id: 'r', type: 'send', gain: 0.16 },
    { id: 'out', type: 'out', gain: 0.06 },
  ],
  cables: [
    { from: 'n', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 'f' }, { from: 'f', to: 'out' }, { from: 'f', to: 'r' },
  ],
};

// DRUM — a deep war drum. Sine with a pitch drop (env into the freq plug, scaled by freqMod),
// which is the whole trick behind every kick drum ever made.
const DRUM = {
  name: 'Drum', dur: 0.7,
  nodes: [
    { id: 'o', type: 'osc', wave: 'sine', freq: 52, freqMod: 90, level: 1 },
    { id: 'p', type: 'env', peak: 1, attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
    { id: 'e', type: 'env', peak: 1, attack: 0.002, decay: 0.34, sustain: 0, release: 0.05 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 'out', type: 'out', gain: 0.11 },
  ],
  cables: [
    { from: 'p', to: 'o', port: 'freq' },
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' }, { from: 'v', to: 'out' },
  ],
};

// PLUCK — a short triangle ping for the quiet patrol loop. Something to mark time without
// asking for attention.
const PLUCK = {
  name: 'Pluck', dur: 0.8,
  nodes: [
    { id: 'o', type: 'osc', wave: 'triangle', freq: C3 * 2, level: 0.6 },
    { id: 'e', type: 'env', peak: 1, attack: 0.004, decay: 0.3, sustain: 0, release: 0.1 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 'd', type: 'delay', time: 0.28, feedback: 0.35, tone: 2600, wet: 0.5 },
    { id: 'r', type: 'send', gain: 0.3 },
    { id: 'out', type: 'out', gain: 0.05 },
  ],
  cables: [
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 'd' }, { from: 'd', to: 'out' }, { from: 'd', to: 'r' },
  ],
};

// GUITAR — the Jotun. Sawtooth pair straight into heavy grit, then a lowpass to tame the fizz.
// Distortion is a WAVESHAPER, so it cares about level: drive it with a hot oscillator and pull the
// volume back at the out node, which is how a real amp gets its sound too.
const GUITAR = {
  name: 'Guitar', dur: 1.4,
  nodes: [
    { id: 'o', type: 'osc', wave: 'sawtooth', voices: 2, detune: 14, freq: C3, level: 1.6 },
    { id: 'e', type: 'env', peak: 1, attack: 0.004, decay: 0.09, sustain: 0.85, release: 0.12 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 's', type: 'shaper', grit: 0.82 },
    { id: 'f', type: 'filter', ftype: 'lowpass', freq: 2400, Q: 0.9 },
    { id: 'r', type: 'send', gain: 0.12 },
    { id: 'out', type: 'out', gain: 0.5 },
  ],
  cables: [
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 's' }, { from: 's', to: 'f' }, { from: 'f', to: 'out' }, { from: 'f', to: 'r' },
  ],
};

// LEAD — the Valkyrie. The soaring one: slow attack so it swells rather than starts, long release,
// and enough reverb to sound like it is a long way up.
const LEAD = {
  name: 'Lead', dur: 2.2,
  nodes: [
    { id: 'o', type: 'osc', wave: 'sawtooth', voices: 2, detune: 9, freq: C3 * 4, level: 0.7 },
    { id: 'e', type: 'env', peak: 1, attack: 0.09, decay: 0.2, sustain: 0.9, release: 0.42 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 's', type: 'shaper', grit: 0.3 },
    { id: 'f', type: 'filter', ftype: 'lowpass', freq: 3000, Q: 1.1 },
    { id: 'd', type: 'delay', time: 0.34, feedback: 0.3, tone: 3200, wet: 0.4 },
    { id: 'r', type: 'send', gain: 0.35 },
    { id: 'out', type: 'out', gain: 0.5 },
  ],
  cables: [
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 's' }, { from: 's', to: 'f' }, { from: 'f', to: 'd' },
    { from: 'd', to: 'out' }, { from: 'd', to: 'r' },
  ],
};

// ARP — the Lurcher. Short, bright, resonant: the sixteenth-note machine a techno line is built
// from. Deliberately plain so that repetition is the point rather than a problem.
const ARP = {
  name: 'Arp', dur: 0.5,
  nodes: [
    { id: 'o', type: 'osc', wave: 'square', voices: 1, freq: C3 * 2, level: 0.55 },
    { id: 'e', type: 'env', peak: 1, attack: 0.002, decay: 0.11, sustain: 0.25, release: 0.06 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 'f', type: 'filter', ftype: 'lowpass', freq: 1700, Q: 7 },
    { id: 'd', type: 'delay', time: 0.19, feedback: 0.28, tone: 4000, wet: 0.34 },
    { id: 'out', type: 'out', gain: 0.5 },
  ],
  cables: [
    { from: 'o', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 'f' }, { from: 'f', to: 'd' }, { from: 'd', to: 'out' },
  ],
};

// HAT — the offbeat tick that makes anything sound like it is moving. Noise, high, very short.
const HAT = {
  name: 'Hat', dur: 0.2,
  nodes: [
    { id: 'n', type: 'noise', freq: 600, steps: 256, rate: 1, level: 1, loopLen: 0.4 },
    { id: 'e', type: 'env', peak: 1, attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
    { id: 'v', type: 'gain', gain: 0 },
    { id: 'f', type: 'filter', ftype: 'highpass', freq: 6500, Q: 0.8 },
    { id: 'out', type: 'out', gain: 0.5 },
  ],
  cables: [
    { from: 'n', to: 'v' }, { from: 'e', to: 'v', port: 'gain' },
    { from: 'v', to: 'f' }, { from: 'f', to: 'out' },
  ],
};

export const INSTRUMENTS = { BUGLE, HORN, BASS, SNARE, DRUM, PLUCK, GUITAR, LEAD, ARP, HAT };

// ════════════════════════════════════════════════════════════════════════════════
//  THE BUGLE CONSTRAINT
//  A bugle has no valves. It plays the natural harmonics of a single length of tube
//  and NOTHING else — which is why every bugle call in history is built from these
//  few intervals, and why a melody that uses them sounds military before a single
//  drum arrives. The charge below is written entirely inside this set. It is the
//  cheapest authenticity available: not an instrument sound, a restriction.
// ════════════════════════════════════════════════════════════════════════════════
export const BUGLE_HARMONICS = [0, 7, 12, 16, 19, 24];   // root, 5th, octave, 10th, 12th, 2 octaves

// ════════════════════════════════════════════════════════════════════════════════
//  PARTS AND THE CHAIN
//  A song can be one block of bars — `tracks` — or it can be several named blocks in
//  `parts`, strung together by a `chain`. A chain entry that is an ARRAY is a POOL: one
//  of them is picked each time the chain reaches that slot, so the same song comes out
//  different every loop without anything being random enough to sound broken.
//
//      chain: ['A', ['B', 'C'], 'A', ['B', 'D', 'E']]
//
//  This is the cheap way to make a two-minute loop bearable for twenty minutes: the
//  skeleton never changes, so it stays recognisable as the vehicle's theme, while the
//  bars that fill it do. Pools avoid picking the same block twice running when they can.
//  A song with plain `tracks` still works and is treated as one part on a chain of one.
// ════════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════════
//  SONGS
//  { bpm, bars, beats, div, tracks: [{ inst, vol, notes: [[step, semi, len, vel]] }] }
//  step: 0-based, in units of 1/div beat. semi: semitones from the instrument's root.
//  len:  in steps. vel: 0..1.
//  loop:false plays once and stops — a sting, not a bed.
// ════════════════════════════════════════════════════════════════════════════════

// Sixteenths at 4/4: step 0 = beat 1, step 4 = beat 2, step 8 = beat 3, step 12 = beat 4.
export const SONGS = {

  // ── THE FLAG IS TAKEN ──────────────────────────────────────────────────────
  // Jacob's brief: Return Fire's cavalry-charge moment. Plays ONCE, over whatever else is
  // happening. Triplet pickup, a climb through the bugle's harmonics, and a held note at the top
  // with the gallop under it. Fast, short, and gone before it outstays its welcome.
  CHARGE: {
    name: 'CHARGE — the flag is taken', bpm: 168, bars: 2, beats: 4, div: 4, loop: false,
    tracks: [
      { inst: 'BUGLE', vol: 1.0, notes: [
        // pickup: three quick notes on the 5th, then up to the octave
        [0, 7, 1, 0.85], [1, 7, 1, 0.85], [2, 7, 1, 0.9], [3, 12, 3, 1.0],
        // the climb — 10th, 10th, 12th, held
        [6, 16, 1, 0.9], [7, 16, 1, 0.9], [8, 19, 4, 1.0],
        // answer, and land on the octave with everything behind it
        [12, 16, 1, 0.85], [13, 12, 1, 0.85], [14, 16, 2, 0.9],
        [16, 19, 6, 1.0], [22, 24, 10, 1.0],
      ] },
      { inst: 'HORN', vol: 0.9, notes: [
        [3, 0, 3, 0.7], [8, 4, 4, 0.7], [12, 0, 4, 0.7], [16, 7, 6, 0.8], [22, 0, 10, 0.85],
      ] },
      // the gallop: a triplet-feel canter under the whole thing
      { inst: 'SNARE', vol: 1.0, notes: [
        [0, 0, 1, 0.5], [2, 0, 1, 0.35], [3, 0, 1, 0.7],
        [4, 0, 1, 0.5], [6, 0, 1, 0.35], [7, 0, 1, 0.7],
        [8, 0, 1, 0.5], [10, 0, 1, 0.35], [11, 0, 1, 0.7],
        [12, 0, 1, 0.5], [14, 0, 1, 0.35], [15, 0, 1, 0.8],
        [16, 0, 1, 0.5], [18, 0, 1, 0.35], [19, 0, 1, 0.7],
        [20, 0, 1, 0.5], [22, 0, 1, 0.4], [23, 0, 1, 0.85],
        [24, 0, 1, 0.6], [26, 0, 1, 0.4], [27, 0, 1, 0.8], [28, 0, 1, 0.9],
      ] },
      { inst: 'DRUM', vol: 1.0, notes: [
        [0, 0, 1, 0.9], [3, 0, 1, 0.6], [8, 0, 1, 0.9], [12, 0, 1, 0.7],
        [16, 0, 1, 1.0], [22, 0, 1, 0.9], [28, 0, 1, 1.0],
      ] },
      { inst: 'BASS', vol: 1.0, notes: [
        [0, 0, 3, 0.8], [8, 4, 3, 0.8], [12, 5, 3, 0.8], [16, 7, 5, 0.85], [22, 0, 10, 0.9],
      ] },
    ],
  },

  // ── PATROL ─────────────────────────────────────────────────────────────────
  // The bed for an ordinary minute of the match: nothing has happened yet. Sparse, minor, slow
  // enough to sit under gunfire without competing with it. Four bars so it doesn't announce its
  // own loop point every eight seconds.
  PATROL: {
    name: 'PATROL — the quiet bed', bpm: 84, bars: 4, beats: 4, div: 4, loop: true,
    tracks: [
      { inst: 'BASS', vol: 0.85, notes: [
        [0, 0, 6, 0.6], [8, 0, 4, 0.45],
        [16, -2, 6, 0.6], [24, -2, 4, 0.45],
        [32, -5, 6, 0.6], [40, -5, 4, 0.45],
        [48, -3, 8, 0.6], [56, 0, 6, 0.5],
      ] },
      { inst: 'PLUCK', vol: 0.7, notes: [
        [4, 12, 2, 0.4], [10, 15, 2, 0.3], [20, 12, 2, 0.4], [26, 10, 2, 0.3],
        [36, 7, 2, 0.4], [42, 10, 2, 0.3], [52, 12, 2, 0.45], [58, 15, 2, 0.35],
      ] },
      { inst: 'DRUM', vol: 0.6, notes: [
        [0, 0, 1, 0.5], [16, 0, 1, 0.45], [32, 0, 1, 0.5], [48, 0, 1, 0.45], [56, 0, 1, 0.3],
      ] },
    ],
  },

  // ── SIEGE ──────────────────────────────────────────────────────────────────
  // Someone is being taken apart. Driving, low, and repetitive on purpose — it should raise the
  // pulse without ever becoming the thing you are listening to.
  SIEGE: {
    name: 'SIEGE — the pressure is on', bpm: 132, bars: 2, beats: 4, div: 4, loop: true,
    tracks: [
      { inst: 'BASS', vol: 1.0, notes: [
        [0, 0, 2, 0.8], [3, 0, 1, 0.6], [6, 0, 2, 0.7], [10, 3, 2, 0.7], [14, 0, 2, 0.6],
        [16, 0, 2, 0.8], [19, 0, 1, 0.6], [22, 0, 2, 0.7], [26, -2, 2, 0.7], [30, -4, 2, 0.75],
      ] },
      { inst: 'HORN', vol: 0.8, notes: [
        [0, 12, 3, 0.55], [8, 15, 3, 0.5], [16, 12, 3, 0.55], [26, 10, 5, 0.6],
      ] },
      { inst: 'DRUM', vol: 1.0, notes: [
        [0, 0, 1, 0.95], [6, 0, 1, 0.6], [8, 0, 1, 0.8], [14, 0, 1, 0.55],
        [16, 0, 1, 0.95], [22, 0, 1, 0.6], [24, 0, 1, 0.8], [30, 0, 1, 0.7],
      ] },
      { inst: 'SNARE', vol: 0.8, notes: [
        [4, 0, 1, 0.7], [12, 0, 1, 0.7], [20, 0, 1, 0.7], [28, 0, 1, 0.7], [31, 0, 1, 0.5],
      ] },
    ],
  },
};

// ── VEHICLE THEMES ───────────────────────────────────────────────────────────
// One per chassis, the way Return Fire gave each machine its own piece. The point is that you
// know what just rolled out of the lift without looking at it.
const T = (inst, vol, notes) => ({ inst, vol, notes });

// LURCHER — sci-fi techno. Six legs, a machine that never stops moving. Four-on-the-floor with an
// offbeat hat and a hypnotic minor arp; the parts swap the arp figure and drop the floor out.
SONGS.LURCHER = {
  name: 'LURCHER — sci-fi techno', bpm: 138, bars: 1, beats: 4, div: 4, loop: true,
  chain: ['A', 'B', ['A', 'C'], 'B', ['C', 'D'], 'B'],
  parts: {
    A: { tracks: [
      T('DRUM', 1.0, [[0,0,1,0.95],[4,0,1,0.9],[8,0,1,0.95],[12,0,1,0.9]]),
      T('HAT', 0.7, [[2,0,1,0.5],[6,0,1,0.45],[10,0,1,0.5],[14,0,1,0.55]]),
      T('ARP', 0.9, [[0,0,1,0.8],[1,12,1,0.5],[2,7,1,0.6],[3,12,1,0.45],
                     [4,3,1,0.8],[5,12,1,0.5],[6,7,1,0.6],[7,12,1,0.45],
                     [8,0,1,0.8],[9,12,1,0.5],[10,7,1,0.6],[11,12,1,0.45],
                     [12,-2,1,0.8],[13,10,1,0.5],[14,5,1,0.6],[15,10,1,0.45]]),
    ] },
    B: { tracks: [
      T('DRUM', 1.0, [[0,0,1,0.95],[4,0,1,0.9],[8,0,1,0.95],[12,0,1,0.9]]),
      T('HAT', 0.7, [[2,0,1,0.5],[6,0,1,0.45],[10,0,1,0.5],[14,0,1,0.55]]),
      T('BASS', 1.0, [[0,0,2,0.85],[3,0,1,0.6],[6,0,2,0.7],[8,0,2,0.85],[11,3,1,0.6],[14,-2,2,0.7]]),
      T('ARP', 0.9, [[0,0,1,0.8],[1,12,1,0.5],[2,7,1,0.6],[3,12,1,0.45],
                     [4,3,1,0.8],[5,12,1,0.5],[6,7,1,0.6],[7,12,1,0.45],
                     [8,0,1,0.8],[9,12,1,0.5],[10,7,1,0.6],[11,12,1,0.45],
                     [12,-2,1,0.8],[13,10,1,0.5],[14,5,1,0.6],[15,10,1,0.45]]),
    ] },
    C: { tracks: [   // the arp jumps an octave — same figure, new altitude
      T('DRUM', 1.0, [[0,0,1,0.95],[4,0,1,0.9],[8,0,1,0.95],[12,0,1,0.9]]),
      T('HAT', 0.7, [[2,0,1,0.5],[6,0,1,0.5],[10,0,1,0.5],[14,0,1,0.6],[15,0,1,0.4]]),
      T('BASS', 1.0, [[0,0,2,0.85],[6,0,2,0.7],[8,-4,2,0.85],[14,-2,2,0.7]]),
      T('ARP', 0.9, [[0,12,1,0.8],[1,24,1,0.5],[2,19,1,0.6],[3,24,1,0.45],
                     [4,15,1,0.8],[5,24,1,0.5],[6,19,1,0.6],[7,24,1,0.45],
                     [8,12,1,0.8],[9,19,1,0.55],[10,15,1,0.6],[11,19,1,0.45],
                     [12,10,1,0.8],[13,17,1,0.5],[14,15,1,0.6],[15,12,1,0.5]]),
    ] },
    D: { tracks: [   // floor drops out; just the machine ticking over
      T('HAT', 0.7, [[2,0,1,0.4],[6,0,1,0.4],[10,0,1,0.4],[14,0,1,0.5]]),
      T('ARP', 0.9, [[0,0,1,0.65],[2,7,1,0.5],[4,3,1,0.65],[6,7,1,0.5],
                     [8,0,1,0.65],[10,7,1,0.5],[12,-2,1,0.7],[14,5,1,0.55]]),
    ] },
  },
};

// VALKYRIE — the anthem. Slow chords underneath, a lead that swells instead of starting, and a
// key lift in the last part so it keeps climbing. Two bars a part.
SONGS.VALKYRIE = {
  name: 'VALKYRIE — the anthem', bpm: 124, bars: 2, beats: 4, div: 4, loop: true,
  chain: ['A', 'B', ['B', 'C'], 'C'],
  parts: {
    A: { tracks: [
      T('DRUM', 1.0, [[0,0,1,0.95],[8,0,1,0.7],[16,0,1,0.95],[22,0,1,0.7],[24,0,1,0.8]]),
      T('SNARE', 0.9, [[8,0,1,0.7],[24,0,1,0.7],[30,0,1,0.5],[31,0,1,0.6]]),
      T('GUITAR', 0.8, [[0,0,7,0.7],[8,7,7,0.65],[16,-4,7,0.7],[24,3,7,0.65]]),
      T('BASS', 1.0, [[0,0,4,0.8],[8,7,4,0.75],[16,-4,4,0.8],[24,3,4,0.75]]),
    ] },
    B: { tracks: [
      T('DRUM', 1.0, [[0,0,1,0.95],[8,0,1,0.7],[16,0,1,0.95],[22,0,1,0.7],[24,0,1,0.8]]),
      T('SNARE', 0.9, [[8,0,1,0.7],[24,0,1,0.7],[30,0,1,0.5],[31,0,1,0.6]]),
      T('GUITAR', 0.8, [[0,0,7,0.7],[8,7,7,0.65],[16,-4,7,0.7],[24,3,7,0.65]]),
      T('BASS', 1.0, [[0,0,4,0.8],[8,7,4,0.75],[16,-4,4,0.8],[24,3,4,0.75]]),
      T('LEAD', 1.0, [[0,12,6,0.8],[7,16,5,0.85],[14,19,8,0.9],[24,16,4,0.8],[28,12,4,0.8]]),
    ] },
    C: { tracks: [   // the lift: everything up a step, and the lead goes for the top
      T('DRUM', 1.0, [[0,0,1,1.0],[6,0,1,0.6],[8,0,1,0.75],[16,0,1,1.0],[22,0,1,0.7],[24,0,1,0.85]]),
      T('SNARE', 0.9, [[8,0,1,0.75],[24,0,1,0.75],[28,0,1,0.5],[30,0,1,0.6],[31,0,1,0.7]]),
      T('GUITAR', 0.8, [[0,2,7,0.75],[8,9,7,0.7],[16,-2,7,0.75],[24,5,7,0.7]]),
      T('BASS', 1.0, [[0,2,4,0.85],[8,9,4,0.8],[16,-2,4,0.85],[24,5,4,0.8]]),
      T('LEAD', 1.0, [[0,19,6,0.85],[7,21,5,0.85],[14,24,10,0.95],[26,21,3,0.8],[29,19,3,0.8]]),
    ] },
  },
};

// FIREBRAT — the cavalry. The scout that takes the flag and runs, so it gets the horses. Same
// bugle-harmonic rule as CHARGE (see BUGLE_HARMONICS) over a constant canter.
const GALLOP = [[0,0,1,0.5],[2,0,1,0.35],[3,0,1,0.7],[4,0,1,0.5],[6,0,1,0.35],[7,0,1,0.7],
                [8,0,1,0.5],[10,0,1,0.35],[11,0,1,0.7],[12,0,1,0.5],[14,0,1,0.4],[15,0,1,0.8],
                [16,0,1,0.5],[18,0,1,0.35],[19,0,1,0.7],[20,0,1,0.5],[22,0,1,0.35],[23,0,1,0.7],
                [24,0,1,0.5],[26,0,1,0.35],[27,0,1,0.7],[28,0,1,0.55],[30,0,1,0.4],[31,0,1,0.85]];
SONGS.FIREBRAT = {
  name: 'FIREBRAT — the cavalry', bpm: 164, bars: 2, beats: 4, div: 4, loop: true,
  chain: ['A', ['B', 'C'], 'A', ['C', 'B']],
  parts: {
    A: { tracks: [
      T('SNARE', 0.9, GALLOP),
      T('DRUM', 1.0, [[0,0,1,0.9],[8,0,1,0.7],[16,0,1,0.9],[24,0,1,0.7],[28,0,1,0.8]]),
      T('BUGLE', 1.0, [[0,7,2,0.85],[2,7,2,0.85],[4,12,4,0.95],[10,12,2,0.8],[12,7,4,0.85],
                       [16,12,2,0.85],[18,16,2,0.9],[20,19,6,0.95],[28,16,4,0.85]]),
      T('BASS', 0.9, [[0,0,4,0.75],[8,0,4,0.7],[16,5,4,0.75],[24,0,6,0.75]]),
    ] },
    B: { tracks: [
      T('SNARE', 0.9, GALLOP),
      T('DRUM', 1.0, [[0,0,1,0.9],[8,0,1,0.7],[16,0,1,0.9],[24,0,1,0.7]]),
      T('BUGLE', 1.0, [[0,19,3,0.9],[4,16,2,0.85],[6,12,2,0.8],[8,16,6,0.9],
                       [16,19,2,0.9],[18,24,6,1.0],[26,19,6,0.9]]),
      T('HORN', 0.9, [[0,0,7,0.6],[8,4,7,0.6],[16,7,7,0.65],[24,0,7,0.65]]),
      T('BASS', 0.9, [[0,0,4,0.75],[8,4,4,0.7],[16,7,4,0.75],[24,0,6,0.75]]),
    ] },
    C: { tracks: [   // the horn answers, the bugle sits out half of it
      T('SNARE', 0.9, GALLOP),
      T('DRUM', 1.0, [[0,0,1,0.9],[6,0,1,0.6],[16,0,1,0.9],[22,0,1,0.6],[28,0,1,0.85]]),
      T('HORN', 0.9, [[0,7,6,0.7],[8,4,6,0.65],[16,0,6,0.7],[24,7,7,0.7]]),
      T('BUGLE', 1.0, [[16,12,2,0.85],[18,12,2,0.85],[20,16,4,0.9],[26,19,6,0.95]]),
      T('BASS', 0.9, [[0,0,4,0.75],[8,-3,4,0.7],[16,-5,4,0.75],[24,0,6,0.8]]),
    ] },
  },
};

// JOTUN — rock, distorted, half-time. The heaviest thing on the island should sound like it.
// Power chords: root and fifth only, which is what distortion actually tolerates — thirds through
// heavy grit turn to mud, and that is why rock plays fifths.
SONGS.JOTUN = {
  name: 'JOTUN — rolling fortress', bpm: 92, bars: 2, beats: 4, div: 4, loop: true,
  chain: ['A', 'A', ['B', 'C'], 'A'],
  parts: {
    A: { tracks: [
      T('DRUM', 1.0, [[0,0,1,1.0],[7,0,1,0.6],[12,0,1,0.8],[16,0,1,1.0],[23,0,1,0.6],[28,0,1,0.85]]),
      T('SNARE', 0.9, [[8,0,1,0.85],[24,0,1,0.85],[30,0,1,0.6],[31,0,1,0.7]]),
      T('GUITAR', 1.0, [[0,0,3,0.9],[0,7,3,0.7],[4,0,2,0.8],[4,7,2,0.6],[7,3,3,0.85],[7,10,3,0.65],
                        [12,0,3,0.85],[12,7,3,0.65],
                        [16,0,3,0.9],[16,7,3,0.7],[20,0,2,0.8],[20,7,2,0.6],[23,-2,4,0.9],[23,5,4,0.7],
                        [28,-4,4,0.9],[28,3,4,0.7]]),
      T('BASS', 1.0, [[0,0,4,0.85],[7,3,4,0.8],[12,0,4,0.8],[16,0,4,0.85],[23,-2,4,0.8],[28,-4,4,0.85]]),
    ] },
    B: { tracks: [   // the riff climbs
      T('DRUM', 1.0, [[0,0,1,1.0],[6,0,1,0.65],[10,0,1,0.7],[16,0,1,1.0],[22,0,1,0.65],[26,0,1,0.8],[30,0,1,0.9]]),
      T('SNARE', 0.9, [[8,0,1,0.85],[24,0,1,0.85],[28,0,1,0.6],[31,0,1,0.75]]),
      T('GUITAR', 1.0, [[0,5,4,0.9],[0,12,4,0.7],[6,3,4,0.85],[6,10,4,0.65],[12,0,4,0.85],[12,7,4,0.65],
                        [16,5,4,0.9],[16,12,4,0.7],[22,7,4,0.9],[22,14,4,0.7],[28,8,4,0.95],[28,15,4,0.75]]),
      T('BASS', 1.0, [[0,5,5,0.85],[6,3,5,0.8],[12,0,4,0.8],[16,5,5,0.85],[22,7,5,0.85],[28,8,4,0.9]]),
    ] },
    C: { tracks: [   // breakdown: one chord, let it ring, and the drum does the work
      T('DRUM', 1.0, [[0,0,1,1.0],[8,0,1,0.9],[16,0,1,1.0],[20,0,1,0.7],[24,0,1,0.9],[28,0,1,0.8],[30,0,1,0.9]]),
      T('SNARE', 0.9, [[12,0,1,0.8],[28,0,1,0.85],[29,0,1,0.6],[30,0,1,0.7],[31,0,1,0.85]]),
      T('GUITAR', 1.0, [[0,0,8,0.95],[0,7,8,0.75],[16,-4,8,0.95],[16,3,8,0.75]]),
      T('BASS', 1.0, [[0,0,8,0.9],[16,-4,8,0.9]]),
    ] },
  },
};

// ════════════════════════════════════════════════════════════════════════════════
//  THE SEQUENCER
// ════════════════════════════════════════════════════════════════════════════════
const LOOKAHEAD = 0.14;    // s of audio scheduled in advance — the slack the timer gets to be late in
const TICK_MS = 25;        // how often the timer wakes up to top that window back up

export class Sequencer {
  constructor(ctx, dest, reverbInput) {
    this.ctx = ctx; this.dest = dest; this.reverb = reverbInput;
    this.song = null; this.playing = false;
    this.step = 0; this.nextTime = 0; this._timer = null;
    this.onStep = null;                       // UI hook: fires with the step index as it is SCHEDULED
    this.voices = [];
  }

  get totalSteps() { return this.song ? this.song.bars * this.song.beats * this.song.div : 0; }
  get stepDur() { return this.song ? 60 / this.song.bpm / this.song.div : 0.1; }

  setSong(song) {
    const wasPlaying = this.playing;
    this.stop();
    this.song = song;
    // ONE SHAPE INTERNALLY. A song is either named `parts` on a `chain`, or a single flat block of
    // `tracks` — normalise the second into the first here so nothing downstream has to ask which
    // kind it is dealing with. That is what keeps the older songs working untouched.
    this.parts = song ? (song.parts || { _: { tracks: song.tracks || [] } }) : {};
    this.chain = song ? (song.chain || Object.keys(this.parts)) : [];
    this.chainIdx = 0; this.partName = null;
    if (wasPlaying) this.start();
  }

  // Resolve one chain slot. An array is a POOL: pick from it, and avoid repeating the block we
  // just played when there is anything else to choose — back-to-back repeats are the one thing
  // that makes a shuffled arrangement sound broken rather than varied.
  _pickPart(slot, avoid) {
    if (!Array.isArray(slot)) return slot;
    const opts = slot.length > 1 ? slot.filter(s => s !== avoid) : slot;
    return opts[(Math.random() * opts.length) | 0];
  }

  get curTracks() {
    const p = this.parts[this.partName];
    return p ? p.tracks : [];
  }

  start() {
    if (!this.song || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.chainIdx = 0;
    this.partName = this._pickPart(this.chain[0], null);
    // A beat of air before the first note: the scheduler needs its window to already be in the
    // future, or the first bar is scheduled in the past and arrives late and crushed together.
    this.nextTime = this.ctx.currentTime + 0.08;
    this._timer = setInterval(() => this._pump(), TICK_MS);
    this._pump();
  }

  stop() {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    for (const v of this.voices) { try { v.stop(0.03); } catch (e) {} }
    this.voices = [];
  }

  _pump() {
    if (!this.playing) return;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this._scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
      if (this.step >= this.totalSteps) {
        // End of a block: walk the chain on and resolve the next slot. Looping wraps the chain,
        // so a pooled slot gets a fresh pick every time round — that is the variation.
        this.chainIdx++;
        const more = this.chainIdx < this.chain.length;
        if (more || this.song.loop) {
          if (!more) this.chainIdx = 0;
          this.partName = this._pickPart(this.chain[this.chainIdx], this.partName);
          this.step = 0;
          if (this.onPart) this.onPart(this.partName, this.nextTime);
        } else {
          // A one-shot sting: let the tail ring out, then take the transport down.
          const endsAt = this.nextTime;
          this.playing = false;
          clearInterval(this._timer); this._timer = null;
          setTimeout(() => { if (!this.playing) this.stop(); if (this.onEnd) this.onEnd(); },
                     Math.max(0, (endsAt - this.ctx.currentTime) * 1000) + 2200);
          return;
        }
      }
    }
    // Voices tear themselves down (patchAutoStopTime); just stop tracking the finished ones so
    // the list can't grow without bound over a long loop.
    if (this.voices.length > 64) this.voices.splice(0, this.voices.length - 64);
  }

  // Schedule an ENTIRE song up front, with no timer involved at all. Two uses:
  //   • an offline render (an OfflineAudioContext runs faster than real time, so a lookahead loop
  //     driven by wall-clock timers never fires — the render finishes first);
  //   • one-shot stings in the game. A two-bar sting is only a few dozen notes, and handing them
  //     all to the audio clock at once means a busy frame cannot make the charge stumble.
  // Not for loops: those would have to schedule forever.
  scheduleAll(at = null) {
    if (!this.song) return 0;
    const t0 = at != null ? at : this.ctx.currentTime + 0.05;
    let n = 0, t = t0, prev = null;
    // Walk the chain ONCE. A looping song has no end, so this renders one pass through the
    // arrangement — which is what an offline render or a one-shot sting wants.
    for (let c = 0; c < this.chain.length; c++) {
      this.partName = this._pickPart(this.chain[c], prev); prev = this.partName;
      for (let s = 0; s < this.totalSteps; s++) n += this._scheduleStep(s, t + s * this.stepDur, true);
      t += this.totalSteps * this.stepDur;
    }
    return n;
  }

  _scheduleStep(step, when, silentUI = false) {
    let fired = 0;
    if (this.onStep && !silentUI) this.onStep(step, when);
    for (const tr of this.curTracks) {
      const inst = INSTRUMENTS[tr.inst];
      if (!inst || tr.mute) continue;
      for (const n of tr.notes) {
        if (n[0] !== step) continue;
        const [, semi, lenSteps, vel] = n;
        const p = voicePatch(inst, {
          semi,
          gain: (vel ?? 1) * (tr.vol ?? 1),
          len: Math.max(0.05, (lenSteps ?? 1) * this.stepDur),
        });
        try {
          this.voices.push(playPatch(this.ctx, null, this.dest, this.reverb, p, null, { at: when }));
          fired++;
        } catch (e) { /* a bad note must never take the transport down */ }
      }
    }
    return fired;
  }
}
