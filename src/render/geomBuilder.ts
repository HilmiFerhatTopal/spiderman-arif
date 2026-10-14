import { BufferAttribute, BufferGeometry, type Matrix4, Vector3 } from 'three';

class GrowF32 {
  a: Float32Array;
  n = 0;
  constructor(cap = 1024) {
    this.a = new Float32Array(cap);
  }
  reserve(extra: number): void {
    if (this.n + extra <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + extra) cap *= 2;
    const b = new Float32Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  push3(x: number, y: number, z: number): void {
    this.reserve(3);
    const a = this.a;
    a[this.n++] = x;
    a[this.n++] = y;
    a[this.n++] = z;
  }
  pushN(v: ArrayLike<number>): void {
    this.reserve(v.length);
    for (let i = 0; i < v.length; i++) this.a[this.n++] = v[i]!;
  }
  view(): Float32Array {
    return this.a.slice(0, this.n);
  }
}

class GrowU32 {
  a = new Uint32Array(2048);
  n = 0;
  push3(a: number, b: number, c: number): void {
    if (this.n + 3 > this.a.length) {
      const nb = new Uint32Array(this.a.length * 2);
      nb.set(this.a);
      this.a = nb;
    }
    this.a[this.n++] = a;
    this.a[this.n++] = b;
    this.a[this.n++] = c;
  }
}

export interface ExtraAttr {
  name: string;
  size: number;
}

const tmpV = new Vector3();
const tmpN = new Vector3();

/**
 * Fast typed-array geometry builder for merged static meshes. Every vertex
 * carries position, normal, colour and any number of extra float attributes
 * set through `setExtra` before adding primitives.
 */
export class GeomBuilder {
  private pos = new GrowF32(4096);
  private nor = new GrowF32(4096);
  private col = new GrowF32(4096);
  private idx = new GrowU32();
  private extras: Array<{ name: string; size: number; buf: GrowF32; cur: number[] }> = [];
  vertexCount = 0;
  r = 1;
  g = 1;
  b = 1;

  constructor(extra: ExtraAttr[] = []) {
    for (const e of extra) this.extras.push({ name: e.name, size: e.size, buf: new GrowF32(4096), cur: new Array(e.size).fill(0) });
  }

