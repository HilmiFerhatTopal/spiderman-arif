import { test, expect } from '@playwright/test';
import { expectClean, openGame, saveResult } from './helpers';

// (h) Life and extras: three ring routes (~20 rings) that are clear of
// geometry and reachable (a swing anchor is available on the approach to
// every ring), a run through each route starts, counts every ring in order,
// finishes and saves a best time (only beaten by a faster run), an abandoned
// run ends quietly; traffic drives on roads with stops at lights, and
// pedestrians stay on sidewalks and park paths; densities follow quality.
test('h. ring races, traffic and pedestrians', async ({ page }) => {
  const problems = await openGame(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__game;
    localStorage.removeItem('skythread.bestTimes.v1');
    const rings = g.ringTest();
    const stored = JSON.parse(localStorage.getItem('skythread.bestTimes.v1') ?? '{}');
    const life = g.lifeTest();
    return { rings, stored, life };
  });
  saveResult('h-rings-life', r);
  console.log('h. rings', JSON.stringify(r.rings));
  console.log('h. stored best times', JSON.stringify(r.stored));
  console.log('h. life', JSON.stringify(r.life));
  expect(r.rings.routes).toBe(3);
  expect(r.rings.rings).toBeGreaterThanOrEqual(18);
  expect(r.rings.rings).toBeLessThanOrEqual(22);
  for (const p of r.rings.perRoute) {
    expect(p.clear).toBe(p.rings);
    expect(p.anchorsOnApproach).toBe(p.rings);
  }
  for (const race of r.rings.races) {
    expect(race.finished).toBe(true);
    expect(race.passes).toBe(r.rings.perRoute.find((p: any) => p.id === race.id).rings);
    expect(race.firstNewBest).toBe(true);
    expect(race.fasterNewBest).toBe(true);
    expect(race.slowerNewBest).toBe(false);
    expect(race.time45).toBeLessThan(race.time30);
    expect(r.stored[race.id]).toBeCloseTo(race.best, 6);
  }
  expect(r.rings.abandon.started).toBe(0);
  expect(r.rings.abandon.afterTimeout).toBe(-1);
  expect(r.rings.abandon.hud).toBeNull();
  // Traffic and crowd.
  expect(r.life.q0cars).toBeLessThan(r.life.q1cars);
  expect(r.life.q1cars).toBeLessThan(r.life.q2cars);
  expect(r.life.q2cars).toBeLessThan(r.life.q3cars);
  expect(r.life.q0peds).toBeLessThan(r.life.q3peds);
  expect(r.life.carNaN).toBe(0);
  expect(r.life.carsOffRoad).toBe(0);
  expect(r.life.maxStoppedAtOnce).toBeGreaterThan(0);
  expect(r.life.maxTurningAtOnce).toBeGreaterThan(0);
  expect(r.life.meanSpeed).toBeGreaterThan(3);
  expect(r.life.pedsOnRoad).toBe(0);
  expectClean(problems);
});
