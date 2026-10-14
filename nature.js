// NATURE'S LOOPS: the creek and the campfire, each made sample by sample into a short loop that wraps round with no
// seam (every sound that runs past the end carries on at the start, and the filters go round the loop twice so the
// end meets the start). Plain numbers in, a Float32Array out: no browser needed, so the tests and the Sound Lab can
// make the very same loops. The two settings blocks below are what the Sound Lab's sliders change; its "Copy for the
// game" button copies a block to paste over the one here. (~/sound-lab/nature.js is a copy of this file: copy it
// again after changing this one; the game's tests check the two match.)
//
//   brookSamples(rate, settings = BROOK, rand = Math.random)   the creek's loop at sample rate `rate`
//   fireSamples(rate, settings = FIRE, rand = Math.random)     the campfire's loop
//   rand is passed in so tests can make the same loop twice.

// THE CREEK: a babbling brook is not a hiss (that reads as surf) but thousands of tiny bubbles, each a short pure note
// whose pitch climbs as it rings out (the "plink" of poured water); a few bigger gurgles lower down, and a faint fizz
// of spray on top, then the top end softened.
export const BROOK = {
  seconds: 7,          // the loop's length (it repeats with no seam)
  bubbles: 38,         // small bubbles a second: the crisp poured-water sound
  bubbleLow: 650,      // the small bubbles' pitch, Hz: lowest ...
  bubbleHigh: 2850,    // ... and highest (most sit near the low end)
  bubbleLen: 0.04,     // seconds a bubble rings, on average (each one half to one and a half times this)
  rise: 0.55,          // how far a bubble's pitch climbs as it rings (0.55: about half as high again; each +-0.3)
  gurgles: 8,          // bigger, lower bubbles a second
  gurglePitch: 470,    // their pitch, Hz, on average (each about +-45%)
  fizz: 0.012,         // the spray: very quiet bright noise
  lowpass: 2000,       // the top end softened above this, Hz
  passes: 2,           // how many low-pass passes (more: a steeper cut, darker)
  level: 0.6,          // the loop's loudest moment
};

