import { test, expect } from '@playwright/test';
import { expectClean, openGame, saveResult } from './helpers';

// (c) Anchor availability from 500 random street, rooftop and park positions.
test('c. anchor availability >= 95%', async ({ page }) => {
  const problems = await openGame(page);
  const r = await page.evaluate(() => {
    const res = (window as any).__game.anchorAvailability(2024, 500);
    delete res.failures;
    return res;
  });
  saveResult('c-anchors', r);
  console.log('c. anchors', JSON.stringify(r));
  expect(r.total).toBe(500);
  expect(r.inRange).toBeGreaterThan(400);
  expect(r.rate).toBeGreaterThanOrEqual(0.95);
  expectClean(problems);
});
