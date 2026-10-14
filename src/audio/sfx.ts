/**
 * One-shot sound effects, all synthesised from oscillators, the shared noise
 * and grain buffers, biquad filters and envelopes. Every recipe allocates a
 * single voice (so the voice cap counts whole sounds) and applies small random
 * pitch/level variations so repeats never sound identical.
 */
import { clamp, clamp01, glide, num, perc, pick, rand, semis, vary } from './dsp';
import { burst, grain, tone, type Kit } from './kit';
import { PRI_UI, type Voice } from './voices';

// Surface ids, mirroring SURF_* in src/physics/collision.ts.
const CONCRETE = 0;
const METAL = 1;
const WOOD = 2;
const GRASS = 3;
const FOLIAGE = 4;
const GLASS = 5;
const STONE = 6;
const GRAVEL = 7;
const WATER = 8;

function surfaceId(surface: number): number {
  const s = Math.floor(num(surface, CONCRETE));
  return s >= CONCRETE && s <= WATER ? s : CONCRETE;
}

// ---------------------------------------------------------------------------
// Web line

/** "Thwip": noise through a fast downward-sweeping bandpass, an onset tick and a pitch-dropping sine. */
export function webShot(k: Kit, pan: number): void {
  const v = k.voice(0.5 * vary(0.12), clamp(num(pan, 0), -1, 1) * 0.55, 0.05);
  if (!v) return;
  const t = v.t0;
  const p = vary(0.07);
  const len = 0.12 * vary(0.12);
  const n = v.noise(k.bank.white, t, t + len + 0.05);
  const band = v.filter('bandpass', 7000 * p, 3.2);
  glide(band.frequency, t, 7200 * p, 1300 * p, len * 0.85);
  const body = v.gain(0);
  perc(body.gain, t, 1.25, 0.003, len);
  n.connect(band);
  band.connect(body);
  body.connect(v.out);
  const hp = v.filter('highpass', 4200, 0.7);
  const tick = v.gain(0);
  perc(tick.gain, t, 0.2, 0.0008, 0.018);
  n.connect(hp);
  hp.connect(tick);
  tick.connect(v.out);
  tone(v, t, 'sine', 1700 * p, 380 * p, len * 0.8, 0.18, 0.002, len * 0.9);
}

/** Line bites: a soft low thud plus a taut-string twang (sawtooth through a falling resonant lowpass). */
export function attach(k: Kit, strength: number): void {
  const s = clamp01(num(strength, 0.5));
  const v = k.voice((0.26 + 0.34 * s) * vary(0.1), rand(-0.1, 0.1), 0.1);
  if (!v) return;
  const t = v.t0;
  tone(v, t, 'sine', 150 + 40 * s, 52, 0.11, 0.55, 0.004, 0.2 + 0.08 * s);
  burst(v, k.bank.white, t, 'lowpass', 900, 0.7, 0.3, 0.002, 0.05);
  const f0 = (88 + 46 * s) * vary(0.05);
  const tt = t + 0.008;
  const end = tt + 0.62;
  const saw = v.osc('sawtooth', f0, tt, end);
  saw.frequency.setValueAtTime(f0 * 1.07, tt);
  saw.frequency.exponentialRampToValueAtTime(f0, tt + 0.09);
  const wobble = v.osc('sine', 7.5 * vary(0.1), tt, end);
  const wobbleDepth = v.gain(f0 * 0.012);
  wobble.connect(wobbleDepth);
  wobbleDepth.connect(saw.frequency);
  const lp = v.filter('lowpass', 2400, 6);
  glide(lp.frequency, tt, 2200 + 1800 * s, 240, 0.5);
  const g = v.gain(0);
  perc(g.gain, tt, 0.42, 0.002, 0.55);
  saw.connect(lp);
  lp.connect(g);
  g.connect(v.out);
  tone(v, tt, 'triangle', f0 * 2.02, f0 * 2, 0.08, 0.06, 0.002, 0.3);
}

