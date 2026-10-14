import { Vector3 } from 'three';
import { tuning } from '../config/tuning';
import { Rng } from '../core/rng';
import type { Game } from '../game';
import { BOX, CYL, F_ANCHOR } from '../physics/collision';
import { MODE_GROUND, MODE_SWING, MODE_NAMES, MODE_WALL } from '../player/player';
import { makeAnchorResult } from '../player/targeting';

/** Injected input for tests; booleans are levels, edges are derived per tick. */
export interface BotInput {
  moveX: number;
  moveY: number;
  jump: boolean;
  sprint: boolean;
  dive: boolean;
  swing: boolean;
  zip: boolean;
  reel: number;
}

export function emptyBotInput(): BotInput {
  return { moveX: 0, moveY: 0, jump: false, sprint: false, dive: false, swing: false, zip: false, reel: 0 };
}

const v3 = new Vector3();

/** Run one tick with injected input (edges derived from the previous levels). */
export function stepWithInput(game: Game, inp: BotInput, prev: BotInput): void {
  const t = game.tickInput;
  game.injectInput = (out) => {
    out.moveX = inp.moveX;
    out.moveY = inp.moveY;
    out.jump = inp.jump;
    out.jumpPressed = inp.jump && !prev.jump;
    out.sprint = inp.sprint;
    out.dive = inp.dive;
    out.swing = inp.swing;
    out.swingPressed = inp.swing && !prev.swing;
    out.swingReleased = !inp.swing && prev.swing;
    out.zip = inp.zip;
    out.zipPressed = inp.zip && !prev.zip;
    out.reel = inp.reel;
  };
  game.manualTick();
  Object.assign(prev, inp);
  void t;
}

// -----------------------------------------------------------------------------
// a. Rope and swing test
// -----------------------------------------------------------------------------

export function ropeTest(game: Game, withDrag: boolean): Record<string, number | boolean | string> {
  const pl = game.player;
  const L = game.layout;
  const ax = (L.park.minX + L.park.maxX) / 2,
    az = L.pond.cz,
    ay = 140;
  const len = 30;
  const off = tuning.body.ropeOffset;
  const ang = Math.PI / 4;
  const savedDrag = tuning.air.drag;
  if (!withDrag) tuning.air.drag = 0;
  // Start at rest, 45 degrees from vertical, rope taut, swinging in +X.
  pl.teleport(ax - Math.sin(ang) * len, ay - Math.cos(ang) * len - off, az, 0, 0, 0);
  pl.debugAttach(ax, ay, az, len);
  const g = tuning.air.gravity * tuning.swing.gravityScale;
  const energy = (): number => 0.5 * pl.vel.lengthSq() + g * (pl.pos.y + off - (ay - len));
  const e0 = energy();
  let maxSpeed = 0,
    minAngle = 0,
    maxAngle = 0,
    nan = false,
    maxStretch = 0;
  const prev = emptyBotInput();
  const inp = emptyBotInput();
  inp.swing = true;
  prev.swing = true;
  const ticks = 120 * 12;
  let firstReturn = -1;
  let lastSign = 0;
  let crossings = 0;
  const angles: number[] = [];
  for (let i = 0; i < ticks; i++) {
    stepWithInput(game, inp, prev);
    if (pl.mode !== MODE_SWING) break;
    const p = pl.pos;
    if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
    const dx = p.x - ax,
      dy = p.y + off - ay;
    const a = Math.atan2(dx, -dy);
    angles.push(a);
    if (a < minAngle) minAngle = a;
    if (a > maxAngle) maxAngle = a;
    const sp = pl.vel.length();
    if (sp > maxSpeed) maxSpeed = sp;
    const stretch = Math.hypot(dx, dy, p.z - az) - len;
    if (stretch > maxStretch) maxStretch = stretch;
    const s = Math.sign(pl.vel.x);
    if (lastSign !== 0 && s !== lastSign) {
      crossings++;
      if (firstReturn < 0 && crossings === 2) firstReturn = i;
    }
    if (s !== 0) lastSign = s;
  }
  const e1 = energy();
  const seconds = ticks / 120;
  tuning.air.drag = savedDrag;
  // Theoretical small-angle-corrected period for g_eff.
  const T0 = 2 * Math.PI * Math.sqrt(len / g) * (1 + (1 / 16) * ang * ang + (11 / 3072) * ang ** 4);
  const measuredPeriod = firstReturn > 0 ? firstReturn / 120 : -1;
  return {
    withDrag,
    stillAttached: pl.mode === MODE_SWING,
    nan,
    energyStart: e0,
    energyEnd: e1,
    energyDriftPct: ((e1 - e0) / e0) * 100,
    energyDriftPctPerSecond: (((e1 - e0) / e0) * 100) / seconds,
    maxSpeed,
    theoreticalMaxSpeed: Math.sqrt(2 * g * len * (1 - Math.cos(ang))),
    minAngleDeg: (minAngle * 180) / Math.PI,
    maxAngleDeg: (maxAngle * 180) / Math.PI,
    maxRopeStretch: maxStretch,
    periodMeasured: measuredPeriod,
    periodTheory: T0,
    crossings,
  };
}

