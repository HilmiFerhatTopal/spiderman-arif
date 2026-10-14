export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential smoothing factor. */
export const dampFactor = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * dampFactor(rate, dt);

export const moveToward = (current: number, target: number, maxDelta: number): number => {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
};

export const wrapAngle = (a: number): number => {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
};

export const dampAngle = (current: number, target: number, rate: number, dt: number): number =>
  current + wrapAngle(target - current) * dampFactor(rate, dt);

/**
 * Critically damped spring (value + velocity) toward a target. Stable for any
 * dt; used for blending animation channels and camera follow.
 */
export class Spring {
  value: number;
  velocity = 0;
  constructor(value = 0) {
    this.value = value;
  }
  update(target: number, omega: number, dt: number): number {
    const x = this.value - target;
    const exp = Math.exp(-omega * dt);
    const temp = (this.velocity + omega * x) * dt;
    this.velocity = (this.velocity - omega * temp) * exp;
    this.value = target + (x + temp) * exp;
    return this.value;
  }
  reset(value: number): void {
    this.value = value;
    this.velocity = 0;
  }
}

/** Critically damped spring step on raw numbers, returns [value, velocity]. */
export function springStep(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  dt: number,
  out: { value: number; velocity: number },
): void {
  const x = value - target;
  const exp = Math.exp(-omega * dt);
  const temp = (velocity + omega * x) * dt;
  out.velocity = (velocity - omega * temp) * exp;
  out.value = target + (x + temp) * exp;
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

export const isFiniteNum = (v: number): boolean => Number.isFinite(v);

/** Hash two ints to [0,1). Deterministic, used for per-instance variation. */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