// THE CAMPFIRE: mostly crackles and pops. Dense tiny crackles (very short clicks of noise, wildly different in loudness
// and brightness) arriving in little clusters, like sap spitting; fewer bigger pops (a sharp crack with a short woody
// knock under it, both noise: no ringing tones); now and then a log shifting and settling (a soft low crunch); and at
// most a very faint low breath of flame under it all.
export const FIRE = {
  seconds: 9,          // the loop's length (it repeats with no seam)
  crackles: 70,        // tiny crackles a second, all told
  cluster: 6,          // crackles in a cluster, on average (1: each on its own, evenly scattered)
  clusterLen: 0.08,    // seconds a cluster is spread over
  crackleShort: 0.5,   // a crackle's length, ms: shortest ...
  crackleLong: 4,      // ... and longest
  bright: 0.6,         // how bright the crackles are on average (0 dull ticks .. 1 sharp, glassy snaps)
  spread: 30,          // how much louder the loudest crackle is than the softest, dB
  crackleLevel: 0.45,  // the crackles' loudness (next to a pop's crack at 1)
  pops: 0.9,           // big pops a second
  knock: 0.5,          // the woody knock under a pop: how loud
  knockTone: 380,      // the knock's darkness, Hz (lower: a deeper, duller thud)
  settles: 0.08,       // log shifts a second (0.08: one about every twelve seconds)
  settleLevel: 0.12,   // how loud a log settling is
  breath: 0.006,       // the low breath of flame under it all (0: none)
  lowpass: 9000,       // the whole fire's top end softened above this, Hz
  level: 0.2,          // the loop's loudest moment
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// a chain of one-pole low-pass filters at `hz`, run round the loop twice (the second time kept) so the seam matches
function lowpassLoop(out, rate, hz, passes) {
  const n = out.length, P = Math.max(1, Math.round(passes)), k = 1 - Math.exp(-TAU * clamp(hz, 20, rate * 0.45) / rate), y = new Float64Array(P);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    let x = out[i];
    for (let p = 0; p < P; p++) { y[p] += k * (x - y[p]); x = y[p]; }
    if (pass) out[i] = x;
  }
}
function normalise(out, level) {
  let pk = 0; for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
  const g = level / (pk || 1); for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

export function brookSamples(rate, settings = BROOK, rand = Math.random) {
  const S = { ...BROOK, ...settings }, secs = S.seconds;
  const n = Math.round(rate * secs), out = new Float32Array(n);
  const riseLo = Math.max(0, S.rise - 0.3);
  const bubble = (t0, f0, amp, life) => {
    const len = Math.max(2, Math.round(life * rate)), rise = riseLo + rand() * 0.6; let ph = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len, f = f0 * (1 + rise * u), env = Math.min(1, i / (0.0008 * rate)) * Math.exp(-5 * u);
      ph += TAU * f / rate; out[(t0 + i) % n] += Math.sin(ph) * amp * env;
    }
  };
  const span = Math.max(0, S.bubbleHigh - S.bubbleLow);
  for (let k = 0, m = Math.round(secs * S.bubbles); k < m; k++)   // small bubbles
    bubble(Math.floor(rand() * n), S.bubbleLow + Math.pow(rand(), 1.8) * span, 0.06 + Math.pow(rand(), 3) * 0.3, S.bubbleLen * (0.5 + rand()));
  for (let k = 0, m = Math.round(secs * S.gurgles); k < m; k++)   // bigger gurgles
    bubble(Math.floor(rand() * n), S.gurglePitch * (1 + (rand() * 2 - 1) * 0.447), 0.12 + rand() * 0.2, 0.05 + rand() * 0.06);
  let prev = 0;                                                    // the fizz: white noise with its lows taken off
  for (let i = 0; i < n; i++) { const w = rand() * 2 - 1; out[i] += (w - prev) * S.fizz; prev = w; }
  lowpassLoop(out, rate, S.lowpass, S.passes);
  return normalise(out, S.level);
}

