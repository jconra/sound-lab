// engine.js — the Sound Lab's modular patch engine, and only the engine: no sounds are written here. The sounds
// are plain data in sounds/, one file per project; patch.js puts the two together for the lab's pages, and
// tools/sync.mjs makes each game's copy from them (README: "Using the engine in a game").
// (Phase 1 foundation.)
//
// A *patch* is plain data: a set of typed nodes + cables between them. Every node
// maps to a real Web Audio node, so the wiring IS the synthesis — this is what will
// become the live, editable node graph, and the same playPatch() runtime drops into
// the game later (the game currently has no audio at all).
//
//   patch = {
//     name, dur,                       // dur = render/voice length in seconds
//     nodes: [ { id, type, ...params } ],
//     cables: [ { from, to, port } ],  // port omitted/'in' = audio; else a CV param
//   }
//
// Cable kinds:
//   • audio   — source.out → dest.in            (the signal path)
//   • CV/mod  — source.out → dest.params[port]   (envelope/LFO/S&H → a parameter)
//
// Node types (merged/orthogonal palette):
//   osc    — audio source; at low freq + `level` it doubles as an LFO (absorbs old lfo)
//   noise  — looping stepped random source (motor / sample&hold / white via high freq×steps)
//   filter — biquad ; gain — VCA *and* mixer/bus ; shaper — grit
//   env    — ADSR-ish CV (the "off switch") ; value — constant CV (a patchable knob)
//   send (reverb) ; out (→ destination)
//
// Signature mirrors gunsynth's playShot(ctx, noise, dest, reverbInput, …) so the two
// can be A/B rendered against each other for fidelity.

// ── Shared buffers (same as gunsynth, so noise voices match) ──────────────────────
export function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
export function makeImpulse(ctx, dur, decay) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const FLOOR = 0.0005;

