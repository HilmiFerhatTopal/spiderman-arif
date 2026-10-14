import { Bone, Matrix4, Quaternion, Skeleton, SkinnedMesh, Vector3, MeshToonMaterial } from 'three';
import { GeomBuilder } from '../render/geomBuilder';
import { toonGradient, withMRT } from '../render/materials';

/** Joint names (21). Order is the skeleton bone index. */
export const JOINTS = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'foreArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'foreArmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'toeL',
  'thighR',
  'shinR',
  'footR',
  'toeR',
] as const;
export type JointName = (typeof JOINTS)[number];

/** Rest-pose offsets of each joint from its parent (metres), T-pose-ish with arms down. */
const REST: Record<JointName, { parent: JointName | null; offset: [number, number, number] }> = {
  hips: { parent: null, offset: [0, 0.98, 0] },
  spine: { parent: 'hips', offset: [0, 0.11, 0] },
  chest: { parent: 'spine', offset: [0, 0.2, 0] },
  neck: { parent: 'chest', offset: [0, 0.23, 0] },
  head: { parent: 'neck', offset: [0, 0.1, 0] },
  shoulderL: { parent: 'chest', offset: [0.085, 0.17, 0] },
  upperArmL: { parent: 'shoulderL', offset: [0.115, 0, 0] },
  foreArmL: { parent: 'upperArmL', offset: [0, -0.29, 0] },
  handL: { parent: 'foreArmL', offset: [0, -0.265, 0] },
  shoulderR: { parent: 'chest', offset: [-0.085, 0.17, 0] },
  upperArmR: { parent: 'shoulderR', offset: [-0.115, 0, 0] },
  foreArmR: { parent: 'upperArmR', offset: [0, -0.29, 0] },
  handR: { parent: 'foreArmR', offset: [0, -0.265, 0] },
  thighL: { parent: 'hips', offset: [0.1, -0.045, 0] },
  shinL: { parent: 'thighL', offset: [0, -0.43, 0] },
  footL: { parent: 'shinL', offset: [0, -0.44, 0] },
  toeL: { parent: 'footL', offset: [0, -0.06, 0.14] },
  thighR: { parent: 'hips', offset: [-0.1, -0.045, 0] },
  shinR: { parent: 'thighR', offset: [0, -0.43, 0] },
  footR: { parent: 'shinR', offset: [0, -0.44, 0] },
  toeR: { parent: 'footR', offset: [0, -0.06, 0.14] },
};

export const LIMB = { upperArm: 0.29, foreArm: 0.265, thigh: 0.43, shin: 0.44, ankle: 0.06 };

// Palette: deep teal and charcoal suit, amber accents.
const TEAL: [number, number, number] = [0.04, 0.33, 0.37];
const TEAL_DARK: [number, number, number] = [0.03, 0.22, 0.25];
const CHAR: [number, number, number] = [0.13, 0.15, 0.18];
const AMBER: [number, number, number] = [1.0, 0.62, 0.1];

export interface CharacterRig {
  mesh: SkinnedMesh;
  bones: Record<JointName, Bone>;
  restQ: Record<JointName, Quaternion>;
  restPos: Record<JointName, Vector3>;
}

/**
 * Build the hero: a 21-joint skeleton with rigidly skinned rounded primitives
 * (one draw call). Model faces +Z, height 1.8 m, feet at y = 0.
 */
