import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

describe('side panel resizing', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-panel-resize-test',
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

  test('fresh profiles start at the documented 340 pixel panel width', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-panel-resizer]');
      const metrics = await page.evaluate(() => ({
        panelWidth: globalThis.document.querySelector('.side-panel')?.getBoundingClientRect().width ?? 0,
        ariaValue: Number(globalThis.document.querySelector('[data-panel-resizer]')?.getAttribute('aria-valuenow') ?? 0),
      }));
      expect(metrics).toEqual({ panelWidth: 340, ariaValue: 340 });
    } finally {
      await context.close();
    }
  }, 30000);

  test('dragging the panel edge widens the panel and persists the preference', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => globalThis.localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      expect(await page.locator('[data-panel-resizer]').count()).toBe(1);

      const initialWidth = await page.locator('.side-panel').evaluate((panel) => panel.getBoundingClientRect().width);
      const handleBox = await page.locator('[data-panel-resizer]').boundingBox();
      expect(handleBox).not.toBeNull();

      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 140, handleBox.y + handleBox.height / 2, { steps: 8 });
      await page.mouse.up();

      const resizedMetrics = await page.evaluate(() => {
        const panel = globalThis.document.querySelector('.side-panel');
        const handle = globalThis.document.querySelector('[data-panel-resizer]');
        return {
          panelWidth: panel?.getBoundingClientRect().width ?? 0,
          handleNow: Number(handle?.getAttribute('aria-valuenow') ?? 0),
          horizontalOverflow: Math.max(0, globalThis.document.documentElement.scrollWidth - globalThis.innerWidth),
        };
      });

      expect(resizedMetrics.panelWidth).toBeGreaterThanOrEqual(initialWidth + 100);
      expect(resizedMetrics.handleNow).toBeGreaterThanOrEqual(initialWidth + 100);
      expect(resizedMetrics.horizontalOverflow).toBe(0);

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-panel-resizer]');
      const persistedWidth = await page.locator('.side-panel').evaluate((panel) => panel.getBoundingClientRect().width);
      expect(persistedWidth).toBeGreaterThanOrEqual(initialWidth + 100);
    } finally {
      await context.close();
    }
  }, 30000);
});