// waveshaper curve for grit (identical to gunsynth's)
function distortionCurve(amount) {
  const n = 1024, curve = new Float32Array(n), k = amount * amount * 45;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (3 + k) * x * 0.3490659 / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// ════════════════════════════════════════════════════════════════════════════════
//  NODE BUILDERS — each returns { in, out, params, starts, at }
//    in     : audio input node (or null for sources / CV generators)
//    out    : audio/CV output node
//    params : { name: AudioParam } — the modulatable plugs a CV cable can target
//    starts : scheduled source nodes needing start()/stop()
//    at     : absolute start time for those sources
// ════════════════════════════════════════════════════════════════════════════════

// oscillator — audio source OR (at low freq + wired to a param) an LFO. `level` is the
// CUSTOM WAVES. An osc with wave 'custom' carries its own harmonic table on the node
// (n.harm = { real, imag }, the two arrays createPeriodicWave takes), chosen from a preset or
// drawn in the editor. The table travels inside the patch, so a patch that uses one plays
// anywhere patch.js does - the game included - with no wave library to ship alongside.
// PeriodicWaves are cached per context and table, since every voice of every note would
// otherwise build one.
const _pwCache = new WeakMap();
function periodicWaveFor(ctx, harm) {
  let byKey = _pwCache.get(ctx); if (!byKey) { byKey = new Map(); _pwCache.set(ctx, byKey); }
  const key = harm.real.join(',') + '|' + harm.imag.join(',');
  let pw = byKey.get(key);
  if (!pw) {
    const n = Math.max(2, Math.min(harm.real.length, harm.imag.length));
    pw = ctx.createPeriodicWave(Float32Array.from(harm.real.slice(0, n)), Float32Array.from(harm.imag.slice(0, n)), { disableNormalization: false });
    byKey.set(key, pw);
  }
  return pw;
}
// output depth, so a slow osc into a param modulates it; this absorbs the old lfo node.
function bOsc(ctx, n, t0) {
  const t = t0;                                                  // sources run from FIRE; timing lives on envelopes
  const out = ctx.createGain(); out.gain.value = n.level ?? 1;   // output level / mod depth
  const voices = n.voices || 1, starts = [];
  for (let i = 0; i < voices; i++) {
    const o = ctx.createOscillator();
    if (n.wave === 'custom' && n.harm && n.harm.imag) o.setPeriodicWave(periodicWaveFor(ctx, n.harm));
    else o.type = n.wave === 'custom' ? 'sine' : (n.wave || 'sine');
    o.frequency.setValueAtTime(n.freq ?? 440, t);              // pitch sweeps come from an ENV into the freq plug (× freqMod)
    o.detune.value = voices > 1 ? (i * 2 - 1) * (n.detune || 0) : (n.detune || 0);
    o.connect(out);
    starts.push(o);
  }
  // freq CV depth: a CV wired into the 'freq' plug (e.g. an ENV) is scaled to Hz by freqMod and
  // summed onto every voice's pitch — so an envelope can sweep pitch with a full ADSR contour.
  const freqMod = ctx.createGain(); freqMod.gain.value = n.freqMod ?? 0;
  starts.forEach(o => freqMod.connect(o.frequency));
  return { in: null, out, params: { freq: freqMod, detune: starts[0].detune, level: out.gain }, starts, at: t };
}

// noise — the one source node for all "random" needs, looping continuously.
//   `steps` random slots per cycle at `freq` Hz — one knob-set spans it all:
//   • white hiss            : crank freq×steps past the sample rate (~48k) → a fresh value every sample
//   • motor/engine texture  : steps≈24-32 at a low freq
//   • sample & hold         : steps=1 → one held random value per 1/freq sec
//   Use it as audio, or wire its output into a param as random CV modulation.
// `rate` = playbackRate (pitch/rev plug; CV in here revs it). `level` = output / mod depth.
// Building a noise buffer is a full pass over `loopLen` seconds of samples, and the sequencer asks
// for one on EVERY drum hit — at sixteenth-note speed that is a few hundred thousand samples a
// second spent purely on setup, before a note has sounded. Keep a small RING per
// (rate, freq, steps, loopLen) signature and draw from it at random.
//
// A ring rather than a single cache, deliberately. One shared buffer would make every shot from a
// gun identical, and per-shot noise variation is a good part of why the gunfire sounds alive; four
// gives successive hits different noise while the generation happens a handful of times instead of
// every time. Keyed on sampleRate too, since an offline render rig runs at its own rate.
const _noiseRing = new Map();
const NOISE_RING = 4;
function noiseBufFor(ctx, n) {
  const key = `${ctx.sampleRate}|${n.freq}|${n.steps}|${n.loopLen}`;
  let ring = _noiseRing.get(key);
  if (!ring) { ring = []; _noiseRing.set(key, ring); }
  if (ring.length < NOISE_RING) { const b = _buildNoiseBuf(ctx, n); ring.push(b); return b; }
  return ring[(Math.random() * ring.length) | 0];
}

function bNoise(ctx, n, t0) {
  const out = ctx.createGain(); out.gain.value = n.level ?? 1;
  const buf = noiseBufFor(ctx, n);
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  src.playbackRate.value = n.rate ?? 1;
  src.connect(out);
  return { in: null, out, params: { rate: src.playbackRate, level: out.gain }, starts: [src], at: t0 };   // runs from FIRE; envelopes do the timing
}

function _buildNoiseBuf(ctx, n) {
  const sr = ctx.sampleRate, f = Math.max(0.1, n.freq || 46);
  const steps = Math.max(1, Math.round(n.steps || 24));
  const period = sr / f;
  const cycles = Math.max(1, Math.round((n.loopLen || 1.2) * f));
  const len = Math.max(1, Math.round(cycles * period));
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const nb = new Float64Array(steps);
  for (let i = 0; i < steps; i++) nb[i] = Math.random() * 2 - 1;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    phase++;
    if (phase >= period) { phase -= period; for (let k = 0; k < steps; k++) nb[k] = Math.random() * 2 - 1; }
    d[i] = nb[Math.min(steps - 1, Math.floor((phase / period) * steps))];
  }
  return buf;
}

// value — a constant control source. Patch its output into any param to set/offset it
// (AudioParam inputs SUM onto the param's own value), e.g. an idle pitch or a manual level.
function bValue(ctx, n, t0) {
  const cs = ctx.createConstantSource(); cs.offset.value = n.value ?? 0;
  return { in: null, out: cs, params: { value: cs.offset }, starts: [cs], at: t0 + (n.delay || 0) };
}

// math (multiply) — a CV utility. Scales the signal wired into its input by `mul` (itself CV-able),
// so ONE source can drive params at very different scales: an ENV that peaks near 1 can feed
// noise.rate directly AND, through a ×800 MULT, sweep an oscillator's frequency by ~800 Hz.
function bMath(ctx, n, t0) {
  const g = ctx.createGain(); g.gain.value = n.mul ?? 1;   // out = in × mul
  return { in: g, out: g, params: { mul: g.gain }, starts: [], at: t0 };
}

