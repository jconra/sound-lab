// OLD HOB'S VOICE: when Hob says a line, a short babble plays under the caption, the way the townsfolk talk in a cosy
// village game: no words, a little low gravelly syllable for each word or so, each at its own pitch, warm and old. The
// syllable is a Sound Lab patch ('VOICE — OLD HOB' in src/audio/patch.js, the same as ~/sound-lab/patch.js, so it can be
// tuned by ear in the lab); here each one is played with its vowel and pitch set. The same line always babbles the same
// way (its pitches come from its letters), a question lifts at the end, and a long line stops babbling after a couple of
// seconds (the caption carries on): it is a voice, not a speech.
//
// It is quiet (well under the stage band and the game's other sounds) and only plays while the game runs: it goes
// through the game's master volume (the Menu's Volume, silent on the title and while paused, see audio.js), and the
// syllables are let out a frame at a time from V.update, which the game only calls while riding (so a pause or the
// title stops the babble where it is). The Esc menu has its own "Hob's voice" switch (saved with the volume, in the
// game's settings key: it belongs to the computer, not the rider).
//
//   const V = makeHobVoice(audio)     audio: makeAudio() (src/audio/audio.js); his sound: HOB_VOICE below
//   V.speak(text, { key })   babble for this line (a line already babbling is cut short); key: the event it answers,
//                       which colours it a little (moodOf: brighter for praise, lower and kinder for help)
//   V.stop()            no more syllables for this line
//   V.update(dt)        each frame while riding: lets out the syllables that are due
//   V.on / V.setOn(on)  the switch (saved)
//   V.speaking          true while syllables are still to come
//   V.said              how many syllables have played (for rigs)
//   voiceRow(V)         the "Hob's voice" switch row for the Esc menu
//   V.settings          the settings it plays with (HOB_VOICE; the Sound Lab's page swaps in its sliders' copy)
//   Pure, for tests and the Sound Lab: babble(text, settings) the syllables a line makes: [{ at (s from the start),
//   vowel, semi, len }]; syllablePatch(base, syllable, settings); moodOf(key); moodVoice(settings, mood)
import { playPatch, PATCH_PRESETS } from './patch.js';

// HOB'S VOICE SETTINGS: how his babble sounds. The Sound Lab's "Hob's voice" page (~/sound-lab/hob.html) has a slider for
// each and a button that copies them as this block: paste it over this one to change his voice in the game.
export const HOB_VOICE = {
  pitch: 0,        // semitones up (+) or down (-) from his own (a low buzz at 104 Hz)
  speed: 1,        // how fast he talks (1.5 = half as fast again)
  gravel: 0.42,    // how rough and shaky the voice is (0 smooth .. 1 very rough)
  nasal: 0,        // 0 from the chest .. 1 through the nose
  wander: 4,       // semitones his pitch wanders from word to word (0 a flat drone)
  clarity: 0.57,   // 0 muffled (through a blanket) .. 1 crisp and bright
  volume: 0.32,    // his level under the game's volume (the patch is written at full; this keeps him quiet)
  mood: 1,         // how much praise brightens him and help makes him lower and kinder (0: always the same)
};