// -----------------------------------------------------------------------------
// b. Collision fuzz
// -----------------------------------------------------------------------------

export interface FuzzReport {
  seed: number;
  ticks: number;
  simSeconds: number;
  insideGeometry: number;
  maxPenetration: number;
  belowGround: number;
  outOfBounds: number;
  nan: number;
  stuckOver3s: number;
  maxNoProgress: number;
  cameraInside: number;
  maxCameraPenetration: number;
  recoveries: number;
  splashes: number;
  modeTicks: Record<string, number>;
  events: Record<string, number>;
  msPerTick: number;
  insideSamples: Array<Record<string, unknown>>;
  firstInsideHistory?: string[];
}

export function randomSpot(game: Game, rng: Rng, kind: number): Vector3 {
  const L = game.layout;
  const pl = game.player;
  const out = new Vector3();
  for (let tries = 0; tries < 60; tries++) {
    let x: number, z: number, y: number;
    if (kind === 0) {
      // Street level anywhere on the island.
      x = rng.range(L.land.minX + 10, L.land.maxX - 10);
      z = rng.range(L.land.minZ + 10, L.land.maxZ - 10);
      y = 0.5;
    } else if (kind === 1) {
      const b = L.buildings[rng.int(0, L.buildings.length - 1)]!;
      const top = b.volumes[b.volumes.length - 1]!;
      x = rng.range(top.minX + 1, top.maxX - 1);
      z = rng.range(top.minZ + 1, top.maxZ - 1);
      y = top.maxY + 1;
    } else {
      x = rng.range(L.park.minX + 5, L.park.maxX - 5);
      z = rng.range(L.park.minZ + 5, L.park.maxZ - 5);
      y = 0.5;
    }
    if (pl.findSafeSpot(x, y, z, out)) return out;
  }
  out.set(L.spawn[0], L.spawn[1] + 0.1, L.spawn[2]);
  return out;
}

