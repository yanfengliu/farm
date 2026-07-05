import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

function alphaFromCssColor(color) {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return 1;
  const parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
  return parts.length >= 4 ? parts[3] : 1;
}

describe('visual polish', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-visual-polish-test',
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

  test('canvas backdrop uses warm charcoal instead of flat black', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('#game-canvas canvas');

      const backdropPixel = await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('#game-canvas canvas');
        const context2d = canvas?.getContext('2d');
        const pixel = context2d?.getImageData(8, 8, 1, 1).data;
        return pixel ? { r: pixel[0], g: pixel[1], b: pixel[2] } : null;
      });

      expect(backdropPixel).not.toBeNull();
      expect(backdropPixel.r).toBeGreaterThanOrEqual(22);
      expect(backdropPixel.r).toBeGreaterThan(backdropPixel.b);
    } finally {
      await context.close();
    }
  }, 15000);

  test('hud stats are grouped into readable chips', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.hud > div');

      const chipStyle = await page.locator('.hud > div').first().evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: Number.parseFloat(style.borderRadius),
          paddingLeft: Number.parseFloat(style.paddingLeft),
        };
      });

      expect(alphaFromCssColor(chipStyle.backgroundColor)).toBeGreaterThan(0.04);
      expect(chipStyle.borderRadius).toBeGreaterThanOrEqual(4);
      expect(chipStyle.paddingLeft).toBeGreaterThanOrEqual(6);
    } finally {
      await context.close();
    }
  }, 15000);

  test('inventory rows have visible item surfaces without overflowing', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.panel-content .row');

      const metrics = await page.locator('.panel-content .row').first().evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: Number.parseFloat(style.borderRadius),
          right: rect.right,
          panelRight: element.closest('.side-panel')?.getBoundingClientRect().right ?? 0,
        };
      });

      expect(alphaFromCssColor(metrics.backgroundColor)).toBeGreaterThan(0.04);
      expect(metrics.borderRadius).toBeGreaterThanOrEqual(4);
      expect(metrics.right).toBeLessThanOrEqual(metrics.panelRight - 8);
    } finally {
      await context.close();
    }
  }, 15000);

  test('side panel tabs stay icon-led at default width', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.panel-tabs button[data-panel]');

      const tabMetrics = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('.panel-tabs button[data-panel]'))
          .map((button) => {
            const text = button.querySelector('.button-text');
            return {
              label: button.getAttribute('aria-label') ?? '',
              textWidth: text?.getBoundingClientRect().width ?? 0,
              iconWidth: button.querySelector('.button-icon')?.getBoundingClientRect().width ?? 0,
            };
          })
      ));

      expect(tabMetrics.every((tab) => tab.label.length > 0)).toBe(true);
      expect(Math.max(...tabMetrics.map((tab) => tab.iconWidth))).toBeGreaterThanOrEqual(18);
      expect(Math.max(...tabMetrics.map((tab) => tab.textWidth))).toBeLessThanOrEqual(1);
    } finally {
      await context.close();
    }
  }, 15000);

  test('icon-only panel tabs remain clickable through their pixel glyphs', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-panel="goals"] .pixel-icon rect');

      await page.locator('[data-panel="goals"] .pixel-icon rect').first().click();

      await expect.poll(async () => (
        page.locator('#panel-content h2').first().textContent()
      )).toContain('Tier');
    } finally {
      await context.close();
    }
  }, 15000);

  test('compact desktop toolbar avoids truncated labels', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.toolbar .tool-button');

      const metrics = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('.toolbar .tool-button'))
          .map((button) => {
            const label = button.querySelector('.label');
            return {
              ariaLabel: button.getAttribute('aria-label') ?? '',
              visibleLabelWidth: label?.getBoundingClientRect().width ?? 0,
              buttonRight: button.getBoundingClientRect().right,
            };
          })
      ));

      expect(metrics.every((item) => item.ariaLabel.length > 0)).toBe(true);
      expect(Math.max(...metrics.map((item) => item.visibleLabelWidth))).toBeLessThanOrEqual(1);
      expect(Math.max(...metrics.map((item) => item.buttonRight))).toBeLessThanOrEqual(1024);
    } finally {
      await context.close();
    }
  }, 15000);
});