/** Airy release (noise rising through a band, a tiny snap); `good` adds a bright rising chime and whoosh. */
export function release(k: Kit, good: boolean): void {
  const v = k.voice(0.5 * vary(0.1), rand(-0.12, 0.12), good ? 0.16 : 0.05);
  if (!v) return;
  const t = v.t0;
  const n = v.noise(k.bank.pink, t, t + 0.5);
  const band = v.filter('bandpass', 700, 1.1);
  glide(band.frequency, t, 650, 2600, 0.32);
  const g = v.gain(0);
  perc(g.gain, t, 1.2, 0.04, 0.38);
  n.connect(band);
  band.connect(g);
  g.connect(v.out);
  burst(v, k.bank.white, t, 'bandpass', 3800, 1.4, 0.22, 0.0007, 0.012);
  if (!good) return;
  const notes = [1318.5, 1975.5, 2637];
  for (let i = 0; i < notes.length; i++) {
    const tn = t + 0.03 + i * 0.045;
    const f = notes[i] * vary(0.004);
    tone(v, tn, 'sine', f, f, 0, 0.22 - i * 0.035, 0.003, 0.42);
    tone(v, tn, 'sine', f * 2.003, f * 2.003, 0, 0.04, 0.002, 0.18);
  }
  const n2 = v.noise(k.bank.white, t, t + 0.5);
  const band2 = v.filter('bandpass', 1000, 1.6);
  glide(band2.frequency, t, 900, 5200, 0.36);
  const g2 = v.gain(0);
  perc(g2.gain, t, 0.22, 0.18, 0.27);
  n2.connect(band2);
  band2.connect(g2);
  g2.connect(v.out);
}

/** Rising zip (~0.4 s): noise through a rising band with an accelerating ratchet AM, plus a gliding tone. */
export function zipStart(k: Kit): void {
  const v = k.voice(0.6 * vary(0.08), 0, 0.05);
  if (!v) return;
  const t = v.t0;
  const d = 0.4 * vary(0.05);
  const n = v.noise(k.bank.white, t, t + d + 0.03);
  const band = v.filter('bandpass', 500, 2.4);
  glide(band.frequency, t, 420, 3600, d);
  const am = v.gain(0.68);
  const ratchet = v.osc('square', 34, t, t + d + 0.03);
  glide(ratchet.frequency, t, 34, 78, d);
  const ratchetDepth = v.gain(0.3);
  ratchet.connect(ratchetDepth);
  ratchetDepth.connect(am.gain);
  const env = v.gain(0);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1.2, t + 0.05);
  env.gain.setValueAtTime(1.2, t + d - 0.09);
  env.gain.linearRampToValueAtTime(0, t + d);
  n.connect(band);
  band.connect(am);
  am.connect(env);
  env.connect(v.out);
  const saw = v.osc('sawtooth', 170, t, t + d + 0.03);
  glide(saw.frequency, t, 170, 680, d);
  const lp = v.filter('lowpass', 1800, 0.9);
  const tg = v.gain(0);
  tg.gain.setValueAtTime(0, t);
  tg.gain.linearRampToValueAtTime(0.1, t + 0.06);
  tg.gain.setValueAtTime(0.1, t + d - 0.08);
  tg.gain.linearRampToValueAtTime(0, t + d);
  saw.connect(lp);
  lp.connect(tg);
  tg.connect(v.out);
}

/** Zip arrival: a short thunk with a falling swish. */
export function zipEnd(k: Kit): void {
  const v = k.voice(0.34 * vary(0.08), 0, 0.08);
  if (!v) return;
  const t = v.t0;
  tone(v, t, 'sine', 175, 62, 0.09, 0.6, 0.003, 0.16);
  burst(v, k.bank.white, t, 'lowpass', 1400, 0.7, 0.35, 0.002, 0.05);
  const f = burst(v, k.bank.white, t + 0.01, 'bandpass', 2400, 1.8, 0.25, 0.01, 0.12);
  glide(f.frequency, t + 0.01, 2600, 700, 0.12);
}

