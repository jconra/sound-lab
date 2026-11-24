// patch.js — the Sound Lab's engine and all of its sounds, as the one module the lab's pages import (index.html,
// seq.js, hob.html, hobvoice.js...). Nothing is written here: the engine is engine.js (no sounds in it), and the sounds
// are plain data in sounds/, one file per project (rmrf.js, mathwood.js, pi-nebula.js, shared.js). A game does not
// import this file: it carries its own copy of the engine and its own sounds, made by tools/sync.mjs (README).
//
// Every file under this one is imported with this file's own ?v= tag, so the one tag on index.html's import of
// patch.js reaches the engine and the sounds too: bump it there after changing any of them.
const v = new URL(import.meta.url).search;
const E = await import('./engine.js' + v);
const { RMRF_PATCHES } = await import('./sounds/rmrf.js' + v);
const { MATHWOOD_PATCHES } = await import('./sounds/mathwood.js' + v);
const { PI_NEBULA_PATCHES } = await import('./sounds/pi-nebula.js' + v);
const { SHARED_PATCHES } = await import('./sounds/shared.js' + v);

// the engine, under the names it always had here
export const { makeNoiseBuffer, makeImpulse, patchAutoStopTime, patchIsFinite, voicePatch, playPatch,
  BUILDERS, distortionCurve, rigSwitches } = E;

// The projects' sounds, keyed by name as always (a patch's name is its key in the lab's saved copies,
// localStorage 'sl.patches.v1'). PATCH_PRESETS keeps the order the lab has always listed them in; a patch not in
// LISTED comes after these, in the order of its project's file.
const PROJECTS = { rmrf: RMRF_PATCHES, mathwood: MATHWOOD_PATCHES, 'pi-nebula': PI_NEBULA_PATCHES, shared: SHARED_PATCHES };
const LISTED = [
  'LURCHER — GUN A', 'JOTUN — RAIL D', 'FIREBRAT — ENGINE', 'VALKYRIE — ROCKET A', 'SYNTH — KICK',
  'DEMO — MULT (one env, 3 scales)', 'SYNTH — LASER ZAP', 'SYNTH — SNARE', 'SYNTH — HI-HAT', 'SYNTH — WOBBLE BASS',
  'LURCHER — ENGINE', 'VALKYRIE — ENGINE', 'JOTUN — ENGINE', 'FIREBRAT — GUN', 'ELEVATOR — SERVO',
  'MINE — EXPLOSION', 'WORLD — SQUISH (synth)', 'WORLD — RELAY CLANK', 'STAGE — HARMONICA', 'STAGE — PIANO',
  'STAGE — BANJO', 'VOICE — OLD HOB', 'ACTION — GALLOP', 'ACTION — RIM', 'ACTION — BIG DRUM', 'ACTION — WHIP',
  'ACTION — TWANG', 'ACTION — WHISTLE', 'ACTION — BASS', 'FIRE — EMBERS HISS', 'FIRE — CRACKLE POP',
  'WAGON — RUMBLE', 'WAGON — CREAK', 'WAGON — HOOF', 'TOWN — GRUNT', 'TOWN — HOOF', 'TOWN — HOOF SPLASH',
  'TOWN — CREEK', 'RANGE — SHOT', 'RANGE — CLANK', 'RANGE — SHATTER', 'RANGE — PING', 'RANGE — THUD',
  'RANGE — CLICK', 'TECHNO — KICK', 'TECHNO — LOFI KICK', 'TECHNO — HEAVY KICK', 'TECHNO — SNARE',
  'TECHNO — LOFI SNARE', 'TECHNO — HEAVY SNARE', 'TECHNO — CLAP', 'TECHNO — HAT', 'TECHNO — OPEN HAT',
  'TECHNO — LOFI HAT', 'TECHNO — TOM', 'TECHNO — RISER', 'TECHNO — WARM BASS', 'TECHNO — PULSE BASS',
  'TECHNO — ROLLING BASS', 'TECHNO — WOBBLE BASS', 'TECHNO — FM LADDER BASS', 'TECHNO — WARM PAD',
  'TECHNO — AIRY PAD', 'TECHNO — DARK PAD', 'TECHNO — KEYS', 'TECHNO — SOFT SAW', 'TECHNO — SQUARE LEAD',
  'TECHNO — ARP', 'TECHNO — BELLS', 'TECHNO — ECHO PLUCK',
];
const all = {};
for (const [proj, patches] of Object.entries(PROJECTS)) {
  for (const [key, p] of Object.entries(patches)) {
    // loud: two projects with a patch of the same name would quietly lose one of them
    if (all[key]) console.error(`patch.js: '${key}' is in two projects (${all[key].project}, ${proj}); the second is not shown`);
    else all[key] = p;
    if (p.project !== proj) console.error(`patch.js: '${key}' is in sounds/${proj}.js but says project '${p.project}'`);
  }
}
export const PATCH_PRESETS = {};
for (const key of LISTED) if (all[key]) PATCH_PRESETS[key] = all[key];
for (const key in all) if (!PATCH_PRESETS[key]) PATCH_PRESETS[key] = all[key];
