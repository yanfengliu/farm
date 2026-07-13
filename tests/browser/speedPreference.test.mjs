import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

describe('speed preference', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-speed-preference-test',
      configFile: false,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5175/';
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  test('selected speed restores after a normal reload', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      const cleanBootKey = 'farm-speed-preference-test-cleared';
      if (globalThis.sessionStorage.getItem(cleanBootKey)) return;
      globalThis.localStorage.clear();
      globalThis.sessionStorage.setItem(cleanBootKey, 'true');
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-speed="4"]');
      await page.click('[data-speed="4"]');
      await page.waitForFunction(() => (
        Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
          item.querySelector('strong')?.textContent?.trim() === 'Speed'
        ))?.querySelector('span')?.textContent?.trim() === '4x'
      ));

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-speed="4"]');

      const speedState = await page.evaluate(() => ({
        hudText: Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
          item.querySelector('strong')?.textContent?.trim() === 'Speed'
        ))?.querySelector('span')?.textContent?.trim(),
        activeSpeed: globalThis.document.querySelector('[data-speed="4"]')?.classList.contains('active') ?? false,
        savedFarmIncludesSpeed: globalThis.localStorage.getItem('farm.autosave.v1')?.includes('"speed"') ?? false,
      }));

      expect(speedState.hudText).toBe('4x');
      expect(speedState.activeSpeed).toBe(true);
      expect(speedState.savedFarmIncludesSpeed).toBe(false);
    } finally {
      await context.close();
    }
  }, 15000);

  test('Space activates a focused button without also pausing the farm', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('[data-panel="goals"]').focus();
      await page.keyboard.press('Space');
      await page.waitForSelector('#panel-content h2');

      const speedText = await page.evaluate(() => Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
        item.querySelector('strong')?.textContent?.trim() === 'Speed'
      ))?.querySelector('span')?.textContent?.trim());
      expect(speedText).not.toBe('Paused');
      expect(await page.locator('#panel-content h2').textContent()).toMatch(/Tier/);
    } finally {
      await context.close();
    }
  }, 15000);
});