// ---------------------------------------------------------------------------
// Ground contact

/**
 * Surface-specific contact layer shared by footsteps, landings and wall grabs.
 * `i` is the step intensity (0 walk .. 1 sprint) and `force` scales brightness
 * and length (1 = a footstep, more for landings).
 */
function surfaceHit(k: Kit, v: Voice, t: number, surface: number, i: number, force: number): void {
  const p = vary(0.06);
  const W = k.bank.white;
  switch (surface) {
    case METAL: {
      burst(v, W, t, 'bandpass', 3200 * p, 1.2, 0.4, 0.0006, 0.02);
      tone(v, t, 'sine', 125 * p, 80 * p, 0.06, 0.4, 0.002, 0.09);
      const base = rand(380, 520) * p;
      const ratios = [1, 1.59, 2.33, 3.41, 4.17];
      const decays = [0.42, 0.3, 0.22, 0.16, 0.11];
      const amps = [0.16, 0.12, 0.09, 0.065, 0.045];
      const ring = 1.3 * (0.55 + 0.45 * i) * Math.min(1.6, force);
      for (let j = 0; j < ratios.length; j++) {
        const f = base * ratios[j] * vary(0.01);
        tone(v, t, 'sine', f, f, 0, amps[j] * ring, 0.001, decays[j] * (0.8 + 0.25 * force));
      }
      break;
    }
    case WOOD:
      burst(v, W, t, 'bandpass', 1100 * p, 2.5, 0.4, 0.0008, 0.03);
      tone(v, t, 'triangle', 230 * p, 175 * p, 0.03, 0.42, 0.001, 0.085 + 0.02 * force);
      tone(v, t, 'sine', 520 * p, 500 * p, 0.02, 0.14, 0.001, 0.05);
      tone(v, t, 'sine', 95 * p, 70 * p, 0.04, 0.35, 0.002, 0.07);
      break;
    case GRASS:
      grain(v, pick(k.bank.rustleSoft), t, rand(0.9, 1.1), 'lowpass', (1500 + 900 * i) * p, 0.6, 0.55 + 0.25 * i);
      tone(v, t, 'sine', 80 * p, 55, 0.04, 0.22 + 0.1 * i, 0.004, 0.06);
      break;
    case FOLIAGE:
      grain(v, pick(k.bank.rustleCrisp), t, rand(0.9, 1.1), 'bandpass', (2600 + 800 * i) * p, 0.7, 0.84 + 0.28 * i);
      grain(v, pick(k.bank.rustleSoft), t + rand(0.02, 0.06), rand(0.9, 1.1), 'lowpass', 1800, 0.6, 0.42);
      tone(v, t, 'sine', 85 * p, 60, 0.04, 0.15, 0.004, 0.05);
      break;
    case GLASS:
      burst(v, W, t, 'highpass', 5200, 0.8, 0.35, 0.0005, 0.007);
      tone(v, t, 'sine', 3900 * p, 3900 * p, 0, 0.21 + 0.09 * i, 0.0006, 0.05 + 0.03 * force);
      tone(v, t, 'sine', 5650 * p, 5650 * p, 0, 0.1 + 0.06 * i, 0.0006, 0.035 + 0.02 * force);
      tone(v, t, 'sine', 2480 * p, 2480 * p, 0, 0.075, 0.0008, 0.07);
      tone(v, t, 'sine', 130 * p, 85, 0.03, 0.3, 0.002, 0.045);
      break;
    case STONE:
      burst(v, W, t, 'bandpass', (3000 + 1000 * i) * p, 1.6, 0.7, 0.0006, 0.018 + 0.006 * force);
      burst(v, W, t + 0.003, 'highpass', 1500, 0.7, 0.1 + 0.08 * i, 0.003, 0.03);
      tone(v, t, 'sine', 120 * p, 62 * p, 0.045, 0.55, 0.0015, 0.055 + 0.02 * force);
      grain(v, pick(k.bank.crunch), t, 1.3 * p, 'highpass', 2500, 0.7, 0.12 + 0.1 * i);
      break;
    case GRAVEL:
      grain(v, pick(k.bank.crunch), t, rand(0.9, 1.15) * p, 'bandpass', (2000 + 900 * i) * p, 0.7, 1.2 + 0.4 * i);
      grain(v, pick(k.bank.crunch), t + 0.005, 0.75 * p, 'lowpass', 900, 0.7, 0.56);
      tone(v, t, 'sine', 85 * p, 55, 0.04, 0.3, 0.003, 0.05);
      break;
    case WATER:
      splashSmall(k, v, t, 0.5 + 0.5 * i);
      break;
    default:
      // Concrete: short tight click, a little scuff and a low thump.
      burst(v, W, t, 'bandpass', (2300 + 900 * i) * p, 1.3, 0.55, 0.0008, 0.022 + 0.008 * force);
      burst(v, W, t + 0.004, 'highpass', 1100, 0.7, 0.12 + 0.12 * i, 0.004, 0.035 + 0.035 * i);
      tone(v, t, 'sine', 105 * p, 58 * p, 0.05, 0.55, 0.002, 0.06 + 0.02 * force);
      break;
  }
}

