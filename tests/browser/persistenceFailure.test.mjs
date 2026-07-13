import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

describe('browser autosave failure', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-persistence-failure-test',
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

  test('keeps simulating and tells the player when localStorage rejects autosave', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      const originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'farm.autosave.v1') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        return originalSetItem.call(this, key, value);
      };
      Storage.prototype.removeItem = function removeItem(key) {
        if (key === 'farm.autosave.v1') throw new DOMException('Storage access denied', 'SecurityError');
        return originalRemoveItem.call(this, key);
      };
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('#hud');
      const startTick = await page.evaluate(() => globalThis.__farmDebug.getState().tick);
      await page.waitForFunction(() => globalThis.document.querySelector('#hud')?.textContent?.includes('Autosave unavailable'));
      await page.waitForTimeout(1200);
      const endTick = await page.evaluate(() => globalThis.__farmDebug.getState().tick);

      expect(pageErrors).toEqual([]);
      expect(endTick).toBeGreaterThan(startTick);
      expect(await page.locator('#hud').textContent()).toContain('Autosave unavailable');

      await page.keyboard.press('Shift+R');
      await page.waitForTimeout(100);
      const resetTick = await page.evaluate(() => globalThis.__farmDebug.getState().tick);
      expect(resetTick).toBeLessThan(endTick);
      expect(pageErrors).toEqual([]);
      expect(await page.locator('#hud').textContent()).toContain('Stored save could not be cleared');
    } finally {
      await context.close();
    }
  }, 15000);
});
