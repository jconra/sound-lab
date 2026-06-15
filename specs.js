// specs.js — the node palette definition for the Sound Lab modular synth.
//
// Pure data: each node type's controls, which params accept CV, its I/O kind, plus the
// defaults for a freshly-added node. Shared by the editor (editor3d.js) and anything else
// that needs to know the shape of a node. The synthesis itself lives in patch.js.

const r = (min, max, step, log) => ({ min, max, step, log });   // log:true → knob/slider map exponentially (good for wide Hz spans)
const seg = (...options) => ({ options });
const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];
const FILT = ['lowpass', 'bandpass', 'highpass'];

// out: 'audio' | 'cv' | null(sink) ; hasIn: accepts an audio input ; cv: param plugs
export const NODE_SPECS = {
  osc:    { title: 'OSC',    cat: 'osc',    hasIn: false, out: 'audio',
            params: [['wave', seg(...WAVES)], ['voices', r(1, 2, 1)], ['freq', r(0.1, 4000, 0.1)], ['freqMod', r(-4000, 4000, 1)], ['detune', r(0, 40, 0.5)], ['level', r(0, 2, 0.01)]],
            cv: ['freq', 'detune', 'level'] },
  noise:  { title: 'NOISE',  cat: 'noise',  hasIn: false, out: 'audio',
            params: [['freq', r(0.1, 600, 0.1, true)], ['steps', r(1, 256, 1)], ['rate', r(0.25, 2, 0.01)], ['level', r(0, 2, 0.01)], ['loopLen', r(0.4, 2.5, 0.05)]],
            cv: ['rate', 'level'] },
  filter: { title: 'FILTER', cat: 'filter', hasIn: true,  out: 'audio',
            params: [['ftype', seg(...FILT)], ['freq', r(20, 12000, 10)], ['freqPeak', r(20, 12000, 10)], ['freqEnd', r(20, 12000, 10)], ['attack', r(0, 1, 0.005)], ['glide', r(0, 2, 0.01)], ['dur', r(0, 3, 0.01)], ['Q', r(0.1, 16, 0.1)]], cv: ['freq', 'Q'] },
  gain:   { title: 'GAIN',   cat: 'gain',   hasIn: true,  out: 'audio',
            params: [['gain', r(0, 2, 0.01)]], cv: ['gain'] },
  shaper: { title: 'SHAPER', cat: 'shaper', hasIn: true,  out: 'audio',
            params: [['grit', r(0, 1, 0.01)]], cv: [] },
  delay:  { title: 'DELAY',  cat: 'delay',  hasIn: true,  out: 'audio',   // echo: dry passes through, wet repeats fed back through a delay line
            params: [['time', r(0.001, 1.5, 0.001)], ['feedback', r(0, 0.95, 0.01)], ['tone', r(200, 12000, 10, true)], ['wet', r(0, 1.5, 0.01)]], cv: ['time', 'feedback', 'tone', 'wet'] },
  env:    { title: 'ENV',    cat: 'cv',     hasIn: false, out: 'cv',   // ADSR. sustain 0 = one-shot (auto-stops); sustain>0 = held until STOP
            params: [['delay', r(0, 3, 0.01)], ['peak', r(0, 2.5, 0.01)], ['attack', r(0, 2, 0.005)], ['decay', r(0.002, 2, 0.002)], ['sustain', r(0, 1, 0.01)], ['release', r(0.002, 3, 0.002)], ['attackCurve', seg('exp', 'lin')]], cv: [] },
  value:  { title: 'VALUE',  cat: 'cv',     hasIn: false, out: 'cv',
            params: [['delay', r(0, 3, 0.01)], ['value', r(0, 4, 0.01)]], cv: ['value'] },
  math:   { title: 'MULT',   cat: 'cv',     hasIn: true,  out: 'cv',   // CV utility: scales the signal at its input by `mul` (out = in × mul)
            params: [['mul', r(-4000, 4000, 0.1)]], cv: ['mul'] },
  send:   { title: 'REVERB', cat: 'reverb', hasIn: true,  out: null,
            params: [['gain', r(0, 1, 0.01)]], cv: [] },
  out:    { title: 'OUT',    cat: 'master', hasIn: true,  out: null,
            params: [['gain', r(0, 1, 0.01)]], cv: [] },
};

