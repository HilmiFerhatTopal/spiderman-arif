/**
 * Small math and DSP helpers for the audio module: clamping and random
 * variation, envelope helpers, procedural noise and grain buffers, a
 * procedural reverb impulse, gain curves and a smoothed AudioParam driver.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** `v` when it is a finite number, otherwise `fallback` (guards every value coming from callers). */
export function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Frame-rate independent exponential approach of `current` towards `target` with time constant `tc`. */
export function follow(current: number, target: number, dt: number, tc: number): number {
  if (tc <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tc));
}

export function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** Random integer in [lo, hi] (inclusive). */
export function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Random multiplier around 1: vary(0.1) lies in [0.9, 1.1]. */
export function vary(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length) % items.length] as T;
}

/** Frequency ratio of `n` equal-tempered semitones. */
export function semis(n: number): number {
  return Math.pow(2, n / 12);
}

// ---------------------------------------------------------------------------
// Envelope helpers (all times on the AudioContext clock)

/**
 * Envelope on a gain param: linear attack to `peak` (a few ms for hits, longer
 * for swells and whooshes), exponential decay to -66 dB, then a 10 ms linear
 * tail to exact silence. Returns the end time.
 */
export function perc(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  const a = Math.max(0.0005, attack);
  const d = Math.max(0.002, decay);
  const end = t + a + d;
  p.setValueAtTime(0, t);
  if (peak > 0) {
    p.linearRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(Math.max(1e-6, peak * 0.0005), end);
  }
  p.linearRampToValueAtTime(0, end + 0.01);
  return end + 0.01;
}

/** Exponential glide of a (positive) frequency param from f0 to f1 over `dur`. */
export function glide(p: AudioParam, t: number, f0: number, f1: number, dur: number): void {
  p.setValueAtTime(Math.max(1, f0), t);
  p.exponentialRampToValueAtTime(Math.max(1, f1), t + Math.max(0.001, dur));
}

// ---------------------------------------------------------------------------
// Procedural buffers

/** xorshift32 state for bulk noise generation (several times faster than Math.random per sample). */
let noiseSeed = (Math.floor(Math.random() * 0x7fffffff) | 1) >>> 0;

/** Uniform random sample in [-1, 1). */
function white(): number {
  let x = noiseSeed;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  noiseSeed = x;
  return (x | 0) / 2147483648;
}

export type NoiseKind = 'white' | 'pink' | 'brown';

function fillNoise(d: Float32Array, kind: NoiseKind): void {
  const n = d.length;
  if (kind === 'white') {
    for (let i = 0; i < n; i++) d[i] = white();
  } else if (kind === 'pink') {
    // Paul Kellet's refined pink filter (about -3 dB/octave).
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = white();
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    // Brown noise: leaky integrator of white noise (-6 dB/octave above ~150 Hz).
    let y = 0;
    for (let i = 0; i < n; i++) {
      y = (y + 0.02 * white()) / 1.02;
      d[i] = y;
    }
  }
}

function normaliseRms(d: Float32Array, rms: number): void {
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
  const cur = Math.sqrt(sum / Math.max(1, d.length));
  const k = cur > 1e-9 ? rms / cur : 0;
  for (let i = 0; i < d.length; i++) d[i] = clamp(d[i] * k, -1, 1);
}

function normalisePeak(d: Float32Array, peak: number): void {
  let m = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > m) m = a;
  }
  const k = m > 1e-9 ? peak / m : 0;
  for (let i = 0; i < d.length; i++) d[i] *= k;
}

/** A buffer whose samples are produced by a list of steps (one per channel), so the work can be spread over tasks. */
export interface BufferJob {
  readonly buffer: AudioBuffer;
  readonly steps: (() => void)[];
}

/**
 * Loopable noise buffer, one generation step per channel. Each channel is
 * independent noise (so stereo buffers are wide), the overflow past the end
 * is blended into the head with equal-power weights so the loop point is
 * continuous, and the channel is normalised to the given RMS.
 */
