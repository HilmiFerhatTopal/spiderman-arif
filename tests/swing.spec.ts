import { test, expect } from '@playwright/test';
import { expectClean, openGame, saveResult } from './helpers';

// (a) Rope and swing: a pendulum released from rest at 45 degrees.
test('a. rope and swing behave as designed', async ({ page }) => {
  const problems = await openGame(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__game;
    return { noDrag: g.ropeTest(false), withDrag: g.ropeTest(true), catch: g.catchTest(), reattach: g.reattachLatency() };
  });
  saveResult('a-swing', r);
  console.log('a. swing', JSON.stringify(r, null, 1));
  const a = r.noDrag;
  // Pure rope mechanics: energy is conserved (documented drift < 0.05 % over 12 s).
  expect(a.nan).toBe(false);
  expect(a.stillAttached).toBe(true);
  expect(Math.abs(a.energyDriftPct)).toBeLessThan(0.05);
  expect(Math.abs(a.maxAngleDeg - 45)).toBeLessThan(0.5);
  expect(Math.abs(a.minAngleDeg + 45)).toBeLessThan(0.5);
  expect(Math.abs(a.periodMeasured - a.periodTheory) / a.periodTheory).toBeLessThan(0.01);
  expect(Math.abs(a.maxSpeed - a.theoreticalMaxSpeed) / a.theoreticalMaxSpeed).toBeLessThan(0.01);
  expect(a.maxRopeStretch).toBeLessThan(0.01);
  // With the designed air drag: bounded, monotonic decay, no explosion.
  const b = r.withDrag;
  expect(b.nan).toBe(false);
  expect(b.energyDriftPct).toBeLessThan(0);
  expect(b.energyDriftPct).toBeGreaterThan(-40);
  expect(b.maxSpeed).toBeLessThanOrEqual(a.theoreticalMaxSpeed * 1.001);
  // Catch: falling onto the line keeps most of the speed (no stall).
  expect(r.catch.stillSwinging).toBe(true);
  expect(r.catch.ratio).toBeGreaterThan(0.85);
  // Chaining: release and re-press attaches again in under 150 ms.
  expect(r.reattach.trials).toBeGreaterThanOrEqual(4);
  expect(r.reattach.maxMs).toBeLessThan(150);
  expectClean(problems);
});
