import {
  DirectionalLight,
  Fog,
  HemisphereLight,
  NoToneMapping,
  PCFShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { QUALITY, type QualityPreset } from './config/quality';
import { PostFX } from './render/postfx';
import { shared } from './render/materials';
import { buildCityVisuals, type CityVisuals } from './world/cityRender';
import { Sky } from './world/sky';
import { DayNight } from './world/dayNight';
import { smoothstep } from './core/math';
import { tuning } from './config/tuning';
import { FixedLoop } from './core/loop';
import { Input, emptyTickInput, type TickInput } from './input/input';
import { CollisionWorld } from './physics/collision';
import { Player, MODE_NAMES, type PlayerEvent } from './player/player';
import { CameraRig } from './camera/cameraRig';
import { generateCity } from './world/cityGen';
import { buildCollisionWorld } from './world/cityCollision';
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
  private readonly shadowFocus = new Vector3();
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
  post!: PostFX;
  visuals!: CityVisuals;
  sky!: Sky;
  dayNight!: DayNight;
  sun!: DirectionalLight;
  hemi!: HemisphereLight;
  quality: QualityPreset = QUALITY[1]!;
  renderScale = 1;
  time = 0;
  timeFast = false;
  frameStats = { calls: 0, triangles: 0, frameMs: 0 };
  /** Fixed camera pose for screenshots (tests/photo checks). */
  cameraOverride: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov: number } | null = null;

  constructor(private readonly opts: GameOptions) {
    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000000, 0);
    this.input = new Input(opts.canvas);
    this.loop = new FixedLoop(
      (dt) => this.tick(dt),
      (alpha, frameDt) => this.render(alpha, frameDt),
    );
    this.debug = new DebugPanel();
    this.input.onKey((code) => this.onKey(code));
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
    this.visuals = buildCityVisuals(this.layout, (f) => p(0.4 + f * 0.45, 'buildings'));
    await nextFrame();
    p(0.88, 'shaders');
    this.sky = new Sky(this.opts.seed);
    this.scene.add(this.sky.group);
    this.scene.add(this.visuals.group);
    this.scene.fog = new Fog(0xb4dbf6, 300, 2000);
    this.sun = new DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight(0xc4e0ff, 0x8a7a66, 0.85);
    this.scene.add(this.hemi);
    this.post = new PostFX(this.renderer);
    this.dayNight = new DayNight({
      sun: this.sun,
      hemi: this.hemi,
      fog: this.scene.fog as Fog,
      sky: this.sky,
      water: this.visuals.water,
      lampPools: this.visuals.lampPools,
      outline: (c, s) => this.post.setOutline(c, s),
      fogRange: (n, f) => this.post.setFog(n, f),
    });
    this.dayNight.hour = tuning.time.startHour;
    this.dayNight.dayLengthMinutes = tuning.time.dayLengthMinutes;
    this.applyQuality(1);
    this.dayNight.apply();
    // Compile every shader during loading so play never hitches on first use.
    this.renderer.compile(this.scene, this.rig.camera);
    this.spawn();
    p(1, 'done');
    this.makeDebugHud();
    this.resize();
    this.renderFrame(0);
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
    this.renderFrame(0);
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
      this.renderFrame(0);
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
    this.timeFast = this.input.enabled && this.input.keyHeld('KeyY');
    if (this.playing && !this.dayNight.paused) this.dayNight.advance(frameDt, this.timeFast ? tuning.time.fastForwardRate : 1);
    this.renderFrame(frameDt);
    this.post.updateDynamic(this.loop.lastFrameMs);
    if (this.hudEl) {
      const pl = this.player;
      this.hudEl.textContent =
        `mode ${MODE_NAMES[pl.mode]}  speed ${pl.speed.toFixed(1)} m/s  alt ${pl.pos.y.toFixed(1)} m  ${this.dayNight.hour.toFixed(2)} h\n` +
        `anchor ${pl.swingTarget.valid ? (pl.swingTarget.assisted ? 'assist' : 'aim') : '-'}  zip ${pl.zipTarget.valid ? 'ok' : '-'}  ` +
        `calls ${this.frameStats.calls}  tris ${this.frameStats.triangles}  scale ${this.post.dynScale.toFixed(2)}`;
    }
  }

  /** Render one frame through the post pipeline and record renderer stats. */
  renderFrame(dt: number): void {
    this.time += dt;
    shared.uTime.value = this.time;
    this.dayNight.apply();
    this.sky.follow(this.rig.camera.position.x, this.rig.camera.position.z);
    this.visuals.updateLod(this.rig.camera.position.x, this.rig.camera.position.z);
    this.sky.uniforms.uTime.value = this.time;
    this.sky.updateClouds(dt);
    if (this.quality.shadows) {
      // Shadows follow the player; with a fixed camera pose they follow the view.
      const o = this.cameraOverride;
      if (o) {
        const cam = this.rig.camera;
        this.shadowFocus.set(o.tx - o.x, o.ty - o.y, o.tz - o.z).normalize().multiplyScalar(this.quality.shadowExtent * 0.8).add(cam.position);
        this.shadowFocus.y = Math.min(this.shadowFocus.y, o.ty);
      } else this.shadowFocus.copy(this.renderPos);
      this.dayNight.placeShadow(this.sun, this.shadowFocus, this.quality.shadowExtent, this.quality.shadowMap);
    }
    const sp = this.player.speed;
    this.post.speedLines = smoothstep(32, 60, sp) * (this.player.mode === 0 ? 0 : 1);
    this.renderer.info.reset();
    this.post.render(this.scene, this.rig.camera, this.time);
    this.frameStats.calls = this.renderer.info.render.calls;
    this.frameStats.triangles = this.renderer.info.render.triangles;
  }

  applyQuality(index: number): void {
    const q = QUALITY[Math.max(0, Math.min(3, index))]!;
    this.quality = q;
    this.sun.castShadow = q.shadows;
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.rig.camera.far = q.viewFar;
    this.rig.camera.updateProjectionMatrix();
    this.post.settings.fxaa = q.fxaa;
    this.post.settings.maxDynScale = q.maxDynScale;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap));
    this.resize();
  }

  private onKey(code: string): void {
    if (code === 'Backquote') this.debug.toggle();
    if (!this.playing) return;
    if (code === 'KeyT') this.dayNight.paused = !this.dayNight.paused;
    if (code === 'Digit1') this.dayNight.setHour(6.4);
    if (code === 'Digit2') this.dayNight.setHour(12);
    if (code === 'Digit3') this.dayNight.setHour(18.6);
    if (code === 'Digit4') this.dayNight.setHour(23);
  }

  updateCamera(dt: number): void {
    this.rig.update(dt, { pos: this.renderPos, vel: this.player.vel, mode: this.player.mode });
    const o = this.cameraOverride;
    if (o) {
      const cam = this.rig.camera;
      cam.position.set(o.x, o.y, o.z);
      cam.fov = o.fov;
      cam.lookAt(o.tx, o.ty, o.tz);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    }
  }

  resize(): void {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.rig) {
      this.rig.camera.aspect = w / h;
      this.rig.camera.updateProjectionMatrix();
    }
    if (this.post) {
      const pr = this.renderer.getPixelRatio();
      this.post.settings.renderScale = this.renderScale;
      this.post.setSize(Math.round(w * pr), Math.round(h * pr));
    }
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
