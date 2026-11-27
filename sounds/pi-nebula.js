// sounds/pi-nebula.js — Pi Nebula's sounds: the station's techno music (MUSIC), the ships' engines (SHIPS), the jump and
// the chime for a right answer (EFFECTS).
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
  // WARM: a sine for the floor and a saw at the same note, low-passed so only its first handful of overtones is left:
  // round and soft, but heard. (It was a sine with a quiet triangle an octave up: as loud as the other basses on a
  // meter and almost nothing on a speaker, since nearly all of it sat under 150 Hz. The game's maker, 2026-11-24: "the
  // warm bass is really quite. you can barely hear it ... Compared to the other bass sounds". Measured alone, a note at
  // C2 and at G1: everything above 150 Hz was 11 to 20 dB under the other basses'; it is now among them, -27 to -28 dB.)
  'TECHNO — WARM BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'Warm bass', kind: 'bass', dur: 1.5, nodes: [
    { id: 'b-osc', type: 'osc', name: 'body', wave: 'sine', freq: 65.406, level: 1 },
    { id: 'b-saw', type: 'osc', name: 'warmth', wave: 'sawtooth', freq: 65.406, level: 1.4 },
    { id: 'b-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 560, Q: 0.7 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'amp', peak: 1, attack: 0.012, decay: 0.1, sustain: 0.85, release: 0.12 },
    { id: 'out', type: 'out', name: 'output', gain: 0.17 },
  ], cables: [
    { from: 'b-osc', to: 'b-g' }, { from: 'b-saw', to: 'b-f' }, { from: 'b-f', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' },
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

  // FM LADDER: the plucked bass of slap house, made the way an FM synth makes it. The game's maker, 2026-11-24, of a
  // bass he likes: "some FM ladder thing where there is a chain of FM", with the video's transcript that builds it.
  // Its recipe, step for step:
  //   - FOUR SINE OPERATORS IN A CHAIN, each bending the next one's phase: C (8 times the note) into D (the note) into
  //     E (4 times the note) into F (the note); only F is heard. The video sets each bend to "30": taken here as 1.2
  //     radians, a guess (its synth's scale is not written down anywhere I found).
  //   - THE FADES: F and E share one plucked shape (down to a low hold, a little release); D and C share another, a
  //     sharp start and then the rest falling away, played right through whatever the note's length (two fades added
  //     together: snap + tail).
  //   - A SECOND COPY THROUGH A LOW-PASS that opens at the start of the note and closes again, added to the plain one.
  //   - EVERY OPERATOR A HAIR OFF ITS WHOLE NUMBER (detune, cents), so the tone moves a little as it rings.
  //   - SATURATION, and two pushes as an EQ would make them: the note's own pitch (body) and a high band (bite).
  //   Not done: louder notes brighter (its "velocity"); the lab's sequencer gives a note only a level.
  // HOW THE ENGINE DOES A PHASE BEND: its oscillators take a cable on their pitch, not their phase; a phase bend is a
  // pitch bend by the bender's rate of change, and a bandpass filter far below its own pitch gives exactly that. So
  // between two operators: the bender, its fade, that filter ("to phase"), then the next one's pitch plug. HOW HARD it
  // bends (radians) = the next operator's freqMod / 3669: 4401 is 1.2. Measured against the same four-operator ladder
  // worked out by plain arithmetic: every harmonic within 1.9 dB (most within 1); a held note sits 2 cents under its
  // pitch, which is F's own detune (~/pw/space-math/rigs/fmbass-1). THE KNOBS: the three freqMods (brightness), the
  // fades, the second copy's low-pass (freqPeak), body amount, bite amount, saturation (grit).
  'TECHNO — FM LADDER BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'FM ladder bass', kind: 'bass', dur: 0.45, nodes: [
    { id: 'c', type: 'osc', name: 'C x8', wave: 'sine', freq: 523.248, detune: 3, level: 1 },
    { id: 'c-e', type: 'env', name: 'C snap', peak: 0.6, attack: 0.001, decay: 0.045, sustain: 0 },
    { id: 'c-t', type: 'env', name: 'C tail', peak: 0.4, attack: 0.001, decay: 0.3, sustain: 0 },
    { id: 'c-v', type: 'gain', name: 'C amount', gain: 0 },
    { id: 'c-d', type: 'filter', name: 'C to phase', ftype: 'bandpass', freq: 5000, Q: 0.7071 },
    { id: 'd', type: 'osc', name: 'D x1', wave: 'sine', freq: 65.406, detune: -2, freqMod: 4401, level: 1 },
    { id: 'd-e', type: 'env', name: 'D snap', peak: 0.6, attack: 0.001, decay: 0.045, sustain: 0 },
    { id: 'd-t', type: 'env', name: 'D tail', peak: 0.4, attack: 0.001, decay: 0.3, sustain: 0 },
    { id: 'd-v', type: 'gain', name: 'D amount', gain: 0 },
    { id: 'd-d', type: 'filter', name: 'D to phase', ftype: 'bandpass', freq: 5000, Q: 0.7071 },
    { id: 'e', type: 'osc', name: 'E x4', wave: 'sine', freq: 261.624, detune: 3, freqMod: 4401, level: 1 },
    { id: 'e-e', type: 'env', name: 'E pluck', peak: 1, attack: 0.002, decay: 0.25, sustain: 0.3, release: 0.1 },
    { id: 'e-v', type: 'gain', name: 'E amount', gain: 0 },
    { id: 'e-d', type: 'filter', name: 'E to phase', ftype: 'bandpass', freq: 5000, Q: 0.7071 },
    { id: 'f', type: 'osc', name: 'F (heard)', wave: 'sine', freq: 65.406, detune: -2, freqMod: 4401, level: 1 },
    { id: 'f-e', type: 'env', name: 'F pluck', peak: 1, attack: 0.002, decay: 0.25, sustain: 0.3, release: 0.1 },
    { id: 'f-v', type: 'gain', name: 'F level', gain: 0 },
    { id: 'z', type: 'filter', name: 'second copy, filtered', ftype: 'lowpass', freq: 140, freqPeak: 2400, attack: 0.006, freqEnd: 140, dur: 0.3, Q: 0.8 },
    { id: 'mix', type: 'gain', name: 'both copies', gain: 0.13 },
    { id: 'body-f', type: 'filter', name: 'body', ftype: 'bandpass', freq: 65.406, Q: 1.5 },
    { id: 'body-g', type: 'gain', name: 'body amount', gain: 0.5 },
    { id: 'bite-f', type: 'filter', name: 'bite', ftype: 'bandpass', freq: 2600, Q: 1.5 },
    { id: 'bite-g', type: 'gain', name: 'bite amount', gain: 0.4 },
    { id: 'sat', type: 'shaper', name: 'saturation', grit: 0.3 },
    { id: 'hp', type: 'filter', name: 'no rumble', ftype: 'highpass', freq: 20, Q: 0.7071 },
    { id: 'out', type: 'out', name: 'output', gain: 1.6 },
  ], cables: [
    { from: 'c', to: 'c-v' }, { from: 'c-e', to: 'c-v', port: 'gain' }, { from: 'c-t', to: 'c-v', port: 'gain' }, { from: 'c-v', to: 'c-d' },
    { from: 'c-d', to: 'd', port: 'freq' }, { from: 'd', to: 'd-v' }, { from: 'd-e', to: 'd-v', port: 'gain' }, { from: 'd-t', to: 'd-v', port: 'gain' },
    { from: 'd-v', to: 'd-d' }, { from: 'd-d', to: 'e', port: 'freq' }, { from: 'e', to: 'e-v' }, { from: 'e-e', to: 'e-v', port: 'gain' },
    { from: 'e-v', to: 'e-d' }, { from: 'e-d', to: 'f', port: 'freq' }, { from: 'f', to: 'f-v' }, { from: 'f-e', to: 'f-v', port: 'gain' },
    { from: 'f-v', to: 'mix' }, { from: 'f-v', to: 'z' }, { from: 'z', to: 'mix' }, { from: 'mix', to: 'sat' },
    { from: 'mix', to: 'body-f' }, { from: 'body-f', to: 'body-g' }, { from: 'body-g', to: 'sat' }, { from: 'mix', to: 'bite-f' },
    { from: 'bite-f', to: 'bite-g' }, { from: 'bite-g', to: 'sat' }, { from: 'sat', to: 'hp' }, { from: 'hp', to: 'out' },
  ] },
  // ACID: a square wave through a low-pass that rings (a lot of resonance) and squelches open on each note, as the
  // little silver bass machines of acid house do. Its experiment: how far each note's squelch opens is a stepped
  // random value (a noise at one step every half second, as a sample-and-hold) into the MULT that scales the sweep, so
  // no two notes in a row squelch the same. Grit before the fade. Most of it sits above 150 Hz, where a small speaker
  // plays it, not only under it. Its notes are the FM ladder's (short, round the beat, some an octave up).
  'TECHNO — ACID BASS': { group: 'MUSIC', project: 'pi-nebula', name: 'Acid bass', kind: 'bass', dur: 0.5, nodes: [
    { id: 'a-osc', type: 'osc', name: 'square', wave: 'square', freq: 65.406, level: 1 },
    { id: 'a-f', type: 'filter', name: 'squelch', ftype: 'lowpass', freq: 300, Q: 8 },
    { id: 'a-fe', type: 'env', name: 'squelch fade', peak: 1, attack: 0.003, decay: 0.2, sustain: 0 },
    { id: 'a-rnd', type: 'noise', name: 'random', freq: 2, steps: 1, rate: 1, level: 450, loopLen: 4 },
    { id: 'a-mul', type: 'math', name: 'how far', mul: 950 },
    { id: 'a-g', type: 'gain', name: 'vca' },
    { id: 'a-e', type: 'env', name: 'amp', peak: 1, attack: 0.004, decay: 0.12, sustain: 0.6, release: 0.06 },
    { id: 'a-sat', type: 'shaper', name: 'grit', grit: 0.2 },
    { id: 'out', type: 'out', name: 'output', gain: 1.15 },
  ], cables: [
    { from: 'a-osc', to: 'a-f' }, { from: 'a-fe', to: 'a-mul' }, { from: 'a-rnd', to: 'a-mul', port: 'mul' }, { from: 'a-mul', to: 'a-f', port: 'freq' },
    { from: 'a-f', to: 'a-sat' }, { from: 'a-sat', to: 'a-g' }, { from: 'a-e', to: 'a-g', port: 'gain' }, { from: 'a-g', to: 'out' },
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
  // GLASS: two FM operators in a chain (the FM ladder's way, its long comment above): a sine at three times the note
  // bending the phase of a sine at the note, which is heard. How hard it bends follows the note's own fade (each chord
  // brightens as it swells in) plus a slow sine (the LFO, a few seconds round) that sways it between nearly plain and
  // glassy while the chord holds. Lean for a pad: three oscillators and one envelope a note. A low-pass takes the top
  // off. Bend at its fullest: about 1.5 radians. (Its "to phase" band-pass is at 2500 Hz, not the bass's 5000: written at
  // C4 with a bender up to 3.5 times the note, and moved up two octaves, it must stay under the top of what a sound can
  // carry. Here a bend of 1 radian is a freqMod of 1784.)
  'TECHNO — GLASS PAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Glass pad', kind: 'instrument', dur: 4, nodes: [
    { id: 'm', type: 'osc', name: 'bender x3', wave: 'sine', freq: 784.89, detune: 4, level: 1 },
    { id: 'm-lfo', type: 'osc', name: 'slow sway', wave: 'sine', freq: 0.23, level: 0.45 },
    { id: 'm-v', type: 'gain', name: 'bend amount', gain: 0 },
    { id: 'm-d', name: 'to phase', type: 'filter', ftype: 'bandpass', freq: 2500, Q: 0.7071 },
    { id: 'p', type: 'osc', name: 'heard x1', wave: 'sine', freq: 261.63, freqMod: 1873, level: 1 },
    { id: 'p-g', type: 'gain', name: 'vca' },
    { id: 'p-e', type: 'env', name: 'amp', peak: 1, attack: 0.6, decay: 0.4, sustain: 0.8, release: 1 },
    { id: 'p-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 2200, Q: 0.6 },
    { id: 'send', type: 'send', name: 'room', gain: 0.3 },
    { id: 'out', type: 'out', name: 'output', gain: 0.098 },
  ], cables: [
    { from: 'm', to: 'm-v' }, { from: 'p-e', to: 'm-v', port: 'gain' }, { from: 'm-lfo', to: 'm-v', port: 'gain' }, { from: 'm-v', to: 'm-d' },
    { from: 'm-d', to: 'p', port: 'freq' }, { from: 'p', to: 'p-g' }, { from: 'p-e', to: 'p-g', port: 'gain' }, { from: 'p-g', to: 'p-f' },
    { from: 'p-f', to: 'out' }, { from: 'p-f', to: 'send' },
  ] },
  // DRIFT: a choir's "ooh" (the wave table PhonemeOoh, cut to its first 11 harmonics), two of it a little apart,
  // through a low-pass with some resonance whose cutoff wanders at random: a stepped random value (a noise at one step
  // every 0.8 s, a sample-and-hold) smoothed by a very low low-pass so it glides rather than jumps, into the cutoff
  // through a MULT. The "ooh" opens and closes a little on its own, never the same twice in a row.
  'TECHNO — DRIFT PAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Drift pad', kind: 'instrument', dur: 4, nodes: [
    { id: 'd-osc', type: 'osc', name: 'ooh', wave: 'custom', waveName: 'PhonemeOoh', harm: { real: [0, -0.37087, 0.28828, -0.45489, 0.06156, 0.04943, -0.01292, 0.12955, -0.04169, -0.01259, -0.00632, 0.00813], imag: [0, 0.04654, 0.25693, 0.01937, -0.4962, 0.01605, -0.06362, 0.02134, -0.00787, -0.02046, 0.00991, 0.00316] }, voices: 2, detune: 7, freq: 261.63, level: 1 },
    { id: 'd-f', type: 'filter', name: 'mouth', ftype: 'lowpass', freq: 1000, Q: 2.2 },
    { id: 'd-rnd', type: 'noise', name: 'wander', freq: 1.25, steps: 1, rate: 1, level: 1, loopLen: 8 },
    { id: 'd-sm', type: 'filter', name: 'glide', ftype: 'lowpass', freq: 3, Q: 0.5 },
    { id: 'd-mul', type: 'math', name: 'x550', mul: 550 },
    { id: 'd-g', type: 'gain', name: 'vca' },
    { id: 'd-e', type: 'env', name: 'amp', peak: 1, attack: 0.8, decay: 0.4, sustain: 0.85, release: 1.1 },
    { id: 'send', type: 'send', name: 'room', gain: 0.35 },
    { id: 'out', type: 'out', name: 'output', gain: 0.112 },
  ], cables: [
    { from: 'd-osc', to: 'd-f' }, { from: 'd-rnd', to: 'd-sm' }, { from: 'd-sm', to: 'd-mul' }, { from: 'd-mul', to: 'd-f', port: 'freq' },
    { from: 'd-f', to: 'd-g' }, { from: 'd-e', to: 'd-g', port: 'gain' }, { from: 'd-g', to: 'out' }, { from: 'd-g', to: 'send' },
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
  // FM HORN: three FM operators in a chain (the FM ladder's way): A at twice the note bends B at the note, B bends C
  // at the note, which is heard. One swell (its own envelope) sets how hard both bend: up fast at the start of the
  // note and settling lower, the brassy "bwah" FM synths make a horn with. Bends at their fullest: A into B 0.6
  // radians, B into C 1.8 (band-passes at 2500 Hz, as the glass pad's).
  'TECHNO — FM HORN': { group: 'MUSIC', project: 'pi-nebula', name: 'FM horn', kind: 'instrument', dur: 1.5, nodes: [
    { id: 'a', type: 'osc', name: 'A x2', wave: 'sine', freq: 523.26, detune: 3, level: 1 },
    { id: 'a-v', type: 'gain', name: 'A amount', gain: 0 },
    { id: 'a-d', name: 'A to phase', type: 'filter', ftype: 'bandpass', freq: 2500, Q: 0.7071 },
    { id: 'b', type: 'osc', name: 'B x1', wave: 'sine', freq: 261.63, detune: -3, freqMod: 1070, level: 1 },
    { id: 'b-v', type: 'gain', name: 'B amount', gain: 0 },
    { id: 'b-d', name: 'B to phase', type: 'filter', ftype: 'bandpass', freq: 2500, Q: 0.7071 },
    { id: 'sw', type: 'env', name: 'swell', peak: 1, attack: 0.05, decay: 0.3, sustain: 0.55, release: 0.15 },
    { id: 'c', type: 'osc', name: 'C (heard)', wave: 'sine', freq: 261.63, freqMod: 3211, level: 1 },
    { id: 'c-g', type: 'gain', name: 'vca' },
    { id: 'c-e', type: 'env', name: 'amp', peak: 1, attack: 0.03, decay: 0.2, sustain: 0.8, release: 0.15 },
    { id: 'c-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 3000, Q: 0.6 },
    { id: 'send', type: 'send', name: 'room', gain: 0.22 },
    { id: 'out', type: 'out', name: 'output', gain: 0.16 },
  ], cables: [
    { from: 'a', to: 'a-v' }, { from: 'sw', to: 'a-v', port: 'gain' }, { from: 'a-v', to: 'a-d' }, { from: 'a-d', to: 'b', port: 'freq' },
    { from: 'b', to: 'b-v' }, { from: 'sw', to: 'b-v', port: 'gain' }, { from: 'b-v', to: 'b-d' }, { from: 'b-d', to: 'c', port: 'freq' },
    { from: 'c', to: 'c-g' }, { from: 'c-e', to: 'c-g', port: 'gain' }, { from: 'c-g', to: 'c-f' }, { from: 'c-f', to: 'out' },
    { from: 'c-f', to: 'send' },
  ] },
  // RING: ring modulation. A triangle at the note goes through a VCA whose gain plug gets a sine at twice the note on
  // top of a steady level, so the two multiply: the triangle's own harmonics, and new ones either side of each, all
  // still on the note's harmonics (it stays in tune). How much of the sine gets in is swept by a slow sine (an LFO,
  // about three seconds round), so the tone sways between plain and a hollow, bell-like buzz.
  'TECHNO — RING LEAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Ring lead', kind: 'instrument', dur: 1.5, nodes: [
    { id: 'r-osc', type: 'osc', name: 'triangle', wave: 'triangle', freq: 261.63, level: 1 },
    { id: 'r-mod', type: 'osc', name: 'ring x2', wave: 'sine', freq: 523.26, level: 1 },
    { id: 'r-lfo', type: 'osc', name: 'slow sway', wave: 'sine', freq: 0.35, level: 0.35 },
    { id: 'r-dep', type: 'gain', name: 'ring depth', gain: 0.4 },
    { id: 'r-ring', type: 'gain', name: 'ring', gain: 0.6 },
    { id: 'r-f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 2600, Q: 0.7 },
    { id: 'r-g', type: 'gain', name: 'vca' },
    { id: 'r-e', type: 'env', name: 'amp', peak: 1, attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.15 },
    { id: 'send', type: 'send', name: 'room', gain: 0.22 },
    { id: 'out', type: 'out', name: 'output', gain: 0.21 },
  ], cables: [
    { from: 'r-mod', to: 'r-dep' }, { from: 'r-lfo', to: 'r-dep', port: 'gain' }, { from: 'r-dep', to: 'r-ring', port: 'gain' }, { from: 'r-osc', to: 'r-ring' },
    { from: 'r-ring', to: 'r-f' }, { from: 'r-f', to: 'r-g' }, { from: 'r-e', to: 'r-g', port: 'gain' }, { from: 'r-g', to: 'out' },
    { from: 'r-g', to: 'send' },
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
  // CRYSTAL: an FM bell, three operators in a chain (the FM ladder's way): A at the note bends B at three and a half
  // times the note, B bends C at the note, which is heard. Three and a half is not a whole number, so the bends add
  // partials between the note's harmonics: a bell or a glass struck, not a string. The bends die away fast after the
  // strike (their own envelope) and the bell rings on nearly plain. Bends at the strike: A into B 0.5 radians, B into
  // C 1.0 (band-passes at 2500 Hz, as the glass pad's). It plays the echo's few notes a bar.
  'TECHNO — CRYSTAL': { group: 'MUSIC', project: 'pi-nebula', name: 'Crystal', kind: 'instrument', dur: 1.6, nodes: [
    { id: 'a', type: 'osc', name: 'A x1', wave: 'sine', freq: 261.63, detune: 4, level: 1 },
    { id: 'a-v', type: 'gain', name: 'A amount', gain: 0 },
    { id: 'a-d', name: 'A to phase', type: 'filter', ftype: 'bandpass', freq: 2500, Q: 0.7071 },
    { id: 'b', type: 'osc', name: 'B x3.5', wave: 'sine', freq: 915.71, freqMod: 892, level: 1 },
    { id: 'b-v', type: 'gain', name: 'B amount', gain: 0 },
    { id: 'b-d', name: 'B to phase', type: 'filter', ftype: 'bandpass', freq: 2500, Q: 0.7071 },
    { id: 'st', type: 'env', name: 'strike', peak: 1, attack: 0.004, decay: 0.35, sustain: 0 },
    { id: 'c', type: 'osc', name: 'C (heard)', wave: 'sine', freq: 261.63, freqMod: 1784, level: 1 },
    { id: 'c-g', type: 'gain', name: 'vca' },
    { id: 'c-e', type: 'env', name: 'ring', peak: 1, attack: 0.004, decay: 1, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.35 },
    { id: 'out', type: 'out', name: 'output', gain: 0.26 },
  ], cables: [
    { from: 'a', to: 'a-v' }, { from: 'st', to: 'a-v', port: 'gain' }, { from: 'a-v', to: 'a-d' }, { from: 'a-d', to: 'b', port: 'freq' },
    { from: 'b', to: 'b-v' }, { from: 'st', to: 'b-v', port: 'gain' }, { from: 'b-v', to: 'b-d' }, { from: 'b-d', to: 'c', port: 'freq' },
    { from: 'c', to: 'c-g' }, { from: 'c-e', to: 'c-g', port: 'gain' }, { from: 'c-g', to: 'out' }, { from: 'c-g', to: 'send' },
  ] },
  // BLIPS: a short square-wave pluck through a ringing low-pass whose cutoff jumps about at random: a stepped random
  // value (a noise at one step every 1/14 s, a sample-and-hold) into the cutoff through a MULT, each step eased over a
  // few thousandths of a second (a low-pass on the steps) so the jumps never click. A little computer chattering in
  // tune: every blip a different colour. It plays the arp's notes.
  'TECHNO — BLIPS': { group: 'MUSIC', project: 'pi-nebula', name: 'Blips', kind: 'instrument', dur: 0.6, nodes: [
    { id: 'b-osc', type: 'osc', name: 'square', wave: 'square', freq: 261.63, level: 1 },
    { id: 'b-f', type: 'filter', name: 'ringing', ftype: 'lowpass', freq: 900, Q: 4 },
    { id: 'b-rnd', type: 'noise', name: 'random', freq: 14, steps: 1, rate: 1, level: 1, loopLen: 2 },
    { id: 'b-sm', type: 'filter', name: 'ease', ftype: 'lowpass', freq: 60, Q: 0.5 },
    { id: 'b-mul', type: 'math', name: 'x400', mul: 400 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'amp', peak: 1, attack: 0.003, decay: 0.16, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.24 },
  ], cables: [
    { from: 'b-osc', to: 'b-f' }, { from: 'b-rnd', to: 'b-sm' }, { from: 'b-sm', to: 'b-mul' }, { from: 'b-mul', to: 'b-f', port: 'freq' },
    { from: 'b-f', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' }, { from: 'b-g', to: 'send' },
  ] },
  // ── random waves (the game's Random button on the Pads, Lead and Melody rows) ───────────────────────────────────
  // The game's maker, 2026-11-24: "I wonder if there could be a random button for the leads, pads, and melody that
  // give you some variation ... I always liked hearing random custom periodic waves". Each of these is a lean patch
  // round one custom-wave oscillator; here it carries an ordinary table of its own (so it plays as it is), and in the
  // game each press of Random puts a new table of overtones in its place (pi-nebula/src/music/patches.js waveTable),
  // its level trimmed to this one's. So tune the shape here (the swell, the hold, the pluck, the level), not the wave.
  // RANDOM PAD: two voices of the wave a little apart, swelling in and holding: the pad's shape (a note is 2
  // oscillators and 1 envelope; a chord is three or four notes). Its table: a soft saw, the first 12 overtones.
  'TECHNO — RANDOM PAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Random pad', kind: 'instrument', dur: 4, nodes: [
    { id: 'r-osc', type: 'osc', name: 'wave', wave: 'custom', waveName: 'Soft saw (12)', harm: { real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], imag: [0, 1, 0.5, 0.33333, 0.25, 0.2, 0.16667, 0.13578, 0.10147, 0.06792, 0.03887, 0.01711, 0.00413] }, voices: 2, detune: 7, freq: 261.63, level: 1 },
    { id: 'r-g', type: 'gain', name: 'vca' },
    { id: 'r-e', type: 'env', name: 'amp', peak: 1, attack: 0.6, decay: 0.3, sustain: 0.85, release: 1 },
    { id: 'send', type: 'send', name: 'room', gain: 0.3 },
    { id: 'out', type: 'out', name: 'output', gain: 0.09 },
  ], cables: [
    { from: 'r-osc', to: 'r-g' }, { from: 'r-e', to: 'r-g', port: 'gain' }, { from: 'r-g', to: 'out' }, { from: 'r-g', to: 'send' },
  ] },
  // RANDOM LEAD: two voices of the wave a little apart, held as long as the note: the lead's shape. Its table: a soft
  // saw, the first 6 overtones.
  'TECHNO — RANDOM LEAD': { group: 'MUSIC', project: 'pi-nebula', name: 'Random lead', kind: 'instrument', dur: 1.5, nodes: [
    { id: 'r-osc', type: 'osc', name: 'wave', wave: 'custom', waveName: 'Soft saw (6)', harm: { real: [0, 0, 0, 0, 0, 0, 0], imag: [0, 1, 0.5, 0.33333, 0.21339, 0.1, 0.02441] }, voices: 2, detune: 6, freq: 261.63, level: 1 },
    { id: 'r-g', type: 'gain', name: 'vca' },
    { id: 'r-e', type: 'env', name: 'amp', peak: 1, attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.15 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.135 },
  ], cables: [
    { from: 'r-osc', to: 'r-g' }, { from: 'r-e', to: 'r-g', port: 'gain' }, { from: 'r-g', to: 'out' }, { from: 'r-g', to: 'send' },
  ] },
  // RANDOM MELODY: one voice of the wave, plucked (a quick start and a short fall, nothing held): the melody's shape.
  // Its table: a soft square (the odd overtones), the first 6.
  'TECHNO — RANDOM MELODY': { group: 'MUSIC', project: 'pi-nebula', name: 'Random melody', kind: 'instrument', dur: 0.6, nodes: [
    { id: 'r-osc', type: 'osc', name: 'wave', wave: 'custom', waveName: 'Soft square (6)', harm: { real: [0, 0, 0, 0, 0, 0, 0], imag: [0, 1, 0, 0.33333, 0, 0.1, 0] }, freq: 261.63, level: 1 },
    { id: 'r-g', type: 'gain', name: 'vca' },
    { id: 'r-e', type: 'env', name: 'amp', peak: 1, attack: 0.004, decay: 0.28, sustain: 0 },
    { id: 'send', type: 'send', name: 'room', gain: 0.25 },
    { id: 'out', type: 'out', name: 'output', gain: 0.2 },
  ], cables: [
    { from: 'r-osc', to: 'r-g' }, { from: 'r-e', to: 'r-g', port: 'gain' }, { from: 'r-g', to: 'out' }, { from: 'r-g', to: 'send' },
  ] },
  // ════════════════════════════════════════════════════════════════════════════════
  //  PI NEBULA — THE SHIPS' ENGINES (2026-11-27). The game's maker: "For engine noises. We could use something
  //  that sounds like the lurcher engine (but maybe softer)". Each take is a copy of RMRF's 'LURCHER — ENGINE'
  //  (sounds/rmrf.js), changed, so tuning one never changes the other. Its shape is kept: ONE number, RPMs (0 idle
  //  .. 1 full), that the pitch, the pulse and the brightness all follow; the game moves only that number
  //  (handle.setValue('rpm', v)). No envelope: an engine drones until the game stops it. The five takes are at the
  //  same loudness at a middle RPMs (0.4), half the Lurcher's (-6 dB); they differ in what "softer" leans on:
  //    A  the Lurcher's own sound, only quieter
  //    B  rounder: a triangle wave in place of the square, the tone filter lower (the buzz taken off)
  //    C  a gentler, slower throb: the pulse about half as quick, and it never drops out (0.3 to 0.9, where the
  //       Lurcher's chops right through)
  //  A, B and C are nearly all below 300 Hz, lower than a phone's own speaker plays. So:
  //    D  the Lurcher's sound made quieter but brighter and buzzier: its tone filter opened (900 -> 1600 Hz) and its
  //       lowest hum thinned (a highpass at 140 Hz), so its upper tones carry it on a phone's speaker; less soft in tone
  //       than A (the middle of its sound about 290 Hz at idle against A's 95), the Lurcher's deep chop through it
  //    E  between A and D: the tone filter opened only as far as a phone needs (500 -> 900 Hz), the lowest hum thinned
  //       a little (a highpass at 120 Hz), and C's shallower chop (it never drops out): a hum with some body that a
  //       phone can play (the middle of its sound about 190 Hz at idle)
  // ════════════════════════════════════════════════════════════════════════════════
  'SHIP — ENGINE A': { group: 'SHIPS', project: 'pi-nebula', name: 'Engine A (quieter)', kind: 'engine', dur: 3, nodes: [
    { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0 },
    { id: 'osc', type: 'osc', name: 'servo', wave: 'square', freq: 70, freqMod: 1, voices: 2, detune: 6 },
    { id: 'am', type: 'gain', name: 'pulse', gain: 0.4 },
    { id: 'lfo', type: 'osc', name: 'pulse', wave: 'sine', freq: 20.5, freqMod: 1, level: 0.6 },
    { id: 'f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 300, Q: 1 },
    { id: 'g', type: 'gain', name: 'servo', gain: 0.36 },
    { id: 'r-pit', type: 'math', name: 'rev→pitch', mul: 80 },     // 70→150 Hz
    { id: 'r-am', type: 'math', name: 'rev→pulse', mul: 26.5 },    // 20.5→47 a second
    { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 300 },   // 300→600 Hz
    { id: 'out', type: 'out', name: 'output', gain: 0.425 },
  ], cables: [
    { from: 'rpm', to: 'r-pit' }, { from: 'r-pit', to: 'osc', port: 'freq' },
    { from: 'rpm', to: 'r-am' }, { from: 'r-am', to: 'lfo', port: 'freq' },
    { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'f', port: 'freq' },
    { from: 'osc', to: 'am' }, { from: 'lfo', to: 'am', port: 'gain' }, { from: 'am', to: 'f' }, { from: 'f', to: 'g' }, { from: 'g', to: 'out' },
  ] },
  'SHIP — ENGINE B': { group: 'SHIPS', project: 'pi-nebula', name: 'Engine B (rounder)', kind: 'engine', dur: 3, nodes: [
    { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0 },
    { id: 'osc', type: 'osc', name: 'servo', wave: 'triangle', freq: 70, freqMod: 1, voices: 2, detune: 6 },
    { id: 'am', type: 'gain', name: 'pulse', gain: 0.4 },
    { id: 'lfo', type: 'osc', name: 'pulse', wave: 'sine', freq: 20.5, freqMod: 1, level: 0.6 },
    { id: 'f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 240, Q: 0.7 },
    { id: 'g', type: 'gain', name: 'servo', gain: 0.36 },
    { id: 'r-pit', type: 'math', name: 'rev→pitch', mul: 80 },     // 70→150 Hz
    { id: 'r-am', type: 'math', name: 'rev→pulse', mul: 26.5 },    // 20.5→47 a second
    { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 200 },   // 240→440 Hz
    { id: 'out', type: 'out', name: 'output', gain: 0.595 },
  ], cables: [
    { from: 'rpm', to: 'r-pit' }, { from: 'r-pit', to: 'osc', port: 'freq' },
    { from: 'rpm', to: 'r-am' }, { from: 'r-am', to: 'lfo', port: 'freq' },
    { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'f', port: 'freq' },
    { from: 'osc', to: 'am' }, { from: 'lfo', to: 'am', port: 'gain' }, { from: 'am', to: 'f' }, { from: 'f', to: 'g' }, { from: 'g', to: 'out' },
  ] },
  'SHIP — ENGINE C': { group: 'SHIPS', project: 'pi-nebula', name: 'Engine C (gentler, slower throb)', kind: 'engine', dur: 3, nodes: [
    { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0 },
    { id: 'osc', type: 'osc', name: 'servo', wave: 'square', freq: 70, freqMod: 1, voices: 2, detune: 6 },
    { id: 'am', type: 'gain', name: 'pulse', gain: 0.6 },
    { id: 'lfo', type: 'osc', name: 'pulse', wave: 'sine', freq: 10, freqMod: 1, level: 0.3 },
    { id: 'f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 300, Q: 1 },
    { id: 'g', type: 'gain', name: 'servo', gain: 0.36 },
    { id: 'r-pit', type: 'math', name: 'rev→pitch', mul: 80 },     // 70→150 Hz
    { id: 'r-am', type: 'math', name: 'rev→pulse', mul: 13 },      // 10→23 a second
    { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 300 },   // 300→600 Hz
    { id: 'out', type: 'out', name: 'output', gain: 0.39 },
  ], cables: [
    { from: 'rpm', to: 'r-pit' }, { from: 'r-pit', to: 'osc', port: 'freq' },
    { from: 'rpm', to: 'r-am' }, { from: 'r-am', to: 'lfo', port: 'freq' },
    { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'f', port: 'freq' },
    { from: 'osc', to: 'am' }, { from: 'lfo', to: 'am', port: 'gain' }, { from: 'am', to: 'f' }, { from: 'f', to: 'g' }, { from: 'g', to: 'out' },
  ] },

  'SHIP — ENGINE D': { group: 'SHIPS', project: 'pi-nebula', name: 'Engine D (brighter, for a phone)', kind: 'engine', dur: 3, nodes: [
    { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0 },
    { id: 'osc', type: 'osc', name: 'servo', wave: 'square', freq: 70, freqMod: 1, voices: 2, detune: 6 },
    { id: 'am', type: 'gain', name: 'pulse', gain: 0.4 },
    { id: 'lfo', type: 'osc', name: 'pulse', wave: 'sine', freq: 20.5, freqMod: 1, level: 0.6 },
    { id: 'f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 900, Q: 0.8 },
    { id: 'hp', type: 'filter', name: 'thin', ftype: 'highpass', freq: 140, Q: 0.7 },
    { id: 'g', type: 'gain', name: 'servo', gain: 0.36 },
    { id: 'r-pit', type: 'math', name: 'rev→pitch', mul: 80 },     // 70→150 Hz
    { id: 'r-am', type: 'math', name: 'rev→pulse', mul: 26.5 },    // 20.5→47 a second
    { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 700 },   // 900→1600 Hz
    { id: 'out', type: 'out', name: 'output', gain: 0.555 },
  ], cables: [
    { from: 'rpm', to: 'r-pit' }, { from: 'r-pit', to: 'osc', port: 'freq' },
    { from: 'rpm', to: 'r-am' }, { from: 'r-am', to: 'lfo', port: 'freq' },
    { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'f', port: 'freq' },
    { from: 'osc', to: 'am' }, { from: 'lfo', to: 'am', port: 'gain' }, { from: 'am', to: 'f' }, { from: 'f', to: 'hp' }, { from: 'hp', to: 'g' }, { from: 'g', to: 'out' },
  ] },

  'SHIP — ENGINE E': { group: 'SHIPS', project: 'pi-nebula', name: 'Engine E (softer, for a phone)', kind: 'engine', dur: 3, nodes: [
    { id: 'rpm', type: 'value', name: 'RPMs', value: 0, delay: 0 },
    { id: 'osc', type: 'osc', name: 'servo', wave: 'square', freq: 70, freqMod: 1, voices: 2, detune: 6 },
    { id: 'am', type: 'gain', name: 'pulse', gain: 0.6 },
    { id: 'lfo', type: 'osc', name: 'pulse', wave: 'sine', freq: 20.5, freqMod: 1, level: 0.3 },
    { id: 'f', type: 'filter', name: 'tone', ftype: 'lowpass', freq: 500, Q: 0.7 },
    { id: 'hp', type: 'filter', name: 'thin', ftype: 'highpass', freq: 120, Q: 0.7 },
    { id: 'g', type: 'gain', name: 'servo', gain: 0.36 },
    { id: 'r-pit', type: 'math', name: 'rev→pitch', mul: 80 },     // 70→150 Hz
    { id: 'r-am', type: 'math', name: 'rev→pulse', mul: 26.5 },    // 20.5→47 a second
    { id: 'r-cut', type: 'math', name: 'rev→bright', mul: 400 },   // 500→900 Hz
    { id: 'out', type: 'out', name: 'output', gain: 0.441 },
  ], cables: [
    { from: 'rpm', to: 'r-pit' }, { from: 'r-pit', to: 'osc', port: 'freq' },
    { from: 'rpm', to: 'r-am' }, { from: 'r-am', to: 'lfo', port: 'freq' },
    { from: 'rpm', to: 'r-cut' }, { from: 'r-cut', to: 'f', port: 'freq' },
    { from: 'osc', to: 'am' }, { from: 'lfo', to: 'am', port: 'gain' }, { from: 'am', to: 'f' }, { from: 'f', to: 'hp' }, { from: 'hp', to: 'g' }, { from: 'g', to: 'out' },
  ] },

  // ════════════════════════════════════════════════════════════════════════════════
  //  PI NEBULA — THE JUMP AND THE CHIME (2026-11-27)
  //  THE JUMP is the wormhole's own four moments (the game's src/wormplan.js JUMP): the tear opens (0.9 s) and comes
  //  over the ship (0.65 s): TEAR, 1.55 s, a crack (noise) and a rising rush; the colours all round, for as long as
  //  the place ahead takes to be made (0.9 s at least): TUNNEL, a rush that drones until the game stops it; the far
  //  end opens (1.0 s): OPEN, the rush falling away and a soft thump (noise) as the place is there.
  //  THE CHIME, for a right answer: short and bright, two takes.
  // ════════════════════════════════════════════════════════════════════════════════
  'JUMP — TEAR': { group: 'EFFECTS', project: 'pi-nebula', name: 'Jump: the tear', kind: 'perc', dur: 1.6, nodes: [
    { id: 'c-nz', type: 'noise', name: 'crack', freq: 600, steps: 256, rate: 1, level: 1 },
    { id: 'c-f', type: 'filter', name: 'crack', ftype: 'bandpass', freq: 1600, Q: 0.8 },
    { id: 'c-g', type: 'gain', name: 'vca' },
    { id: 'c-e', type: 'env', name: 'crack', peak: 1, attack: 0.001, decay: 0.09, sustain: 0 },
    { id: 'w-nz', type: 'noise', name: 'rush', freq: 600, steps: 256, rate: 1, level: 1 },
    { id: 'w-f', type: 'filter', name: 'rush', ftype: 'bandpass', freq: 260, freqEnd: 2200, glide: 1.55, Q: 1.2 },
    { id: 'w-g', type: 'gain', name: 'vca' },
    { id: 'w-e', type: 'env', name: 'rush', peak: 0.9, attack: 1.55, decay: 0.12, sustain: 0 },
    { id: 'h-osc', type: 'osc', name: 'swell', wave: 'sine', freq: 48, freqMod: 50 },
    { id: 'h-p', type: 'env', name: 'swell pitch', peak: 1, attack: 1.55, decay: 0.1, sustain: 0, attackCurve: 'lin' },
    { id: 'h-g', type: 'gain', name: 'vca' },
    { id: 'h-e', type: 'env', name: 'swell', peak: 0.5, attack: 1.45, decay: 0.2, sustain: 0 },
    { id: 'out', type: 'out', name: 'output', gain: 0.5 },
  ], cables: [
    { from: 'c-nz', to: 'c-f' }, { from: 'c-f', to: 'c-g' }, { from: 'c-e', to: 'c-g', port: 'gain' }, { from: 'c-g', to: 'out' },
    { from: 'w-nz', to: 'w-f' }, { from: 'w-f', to: 'w-g' }, { from: 'w-e', to: 'w-g', port: 'gain' }, { from: 'w-g', to: 'out' },
    { from: 'h-p', to: 'h-osc', port: 'freq' }, { from: 'h-osc', to: 'h-g' }, { from: 'h-e', to: 'h-g', port: 'gain' }, { from: 'h-g', to: 'out' },
  ] },
  'JUMP — TUNNEL': { group: 'EFFECTS', project: 'pi-nebula', name: 'Jump: the colours', kind: 'engine', dur: 3, nodes: [
    { id: 'w-nz', type: 'noise', name: 'rush', freq: 600, steps: 256, rate: 1, level: 1 },
    { id: 'w-f', type: 'filter', name: 'rush', ftype: 'bandpass', freq: 1100, Q: 0.9 },
    { id: 'w-lfo', type: 'osc', name: 'swirl', wave: 'sine', freq: 0.45, level: 500 },
    { id: 'w-g', type: 'gain', name: 'rush', gain: 0.32 },
    { id: 'h-osc', type: 'osc', name: 'hum', wave: 'sine', freq: 98, voices: 2, detune: 9 },
    { id: 'h-am', type: 'gain', name: 'hum', gain: 0.22 },
    { id: 'h-lfo', type: 'osc', name: 'hum throb', wave: 'sine', freq: 0.9, level: 0.08 },
    { id: 'out', type: 'out', name: 'output', gain: 0.3 },
  ], cables: [
    { from: 'w-nz', to: 'w-f' }, { from: 'w-lfo', to: 'w-f', port: 'freq' }, { from: 'w-f', to: 'w-g' }, { from: 'w-g', to: 'out' },
    { from: 'h-osc', to: 'h-am' }, { from: 'h-lfo', to: 'h-am', port: 'gain' }, { from: 'h-am', to: 'out' },
  ] },
  'JUMP — OPEN': { group: 'EFFECTS', project: 'pi-nebula', name: 'Jump: the far end opens', kind: 'perc', dur: 1.2, nodes: [
    { id: 'w-nz', type: 'noise', name: 'rush', freq: 600, steps: 256, rate: 1, level: 1 },
    { id: 'w-f', type: 'filter', name: 'rush', ftype: 'bandpass', freq: 2000, freqEnd: 240, glide: 1.0, Q: 1.1 },
    { id: 'w-g', type: 'gain', name: 'vca' },
    { id: 'w-e', type: 'env', name: 'rush', peak: 0.8, attack: 0.04, decay: 1.0, sustain: 0 },
    { id: 't-nz', type: 'noise', name: 'thump', freq: 600, steps: 256, rate: 1, level: 1 },
    { id: 't-f', type: 'filter', name: 'thump', ftype: 'lowpass', freq: 180, Q: 0.8 },
    { id: 't-g', type: 'gain', name: 'vca' },
    { id: 't-e', type: 'env', name: 'thump', peak: 1.6, attack: 0.003, decay: 0.28, sustain: 0, delay: 0.85 },
    { id: 'out', type: 'out', name: 'output', gain: 0.5 },
  ], cables: [
    { from: 'w-nz', to: 'w-f' }, { from: 'w-f', to: 'w-g' }, { from: 'w-e', to: 'w-g', port: 'gain' }, { from: 'w-g', to: 'out' },
    { from: 't-nz', to: 't-f' }, { from: 't-f', to: 't-g' }, { from: 't-e', to: 't-g', port: 'gain' }, { from: 't-g', to: 'out' },
  ] },
  // CHIME A: two notes going up, C6 then G6 a tenth of a second later (triangle waves: bright, not glassy)
  'CHIME — RIGHT A': { group: 'EFFECTS', project: 'pi-nebula', name: 'Chime A (two notes up)', kind: 'perc', dur: 0.7, nodes: [
    { id: 'a-osc', type: 'osc', name: 'first', wave: 'triangle', freq: 1046.5 },
    { id: 'a-g', type: 'gain', name: 'vca' },
    { id: 'a-e', type: 'env', name: 'first', peak: 1, attack: 0.004, decay: 0.32, sustain: 0 },
    { id: 'b-osc', type: 'osc', name: 'second', wave: 'triangle', freq: 1568 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'second', peak: 1, attack: 0.004, decay: 0.45, sustain: 0, delay: 0.1 },
    { id: 'out', type: 'out', name: 'output', gain: 0.3 },
  ], cables: [
    { from: 'a-osc', to: 'a-g' }, { from: 'a-e', to: 'a-g', port: 'gain' }, { from: 'a-g', to: 'out' },
    { from: 'b-osc', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' },
  ] },
  // CHIME B: one bright ding, E6 with two quicker overtones over it (a small bell)
  'CHIME — RIGHT B': { group: 'EFFECTS', project: 'pi-nebula', name: 'Chime B (one ding)', kind: 'perc', dur: 0.8, nodes: [
    { id: 'a-osc', type: 'osc', name: 'note', wave: 'sine', freq: 1318.5 },
    { id: 'a-g', type: 'gain', name: 'vca' },
    { id: 'a-e', type: 'env', name: 'note', peak: 1, attack: 0.003, decay: 0.6, sustain: 0 },
    { id: 'b-osc', type: 'osc', name: 'octave', wave: 'sine', freq: 2637 },
    { id: 'b-g', type: 'gain', name: 'vca' },
    { id: 'b-e', type: 'env', name: 'octave', peak: 0.35, attack: 0.002, decay: 0.3, sustain: 0 },
    { id: 'c-osc', type: 'osc', name: 'shine', wave: 'sine', freq: 3955 },
    { id: 'c-g', type: 'gain', name: 'vca' },
    { id: 'c-e', type: 'env', name: 'shine', peak: 0.18, attack: 0.002, decay: 0.12, sustain: 0 },
    { id: 'out', type: 'out', name: 'output', gain: 0.35 },
  ], cables: [
    { from: 'a-osc', to: 'a-g' }, { from: 'a-e', to: 'a-g', port: 'gain' }, { from: 'a-g', to: 'out' },
    { from: 'b-osc', to: 'b-g' }, { from: 'b-e', to: 'b-g', port: 'gain' }, { from: 'b-g', to: 'out' },
    { from: 'c-osc', to: 'c-g' }, { from: 'c-e', to: 'c-g', port: 'gain' }, { from: 'c-g', to: 'out' },
  ] },
  // ── end of PI NEBULA ──
};