function bFilter(ctx, n, t0) {
  const t = t0 + (n.delay || 0);
  const f = ctx.createBiquadFilter();
  f.type = n.ftype || 'lowpass';
  f.Q.value = n.Q ?? 0.7;
  if (n.freqPeak != null) {                                  // 3-point sweep (roar)
    f.frequency.setValueAtTime(n.freq, t);
    f.frequency.linearRampToValueAtTime(n.freqPeak, t + (n.attack || 0.08));
    f.frequency.linearRampToValueAtTime(n.freqEnd, t + (n.dur || 0.6));
  } else if (n.freqEnd != null) {                            // 2-point glide
    f.frequency.setValueAtTime(n.freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, n.freqEnd), t + (n.glide || n.dur || 0.1));
  } else {
    f.frequency.value = n.freq;
  }
  return { in: f, out: f, params: { freq: f.frequency, Q: f.Q }, starts: [], at: t };
}

function bGain(ctx, n) {
  const g = ctx.createGain();
  g.gain.value = n.gain ?? 0;     // VCA: default 0 (driven by an env); attenuators set gain
  return { in: g, out: g, params: { gain: g.gain }, starts: [], at: 0 };
}

function bShaper(ctx, n) {
  const grit = n.grit || 0;
  if (grit <= 0) { const g = ctx.createGain(); return { in: g, out: g, params: {}, starts: [], at: 0 }; }
  const drive = ctx.createGain(); drive.gain.value = 1 + grit * grit * 14;
  const ws = ctx.createWaveShaper(); ws.curve = distortionCurve(grit); ws.oversample = '4x';
  const trim = ctx.createGain(); trim.gain.value = 1 / (1 + grit * 1.6);
  drive.connect(ws).connect(trim);
  return { in: drive, out: trim, params: {}, starts: [], at: 0 };
}

// delay / echo: dry passes straight through; a parallel delay line (with a feedback loop) adds the
// wet repeats. time/feedback/wet are live AudioParams (CV-able — modulate time for flange/pitch wob).
function bDelay(ctx, n) {
  const input = ctx.createGain(), out = ctx.createGain();
  const dl = ctx.createDelay(2.0);                                    // max 2s; param tops out at 1.5
  dl.delayTime.value = Math.min(2.0, Math.max(0, n.time ?? 0.3));
  const fb = ctx.createGain(); fb.gain.value = Math.min(0.95, Math.max(0, n.feedback ?? 0.4));   // cap < 1 so it can't run away
  const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = n.tone ?? 4000;   // darkens each repeat (tape feel)
  const wet = ctx.createGain(); wet.gain.value = n.wet ?? 0.5;
  if ((n.dry ?? 1) > 0) input.connect(out);                          // dry passthrough (dry: 0 for an echo-only branch)
  input.connect(dl); dl.connect(wet).connect(out);                    // wet path
  dl.connect(damp).connect(fb).connect(dl);                          // feedback loop (lowpass-damped) → repeating echoes
  return { in: input, out, params: { time: dl.delayTime, feedback: fb.gain, tone: damp.frequency, wet: wet.gain }, starts: [], at: 0 };
}

// envelope generator → CV (ConstantSource.offset shaped on trigger)
// envelope → CV (ConstantSource.offset shaped on trigger). One unified ADSR:
//   attack (lin/exp) → decay → sustain. sustain 0 = a one-shot that decays to TRUE 0
//   and lets the voice auto-stop; sustain > 0 holds until note-off (STOP), then release().
function bEnv(ctx, n, t0) {
  const t = t0 + (n.delay || 0);
  const cs = ctx.createConstantSource(); cs.offset.value = 0;
  const o = cs.offset, p = n.peak ?? 1, fl = Math.max(1e-4, n.floor ?? FLOOR);
  const atk = n.attack ?? 0.01, dec = n.decay ?? 0.2, sus = (n.sustain ?? 0) * p;
  const expOK = p > fl;                                     // exp ramps need a positive, above-floor target/start; peak≈0 ⇒ go linear
  let release = null;
  // attack
  if (atk <= 0) { o.setValueAtTime(p, t); }                 // instant
  else if (n.attackCurve === 'lin' || !expOK) { o.setValueAtTime(0, t); o.linearRampToValueAtTime(p, t + atk); }
  else { o.setValueAtTime(fl, t); o.exponentialRampToValueAtTime(p, t + atk); }
  // decay → sustain
  if (sus > fl) {                                           // held: decay to sustain, ring until STOP…
    expOK ? o.exponentialRampToValueAtTime(sus, t + atk + dec) : o.linearRampToValueAtTime(sus, t + atk + dec);
    release = (rt) => { try { o.cancelScheduledValues(rt); o.setTargetAtTime(0, rt, Math.max(0.005, (n.release ?? 0.3) / 3)); } catch (e) {} };
    // …unless a HOLD is set: sustain for `hold` seconds, then auto-release (a timed plateau —
    // lets a long steady sound like the elevator ride end itself, one-shot style).
    if ((n.hold ?? 0) > 0) {
      const rt = t + atk + dec + n.hold;
      o.setValueAtTime(sus, rt);
      o.setTargetAtTime(0, rt, Math.max(0.005, (n.release ?? 0.3) / 3));
    }
  } else {                                                  // one-shot: decay to TRUE 0 (VCA fully shuts, voice can auto-stop)
    if (expOK) o.exponentialRampToValueAtTime(fl, t + atk + dec);
    else o.setValueAtTime(0, t + atk + dec);
    o.linearRampToValueAtTime(0, t + atk + dec + 0.01);
  }
  return { in: null, out: cs, params: {}, starts: [cs], at: t0, release };
}