export function fuzz(game: Game, seed: number, seconds: number): FuzzReport {
  const rng = new Rng(seed * 7919 + 13);
  const pl = game.player;
  const w = game.world;
  const r = tuning.body.radius,
    h = tuning.body.height;
  const ticks = Math.round(seconds * 120);
  const rep: FuzzReport = {
    seed,
    ticks,
    simSeconds: seconds,
    insideGeometry: 0,
    maxPenetration: 0,
    belowGround: 0,
    outOfBounds: 0,
    nan: 0,
    stuckOver3s: 0,
    maxNoProgress: 0,
    cameraInside: 0,
    maxCameraPenetration: 0,
    recoveries: 0,
    splashes: 0,
    modeTicks: {},
    events: {},
    msPerTick: 0,
    insideSamples: [],
  };
  const startStats = { ...pl.stats };
  const inp = emptyBotInput();
  const prev = emptyBotInput();
  let segLeft = 0;
  let yawRate = 0,
    pitchTarget = 0;
  let nextTeleport = 0;
  const history: string[] = [];
  const anchorPos = new Vector3().copy(pl.pos);
  let noProgress = 0;
  const b = game.layout.bounds;
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    if (i >= nextTeleport) {
      const spot = randomSpot(game, rng, rng.int(0, 2));
      // Sometimes drop in from the air with speed.
      if (rng.chance(0.4)) {
        pl.teleport(spot.x, spot.y + rng.range(5, 60), spot.z, rng.range(-30, 30), rng.range(-10, 10), rng.range(-30, 30));
      } else pl.teleport(spot.x, spot.y, spot.z);
      game.snapCamera();
      game.prevPos.copy(pl.pos);
      nextTeleport = i + rng.int(120 * 15, 120 * 35);
      anchorPos.copy(pl.pos);
      noProgress = 0;
    }
    if (segLeft <= 0) {
      segLeft = rng.int(12, 200);
      inp.moveY = rng.weighted([1, 0, -1], [6, 2, 1]);
      inp.moveX = rng.weighted([0, 1, -1], [5, 1.5, 1.5]);
      inp.sprint = rng.chance(0.45);
      inp.dive = rng.chance(0.12);
      inp.swing = rng.chance(0.45);
      inp.zip = rng.chance(0.08);
      inp.jump = rng.chance(0.25);
      inp.reel = rng.chance(0.05) ? rng.int(-2, 2) : 0;
      yawRate = rng.range(-2.5, 2.5) * (rng.chance(0.3) ? 0 : 1);
      pitchTarget = rng.range(-0.6, 0.7);
    } else {
      segLeft--;
      if (inp.jump && rng.chance(0.2)) inp.jump = false;
      if (inp.zip && rng.chance(0.3)) inp.zip = false;
      inp.reel = 0;
    }
    game.rig.setLook(game.rig.yaw + yawRate / 120, game.rig.pitch + (pitchTarget - game.rig.pitch) * 0.05);
    stepWithInput(game, inp, prev);
    history.push(`${i} ${MODE_NAMES[pl.mode]} p=${pl.pos.x.toFixed(2)},${pl.pos.y.toFixed(2)},${pl.pos.z.toFixed(2)} v=${pl.vel.x.toFixed(1)},${pl.vel.y.toFixed(1)},${pl.vel.z.toFixed(1)} in=${inp.moveX},${inp.moveY},${inp.sprint ? 'S' : ''}${inp.jump ? 'J' : ''}${inp.swing ? 'L' : ''}${inp.zip ? 'R' : ''} ev=${pl.events.map((e) => e.type).join('/')}`);
    if (history.length > 50) history.shift();
    for (const e of pl.events) rep.events[e.type] = (rep.events[e.type] ?? 0) + 1;
    const mn = MODE_NAMES[pl.mode]!;
    rep.modeTicks[mn] = (rep.modeTicks[mn] ?? 0) + 1;
    const p = pl.pos;
    if (!Number.isFinite(p.x + p.y + p.z + pl.vel.x + pl.vel.y + pl.vel.z)) rep.nan++;
    const pen = w.capsulePenetration(p.x, p.y, p.z, r, h);
    if (pen > rep.maxPenetration) rep.maxPenetration = pen;
    if (pen > 0.03) {
      rep.insideGeometry++;
      if (!rep.firstInsideHistory) rep.firstInsideHistory = history.slice();
      if (rep.insideSamples.length < 12) {
        const dc = w.deepestContact(p.x, p.y, p.z, r, h);
        rep.insideSamples.push({
          tick: i,
          mode: MODE_NAMES[pl.mode]!,
          depth: +pen.toFixed(3),
          pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
          vel: [+pl.vel.x.toFixed(1), +pl.vel.y.toFixed(1), +pl.vel.z.toFixed(1)],
          kind: dc.id >= 0 ? w.kind[dc.id]! : dc.id,
          flags: dc.id >= 0 ? w.flags[dc.id]! : 0,
          box: dc.id >= 0 ? Array.from(w.p.subarray(dc.id * 6, dc.id * 6 + 6)).map((v) => +v.toFixed(2)) : [],
        });
      }
    }
    if (!w.terrain.isWater(p.x, p.z) && p.y < w.terrain.height(p.x, p.z) - 0.03) rep.belowGround++;
    if (p.x < b.minX - 0.01 || p.x > b.maxX + 0.01 || p.z < b.minZ - 0.01 || p.z > b.maxZ + 0.01) rep.outOfBounds++;
    // Stuck tracking (independent of the player's own detector).
    if (p.distanceTo(anchorPos) > 0.3) {
      anchorPos.copy(p);
      noProgress = 0;
    } else {
      const trying = inp.moveX !== 0 || inp.moveY !== 0;
      const airborne = pl.mode !== MODE_GROUND && pl.mode !== MODE_WALL && pl.mode !== MODE_SWING;
      if (airborne || (trying && pl.mode === MODE_GROUND)) noProgress += 1 / 120;
      else noProgress = 0;
      if (noProgress > rep.maxNoProgress) rep.maxNoProgress = noProgress;
      if (noProgress > 3.25) {
        // Blocked in one direction is fine (player can turn); count only true traps.
        if (!pl.hasFreeDirection()) rep.stuckOver3s++;
        noProgress = 0;
      }
    }
    // Camera
    const cp = game.rig.position;
    const cpen = w.spherePenetration(cp.x, cp.y, cp.z, 0.2);
    if (cpen > rep.maxCameraPenetration) rep.maxCameraPenetration = cpen;
    if (cpen > 0.02) rep.cameraInside++;
  }
  rep.msPerTick = (performance.now() - t0) / ticks;
  rep.recoveries = pl.stats.recoveries - startStats.recoveries;
  rep.splashes = pl.stats.splashes - startStats.splashes;
  return rep;
}