function splashSmall(k: Kit, v: Voice, t: number, s: number): void {
  const W = k.bank.white;
  burst(v, W, t, 'lowpass', 2600, 0.6, 1.1 * s, 0.006, 0.14 + 0.06 * s);
  burst(v, W, t + 0.01, 'bandpass', 900, 1.2, 0.6 * s, 0.01, 0.1);
  for (let j = 0; j < 2; j++) {
    const tj = t + rand(0.03, 0.12);
    const f0 = rand(700, 1300);
    tone(v, tj, 'sine', f0, f0 * rand(1.5, 2), 0.03, 0.2 * s, 0.002, 0.04);
  }
}

function splashBig(k: Kit, v: Voice, t: number, s: number): void {
  const W = k.bank.white;
  const n = v.noise(W, t, t + 0.6);
  const lp = v.filter('lowpass', 3800, 0.6);
  const hp = v.filter('highpass', 180, 0.7);
  const g = v.gain(0);
  perc(g.gain, t, 0.8 * s, 0.006, 0.42);
  n.connect(lp);
  lp.connect(hp);
  hp.connect(g);
  g.connect(v.out);
  tone(v, t, 'sine', 280, 85, 0.16, 0.45 * s, 0.004, 0.2);
  burst(v, W, t + 0.08, 'bandpass', 1700, 0.8, 0.4 * s, 0.05, 0.5);
  const drops = Math.round(5 + 5 * s);
  for (let j = 0; j < drops; j++) {
    const tj = t + rand(0.1, 0.85);
    const f0 = rand(600, 1700);
    const pn = v.pan(rand(-0.7, 0.7));
    const dg = v.gain(1);
    tone(v, tj, 'sine', f0, f0 * rand(1.6, 2.2), rand(0.02, 0.04), rand(0.06, 0.16) * s, 0.002, rand(0.03, 0.06), dg);
    if (pn) {
      dg.connect(pn);
      pn.connect(v.out);
    } else dg.connect(v.out);
  }
}

/** Footstep on a surface (ids as in src/physics/collision.ts); intensity 0 walk .. 1 sprint. */
export function footstep(k: Kit, surface: number, intensity: number): void {
  const i = clamp01(num(intensity, 0.5));
  const v = k.voice((0.24 + 0.2 * i) * vary(0.15), rand(-0.1, 0.1), 0.02);
  if (!v) return;
  surfaceHit(k, v, v.t0, surfaceId(surface), i, 1);
}