export function noiseJob(ctx: BaseAudioContext, kind: NoiseKind, seconds: number, channels: number, rms: number): BufferJob {
  const sr = ctx.sampleRate;
  const n = Math.max(256, Math.floor(seconds * sr));
  const fade = Math.min(Math.floor(sr * 0.05), Math.floor(n / 4));
  const buffer = ctx.createBuffer(channels, n, sr);
  const tmp = new Float32Array(n + fade);
  const steps: (() => void)[] = [];
  for (let c = 0; c < channels; c++) {
    steps.push(() => {
      fillNoise(tmp, kind);
      const out = buffer.getChannelData(c);
      for (let i = 0; i < fade; i++) {
        const x = (i / fade) * Math.PI * 0.5;
        out[i] = tmp[i] * Math.sin(x) + tmp[n + i] * Math.cos(x);
      }
      for (let i = fade; i < n; i++) out[i] = tmp[i];
      normaliseRms(out, rms);
    });
  }
  return { buffer, steps };
}

/** Loopable noise buffer generated in one go (see noiseJob). */
export function makeNoise(ctx: BaseAudioContext, kind: NoiseKind, seconds: number, channels: number, rms: number): AudioBuffer {
  const job = noiseJob(ctx, kind, seconds, channels, rms);
  for (const step of job.steps) step();
  return job.buffer;
}

/** Gravel crunch: a few dozen tiny decaying noise grains grouped into a heel and a toe contact. */
export function makeCrunch(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(0.2 * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const grains = randInt(24, 36);
  for (let g = 0; g < grains; g++) {
    const heel = Math.random() < 0.55;
    const t = heel ? Math.pow(Math.random(), 1.5) * 0.045 : 0.06 + Math.pow(Math.random(), 1.3) * 0.08;
    const amp = (0.2 + 0.8 * Math.pow(Math.random(), 2)) * (heel ? 1 : 0.7) * (Math.random() < 0.5 ? -1 : 1);
    const tau = rand(0.0005, 0.0028) * sr;
    const start = Math.floor(t * sr);
    const len = Math.min(n - start, Math.floor(tau * 7));
    const k = Math.exp(-1 / tau);
    let e = amp;
    for (let i = 0; i < len; i++) {
      d[start + i] += e * white();
      e *= k;
    }
  }
  normalisePeak(d, 0.9);
  return buf;
}

/**
 * Grass or leaf rustle: noise under a swish envelope with a granular flutter.
 * `crisp` adds sharp leaf ticks on top (foliage).
 */
export function makeRustle(ctx: BaseAudioContext, crisp: boolean): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor((crisp ? 0.3 : 0.26) * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const attack = rand(0.012, 0.03) * sr;
  const tau = rand(0.045, 0.075) * sr;
  const fall = Math.exp(-1 / tau);
  const step = Math.max(1, Math.floor(0.005 * sr));
  let a = rand(0.3, 1);
  let b = rand(0.3, 1);
  let env = 1;
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0) {
      a = b;
      b = rand(0.2, 1);
    }
    const flutter = a + (b - a) * (k / step);
    let e: number;
    if (i < attack) e = i / attack;
    else {
      e = env;
      env *= fall;
    }
    d[i] = white() * e * flutter;
  }
  if (crisp) {
    const ticks = randInt(10, 18);
    for (let j = 0; j < ticks; j++) {
      const start = Math.floor(Math.pow(Math.random(), 1.4) * 0.2 * sr);
      const env = start < attack ? start / attack : Math.exp(-(start - attack) / (tau * 1.6));
      const amp = rand(0.4, 1.2) * env;
      const tt = rand(0.0003, 0.0012) * sr;
      const len = Math.min(n - start, Math.floor(tt * 7));
      const k = Math.exp(-1 / tt);
      let e = amp;
      for (let i = 0; i < len; i++) {
        d[start + i] += e * white();
        e *= k;
      }
    }
  }
  normalisePeak(d, 0.9);
  return buf;
}

/**
 * Procedural outdoor/urban impulse response, one step per channel: a short
 * pre-delay, a few slap echoes off nearby facades, then a diffuse tail that
 * darkens as it decays (-60 dB at `rt60`). Each channel is normalised to unit
 * energy so the send level alone sets the wet amount.
 */