// one-line explanations for each param. Look up with helpFor(type, key) — type-specific
// entries ("type:key") win over the generic ones (freq/gain mean different things per node).
export const HELP = {
  wave: 'Waveform shape of the oscillator.',
  voices: '1 or 2 detuned oscillators (2 = fatter).',
  glide: 'Time for the filter to glide to freqEnd (seconds).',
  detune: 'Detune between the two voices (cents).',
  level: 'Output level — volume as audio, or depth when wired into a param.',
  delay: 'Wait this long after FIRE before this node triggers (seconds).',
  steps: 'Random slots per cycle. 1 = sample-&-hold, 24–32 = motor; crank freq×steps past ~48k (e.g. 600×256) for full white hiss.',
  rate: 'Playback speed / pitch (×). Wire CV here to rev it.',
  loopLen: 'Stepped-noise loop length (seconds).',
  ftype: 'Filter type: lowpass · bandpass · highpass.',
  freqPeak: 'Peak cutoff for a 3-point filter sweep (Hz).',
  freqEnd: 'Cutoff the filter sweeps to (Hz).',
  attack: 'Time to ramp up to peak (seconds).',
  decay: 'Time to fall from peak down to the sustain level (seconds).',
  sustain: 'Level held while playing, as a fraction of peak. 0 = one-shot.',
  release: 'Fade-out time after STOP / note-off (seconds).',
  attackCurve: 'Shape of the attack ramp: exp or lin.',
  peak: 'Height the envelope reaches, in the target’s units (a gain above 1 boosts).',
  grit: 'Waveshaper saturation / distortion amount.',
  Q: 'Filter resonance (emphasis at the cutoff).',
  dur: 'How long this node’s sweep runs (seconds).',
  value: 'Constant level sent to whatever it’s wired to (adds onto that param).',
  'math:mul': 'Multiplier. Output = input × mul. Wire a CV (ENV/LFO/VALUE) into the input, then fan the output out at different scales — e.g. ×1 into noise.rate AND ×800 into osc.freq from the same source. Negative inverts the signal.',
  // type-specific overrides
  'osc:freq': 'Base pitch in Hz. Wire an ENV (or LFO) into this plug and set freqMod for the sweep depth.',
  'osc:freqMod': 'Pitch-sweep depth: Hz added per unit of CV wired into the freq plug. With a one-shot ENV + tiny attack, positive values give a high→base drop (classic kick/tom). Negative dips below base. 0 = no sweep.',
  'filter:freq': 'Cutoff frequency (Hz).',
  'noise:freq': 'Step frequency (Hz). freq × steps = fresh values/sec; past ~48k it becomes white hiss.',
  'gain:gain': 'VCA level. 0 = shut — wire an ENV for a one-shot, or turn it up for a steady level.',
  'out:gain': 'Master output volume.',
  'send:gain': 'How much signal is sent to the reverb.',
  'delay:time': 'Echo spacing in seconds — the gap between repeats.',
  'delay:feedback': 'How much of the echo feeds back in: higher = more repeats with a longer tail (capped at 0.95 so it can’t run away).',
  'delay:tone': 'Damping: a lowpass on the feedback so each repeat gets darker (tape-echo feel). Lower Hz = murkier echoes; high = bright/digital.',
  'delay:wet': 'Echo (wet) volume mixed on top of the dry signal. 0 = no echo.',
};
export const helpFor = (type, key) => HELP[`${type}:${key}`] || HELP[key] || '';

export const DEFAULTS = {
  osc: { wave: 'sawtooth', freq: 220, freqMod: 0, level: 1 },
  noise: { rate: 1, level: 1, freq: 600, steps: 256, loopLen: 1.2 },   // defaults to white hiss (freq×steps ≫ sample rate)
  filter: { ftype: 'lowpass', freq: 1200, Q: 1 },
  gain: { gain: 0.8 },
  shaper: { grit: 0.3 },
  delay: { time: 0.3, feedback: 0.4, tone: 4000, wet: 0.5 },
  env: { peak: 1, attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.3, attackCurve: 'exp', delay: 0 },
  value: { value: 1, delay: 0 },
  math: { mul: 1 },
  send: { gain: 0.3 },
  out: { gain: 1 },
};
