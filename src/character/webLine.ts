import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { withMRT } from '../render/materials';

const SEGS = 28;
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpT = new Vector3();
const tmpS = new Vector3();
const tmpV = new Vector3();
const UPV = new Vector3(0, 1, 0);

export interface WebLineState {
  visible: boolean;
  /** 0..1 fire progress (1 = reached the anchor). */
  progress: number;
  from: Vector3;
  to: Vector3;
  /** Rope length minus distance (> 0 means slack). */
  slack: number;
  tension: number;
}

/** Splat decal: a flat starburst on the surface where the line attached. */
function splatGeometry(): BufferGeometry {
  const spikes = 9;
  const pos: number[] = [0, 0, 0];
  const idx: number[] = [];
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.55 + ((i * 37) % 7) * 0.05 : 0.22;
    pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  for (let i = 1; i <= spikes * 2; i++) idx.push(0, i, i + 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

/**
 * Tapered web line (camera-facing ribbon) from the hand to the anchor with
 * slack sag that tightens with tension, a quick fire animation and an impact
 * splat. Also used for zip lines.
 */
export class WebLine {
  readonly group = new Group();
  private readonly geo: BufferGeometry;
  private readonly pos: Float32Array;
  private readonly mesh: Mesh;
  private readonly splats: Array<{ mesh: Mesh; life: number; age: number }> = [];
  private nextSplat = 0;
  private wobble = 0;
  private time = 0;
  readonly material: MeshBasicMaterial;

  constructor() {
    this.pos = new Float32Array((SEGS + 1) * 2 * 3);
    this.geo = new BufferGeometry();
    const attr = new BufferAttribute(this.pos, 3);
    attr.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', attr);
    const idx: number[] = [];
    for (let i = 0; i < SEGS; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.material = withMRT(
      new MeshBasicMaterial({ color: 0xeef6ff, side: DoubleSide, transparent: true, depthWrite: false }),
      false,
      'web',
    );
    this.mesh = new Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    this.group.add(this.mesh);
    const sg = splatGeometry();
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(
        sg,
        withMRT(new MeshBasicMaterial({ color: 0xf2f8ff, side: DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), false, 'splat'),
      );
      m.visible = false;
      m.renderOrder = 9;
      this.group.add(m);
      this.splats.push({ mesh: m, life: 0, age: 99 });
    }
  }

  /** Called when a line attaches: place a splat and kick the wobble. */
  attach(at: Vector3, normal: Vector3): void {
    const s = this.splats[this.nextSplat++ % this.splats.length]!;
    s.mesh.position.copy(at).addScaledVector(normal, 0.04);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal.lengthSq() > 0.5 ? normal : UPV);
    s.mesh.quaternion.copy(q);
    s.mesh.rotateZ(Math.random() * Math.PI);
    s.age = 0;
    s.life = 5;
    s.mesh.visible = true;
    this.wobble = 1;
  }

  /** Line released: start fading the newest splat sooner. */
  release(): void {
    this.wobble = 0;
  }

  update(dt: number, camPos: Vector3, st: WebLineState, night: number): void {
    this.time += dt;
    this.wobble = Math.max(0, this.wobble - dt * 3);
    const c = 0.93 - night * 0.18;
    this.material.color.setRGB(c, c + 0.03, c + 0.06);
    for (const s of this.splats) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      const pop = Math.min(1, s.age / 0.08);
      const fade = 1 - Math.max(0, (s.age - (s.life - 1)) / 1);
      const scale = (0.5 + 0.5 * pop) * 0.75;
      s.mesh.scale.setScalar(scale);
      (s.mesh.material as MeshBasicMaterial).opacity = Math.max(0, fade) * 0.95;
      if (s.age > s.life) s.mesh.visible = false;
    }
    if (!st.visible) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const from = st.from,
      to = st.to;
    const len = from.distanceTo(to);
    const prog = Math.max(0.02, Math.min(1, st.progress));
    // Sag: slack rope droops, taut rope is straight with a brief snap wobble.
    const sag = Math.min(len * 0.25, Math.max(0, st.slack) * 0.6) * (1 - st.tension * 0.8);
    tmpT.subVectors(to, from).normalize();
    for (let i = 0; i <= SEGS; i++) {
      const t = (i / SEGS) * prog;
      tmpA.lerpVectors(from, to, t);
      tmpA.y -= sag * 4 * t * (1 - t);
      // Fire animation: travelling wave while the line is in flight; snap wobble on attach.
      const wave = (st.progress < 1 ? 0.25 * (1 - st.progress) : 0) + this.wobble * 0.12;
      if (wave > 0) {
        tmpS.crossVectors(tmpT, UPV);
        if (tmpS.lengthSq() < 1e-4) tmpS.set(1, 0, 0);
        tmpS.normalize();
        const w = Math.sin(t * 18 - this.time * 40) * wave * Math.sin(Math.PI * Math.min(1, t / Math.max(0.05, prog)));
        tmpA.addScaledVector(tmpS, w);
      }
      // Camera-facing width (tapered: thicker at the hand).
      const width = 0.05 * (1 - t) + 0.016 * t;
      tmpV.subVectors(camPos, tmpA);
      tmpB.crossVectors(tmpT, tmpV);
      if (tmpB.lengthSq() < 1e-8) tmpB.set(1, 0, 0);
      tmpB.normalize().multiplyScalar(width * 0.5);
      const o = i * 6;
      this.pos[o] = tmpA.x - tmpB.x;
      this.pos[o + 1] = tmpA.y - tmpB.y;
      this.pos[o + 2] = tmpA.z - tmpB.z;
      this.pos[o + 3] = tmpA.x + tmpB.x;
      this.pos[o + 4] = tmpA.y + tmpB.y;
      this.pos[o + 5] = tmpA.z + tmpB.z;
    }
    this.geo.attributes.position!.needsUpdate = true;
  }
}
