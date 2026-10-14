import { test, expect } from '@playwright/test';
import { expectClean, openGame, saveResult } from './helpers';

// (d) Traversal bots: corner to corner along avenues, and across the park tree to tree.
test('d. traversal bots spend < 10% of the time on the ground', async ({ page }) => {
  const problems = await openGame(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__game;
    const city = g.cityBot(300);
    const park = g.parkBot(200, true);
    const parkAnchors = park.swingLog.map((s: any) => s.kind);
    delete city.path;
    delete park.path;
    delete park.swingLog;
    return { city, park, parkAnchorKinds: parkAnchors };
  });
  saveResult('d-traversal', r);
  console.log('d. city', JSON.stringify(r.city));
  console.log('d. park', JSON.stringify(r.park));
  expect(r.city.reached).toBe(true);
  expect(r.city.groundFraction).toBeLessThan(0.1);
  expect(r.city.distance).toBeGreaterThan(1800);
  expect(r.park.reached).toBe(true);
  expect(r.park.groundFraction).toBeLessThan(0.1);
  // Tree to tree: every park swing used a tree (cylinder trunk = 1, canopy ellipsoid = 2).
  expect(r.parkAnchorKinds.every((k: number) => k === 1 || k === 2)).toBe(true);
  expectClean(problems);
});
