import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import type { CollisionWorld } from '../physics/collision';
import { BOX, CYL } from '../physics/collision';
import type { CityLayout } from './types';

/**
 * Temporary greybox view of the collision world (milestones M1-M2 only).
 * Replaced by the real city renderer in M3.
 */
export function buildGreybox(layout: CityLayout, world: CollisionWorld): Group {
  const g = new Group();
  // Ground
  const ground = new Mesh(new PlaneGeometry(1500, 1600), new MeshLambertMaterial({ color: 0x8a8f95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  g.add(ground);
  const park = layout.park;
  const parkMesh = new Mesh(new PlaneGeometry(park.maxX - park.minX, park.maxZ - park.minZ), new MeshLambertMaterial({ color: 0x5f9f4f }));
  parkMesh.rotation.x = -Math.PI / 2;
  parkMesh.position.set((park.minX + park.maxX) / 2, 0.16, (park.minZ + park.maxZ) / 2);
  g.add(parkMesh);
  const water = new Mesh(new PlaneGeometry(6000, 6000), new MeshLambertMaterial({ color: 0x3a7bbf }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.2;
  g.add(water);

  // Boxes merged into one geometry with vertex colours.
  const boxIds: number[] = [];
  const cylIds: number[] = [];
  for (let i = 0; i < world.count; i++) {
    const k = world.kind[i];
    if (k === BOX) boxIds.push(i);
    else if (k === CYL) cylIds.push(i);
  }
  const pos = new Float32Array(boxIds.length * 24 * 3);
  const nor = new Float32Array(boxIds.length * 24 * 3);
  const col = new Float32Array(boxIds.length * 24 * 3);
  const idx = new Uint32Array(boxIds.length * 36);
  const unit = new BoxGeometry(1, 1, 1);
  const up = unit.getAttribute('position') as BufferAttribute;
  const un = unit.getAttribute('normal') as BufferAttribute;
  const ui = unit.getIndex()!;
  const c = new Color();
  boxIds.forEach((id, n) => {
    const o = id * 6;
    const p = world.p;
    const sx = p[o + 3]! - p[o]!,
      sy = p[o + 4]! - p[o + 1]!,
      sz = p[o + 5]! - p[o + 2]!;
    const cx = (p[o]! + p[o + 3]!) / 2,
      cy = (p[o + 1]! + p[o + 4]!) / 2,
      cz = (p[o + 2]! + p[o + 5]!) / 2;
    const owner = world.owner[id]!;
    const h = owner >= 0 ? ((owner * 0.61803) % 1) : 0.5;
    c.setHSL(0.55 + h * 0.15, 0.15, 0.45 + h * 0.25);
    for (let v = 0; v < 24; v++) {
      const b = (n * 24 + v) * 3;
      pos[b] = cx + up.getX(v) * sx;
      pos[b + 1] = cy + up.getY(v) * sy;
      pos[b + 2] = cz + up.getZ(v) * sz;
      nor[b] = un.getX(v);
      nor[b + 1] = un.getY(v);
      nor[b + 2] = un.getZ(v);
      const shade = un.getY(v) > 0.5 ? 0.85 : 1;
      col[b] = c.r * shade;
      col[b + 1] = c.g * shade;
      col[b + 2] = c.b * shade;
    }
    for (let k = 0; k < 36; k++) idx[n * 36 + k] = ui.getX(k) + n * 24;
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nor, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  g.add(new Mesh(geo, new MeshLambertMaterial({ vertexColors: true })));

  // Cylinders and ellipsoids as instances.
  const m = new Matrix4();
  const cyl = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10), new MeshLambertMaterial({ color: 0x6b5440 }), cylIds.length);
  cylIds.forEach((id, n) => {
    const o = id * 6;
    const p = world.p;
    const r = p[o + 4]!,
      h = p[o + 3]! - p[o + 1]!;
    m.makeScale(r, h, r);
    m.setPosition(p[o]!, (p[o + 1]! + p[o + 3]!) / 2, p[o + 2]!);
    cyl.setMatrixAt(n, m);
  });
  g.add(cyl);
  const ellIds: number[] = [];
  for (let i = 0; i < world.count; i++) if (world.kind[i] === 2) ellIds.push(i);
  const ell = new InstancedMesh(new SphereGeometry(1, 12, 8), new MeshLambertMaterial({ color: 0x3f8f3a }), ellIds.length);
  ellIds.forEach((id, n) => {
    const o = id * 6;
    const p = world.p;
    m.makeScale(p[o + 3]!, p[o + 4]!, p[o + 5]!);
    m.setPosition(p[o]!, p[o + 1]!, p[o + 2]!);
    ell.setMatrixAt(n, m);
  });
  g.add(ell);
  return g;
}
