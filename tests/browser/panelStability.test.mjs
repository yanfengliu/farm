import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

// The player reported upgrade buttons and the Goals panel flickering on hover:
// every live-data change rewrote the whole panel DOM, replacing the very
// element under the cursor. The contract is element identity: live numbers may
// update, but untouched controls must be the same nodes across re-renders.

let server;
let browser;
let url;

describe('panel stability under live data', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-panel-stability-test',
      configFile: false,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5176/';
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  test('the hovered upgrade button survives Goals re-renders while progress text updates', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.advanceTime === 'function');
      await page.click('[data-panel="goals"]');
      await page.waitForSelector('[data-buy-upgrade]');

      const before = await page.evaluate(() => {
        const button = globalThis.document.querySelector('[data-buy-upgrade]');
        button.__hoverStability = 'marked';
        const heading = globalThis.document.querySelector('#panel-content h2');
        heading.__hoverStability = 'marked';
        return { panelText: globalThis.document.querySelector('#panel-content').textContent };
      });
      await page.hover('[data-buy-upgrade]');

      // A minute of farm time: harvests land, coins change, the Goals
      // signature churns and forces re-renders.
      await page.evaluate(() => globalThis.advanceTime(60000));
      await page.waitForFunction((old) => (
        globalThis.document.querySelector('#panel-content').textContent !== old
      ), before.panelText, { timeout: 5000 });

      const after = await page.evaluate(() => ({
        buttonStable: globalThis.document.querySelector('[data-buy-upgrade]').__hoverStability === 'marked',
        headingStable: globalThis.document.querySelector('#panel-content h2').__hoverStability === 'marked',
      }));
      expect(after.buttonStable).toBe(true);
      expect(after.headingStable).toBe(true);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 40000);

  test('inventory sell and buy controls also keep identity across live updates', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.advanceTime === 'function');
      await page.waitForSelector('[data-buy-seeds="carrot"]');
      const inventoryText = await page.evaluate(() => {
        globalThis.document.querySelector('[data-buy-seeds="carrot"]').__hoverStability = 'marked';
        return globalThis.document.querySelector('#panel-content').textContent;
      });
      await page.evaluate(() => globalThis.advanceTime(60000));
      await page.waitForFunction((old) => (
        globalThis.document.querySelector('#panel-content').textContent !== old
      ), inventoryText, { timeout: 5000 });
      expect(await page.evaluate(() => (
        globalThis.document.querySelector('[data-buy-seeds="carrot"]').__hoverStability
      ))).toBe('marked');
    } finally {
      await context.close();
    }
  }, 40000);
});