export const VOICE = {
  patch: 'VOICE — OLD HOB',
  get level() { return HOB_VOICE.volume; },   // (the settings' volume)
  step: 0.15,           // seconds from one syllable to the next (at speed 1)
  wordGap: 0.05,        // ... plus this between words
  pause: 0.22,          // ... and this after a comma or a full stop
  most: 14,             // syllables a line at most (about two seconds): the babble stops, the caption stays
  ahead: 0.08,          // seconds ahead a syllable is put on the clock (smooths out an uneven frame)
};
// the vowel resonances (Hz) of an old man's voice, a touch darker than the textbook ones so it stays warm
const VOWELS = {
  a: [700, 1100], e: [500, 1650], i: [360, 1900], o: [540, 850], u: [400, 900], y: [380, 1700],
};
// the soft top's cutoff (Hz) at clarity 0 and at clarity 1 (in between: evenly by ear, not by hertz)
const CLARITY = [700, 7000];
const KEY = 'bandit-math.settings';
function loadSettings() { try { const s = JSON.parse(globalThis.localStorage.getItem(KEY) || '{}'); return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; } }
function saveSettings(patch) { try { globalThis.localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...patch })); } catch (e) { /* storage blocked: the switch just isn't remembered */ } }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// a small number from a word's letters, so the same word always gets the same pitch
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// The mood of a line, from the event Hob is answering: 'praise' (a job done, a right answer, something bought),
// 'help' (a miss, a wrong pick, a spooked deer: he goes a little lower and slower, kind), or null (anything else)
export function moodOf(key) {
  const k = String(key || '');
  if (!k) return null;
  if (/miss|Miss|Wrong|Spooked|Flip|Robbed|Fine|Stop|Loop|NoSaddle/.test(k)) return 'help';
  if (/Done|catch|Catch|Healed|Penned|Right|boxWon|^wave|Sold|Gift|Grew|Unlock|saddle|^dog|^horse|donkey|^hat|Loaded|First/.test(k)) return 'praise';
  return null;
}
// the settings coloured by a mood (pure): praise a touch higher, brighter and quicker; help a touch lower, softer,
// slower and steadier
export function moodVoice(s = HOB_VOICE, mood = null) {
  const m = clamp(s.mood ?? 1, 0, 2);
  if (mood === 'praise') return { ...s, pitch: s.pitch + 1.5 * m, clarity: clamp(s.clarity + 0.08 * m, 0, 1), speed: s.speed * (1 + 0.06 * m), wander: s.wander * (1 + 0.15 * m) };
  if (mood === 'help') return { ...s, pitch: s.pitch - 1.2 * m, clarity: clamp(s.clarity - 0.06 * m, 0, 1), speed: s.speed * (1 - 0.08 * m), wander: s.wander * (1 - 0.2 * m) };
  return s;
}

// the syllables a line makes, with these settings: [{ at (s from the start), vowel, semi, len }]
export function babble(text, s = HOB_VOICE) {
  const out = [];
  const words = String(text || '').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const question = /\?\s*$/.test(String(text || ''));
  const speed = clamp(+s.speed || 1, 0.3, 3), spread = clamp(+(s.wander ?? 4), 0, 16);
  let at = 0;
  for (let wi = 0; wi < words.length && out.length < VOICE.most; wi++) {
    const w = words[wi], letters = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    // one syllable a word, two for a long one: from the word's vowels (a word with none hums an 'uh')
    const vowels = (letters.match(/[aeiouy]/g) || ['u']);
    const n = letters.length > 6 && vowels.length > 1 ? 2 : 1;
    for (let k = 0; k < n && out.length < VOICE.most; k++) {
      const h = hash(letters + k);
      // the pitch: about Hob's own, wandering by the word, drifting down through a line (a question lifts at the end)
      let semi = ((h % 1000) / 1000 * 2 - 1) * spread * 0.5 - (out.length / VOICE.most) * 1.5;
      const last = wi === words.length - 1 && k === n - 1;
      if (last) semi += question ? 3 : -1.5;
      out.push({ at: +at.toFixed(3), vowel: vowels[Math.min(vowels.length - 1, k * 2)], semi: +semi.toFixed(2), len: last ? 1.3 : 1 });
      at += VOICE.step / speed;
    }
    at += (VOICE.wordGap + (/[.,;:!?]$/.test(w) ? VOICE.pause : 0)) / speed;
  }
  return out;
}

// the patch for one syllable: its pitch, vowel and length, and the settings' pitch, gravel, nasal, clarity and speed
export function syllablePatch(base, syl, s = HOB_VOICE) {
  const r = Math.pow(2, (syl.semi + (+s.pitch || 0)) / 12), [f1, f2] = VOWELS[syl.vowel] || VOWELS.u;
  const gravel = clamp(+(s.gravel ?? 0.42), 0, 1), nasal = clamp(+s.nasal || 0, 0, 1), clar = clamp(+(s.clarity ?? 0.57), 0, 1);
  const speed = clamp(+s.speed || 1, 0.3, 3);
  return {
    ...base,
    nodes: base.nodes.map((n) => {
      if (n.id === 'buzz') return { ...n, freq: n.freq * r };
      if (n.id === 'buzz2') return { ...n, freq: n.freq * r, level: 0.43 * gravel };
      if (n.id === 'gravel') return { ...n, level: gravel };
      // (through the nose: the upper vowel band rings louder and narrower, the chest is thinner, the lower band dips)
      if (n.id === 'f1') return { ...n, freq: f1 * (1 - 0.12 * nasal) };
      if (n.id === 'f2') return { ...n, freq: f2 * (1 + 0.15 * nasal), Q: (n.Q ?? 6) + 8 * nasal };
      if (n.id === 'f2-g') return { ...n, gain: (n.gain ?? 0.55) + 1.1 * nasal };
      if (n.id === 'chest-g') return { ...n, gain: (n.gain ?? 0.5) * (1 - 0.75 * nasal) };
      if (n.id === 'tone') return { ...n, freq: CLARITY[0] * Math.pow(CLARITY[1] / CLARITY[0], clar) };
      if (n.id === 'amp') return { ...n, decay: (n.decay ?? 0.13) * syl.len / Math.sqrt(speed) };
      return n;
    }),
  };
}

