import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { tuning } from './config/tuning';
import { FixedLoop } from './core/loop';
import { Input, emptyTickInput, type TickInput } from './input/input';
import { CollisionWorld } from './physics/collision';
import { Player, MODE_NAMES, type PlayerEvent } from './player/player';
import { CameraRig } from './camera/cameraRig';
import { generateCity } from './world/cityGen';
import { buildCollisionWorld } from './world/cityCollision';
import { buildGreybox } from './world/greybox';
import type { CityLayout } from './world/types';
import { DebugPanel } from './debug/debugPanel';

export interface GameOptions {
  seed: number;
  canvas: HTMLCanvasElement;
  onProgress?: (fraction: number, label: string) => void;
}

/** Composition root: owns the loop, simulation, camera and rendering. */
export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  layout!: CityLayout;
  world!: CollisionWorld;
  player!: Player;
  rig!: CameraRig;
  readonly input: Input;
  readonly loop: FixedLoop;
  readonly tickInput: TickInput = emptyTickInput();
  readonly prevPos = new Vector3();
  readonly renderPos = new Vector3();
  readonly debug: DebugPanel;
  /** Simulation is advanced only while playing. */
  playing = false;
  ticks = 0;
  simTimeMs = 0;
  simTicksMeasured = 0;
  readonly eventLog: PlayerEvent[] = [];
  private hudEl: HTMLDivElement | null = null;
  /** Tests inject input through this hook instead of devices. */
  injectInput: ((out: TickInput) => void) | null = null;

  constructor(private readonly opts: GameOptions) {
    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.input = new Input(opts.canvas);
    this.loop = new FixedLoop(
      (dt) => this.tick(dt),
      (alpha, frameDt) => this.render(alpha, frameDt),
    );
    this.debug = new DebugPanel();
    this.input.onKey((code) => {
      if (code === 'Backquote') this.debug.toggle();
    });
    window.addEventListener('resize', () => this.resize());
  }

  async init(): Promise<void> {
    const p = this.opts.onProgress ?? (() => undefined);
    p(0.05, 'layout');
    await nextFrame();
    const t0 = performance.now();
    this.layout = generateCity(this.opts.seed);
    const t1 = performance.now();
    p(0.35, 'collision');
    await nextFrame();
    this.world = buildCollisionWorld(this.layout);
    const t2 = performance.now();
    console.info(
      `[skythread] city generated in ${(t1 - t0).toFixed(0)} ms, collision in ${(t2 - t1).toFixed(0)} ms: ` +
        `${this.layout.stats.buildings} buildings, ${this.layout.stats.parkTrees} park trees, ` +
        `${this.layout.stats.streetTrees} street trees, ${this.world.count} colliders, max height ${this.layout.stats.maxHeight.toFixed(0)} m`,
    );
    p(0.6, 'buildings');
    await nextFrame();
    this.player = new Player(this.world, this.layout);
    this.rig = new CameraRig(this.world, window.innerWidth / window.innerHeight);
    this.scene.background = new Color(0x9fc7e6);
    this.scene.fog = new Fog(0x9fc7e6, 200, 1600);
    this.scene.add(new AmbientLight(0xffffff, 0.55));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(300, 500, 200);
    this.scene.add(sun);
    this.scene.add(buildGreybox(this.layout, this.world));
    this.spawn();
    p(1, 'done');
    this.makeDebugHud();
    this.resize();
  }

  spawn(): void {
    const s = this.layout.spawn;
    const out = new Vector3();
    if (!this.player.findSafeSpot(s[0], s[1] + 0.5, s[2], out)) out.set(s[0], s[1], s[2]);
    this.player.teleport(out.x, out.y, out.z);
    this.prevPos.copy(this.player.pos);
    this.rig.setLook(Math.PI * 0.75, -0.15);
    this.rig.snap();
  }

  start(): void {
    this.loop.start();
  }

  private makeDebugHud(): void {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:8px;top:8px;color:#fff;font:12px/1.4 monospace;background:rgba(0,0,0,.45);padding:6px 8px;pointer-events:none;z-index:5;white-space:pre';
    document.body.appendChild(el);
    this.hudEl = el;
  }

  /** One fixed simulation tick (real-time loop). */
  tick(dt: number): void {
    if (!this.playing) return;
    this.simulate(dt);
  }

  /** One tick driven by tests: injected input, camera updated per tick. */
  manualTick(): void {
    const dt = this.loop.dt;
    this.simulate(dt);
    this.renderPos.copy(this.player.pos);
    this.updateCamera(dt);
  }

  snapCamera(): void {
    this.rig.snap();
    this.renderPos.copy(this.player.pos);
    this.updateCamera(this.loop.dt);
  }

  updateCameraForTest(): void {
    this.renderPos.copy(this.player.pos);
    this.updateCamera(this.loop.dt);
  }

  renderOnce(): void {
    this.renderer.render(this.scene, this.rig.camera);
  }

  private simulate(dt: number): void {
    this.prevPos.copy(this.player.pos);
    this.input.sample(this.tickInput, this.rig.yaw, this.rig.pitch);
    if (this.injectInput) this.injectInput(this.tickInput);
    this.fillAim(this.tickInput);
    const t0 = performance.now();
    this.player.step(dt, this.tickInput);
    this.simTimeMs += performance.now() - t0;
    this.simTicksMeasured++;
    this.ticks++;
    for (const e of this.player.events) {
      this.eventLog.push(e);
      if (e.type === 'land' && e.impact > tuning.ground.hardLandingSpeed) this.rig.shake(e.impact);
      if (e.type === 'respawn' || e.type === 'recover') this.prevPos.copy(this.player.pos);
    }
    if (this.eventLog.length > 200) this.eventLog.splice(0, this.eventLog.length - 200);
  }

  fillAim(inp: TickInput): void {
    inp.yaw = this.rig.yaw;
    inp.pitch = this.rig.pitch;
    inp.aimOrigin.copy(this.rig.position);
    inp.aimDir.copy(this.rig.fwd);
  }

  render(alpha: number, frameDt: number): void {
    if (!this.player) return;
    if (this.loop.manual) {
      this.renderer.render(this.scene, this.rig.camera);
      return;
    }
    const m = this.input.consumeMouse();
    if (this.playing) this.rig.applyMouse(m.dx, m.dy);
    this.renderPos.lerpVectors(this.prevPos, this.player.pos, alpha);
    // Blend out recovery offsets smoothly.
    const off = this.player.renderOffset;
    if (off.lengthSq() > 1e-8) {
      this.renderPos.add(off);
      off.multiplyScalar(Math.exp(-frameDt / Math.max(0.01, tuning.recovery.blendTime / 3)));
    }
    this.updateCamera(frameDt);
    this.renderer.render(this.scene, this.rig.camera);
    if (this.hudEl) {
      const pl = this.player;
      this.hudEl.textContent =
        `mode ${MODE_NAMES[pl.mode]}  speed ${pl.speed.toFixed(1)} m/s  alt ${pl.pos.y.toFixed(1)} m\n` +
        `anchor ${pl.swingTarget.valid ? (pl.swingTarget.assisted ? 'assist' : 'aim') : '-'}  zip ${pl.zipTarget.valid ? 'ok' : '-'}  ` +
        `calls ${this.renderer.info.render.calls}  tris ${this.renderer.info.render.triangles}`;
    }
  }

  updateCamera(dt: number): void {
    this.rig.update(dt, { pos: this.renderPos, vel: this.player.vel, mode: this.player.mode });
  }

  resize(): void {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.rig) {
      this.rig.camera.aspect = w / h;
      this.rig.camera.updateProjectionMatrix();
    }
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