  setColor(r: number, g: number, b: number): this {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  setColorArr(c: ArrayLike<number>, k = 1): this {
    this.r = c[0]! * k;
    this.g = c[1]! * k;
    this.b = c[2]! * k;
    return this;
  }

  setExtra(name: string, ...v: number[]): this {
    const e = this.extras.find((x) => x.name === name);
    if (e) for (let i = 0; i < e.size; i++) e.cur[i] = v[i] ?? 0;
    return this;
  }

  /** Overwrite an extra attribute of an already emitted vertex. */
  patchExtra(name: string, vertex: number, ...v: number[]): void {
    const e = this.extras.find((x) => x.name === name);
    if (!e) return;
    for (let i = 0; i < e.size; i++) e.buf.a[vertex * e.size + i] = v[i] ?? 0;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    this.pos.push3(x, y, z);
    this.nor.push3(nx, ny, nz);
    this.col.push3(this.r, this.g, this.b);
    for (const e of this.extras) e.buf.pushN(e.cur);
    return this.vertexCount++;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push3(a, b, c);
  }

  /** Quad with corners in counter-clockwise order seen from the normal side. */
  quad(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    x3: number,
    y3: number,
    z3: number,
    nx: number,
    ny: number,
    nz: number,
  ): void {
    const a = this.vertex(x0, y0, z0, nx, ny, nz);
    const b = this.vertex(x1, y1, z1, nx, ny, nz);
    const c = this.vertex(x2, y2, z2, nx, ny, nz);
    const d = this.vertex(x3, y3, z3, nx, ny, nz);
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /**
   * Axis-aligned box. `faces` bitmask: 1 +X, 2 -X, 4 +Y, 8 -Y, 16 +Z, 32 -Z.
   * `onFace` (optional) is called before each face so callers can set
   * per-face extras (e.g. facade UV origin).
   */
  box(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    faces = 63,
    onFace?: (face: number) => void,
  ): void {
    if (faces & 1) {
      onFace?.(1);
      this.quad(maxX, minY, maxZ, maxX, minY, minZ, maxX, maxY, minZ, maxX, maxY, maxZ, 1, 0, 0);
    }
    if (faces & 2) {
      onFace?.(2);
      this.quad(minX, minY, minZ, minX, minY, maxZ, minX, maxY, maxZ, minX, maxY, minZ, -1, 0, 0);
    }
    if (faces & 4) {
      onFace?.(4);
      this.quad(minX, maxY, maxZ, maxX, maxY, maxZ, maxX, maxY, minZ, minX, maxY, minZ, 0, 1, 0);
    }
    if (faces & 8) {
      onFace?.(8);
      this.quad(minX, minY, minZ, maxX, minY, minZ, maxX, minY, maxZ, minX, minY, maxZ, 0, -1, 0);
    }
    if (faces & 16) {
      onFace?.(16);
      this.quad(minX, minY, maxZ, maxX, minY, maxZ, maxX, maxY, maxZ, minX, maxY, maxZ, 0, 0, 1);
    }
    if (faces & 32) {
      onFace?.(32);
      this.quad(maxX, minY, minZ, minX, minY, minZ, minX, maxY, minZ, maxX, maxY, minZ, 0, 0, -1);
    }
  }

  /** Oriented box (rotation about Y) given centre, half sizes and yaw. */
  orientedBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, faces = 63): void {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const start = this.vertexCount;
    this.box(-hx, -hy, -hz, hx, hy, hz, faces);
    this.transformRange(start, (v, n) => {
      const x = v.x * c + v.z * s,
        z = -v.x * s + v.z * c;
      v.set(x + cx, v.y + cy, z + cz);
      const nx = n.x * c + n.z * s,
        nz = -n.x * s + n.z * c;
      n.set(nx, n.y, nz);
    });
  }

  /** Cylinder (or frustum) along +Y from y0 to y1. */
  cylinder(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, segs: number, caps = true, phase = 0): void {
    const base = this.vertexCount;
    const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2 + phase;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      this.vertex(cx + ca * r0, y0, cz + sa * r0, ca / nl, slope / nl, sa / nl);
      this.vertex(cx + ca * r1, y1, cz + sa * r1, ca / nl, slope / nl, sa / nl);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2,
        b = a + 1,
        c = a + 2,
        d = a + 3;
      this.tri(a, b, d);
      this.tri(a, d, c);
    }
    if (caps) {
      if (r1 > 1e-4) {
        const top = this.vertex(cx, y1, cz, 0, 1, 0);
        const ring = this.vertexCount;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2 + phase;
          this.vertex(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0);
        }
        for (let i = 0; i < segs; i++) this.tri(top, ring + i + 1, ring + i);
      }
      if (r0 > 1e-4) {
        const bot = this.vertex(cx, y0, cz, 0, -1, 0);
        const ring = this.vertexCount;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2 + phase;
          this.vertex(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0);
        }
        for (let i = 0; i < segs; i++) this.tri(bot, ring + i, ring + i + 1);
      }
    }
  }

  /** Low-poly ellipsoid (UV sphere) centred at (cx, cy, cz). */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, wSegs = 10, hSegs = 7): void {
    const base = this.vertexCount;
    for (let j = 0; j <= hSegs; j++) {
      const v = j / hSegs;
      const th = v * Math.PI;
      const st = Math.sin(th),
        ct = Math.cos(th);
      for (let i = 0; i <= wSegs; i++) {
        const ph = (i / wSegs) * Math.PI * 2;
        const x = Math.cos(ph) * st,
          y = ct,
          z = Math.sin(ph) * st;
        tmpN.set(x / rx, y / ry, z / rz).normalize();
        this.vertex(cx + x * rx, cy + y * ry, cz + z * rz, tmpN.x, tmpN.y, tmpN.z);
      }
    }
    const row = wSegs + 1;
    for (let j = 0; j < hSegs; j++) {
      for (let i = 0; i < wSegs; i++) {
        const a = base + j * row + i,
          b = a + row,
          c = a + 1,
          d = b + 1;
        if (j !== 0) this.tri(a, c, b);
        if (j !== hSegs - 1) this.tri(c, d, b);
      }
    }
  }

  /** Apply a transform to vertices added since `start`. */
  transformRange(start: number, fn: (v: Vector3, n: Vector3) => void): void {
    const p = this.pos.a,
      n = this.nor.a;
    for (let i = start; i < this.vertexCount; i++) {
      tmpV.set(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
      tmpN.set(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!);
      fn(tmpV, tmpN);
      p[i * 3] = tmpV.x;
      p[i * 3 + 1] = tmpV.y;
      p[i * 3 + 2] = tmpV.z;
      n[i * 3] = tmpN.x;
      n[i * 3 + 1] = tmpN.y;
      n[i * 3 + 2] = tmpN.z;
    }
  }

  applyMatrix(start: number, m: Matrix4): void {
    const nm = new Vector3();
    const e = m.elements;
    this.transformRange(start, (v, n) => {
      v.applyMatrix4(m);
      nm.set(e[0]! * n.x + e[4]! * n.y + e[8]! * n.z, e[1]! * n.x + e[5]! * n.y + e[9]! * n.z, e[2]! * n.x + e[6]! * n.y + e[10]! * n.z).normalize();
      n.copy(nm);
    });
  }

  get triangleCount(): number {
    return this.idx.n / 3;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos.view(), 3));
    g.setAttribute('normal', new BufferAttribute(this.nor.view(), 3));
    g.setAttribute('color', new BufferAttribute(this.col.view(), 3));
    for (const e of this.extras) g.setAttribute(e.name, new BufferAttribute(e.buf.view(), e.size));
    const idx = this.vertexCount > 65535 ? this.idx.a.slice(0, this.idx.n) : Uint16Array.from(this.idx.a.subarray(0, this.idx.n));
    g.setIndex(new BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