function bOut(ctx, n, dest) {
  const g = ctx.createGain(); g.gain.value = n.gain ?? 1;
  if (dest) g.connect(dest);
  return { in: g, out: g, params: { gain: g.gain }, starts: [], at: 0 };
}
function bSend(ctx, n, reverbInput) {
  const g = ctx.createGain(); g.gain.value = n.gain ?? 0;
  if (reverbInput) g.connect(reverbInput);
  return { in: g, out: g, params: { gain: g.gain }, starts: [], at: 0 };
}

// (noise/out/send are handled specially — they need the shared buffer / dest / reverb)
const BUILDERS = {
  osc: bOsc, filter: bFilter, gain: bGain, shaper: bShaper, delay: bDelay, env: bEnv, value: bValue, math: bMath,
};

// ════════════════════════════════════════════════════════════════════════════════
//  AUTO-STOP DETERMINATION — the ENVELOPE is the off switch (see patchAutoStopTime):
//  any envelope present ⇒ the voice ends; no envelope ⇒ a deliberate drone (engines).
// ════════════════════════════════════════════════════════════════════════════════
function envEndTime(n) {
  if ((n.sustain ?? 0) > 0.001) {
    if ((n.hold ?? 0) > 0)                                  // timed plateau → ends after hold + release tail
      return (n.delay || 0) + (n.attack ?? 0.01) + (n.decay ?? 0.2) + n.hold + (n.release ?? 0.3) * 1.5;
    return Infinity;                                        // held → sustains until STOP
  }
  return (n.delay || 0) + (n.attack ?? 0.01) + (n.decay ?? 0.2) + 0.02;   // one-shot → ends after decay
}
// Seconds-from-now to auto-stop the voice, or null to run until STOP.
// THE RULE (the game's maker's, 2026-07-08): an ENVELOPE is the "off switch" — if the patch has any envelope,
// the voice ENDS; with none, it's a deliberate drone (the engines). Precisely:
//   • all envelopes one-shot / timed-hold → stop right after the LAST one finishes (its natural end),
//   • any HELD envelope (sustain > 0, no hold) → the voice lives for the patch's `dur`, then releases,
//   • no envelopes at all → null (runs until STOP).
// (Replaces the old graph analysis that only auto-stopped when EVERY audio path was gated by an
//  env-VCA — which read as "engine-brain": deleting one env could silently turn an SFX into a drone.)
export function patchAutoStopTime(patch) {
  let maxEnd = 0, hasEnv = false, hasHeld = false;
  for (const n of patch.nodes) {
    if (n.type !== 'env' || n.disabled) continue;
    hasEnv = true;
    const e = envEndTime(n);
    if (!isFinite(e)) hasHeld = true;                       // a held env (sustain>0, no timed hold)
    else maxEnd = Math.max(maxEnd, e);
  }
  if (!hasEnv) return null;                                 // no envelopes → deliberate drone (engines)
  if (hasHeld) return (patch.dur || 3) + 0.2;               // held env → voice lasts `dur`, then release/stop
  return maxEnd + 0.2;                                      // all one-shot → stop after the last envelope
}
// A patch is "finite" (auto-stops) iff the rule above schedules an end.
export function patchIsFinite(patch) { return patchAutoStopTime(patch) != null; }

