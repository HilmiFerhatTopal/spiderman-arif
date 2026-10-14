import { PerspectiveCamera, Vector3 } from 'three';
import { tuning, DEG } from '../config/tuning';
import { clamp, damp, smoothstep, springStep } from '../core/math';
import { CollisionWorld, F_CAMERA, makeRayHit } from '../physics/collision';

export interface CameraTarget {
  /** Interpolated player feet position. */
  pos: Vector3;
  vel: Vector3;
  /** 0 ground, 1 air, 2 swing, 3 zip, 4 wall, 5 traverse */
  mode: number;
}

const s1 = { value: 0, velocity: 0 };

/**
 * Third-person over-the-shoulder spring arm. Mouse look is applied per frame
 * and never overridden. The arm shortens instantly when geometry intrudes and
 * eases back out; a final sphere resolve guarantees the camera is never
 * inside geometry.
 */
export class CameraRig {
  yaw = 0;
  pitch = -0.12;
  readonly camera: PerspectiveCamera;
  readonly pivot = new Vector3();
  private readonly pivotVel = new Vector3();
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
  /** Diagnostics: penetration found by the final safety resolve (should be ~0). */
  lastSafetyPush = 0;

  constructor(
    private readonly world: CollisionWorld,
    aspect: number,
  ) {
    this.camera = new PerspectiveCamera(70, aspect, 0.25, 3200);
  }

  applyMouse(dx: number, dy: number): void {
    const s = tuning.camera.baseSensitivity * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, tuning.camera.pitchMinDeg * DEG, tuning.camera.pitchMaxDeg * DEG);
  }

  setLook(yaw: number, pitch: number): void {
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

  update(dt: number, t: CameraTarget): void {
    const C = tuning.camera;
    this.time += dt;
    const cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    this.fwd.set(-sy * cp, sp, -cy * cp);
    this.right.set(cy, 0, -sy);

    const speed = t.vel.length();
    const airborne = t.mode !== 0;
    // Pivot follow with velocity feed-forward (lag only on acceleration).
    const tx = t.pos.x,
      ty = t.pos.y + C.pivotHeight,
      tz = t.pos.z;
    if (!this.initialized) {
      this.pivot.set(tx, ty, tz);
      this.pivotVel.set(0, 0, 0);
      this.arm = C.armGround;
      this.fov = C.fovBase;
      this.lookAhead.set(0, 0, 0);
      this.initialized = true;
    } else {
      this.pivot.addScaledVector(t.vel, dt);
      springStep(this.pivot.x, this.pivotVel.x, tx, C.followFreq, dt, s1);
      this.pivot.x = s1.value;
      this.pivotVel.x = s1.velocity;
      springStep(this.pivot.y, this.pivotVel.y, ty, C.followFreq * 0.7, dt, s1);
      this.pivot.y = s1.value;
      this.pivotVel.y = s1.velocity;
      springStep(this.pivot.z, this.pivotVel.z, tz, C.followFreq, dt, s1);
      this.pivot.z = s1.value;
      this.pivotVel.z = s1.velocity;
      this.tmp.set(this.pivot.x - tx, this.pivot.y - ty, this.pivot.z - tz);
      const lag = this.tmp.length();
      if (lag > C.maxLag) {
        this.tmp.multiplyScalar(C.maxLag / lag);
        this.pivot.set(tx + this.tmp.x, ty + this.tmp.y, tz + this.tmp.z);
      }
    }

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

    // Head (inside the capsule) -> shoulder pivot, clamped by geometry.
    const R = C.collisionRadius;
    this.head.set(t.pos.x, t.pos.y + Math.min(C.pivotHeight, 1.5), t.pos.z);
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
    // Shoulder -> camera along -fwd.
    let allowed = armTarget + 0.5;
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
    }
    const desired = Math.min(armTarget, allowed);
    if (desired < this.arm) this.arm = desired;
    else this.arm = damp(this.arm, desired, C.armDampOut, dt);

    this.position.copy(this.shoulder).addScaledVector(this.fwd, -this.arm);
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
    this.lastSafetyPush = this.world.resolveSphere(this.position, R * 0.85);

    const cam = this.camera;
    cam.position.copy(this.position);
    cam.fov = this.fov;
    this.tmp.copy(this.position).add(this.fwd);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.tmp);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  get currentFov(): number {
    return this.fov;
  }
}
