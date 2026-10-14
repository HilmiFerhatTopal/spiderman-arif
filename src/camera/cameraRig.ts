import { PerspectiveCamera, Vector3 } from 'three';
import { tuning, DEG } from '../config/tuning';
import { clamp, damp, smoothstep, springStep } from '../core/math';
import { CollisionWorld, F_CAMERA, F_CANOPY, makeRayHit } from '../physics/collision';

export interface CameraTarget {
  /** Interpolated player feet position. */
  pos: Vector3;
  vel: Vector3;
  /** 0 ground, 1 air, 2 swing, 3 zip, 4 wall, 5 traverse */
  mode: number;
}

const s1 = { value: 0, velocity: 0 };

/**
 * Third-person over-the-shoulder spring arm. Mouse look is applied per frame.
 * In the air the pivot follows a low-passed velocity on a softer spring, so
 * swing arcs, line changes and releases read as smooth curves; with auto-follow
 * on, an idle mouse lets the yaw turn gently toward the travel direction. The
 * arm shortens instantly when geometry intrudes and eases back out; a final
 * sphere resolve guarantees the camera is never inside geometry.
 */
export class CameraRig {
  yaw = 0;
  pitch = -0.12;
  readonly camera: PerspectiveCamera;
  readonly pivot = new Vector3();
  private readonly pivotVel = new Vector3();
  /** Low-passed target velocity fed forward into the pivot. */
  private readonly smoothVel = new Vector3();
  /** Seconds since the last mouse movement or explicit look change. */
  private lookIdle = 0;
  private arm = 4.3;
  private fov = 70;
  private readonly lookAhead = new Vector3();
  private shakeT = 0;
  private shakeAmp = 0;
  private time = 0;
  private initialized = false;
  readonly fwd = new Vector3(0, 0, -1);
  readonly right = new Vector3(1, 0, 0);
  readonly position = new Vector3();
  private readonly ray = makeRayHit();
  private readonly tmp = new Vector3();
  private readonly shoulder = new Vector3();
  private readonly head = new Vector3();
  /** Settings-driven values. */
  sensitivity = 1;
  invertY = false;
  fovOffset = 0;
  /** Turn toward the travel direction while flying fast with the mouse idle. */
  autoFollow = true;
  /** Diagnostics: penetration found by the final safety resolve (should be ~0). */
  lastSafetyPush = 0;

  constructor(
    private readonly world: CollisionWorld,
    aspect: number,
  ) {
    this.camera = new PerspectiveCamera(70, aspect, 0.25, 3200);
  }

