# Sound Lab

The modular synth (index.html), and under `sequencer/` the earlier audio experiments that were the audio-sequencer app: a periodic-wave synth and sequencer, a Fourier-series wave builder, a drum machine and a random-waveform oscillator. All static, no build.

## Where things are

- `engine.js` — the patch engine (playPatch, voicePatch and the rest). No sounds in it.
- `sounds/` — every sound, as plain data (nodes and cables), one file per project: `rmrf.js`, `mathwood.js`, `pi-nebula.js`, and `shared.js` (the lab's own demos). Each patch says whose it is (`project`) and what it is (`group`: GUNS, ENGINES, MUSIC...).
- `patch.js` — puts the engine and all the sounds together for the lab's own pages. Nothing is written in it.
- `tools/sync.mjs` — makes a game's copy (below).

## Using the engine in a game

A game never has sound code of its own. It carries one file made here, its copy of the engine with its own sounds in it, and plays those sounds through it.

**Taking the engine and the sounds.** From the Sound Lab folder:

    node tools/sync.mjs <project> <the game's file>

for example `node tools/sync.mjs mathwood ../math-games/mathwood-valley/src/audio/patch.js`. That writes the engine exactly as it is here, then that project's sounds (`sounds/<project>.js`), plus any shared sounds the game plays (named in `SHARED_FOR` at the top of `tools/sync.mjs`). Its first line says it was made here and at which commit. Never edit that file in the game: the next sync writes over it. A new project gets a file in `sounds/` and a line in `SOUNDS`, `SHARED_FOR` and `COPIES` at the top of `tools/sync.mjs`.

`node tools/sync.mjs --check` looks at every game's copy on this machine and says whether it is what a sync would write now. If not, it says what differs: engine lines, a sound changed (and how), a sound missing, a sound only the game has.

**Playing a sound once.** Make one audio context with one noise buffer and one reverb, then play a patch by its name:

    import { playPatch, makeNoiseBuffer, makeImpulse, PATCH_PRESETS } from './patch.js';
    const ctx = new AudioContext();
    const noise = makeNoiseBuffer(ctx, 2);
    const reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(ctx, 2.4, 2.2); reverb.connect(ctx.destination);
    const reverbIn = ctx.createGain(); reverbIn.connect(reverb);
    const voice = playPatch(ctx, noise, ctx.destination, reverbIn, PATCH_PRESETS['MINE — EXPLOSION']);

A sound with an envelope ends by itself. One without (an engine's drone) plays until `voice.stop()`. `voice.setValue(id, v)` turns one of its knobs (a `value` node) while it plays, as a vehicle's engine does with its revs.

**Playing a sound as a note.** `voicePatch` makes a copy of a patch at another pitch, length and loudness. Play that copy, scheduled for the exact time:

    const note = voicePatch(PATCH_PRESETS['TECHNO — WARM BASS'], { semi: 7, len: 0.5, gain: 0.8 });
    playPatch(ctx, noise, out, reverbIn, note, null, { at: ctx.currentTime + 0.1 });

`semi` is semitones from the pitch the patch is written at (each project's file says which, usually a C), `len` is seconds held, `gain` is how loud.

**Writing a new sound.** Here, in the lab: build it and tune it by ear, EXPORT it, and paste it into that project's file in `sounds/` with its `project` and `group`. Then sync it to the game. To change a sound, do the same: change it here, then sync.

**The one rule:** no sound is wired by hand in a game. Every sound is a patch written in this lab's `sounds/` and reaches the game only through `tools/sync.mjs`.

## A change reaches the browser

`index.html` imports `patch.js?v=<date>`, and `patch.js` passes that same tag on to `engine.js` and every file in `sounds/`. After changing any of them, change the tag in index.html and a reload picks it all up.