export function impulseJob(ctx: BaseAudioContext, seconds: number, rt60: number): BufferJob {
  const sr = ctx.sampleRate;
  const n = Math.max(256, Math.floor(seconds * sr));
  const buffer = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(0.012 * sr);
  const slaps = [0.031, 0.052, 0.079, 0.113, 0.151];
  // Per-sample multipliers: -60 dB at rt60 for the level, a 0.3 s fall for the brightness.
  const decay = Math.pow(10, -3 / (rt60 * sr));
  const darken = Math.exp(-1 / (0.3 * sr));
  const rampLen = 0.02 * sr;
  const steps: (() => void)[] = [];
  for (let c = 0; c < 2; c++) {
    steps.push(() => {
      const d = buffer.getChannelData(c);
      let lp = 0;
      let env = 1;
      let bright = 0.7;
      for (let i = pre; i < n; i++) {
        const j = i - pre;
        lp += (bright + 0.12) * (white() - lp);
        d[i] = lp * env * (j < rampLen ? j / rampLen : 1);
        env *= decay;
        bright *= darken;
      }
      for (let k = 0; k < slaps.length; k++) {
        const t0 = slaps[k] + (c === 0 ? 0.0023 : 0.0041) * ((k * 7 + c * 3) % 5);
        const start = pre + Math.floor(t0 * sr);
        const len = Math.floor(0.004 * sr);
        const amp = 1.6 * Math.pow(10, (-3 * t0) / rt60) * Math.pow(0.8, k);
        for (let i = 0; i < len && start + i < n; i++) {
          d[start + i] += amp * white() * (1 - i / len);
        }
      }
      const fade = Math.min(n - 1, Math.floor(0.1 * sr));
      for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
      let e = 0;
      for (let i = 0; i < n; i++) e += d[i] * d[i];
      const g = e > 1e-12 ? 1 / Math.sqrt(e) : 0;
      for (let i = 0; i < n; i++) d[i] *= g;
    });
  }
  return { buffer, steps };
}

// ---------------------------------------------------------------------------
// Curves

/** Equal-power fade curve: sin(x pi/2) for a fade-in, cos(x pi/2) for a fade-out. */
export function fadeCurve(points: number, fadeIn: boolean): Float32Array<ArrayBuffer> {
  const n = Math.max(2, points);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * Math.PI * 0.5;
    c[i] = fadeIn ? Math.sin(x) : Math.cos(x);
  }
  c[0] = fadeIn ? 0 : 1;
  c[n - 1] = fadeIn ? 1 : 0;
  return c;
}

/**
 * WaveShaper curve that turns a sine LFO (-1..1) into pulses (0..1): silent
 * below `threshold`, then rising smoothly to 1 at the crest. Higher
 * `sharpness` makes narrower pulses.
 */
export function pulseCurve(threshold: number, sharpness: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const u = clamp01((x - threshold) / (1 - threshold));
    c[i] = Math.pow(Math.sin(u * Math.PI * 0.5), sharpness);
  }
  return c;
}

/**
 * Schedules a curve on a param with setValueCurveAtTime, falling back to
 * piecewise-linear ramps on engines that reject the curve.
 */
export function applyCurve(p: AudioParam, curve: Float32Array<ArrayBuffer>, t: number, dur: number): void {
  try {
    p.setValueCurveAtTime(curve, t, dur);
    return;
  } catch {
    // Fall through to the ramp approximation.
  }
  try {
    const steps = 16;
    p.setValueAtTime(curve[0], t);
    for (let i = 1; i <= steps; i++) {
      const idx = Math.round((i / steps) * (curve.length - 1));
      p.linearRampToValueAtTime(curve[idx], t + (dur * i) / steps);
    }
  } catch {
    // Leave the param at its current value.
  }
}

// ---------------------------------------------------------------------------
// Parameter driver

/**
 * Drives an AudioParam towards per-frame targets with setTargetAtTime. Changes
 * smaller than a relative/absolute epsilon are skipped so the automation
 * timeline stays short even at high frame rates.
 */
export class Smoothed {
  private last = Number.NaN;

  constructor(
    private readonly param: AudioParam,
    private readonly tc: number,
    private readonly rel = 0.004,
    private readonly abs = 1e-5,
  ) {}

  to(target: number, now: number): void {
    if (!Number.isFinite(target)) return;
    const last = this.last;
    if (!Number.isNaN(last)) {
      const d = Math.abs(target - last);
      if (d <= this.abs || d <= Math.abs(last) * this.rel) return;
    }
    this.last = target;
    try {
      this.param.setTargetAtTime(target, now, this.tc);
    } catch {
      // A rejected automation event leaves the previous target in place.
    }
  }
}
