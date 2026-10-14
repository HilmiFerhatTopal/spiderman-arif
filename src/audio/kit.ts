import { glide, makeCrunch, makeNoise, makeRustle, noiseJob, perc } from './dsp';
import { PRI_SFX, VoiceManager, type Voice } from './voices';

/** Procedural buffers generated once per AudioContext and shared by every sound. */
export interface NoiseBank {
  /** Mono white noise (one-shot bursts). */
  readonly white: AudioBuffer;
  /** Stereo pink noise (wind, whooshes): independent channels give a wide image. */
  readonly pink: AudioBuffer;
  /** Stereo brown noise (traffic hum, water, rumbles). */
  readonly brown: AudioBuffer;
  /** Gravel crunch grains. */
  readonly crunch: readonly AudioBuffer[];
  /** Soft grass swishes. */
  readonly rustleSoft: readonly AudioBuffer[];
  /** Crisp leaf rustles. */
  readonly rustleCrisp: readonly AudioBuffer[];
}

/**
 * The shared buffers. The constructor only makes what is needed for every
 * sound to work right away (about a millisecond of work: short pink/brown
 * loops and one grain of each kind); steps() returns the rest of the
 * generation (long loops, more grain variants), which the engine runs one
 * step per task so the unlocking gesture never stalls a frame.
 */
export class Bank implements NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  crunch: AudioBuffer[];
  rustleSoft: AudioBuffer[];
  rustleCrisp: AudioBuffer[];

  constructor(private readonly ctx: BaseAudioContext) {
    this.white = makeNoise(ctx, 'white', 1, 1, 0.5);
    this.pink = makeNoise(ctx, 'pink', 0.5, 2, 0.25);
    this.brown = makeNoise(ctx, 'brown', 0.5, 2, 0.25);
    this.crunch = [makeCrunch(ctx)];
    this.rustleSoft = [makeRustle(ctx, false)];
    this.rustleCrisp = [makeRustle(ctx, true)];
  }

  /** Remaining generation work, a few milliseconds per step (one step per channel of each long loop). */
  steps(): (() => void)[] {
    const ctx = this.ctx;
    const pink = noiseJob(ctx, 'pink', 4, 2, 0.25);
    const brown = noiseJob(ctx, 'brown', 4, 2, 0.25);
    return [
      ...pink.steps,
      () => {
        this.pink = pink.buffer;
      },
      ...brown.steps,
      () => {
        this.brown = brown.buffer;
      },
      () => {
        for (let i = 0; i < 4; i++) this.crunch.push(makeCrunch(ctx));
        for (let i = 0; i < 3; i++) this.rustleSoft.push(makeRustle(ctx, false));
        for (let i = 0; i < 3; i++) this.rustleCrisp.push(makeRustle(ctx, true));
      },
    ];
  }
}

/** Everything a sound recipe needs: the context, the shared buffers and a capped voice allocator. */
export class Kit {
  readonly voices: VoiceManager;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly bank: NoiseBank,
    private readonly out: AudioNode,
    /** Shared reverb input (null when the engine has no convolver). */
    readonly reverb: AudioNode | null,
    maxVoices: number,
  ) {
    this.voices = new VoiceManager(ctx, maxVoices);
  }

  /**
   * Starts a one-shot voice at `level` routed to `dest` (the SFX bus by
   * default) and sending `reverb` to the shared reverb. `pan` null plays the
   * voice unpanned (centred, full level on both channels); a number (0
   * included) places it with an equal-power panner. Returns null when the
   * voice cap refuses it.
   */
  voice(
    level: number,
    pan: number | null = null,
    reverb = 0,
    priority: number = PRI_SFX,
    dest: AudioNode = this.out,
  ): Voice | null {
    return this.voices.create(dest, level, pan, priority, this.reverb, reverb);
  }
}

// ---------------------------------------------------------------------------
// Building blocks shared by the one-shot and ambience recipes

/** Oscillator ping with an optional exponential pitch glide and a percussive envelope. */
export function tone(
  v: Voice,
  t: number,
  type: OscillatorType,
  f0: number,
  f1: number,
  glideTime: number,
  peak: number,
  attack: number,
  decay: number,
  dest: AudioNode = v.out,
): OscillatorNode {
  const o = v.osc(type, f0, t, t + attack + decay + 0.03);
  if (f1 !== f0 && glideTime > 0) glide(o.frequency, t, f0, f1, glideTime);
  const g = v.gain(0);
  perc(g.gain, t, peak, attack, decay);
  o.connect(g);
  g.connect(dest);
  return o;
}

/** Filtered noise burst with a percussive envelope. Returns the filter so callers can sweep it. */
export function burst(
  v: Voice,
  buf: AudioBuffer,
  t: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
  dest: AudioNode = v.out,
): BiquadFilterNode {
  const s = v.noise(buf, t, t + attack + decay + 0.03);
  const f = v.filter(type, freq, q);
  const g = v.gain(0);
  perc(g.gain, t, peak, attack, decay);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  return f;
}

/** One-shot grain buffer (crunch or rustle) through a filter at a fixed level. */
export function grain(
  v: Voice,
  buf: AudioBuffer,
  t: number,
  rate: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  level: number,
  dest: AudioNode = v.out,
): void {
  const s = v.sample(buf, t, rate);
  const f = v.filter(type, freq, q);
  const g = v.gain(level);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
}