// -----------------------------------------------------------------------------
// c. Anchor availability
// -----------------------------------------------------------------------------

export function anchorAvailability(game: Game, seed: number, count: number): Record<string, number> {
  const rng = new Rng(seed);
  const pl = game.player;
  const w = game.world;
  const res = makeAnchorResult();
  let inRange = 0,
    found = 0,
    foundAll = 0,
    total = 0;
  const kinds = [0, 0, 0];
  const foundByKind = [0, 0, 0];
  const rangeByKind = [0, 0, 0];
  const buf = new Int32Array(4096);
  let msTargeting = 0;
  const failures: Array<Record<string, unknown>> = [];
  for (let i = 0; i < count; i++) {
    const kind = i % 3;
    const spot = randomSpot(game, rng, kind);
    pl.teleport(spot.x, spot.y, spot.z);
    const yaw = rng.range(-Math.PI, Math.PI);
    const pitch = rng.range(-0.1, 0.3);
    game.rig.setLook(yaw, pitch);
    game.snapCamera();
    game.prevPos.copy(pl.pos);
    game.updateCameraForTest();
    const t0 = performance.now();
    pl.targeting.debug = true;
    const ok = pl.targeting.find(0, pl.pos.x, pl.pos.y, pl.pos.z, game.rig.position.x, game.rig.position.y, game.rig.position.z, game.rig.fwd.x, game.rig.fwd.y, game.rig.fwd.z, res);
    msTargeting += performance.now() - t0;
    total++;
    kinds[kind]!++;
    if (ok) foundAll++;
    // Brute-force existence check: any anchorable surface sample in the cone, >= 6 m above, with LOS.
    const hx = pl.pos.x,
      hy = pl.pos.y + tuning.body.ropeOffset,
      hz = pl.pos.z;
    const fx = -Math.sin(yaw),
      fz = -Math.cos(yaw);
    const cosMax = Math.cos((tuning.assist.maxAimAngleDeg * Math.PI) / 180);
    const R = Math.min(tuning.assist.range, tuning.swing.maxRange);
    const n = w.gatherAabb(hx - R, pl.pos.y + 5, hz - R, hx + R, hy + R, hz + R, buf, F_ANCHOR);
    const samples: Array<[number, number, number, number, number]> = [];
    const push = (x: number, y: number, z: number, id: number): void => {
      if (y < pl.pos.y + tuning.swing.minHeightAbove) return;
      const dx = x - hx,
        dy = y - hy,
        dz = z - hz;
      const d = Math.hypot(dx, dy, dz);
      if (d > R || d < tuning.assist.minDistance) return;
      if (dy < Math.sin((tuning.swing.minElevationDeg * Math.PI) / 180) * d) return;
      const hl = Math.hypot(dx, dz);
      if (hl > 0.5 && (dx * fx + dz * fz) / hl < cosMax) return;
      samples.push([d, x, y, z, id]);
    };
    for (let k = 0; k < n; k++) {
      const id = buf[k]!;
      const o = id * 6;
      const p = w.p;
      if (w.kind[id] === BOX) {
        // Sample the faces that face the player.
        const minX = p[o]!,
          minY = p[o + 1]!,
          minZ = p[o + 2]!,
          maxX = p[o + 3]!,
          maxY = p[o + 4]!,
          maxZ = p[o + 5]!;
        const ys: number[] = [];
        for (let y = Math.max(minY, pl.pos.y + 6); y <= maxY + 0.01; y += 4) ys.push(Math.min(y, maxY));
        ys.push(maxY);
        const faces: Array<[number, number, number, number, boolean]> = [];
        if (hx > maxX) faces.push([maxX, minZ, maxX, maxZ, true]);
        if (hx < minX) faces.push([minX, minZ, minX, maxZ, true]);
        if (hz > maxZ) faces.push([minX, maxZ, maxX, maxZ, false]);
        if (hz < minZ) faces.push([minX, minZ, maxX, minZ, false]);
        for (const f of faces) {
          const len = f[4] ? f[3] - f[1] : f[2] - f[0];
          const steps = Math.max(1, Math.ceil(len / 4));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const x = f[4] ? f[0] : f[0] + (f[2] - f[0]) * t;
            const z = f[4] ? f[1] + (f[3] - f[1]) * t : f[1];
            for (const y of ys) push(x, y, z, id);
          }
        }
      } else if (w.kind[id] === CYL) {
        const cx = p[o]!,
          cz = p[o + 2]!,
          R2 = p[o + 4]!;
        const dx = hx - cx,
          dz = hz - cz;
        const dl = Math.hypot(dx, dz) || 1;
        for (let y = p[o + 1]!; y <= p[o + 3]!; y += 3) push(cx + (dx / dl) * R2, y, cz + (dz / dl) * R2, id);
        push(cx + (dx / dl) * R2, p[o + 3]!, cz + (dz / dl) * R2, id);
      } else {
        const cx = p[o]!,
          cy = p[o + 1]!,
          cz = p[o + 2]!;
        for (let a = 0; a < 8; a++) {
          const th = (a / 8) * Math.PI * 2;
          for (const el of [-0.5, 0, 0.5, 1.2]) {
            push(cx + Math.cos(th) * Math.cos(el) * p[o + 3]!, cy + Math.sin(el) * p[o + 4]!, cz + Math.sin(th) * Math.cos(el) * p[o + 5]!, id);
          }
        }
      }
    }
    samples.sort((a, b) => a[0] - b[0]);
    let exists = false;
    let witness: [number, number, number, number, number] | null = null;
    for (let s = 0; s < samples.length && s < 400; s++) {
      const [, x, y, z, id] = samples[s]!;
      if (pl.targeting.lineOfSight(hx, hy, hz, x, y, z, id)) {
        exists = true;
        witness = samples[s]!;
        break;
      }
    }
    if (exists) {
      inRange++;
      rangeByKind[kind]!++;
      if (ok) {
        found++;
        foundByKind[kind]!++;
      } else if (failures.length < 14 && witness) {
        failures.push({
          kind,
          pos: [+pl.pos.x.toFixed(1), +pl.pos.y.toFixed(1), +pl.pos.z.toFixed(1)],
          yaw: +yaw.toFixed(2),
          pitch: +pitch.toFixed(2),
          witness: { d: +witness[0].toFixed(1), y: +witness[2].toFixed(1), kind: w.kind[witness[4]]!, flags: w.flags[witness[4]]! },
          candidates: pl.targeting.lastCandidates,
          scored: pl.targeting.lastScored,
          los: pl.targeting.debugLog.slice(0, 4).map((e) => ({ ...e })),
        });
      }
    }
  }
  return {
    total,
    inRange,
    found,
    rate: inRange > 0 ? found / inRange : 0,
    rawRate: foundAll / total,
    streetRate: rangeByKind[0]! ? foundByKind[0]! / rangeByKind[0]! : 0,
    roofRate: rangeByKind[1]! ? foundByKind[1]! / rangeByKind[1]! : 0,
    parkRate: rangeByKind[2]! ? foundByKind[2]! / rangeByKind[2]! : 0,
    inRangeStreet: rangeByKind[0]!,
    inRangeRoof: rangeByKind[1]!,
    inRangePark: rangeByKind[2]!,
    msPerQuery: msTargeting / total,
    failures: failures as unknown as number,
  };
}