/** Landing: a thump scaled by impact speed, the surface layer, and debris/rumble when hard. */
export function land(k: Kit, impact: number, surface: number): void {
  const imp = clamp(num(impact, 5), 0, 80);
  const kf = clamp01(imp / 40);
  const hard = clamp01((imp - 15) / 30);
  const surf = surfaceId(surface);
  const v = k.voice((0.14 + 0.66 * kf) * vary(0.08), rand(-0.05, 0.05), 0.04 + 0.1 * hard);
  if (!v) return;
  const t = v.t0;
  if (surf === WATER) {
    splashBig(k, v, t, 0.5 + 0.5 * kf);
    return;
  }
  const W = k.bank.white;
  tone(v, t, 'sine', 120 - 30 * kf, 42, 0.12 + 0.1 * kf, 0.55, 0.003, 0.16 + 0.32 * kf);
  burst(v, W, t, 'lowpass', 420 + 380 * kf, 0.8, 0.55, 0.002, 0.07 + 0.12 * kf);
  surfaceHit(k, v, t, surf, 1, 0.8 + 0.6 * kf);
  if (hard <= 0) return;
  const soft = surf === GRASS || surf === FOLIAGE;
  const debris = soft ? k.bank.rustleSoft : k.bank.crunch;
  grain(v, pick(debris), t + 0.015, 0.8, soft ? 'lowpass' : 'bandpass', soft ? 1400 : 1700, 0.6, 0.7 * hard);
  grain(v, pick(debris), t + 0.07, 1.15, soft ? 'lowpass' : 'bandpass', soft ? 1800 : 2600, 0.7, 0.45 * hard);
  burst(v, W, t + 0.01, 'lowpass', 260, 0.7, 0.5 * hard, 0.012, 0.45 + 0.2 * hard);
  if (hard > 0.45) tone(v, t, 'sine', 58, 36, 0.3, 0.55 * hard, 0.004, 0.5);
}

/** Landing roll: a two-hump cloth/body scuff with soft thumps and a little grit. */
export function roll(k: Kit): void {
  const v = k.voice(0.42 * vary(0.1), 0, 0.03);
  if (!v) return;
  const t = v.t0;
  const n = v.noise(k.bank.white, t, t + 0.55);
  const band = v.filter('bandpass', 950, 0.9);
  glide(band.frequency, t, 1300, 700, 0.5);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.03);
  g.gain.linearRampToValueAtTime(0.16, t + 0.15);
  g.gain.linearRampToValueAtTime(0.32, t + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0004, t + 0.5);
  g.gain.linearRampToValueAtTime(0, t + 0.51);
  n.connect(band);
  band.connect(g);
  g.connect(v.out);
  tone(v, t, 'sine', 95, 60, 0.05, 0.4, 0.003, 0.08);
  tone(v, t + 0.2, 'sine', 85, 55, 0.05, 0.3, 0.003, 0.08);
  grain(v, pick(k.bank.crunch), t + 0.05, 0.8, 'highpass', 1800, 0.7, 0.18);
}

/** Wall grab: a hand slap and a grip scrape with a jittering band, flavoured by the surface. */
export function wallGrab(k: Kit, surface: number): void {
  const surf = surfaceId(surface);
  const v = k.voice(0.6 * vary(0.1), rand(-0.15, 0.15), 0.04);
  if (!v) return;
  const t = v.t0;
  const W = k.bank.white;
  tone(v, t, 'sine', 150, 88, 0.05, 0.45, 0.002, 0.06);
  burst(v, W, t, 'bandpass', 2000, 1.1, 0.3, 0.0008, 0.02);
  const center =
    surf === METAL ? 3000 : surf === GLASS ? 3800 : surf === WOOD ? 1300 : surf === GRASS || surf === FOLIAGE ? 2200 : 1800;
  const n = v.noise(W, t, t + 0.32);
  const band = v.filter('bandpass', center, 2.2);
  glide(band.frequency, t, center * 1.1, center * 0.8, 0.25);
  const jitter = v.osc('sawtooth', rand(18, 28), t, t + 0.32);
  const jitterDepth = v.gain(center * 0.25);
  jitter.connect(jitterDepth);
  jitterDepth.connect(band.frequency);
  const g = v.gain(0);
  perc(g.gain, t, 0.35, 0.012, 0.27);
  n.connect(band);
  band.connect(g);
  g.connect(v.out);
  if (surf === METAL) {
    const base = rand(600, 760);
    tone(v, t, 'sine', base, base, 0, 0.07, 0.001, 0.25);
    tone(v, t, 'sine', base * 2.41, base * 2.41, 0, 0.05, 0.001, 0.16);
  } else if (surf === GLASS) {
    const sq = v.osc('sine', 2300, t + 0.02, t + 0.2);
    const vib = v.osc('sine', 17, t + 0.02, t + 0.2);
    const vibDepth = v.gain(90);
    vib.connect(vibDepth);
    vibDepth.connect(sq.frequency);
    const sg = v.gain(0);
    perc(sg.gain, t + 0.02, 0.08, 0.01, 0.13);
    sq.connect(sg);
    sg.connect(v.out);
  } else if (surf === WOOD) {
    tone(v, t, 'triangle', 240, 190, 0.03, 0.25, 0.001, 0.07);
  } else if (surf === GRASS || surf === FOLIAGE) {
    grain(v, pick(k.bank.rustleCrisp), t, 1, 'bandpass', 2400, 0.7, 0.5);
  }
}

