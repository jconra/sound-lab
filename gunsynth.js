// gunsynth.js — procedural weapon-fire synthesis for the Sound Lab.
//
// Pure Web Audio (no samples). One entry point, playShot(), dispatches on cfg.kind:
//
//   'ballistic' — the classic shot shape: an instant CRACK (highpassed noise snap) +
//                 a noise BODY (the report) + a pitched TONE (discharge). Short, hard
//                 envelopes. Right for autocannons and pulse-lasers.
//
//   'rocket'    — a MISSILE/rocket-motor launch: a brief IGNITE transient, then a
//                 broadband ROAR that swells (lowpass opens, gain rises) and sustains
//                 before tailing off, a low thrust BODY rumble, a departing pitch
//                 WHISTLE that climbs as it accelerates away, and an exhaust CRACKLE
//                 sizzle. This is a *building* sound, not a snap — that's the whole point.
//
//   'railgun'   — a capacitor bank WHINING UP (rising detuned tone + rising resonant
//                 electric SHIMMER + a flutter that speeds up) over ~0.5–1s, then a
//                 violent DISCHARGE: a whip-CRACK snap + a collapsing low BOOM + a sub
//                 TAIL, drenched in reverb. The charge time is baked into the preset.
//
// The signature matches the game's SoundManager.makeShot(ctx, noiseBuffer, dest,
// reverbInput, cfg) so a chosen preset config drops straight into the game unchanged.

// ── Shared buffers ──────────────────────────────────────────────────────────────
export function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Exponentially-decaying stereo noise = a cheap convolution reverb impulse.
export function makeImpulse(ctx, dur, decay) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const FLOOR = 0.0005;   // exponential ramps can't reach 0 — decay to this instead

// Waveshaper curve for saturation/grit. amount 0..1 → clean … torn-apart.
// Classic tanh-ish soft-clip; `amount` is scaled gently (and the caller drives it
// progressively) so the knob spreads its effect across its whole range instead of
// slamming into a hard clip by ~0.3.
function distortionCurve(amount) {
  const n = 1024, curve = new Float32Array(n), k = amount * amount * 45;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (3 + k) * x * 0.3490659 / (Math.PI + k * Math.abs(x)); // 20°·(π/180)=0.349
  }
  return curve;
}

// ── 'ballistic' — crack + body + tone ───────────────────────────────────────────
function playBallistic(ctx, noise, bus, t0, cfg) {
  let endT = 0.05;

  const c = cfg.crack;
  if (c && c.level > 0) {
    const cs = ctx.createBufferSource();
    cs.buffer = noise; cs.loop = true;
    cs.playbackRate.value = 1 + Math.random() * 0.12;
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass'; cf.frequency.value = c.freq; cf.Q.value = c.Q;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(c.level, t0);
    cg.gain.exponentialRampToValueAtTime(FLOOR, t0 + c.decay);
    cs.connect(cf).connect(cg).connect(bus);
    cs.start(t0); cs.stop(t0 + c.decay + 0.05);
    endT = Math.max(endT, c.decay);
  }

  const n = cfg.noise;
  if (n && n.level > 0) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = n.type;
    f.frequency.setValueAtTime(n.freq, t0);
    if (n.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, n.freqEnd), t0 + n.decay);
    f.Q.value = n.Q;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t0);
    ng.gain.linearRampToValueAtTime(n.level, t0 + 0.002);
    ng.gain.setTargetAtTime(0, t0 + 0.004, n.decay / 3);
    src.connect(f).connect(ng).connect(bus);
    src.start(t0); src.stop(t0 + n.decay + 0.1);
    endT = Math.max(endT, n.decay);
  }

  const tn = cfg.tone;
  if (tn && tn.level > 0) {
    const osc = ctx.createOscillator();
    osc.type = tn.wave;
    osc.frequency.setValueAtTime(tn.f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, tn.f1), t0 + tn.decay);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0, t0);
    tg.gain.linearRampToValueAtTime(tn.level, t0 + 0.003);
    tg.gain.setTargetAtTime(0, t0 + 0.005, tn.decay / 3);
    osc.connect(tg).connect(bus);
    osc.start(t0); osc.stop(t0 + tn.decay + 0.1);
    endT = Math.max(endT, tn.decay);
  }

  return endT;
}