// -----------------------------------------------------------------------------
// d. Traversal bots
// -----------------------------------------------------------------------------

export interface BotReport {
  name: string;
  reached: boolean;
  seconds: number;
  groundSeconds: number;
  groundFraction: number;
  distance: number;
  avgSpeed: number;
  swings: number;
  goodReleases: number;
  splashes: number;
  recoveries: number;
  maxAltitude: number;
  minAltitudeAir: number;
  medianSpeed: number;
  maxSpeed: number;
  swingLog: Array<Record<string, number | string>>;
  path: Array<[number, number, number]>;
}

/** Follow a polyline route by swinging. Uses only player inputs plus visible cues. */
export function traversalBot(game: Game, name: string, route: Array<[number, number]>, maxSeconds: number, startY?: number, diag = false): BotReport {
  const swingLog: Array<Record<string, number | string>> = [];
  let cur: { [k: string]: number | string; maxY: number; minY: number; ceil: number; wall: number; ground: number } | null = null;
  const pl = game.player;
  const out = new Vector3();
  const start = route[0]!;
  if (!pl.findSafeSpot(start[0], startY ?? 0.5, start[1], out)) out.set(start[0], 0.15, start[1]);
  pl.teleport(out.x, out.y, out.z);
  const first = route[1]!;
  game.rig.setLook(Math.atan2(-(first[0] - start[0]), -(first[1] - start[1])), 0.2);
  game.snapCamera();
  game.prevPos.copy(pl.pos);
  const inp = emptyBotInput();
  const prev = emptyBotInput();
  let seg = 0;
  let ticks = 0,
    groundTicks = 0;
  let swings = 0,
    good = 0;
  const startStats = { ...pl.stats };
  let state: 'run' | 'swing' | 'fly' = 'run';
  let stateT = 0;
  let distance = 0;
  const last = new Vector3().copy(pl.pos);
  let maxAlt = 0,
    minAltAir = 1e9;
  const path: Array<[number, number, number]> = [];
  const speeds: number[] = [];
  const goal = route[route.length - 1]!;
  let reached = false;
  const maxTicks = maxSeconds * 120;
  while (ticks < maxTicks) {
    // Advance along the route.
    const p = pl.pos;
    while (seg < route.length - 1) {
      const a = route[seg]!,
        b = route[seg + 1]!;
      const abx = b[0] - a[0],
        abz = b[1] - a[1];
      const l2 = abx * abx + abz * abz;
      const t = ((p.x - a[0]) * abx + (p.z - a[1]) * abz) / l2;
      if (t > 0.98) seg++;
      else break;
    }
    if (Math.hypot(p.x - goal[0], p.z - goal[1]) < 40) {
      reached = true;
      break;
    }
    // Look-ahead target 70 m along the route.
    const a = route[seg]!,
      b = route[Math.min(route.length - 1, seg + 1)]!;
    const abx = b[0] - a[0],
      abz = b[1] - a[1];
    const ab = Math.hypot(abx, abz) || 1;
    const t = Math.max(0, ((p.x - a[0]) * abx + (p.z - a[1]) * abz) / ab);
    let tx = a[0] + (abx / ab) * Math.min(ab, t + 70);
    let tz = a[1] + (abz / ab) * Math.min(ab, t + 70);
    if (t + 70 > ab && seg + 2 < route.length) {
      const c = route[seg + 2]!;
      const over = t + 70 - ab;
      const bcx = c[0] - b[0],
        bcz = c[1] - b[1];
      const bc = Math.hypot(bcx, bcz) || 1;
      tx = b[0] + (bcx / bc) * Math.min(bc, over);
      tz = b[1] + (bcz / bc) * Math.min(bc, over);
    }
    // Pull back toward the route line when drifting sideways.
    const yawTarget = Math.atan2(-(tx - p.x), -(tz - p.z));
    let dy = yawTarget - game.rig.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const pitchT = 0.34;
    game.rig.setLook(game.rig.yaw + dy * 0.08, game.rig.pitch + (pitchT - game.rig.pitch) * 0.1);

    inp.moveY = 1;
    inp.moveX = 0;
    inp.sprint = true;
    inp.jump = false;
    inp.dive = false;
    stateT += 1 / 120;
    const rope = pl.rope;
    if (pl.mode === MODE_SWING) {
      if (state !== 'swing') {
        state = 'swing';
        stateT = 0;
        swings++;
      }
      inp.swing = true;
      const v = pl.vel;
      // Release on the rising arc (visible cue), or when past the anchor, or after a while.
      const past = rope.attached && (v.x * (rope.anchor.x - p.x) + v.z * (rope.anchor.z - p.z)) < 0;
      // Swing angle from straight down: release later on the arc when low (to gain height).
      const ax = p.x - rope.anchor.x,
        ay = p.y + tuning.body.ropeOffset - rope.anchor.y,
        az = p.z - rope.anchor.z;
      const ang = (Math.acos(Math.max(-1, Math.min(1, -ay / (Math.hypot(ax, ay, az) || 1)))) * 180) / Math.PI;
      const wantAngle = p.y < 30 ? 38 : 18;
      const goodNow = rope.goodWindow && ang >= wantAngle;
      if (rope.attached && (goodNow || (past && v.y > 0 && stateT > 0.8) || stateT > 3.2)) {
        if (rope.goodWindow) good++;
        inp.swing = false;
        state = 'fly';
        stateT = 0;
      }
    } else {
      if (state === 'swing') {
        state = 'fly';
        stateT = 0;
      }
      if (state === 'fly') {
        // Re-attach once falling, or right away when close to the ground.
        inp.swing = (pl.vel.y < -0.5 && stateT > 0.12) || (p.y < 4 && pl.vel.y < 2) || stateT > 1.4;
        if (pl.mode === MODE_GROUND) state = 'run';
      } else {
        // On the ground: run and try to swing.
        inp.swing = pl.swingTarget.valid && ticks % 30 > 2;
        inp.jump = ticks % 50 === 0;
      }
    }
    stepWithInput(game, inp, prev);
    if (diag) {
      for (const e of pl.events) {
        if (e.type === 'attach') {
          const id = pl.rope.anchor.id;
          cur = { t: +(ticks / 120).toFixed(2), ay: +e.y.toFixed(1), py: +pl.pos.y.toFixed(1), len: +pl.rope.length.toFixed(1), kind: id >= 0 ? game.world.kind[id]! : -1, maxY: pl.pos.y, minY: pl.pos.y, ceil: 0, wall: 0, ground: 0, spd: +pl.vel.length().toFixed(1), end: '' };
          swingLog.push(cur);
        }
        if (e.type === 'release' && cur) cur.end = e.good ? 'good' : e.broken ? 'broken' : 'rel';
      }
      if (cur && pl.mode === MODE_SWING) {
        cur.maxY = Math.max(cur.maxY, pl.pos.y);
        cur.minY = Math.min(cur.minY, pl.pos.y);
        if (pl.contact.ceiling) cur.ceil++;
        if (pl.contact.wall) cur.wall++;
        if (pl.contact.ground) cur.ground++;
      }
    }
    ticks++;
    if (pl.mode === MODE_GROUND) groundTicks++;
    distance += pl.pos.distanceTo(last);
    last.copy(pl.pos);
    if (pl.pos.y > maxAlt) maxAlt = pl.pos.y;
    speeds.push(pl.vel.length());
    if (pl.mode !== MODE_GROUND && pl.pos.y < minAltAir) minAltAir = pl.pos.y;
    if (ticks % 60 === 0) path.push([+pl.pos.x.toFixed(1), +pl.pos.y.toFixed(1), +pl.pos.z.toFixed(1)]);
  }
  const seconds = ticks / 120;
  return {
    name,
    reached,
    seconds,
    groundSeconds: groundTicks / 120,
    groundFraction: groundTicks / Math.max(1, ticks),
    distance,
    avgSpeed: distance / Math.max(0.01, seconds),
    swings,
    goodReleases: good,
    splashes: pl.stats.splashes - startStats.splashes,
    recoveries: pl.stats.recoveries - startStats.recoveries,
    maxAltitude: maxAlt,
    minAltitudeAir: minAltAir,
    swingLog: swingLog.map((c) => ({ ...c, maxY: +Number(c.maxY).toFixed(1), minY: +Number(c.minY).toFixed(1) })),
    medianSpeed: speeds.sort((a, b) => a - b)[Math.floor(speeds.length / 2)] ?? 0,
    maxSpeed: speeds[speeds.length - 1] ?? 0,
    path,
  };
}