export function fireSamples(rate, settings = FIRE, rand = Math.random) {
  const S = { ...FIRE, ...settings }, secs = S.seconds;
  const n = Math.round(rate * secs), out = new Float32Array(n);
  const at = (i) => ((i % n) + n) % n;
  // one click of noise: `len` samples, sharp start and a quick fall; bright 0 is noise through a soft low-pass (a dull
  // tick), 1 is noise with its lows taken off (a glassy snap)
  const click = (t0, len, amp, bright, dull = 0.25) => {
    let prev = 0, lp = 0;
    for (let i = 0; i < len; i++) {
      const w = rand() * 2 - 1, hi = (w - prev) * 0.7; prev = w; lp += dull * (w - lp);
      const u = i / len, env = Math.min(1, i / 2) * Math.exp(-4 * u) * (1 - u);
      out[at(t0 + i)] += amp * env * (bright * hi + (1 - bright) * lp * 1.6);
    }
  };
  // THE CRACKLES, in clusters: each cluster a burst of spits close together, quickening then dying off
  const clusters = Math.max(1, Math.round(secs * S.crackles / Math.max(1, S.cluster)));
  const shortL = Math.max(0.1, Math.min(S.crackleShort, S.crackleLong)), longL = Math.max(S.crackleShort, S.crackleLong);
  for (let c = 0; c < clusters; c++) {
    const t0 = Math.floor(rand() * n), count = S.cluster <= 1 ? 1 : 1 + Math.floor(-Math.log(1 - rand() * 0.999) * (S.cluster - 1));
    const loud = Math.pow(rand(), 1.5);   // (some clusters as a whole louder than others)
    let t = 0;
    for (let k = 0; k < count; k++) {
      t += -Math.log(1 - rand() * 0.999) * S.clusterLen / Math.max(1, count);
      const len = Math.max(2, Math.round(rate * (shortL + Math.pow(rand(), 1.6) * (longL - shortL)) / 1000));
      const dB = -S.spread * Math.pow(rand(), 0.7) * (1 - 0.35 * loud);
      const br = clamp(S.bright + (rand() * 2 - 1) * 0.45, 0, 1);
      click(t0 + Math.floor(t * rate), len, S.crackleLevel * Math.pow(10, dB / 20), br);
    }
  }
  // THE POPS: a sharp crack (a few ms of bright noise) and a short woody knock under it (noise through a low-pass,
  // falling off in tens of ms), often followed by a little spray of crackles
  const kk = 1 - Math.exp(-TAU * clamp(S.knockTone, 40, rate * 0.45) / rate);
  for (let p = 0, m = Math.round(secs * S.pops); p < m; p++) {
    const t0 = Math.floor(rand() * n), amp = 0.45 + rand() * 0.55;
    click(t0, Math.round(rate * (0.0012 + rand() * 0.0025)), amp, 0.75 + rand() * 0.25);
    const kl = Math.round(rate * (0.03 + rand() * 0.05)), ka = S.knock * amp * (0.6 + rand() * 0.5), tone = kk * (0.7 + rand() * 0.6);
    let a = 0, b = 0;
    for (let i = 0; i < kl; i++) {
      const w = rand() * 2 - 1; a += tone * (w - a); b += tone * (a - b);
      const u = i / kl, env = Math.min(1, i / (0.001 * rate)) * Math.exp(-5 * u) * (1 - u);
      out[at(t0 + i)] += ka * env * b * 6;
    }
    for (let k = 0, sp = Math.floor(rand() * 5); k < sp; k++)
      click(t0 + Math.floor(rate * (0.01 + rand() * 0.12)), Math.round(rate * (0.0005 + rand() * 0.0015)), amp * S.crackleLevel * (0.2 + rand() * 0.6), 0.5 + rand() * 0.5);
  }
  // A LOG SETTLING: a soft low crunch, a few hundred ms of many small dull grains swelling and fading
  for (let s = 0, m = Math.round(secs * S.settles); s < m; s++) {
    const t0 = Math.floor(rand() * n), dur = 0.25 + rand() * 0.35, grains = Math.round(dur * 260);
    for (let g = 0; g < grains; g++) {
      const u = rand(), env = Math.sin(Math.PI * u) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.6)));
      click(t0 + Math.floor(u * dur * rate), Math.round(rate * (0.002 + rand() * 0.006)), S.settleLevel * env * (0.3 + rand() * 0.7), rand() * 0.25, 0.08);
    }
  }
  // THE BREATH: low rumbling noise, its loudness wandering slowly (waves that fit the loop a whole number of times)
  if (S.breath > 0) {
    const w1 = Math.max(1, Math.round(secs * 0.31)), w2 = Math.max(1, Math.round(secs * 0.73)), ph = rand() * TAU;
    const br = new Float32Array(n);
    for (let i = 0; i < n; i++) br[i] = rand() * 2 - 1;
    lowpassLoop(br, rate, 180, 2);
    for (let i = 0; i < n; i++) {
      const u = i / n, wob = 1 + 0.35 * Math.sin(TAU * w1 * u + ph) + 0.2 * Math.sin(TAU * w2 * u + ph * 2);
      out[i] += S.breath * 8 * br[i] * wob;
    }
  }
  lowpassLoop(out, rate, S.lowpass, 1);
  // round off the rare stray peak (crackles landing on top of each other) with a soft knee, so the loop's level is set
  // by its pops, not by one freak: above the loudest thousandth of samples it bends over, never past twice that
  const mags = new Float32Array(n); for (let i = 0; i < n; i++) mags[i] = Math.abs(out[i]);
  mags.sort(); const q = mags[Math.floor(n * 0.999)] || 1;
  for (let i = 0; i < n; i++) { const a = Math.abs(out[i]); if (a > q) out[i] = Math.sign(out[i]) * q * (1 + Math.tanh((a - q) / q)); }
  return normalise(out, S.level);
}