// ════════════════════════════════════════════════════════════════════════════════
//  playPatch — instantiate the whole patch as ONE live voice, triggered now at t0.
//  No scheduled stop: looping sources (noise, oscillators) run continuously and
//  one-shot sounds simply go silent when their envelopes close. Returns a handle
//  whose .stop() tears the voice down — the host stops the previous voice before
//  it fires/re-evaluates a new one, so engines replace instead of piling up.
//  (Offline render rigs ignore the handle; with no stop, sources just play the
//   full OfflineAudioContext length, which is what we want.)
// ════════════════════════════════════════════════════════════════════════════════
// ── PLAYING A PATCH AS A NOTE ────────────────────────────────────────────────
// A patch was authored as one sound at one pitch. Music needs the same patch at many pitches, at
// scheduled times, for varying lengths — so rather than teaching the runtime about notes, rewrite
// the patch DATA and let the existing runtime play it. A note is just a transposed patch.
//
//   semi — semitones from the patch's authored pitch. Scales oscillator frequencies and, with
//          them, the FILTER frequencies: a filter left at a fixed cutoff turns a low note muddy
//          and a high note thin, because the timbre stops moving with the pitch. Scaling both
//          transposes the whole voice, so it stays recognisably the same instrument.
//   len  — how long to hold the note, seconds. Applied to SUSTAINING envelopes only, as a timed
//          plateau (see envEndTime's `hold`). Percussive one-shot envelopes are left alone: a
//          drum's length is the drum, not the note, and stretching it would just detune the hit.
//   gain — velocity, into the OUT node.
//
// NOISE is deliberately never transposed. It is what the drums are made of, and pitching a snare
// with the melody is not a thing anybody wants.
export function voicePatch(patch, { semi = 0, gain = 1, len = null } = {}) {
  const r = Math.pow(2, semi / 12);
  if (r === 1 && gain === 1 && len == null) return patch;
  // SCALE WHAT IS THERE; DO NOT INVENT WHAT IS NOT. Writing `(n.freqPeak ?? 0) * r` looks like a
  // harmless default and is not: it turns an ABSENT freqPeak into a PRESENT zero, and bFilter
  // chooses its behaviour by presence — `freqPeak != null` is true for 0, so a patch with a plain
  // static cutoff silently got the three-point sweep branch and ramped its cutoff to 0 Hz. A
  // lowpass collapsing to zero is degenerate, and when the ramp brought it back up the stored
  // energy came out all at once: BASS rendered at 116 peak against 0.13 for every other
  // instrument, ~900x. It looked like a Web Audio filter bug for exactly as long as it took to
  // print what this function actually returns.
  const scale = (n, keys) => {
    const o = { ...n };
    for (const k of keys) if (o[k] != null) o[k] = o[k] * r;
    return o;
  };
  const nodes = patch.nodes.map(n => {
    if (n.type === 'osc') return scale(n, ['freq', 'freqMod']);
    if (n.type === 'filter') return scale(n, ['freq', 'freqPeak', 'freqEnd']);
    if (n.type === 'out')
      return { ...n, gain: (n.gain ?? 1) * gain };
    if (n.type === 'env' && len != null && (n.sustain ?? 0) > 0.001)
      return { ...n, hold: Math.max(0.01, len - (n.attack ?? 0.01) - (n.decay ?? 0.2)) };
    return n;
  });
  return { ...patch, nodes };
}

