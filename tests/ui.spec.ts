import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectClean, saveResult } from './helpers';

// (g) Shell: settings round-trip through the real settings screen and
// localStorage (including a corrupt entry), the audio graph and music decode
// after the first gesture, M mute, pause on pointer-lock loss, resume, and
// photo mode PNG export.

async function openShell(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game?.ready === true, null, { timeout: 120_000 });
  return problems;
}

const gameState = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__game;
    const game = g.game;
    return {
      quality: game.qualityIndex,
      renderScale: game.renderScale,
      dynamicResolution: game.post.settings.dynamicResolution,
      fovOffset: game.rig.fovOffset,
      sensitivity: game.rig.sensitivity,
      invertY: game.rig.invertY,
      dayLength: game.dayNight.dayLengthMinutes,
      settings: { ...g.app.ui.settings },
      stored: localStorage.getItem('skythread.settings.v1'),
    };
  });

test('g. settings persist, audio decodes, pause/resume and photo export work', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  let problems = await openShell(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  problems = await openShell(page);

  // --- Settings screen -> game + localStorage --------------------------------
  await page.getByRole('button', { name: 'Ayarlar' }).first().click();
  await expect(page.locator('#sk-st-fovOffset')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('radio', { name: 'Yüksek' }).click();
  await page.locator('#sk-st-renderScale').fill('80');
  await page.locator('#sk-st-dynamicResolution').click();
  await page.locator('#sk-st-fovOffset').fill('8');
  await page.locator('#sk-st-sensitivity').fill('1.5');
  await page.locator('#sk-st-invertY').click();
  await page.locator('#sk-st-dayLengthMinutes').fill('20');
  await page.locator('#sk-st-showFps').click();
  await page.locator('#sk-st-masterVolume').fill('50');
  const applied = await gameState(page);
  const want = { quality: 2, renderScale: 0.8, dynamicResolution: false, fovOffset: 8, sensitivity: 1.5, invertY: true, dayLength: 20 };
  expect({ ...applied, settings: undefined, stored: undefined }).toEqual({ ...want, settings: undefined, stored: undefined });
  const stored = JSON.parse(applied.stored ?? '{}');
  expect(stored).toMatchObject({ quality: 2, renderScale: 0.8, dynamicResolution: false, fovOffset: 8, sensitivity: 1.5, invertY: true, dayLengthMinutes: 20, showFps: true, masterVolume: 0.5 });

  // --- Reload: everything comes back from storage ----------------------------
  await page.reload();
  problems = await openShell(page);
  const reloaded = await gameState(page);
  expect({ ...reloaded, settings: undefined, stored: undefined }).toEqual({ ...want, settings: undefined, stored: undefined });
  expect(reloaded.settings).toMatchObject({ showFps: true, masterVolume: 0.5 });

  // --- Defaults button -------------------------------------------------------
  await page.getByRole('button', { name: 'Ayarlar' }).first().click();
  await page.getByRole('button', { name: 'Varsayılanlara dön' }).click();
  const reset = await gameState(page);
  expect(reset.quality).toBe(1);
  expect(reset.settings).toMatchObject({ quality: 1, renderScale: 1, dynamicResolution: true, fovOffset: 0, sensitivity: 1, invertY: false, showFps: false });
  await page.keyboard.press('Escape');

  // --- Corrupt storage is clamped, never fatal --------------------------------
  await page.evaluate(() => localStorage.setItem('skythread.settings.v1', '{"quality":9,"fovOffset":"abc","sensitivity":1e9,"invertY":"yes"'));
  await page.reload();
  problems = await openShell(page);
  const corrupt = await gameState(page);
  expect(corrupt.settings).toMatchObject({ fovOffset: 0, invertY: false });
  await page.evaluate(() => localStorage.setItem('skythread.settings.v1', '{"quality":9,"fovOffset":"abc","sensitivity":1e9,"invertY":"yes"}'));
  await page.reload();
  problems = await openShell(page);
  const clamped = await gameState(page);
  expect(clamped.settings).toMatchObject({ quality: 3, fovOffset: 0, sensitivity: 3, invertY: false });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  problems = await openShell(page);

  // --- Play: first gesture unlocks audio, music decodes ------------------------
  await page.getByRole('button', { name: 'Oyna' }).click();
  await page.waitForFunction(() => (window as any).__game.game.playing === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__game.app.audio.getDebugInfo().musicLoaded === true, null, { timeout: 120_000 });
  const audio = await page.evaluate(() => (window as any).__game.app.audio.getDebugInfo());
  expect(audio.unlocked).toBe(true);
  expect(audio.state).toBe('running');
  expect(audio.musicError).toBeNull();
  expect(audio.musicDuration).toBeGreaterThan(30);
  expect(audio.loopsScheduled).toBeGreaterThan(0);
  // The music actually reaches the master bus: tap it with an analyser.
  const musicRms = await page.evaluate(async () => {
    const a = (window as any).__game.app.audio;
    const g = a.graph;
    const an = g.ctx.createAnalyser();
    an.fftSize = 2048;
    g.master.connect(an);
    let best = 0;
    const buf = new Float32Array(an.fftSize);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      best = Math.max(best, Math.sqrt(sum / buf.length));
    }
    g.master.disconnect(an);
    return best;
  });
  expect(musicRms).toBeGreaterThan(0.005);
  await page.keyboard.press('m');
  expect(await page.evaluate(() => (window as any).__game.app.audio.musicMuted)).toBe(true);
  await page.keyboard.press('m');
  expect(await page.evaluate(() => (window as any).__game.app.audio.musicMuted)).toBe(false);
  const voices = await page.evaluate(() => {
    const a = (window as any).__game.app.audio;
    a.webShot(0.5);
    a.attach(0.8);
    a.footstep(0, 0.6);
    return a.getDebugInfo().activeVoices;
  });
  expect(voices).toBeGreaterThan(0);

  // --- Losing pointer lock pauses; resume locks again --------------------------
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => (window as any).__game.app.state === 'paused', null, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as any).__game.game.playing)).toBe(false);
  await page.getByRole('button', { name: 'Devam Et' }).click();
  await page.waitForFunction(() => (window as any).__game.game.playing === true, null, { timeout: 60_000 });

  // --- Photo mode: P freezes play, PNG export, P returns ------------------------
  await page.keyboard.press('p');
  await page.waitForFunction(() => (window as any).__game.app.state === 'photo', null, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as any).__game.game.playing)).toBe(false);
  await page.evaluate(() => document.exitPointerLock());
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('button', { name: 'PNG Kaydet' }).click(),
  ]);
  const name = download.suggestedFilename();
  const path = await download.path();
  const bytes = readFileSync(path);
  expect(name).toMatch(/^skythread-\d{8}-\d{6}\.png$/);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.length).toBeGreaterThan(20_000);
  await page.keyboard.press('p');
  await page.waitForFunction(() => (window as any).__game.app.state === 'playing', null, { timeout: 60_000 });

  const result = { applied: want, reloadedOk: true, audio, musicRms, voices, photo: { name, bytes: bytes.length } };
  saveResult('g-ui', result);
  console.log('g. ui', JSON.stringify(result));
  expectClean(problems);
});