export function cityRoute(game: Game): Array<[number, number]> {
  const L = game.layout;
  // South-west corner to north-east corner along avenues and streets.
  const westAve = L.avenues[1]!.center;
  const northSt = L.streets[1]!.center;
  const southSt = L.streets[L.streets.length - 2]!.center;
  const eastAve = L.avenues[L.avenues.length - 2]!.center;
  return [
    [westAve, southSt + 5],
    [westAve, northSt],
    [eastAve, northSt],
  ];
}

export function parkRoute(game: Game): Array<[number, number]> {
  const L = game.layout;
  const P = L.park;
  const pond = L.pond;
  // South edge to north edge, skirting the pond on its wider side.
  const westRoom = pond.cx - pond.rx - P.minX;
  const eastRoom = P.maxX - (pond.cx + pond.rx);
  const sideX = westRoom > eastRoom ? (P.minX + pond.cx - pond.rx) / 2 : (P.maxX + pond.cx + pond.rx) / 2;
  return [
    [(P.minX + P.maxX) / 2, P.maxZ - 12],
    [sideX, pond.cz + pond.rz + 20],
    [sideX, pond.cz - pond.rz - 20],
    [(P.minX + P.maxX) / 2, P.minZ + 12],
  ];
}

void v3;

// -----------------------------------------------------------------------------
// Extra swing checks: catch conversion and re-attach latency
// -----------------------------------------------------------------------------