export const rigSwitches = { offlineLifetimes: false };
// opts.at — absolute ctx time to start at, for SCHEDULED playback. Web Audio can place a note on
// the sample; a JS timer cannot, and a sequencer driven by timers audibly wobbles. Everything
// downstream already derives its timing from t0, so this is the only place it needs to know.
export function playPatch(ctx, noise, dest, reverbInput, patch, onEnded, opts = {}) {
  const t0 = opts.at != null ? opts.at : ctx.currentTime;
  const built = {};

  for (const node of patch.nodes) {
    const ty = node.type;
    if (node.disabled) {     // BYPASS: a unity gain — passes audio straight through (or stays silent if it's a source/CV)
      const g = ctx.createGain(); built[node.id] = { in: g, out: g, params: {}, starts: [], at: t0 }; continue;
    }
    if (ty === 'out')        built[node.id] = bOut(ctx, node, dest);
    else if (ty === 'send')  built[node.id] = bSend(ctx, node, reverbInput);
    else if (ty === 'noise') built[node.id] = bNoise(ctx, node, t0);
    else {
      const fn = BUILDERS[ty];
      built[node.id] = fn ? fn(ctx, node, t0) : null;
    }
  }

  // wire cables
  for (const c of patch.cables) {
    const s = built[c.from], d = built[c.to];
    if (!s || !d) continue;
    if (!c.port || c.port === 'in') { if (d.in) s.out.connect(d.in); }
    else if (d.params[c.port]) { s.out.connect(d.params[c.port]); }
  }

  // VALUE nodes SET their target param (a remote knob): zero the param's own base so the value node's
  // constant provides the absolute level via the sum. ENV/LFO/osc sources keep modulating additively.
  const _byId = {}; patch.nodes.forEach(n => _byId[n.id] = n);
  for (const c of patch.cables) {
    if (!c.port || c.port === 'in') continue;
    const src = _byId[c.from], d = built[c.to];
    if (!src || src.type !== 'value' || !d) continue;
    const tgt = d.params[c.port];
    if (tgt && typeof tgt.connect !== 'function' && 'value' in tgt) tgt.value = 0;   // AudioParam target → zero its base
  }

  // start every source — no stop scheduled (the voice runs until torn down)
  const sources = [];
  for (const id in built) {
    const b = built[id]; if (!b || !b.starts) continue;
    for (const src of b.starts) { try { src.start(b.at ?? t0); } catch (e) {} sources.push(src); }
  }

  // outputs to fade on teardown (out → dest, send → reverb) so stopping doesn't click
  const outs = patch.nodes.filter(n => n.type === 'out' || n.type === 'send')
    .map(n => built[n.id]).filter(Boolean);
  // ADSR envelopes release on note-off (STOP); collect their hooks + longest release time
  const releasers = [];
  for (const node of patch.nodes) { const b = built[node.id]; if (b && b.release) releasers.push({ fn: b.release, dur: node.release ?? 0.3 }); }
  let stopped = false;
  const handle = {
    stop(fade = 0.02) {
      if (stopped) return; stopped = true;
      if (handle._auto) { clearTimeout(handle._auto); handle._auto = null; }
      const t = ctx.currentTime;
      let rel = 0;
      releasers.forEach(r => { r.fn(t); rel = Math.max(rel, r.dur); });   // note-off: start the ADSR releases now
      const t2 = t + rel;                                                  // …and let them ring out before tearing down
      outs.forEach(o => { try { o.out.gain.setTargetAtTime(0, t2, fade); } catch (e) {} });
      const at = t2 + fade * 5 + 0.02;
      sources.forEach(src => { try { src.stop(at); } catch (e) {} });
      setTimeout(() => Object.values(built).forEach(b => { if (b && b.out) try { b.out.disconnect(); } catch (e) {} }), (rel + fade * 5 + 0.15) * 1000);
    },
    // live-set a VALUE node's output on the PLAYING voice (smooth glide) — lets a slider "rev" the
    // engine without rebuilding/restarting. No-op for non-value nodes (no params.value AudioParam).
    setValue(id, v) {
      const p = built[id] && built[id].params && built[id].params.value;
      if (p && typeof p.setTargetAtTime === 'function') { try { p.setTargetAtTime(v, ctx.currentTime, 0.05); } catch (e) {} }
    },
  };
  // (a rig's switch: an offline render ends each voice when a live one would end, so its cost means what it does live)
  if (rigSwitches.offlineLifetimes && typeof ctx.startRendering === 'function') {
    const autoT = patchAutoStopTime(patch);
    if (autoT != null) sources.forEach(src => { try { src.stop(t0 + autoT + 0.27); } catch (e) {} });
  }
  // finite (one-shot) patches tear themselves down after the last envelope — live ctx only
  // (offline render contexts have startRendering(); they must play the full render length)
  if (typeof ctx.startRendering !== 'function') {
    const autoT = patchAutoStopTime(patch);
    // Count the auto-stop from the note's OWN start, not from now — a note scheduled a beat ahead
    // would otherwise be torn down a beat early, and at speed that clips the front off every hit.
    if (autoT != null) handle._auto = setTimeout(() => { handle.stop(0.05); if (onEnded) onEnded(); },
                                                 Math.max(0, autoT + (t0 - ctx.currentTime)) * 1000);
  }
  return handle;
}

// expose builders/curve for the UI layer (live param tweaks, introspection)
export { BUILDERS, distortionCurve };