// ---------------------------------------------------------------------------
// Movement

/** Jump: a short push-off thump and a rising cloth swish. */
export function jump(k: Kit): void {
  const v = k.voice(0.4 * vary(0.1), 0, 0.02);
  if (!v) return;
  const t = v.t0;
  tone(v, t, 'sine', 125, 78, 0.06, 0.4, 0.003, 0.07);
  const n = v.noise(k.bank.white, t, t + 0.22);
  const band = v.filter('bandpass', 700, 1.1);
  glide(band.frequency, t, 650, 1700, 0.15);
  const g = v.gain(0);
  perc(g.gain, t, 0.32, 0.025, 0.155);
  n.connect(band);
  band.connect(g);
  g.connect(v.out);
}

/** Air boost: a short powerful stereo whoosh (band sweeping up then down), a sub punch and an air crack. */
export function boost(k: Kit): void {
  const v = k.voice(0.62 * vary(0.06), 0, 0.12);
  if (!v) return;
  const t = v.t0;
  const n = v.noise(k.bank.pink, t, t + 0.72);
  const band = v.filter('bandpass', 300, 0.9);
  band.frequency.setValueAtTime(260, t);
  band.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
  band.frequency.exponentialRampToValueAtTime(800, t + 0.65);
  const g = v.gain(0);
  perc(g.gain, t, 1, 0.035, 0.64);
  n.connect(band);
  band.connect(g);
  g.connect(v.out);
  tone(v, t, 'sine', 95, 42, 0.22, 0.6, 0.004, 0.3);
  burst(v, k.bank.white, t, 'highpass', 4200, 0.7, 0.22, 0.002, 0.07);
}

/** Dive start: a rushing air swell with a fluttering lowpass and a low rush underneath. */
export function dive(k: Kit): void {
  const v = k.voice(0.5 * vary(0.06), 0, 0.06);
  if (!v) return;
  const t = v.t0;
  const d = 1.1;
  const n = v.noise(k.bank.pink, t, t + d + 0.03);
  const lp = v.filter('lowpass', 500, 0.8);
  glide(lp.frequency, t, 450, 3400, 0.7);
  const am = v.gain(0.8);
  const flutter = v.osc('triangle', 9, t, t + d + 0.03);
  glide(flutter.frequency, t, 9, 15, d);
  const flutterDepth = v.gain(0.22);
  flutter.connect(flutterDepth);
  flutterDepth.connect(am.gain);
  const g = v.gain(0);
  perc(g.gain, t, 0.85, 0.45, d - 0.45);
  n.connect(lp);
  lp.connect(am);
  am.connect(g);
  g.connect(v.out);
  const b = v.noise(k.bank.brown, t, t + d + 0.03);
  const blp = v.filter('lowpass', 180, 0.8);
  const bg = v.gain(0);
  perc(bg.gain, t, 0.6, 0.35, d - 0.35);
  b.connect(blp);
  blp.connect(bg);
  bg.connect(v.out);
}

