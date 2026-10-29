// patch.js — the Sound Lab's modular patch engine (Phase 1 foundation).
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
// THE RULE (Jacob's, 2026-07-08): an ENVELOPE is the "off switch" — if the patch has any envelope,
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

// ════════════════════════════════════════════════════════════════════════════════
//  PATCH PRESETS — the existing gunsynth presets re-expressed as patches.
//  One per kind for now (the rest are mechanical ports). These are the fidelity
//  proof: A/B rendered against gunsynth.js in the offline rig.
// ════════════════════════════════════════════════════════════════════════════════
export const PATCH_PRESETS = {
  // LURCHER autocannon (tuned 2026-06-14): body noise + pitch-diving sine tone → ×1.53 → grit shaper
  'LURCHER — GUN A': {
    name: 'Lurcher', group: 'GUNS', kind: 'ballistic', dur: 0.6,
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
    name: 'Jotun', group: 'GUNS', kind: 'railgun', dur: 2.2,
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
    name: 'Firebrat', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Valkyrie', group: 'GUNS', kind: 'rocket', dur: 1.2,
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

  // KICK — demos envelope-driven PITCH. A one-shot ENV into the osc's freq plug, scaled by the
  // osc's freqMod (300 Hz), snaps pitch up to ~350 Hz then drops it back to the 50 Hz base over
  // 60 ms — the classic synth-kick "thump." A second ENV shapes the amp.
  'SYNTH — KICK': {
    name: 'Kick', group: 'SYNTH', kind: 'perc', dur: 0.6,
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
    name: 'MULT demo', group: 'SYNTH', kind: 'demo', dur: 1.6,
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
    name: 'Laser', group: 'SYNTH', kind: 'perc', dur: 0.5,
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
    name: 'Snare', group: 'SYNTH', kind: 'perc', dur: 0.4,
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
    name: 'Hi-hat', group: 'SYNTH', kind: 'perc', dur: 0.2,
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
    name: 'Wobble', group: 'SYNTH', kind: 'bass', dur: 3,
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

  // ── VEHICLE ENGINES (ports of the Designer ENGINE_CONFIGS; RPMs value node = throttle 0→1, fanned
  //    out through MULTs to pitch / AM-rate / cutoff). Continuous (static gains → drone till STOP).
  //    Starters — need manual ear-tune. ──────────────────────────────────────────────────────────
  'LURCHER — ENGINE': {   // electric servo (tuned 2026-06-14): square + firing-pulse tremolo, NO hiss layer
    name: 'Lurcher', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Valkyrie', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Jotun', group: 'ENGINES', kind: 'engine', dur: 3,
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
    name: 'Firebrat', group: 'GUNS', kind: 'laser', dur: 0.5,
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

  // ── WORLD FX (2026-07-08, for Jacob to tinker/approve, then port into the game) ─────────────

  // ELEVATOR — SERVO. Jacob's approved design (2026-07-08): a quiet detuned TRIANGLE pair whose pitch
  // swells up over 1.4s under load, one held env driving both pitch and level. Deliberately low
  // (whine 0.15 × out 0.19 — was 0.1, raised twice per Jacob's ear 2026-07-10; triangle since same day: saw read too buzzy). In-game the LIFT owns the timing — play on rise, stop() on arrival, so
  // it runs exactly as long as the animation; `dur` 5 is just the lab-preview length (then it releases).
  'ELEVATOR — SERVO': {
    name: 'Elevator', group: 'WORLD', kind: 'mech', dur: 5.0,
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

  // SOLDIER — SQUISH: 'WORLD — SQUISH (synth)' below is the chosen synth squish (Jacob dialed it in
  // 2026-07-10, replacing the old rmrf/sounds/squish.mp3 sample). No oscillators — two swelling
  // resonant bandpasses: an up-sweeping wet body (env1×4000 → bp freq) plus a delayed second
  // squelch (env7×613 → filter9, both fired ~0.2s in). squishAt() in the game plays it positioned.

  // MINE — EXPLOSION. Jacob's own lab design (2026-07-08): a low stepped-noise blast (grit + lowpass)
  // summed with a square "thud" osc (pitch dropping ~317->146 Hz via env4), the whole mix VCA'd by
  // env2 -- a long exp decay to a 0.1 sustain + big release, so it thumps then rings out. env2 is
  // held, so under the envelope rule it auto-stops at `dur` then releases.
  'MINE — EXPLOSION': {
    name: 'Mine', group: 'WORLD', kind: 'perc', dur: 0.85,
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
    name: 'Squish', group: 'WORLD', kind: 'perc', dur: 0.5,
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

  // RELAY CLANK (2026-07-10, Jacob's tuning) — a light electromechanical clack for GARAGE vehicle
  // selection (plays when the player switches vehicle and the deck light changes). Broadband noise
  // CONTACT CLICK (its bandpass BYPASSED for a fuller tick), a detuned-triangle metallic RING, and
  // a slow-swelling low TOCK for physical weight; bus makeup ×2. Pasted in from his lab export.
  'WORLD — RELAY CLANK': {
    name: 'Relay clank', group: 'WORLD', kind: 'mech', dur: 0.2,
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
  // ── STAGE MUSIC (Bandit Math) ──
  // The harmonica and the low piano that play on the stage in Bandit Math (math-games/bandit-math/src/audio/), built from
  // numbers measured off a reference recording (overtone strengths, swell and fade times, wobble, breath, the piano's
  // sharp upper partials and two-stage damper). Tune them here by ear; the game plays the saved preset: after a change,
  // EXPORT the patch, paste it over the preset below, and copy this file to the game's src/audio/patch.js.
  // The game plays them as notes (voicePatch: the pitch, the length, the loudness) and, per note, also sets: the bend
  // (BEND peak = semitones flat at the start, its decay = how long the slide takes), the wobble (WOBBLE rate, LOUDNESS
  // WOBBLE and PITCH WOBBLE depths, by style: pulses ~7 a second, a slow rock, or nearly plain), the swell (LOUDNESS
  // attack: slow on a fresh breath, quick when a note runs on from the last) and the fade. It keeps the wobble and
  // breath and tone filters at the pitch they are set here (they are the player and the instrument, not the note), and
  // for the harmonica's low notes (below ~370 Hz), upper notes (from ~470 Hz) and high notes (from ~540 Hz) it puts the
  // REED: LOW / UPPER / HIGH NOTES table into the reed (the reference's colour changes with pitch: each harmonica reed
  // is its own). For the piano it holds the DAMPER TAIL 0.25 s past the key's release (the tail's faint hang, measured).
  // HARMONICA, written at G4 (392 Hz): two reeds from the measured overtones, a scoop up into the note, wobble, breath.
  'STAGE — HARMONICA': {
    name: 'Harmonica', group: 'MUSIC', kind: 'instrument', dur: 2.6,
    nodes: [
      { id: 'reed', type: 'osc', name: 'reed', wave: 'custom', harm: { real: [0, 0.033597, 0.238693, 0.77301, 0.121619, 0.137201, -0.022534, -0.082776, 0, 0.075198, -0.027776, -0.044399, 0.067698, -0.050755, 0.024425, -0.006093, 0, -0.005809, 0.022189, -0.043906, 0.055696, -0.02918, -0.01455, 0.0313, 0, -0.021464, -0.006841, 0.009406, 0.012303, 0.007895, 0.003246, 0.000691, 0], imag: [0, 0.341117, 0.576256, 0.634393, 0, -0.16718, -0.054402, 0.008153, 0.07904, -0.007406, -0.067056, 0.0541, 0, -0.041654, 0.058968, -0.061867, 0.060652, -0.058978, 0.05357, -0.036032, 0, 0.035556, -0.035126, -0.003083, 0.026036, 0.002114, -0.016516, -0.011461, 0, 0.006479, 0.007837, 0.007015, 0.005859] }, freq: 392, detune: -1.5, freqMod: -22.001, level: 2.277 },
      { id: 'reed2', type: 'osc', name: 'second reed', wave: 'custom', harm: { real: [0, 0.033597, 0.238693, 0.77301, 0.121619, 0.137201, -0.022534, -0.082776, 0, 0.075198, -0.027776, -0.044399, 0.067698, -0.050755, 0.024425, -0.006093, 0, -0.005809, 0.022189, -0.043906, 0.055696, -0.02918, -0.01455, 0.0313, 0, -0.021464, -0.006841, 0.009406, 0.012303, 0.007895, 0.003246, 0.000691, 0], imag: [0, 0.341117, 0.576256, 0.634393, 0, -0.16718, -0.054402, 0.008153, 0.07904, -0.007406, -0.067056, 0.0541, 0, -0.041654, 0.058968, -0.061867, 0.060652, -0.058978, 0.05357, -0.036032, 0, 0.035556, -0.035126, -0.003083, 0.026036, 0.002114, -0.016516, -0.011461, 0, 0.006479, 0.007837, 0.007015, 0.005859] }, freq: 392, detune: 2.5, freqMod: -22.001, level: 0.3643 },
      { id: 'reed-lo', type: 'osc', name: 'reed: low notes', wave: 'custom', harm: { real: [0, 0.024621, 0.08088, 0.77301, 0.125893, 0.112813, -0.01918, -0.082776, 0, 0.075198, -0.027776, -0.044399, 0.067698, -0.050755, 0.024425, -0.006093, 0, -0.005809, 0.022189, -0.043906, 0.055696, -0.02918, -0.01455, 0.0313, 0, -0.021464, -0.006841, 0.009406, 0.012303, 0.007895, 0.003246, 0.000691, 0], imag: [0, 0.249979, 0.195261, 0.634393, 0, -0.137463, -0.046304, 0.008153, 0.07904, -0.007406, -0.067056, 0.0541, 0, -0.041654, 0.058968, -0.061867, 0.060652, -0.058978, 0.05357, -0.036032, 0, 0.035556, -0.035126, -0.003083, 0.026036, 0.002114, -0.016516, -0.011461, 0, 0.006479, 0.007837, 0.007015, 0.005859] }, freq: 392, level: 1.7676 },
      { id: 'reed-up', type: 'osc', name: 'reed: upper notes', wave: 'custom', harm: { real: [0, 0.049125, 0.382683, 0.614024, 0.149624, 0.159352, -0.030398, -0.082776, 0, 0.075198, -0.027776, -0.044399, 0.067698, -0.050755, 0.024425, -0.006093, 0, -0.005809, 0.022189, -0.043906, 0.055696, -0.02918, -0.01455, 0.0313, 0, -0.021464, -0.006841, 0.009406, 0.012303, 0.007895, 0.003246, 0.000691, 0], imag: [0, 0.498774, 0.92388, 0.503916, 0, -0.194171, -0.073386, 0.008153, 0.07904, -0.007406, -0.067056, 0.0541, 0, -0.041654, 0.058968, -0.061867, 0.060652, -0.058978, 0.05357, -0.036032, 0, 0.035556, -0.035126, -0.003083, 0.026036, 0.002114, -0.016516, -0.011461, 0, 0.006479, 0.007837, 0.007015, 0.005859] }, freq: 392, level: 2.6363 },
      { id: 'reed-hi', type: 'osc', name: 'reed: high notes', wave: 'custom', harm: { real: [0, 0.014666, 0.382683, 0.18331, 0.120226, 0.059205, -0.016138, -0.082776, 0, 0.075198, -0.027776, -0.044399, 0.067698, -0.050755, 0.024425, -0.006093, 0, -0.005809, 0.022189, -0.043906, 0.055696, -0.02918, -0.01455, 0.0313, 0, -0.021464, -0.006841, 0.009406, 0.012303, 0.007895, 0.003246, 0.000691, 0], imag: [0, 0.148903, 0.92388, 0.150438, 0, -0.072142, -0.03896, 0.008153, 0.07904, -0.007406, -0.067056, 0.0541, 0, -0.041654, 0.058968, -0.061867, 0.060652, -0.058978, 0.05357, -0.036032, 0, 0.035556, -0.035126, -0.003083, 0.026036, 0.002114, -0.016516, -0.011461, 0, 0.006479, 0.007837, 0.007015, 0.005859] }, freq: 392, level: 1.6494 },
      { id: 'bend', type: 'env', name: 'bend', peak: 0.8, attack: 0, decay: 0.42, sustain: 0, floor: 0.03, release: 0.1 },
      { id: 'wob', type: 'osc', name: 'wobble', wave: 'sine', freq: 7, level: 1 },
      { id: 'grow', type: 'env', name: 'wobble grows', peak: 1, attack: 0.5, attackCurve: 'lin', decay: 0.01, sustain: 1, release: 0.3, delay: 0.25 },
      { id: 'wob-d', type: 'gain', name: 'wobble', gain: 0 },
      { id: 'trem-d', type: 'math', name: 'loudness wobble', mul: 0.45 },
      { id: 'vib-d', type: 'math', name: 'pitch wobble', mul: -0.074 },
      { id: 'vib-lag', type: 'delay', name: 'pitch trails', time: 0.056, feedback: 0, tone: 20000, wet: 1 },
      { id: 'wander', type: 'noise', name: 'wander', freq: 1.4, steps: 1, loopLen: 6, rate: 1, level: 1 },
      { id: 'wander-f', type: 'filter', name: 'wander', ftype: 'lowpass', freq: 1.6, Q: 0.5 },
      { id: 'wander-d', type: 'math', name: 'wander', mul: 0.05 },
      { id: 'breath', type: 'noise', name: 'breath', freq: 600, steps: 256, loopLen: 1.2, rate: 1, level: 1 },
      { id: 'br-hp', type: 'filter', name: 'breath', ftype: 'highpass', freq: 450, Q: 0.6 },
      { id: 'br-lp', type: 'filter', name: 'breath', ftype: 'lowpass', freq: 1200, Q: 0.5 },
      { id: 'br-g', type: 'gain', name: 'breath', gain: 0.46 },
      { id: 'air-hp', type: 'filter', name: 'air', ftype: 'highpass', freq: 3500, Q: 0.6 },
      { id: 'air-lp', type: 'filter', name: 'air', ftype: 'lowpass', freq: 8000, Q: 0.6 },
      { id: 'air-g', type: 'gain', name: 'air', gain: 0.08 },
      { id: 'mix', type: 'gain', name: 'mix', gain: 1 },
      { id: 'amp', type: 'env', name: 'loudness', peak: 1, attack: 0.55, attackCurve: 'lin', decay: 0.01, sustain: 1, release: 0.6 },
      { id: 'vca', type: 'gain', name: 'loudness', gain: 0 },
      { id: 'trem', type: 'gain', name: 'wobble', gain: 1 },
      { id: 'tone', type: 'filter', name: 'top end', ftype: 'lowpass', freq: 7500, Q: 0.5 },
      { id: 'send', type: 'send', name: 'room', gain: 0.036 },
      { id: 'out', type: 'out', name: 'output', gain: 0.15 },
    ],
    cables: [
      { from: 'reed', to: 'mix' }, { from: 'reed2', to: 'mix' }, { from: 'bend', to: 'reed', port: 'freq' }, { from: 'bend', to: 'reed2', port: 'freq' },
      { from: 'wob', to: 'wob-d' }, { from: 'grow', to: 'wob-d', port: 'gain' }, { from: 'wob-d', to: 'trem-d' }, { from: 'trem-d', to: 'trem', port: 'gain' },
      { from: 'wob-d', to: 'vib-lag' }, { from: 'vib-lag', to: 'vib-d' }, { from: 'vib-d', to: 'reed', port: 'freq' }, { from: 'vib-d', to: 'reed2', port: 'freq' },
      { from: 'wander', to: 'wander-f' }, { from: 'wander-f', to: 'wander-d' }, { from: 'wander-d', to: 'reed', port: 'freq' }, { from: 'wander-d', to: 'reed2', port: 'freq' },
      { from: 'breath', to: 'br-hp' }, { from: 'br-hp', to: 'br-lp' }, { from: 'br-lp', to: 'br-g' }, { from: 'br-g', to: 'mix' },
      { from: 'breath', to: 'air-hp' }, { from: 'air-hp', to: 'air-lp' }, { from: 'air-lp', to: 'air-g' }, { from: 'air-g', to: 'mix' },
      { from: 'mix', to: 'vca' }, { from: 'amp', to: 'vca', port: 'gain' }, { from: 'vca', to: 'trem' }, { from: 'trem', to: 'tone' },
      { from: 'tone', to: 'out' }, { from: 'tone', to: 'send' },
    ],
  },
  // LOW PIANO, written at G2 (98 Hz): partials 1-6 (+ a second string a hair sharp), 7-12 and 13-20 running sharp,
  // each fading at its own pace; a quick strike, a soft felt thump, a two-stage damper.
  'STAGE — PIANO': {
    name: 'Piano (low)', group: 'MUSIC', kind: 'instrument', dur: 3,
    nodes: [
      { id: 'low', type: 'osc', name: 'partials 1-6', wave: 'custom', harm: { real: [0, 0.098017, 0.100656, 0.202217, 0.221309, 0.123316, -0.066907, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], imag: [0, 0.995185, 0.243005, 0.165955, 0, -0.150262, -0.161528, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, freq: 98, detune: 0, level: 1.779 },
      { id: 'low2', type: 'osc', name: 'second string', wave: 'custom', harm: { real: [0, 0.098017, 0.100656, 0.202217, 0.221309, 0.123316, -0.066907, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], imag: [0, 0.995185, 0.243005, 0.165955, 0, -0.150262, -0.161528, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, freq: 98, detune: 3, level: 0.6226 },
      { id: 'mid', type: 'osc', name: 'partials 7-12', wave: 'custom', harm: { real: [0, 0, 0, 0, 0, 0, 0, -0.15908, 0, 0.137457, -0.049717, -0.077975, 0.116851, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], imag: [0, 0, 0, 0, 0, 0, 0, 0.015668, 0.147911, -0.013538, -0.120027, 0.095013, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, freq: 98, detune: 7.5, level: 0.7869 },
      { id: 'high', type: 'osc', name: 'partials 13-20', wave: 'custom', harm: { real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.08622, 0.040884, -0.009277, 0, -0.007007, 0.024065, -0.043061, 0.049653, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], imag: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.070759, 0.098703, -0.09419, 0.081894, -0.071141, 0.058099, -0.035339, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, freq: 98, detune: 22.3, level: 0.5671 },
      { id: 'low-e', type: 'env', name: 'low fade', peak: 1, attack: 0, decay: 3.5, sustain: 0.45, release: 1.5 },
      { id: 'mid-e', type: 'env', name: 'middle fade', peak: 1, attack: 0, decay: 2.4, sustain: 0.35, release: 1.5 },
      { id: 'high-e', type: 'env', name: 'top fade', peak: 1, attack: 0, decay: 2, sustain: 0.18, release: 1.5 },
      { id: 'low-v', type: 'gain', name: 'low', gain: 0 },
      { id: 'mid-v', type: 'gain', name: 'middle', gain: 0 },
      { id: 'high-v', type: 'gain', name: 'top', gain: 0 },
      { id: 'body', type: 'gain', name: 'body', gain: 1 },
      { id: 'strike-e', type: 'env', name: 'strike', peak: 0.8, attack: 0, decay: 0.16, sustain: 0, floor: 0.05, release: 0.05 },
      { id: 'strike', type: 'gain', name: 'strike', gain: 0 },
      { id: 'thump', type: 'noise', name: 'hammer', freq: 600, steps: 256, loopLen: 0.4, rate: 1, level: 1 },
      { id: 'thump-f', type: 'filter', name: 'hammer', ftype: 'bandpass', freq: 320, Q: 0.8 },
      { id: 'thump-e', type: 'env', name: 'hammer', peak: 0.05, attack: 0.002, attackCurve: 'lin', decay: 0.04, sustain: 0, release: 0.02 },
      { id: 'thump-v', type: 'gain', name: 'hammer', gain: 0 },
      { id: 'damp-a-e', type: 'env', name: 'damper', peak: 1, attack: 0.003, attackCurve: 'lin', decay: 0.01, sustain: 1, release: 0.06 },
      { id: 'damp-b-e', type: 'env', name: 'damper tail', peak: 1, attack: 0.003, attackCurve: 'lin', decay: 0.01, sustain: 1, release: 0.15 },
      { id: 'damp-a', type: 'gain', name: 'damper', gain: 0 },
      { id: 'damp-b', type: 'gain', name: 'damper tail', gain: 0 },
      { id: 'damp-a-g', type: 'gain', name: 'damper', gain: 0.75 },
      { id: 'damp-b-g', type: 'gain', name: 'damper tail', gain: 0.25 },
      { id: 'mix', type: 'gain', name: 'mix', gain: 1 },
      { id: 'send', type: 'send', name: 'room', gain: 0.036 },
      { id: 'out', type: 'out', name: 'output', gain: 0.15 },
    ],
    cables: [
      { from: 'low', to: 'low-v' }, { from: 'low2', to: 'low-v' }, { from: 'low-e', to: 'low-v', port: 'gain' }, { from: 'mid', to: 'mid-v' },
      { from: 'mid-e', to: 'mid-v', port: 'gain' }, { from: 'high', to: 'high-v' }, { from: 'high-e', to: 'high-v', port: 'gain' }, { from: 'low-v', to: 'body' },
      { from: 'mid-v', to: 'body' }, { from: 'high-v', to: 'body' }, { from: 'body', to: 'strike' }, { from: 'strike-e', to: 'strike', port: 'gain' },
      { from: 'thump', to: 'thump-f' }, { from: 'thump-f', to: 'thump-v' }, { from: 'thump-e', to: 'thump-v', port: 'gain' }, { from: 'body', to: 'damp-a' },
      { from: 'strike', to: 'damp-a' }, { from: 'thump-v', to: 'damp-a' }, { from: 'body', to: 'damp-b' }, { from: 'strike', to: 'damp-b' },
      { from: 'thump-v', to: 'damp-b' }, { from: 'damp-a-e', to: 'damp-a', port: 'gain' }, { from: 'damp-b-e', to: 'damp-b', port: 'gain' }, { from: 'damp-a', to: 'damp-a-g' },
      { from: 'damp-b', to: 'damp-b-g' }, { from: 'damp-a-g', to: 'mix' }, { from: 'damp-b-g', to: 'mix' }, { from: 'mix', to: 'out' },
      { from: 'mix', to: 'send' },
    ],
  },
  // ── end of STAGE MUSIC ──
  // The synth banjo (math-games/mathwood-valley/src/audio/banjosynth.js), matched to sampled banjo notes, written at C4.
  // In the game each note also moves its fades, colour and twang with the pitch (banjoNote); here it plays as voicePatch
  // moves it. The 'head echo' nodes (2026-10-29): the string's sound back off the drum head a moment later, darker; the
  // game makes it quieter up the neck. Tune it here by ear, then copy the numbers into banjosynth.js.
  'STAGE — BANJO': {"name":"Banjo","group":"MUSIC","kind":"instrument","dur":2,"nodes":[{"id":"nz","type":"noise","name":"pick noise","freq":600,"steps":256,"loopLen":0.5,"rate":1,"level":1},{"id":"pick-f","type":"filter","name":"pick","ftype":"bandpass","freq":1076.7,"Q":4.174},{"id":"pick-e","type":"env","peak":0.0099468,"attack":0.0005,"attackCurve":"lin","decay":0.0012,"sustain":0,"floor":0.0008359,"release":0.1,"name":"pick"},{"id":"pick-v","type":"gain","name":"pick","gain":0},{"id":"head-f","type":"filter","name":"head","ftype":"bandpass","freq":636.5,"Q":10.574},{"id":"head-e","type":"env","peak":0.0056003,"attack":0.001,"attackCurve":"lin","decay":0.0385,"sustain":0,"floor":0.0008359,"release":0.1,"name":"head"},{"id":"head-v","type":"gain","name":"head","gain":0},{"id":"s1","type":"osc","name":"string 1st","wave":"custom","freq":261.626,"detune":0,"level":0.054625,"harm":{"real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.054625,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},{"id":"s1-f","type":"env","peak":0.85565,"attack":0.00945,"attackCurve":"lin","decay":1.0605,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 1st quick fade"},{"id":"s1-s","type":"env","peak":0.14435,"attack":0.00945,"attackCurve":"lin","decay":5.1693,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 1st slow fade"},{"id":"s1-v","type":"gain","name":"string 1st","gain":0},{"id":"s2","type":"osc","name":"string 2nd-3rd","wave":"custom","freq":261.626,"detune":3,"level":0.19888,"harm":{"real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0,0.12158,0.087523,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},{"id":"s2-f","type":"env","peak":0.43329,"attack":0.00945,"attackCurve":"lin","decay":0.7981,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 2nd-3rd quick fade"},{"id":"s2-s","type":"env","peak":0.56671,"attack":0.00945,"attackCurve":"lin","decay":2.4548,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 2nd-3rd slow fade"},{"id":"s2-v","type":"gain","name":"string 2nd-3rd","gain":0},{"id":"s3","type":"osc","name":"string 4th-7th","wave":"custom","freq":261.626,"detune":8,"level":0.095118,"harm":{"real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0,0,0,0.055879,0.01801,0.015617,0.011255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},{"id":"s3-f","type":"env","peak":0.64805,"attack":0.00945,"attackCurve":"lin","decay":0.997,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 4th-7th quick fade"},{"id":"s3-s","type":"env","peak":0.35195,"attack":0.00945,"attackCurve":"lin","decay":3.553,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 4th-7th slow fade"},{"id":"s3-v","type":"gain","name":"string 4th-7th","gain":0},{"id":"s4","type":"osc","name":"string 8th up","wave":"custom","freq":261.626,"detune":12,"level":0.18931,"harm":{"real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0,0,0,0,0,0,0,0.052751,0.01065,0.0057855,0.0040887,0.0071436,0.0092229,0.007971,0.0069585,0.0061281,0.0057253,0.0053698,0.0050538,0.0047713,0.0045172,0.0042876,0.004079,0.0038889,0.0038247,0.0037639,0.0037063,0.0036517,0.0035998,0.0035503,0.0035031,0.003458,0.003177,0.0029263,0.0027017,0.0025,0.0023183,0.0021541,0.0020054,0.0018703,0.0017473,0.0016351,0.0015325,0.0014385,0.0013522,0.0012727,0.0011995,0.0011319,0.0013406,0.0015822,0.0018614,0.0021828,0.002552,0.002975,0.0034583,0.0040092,0.0046358,0.0053467,0.0061517,0.0070612,0.0080867,0.0092405,0.010537,0.01199]}},{"id":"s4-f","type":"env","peak":0.35107,"attack":0.00945,"attackCurve":"lin","decay":0.5081,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 8th up quick fade"},{"id":"s4-s","type":"env","peak":0.64893,"attack":0.00945,"attackCurve":"lin","decay":2.6004,"sustain":0,"floor":0.0001,"release":0.1,"name":"string 8th up slow fade"},{"id":"s4-v","type":"gain","name":"string 8th up","gain":0},{"id":"str","type":"gain","name":"string","gain":1},{"id":"lp","type":"filter","name":"twang","ftype":"lowpass","freq":12444.4,"freqEnd":7616.9,"glide":0.0137,"Q":0.422},{"id":"lp2","type":"filter","name":"twang (slow slide)","ftype":"lowpass","freq":6755.2,"freqEnd":2653.9,"glide":0.5227,"Q":0.707},{"id":"mix","type":"gain","name":"mix","gain":1},{"id":"damp-e","type":"env","name":"damper","peak":1,"attack":0.001,"attackCurve":"lin","decay":0.01,"sustain":1,"release":0.09},{"id":"damp","type":"gain","name":"damper","gain":0},{"id":"send","type":"send","name":"room","gain":0.03},{"id":"out","type":"out","name":"output","gain":0.5},{"id":"echo-lp","type":"filter","name":"head echo tone","ftype":"lowpass","freq":340,"Q":0.707},{"id":"echo","type":"delay","name":"head echo","time":0.025,"feedback":0.65,"tone":340,"wet":1,"dry":0},{"id":"echo-v","type":"gain","name":"head echo level","gain":5}],"cables":[{"from":"nz","to":"pick-f"},{"from":"pick-f","to":"pick-v"},{"from":"pick-e","to":"pick-v","port":"gain"},{"from":"pick-v","to":"mix"},{"from":"nz","to":"head-f"},{"from":"head-f","to":"head-v"},{"from":"head-e","to":"head-v","port":"gain"},{"from":"head-v","to":"mix"},{"from":"s1","to":"s1-v"},{"from":"s1-f","to":"s1-v","port":"gain"},{"from":"s1-s","to":"s1-v","port":"gain"},{"from":"s1-v","to":"str"},{"from":"s2","to":"s2-v"},{"from":"s2-f","to":"s2-v","port":"gain"},{"from":"s2-s","to":"s2-v","port":"gain"},{"from":"s2-v","to":"str"},{"from":"s3","to":"s3-v"},{"from":"s3-f","to":"s3-v","port":"gain"},{"from":"s3-s","to":"s3-v","port":"gain"},{"from":"s3-v","to":"str"},{"from":"s4","to":"s4-v"},{"from":"s4-f","to":"s4-v","port":"gain"},{"from":"s4-s","to":"s4-v","port":"gain"},{"from":"s4-v","to":"str"},{"from":"str","to":"lp"},{"from":"lp","to":"lp2"},{"from":"lp2","to":"mix"},{"from":"mix","to":"damp"},{"from":"damp-e","to":"damp","port":"gain"},{"from":"damp","to":"out"},{"from":"damp","to":"send"},{"from":"damp","to":"echo-lp"},{"from":"echo-lp","to":"echo"},{"from":"echo","to":"echo-v"},{"from":"echo-v","to":"out"},{"from":"echo-v","to":"send"}]},
  // ── VOICE (Bandit Math: Old Hob's babble, 2026-10-12) ──
  // OLD HOB, one syllable of his babble: a low buzzing voice (saw at 104 Hz, an old man's pitch, falling a touch) shaken by
  // a slow random wobble in loudness (the gravel), through two vowel resonances (F1 / F2 of an 'ah': the game moves them
  // per syllable for 'ee', 'oh', 'oo'...) and a soft top; a breath of noise; one short swell and fall. The game plays it
  // a syllable a word or so (src/audio/voice.js), each at its own pitch, quietly.
  'VOICE — OLD HOB': {
    name: 'Old Hob (babble)', group: 'VOICE', kind: 'voice', dur: 0.4,
    nodes: [
      { id: 'buzz', type: 'osc', name: 'voice', wave: 'sawtooth', freq: 104, freqMod: 9, level: 1 },
      { id: 'buzz2', type: 'osc', name: 'voice (rough)', wave: 'square', freq: 52, freqMod: 4.5, level: 0.18 },
      { id: 'drop', type: 'env', name: 'pitch fall', peak: -1, attack: 0.03, attackCurve: 'lin', decay: 0.16, sustain: 0, release: 0.05 },
      { id: 'gravel', type: 'noise', name: 'gravel', freq: 34, steps: 1, loopLen: 2, rate: 1, level: 0.42 },
      { id: 'rough', type: 'gain', name: 'gravel', gain: 1 },
      { id: 'f1', type: 'filter', name: 'vowel 1', ftype: 'bandpass', freq: 700, Q: 4.5 },
      { id: 'f2', type: 'filter', name: 'vowel 2', ftype: 'bandpass', freq: 1100, Q: 6 },
      { id: 'f1-g', type: 'gain', name: 'vowel 1', gain: 1 },
      { id: 'f2-g', type: 'gain', name: 'vowel 2', gain: 0.55 },
      { id: 'chest', type: 'filter', name: 'chest', ftype: 'lowpass', freq: 380, Q: 0.7 },
      { id: 'chest-g', type: 'gain', name: 'chest', gain: 0.5 },
      { id: 'breath', type: 'noise', name: 'breath', freq: 600, steps: 256, loopLen: 0.6, rate: 1, level: 1 },
      { id: 'br-f', type: 'filter', name: 'breath', ftype: 'bandpass', freq: 1500, Q: 0.9 },
      { id: 'br-g', type: 'gain', name: 'breath', gain: 0.05 },
      { id: 'mix', type: 'gain', name: 'mix', gain: 1 },
      { id: 'amp', type: 'env', name: 'loudness', peak: 1, attack: 0.018, attackCurve: 'lin', decay: 0.13, sustain: 0, release: 0.05 },
      { id: 'vca', type: 'gain', name: 'loudness', gain: 0 },
      { id: 'tone', type: 'filter', name: 'soft top', ftype: 'lowpass', freq: 2600, Q: 0.5 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      { from: 'drop', to: 'buzz', port: 'freq' }, { from: 'drop', to: 'buzz2', port: 'freq' },
      { from: 'buzz', to: 'rough' }, { from: 'buzz2', to: 'rough' }, { from: 'gravel', to: 'rough', port: 'gain' },
      { from: 'rough', to: 'f1' }, { from: 'rough', to: 'f2' }, { from: 'rough', to: 'chest' },
      { from: 'f1', to: 'f1-g' }, { from: 'f2', to: 'f2-g' }, { from: 'chest', to: 'chest-g' },
      { from: 'f1-g', to: 'mix' }, { from: 'f2-g', to: 'mix' }, { from: 'chest-g', to: 'mix' },
      { from: 'breath', to: 'br-f' }, { from: 'br-f', to: 'br-g' }, { from: 'br-g', to: 'mix' },
      { from: 'mix', to: 'vca' }, { from: 'amp', to: 'vca', port: 'gain' }, { from: 'vca', to: 'tone' }, { from: 'tone', to: 'out' },
    ],
  },
  // ── end of VOICE ──
  // ── ACTION MUSIC (Bandit Math) ──
  // The spaghetti-western action music for "Protect the wagon" (math-games/bandit-math/src/audio/actionmusic.js): a
  // galloping da-da-DUM (GALLOP on the beat, RIM for the da's), a plucked BASS, a TWANG guitar (a noise burst into a
  // delay one period of the note long, fed back: a plucked string; plus a "wire" through a sweeping resonant filter for
  // the twang and the ring), a WHISTLE melody (a near-pure tone, a scoop up, a slow vibrato), WHIP cracks, and a BIG
  // DRUM on each catch. Tune them here by ear; the game plays a preset of the same name from its copy of this file
  // (src/audio/patch.js) first, else its own (src/audio/actionpatches.js): after a change, export the patch and paste it
  // into the game's actionpatches.js (or copy this file to src/audio/patch.js).
  // The game sets per note: the pitch (TWANG written at E3, WHISTLE at E6, BASS at E2), the loudness, the WHISTLE's
  // length, and the TWANG's string time (1 / the note's frequency) and pick brightness. Keep the TWANG's string feedback
  // under about 0.89: the delay's damping filter lifts the loop near its cutoff and it runs away above that.
  'ACTION — GALLOP': {
    name: 'Gallop drum', group: 'MUSIC', kind: 'perc', dur: 0.5,
    nodes: [
      { id: 'body', type: 'osc', name: 'tom', wave: 'sine', freq: 92, freqMod: 70 },
      { id: 'pit', type: 'env', name: 'pitch drop', peak: 1, attack: 0.001, decay: 0.07, sustain: 0 },
      { id: 'amp', type: 'env', name: 'tom', peak: 1, attack: 0.002, decay: 0.3, sustain: 0 },
      { id: 'vca', type: 'gain', name: 'tom', gain: 0 },
      { id: 'felt', type: 'noise', name: 'felt', freq: 600, steps: 256, rate: 1, loopLen: 0.4 },
      { id: 'felt-f', type: 'filter', name: 'felt', ftype: 'bandpass', freq: 260, Q: 1.2 },
      { id: 'felt-e', type: 'env', name: 'felt', peak: 0.5, attack: 0.001, decay: 0.05, sustain: 0 },
      { id: 'felt-v', type: 'gain', name: 'felt', gain: 0 },
      { id: 'mix', type: 'gain', name: 'mix', gain: 1 },
      { id: 'send', type: 'send', name: 'room', gain: 0.05 },
      { id: 'out', type: 'out', name: 'output', gain: 0.55 },
    ],
    cables: [
      { from: 'pit', to: 'body', port: 'freq' }, { from: 'body', to: 'vca' }, { from: 'amp', to: 'vca', port: 'gain' }, { from: 'vca', to: 'mix' },
      { from: 'felt', to: 'felt-f' }, { from: 'felt-f', to: 'felt-v' }, { from: 'felt-e', to: 'felt-v', port: 'gain' }, { from: 'felt-v', to: 'mix' },
      { from: 'mix', to: 'out' }, { from: 'mix', to: 'send' },
    ],
  },
  'ACTION — RIM': {
    name: 'Rim knock', group: 'MUSIC', kind: 'perc', dur: 0.2,
    nodes: [
      { id: 'nz', type: 'noise', name: 'knock', freq: 600, steps: 256, rate: 1, loopLen: 0.4 },
      { id: 'bp', type: 'filter', name: 'knock', ftype: 'bandpass', freq: 1900, Q: 3 },
      { id: 'e', type: 'env', name: 'knock', peak: 1, attack: 0.001, decay: 0.045, sustain: 0 },
      { id: 'v', type: 'gain', name: 'knock', gain: 0 },
      { id: 'wood', type: 'osc', name: 'wood', wave: 'triangle', freq: 520 },
      { id: 'wood-e', type: 'env', name: 'wood', peak: 0.35, attack: 0.001, decay: 0.03, sustain: 0 },
      { id: 'wood-v', type: 'gain', name: 'wood', gain: 0 },
      { id: 'send', type: 'send', name: 'room', gain: 0.06 },
      { id: 'out', type: 'out', name: 'output', gain: 0.3 },
    ],
    cables: [
      { from: 'nz', to: 'bp' }, { from: 'bp', to: 'v' }, { from: 'e', to: 'v', port: 'gain' }, { from: 'v', to: 'out' }, { from: 'v', to: 'send' },
      { from: 'wood', to: 'wood-v' }, { from: 'wood-e', to: 'wood-v', port: 'gain' }, { from: 'wood-v', to: 'out' },
    ],
  },
  'ACTION — BIG DRUM': {
    name: 'Big drum', group: 'MUSIC', kind: 'perc', dur: 1.6,
    nodes: [
      { id: 'body', type: 'osc', name: 'boom', wave: 'sine', freq: 52, freqMod: 80 },
      { id: 'pit', type: 'env', name: 'pitch drop', peak: 1, attack: 0.001, decay: 0.14, sustain: 0 },
      { id: 'amp', type: 'env', name: 'boom', peak: 1, attack: 0.003, decay: 1.2, sustain: 0 },
      { id: 'vca', type: 'gain', name: 'boom', gain: 0 },
      { id: 'skin', type: 'noise', name: 'skin', freq: 600, steps: 256, rate: 1, loopLen: 0.4 },
      { id: 'skin-f', type: 'filter', name: 'skin', ftype: 'lowpass', freq: 420, Q: 0.8 },
      { id: 'skin-e', type: 'env', name: 'skin', peak: 0.8, attack: 0.001, decay: 0.22, sustain: 0 },
      { id: 'skin-v', type: 'gain', name: 'skin', gain: 0 },
      { id: 'mix', type: 'gain', name: 'mix', gain: 1 },
      { id: 'send', type: 'send', name: 'room', gain: 0.22 },
      { id: 'out', type: 'out', name: 'output', gain: 0.9 },
    ],
    cables: [
      { from: 'pit', to: 'body', port: 'freq' }, { from: 'body', to: 'vca' }, { from: 'amp', to: 'vca', port: 'gain' }, { from: 'vca', to: 'mix' },
      { from: 'skin', to: 'skin-f' }, { from: 'skin-f', to: 'skin-v' }, { from: 'skin-e', to: 'skin-v', port: 'gain' }, { from: 'skin-v', to: 'mix' },
      { from: 'mix', to: 'out' }, { from: 'mix', to: 'send' },
    ],
  },
  'ACTION — WHIP': {
    name: 'Whip crack', group: 'MUSIC', kind: 'perc', dur: 0.4,
    nodes: [
      { id: 'nz', type: 'noise', name: 'crack', freq: 600, steps: 256, rate: 1, loopLen: 0.4 },
      { id: 'hp', type: 'filter', name: 'crack', ftype: 'highpass', freq: 2400, Q: 0.7 },
      { id: 'e', type: 'env', name: 'crack', peak: 1, attack: 0.0005, decay: 0.028, sustain: 0 },
      { id: 'v', type: 'gain', name: 'crack', gain: 0 },
      { id: 'chirp', type: 'osc', name: 'snap', wave: 'triangle', freq: 300, freqMod: 2600 },
      { id: 'chirp-p', type: 'env', name: 'snap', peak: 1, attack: 0.0005, decay: 0.03, sustain: 0 },
      { id: 'chirp-e', type: 'env', name: 'snap', peak: 0.5, attack: 0.0005, decay: 0.035, sustain: 0 },
      { id: 'chirp-v', type: 'gain', name: 'snap', gain: 0 },
      { id: 'air-f', type: 'filter', name: 'air', ftype: 'bandpass', freq: 1300, Q: 0.9 },
      { id: 'air-e', type: 'env', name: 'air', peak: 0.25, attack: 0.004, decay: 0.16, sustain: 0 },
      { id: 'air-v', type: 'gain', name: 'air', gain: 0 },
      { id: 'send', type: 'send', name: 'room', gain: 0.3 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      { from: 'nz', to: 'hp' }, { from: 'hp', to: 'v' }, { from: 'e', to: 'v', port: 'gain' }, { from: 'v', to: 'out' }, { from: 'v', to: 'send' },
      { from: 'chirp-p', to: 'chirp', port: 'freq' }, { from: 'chirp', to: 'chirp-v' }, { from: 'chirp-e', to: 'chirp-v', port: 'gain' }, { from: 'chirp-v', to: 'out' },
      { from: 'nz', to: 'air-f' }, { from: 'air-f', to: 'air-v' }, { from: 'air-e', to: 'air-v', port: 'gain' }, { from: 'air-v', to: 'out' }, { from: 'air-v', to: 'send' },
    ],
  },
  'ACTION — TWANG': {
    name: 'Twang guitar', group: 'MUSIC', kind: 'instrument', dur: 2.2,
    nodes: [
      { id: 'pick', type: 'noise', name: 'pick', freq: 600, steps: 256, rate: 1, loopLen: 0.4 },
      { id: 'pick-f', type: 'filter', name: 'pick brightness', ftype: 'lowpass', freq: 3200, Q: 0.6 },
      { id: 'pick-e', type: 'env', name: 'pluck', peak: 1, attack: 0.0005, decay: 0.012, sustain: 0 },
      { id: 'pick-v', type: 'gain', name: 'pluck', gain: 0 },
      { id: 'string', type: 'delay', name: 'string (time = 1 / pitch)', time: 0.006068, feedback: 0.85, tone: 3800, wet: 1 },
      { id: 'wire', type: 'osc', name: 'wire', wave: 'sawtooth', freq: 164.81 },
      { id: 'wire2', type: 'osc', name: 'second wire', wave: 'square', freq: 164.81, detune: 6, level: 0.35 },
      { id: 'tw-f', type: 'filter', name: 'twang', ftype: 'lowpass', freq: 700, Q: 7 },
      { id: 'tw-e', type: 'env', name: 'twang sweep', peak: 1, attack: 0.001, decay: 0.28, sustain: 0 },
      { id: 'tw-m', type: 'math', name: 'twang sweep (Hz)', mul: 2600 },
      { id: 'wire-e', type: 'env', name: 'wire', peak: 0.5, attack: 0.002, decay: 1.6, sustain: 0 },
      { id: 'wire-v', type: 'gain', name: 'wire', gain: 0 },
      { id: 'mix', type: 'gain', name: 'mix', gain: 1 },
      { id: 'body', type: 'filter', name: 'body', ftype: 'lowpass', freq: 4200, Q: 1.4 },
      { id: 'low-cut', type: 'filter', name: 'low cut', ftype: 'highpass', freq: 110, Q: 0.7 },
      { id: 'grit', type: 'shaper', name: 'amp grit', grit: 0.18 },
      { id: 'ring', type: 'env', name: 'ring', peak: 1, attack: 0.001, decay: 1.8, sustain: 0 },
      { id: 'vca', type: 'gain', name: 'ring', gain: 0 },
      { id: 'trem', type: 'osc', name: 'tremolo', wave: 'sine', freq: 5.6, level: 0.18 },
      { id: 'trem-v', type: 'gain', name: 'tremolo', gain: 0.85 },
      { id: 'send', type: 'send', name: 'room', gain: 0.24 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      { from: 'pick', to: 'pick-f' }, { from: 'pick-f', to: 'pick-v' }, { from: 'pick-e', to: 'pick-v', port: 'gain' },
      { from: 'pick-v', to: 'string' }, { from: 'string', to: 'mix' },
      { from: 'wire', to: 'tw-f' }, { from: 'wire2', to: 'tw-f' }, { from: 'tw-e', to: 'tw-m' }, { from: 'tw-m', to: 'tw-f', port: 'freq' },
      { from: 'tw-f', to: 'wire-v' }, { from: 'wire-e', to: 'wire-v', port: 'gain' }, { from: 'wire-v', to: 'mix' },
      { from: 'mix', to: 'body' }, { from: 'body', to: 'low-cut' }, { from: 'low-cut', to: 'grit' },
      { from: 'grit', to: 'vca' }, { from: 'ring', to: 'vca', port: 'gain' }, { from: 'vca', to: 'trem-v' }, { from: 'trem', to: 'trem-v', port: 'gain' },
      { from: 'trem-v', to: 'out' }, { from: 'trem-v', to: 'send' },
    ],
  },
  'ACTION — WHISTLE': {
    name: 'Whistle', group: 'MUSIC', kind: 'instrument', dur: 2,
    nodes: [
      { id: 'tone', type: 'osc', name: 'whistle', wave: 'sine', freq: 1318.5, freqMod: -110 },
      { id: 'over', type: 'osc', name: 'a little second harmonic', wave: 'sine', freq: 2637, freqMod: -220, level: 0.04 },
      { id: 'scoop', type: 'env', name: 'scoop up', peak: 1, attack: 0, decay: 0.09, sustain: 0, floor: 0.02 },
      { id: 'vib', type: 'osc', name: 'vibrato', wave: 'sine', freq: 5.4, level: 1 },
      { id: 'vib-grow', type: 'env', name: 'vibrato grows', peak: 1, attack: 0.35, attackCurve: 'lin', decay: 0.01, sustain: 1, release: 0.2, delay: 0.15 },
      { id: 'vib-g', type: 'gain', name: 'vibrato', gain: 0 },
      { id: 'vib-d', type: 'math', name: 'vibrato depth (x the scoop range: about 16 Hz)', mul: -0.145 },
      { id: 'air', type: 'noise', name: 'air', freq: 600, steps: 256, rate: 1, loopLen: 1.2 },
      { id: 'air-f', type: 'filter', name: 'air', ftype: 'bandpass', freq: 1318.5, Q: 6 },
      { id: 'air-g', type: 'gain', name: 'air', gain: 0.05 },
      { id: 'mix', type: 'gain', name: 'mix', gain: 1 },
      { id: 'amp', type: 'env', name: 'loudness', peak: 1, attack: 0.05, attackCurve: 'lin', decay: 0.1, sustain: 0.85, release: 0.16 },
      { id: 'vca', type: 'gain', name: 'loudness', gain: 0 },
      { id: 'send', type: 'send', name: 'room', gain: 0.22 },
      { id: 'out', type: 'out', name: 'output', gain: 0.16 },
    ],
    cables: [
      { from: 'scoop', to: 'tone', port: 'freq' }, { from: 'scoop', to: 'over', port: 'freq' },
      { from: 'vib', to: 'vib-g' }, { from: 'vib-grow', to: 'vib-g', port: 'gain' }, { from: 'vib-g', to: 'vib-d' }, { from: 'vib-d', to: 'tone', port: 'freq' },
      { from: 'tone', to: 'mix' }, { from: 'over', to: 'mix' }, { from: 'air', to: 'air-f' }, { from: 'air-f', to: 'air-g' }, { from: 'air-g', to: 'mix' },
      { from: 'mix', to: 'vca' }, { from: 'amp', to: 'vca', port: 'gain' }, { from: 'vca', to: 'out' }, { from: 'vca', to: 'send' },
    ],
  },
  'ACTION — BASS': {
    name: 'Plucked bass', group: 'MUSIC', kind: 'instrument', dur: 1,
    nodes: [
      { id: 'tri', type: 'osc', name: 'body', wave: 'triangle', freq: 82.41 },
      { id: 'saw', type: 'osc', name: 'edge', wave: 'sawtooth', freq: 82.41, level: 0.35 },
      { id: 'lp', type: 'filter', name: 'darkness', ftype: 'lowpass', freq: 520, Q: 0.9 },
      { id: 'amp', type: 'env', name: 'pluck', peak: 1, attack: 0.004, decay: 0.55, sustain: 0 },
      { id: 'vca', type: 'gain', name: 'pluck', gain: 0 },
      { id: 'send', type: 'send', name: 'room', gain: 0.04 },
      { id: 'out', type: 'out', name: 'output', gain: 0.42 },
    ],
    cables: [
      { from: 'tri', to: 'lp' }, { from: 'saw', to: 'lp' }, { from: 'lp', to: 'vca' }, { from: 'amp', to: 'vca', port: 'gain' },
      { from: 'vca', to: 'out' }, { from: 'vca', to: 'send' },
    ],
  },
  // ── end of ACTION MUSIC ──
  // ── CAMPFIRE (Bandit Math's camps: src/fire/campfire.js plays these; keep the two copies the same) ──
  'FIRE — EMBERS HISS': {
    name: 'Embers hiss', group: 'WORLD', kind: 'engine', dur: 4,
    nodes: [
      { id: 'hiss', type: 'noise', name: 'hiss', freq: 600, steps: 256, loopLen: 2.4, rate: 1, level: 1 },
      { id: 'hp', type: 'filter', name: 'low cut', ftype: 'highpass', freq: 160, Q: 0.6 },
      { id: 'lp', type: 'filter', name: 'top end', ftype: 'lowpass', freq: 1500, Q: 0.5 },
      { id: 'roar', type: 'filter', name: 'roar', ftype: 'lowpass', freq: 260, Q: 0.7 },
      { id: 'roar-g', type: 'gain', name: 'roar', gain: 0.9 },
      { id: 'flutter', type: 'gain', name: 'flutter', gain: 0.6 },
      { id: 'wander', type: 'noise', name: 'wander', freq: 7, steps: 1, loopLen: 5, rate: 1, level: 1 },
      { id: 'wander-f', type: 'filter', name: 'wander', ftype: 'lowpass', freq: 5, Q: 0.5 },
      { id: 'wander-d', type: 'math', name: 'wander', mul: 0.45 },
      { id: 'out', type: 'out', name: 'output', gain: 0.07 },
    ],
    cables: [
      { from: 'hiss', to: 'hp' }, { from: 'hp', to: 'lp' }, { from: 'lp', to: 'flutter' },
      { from: 'hiss', to: 'roar' }, { from: 'roar', to: 'roar-g' }, { from: 'roar-g', to: 'flutter' },
      { from: 'wander', to: 'wander-f' }, { from: 'wander-f', to: 'wander-d' }, { from: 'wander-d', to: 'flutter', port: 'gain' },
      { from: 'flutter', to: 'out' },
    ],
  },
  'FIRE — CRACKLE POP': {
    name: 'Crackle pop', group: 'WORLD', kind: 'perc', dur: 0.2,
    nodes: [
      { id: 'n', type: 'noise', name: 'noise', freq: 600, steps: 256, loopLen: 0.6, rate: 1, level: 1 },
      { id: 'snap-f', type: 'filter', name: 'snap', ftype: 'bandpass', freq: 2600, Q: 1.8 },
      { id: 'snap-e', type: 'env', name: 'snap', peak: 1, attack: 0, decay: 0.022, sustain: 0 },
      { id: 'snap', type: 'gain', name: 'snap', gain: 0 },
      { id: 'thump-f', type: 'filter', name: 'thump', ftype: 'lowpass', freq: 420, Q: 0.9 },
      { id: 'thump-e', type: 'env', name: 'thump', peak: 0.7, attack: 0.002, decay: 0.07, sustain: 0 },
      { id: 'thump', type: 'gain', name: 'thump', gain: 0 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      { from: 'n', to: 'snap-f' }, { from: 'snap-f', to: 'snap' }, { from: 'snap-e', to: 'snap', port: 'gain' }, { from: 'snap', to: 'out' },
      { from: 'n', to: 'thump-f' }, { from: 'thump-f', to: 'thump' }, { from: 'thump-e', to: 'thump', port: 'gain' }, { from: 'thump', to: 'out' },
    ],
  },
  // ── end of CAMPFIRE ──
  // ── WAGONS (Bandit Math's wagons on the road: src/audio/wagonsound.js plays these, there in group 'WAGON'; tune them
  // here and paste the numbers back into the game's copy) ──
  //   RUMBLE  the wheels on the dirt road, a drone the game fades with the wagon's speed
  //   CREAK   the wood and iron now and then (the game shifts the pitch a little each time)
  //   HOOF    one hoof on the dirt (the game plays one for each hoof of the team as it lands)
  'WAGON — RUMBLE': {
    name: 'Wagon rumble', group: 'WORLD', kind: 'engine', dur: 3,
    nodes: [
      { id: 'grind', type: 'noise', name: 'grind', freq: 31, steps: 26, loopLen: 1.6, rate: 1, level: 1 },
      { id: 'grind-f', type: 'filter', name: 'grind', ftype: 'lowpass', freq: 170, Q: 0.9 },
      { id: 'grind-g', type: 'gain', name: 'grind', gain: 0.9 },
      { id: 'grit', type: 'noise', name: 'gravel', freq: 600, steps: 256, loopLen: 1.1, rate: 1, level: 1 },
      { id: 'grit-f', type: 'filter', name: 'gravel', ftype: 'bandpass', freq: 520, Q: 0.7 },
      { id: 'grit-g', type: 'gain', name: 'gravel', gain: 0.12 },
      { id: 'wob', type: 'osc', name: 'bump', wave: 'sine', freq: 2.3, level: 0.35 },
      { id: 'bus', type: 'gain', name: 'mix', gain: 0.75 },
      { id: 'out', type: 'out', name: 'output', gain: 0.6 },
    ],
    cables: [
      { from: 'grind', to: 'grind-f' }, { from: 'grind-f', to: 'grind-g' }, { from: 'grind-g', to: 'bus' },
      { from: 'grit', to: 'grit-f' }, { from: 'grit-f', to: 'grit-g' }, { from: 'grit-g', to: 'bus' },
      { from: 'wob', to: 'bus', port: 'gain' }, { from: 'bus', to: 'out' },
    ],
  },
  'WAGON — CREAK': {
    name: 'Wagon creak', group: 'WORLD', kind: 'perc', dur: 0.6,
    nodes: [
      { id: 'wood', type: 'osc', name: 'wood', wave: 'sawtooth', freq: 210, freqMod: 40, voices: 2, detune: 18 },
      { id: 'wood-p', type: 'env', name: 'bend', peak: 1, attack: 0.18, decay: 0.2, sustain: 0, attackCurve: 'lin' },
      { id: 'wood-f', type: 'filter', name: 'wood', ftype: 'bandpass', freq: 900, Q: 3.5 },
      { id: 'wood-g', type: 'gain', name: 'wood', gain: 0 },
      { id: 'wood-e', type: 'env', name: 'wood', peak: 0.5, attack: 0.05, decay: 0.32, sustain: 0, attackCurve: 'lin' },
      { id: 'rasp', type: 'noise', name: 'rasp', freq: 85, steps: 3, loopLen: 1, rate: 1, level: 1 },
      { id: 'rasp-g', type: 'gain', name: 'rasp', gain: 0 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      { from: 'wood', to: 'wood-f' }, { from: 'wood-p', to: 'wood', port: 'freq' }, { from: 'wood-f', to: 'wood-g' },
      { from: 'wood-e', to: 'wood-g', port: 'gain' }, { from: 'rasp', to: 'rasp-g' }, { from: 'wood-e', to: 'rasp-g', port: 'gain' },
      { from: 'rasp-g', to: 'wood-g', port: 'gain' },   // (the rasp roughens the creak, only while it sounds)
      { from: 'wood-g', to: 'out' },
    ],
  },
  'WAGON — HOOF': {
    name: 'Hoof on dirt', group: 'WORLD', kind: 'perc', dur: 0.3,
    nodes: [
      { id: 'thud', type: 'osc', name: 'thud', wave: 'sine', freq: 82, freqMod: 110 },
      { id: 'thud-p', type: 'env', name: 'thud pitch', peak: 1, attack: 0, decay: 0.045, sustain: 0 },
      { id: 'thud-g', type: 'gain', name: 'thud', gain: 0 },
      { id: 'thud-e', type: 'env', name: 'thud', peak: 0.9, attack: 0.002, decay: 0.11, sustain: 0 },
      { id: 'knock', type: 'noise', name: 'knock', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'knock-f', type: 'filter', name: 'knock', ftype: 'bandpass', freq: 1100, Q: 1.2 },
      { id: 'knock-g', type: 'gain', name: 'knock', gain: 0 },
      { id: 'knock-e', type: 'env', name: 'knock', peak: 0.45, attack: 0.001, decay: 0.03, sustain: 0 },
      { id: 'out', type: 'out', name: 'output', gain: 0.55 },
    ],
    cables: [
      { from: 'thud', to: 'thud-g' }, { from: 'thud-p', to: 'thud', port: 'freq' }, { from: 'thud-e', to: 'thud-g', port: 'gain' }, { from: 'thud-g', to: 'out' },
      { from: 'knock', to: 'knock-f' }, { from: 'knock-f', to: 'knock-g' }, { from: 'knock-e', to: 'knock-g', port: 'gain' }, { from: 'knock-g', to: 'out' },
    ],
  },
  // ── end of WAGONS ──
  // ── TOWN (Bandit Math: the town's sounds, 2026-10-13) ──
  // Made in the browser for the town (math-games/bandit-math/src/audio/ambience.js, TOWN_PATCHES there): a pig's grunt, a
  // hoof on the dirt and in water (played for every hoof of the player's horse as it lands), and the creek's murmur. Hits
  // are bursts of noise, never ringing tones. After tuning one here, export it and paste it over its copy in the game's
  // TOWN_PATCHES (the hammer and the saw are the Windmill lab's code, not patches).
  'TOWN — GRUNT': {
    name: 'Pig grunt', group: 'TOWN', kind: 'perc', dur: 0.4,
    nodes: [
      { id: 'buzz', type: 'noise', name: 'throat', freq: 95, steps: 1, loopLen: 1, rate: 1, level: 1 },
      { id: 'drop', type: 'env', name: 'pitch drop', peak: 0.35, attack: 0.001, decay: 0.16, sustain: 0 },
      { id: 'f1', type: 'filter', name: 'mouth 1', ftype: 'bandpass', freq: 380, Q: 2.5 },
      { id: 'f2', type: 'filter', name: 'mouth 2', ftype: 'bandpass', freq: 850, Q: 4 },
      { id: 'f2-g', type: 'gain', name: 'mouth 2', gain: 0.6 },
      { id: 'vca', type: 'gain', name: 'loudness', gain: 0 },
      { id: 'amp', type: 'env', name: 'loudness', peak: 1, attack: 0.02, attackCurve: 'lin', decay: 0.17, sustain: 0 },
      { id: 'soft', type: 'filter', name: 'soft top', ftype: 'lowpass', freq: 1400, Q: 0.5 },
      { id: 'out', type: 'out', name: 'output', gain: 1.4 },
    ],
    cables: [
      { from: 'drop', to: 'buzz', port: 'rate' },
      { from: 'buzz', to: 'f1' },
      { from: 'buzz', to: 'f2' },
      { from: 'f2', to: 'f2-g' },
      { from: 'f1', to: 'vca' },
      { from: 'f2-g', to: 'vca' },
      { from: 'amp', to: 'vca', port: 'gain' },
      { from: 'vca', to: 'soft' },
      { from: 'soft', to: 'out' },
    ],
  },
  'TOWN — HOOF': {
    name: 'Hoof on dirt (noise)', group: 'TOWN', kind: 'perc', dur: 0.2,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'thump-f', type: 'filter', name: 'thump', ftype: 'lowpass', freq: 260, Q: 0.8 },
      { id: 'thump-g', type: 'gain', name: 'thump', gain: 0 },
      { id: 'thump-e', type: 'env', name: 'thump', peak: 1.4, attack: 0.002, decay: 0.07, sustain: 0 },
      { id: 'knock-f', type: 'filter', name: 'knock', ftype: 'bandpass', freq: 1100, Q: 1.2 },
      { id: 'knock-g', type: 'gain', name: 'knock', gain: 0 },
      { id: 'knock-e', type: 'env', name: 'knock', peak: 0.4, attack: 0.001, decay: 0.025, sustain: 0 },
      { id: 'grit-f', type: 'filter', name: 'grit', ftype: 'highpass', freq: 2600, Q: 0.7 },
      { id: 'grit-g', type: 'gain', name: 'grit', gain: 0 },
      { id: 'grit-e', type: 'env', name: 'grit', peak: 0.1, attack: 0.001, decay: 0.03, sustain: 0, delay: 0.004 },
      { id: 'out', type: 'out', name: 'output', gain: 0.6 },
    ],
    cables: [
      { from: 'n', to: 'thump-f' },
      { from: 'thump-f', to: 'thump-g' },
      { from: 'thump-e', to: 'thump-g', port: 'gain' },
      { from: 'thump-g', to: 'out' },
      { from: 'n', to: 'knock-f' },
      { from: 'knock-f', to: 'knock-g' },
      { from: 'knock-e', to: 'knock-g', port: 'gain' },
      { from: 'knock-g', to: 'out' },
      { from: 'n', to: 'grit-f' },
      { from: 'grit-f', to: 'grit-g' },
      { from: 'grit-e', to: 'grit-g', port: 'gain' },
      { from: 'grit-g', to: 'out' },
    ],
  },
  'TOWN — HOOF SPLASH': {
    name: 'Hoof in water', group: 'TOWN', kind: 'perc', dur: 0.35,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'slap-f', type: 'filter', name: 'slap', ftype: 'bandpass', freq: 700, Q: 0.7 },
      { id: 'slap-g', type: 'gain', name: 'slap', gain: 0 },
      { id: 'slap-e', type: 'env', name: 'slap', peak: 0.7, attack: 0.004, decay: 0.09, sustain: 0 },
      { id: 'spray-f', type: 'filter', name: 'spray', ftype: 'bandpass', freq: 3800, Q: 0.6 },
      { id: 'spray-g', type: 'gain', name: 'spray', gain: 0 },
      { id: 'spray-e', type: 'env', name: 'spray', peak: 0.35, attack: 0.015, decay: 0.2, sustain: 0, delay: 0.01 },
      { id: 'out', type: 'out', name: 'output', gain: 0.6 },
    ],
    cables: [
      { from: 'n', to: 'slap-f' },
      { from: 'slap-f', to: 'slap-g' },
      { from: 'slap-e', to: 'slap-g', port: 'gain' },
      { from: 'slap-g', to: 'out' },
      { from: 'n', to: 'spray-f' },
      { from: 'spray-f', to: 'spray-g' },
      { from: 'spray-e', to: 'spray-g', port: 'gain' },
      { from: 'spray-g', to: 'out' },
    ],
  },
  'TOWN — CREEK': {
    name: 'Creek murmur', group: 'TOWN', kind: 'engine', dur: 3,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'wash', type: 'filter', name: 'wash', ftype: 'bandpass', freq: 650, Q: 0.6 },
      { id: 'wash-g', type: 'gain', name: 'wash', gain: 0.5 },
      { id: 'bab', type: 'filter', name: 'babble', ftype: 'bandpass', freq: 1900, Q: 2.2 },
      { id: 'jump', type: 'noise', name: 'babble jumps', freq: 7, steps: 1, loopLen: 3, rate: 1, level: 700 },
      { id: 'bab-g', type: 'gain', name: 'babble', gain: 0.55 },
      { id: 'swell', type: 'osc', name: 'swell', wave: 'sine', freq: 0.13, level: 0.2 },
      { id: 'bus', type: 'gain', name: 'mix', gain: 0.8 },
      { id: 'out', type: 'out', name: 'output', gain: 0.7 },
    ],
    cables: [
      { from: 'n', to: 'wash' },
      { from: 'wash', to: 'wash-g' },
      { from: 'wash-g', to: 'bus' },
      { from: 'n', to: 'bab' },
      { from: 'jump', to: 'bab', port: 'freq' },
      { from: 'bab', to: 'bab-g' },
      { from: 'bab-g', to: 'bus' },
      { from: 'swell', to: 'bus', port: 'gain' },
      { from: 'bus', to: 'out' },
    ],
  },
  // ── end of TOWN ──
  // ── RANGE (Bandit Math: the target range in Shooting mode, 2026-10-14) ──
  // Made for the target range (math-games/bandit-math/src/audio/rangesound.js, RANGE_PATCHES there: keep the two copies the
  // same): the six-shooter, a tin can knocked off the plank, a bottle bursting, a glancing shot, a shot into the hay, the
  // hammer's click. All noise through filters, no ringing tones (hits and knocks are noise bursts).
  'RANGE — SHOT': {
    name: 'Six-shooter', group: 'RANGE', kind: 'perc', dur: 0.7,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'crack-f', type: 'filter', name: 'crack', ftype: 'highpass', freq: 2200, Q: 0.7 },
      { id: 'crack-g', type: 'gain', name: 'crack', gain: 0 },
      { id: 'crack-e', type: 'env', name: 'crack', peak: 1.6, attack: 0.001, decay: 0.035, sustain: 0, delay: 0 },
      { id: 'bark-f', type: 'filter', name: 'bark', ftype: 'bandpass', freq: 700, Q: 0.9 },
      { id: 'bark-g', type: 'gain', name: 'bark', gain: 0 },
      { id: 'bark-e', type: 'env', name: 'bark', peak: 1.2, attack: 0.001, decay: 0.13, sustain: 0, delay: 0 },
      { id: 'thump-f', type: 'filter', name: 'thump', ftype: 'lowpass', freq: 170, Q: 0.8 },
      { id: 'thump-g', type: 'gain', name: 'thump', gain: 0 },
      { id: 'thump-e', type: 'env', name: 'thump', peak: 2.2, attack: 0.001, decay: 0.22, sustain: 0, delay: 0 },
      { id: 'air-f', type: 'filter', name: 'open air', ftype: 'bandpass', freq: 1300, Q: 0.5 },
      { id: 'air-g', type: 'gain', name: 'open air', gain: 0 },
      { id: 'air-e', type: 'env', name: 'open air', peak: 0.12, attack: 0.001, decay: 0.45, sustain: 0, delay: 0.03 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      {from: 'n', to: 'crack-f' },
      {from: 'crack-f', to: 'crack-g' },
      {from: 'crack-e', to: 'crack-g', port: 'gain' },
      {from: 'crack-g', to: 'out' },
      {from: 'n', to: 'bark-f' },
      {from: 'bark-f', to: 'bark-g' },
      {from: 'bark-e', to: 'bark-g', port: 'gain' },
      {from: 'bark-g', to: 'out' },
      {from: 'n', to: 'thump-f' },
      {from: 'thump-f', to: 'thump-g' },
      {from: 'thump-e', to: 'thump-g', port: 'gain' },
      {from: 'thump-g', to: 'out' },
      {from: 'n', to: 'air-f' },
      {from: 'air-f', to: 'air-g' },
      {from: 'air-e', to: 'air-g', port: 'gain' },
      {from: 'air-g', to: 'out' },
    ],
   },
  'RANGE — CLANK': {
    name: 'Tin can hit', group: 'RANGE', kind: 'perc', dur: 0.3,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'tick-f', type: 'filter', name: 'tick', ftype: 'highpass', freq: 3500, Q: 0.7 },
      { id: 'tick-g', type: 'gain', name: 'tick', gain: 0 },
      { id: 'tick-e', type: 'env', name: 'tick', peak: 0.9, attack: 0.001, decay: 0.012, sustain: 0, delay: 0 },
      { id: 'tin1-f', type: 'filter', name: 'tin', ftype: 'bandpass', freq: 1750, Q: 3 },
      { id: 'tin1-g', type: 'gain', name: 'tin', gain: 0 },
      { id: 'tin1-e', type: 'env', name: 'tin', peak: 1.4, attack: 0.001, decay: 0.07, sustain: 0, delay: 0 },
      { id: 'tin2-f', type: 'filter', name: 'tin, higher', ftype: 'bandpass', freq: 3300, Q: 3.5 },
      { id: 'tin2-g', type: 'gain', name: 'tin, higher', gain: 0 },
      { id: 'tin2-e', type: 'env', name: 'tin, higher', peak: 0.9, attack: 0.001, decay: 0.05, sustain: 0, delay: 0.004 },
      { id: 'body-f', type: 'filter', name: 'knock', ftype: 'lowpass', freq: 600, Q: 0.7 },
      { id: 'body-g', type: 'gain', name: 'knock', gain: 0 },
      { id: 'body-e', type: 'env', name: 'knock', peak: 0.6, attack: 0.001, decay: 0.04, sustain: 0, delay: 0 },
      { id: 'out', type: 'out', name: 'output', gain: 0.8 },
    ],
    cables: [
      {from: 'n', to: 'tick-f' },
      {from: 'tick-f', to: 'tick-g' },
      {from: 'tick-e', to: 'tick-g', port: 'gain' },
      {from: 'tick-g', to: 'out' },
      {from: 'n', to: 'tin1-f' },
      {from: 'tin1-f', to: 'tin1-g' },
      {from: 'tin1-e', to: 'tin1-g', port: 'gain' },
      {from: 'tin1-g', to: 'out' },
      {from: 'n', to: 'tin2-f' },
      {from: 'tin2-f', to: 'tin2-g' },
      {from: 'tin2-e', to: 'tin2-g', port: 'gain' },
      {from: 'tin2-g', to: 'out' },
      {from: 'n', to: 'body-f' },
      {from: 'body-f', to: 'body-g' },
      {from: 'body-e', to: 'body-g', port: 'gain' },
      {from: 'body-g', to: 'out' },
    ],
   },
  'RANGE — SHATTER': {
    name: 'Bottle bursting', group: 'RANGE', kind: 'perc', dur: 0.8,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'crack-f', type: 'filter', name: 'crack', ftype: 'highpass', freq: 2500, Q: 0.7 },
      { id: 'crack-g', type: 'gain', name: 'crack', gain: 0 },
      { id: 'crack-e', type: 'env', name: 'crack', peak: 1.3, attack: 0.001, decay: 0.04, sustain: 0, delay: 0 },
      { id: 'burst-f', type: 'filter', name: 'burst', ftype: 'bandpass', freq: 4200, Q: 1.2 },
      { id: 'burst-g', type: 'gain', name: 'burst', gain: 0 },
      { id: 'burst-e', type: 'env', name: 'burst', peak: 0.9, attack: 0.001, decay: 0.16, sustain: 0, delay: 0 },
      { id: 'bits1-f', type: 'filter', name: 'falling bits', ftype: 'highpass', freq: 6000, Q: 0.8 },
      { id: 'bits1-g', type: 'gain', name: 'falling bits', gain: 0 },
      { id: 'bits1-e', type: 'env', name: 'falling bits', peak: 0.5, attack: 0.001, decay: 0.02, sustain: 0, delay: 0.09 },
      { id: 'bits2-f', type: 'filter', name: 'falling bits', ftype: 'highpass', freq: 5200, Q: 0.8 },
      { id: 'bits2-g', type: 'gain', name: 'falling bits', gain: 0 },
      { id: 'bits2-e', type: 'env', name: 'falling bits', peak: 0.4, attack: 0.001, decay: 0.018, sustain: 0, delay: 0.17 },
      { id: 'bits3-f', type: 'filter', name: 'falling bits', ftype: 'highpass', freq: 6800, Q: 0.8 },
      { id: 'bits3-g', type: 'gain', name: 'falling bits', gain: 0 },
      { id: 'bits3-e', type: 'env', name: 'falling bits', peak: 0.35, attack: 0.001, decay: 0.02, sustain: 0, delay: 0.26 },
      { id: 'bits4-f', type: 'filter', name: 'falling bits', ftype: 'highpass', freq: 5600, Q: 0.8 },
      { id: 'bits4-g', type: 'gain', name: 'falling bits', gain: 0 },
      { id: 'bits4-e', type: 'env', name: 'falling bits', peak: 0.25, attack: 0.001, decay: 0.016, sustain: 0, delay: 0.38 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      {from: 'n', to: 'crack-f' },
      {from: 'crack-f', to: 'crack-g' },
      {from: 'crack-e', to: 'crack-g', port: 'gain' },
      {from: 'crack-g', to: 'out' },
      {from: 'n', to: 'burst-f' },
      {from: 'burst-f', to: 'burst-g' },
      {from: 'burst-e', to: 'burst-g', port: 'gain' },
      {from: 'burst-g', to: 'out' },
      {from: 'n', to: 'bits1-f' },
      {from: 'bits1-f', to: 'bits1-g' },
      {from: 'bits1-e', to: 'bits1-g', port: 'gain' },
      {from: 'bits1-g', to: 'out' },
      {from: 'n', to: 'bits2-f' },
      {from: 'bits2-f', to: 'bits2-g' },
      {from: 'bits2-e', to: 'bits2-g', port: 'gain' },
      {from: 'bits2-g', to: 'out' },
      {from: 'n', to: 'bits3-f' },
      {from: 'bits3-f', to: 'bits3-g' },
      {from: 'bits3-e', to: 'bits3-g', port: 'gain' },
      {from: 'bits3-g', to: 'out' },
      {from: 'n', to: 'bits4-f' },
      {from: 'bits4-f', to: 'bits4-g' },
      {from: 'bits4-e', to: 'bits4-g', port: 'gain' },
      {from: 'bits4-g', to: 'out' },
    ],
   },
  'RANGE — PING': {
    name: 'Glancing shot', group: 'RANGE', kind: 'perc', dur: 0.45,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'tick-f', type: 'filter', name: 'tick', ftype: 'highpass', freq: 3000, Q: 0.7 },
      { id: 'tick-g', type: 'gain', name: 'tick', gain: 0 },
      { id: 'tick-e', type: 'env', name: 'tick', peak: 0.8, attack: 0.001, decay: 0.012, sustain: 0, delay: 0 },
      { id: 'zing-f', type: 'filter', name: 'zing', ftype: 'bandpass', freq: 5200, Q: 7, freqEnd: 1500, glide: 0.3 },
      { id: 'zing-g', type: 'gain', name: 'zing', gain: 0 },
      { id: 'zing-e', type: 'env', name: 'zing', peak: 1.6, attack: 0.001, decay: 0.28, sustain: 0, delay: 0.006 },
      { id: 'out', type: 'out', name: 'output', gain: 0.55 },
    ],
    cables: [
      {from: 'n', to: 'tick-f' },
      {from: 'tick-f', to: 'tick-g' },
      {from: 'tick-e', to: 'tick-g', port: 'gain' },
      {from: 'tick-g', to: 'out' },
      {from: 'n', to: 'zing-f' },
      {from: 'zing-f', to: 'zing-g' },
      {from: 'zing-e', to: 'zing-g', port: 'gain' },
      {from: 'zing-g', to: 'out' },
    ],
   },
  'RANGE — THUD': {
    name: 'Shot into the hay', group: 'RANGE', kind: 'perc', dur: 0.3,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'thud-f', type: 'filter', name: 'thud', ftype: 'lowpass', freq: 320, Q: 0.8 },
      { id: 'thud-g', type: 'gain', name: 'thud', gain: 0 },
      { id: 'thud-e', type: 'env', name: 'thud', peak: 1.4, attack: 0.001, decay: 0.07, sustain: 0, delay: 0 },
      { id: 'hiss-f', type: 'filter', name: 'dirt', ftype: 'bandpass', freq: 2400, Q: 0.8 },
      { id: 'hiss-g', type: 'gain', name: 'dirt', gain: 0 },
      { id: 'hiss-e', type: 'env', name: 'dirt', peak: 0.2, attack: 0.001, decay: 0.09, sustain: 0, delay: 0.01 },
      { id: 'out', type: 'out', name: 'output', gain: 1.2 },
    ],
    cables: [
      {from: 'n', to: 'thud-f' },
      {from: 'thud-f', to: 'thud-g' },
      {from: 'thud-e', to: 'thud-g', port: 'gain' },
      {from: 'thud-g', to: 'out' },
      {from: 'n', to: 'hiss-f' },
      {from: 'hiss-f', to: 'hiss-g' },
      {from: 'hiss-e', to: 'hiss-g', port: 'gain' },
      {from: 'hiss-g', to: 'out' },
    ],
   },
  'RANGE — CLICK': {
    name: 'Hammer click', group: 'RANGE', kind: 'perc', dur: 0.12,
    nodes: [
      { id: 'n', name: 'noise', type: 'noise', freq: 600, steps: 256, loopLen: 1, rate: 1, level: 1 },
      { id: 'tick-f', type: 'filter', name: 'tick', ftype: 'bandpass', freq: 2600, Q: 2 },
      { id: 'tick-g', type: 'gain', name: 'tick', gain: 0 },
      { id: 'tick-e', type: 'env', name: 'tick', peak: 0.6, attack: 0.001, decay: 0.008, sustain: 0, delay: 0 },
      { id: 'tock-f', type: 'filter', name: 'tock', ftype: 'bandpass', freq: 1500, Q: 2 },
      { id: 'tock-g', type: 'gain', name: 'tock', gain: 0 },
      { id: 'tock-e', type: 'env', name: 'tock', peak: 0.35, attack: 0.001, decay: 0.01, sustain: 0, delay: 0.035 },
      { id: 'out', type: 'out', name: 'output', gain: 0.5 },
    ],
    cables: [
      {from: 'n', to: 'tick-f' },
      {from: 'tick-f', to: 'tick-g' },
      {from: 'tick-e', to: 'tick-g', port: 'gain' },
      {from: 'tick-g', to: 'out' },
      {from: 'n', to: 'tock-f' },
      {from: 'tock-f', to: 'tock-g' },
      {from: 'tock-e', to: 'tock-g', port: 'gain' },
      {from: 'tock-g', to: 'out' },
    ],
   },
  // ── end of RANGE ──
};