  applyMouse(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) this.lookIdle = 0;
    const s = tuning.camera.baseSensitivity * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, tuning.camera.pitchMinDeg * DEG, tuning.camera.pitchMaxDeg * DEG);
  }

  setLook(yaw: number, pitch: number): void {
    this.lookIdle = 0;
    this.yaw = yaw;
    this.pitch = clamp(pitch, tuning.camera.pitchMinDeg * DEG, tuning.camera.pitchMaxDeg * DEG);
  }

  shake(impact: number): void {
    const C = tuning.camera;
    this.shakeT = C.shakeDuration;
    this.shakeAmp = C.shakeHardLanding * clamp(impact / 35, 0.5, 1.6);
  }

  snap(): void {
    this.initialized = false;
  }

  /**
   * Re-aims the camera for the current yaw and pitch around the current pivot
   * without advancing the follow (scripted aiming in tests). Geometry still
   * shortens the arm, as in `update`.
   */
  refreshPose(feet: Vector3): void {
    const cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    this.fwd.set(-sy * cp, sp, -cy * cp);
    this.right.set(cy, 0, -sy);
    this.place(feet, this.arm, 0, true);
  }

  update(dt: number, t: CameraTarget): void {
    const C = tuning.camera;
    this.time += dt;
    const speed = t.vel.length();
    const airborne = t.mode !== 0;
    // Swinging, flying and pulling: smooth follow. Ground, walls, vaults: tight follow.
    const flying = t.mode === 1 || t.mode === 2 || t.mode === 3;
    // Pivot follow with velocity feed-forward (lag only on acceleration).
    const tx = t.pos.x,
      ty = t.pos.y + C.pivotHeight,
      tz = t.pos.z;
    if (!this.initialized) {
      this.pivot.set(tx, ty, tz);
      this.pivotVel.set(0, 0, 0);
      this.smoothVel.copy(t.vel);
      this.arm = C.armGround;
      this.fov = C.fovBase;
      this.lookAhead.set(0, 0, 0);
      this.initialized = true;
    } else {
      this.smoothVel.lerp(t.vel, 1 - Math.exp(-(flying ? C.airVelSmooth : 30) * dt));
      this.pivot.addScaledVector(this.smoothVel, dt);
      // The spring stiffens smoothly as the lag grows, so the pivot never slams into a hard limit.
      const maxLag = flying ? C.maxLagAir : C.maxLag;
      const lag0 = Math.hypot(this.pivot.x - tx, this.pivot.y - ty, this.pivot.z - tz) / maxLag;
      const freq = (flying ? C.airFollowFreq : C.followFreq) * (1 + C.lagStiffen * lag0 * lag0);
      springStep(this.pivot.x, this.pivotVel.x, tx, freq, dt, s1);
      this.pivot.x = s1.value;
      this.pivotVel.x = s1.velocity;
      springStep(this.pivot.y, this.pivotVel.y, ty, freq * 0.7, dt, s1);
      this.pivot.y = s1.value;
      this.pivotVel.y = s1.velocity;
      springStep(this.pivot.z, this.pivotVel.z, tz, freq, dt, s1);
      this.pivot.z = s1.value;
      this.pivotVel.z = s1.velocity;
      // Hard limit only as a safety net (teleports, recoveries).
      this.tmp.set(this.pivot.x - tx, this.pivot.y - ty, this.pivot.z - tz);
      const lag = this.tmp.length();
      if (lag > maxLag * 2) {
        this.tmp.multiplyScalar((maxLag * 2) / lag);
        this.pivot.set(tx + this.tmp.x, ty + this.tmp.y, tz + this.tmp.z);
      }
    }

    // Auto-follow: with the mouse idle, ease the yaw toward the travel direction.
    this.lookIdle += dt;
    if (this.autoFollow && flying && this.lookIdle > C.autoYawDelay) {
      const vx = this.smoothVel.x,
        vz = this.smoothVel.z;
      const strength = smoothstep(C.autoYawMinSpeed, C.autoYawMinSpeed + 15, Math.hypot(vx, vz));
      if (strength > 0) {
        let d = Math.atan2(-vx, -vz) - this.yaw;
        d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
        if (Math.abs(d) < C.autoYawMaxAngleDeg * DEG) this.yaw += d * (1 - Math.exp(-C.autoYawRate * strength * dt));
      }
    }

    const cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    this.fwd.set(-sy * cp, sp, -cy * cp);
    this.right.set(cy, 0, -sy);

    // Mild look-ahead while swinging / flying fast.
    const swinging = t.mode === 2 || t.mode === 1 || t.mode === 3;
    const hs = Math.hypot(t.vel.x, t.vel.z);
    const la = swinging && hs > 2 ? (C.lookAhead * Math.min(1, hs / 40)) / hs : 0;
    this.lookAhead.x = damp(this.lookAhead.x, t.vel.x * la, C.lookAheadDamp, dt);
    this.lookAhead.y = damp(this.lookAhead.y, 0, C.lookAheadDamp, dt);
    this.lookAhead.z = damp(this.lookAhead.z, t.vel.z * la, C.lookAheadDamp, dt);

    // Arm length and FOV by speed.
    const fast = smoothstep(10, C.armSpeedRef, speed);
    let armTarget = airborne ? C.armAir : C.armGround;
    armTarget += (C.armFast - armTarget) * fast;
    if (t.mode === 4) armTarget = C.armGround + 0.4;
    const fovTarget = C.fovBase + this.fovOffset + (C.fovMax - C.fovBase) * smoothstep(C.fovSpeedMin, C.fovSpeedMax, speed);
    this.fov = damp(this.fov, fovTarget, C.fovDamp, dt);

    this.place(t.pos, armTarget, dt, false);
    // Landing shake.
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeAmp * (this.shakeT / C.shakeDuration) ** 2;
      const tt = this.time * 38;
      this.position.x += Math.sin(tt * 1.3) * k * 0.6;
      this.position.y += Math.sin(tt * 1.9 + 1.1) * k;
      this.position.z += Math.cos(tt * 1.1 + 0.4) * k * 0.6;
    }
    // Final safety: never inside any collider, terrain or water.
    this.lastSafetyPush = this.world.resolveSphere(this.position, C.collisionRadius * 0.85);

    const cam = this.camera;
    cam.position.copy(this.position);
    cam.fov = this.fov;
    this.tmp.copy(this.position).add(this.fwd);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.tmp);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /**
   * Head (inside the capsule) -> shoulder pivot -> camera along -fwd, both
   * clamped by geometry: buildings cut the arm at once, tree crowns pull it in
   * smoothly; the arm eases back out. `instant` applies the clamp without damping.
   */
  private place(feet: Vector3, armTarget: number, dt: number, instant: boolean): void {
    const C = tuning.camera;
    const R = C.collisionRadius;
    this.head.set(feet.x, feet.y + Math.min(C.pivotHeight, 1.5), feet.z);
    this.shoulder.copy(this.pivot).addScaledVector(this.right, C.shoulder).add(this.lookAhead);
    this.tmp.subVectors(this.shoulder, this.head);
    let dl = this.tmp.length();
    if (dl > 1e-4) {
      this.tmp.multiplyScalar(1 / dl);
      if (this.world.raycast(this.head.x, this.head.y, this.head.z, this.tmp.x, this.tmp.y, this.tmp.z, dl, this.ray, 0, -1, R, true, F_CAMERA)) {
        dl = Math.max(0, this.ray.t - 0.02);
        this.shoulder.copy(this.head).addScaledVector(this.tmp, dl);
      }
    }
    // Shoulder -> camera along -fwd. Buildings cut the arm at once; tree crowns
    // (soft occluders) pull it in quickly but smoothly instead of snapping.
    let allowed = armTarget + 0.5;
    let soft = false;
    if (
      this.world.raycast(
        this.shoulder.x,
        this.shoulder.y,
        this.shoulder.z,
        -this.fwd.x,
        -this.fwd.y,
        -this.fwd.z,
        armTarget + 0.5,
        this.ray,
        0,
        -1,
        R,
        true,
        F_CAMERA,
      )
    ) {
      allowed = Math.max(0.2, this.ray.t - 0.05);
      soft = this.ray.id >= 0 && (this.world.flags[this.ray.id]! & F_CANOPY) !== 0;
    }
    const desired = Math.min(armTarget, allowed);
    if (instant) this.arm = Math.min(this.arm, desired);
    else if (desired < this.arm) this.arm = soft ? damp(this.arm, desired, C.armSoftIn, dt) : desired;
    else this.arm = damp(this.arm, desired, C.armDampOut, dt);
    this.position.copy(this.shoulder).addScaledVector(this.fwd, -this.arm);
    if (instant) this.lastSafetyPush = this.world.resolveSphere(this.position, R * 0.85);
  }

  get currentFov(): number {
    return this.fov;
  }
}