// ── 'rocket' — igniting motor that swells and shoots away ────────────────────────
function playRocket(ctx, noise, bus, t0, cfg) {
  let endT = 0.05;

  // IGNITE — the initial whoomph/spark of catching fire.
  const ig = cfg.ignite;
  if (ig && ig.level > 0) {
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true; s.playbackRate.value = 1 + Math.random() * 0.1;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = ig.freq; f.Q.value = ig.Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(ig.level, t0);
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + ig.decay);
    s.connect(f).connect(g).connect(bus);
    s.start(t0); s.stop(t0 + ig.decay + 0.05);
    endT = Math.max(endT, ig.decay);
  }

  // ROAR — broadband noise; lowpass opens to a peak then closes, gain swells then
  // tails. Optional GRIT (waveshaper saturation) and CHAOS (low-freq amplitude
  // turbulence) tear it into a gritty, churning motor instead of a smooth hiss.
  const r = cfg.roar;
  if (r && r.level > 0) {
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = r.q || 0.7;
    const dur = r.attack + r.hold + r.decay;
    f.frequency.setValueAtTime(r.lpStart, t0);
    f.frequency.linearRampToValueAtTime(r.lpPeak, t0 + r.attack);
    f.frequency.linearRampToValueAtTime(r.lpEnd, t0 + dur);

    let head = s.connect(f);   // .connect() returns the destination node

    // GRIT — drive the noise into a waveshaper for torn, saturated crunch. Drive
    // ramps quadratically so low settings stay gentle and the range is usable.
    if (r.grit > 0) {
      const drive = ctx.createGain();
      drive.gain.value = 1 + r.grit * r.grit * 14;   // gentle low, fierce high
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(r.grit);
      shaper.oversample = '4x';
      const trim = ctx.createGain();
      trim.gain.value = 1 / (1 + r.grit * 1.6);      // tame the clipping makeup gain
      head = head.connect(drive).connect(shaper).connect(trim);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.exponentialRampToValueAtTime(r.level, t0 + r.attack);
    g.gain.setValueAtTime(r.level, t0 + r.attack + r.hold);
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);

    // CHAOS — a sample-and-hold modulator MULTIPLIES the roar so it sputters and
    // churns. gain swings between (1−chaos) and (1+chaos) at ~chaosRate jumps;
    // a light slew rounds the steps so they churn instead of click.
    if (r.chaos > 0) {
      const sr = ctx.sampleRate, len = Math.ceil((dur + 0.2) * sr);
      const mbuf = ctx.createBuffer(1, len, sr), md = mbuf.getChannelData(0);
      const hold = Math.max(1, Math.floor(sr / (r.chaosRate || 30)));
      let val = 0, target = 0;
      for (let i = 0; i < len; i++) {
        if (i % hold === 0) target = Math.random() * 2 - 1;
        val += (target - val) * 0.02;                // ~light smoothing
        md[i] = val;
      }
      const msrc = ctx.createBufferSource(); msrc.buffer = mbuf;
      const depth = ctx.createGain(); depth.gain.value = r.chaos;
      const mod = ctx.createGain(); mod.gain.value = 1;   // series multiplier
      msrc.connect(depth).connect(mod.gain);              // mod.gain = 1 + chaos·S&H
      head.connect(g).connect(mod).connect(bus);
      msrc.start(t0); msrc.stop(t0 + dur + 0.1);
    } else {
      head.connect(g).connect(bus);
    }

    s.start(t0); s.stop(t0 + dur + 0.1);
    endT = Math.max(endT, dur);
  }

  // BODY — low thrust rumble under everything. A resonant lowpass (q) gives it a
  // pitched bump so it's actually felt instead of buried under the roar.
  const b = cfg.body;
  if (b && b.level > 0) {
    const dur = b.decay || 0.6;
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = b.freq; f.Q.value = b.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.exponentialRampToValueAtTime(b.level, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t0); s.stop(t0 + dur + 0.1);
    endT = Math.max(endT, dur);
  }

  // WHISTLE — the departing missile: pitch climbs as it accelerates away.
  const w = cfg.whistle;
  if (w && w.level > 0) {
    const o = ctx.createOscillator();
    o.type = w.wave || 'sawtooth';
    o.frequency.setValueAtTime(w.f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, w.f1), t0 + w.decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.exponentialRampToValueAtTime(w.level, t0 + w.decay * 0.5);
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + w.decay);
    o.connect(g).connect(bus);
    o.start(t0); o.stop(t0 + w.decay + 0.1);
    endT = Math.max(endT, w.decay);
  }

  // CRACKLE — exhaust sizzle: high-band noise gated by a fast flutter LFO.
  const cr = cfg.crackle;
  if (cr && cr.level > 0) {
    const dur = cr.decay || 0.7;
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true; s.playbackRate.value = 1.3;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = cr.freq; f.Q.value = 0.7;
    const flutter = ctx.createGain();
    flutter.gain.value = 1 - cr.depth;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth'; lfo.frequency.value = cr.rate;
    const ld = ctx.createGain(); ld.gain.value = cr.depth;
    lfo.connect(ld).connect(flutter.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(FLOOR, t0);
    env.gain.exponentialRampToValueAtTime(cr.level, t0 + 0.05);
    env.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
    s.connect(f).connect(flutter).connect(env).connect(bus);
    lfo.start(t0); lfo.stop(t0 + dur + 0.1);
    s.start(t0); s.stop(t0 + dur + 0.1);
    endT = Math.max(endT, dur);
  }

  return endT;
}

