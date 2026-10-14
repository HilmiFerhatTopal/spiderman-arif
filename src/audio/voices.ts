import { clamp } from './dsp';

/** Voice priorities: lower ones are stolen first when the voice cap is reached. */
export const PRI_AMBIENT = 0;
export const PRI_SFX = 1;
export const PRI_UI = 2;

/** Lead time between "now" and a voice's start so attacks are never scheduled in the past. */
const START_LEAD = 0.008;
/** Fade applied to a voice that is stolen by the cap. */
const STEAL_FADE = 0.03;
/** Safety net: a voice still listed this long after its last scheduled stop is torn down. */
const STALE_AFTER = 1.5;

/** Stereo panner node (StereoPanner, or an equal-power PannerNode on older engines); null when unsupported. */
export function makePanner(ctx: BaseAudioContext, pan: number): AudioNode | null {
  const p = clamp(pan, -1, 1);
  try {
    if (typeof ctx.createStereoPanner === 'function') {
      const s = ctx.createStereoPanner();
      s.pan.value = p;
      return s;
    }
    if (typeof ctx.createPanner === 'function') {
      const s = ctx.createPanner();
      s.panningModel = 'equalpower';
      const a = p * Math.PI * 0.5;
      s.setPosition(Math.sin(a), 0, -Math.cos(a));
      return s;
    }
  } catch {
    // Fall through: the voice simply stays centred.
  }
  return null;
}

/**
 * One playing one-shot. Every node a recipe creates goes through the voice so
 * it can be disconnected when the voice's sources have all ended, which keeps
 * the graph (and memory) flat over long sessions.
 */
export class Voice {
  readonly t0: number;
  /** Output stage: constant gain at the voice level, faded only when stolen. */
  readonly out: GainNode;
  /** Latest scheduled stop time of any source. */
  end: number;
  done = false;
  stolen = false;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private pending = 0;
  private onDone: ((v: Voice) => void) | null;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly level: number,
    readonly priority: number,
    onDone: (v: Voice) => void,
  ) {
    this.t0 = ctx.currentTime + START_LEAD;
    this.end = this.t0;
    this.out = ctx.createGain();
    this.out.gain.value = level;
    this.nodes.push(this.out);
    this.onDone = onDone;
  }

  gain(value: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q: number = Math.SQRT1_2): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  osc(type: OscillatorType, freq: number, start: number, stop: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = Math.max(0.01, freq);
    this.nodes.push(o);
    o.start(start);
    o.stop(stop);
    this.track(o, stop);
    return o;
  }

  /** Looping noise source started at a random point of the buffer, so repeats never sound identical. */
  noise(buffer: AudioBuffer, start: number, stop: number, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    this.nodes.push(s);
    s.start(start, Math.random() * buffer.duration * 0.98);
    s.stop(stop);
    this.track(s, stop);
    return s;
  }

  /** One-shot playback of a whole buffer (grain samples). */
  sample(buffer: AudioBuffer, start: number, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.playbackRate.value = rate;
    this.nodes.push(s);
    const stop = start + buffer.duration / Math.max(0.05, rate) + 0.01;
    s.start(start);
    s.stop(stop);
    this.track(s, stop);
    return s;
  }

  shaper(curve: Float32Array<ArrayBuffer>): WaveShaperNode {
    const w = this.ctx.createWaveShaper();
    w.curve = curve;
    this.nodes.push(w);
    return w;
  }

  /** Panner owned by the voice (null when the engine has none: callers connect straight through). */
  pan(pan: number): AudioNode | null {
    const p = makePanner(this.ctx, pan);
    if (p) this.nodes.push(p);
    return p;
  }

  /** Quick fade-out used when the voice is stolen by the cap. */
  fadeOut(now: number): void {
    if (this.done || this.stolen) return;
    this.stolen = true;
    const g = this.out.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(this.level, now);
      g.linearRampToValueAtTime(0, now + STEAL_FADE);
    } catch {
      // The stop below still ends the voice.
    }
    const stopAt = now + STEAL_FADE + 0.01;
    for (const s of this.sources) {
      try {
        s.stop(stopAt);
      } catch {
        // Already stopped.
      }
    }
    if (stopAt < this.end) this.end = stopAt;
  }

  /** Disconnects every node. Runs when all sources ended, or from the stale-voice safety net. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    const force = this.pending > 0;
    for (const s of this.sources) {
      s.onended = null;
      if (force) {
        try {
          s.stop();
        } catch {
          // Already stopped.
        }
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
    this.pending = 0;
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb(this);
  }

  private track(src: AudioScheduledSourceNode, stop: number): void {
    this.sources.push(src);
    this.pending++;
    if (stop > this.end) this.end = stop;
    src.onended = () => {
      this.pending--;
      if (this.pending <= 0) this.finish();
    };
  }
}

/**
 * Allocates one-shot voices under a hard cap. When the cap is reached the
 * least important voice (ambient before SFX before UI, then the quietest and
 * most decayed) is faded out over 30 ms to make room.
 */
export class VoiceManager {
  private readonly list: Voice[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly max: number,
  ) {}

  /** Voices currently sounding (stolen voices that are fading out are not counted). */
  get active(): number {
    let n = 0;
    for (const v of this.list) if (!v.done && !v.stolen) n++;
    return n;
  }

  /**
   * Starts a voice routed to `dest` (through a panner when `pan` is not 0, and
   * with an optional reverb send). Returns null when the cap is full of more
   * important voices.
   */
  create(
    dest: AudioNode,
    level: number,
    pan: number,
    priority: number,
    send: AudioNode | null,
    sendLevel: number,
  ): Voice | null {
    const now = this.ctx.currentTime;
    this.prune(now);
    if (this.active >= this.max && !this.steal(now, priority)) return null;
    const v = new Voice(this.ctx, level, priority, (x) => this.remove(x));
    this.list.push(v);
    let tail: AudioNode = v.out;
    if (pan !== 0) {
      const p = v.pan(pan);
      if (p) {
        v.out.connect(p);
        tail = p;
      }
    }
    tail.connect(dest);
    if (send && sendLevel > 0) {
      const s = v.gain(sendLevel);
      tail.connect(s);
      s.connect(send);
    }
    return v;
  }

  /** Removes finished voices and tears down any voice that outlived its schedule. */
  prune(now: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v.done) this.list.splice(i, 1);
      else if (now > v.end + STALE_AFTER) v.finish();
    }
  }

  private steal(now: number, priority: number): boolean {
    let best: Voice | null = null;
    let bestScore = Infinity;
    for (const v of this.list) {
      if (v.done || v.stolen) continue;
      const span = Math.max(0.02, v.end - v.t0);
      const remain = clamp((v.end - now) / span, 0, 1);
      const score = v.priority * 4 + v.level * (0.2 + remain);
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    if (!best || best.priority > priority) return false;
    best.fadeOut(now);
    return true;
  }

  private remove(v: Voice): void {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }
}
