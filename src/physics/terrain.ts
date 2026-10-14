import type { CityLayout, Road } from '../world/types';
import { SURF_CONCRETE, SURF_GRASS } from './collision';
import { tuning } from '../config/tuning';

export const CURB = 0.15;

/**
 * Terrain height function: roads at y = 0, blocks, sidewalks, plazas, park
 * and promenade at the curb height, water outside the island and in the pond.
 * Analytic, so it never tunnels and costs a couple of binary searches.
 */
export class Terrain {
  readonly roadHeight = 0;
  private avX0: Float64Array;
  private avX1: Float64Array;
  private stZ0: Float64Array;
  private stZ1: Float64Array;

  constructor(private readonly layout: CityLayout) {
    const toArrays = (roads: Road[]): [Float64Array, Float64Array] => {
      const a = new Float64Array(roads.length);
      const b = new Float64Array(roads.length);
      roads.forEach((r, i) => {
        a[i] = r.center - r.width / 2;
        b[i] = r.center + r.width / 2;
      });
      return [a, b];
    };
    [this.avX0, this.avX1] = toArrays(layout.avenues);
    [this.stZ0, this.stZ1] = toArrays(layout.streets);
  }

  private static inStrips(v: number, lo: Float64Array, hi: Float64Array): boolean {
    // Binary search the last strip whose start <= v.
    let a = 0,
      b = lo.length - 1,
      idx = -1;
    while (a <= b) {
      const m = (a + b) >> 1;
      if (lo[m]! <= v) {
        idx = m;
        a = m + 1;
      } else b = m - 1;
    }
    return idx >= 0 && v <= hi[idx]!;
  }

  inPond(x: number, z: number): boolean {
    const p = this.layout.pond;
    const dx = (x - p.cx) / p.rx,
      dz = (z - p.cz) / p.rz;
    return dx * dx + dz * dz < 1;
  }

  inPark(x: number, z: number): boolean {
    const p = this.layout.park;
    return x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ;
  }

  onLand(x: number, z: number): boolean {
    const l = this.layout.land;
    if (x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ) return true;
    const i = this.layout.islet;
    return x >= i.minX && x <= i.maxX && z >= i.minZ && z <= i.maxZ;
  }

  isWater(x: number, z: number): boolean {
    if (!this.onLand(x, z)) return true;
    return this.inPark(x, z) && this.inPond(x, z);
  }

  waterLevelAt(x: number, z: number): number {
    if (this.onLand(x, z) && this.inPark(x, z) && this.inPond(x, z)) return this.layout.pond.level;
    return tuning.world.waterLevel;
  }

  isRoad(x: number, z: number): boolean {
    const l = this.layout.land;
    if (x < l.minX || x > l.maxX || z < l.minZ || z > l.maxZ) return false;
    if (this.inPark(x, z)) return false;
    return Terrain.inStrips(x, this.avX0, this.avX1) || Terrain.inStrips(z, this.stZ0, this.stZ1);
  }

  /** Ground surface height (valid on land; over water returns the bed height). */
  height(x: number, z: number): number {
    if (!this.onLand(x, z)) return -12;
    if (this.isRoad(x, z)) return 0;
    return CURB;
  }

  surfaceAt(x: number, z: number): number {
    if (this.inPark(x, z)) return SURF_GRASS;
    return SURF_CONCRETE;
  }
}