export function makeHobVoice(audio, settings = HOB_VOICE) {
  const saved = loadSettings().hobVoice;
  let line = [], t = 0, bus = null, since = 0, voice = settings;
  const V = { on: saved !== false, said: 0, mood: null, get speaking() { return line.length > 0; }, settings };
  const need = (on) => { if (audio) audio.need('hob', on); };
  V.setOn = (on) => { V.on = !!on; saveSettings({ hobVoice: V.on }); if (!V.on) V.stop(); };
  // key: the event the line answers (its mood from moodOf), or mood: 'praise' | 'help' given outright
  V.speak = (text, { key = null, mood } = {}) => {
    V.mood = mood !== undefined ? mood : moodOf(key);
    voice = moodVoice(V.settings, V.mood);
    line = V.on ? babble(text, voice) : []; t = 0; since = performance.now();
    need(line.length > 0);
  };
  V.stop = () => { line = []; need(false); };
  V.update = (dt) => {
    if (!line.length) return;
    t += dt;
    // (a line said while the game was paused, at a counter say, is not babbled late over whatever comes next)
    if ((performance.now() - since) / 1000 > line[0].at + 1) { V.stop(); return; }
    const ctx = audio && audio.ctx, base = PATCH_PRESETS[VOICE.patch];
    while (line.length && line[0].at <= t) {
      // (the sound still waking from its sleep, with nothing holding it quiet: the line waits for it a moment)
      if (ctx && !audio.holds.size && ctx.state !== 'running' && t - line[0].at < 0.6) break;
      const s = line.shift();
      // (only once the sound is awake and running: a syllable put on a sleeping clock would all come out at once later)
      if (ctx && audio.running && base) {
        if (!bus) { bus = ctx.createGain(); bus.connect(audio.out); }
        bus.gain.value = clamp(+V.settings.volume || 0, 0, 1);
        try { playPatch(ctx, null, bus, null, syllablePatch(base, s, voice), null, { at: ctx.currentTime + VOICE.ahead }); V.said++; } catch (e) { console.warn('voice: a syllable could not play', e); }
      }
    }
    if (!line.length) need(false);
  };
  V.dispose = () => { V.stop(); if (bus) { try { bus.disconnect(); } catch (e) { /* already gone */ } bus = null; } };
  return V;
}

// The Esc menu's "Hob's voice" switch: one tap turns it on or off (and is remembered on this computer)
export function voiceRow(V) {
  ensureCss();
  const row = document.createElement('div');
  row.className = 'bm-voice';
  row.innerHTML = `<span>Hob's voice</span><button type="button" role="switch" aria-label="Hob's voice"></button>`;
  const b = row.querySelector('button');
  const show = () => { b.setAttribute('aria-checked', String(V.on)); b.textContent = V.on ? 'On' : 'Off'; };
  b.addEventListener('click', () => { V.setOn(!V.on); show(); });
  show();
  return row;
}
let cssDone = false;
function ensureCss() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `.bm-voice { display: flex; align-items: center; gap: 12px; margin-top: 10px; font: 600 15px Bitter, Georgia, serif; color: inherit; }
.bm-voice span { flex: 1; }
.bm-voice button { min-width: 4.2em; padding: 5px 12px; border-radius: 999px; font: 700 14px Bitter, Georgia, serif; cursor: pointer;
  border: 1px solid rgba(226, 173, 76, 0.45); background: transparent; color: inherit; }
.bm-voice button[aria-checked="true"] { background: #c8913c; border-color: #c8913c; color: #1e140c; }
.bm-voice button:focus-visible { outline: 2px solid #e2ad4c; outline-offset: 2px; }`;
  document.head.appendChild(s);
}
