import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

describe('desktop UI scale', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-ui-scale-test',
      configFile: false,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  test('toolbar buttons and icons are readable at desktop size', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.toolbar .tool-button');

      const metrics = await page.evaluate(() => {
        const buttons = Array.from(globalThis.document.querySelectorAll('.toolbar .tool-button'));
        const icons = Array.from(globalThis.document.querySelectorAll('.toolbar .button-icon'));
        return {
          minButtonHeight: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
          maxButtonWidth: Math.max(...buttons.map((button) => button.getBoundingClientRect().width)),
          minIconWidth: Math.min(...icons.map((icon) => icon.getBoundingClientRect().width)),
          maxToolbarHeight: globalThis.document.querySelector('.toolbar')?.getBoundingClientRect().height ?? 0,
          horizontalOverflow: Math.max(0, globalThis.document.documentElement.scrollWidth - globalThis.innerWidth),
        };
      });

      expect(metrics.minButtonHeight).toBeGreaterThanOrEqual(38);
      expect(metrics.maxButtonWidth).toBeLessThanOrEqual(86);
      expect(metrics.minIconWidth).toBeGreaterThanOrEqual(18);
      expect(metrics.maxToolbarHeight).toBeLessThanOrEqual(64);
      expect(metrics.horizontalOverflow).toBe(0);
    } finally {
      await context.close();
    }
  }, 15000);
});
