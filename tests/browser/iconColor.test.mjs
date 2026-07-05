import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

describe('pixel icons', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-icon-color-test',
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

  test('toolbar icons render with multiple pixel colors', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.toolbar .pixel-icon rect');

      const uniqueFills = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('.toolbar .pixel-icon rect'))
          .map((rect) => rect.getAttribute('fill'))
          .filter(Boolean)
          .filter((fill) => fill !== 'currentColor')
          .filter((fill, index, fills) => fills.indexOf(fill) === index)
      ));

      expect(uniqueFills.length).toBeGreaterThanOrEqual(6);
    } finally {
      await context.close();
    }
  }, 15000);
});