/** Fall onto a slack rope from directly below the anchor: speed must survive the catch. */
export function catchTest(game: Game): Record<string, number | boolean> {
  const pl = game.player;
  const L = game.layout;
  const ax = (L.park.minX + L.park.maxX) / 2,
    az = L.pond.cz,
    ay = 150;
  const off = tuning.body.ropeOffset;
  game.rig.setLook(0, 0);
  game.snapCamera();
  // 4 m of slack, falling at 25 m/s with a little forward drift.
  pl.teleport(ax, ay - 26 - off, az, 0.5, -25, 0);
  pl.debugAttach(ax, ay, az, 30);
  pl.rope.wasTaut = false;
  pl.rope.taut = false;
  const inp = emptyBotInput();
  inp.swing = true;
  const prev = emptyBotInput();
  prev.swing = true;
  const before = pl.vel.length();
  let after = 0,
    minSpeed = 1e9;
  for (let i = 0; i < 60; i++) {
    stepWithInput(game, inp, prev);
    const sp = pl.vel.length();
    if (sp < minSpeed) minSpeed = sp;
    if (pl.rope.taut && after === 0) after = sp;
  }
  return { speedBefore: before, speedAfterCatch: after, minSpeedDuring: minSpeed, ratio: after / before, stillSwinging: pl.mode === MODE_SWING };
}

