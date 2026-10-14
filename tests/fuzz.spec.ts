import { test, expect } from '@playwright/test';
import { expectClean, openGame, saveResult } from './helpers';

// (b) Collision fuzz: >= 10 simulated minutes of random input over several seeds.
test('b. collision fuzz', async ({ page }) => {
  const problems = await openGame(page);
  const seeds = [11, 22, 33, 44, 55, 66];
  const seconds = 120;
  const reports: any[] = [];
  for (const seed of seeds) {
    const rep = await page.evaluate(([sd, s]) => (window as any).__game.fuzz(sd, s), [seed, seconds] as const);
    reports.push(rep);
    console.log(`fuzz seed ${seed}:`, JSON.stringify({ inside: rep.insideGeometry, maxPen: rep.maxPenetration, below: rep.belowGround, oob: rep.outOfBounds, nan: rep.nan, stuck: rep.stuckOver3s, maxNoProgress: rep.maxNoProgress, cam: rep.cameraInside, maxCamPen: rep.maxCameraPenetration, rec: rep.recoveries, splash: rep.splashes, msPerTick: rep.msPerTick, modes: rep.modeTicks }));
  }
  const sum = (k: string) => reports.reduce((a, r) => a + r[k], 0);
  const total = {
    simulatedMinutes: (seeds.length * seconds) / 60,
    insideGeometry: sum('insideGeometry'),
    belowGround: sum('belowGround'),
    outOfBounds: sum('outOfBounds'),
    nan: sum('nan'),
    stuckOver3s: sum('stuckOver3s'),
    cameraInside: sum('cameraInside'),
    maxPenetration: Math.max(...reports.map((r) => r.maxPenetration)),
    maxCameraPenetration: Math.max(...reports.map((r) => r.maxCameraPenetration)),
    maxNoProgressSeconds: Math.max(...reports.map((r) => r.maxNoProgress)),
    recoveries: sum('recoveries'),
    splashes: sum('splashes'),
    msPerTick: reports.reduce((a, r) => a + r.msPerTick, 0) / reports.length,
  };
  saveResult('b-fuzz', { total, reports });
  console.log('b. fuzz total', JSON.stringify(total));
  expect(total.simulatedMinutes).toBeGreaterThanOrEqual(10);
  expect(total.insideGeometry).toBe(0);
  expect(total.belowGround).toBe(0);
  expect(total.outOfBounds).toBe(0);
  expect(total.nan).toBe(0);
  expect(total.stuckOver3s).toBe(0);
  expect(total.cameraInside).toBe(0);
  expectClean(problems);
});