// ── 'railgun' — capacitors whine up, then crack like a whip ───────────────────────
function playRailgun(ctx, noise, bus, t0, cfg) {
  let endT = 0.05;
  const ch = cfg.charge;
  const fireT = t0 + (ch ? ch.dur : 0);   // discharge fires after the charge

  if (ch && ch.level > 0) {
    // Rising detuned whine — two oscs for a thick capacitor-bank tone.
    for (const sign of [-1, 1]) {
      const o = ctx.createOscillator();
      o.type = ch.wave || 'sawtooth';
      o.frequency.setValueAtTime(ch.f0, t0);
      o.frequency.exponentialRampToValueAtTime(ch.f1, fireT);
      o.detune.value = sign * (ch.detune || 0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(FLOOR, t0);
      g.gain.exponentialRampToValueAtTime(ch.level, fireT);
      g.gain.exponentialRampToValueAtTime(FLOOR, fireT + 0.02);   // snap silent at discharge

      if (ch.amDepth > 0) {
        // Flutter that speeds up as it charges (the "spinning up" feel).
        const amBase = ctx.createGain();
        amBase.gain.value = 1 - ch.amDepth;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(ch.amStart, t0);
        lfo.frequency.exponentialRampToValueAtTime(ch.amEnd, fireT);
        const ld = ctx.createGain(); ld.gain.value = ch.amDepth;
        lfo.connect(ld).connect(amBase.gain);
        o.connect(amBase).connect(g).connect(bus);
        lfo.start(t0); lfo.stop(fireT + 0.05);
      } else {
        o.connect(g).connect(bus);
      }
      o.start(t0); o.stop(fireT + 0.05);
    }

    // Electric SHIMMER — a resonant noise band sweeping up alongside the whine.
    if (ch.shimmerLevel > 0) {
      const s = ctx.createBufferSource();
      s.buffer = noise; s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = ch.shimmerQ || 8;
      f.frequency.setValueAtTime(ch.shimmerStart, t0);
      f.frequency.exponentialRampToValueAtTime(ch.shimmerEnd, fireT);
      const g = ctx.createGain();
      g.gain.setValueAtTime(FLOOR, t0);
      g.gain.exponentialRampToValueAtTime(ch.shimmerLevel, fireT);
      g.gain.exponentialRampToValueAtTime(FLOOR, fireT + 0.02);
      s.connect(f).connect(g).connect(bus);
      s.start(t0); s.stop(fireT + 0.05);
    }
    endT = Math.max(endT, ch.dur);
  }

  const off = fireT - t0;   // discharge sections measure their tail from here

  // CRACK — the whip snap: super-sharp highpassed noise transient.
  const cr = cfg.crack;
  if (cr && cr.level > 0) {
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true; s.playbackRate.value = 1 + Math.random() * 0.1;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = cr.freq; f.Q.value = cr.Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(cr.level, fireT);
    g.gain.exponentialRampToValueAtTime(FLOOR, fireT + cr.decay);
    s.connect(f).connect(g).connect(bus);
    s.start(fireT); s.stop(fireT + cr.decay + 0.05);
    endT = Math.max(endT, off + cr.decay);
  }

  // BOOM — the discharge body, a low tone collapsing fast.
  const bm = cfg.boom;
  if (bm && bm.level > 0) {
    const o = ctx.createOscillator();
    o.type = bm.wave || 'sawtooth';
    o.frequency.setValueAtTime(bm.f0, fireT);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, bm.f1), fireT + bm.decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, fireT);
    g.gain.linearRampToValueAtTime(bm.level, fireT + 0.004);
    g.gain.setTargetAtTime(0, fireT + 0.01, bm.decay / 3);
    o.connect(g).connect(bus);
    o.start(fireT); o.stop(fireT + bm.decay + 0.1);
    endT = Math.max(endT, off + bm.decay);
  }

  // TAIL — the sub rumble that booms out after the crack.
  const tl = cfg.tail;
  if (tl && tl.level > 0) {
    const s = ctx.createBufferSource();
    s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = tl.freq; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, fireT);
    g.gain.linearRampToValueAtTime(tl.level, fireT + 0.01);
    g.gain.exponentialRampToValueAtTime(FLOOR, fireT + tl.decay);
    s.connect(f).connect(g).connect(bus);
    s.start(fireT); s.stop(fireT + tl.decay + 0.1);
    endT = Math.max(endT, off + tl.decay);
  }

  return endT;
}