/** Vault: a hand-plant slap followed by a body swish. */
export function vault(k: Kit): void {
  const v = k.voice(0.54 * vary(0.1), 0, 0.03);
  if (!v) return;
  const t = v.t0;
  burst(v, k.bank.white, t, 'bandpass', 1500, 1.2, 0.45, 0.0008, 0.03);
  tone(v, t, 'sine', 165, 100, 0.04, 0.4, 0.002, 0.05);
  const ts = t + 0.04;
  const n = v.noise(k.bank.white, ts, ts + 0.26);
  const band = v.filter('bandpass', 700, 1.2);
  glide(band.frequency, ts, 650, 1900, 0.2);
  const g = v.gain(0);
  perc(g.gain, ts, 0.3, 0.05, 0.18);
  n.connect(band);
  band.connect(g);
  g.connect(v.out);
}

/** Water splash: an impact burst, a low plunge, falling spray and scattered panned droplets. */
export function splash(k: Kit): void {
  const v = k.voice(0.62 * vary(0.06), 0, 0.12);
  if (!v) return;
  splashBig(k, v, v.t0, 1);
}

// ---------------------------------------------------------------------------
// Rings

/** C major pentatonic steps for ring chimes. */
const PENTATONIC = [0, 2, 4, 7, 9];

/** FM bell (carrier f, modulator 3.5 f with a decaying index) plus an octave partial. */
function bell(v: Voice, t: number, f: number, amp: number, decay: number): void {
  const end = t + decay + 0.05;
  const car = v.osc('sine', f, t, end);
  const mod = v.osc('sine', f * 3.5, t, end);
  const index = v.gain(0);
  index.gain.setValueAtTime(f * 1.2, t);
  index.gain.exponentialRampToValueAtTime(f * 0.02, t + decay * 0.6);
  mod.connect(index);
  index.connect(car.frequency);
  const g = v.gain(0);
  perc(g.gain, t, amp, 0.002, decay);
  car.connect(g);
  g.connect(v.out);
  tone(v, t, 'sine', f * 2, f * 2, 0, amp * 0.25, 0.002, decay * 0.45);
}

/** Loudness compensation for high notes (the ear is most sensitive around 2-4 kHz). */
function earComp(f: number): number {
  return f > 900 ? Math.sqrt(900 / f) : 1;
}

/** Arcade chime ("di-ding"); pitch climbs the pentatonic scale with the ring index. */
export function ringPass(k: Kit, index: number): void {
  const idx = clamp(Math.floor(num(index, 0)), 0, 12);
  const semi = PENTATONIC[idx % 5] + 12 * Math.floor(idx / 5);
  const f = 523.25 * semis(semi);
  const v = k.voice(0.42, 0, 0.18);
  if (!v) return;
  const t = v.t0;
  bell(v, t, f, 0.5 * earComp(f), 0.8);
  const f2 = f * 1.5;
  bell(v, t + 0.075, f2, 0.3 * earComp(f2), 0.7);
  burst(v, k.bank.white, t, 'highpass', 2500, 0.7, 0.12, 0.01, 0.12);
}