export function buildCharacter(): CharacterRig {
  const bones = {} as Record<JointName, Bone>;
  for (const name of JOINTS) {
    const b = new Bone();
    b.name = name;
    const r = REST[name];
    b.position.set(...r.offset);
    bones[name] = b;
  }
  for (const name of JOINTS) {
    const p = REST[name].parent;
    if (p) bones[p].add(bones[name]);
  }
  const root = bones.hips;
  root.updateMatrixWorld(true);

  const geo = new GeomBuilder([
    { name: 'skinIndex', size: 4 },
    { name: 'skinWeight', size: 4 },
    { name: 'aEmit', size: 1 },
  ]);
  const boneIndex = (n: JointName): number => JOINTS.indexOf(n);
  const world = new Matrix4();
  // Emit a primitive in a bone's local frame, then move it to bind (model) space.
  const part = (bone: JointName, color: [number, number, number], emit: number, draw: (g: GeomBuilder) => void): void => {
    const start = geo.vertexCount;
    geo.setColorArr(color);
    geo.setExtra('skinIndex', boneIndex(bone), 0, 0, 0);
    geo.setExtra('skinWeight', 1, 0, 0, 0);
    geo.setExtra('aEmit', emit);
    draw(geo);
    world.copy(bones[bone].matrixWorld);
    geo.applyMatrix(start, world);
  };
  // Tapered limb segment along -Y from 0 to -len (rounded ends via spheres).
  const limb = (g: GeomBuilder, len: number, r0: number, r1: number): void => {
    g.cylinder(0, 0, -len, 0, r1, r0, 10, false);
    g.ellipsoid(0, 0, 0, r0, r0, r0, 10, 6);
    g.ellipsoid(0, -len, 0, r1, r1, r1, 10, 6);
  };

  // Pelvis and belt
  part('hips', CHAR, 0, (g) => g.ellipsoid(0, -0.01, 0, 0.165, 0.11, 0.115, 12, 8));
  part('hips', AMBER, 0, (g) => g.cylinder(0, 0, 0.035, 0.07, 0.158, 0.155, 14, false));
  part('hips', CHAR, 0, (g) => g.box(-0.035, 0.03, 0.105, 0.035, 0.075, 0.125));
  // Abdomen + chest
  part('spine', TEAL, 0, (g) => g.ellipsoid(0, 0.08, 0, 0.145, 0.13, 0.1, 12, 8));
  part('chest', TEAL, 0, (g) => g.ellipsoid(0, 0.08, 0, 0.185, 0.17, 0.115, 14, 9));
  // Charcoal side panels on the torso
  part('chest', CHAR, 0, (g) => {
    g.ellipsoid(0.12, 0.05, 0, 0.07, 0.14, 0.095, 8, 6);
    g.ellipsoid(-0.12, 0.05, 0, 0.07, 0.14, 0.095, 8, 6);
  });
  // Amber chest chevron (geometric emblem)
  part('chest', AMBER, 0.35, (g) => {
    const z = 0.112;
    const y = 0.1;
    // Left and right bars of a "V" chevron, slightly proud of the chest.
    g.orientedBox(0.045, y, z, 0.055, 0.012, 0.008, 0.0);
    g.orientedBox(-0.045, y, z, 0.055, 0.012, 0.008, 0.0);
    g.transformRange(g.vertexCount - 48, (v, n) => {
      const s = v.x > 0 ? 1 : -1;
      // Tilt each bar into a chevron.
      const yy = v.y - y,
        xx = v.x;
      const a = s * 0.55;
      v.set(xx * Math.cos(a) - yy * Math.sin(a), xx * Math.sin(a) + yy * Math.cos(a) + y, v.z);
      n.set(n.x * Math.cos(a) - n.y * Math.sin(a), n.x * Math.sin(a) + n.y * Math.cos(a), n.z);
    });
  });
  // Neck and head (full-face mask)
  part('neck', CHAR, 0, (g) => g.cylinder(0, 0, -0.02, 0.1, 0.06, 0.052, 10, false));
  part('head', TEAL_DARK, 0, (g) => g.ellipsoid(0, 0.08, 0.005, 0.1, 0.122, 0.112, 22, 14));
  part('head', CHAR, 0, (g) => g.ellipsoid(0, 0.035, -0.01, 0.098, 0.09, 0.1, 20, 12));
  // Angular amber visor lenses on a charcoal rim, conforming to the mask surface.
  // Head ellipsoid (head-local): centre (0, 0.08, 0.005), radii (0.1, 0.122, 0.112).
  const onHead = (x: number, y: number, lift: number): [number, number, number, number, number, number] => {
    const u = x / 0.1,
      w = (y - 0.08) / 0.122;
    const k = Math.sqrt(Math.max(0.03, 1 - u * u - w * w));
    const z = 0.005 + 0.112 * k;
    let nx = x / 0.01,
      ny = (y - 0.08) / 0.014884,
      nz = (z - 0.005) / 0.012544;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    return [x + nx * lift, y + ny * lift, z + nz * lift, nx, ny, nz];
  };
  // Lens outline (left lens, +X): inner-top, outer-top, outer-bottom, inner-bottom.
  const LENS: Array<[number, number]> = [
    [0.014, 0.114],
    [0.084, 0.134],
    [0.074, 0.083],
    [0.02, 0.09],
  ];
  const lens = (g: GeomBuilder, s: number, grow: number, lift: number): void => {
    const cx = LENS.reduce((a, c) => a + c[0], 0) / 4,
      cy = LENS.reduce((a, c) => a + c[1], 0) / 4;
    const c = LENS.map(([x, y]) => {
      const dx = x - cx,
        dy = y - cy;
      const l = Math.hypot(dx, dy) || 1;
      return [x + (dx / l) * grow, y + (dy / l) * grow] as [number, number];
    });
    const NU = 5,
      NV = 3;
    const ids: number[][] = [];
    const pos: Array<Array<[number, number, number, number, number, number]>> = [];
    for (let i = 0; i <= NU; i++) {
      ids.push([]);
      pos.push([]);
      const u = i / NU;
      const tx = c[0]![0] + (c[1]![0] - c[0]![0]) * u,
        ty = c[0]![1] + (c[1]![1] - c[0]![1]) * u;
      const bx = c[3]![0] + (c[2]![0] - c[3]![0]) * u,
        by = c[3]![1] + (c[2]![1] - c[3]![1]) * u;
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        const q = onHead((tx + (bx - tx) * v) * s, ty + (by - ty) * v, lift);
        pos[i]!.push(q);
        ids[i]!.push(g.vertex(...q));
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = pos[i]![j]!,
          b = pos[i + 1]![j]!,
          d = pos[i]![j + 1]!;
        // Wind each quad so it faces outward (along the surface normal).
        const ex = b[0] - a[0],
          ey = b[1] - a[1],
          ez = b[2] - a[2];
        const fx = d[0] - a[0],
          fy = d[1] - a[1],
          fz = d[2] - a[2];
        const cz = (ey * fz - ez * fy) * a[3] + (ez * fx - ex * fz) * a[4] + (ex * fy - ey * fx) * a[5];
        const A = ids[i]![j]!,
          B = ids[i + 1]![j]!,
          C = ids[i + 1]![j + 1]!,
          D = ids[i]![j + 1]!;
        if (cz > 0) {
          g.tri(A, B, C);
          g.tri(A, C, D);
        } else {
          g.tri(A, C, B);
          g.tri(A, D, C);
        }
      }
    }
  };
  part('head', CHAR, 0, (g) => {
    lens(g, 1, 0.011, 0.0025);
    lens(g, -1, 0.011, 0.0025);
  });
  part('head', [1.0, 0.55, 0.07], 0.6, (g) => {
    lens(g, 1, 0, 0.005);
    lens(g, -1, 0, 0.005);
  });
  // Shoulders (charcoal caps)
  for (const side of ['L', 'R'] as const) {
    const sh = `shoulder${side}` as JointName;
    const ua = `upperArm${side}` as JointName;
    const fa = `foreArm${side}` as JointName;
    const hd = `hand${side}` as JointName;
    const th = `thigh${side}` as JointName;
    const sn = `shin${side}` as JointName;
    const ft = `foot${side}` as JointName;
    const to = `toe${side}` as JointName;
    const sx = side === 'L' ? 1 : -1;
    part(sh, CHAR, 0, (g) => g.ellipsoid(sx * 0.105, -0.01, 0, 0.066, 0.062, 0.07, 10, 6));
    part(ua, TEAL, 0, (g) => limb(g, LIMB.upperArm, 0.058, 0.05));
    part(fa, TEAL, 0, (g) => limb(g, LIMB.foreArm, 0.05, 0.043));
    // Forearm amber stripe and wrist launcher
    part(fa, AMBER, 0.25, (g) => g.cylinder(0, 0, -0.1, -0.08, 0.052, 0.052, 10, false));
    part(fa, CHAR, 0, (g) => g.box(-0.04, -0.24, -0.035, 0.04, -0.17, 0.035));
    part(fa, AMBER, 0.9, (g) => g.box(-0.012, -0.235, 0.034, 0.012, -0.18, 0.042));
    part(hd, CHAR, 0, (g) => {
      g.ellipsoid(0, -0.06, 0.005, 0.042, 0.07, 0.03, 8, 6);
      g.ellipsoid(sx * 0.03, -0.035, 0.02, 0.018, 0.035, 0.018, 6, 4);
    });
    part(th, TEAL, 0, (g) => limb(g, LIMB.thigh, 0.085, 0.064));
    part(th, CHAR, 0, (g) => g.ellipsoid(sx * 0.045, -0.2, 0, 0.04, 0.16, 0.065, 12, 8));
    part(sn, TEAL, 0, (g) => limb(g, LIMB.shin, 0.062, 0.046));
    part(sn, AMBER, 0.2, (g) => g.cylinder(0, 0, -0.16, -0.135, 0.064, 0.062, 10, false));
    part(sn, CHAR, 0, (g) => g.cylinder(0, 0, -0.44, -0.3, 0.05, 0.058, 10, false));
    part(ft, CHAR, 0, (g) => g.box(-0.048, -0.075, -0.06, 0.048, 0.0, 0.12));
    part(to, CHAR, 0, (g) => g.box(-0.046, -0.015, -0.02, 0.046, 0.045, 0.075));
  }

  const geometry = geo.build();
  const mat = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  withMRT(mat, true, 'hero', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEmit;\nvarying float vEmit;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvEmit = aEmit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmit * 0.9;');
  });
  const mesh = new SkinnedMesh(geometry, mat);
  mesh.add(root);
  const skeleton = new Skeleton(JOINTS.map((n) => bones[n]));
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'hero';
  const restQ = {} as Record<JointName, Quaternion>;
  const restPos = {} as Record<JointName, Vector3>;
  for (const n of JOINTS) {
    restQ[n] = bones[n].quaternion.clone();
    restPos[n] = bones[n].position.clone();
  }
  return { mesh, bones, restQ, restPos };
}
