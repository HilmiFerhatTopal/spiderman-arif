import { Matrix4, Quaternion, Vector3, type Bone } from 'three';

const _m = new Matrix4();
const _q = new Quaternion();
const _pq = new Quaternion();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _d = new Vector3();
const _p = new Vector3();
const _k = new Vector3();
const _a = new Vector3();

/**
 * World quaternion for a bone whose rest axis (-Y) must point along `dir`,
 * with its local +Z oriented toward `pole` (projected perpendicular).
 */
export function aimQuaternion(dir: Vector3, pole: Vector3, out: Quaternion): Quaternion {
  _y.copy(dir).multiplyScalar(-1).normalize();
  _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
  if (_z.lengthSq() < 1e-8) {
    _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
    if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0);
  }
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Set a bone's local quaternion so its world rotation equals `worldQ`. */
export function setWorldQuaternion(bone: Bone, worldQ: Quaternion): void {
  const parent = bone.parent;
  if (parent) {
    parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(worldQ));
  } else bone.quaternion.copy(worldQ);
}

/**
 * Analytic two-bone IK. `root` and `mid` rest along -Y. The chain end is
 * placed at `target` (clamped to reach), the middle joint bends toward
 * `pole`. Updates world matrices of the chain.
 */
export function solveTwoBone(root: Bone, mid: Bone, lenA: number, lenB: number, target: Vector3, pole: Vector3): void {
  root.updateWorldMatrix(true, false);
  root.getWorldPosition(_a);
  _d.subVectors(target, _a);
  let dist = _d.length();
  const maxReach = (lenA + lenB) * 0.999;
  const minReach = Math.abs(lenA - lenB) + 0.01;
  if (dist < 1e-5) {
    _d.set(0, -1, 0);
    dist = minReach;
  }
  _d.multiplyScalar(1 / dist);
  dist = Math.min(maxReach, Math.max(minReach, dist));
  const cosA = (lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist);
  const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  // Perpendicular toward the pole.
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _p.normalize();
  _k.copy(_a).addScaledVector(_d, Math.cos(angA) * lenA).addScaledVector(_p, Math.sin(angA) * lenA);
  // Root aims at the knee/elbow, bending plane faces the pole.
  const dirA = _x.subVectors(_k, _a).normalize();
  aimQuaternion(dirA, _p, _q);
  setWorldQuaternion(root, _q);
  root.updateWorldMatrix(false, false);
  // End point after clamping.
  const end = _z.copy(_a).addScaledVector(_d, dist);
  const dirB = _y.subVectors(end, _k).normalize();
  aimQuaternion(dirB, _p, _q);
  mid.updateWorldMatrix(true, false);
  setWorldQuaternion(mid, _q);
  mid.updateWorldMatrix(false, false);
}