/** Route complete: a quick C-E-G-C arpeggio into a bright sawtooth chord swell with vibrato and sparkles. */
export function ringComplete(k: Kit): void {
  const v = k.voice(0.75, 0, 0.2);
  if (!v) return;
  const t = v.t0;
  const base = 523.25;
  const arp = [0, 4, 7, 12];
  const lead = v.filter('lowpass', 3000, 0.7);
  lead.connect(v.out);
  for (let i = 0; i < arp.length; i++) {
    const tn = t + i * 0.085;
    const f = base * semis(arp[i]);
    tone(v, tn, 'square', f, f, 0, i === 3 ? 0.3 : 0.24, 0.003, 0.22, lead);
    tone(v, tn, 'sine', f * 2, f * 2, 0, 0.06, 0.002, 0.2);
  }
  const tc = t + 0.34;
  const end = tc + 1.25;
  const lp = v.filter('lowpass', 3400, 0.8);
  glide(lp.frequency, tc, 3400, 1200, 1.1);
  const cg = v.gain(0);
  cg.gain.setValueAtTime(0, tc);
  cg.gain.linearRampToValueAtTime(1, tc + 0.03);
  cg.gain.exponentialRampToValueAtTime(0.6, tc + 0.3);
  cg.gain.setValueAtTime(0.6, tc + 0.55);
  cg.gain.exponentialRampToValueAtTime(0.0005, tc + 1.2);
  cg.gain.linearRampToValueAtTime(0, tc + 1.21);
  lp.connect(cg);
  cg.connect(v.out);
  const vib = v.osc('sine', 5.5, tc, end);
  for (const s of [-12, 0, 4, 7, 12]) {
    const f = base * semis(s);
    const o = v.osc('sawtooth', f, tc, end);
    o.detune.value = rand(-6, 6);
    const depth = v.gain(f * 0.006);
    vib.connect(depth);
    depth.connect(o.frequency);
    const mix = v.gain(s === -12 ? 0.1 : 0.09);
    o.connect(mix);
    mix.connect(lp);
  }
  for (let j = 0; j < 5; j++) {
    const tj = tc + rand(0.05, 0.6);
    const f = base * 4 * semis(pick(arp));
    tone(v, tj, 'sine', f, f, 0, 0.1 * earComp(f), 0.002, 0.25);
  }
}

// ---------------------------------------------------------------------------
// UI

/** Menu click: a short falling sine blip with a bright tick. */
export function uiClick(k: Kit): void {
  const v = k.voice(0.26 * vary(0.05), 0, 0, PRI_UI);
  if (!v) return;
  const t = v.t0;
  tone(v, t, 'sine', 1750, 1150, 0.025, 0.5, 0.001, 0.04);
  tone(v, t, 'triangle', 3500, 3200, 0.01, 0.12, 0.0005, 0.012);
  burst(v, k.bank.white, t, 'highpass', 4000, 0.7, 0.18, 0.0005, 0.006);
}

/** Menu hover: a very soft, short two-tone tick. */
export function uiHover(k: Kit): void {
  const v = k.voice(0.14, 0, 0, PRI_UI);
  if (!v) return;
  const t = v.t0;
  tone(v, t, 'sine', 2400, 2550, 0.015, 0.35, 0.002, 0.03);
  tone(v, t, 'sine', 1200, 1200, 0, 0.12, 0.002, 0.025);
}

/** Camera shutter: two curtain clicks ("ka-chick") with a short mechanism whir between them. */
export function photoShutter(k: Kit): void {
  const v = k.voice(0.55, 0, 0.05, PRI_UI);
  if (!v) return;
  const t = v.t0;
  const W = k.bank.white;
  burst(v, W, t, 'bandpass', 3200, 1.6, 0.45, 0.0004, 0.014);
  tone(v, t, 'sine', 1900, 1500, 0.01, 0.16, 0.0005, 0.018);
  tone(v, t, 'sine', 260, 180, 0.02, 0.3, 0.001, 0.03);
  const saw = v.osc('sawtooth', 110, t + 0.01, t + 0.085);
  const band = v.filter('bandpass', 950, 2);
  const wg = v.gain(0);
  wg.gain.setValueAtTime(0, t + 0.01);
  wg.gain.linearRampToValueAtTime(0.05, t + 0.03);
  wg.gain.linearRampToValueAtTime(0, t + 0.08);
  saw.connect(band);
  band.connect(wg);
  wg.connect(v.out);
  const t2 = t + 0.085;
  burst(v, W, t2, 'bandpass', 2600, 1.6, 0.38, 0.0004, 0.018);
  tone(v, t2, 'sine', 1500, 1200, 0.01, 0.13, 0.0005, 0.02);
  tone(v, t2, 'sine', 220, 160, 0.02, 0.26, 0.001, 0.035);
}