// ── 'engine' — jsfxr-style STEPPED-NOISE motor ───────────────────────────────────
// Noise is read from a small N-slot buffer that re-randomizes every cycle: a hard-
// edged staircase whose steps land at N×freq. So even a LOW freq carries a bright
// whine (the steps) on top of a deep chug (the cycle) — the exact jsfxr behaviour.
// A 'rev' pitch-jump and a 'slide' animate it like a real motor revving.
function playEngine(ctx, noise, bus, t0, cfg) {
  const e = cfg.engine;
  if (!e || e.level <= 0) return 0.05;
  const sr = ctx.sampleRate;
  const steps = Math.max(2, Math.round(e.steps || 32));
  const att = e.attack || 0.01, sus = e.sustain ?? 0.5, dec = e.decay || 0.2;
  const dur = att + sus + dec;
  const revAt = e.revAt || 0, revMult = e.revMult || 1, slide = e.slide || 0;

  // Build the stepped-noise waveform by hand — no native node does this.
  const len = Math.ceil((dur + 0.05) * sr);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const nb = new Float64Array(steps);
  for (let i = 0; i < steps; i++) nb[i] = Math.random() * 2 - 1;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / sr;
    let f = e.freq * Math.pow(2, slide * tt);      // slide in octaves/sec
    if (revAt && tt >= revAt) f *= revMult;         // the rev / arpeggio jump
    const period = sr / Math.max(1, f);
    phase++;
    if (phase >= period) { phase -= period; for (let k = 0; k < steps; k++) nb[k] = Math.random() * 2 - 1; }
    d[i] = nb[Math.min(steps - 1, Math.floor((phase / period) * steps))];
  }
  const src = ctx.createBufferSource(); src.buffer = buf;

  // tone shaping — a resonant lowpass (res → Q) tames or whistles the highs
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = e.lpf || 8000; lp.Q.value = e.res || 0.7;

  const g = ctx.createGain();   // amp envelope
  const lvl = Math.max(FLOOR, e.level);
  g.gain.setValueAtTime(FLOOR, t0);
  g.gain.exponentialRampToValueAtTime(lvl, t0 + att);
  g.gain.setValueAtTime(lvl, t0 + att + sus);
  g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);

  src.connect(lp).connect(g).connect(bus);
  src.start(t0); src.stop(t0 + dur + 0.05);
  return dur;
}

