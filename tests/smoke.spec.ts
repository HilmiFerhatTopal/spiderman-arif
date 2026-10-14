import { test, expect } from '@playwright/test';

// @quick M1 gate: the page loads, the test API appears, ticks advance and the
// console stays clean.
test('@quick loads, steps ticks, clean console', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game?.ready === true, null, { timeout: 120_000 });
  const res = await page.evaluate(() => {
    const g = (window as any).__game;
    g.setManual(true);
    const before = g.state();
    g.setInput({ moveY: 1, sprint: true });
    const after = g.step(240);
    g.setInput({ moveY: 0, sprint: false });
    const frame = g.renderFrame();
    return { before, after, frame };
  });
  expect(res.after.pos.every((v: number) => Number.isFinite(v))).toBe(true);
  expect(res.frame.calls).toBeGreaterThan(0);
  console.log('smoke', JSON.stringify({ mode: res.after.mode, speed: res.after.speed, frame: res.frame }));
  expect(problems, problems.join('\n')).toEqual([]);
});