/** Release a swing and immediately press again: time until the new line is attached. */
export function reattachLatency(game: Game): Record<string, number> {
  const pl = game.player;
  const L = game.layout;
  const route = cityRoute(game);
  const start = route[0]!;
  const out = new Vector3();
  pl.findSafeSpot(start[0], 0.5, start[1], out);
  const results: number[] = [];
  const totals: number[] = [];
  const inp = emptyBotInput();
  const prev = emptyBotInput();
  for (let trial = 0; trial < 8; trial++) {
    // Fresh press each trial (release first).
    inp.swing = false;
    stepWithInput(game, inp, prev);
    pl.teleport(out.x, out.y + 18 + trial * 2, out.z - trial * 40, 0, 0, -20);
    game.rig.setLook(0, 0.35);
    game.snapCamera();
    inp.swing = true;
    inp.moveY = 1;
    let attachedAt = -1;
    for (let i = 0; i < 120 && attachedAt < 0; i++) {
      stepWithInput(game, inp, prev);
      if (pl.rope.attached) attachedAt = i;
    }
    if (attachedAt < 0) continue;
    for (let i = 0; i < 40; i++) stepWithInput(game, inp, prev);
    // Release, then press again as soon as the reticle shows a valid anchor
    // (a player re-presses when the crosshair lights up).
    inp.swing = false;
    stepWithInput(game, inp, prev);
    let waited = 0;
    while (!pl.swingTarget.valid && waited < 120) {
      stepWithInput(game, inp, prev);
      waited++;
    }
    inp.swing = true;
    let ticks = 0;
    while (ticks < 120) {
      stepWithInput(game, inp, prev);
      ticks++;
      if (pl.rope.attached) break;
    }
    // Total from release to attached, including the wait for a valid reticle.
    results.push(((ticks + 1) * 1000) / 120);
    totals.push(((ticks + 1 + waited) * 1000) / 120);
  }
  void L;
  results.sort((a, b) => a - b);
  totals.sort((a, b) => a - b);
  return {
    trials: results.length,
    minMs: results[0] ?? -1,
    medianMs: results[Math.floor(results.length / 2)] ?? -1,
    maxMs: results[results.length - 1] ?? -1,
    releaseToAttachMedianMs: totals[Math.floor(totals.length / 2)] ?? -1,
    releaseToAttachMaxMs: totals[totals.length - 1] ?? -1,
  };
}