// ── Dispatcher ──────────────────────────────────────────────────────────────────
export function playShot(ctx, noise, dest, reverbInput, cfg) {
  const t0 = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.value = cfg.level ?? 1;
  bus.connect(dest);

  if (cfg.reverb > 0 && reverbInput) {
    const send = ctx.createGain();
    send.gain.value = cfg.reverb;
    bus.connect(send);
    send.connect(reverbInput);
  }

  let endT = 0.05;
  if (cfg.kind === 'rocket')       endT = playRocket(ctx, noise, bus, t0, cfg);
  else if (cfg.kind === 'railgun') endT = playRailgun(ctx, noise, bus, t0, cfg);
  else if (cfg.kind === 'engine')  endT = playEngine(ctx, noise, bus, t0, cfg);
  else                             endT = playBallistic(ctx, noise, bus, t0, cfg);

  // Free the dry bus once silent; the reverb tail lives on the shared convolver path.
  setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, (endT + 2.0) * 1000);
  return endT;
}

// ── Preset bank — varied options per gun, audition in the lab, bake the winners ───
// Each entry: { name, desc, cfg }. cfg is drop-in for the game's GUN_CONFIGS slot.
export const PRESETS = {
  'VALKYRIE — MISSILE': [
    { name: 'ROCKET A — Fast Launch', desc: 'punchy gritty roar, quick climb away',
      cfg: { kind: 'rocket', level: 0.9, reverb: 0.25,
        ignite:  { freq: 900, Q: 0.6, decay: 0.05, level: 0.25 },
        roar:    { lpStart: 300, lpPeak: 3500, lpEnd: 1200, q: 0.7, attack: 0.08, hold: 0.12, decay: 0.5, level: 0.9, grit: 0.35, chaos: 0.35, chaosRate: 30 },
        body:    { freq: 150, q: 3, level: 0.9, decay: 0.6 },
        whistle: { wave: 'sawtooth', f0: 400, f1: 1400, decay: 0.7, level: 0.18 },
        crackle: { freq: 3500, rate: 55, depth: 0.7, decay: 0.6, level: 0.12 } } },
    { name: 'ROCKET B — Heavy Roar', desc: 'deep sustained gritty motor, slower burn',
      cfg: { kind: 'rocket', level: 0.95, reverb: 0.35,
        ignite:  { freq: 600, Q: 0.5, decay: 0.08, level: 0.22 },
        roar:    { lpStart: 200, lpPeak: 2200, lpEnd: 900, q: 0.8, attack: 0.12, hold: 0.25, decay: 0.7, level: 1.0, grit: 0.5, chaos: 0.45, chaosRate: 20 },
        body:    { freq: 110, q: 4, level: 1.1, decay: 0.9 },
        whistle: { wave: 'sawtooth', f0: 300, f1: 900, decay: 0.9, level: 0.12 },
        crackle: { freq: 2800, rate: 40, depth: 0.6, decay: 0.8, level: 0.1 } } },
    { name: 'ROCKET C — Sizzle', desc: 'bright, churning, crackle-forward',
      cfg: { kind: 'rocket', level: 0.85, reverb: 0.2,
        ignite:  { freq: 1400, Q: 0.7, decay: 0.04, level: 0.28 },
        roar:    { lpStart: 400, lpPeak: 4500, lpEnd: 1600, q: 0.6, attack: 0.06, hold: 0.1, decay: 0.45, level: 0.8, grit: 0.5, chaos: 0.6, chaosRate: 45 },
        body:    { freq: 160, q: 3, level: 0.6, decay: 0.5 },
        whistle: { wave: 'square', f0: 500, f1: 1800, decay: 0.6, level: 0.14 },
        crackle: { freq: 4200, rate: 70, depth: 0.85, decay: 0.7, level: 0.18 } } },
    { name: 'ROCKET D — Gritty Chaos', desc: 'torn saturated roar, churning sputter, deep body',
      cfg: { kind: 'rocket', level: 0.95, reverb: 0.3,
        ignite:  { freq: 700, Q: 0.5, decay: 0.04, level: 0.2 },
        roar:    { lpStart: 250, lpPeak: 2600, lpEnd: 1000, q: 1.2, attack: 0.07, hold: 0.18, decay: 0.6, level: 1.0, grit: 0.65, chaos: 0.6, chaosRate: 22 },
        body:    { freq: 100, q: 5, level: 1.2, decay: 0.8 },
        whistle: { wave: 'sawtooth', f0: 320, f1: 1000, decay: 0.7, level: 0.08 },
        crackle: { freq: 3200, rate: 45, depth: 0.6, decay: 0.5, level: 0.08 } } },
  ],
  'ENGINE — STEPPED NOISE': [
    { name: 'ENGINE A — sfxr Motor', desc: 'jsfxr stepped-noise: deep chug + high whine, slow rev (bro’s liked sound)',
      cfg: { kind: 'engine', level: 0.9, reverb: 0.15,
        engine: { freq: 46, steps: 32, slide: -0.35, revAt: 0.18, revMult: 4, attack: 0.13, sustain: 0.68, decay: 0.16, lpf: 6000, res: 4, level: 0.9 } } },
    { name: 'ENGINE B — Idle Rumble', desc: 'low, steady, no rev — deeper and darker',
      cfg: { kind: 'engine', level: 0.9, reverb: 0.1,
        engine: { freq: 30, steps: 24, slide: 0, revAt: 0, revMult: 1, attack: 0.2, sustain: 0.9, decay: 0.3, lpf: 3500, res: 6, level: 0.95 } } },
    { name: 'ENGINE C — Whine Up', desc: 'pitch rises, bright staircase whine forward',
      cfg: { kind: 'engine', level: 0.85, reverb: 0.2,
        engine: { freq: 60, steps: 40, slide: 1.2, revAt: 0, revMult: 1, attack: 0.05, sustain: 0.5, decay: 0.25, lpf: 9000, res: 3, level: 0.9 } } },
  ],
  'JOTUN — RAILGUN': [
    { name: 'RAIL A — Sci-Fi Whine', desc: 'long charge, classic spin-up, big crack',
      cfg: { kind: 'railgun', level: 1.0, reverb: 0.7,
        charge: { f0: 120, f1: 1600, dur: 0.8, wave: 'sawtooth', detune: 8, level: 0.32,
                  shimmerStart: 600, shimmerEnd: 5000, shimmerQ: 9, shimmerLevel: 0.3,
                  amStart: 8, amEnd: 45, amDepth: 0.5 },
        crack: { freq: 3000, Q: 0.5, decay: 0.03, level: 1.6 },
        boom:  { wave: 'sawtooth', f0: 280, f1: 40, decay: 0.6, level: 0.8 },
        tail:  { freq: 200, decay: 1.2, level: 0.7 } } },
    { name: 'RAIL B — Brutal', desc: 'short menacing charge, savage crack + boom',
      cfg: { kind: 'railgun', level: 1.0, reverb: 0.85,
        charge: { f0: 90, f1: 1100, dur: 0.5, wave: 'square', detune: 6, level: 0.3,
                  shimmerStart: 500, shimmerEnd: 3800, shimmerQ: 7, shimmerLevel: 0.28,
                  amStart: 12, amEnd: 60, amDepth: 0.6 },
        crack: { freq: 3400, Q: 0.5, decay: 0.025, level: 1.6 },
        boom:  { wave: 'sawtooth', f0: 320, f1: 34, decay: 0.7, level: 0.9 },
        tail:  { freq: 160, decay: 1.4, level: 0.8 } } },
    { name: 'RAIL C — Harmonic', desc: 'longest charge, resonant detuned whine',
      cfg: { kind: 'railgun', level: 1.0, reverb: 0.6,
        charge: { f0: 160, f1: 2000, dur: 1.0, wave: 'sawtooth', detune: 12, level: 0.3,
                  shimmerStart: 800, shimmerEnd: 6500, shimmerQ: 11, shimmerLevel: 0.34,
                  amStart: 6, amEnd: 38, amDepth: 0.45 },
        crack: { freq: 2800, Q: 0.5, decay: 0.035, level: 1.5 },
        boom:  { wave: 'square', f0: 240, f1: 46, decay: 0.5, level: 0.75 },
        tail:  { freq: 220, decay: 1.0, level: 0.65 } } },
    { name: 'RAIL D — Your Pick', desc: 'dry hard crack, deep sine boom, no shimmer/tail',
      cfg: { kind: 'railgun', level: 1.5, reverb: 0,
        charge: { f0: 336, f1: 3000, dur: 1.31, wave: 'sawtooth', detune: 0, level: 0.14,
                  shimmerStart: 200, shimmerEnd: 1000, shimmerQ: 1, shimmerLevel: 0,
                  amStart: 30, amEnd: 10, amDepth: 1 },
        crack: { freq: 2530, Q: 0.1, decay: 0.08, level: 2.5 },
        boom:  { wave: 'sine', f0: 305, f1: 20, decay: 0.42, level: 1.5 },
        tail:  { freq: 390, decay: 0.75, level: 0 } } },
  ],
  'LURCHER — AUTOCANNON': [
    { name: 'GUN A — Current', desc: 'the in-game sound today',
      cfg: { kind: 'ballistic', level: 0.95, reverb: 0.25,
        crack: { freq: 3800, Q: 0.6, decay: 0.013, level: 1.2 },
        noise: { type: 'lowpass', freq: 1500, Q: 1.0, decay: 0.11, level: 0.7 },
        tone:  { wave: 'square', f0: 120, f1: 55, decay: 0.10, level: 0.45 } } },
    { name: 'GUN B — Deep Punch', desc: 'lower, heavier thump',
      cfg: { kind: 'ballistic', level: 1.0, reverb: 0.3,
        crack: { freq: 3200, Q: 0.6, decay: 0.016, level: 1.3 },
        noise: { type: 'lowpass', freq: 1100, Q: 1.2, decay: 0.14, level: 0.85 },
        tone:  { wave: 'square', f0: 90, f1: 42, decay: 0.13, level: 0.55 } } },
    { name: 'GUN C — Snappy', desc: 'tighter, brighter crack',
      cfg: { kind: 'ballistic', level: 0.9, reverb: 0.2,
        crack: { freq: 4600, Q: 0.6, decay: 0.01, level: 1.1 },
        noise: { type: 'bandpass', freq: 2000, Q: 1.4, decay: 0.08, level: 0.6 },
        tone:  { wave: 'sawtooth', f0: 160, f1: 60, decay: 0.08, level: 0.4 } } },
  ],
  'FIREBRAT — PULSE LASER': [
    { name: 'LASER A — Current', desc: 'the in-game sound today',
      cfg: { kind: 'ballistic', level: 0.5, reverb: 0.1,
        crack: { freq: 5200, Q: 0.5, decay: 0.006, level: 0.45 },
        noise: { type: 'bandpass', freq: 2800, Q: 1.6, decay: 0.05, level: 0.55 },
        tone:  { wave: 'sawtooth', f0: 1700, f1: 700, decay: 0.05, level: 0.30 } } },
    { name: 'LASER B — Zappy', desc: 'higher, sharper zap',
      cfg: { kind: 'ballistic', level: 0.55, reverb: 0.12,
        crack: { freq: 6000, Q: 0.5, decay: 0.005, level: 0.5 },
        noise: { type: 'bandpass', freq: 3400, Q: 2.0, decay: 0.04, level: 0.5 },
        tone:  { wave: 'sawtooth', f0: 2400, f1: 500, decay: 0.06, level: 0.35 } } },
  ],
};
