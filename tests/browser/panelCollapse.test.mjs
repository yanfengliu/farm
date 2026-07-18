import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

// Player report: the side panel cannot be re-opened once collapsed. The toggle
// technically worked, but it was a single unlabeled arrow that teleported to
// the far corner while every tab vanished - functionally unfindable. Collapsed
// mode now keeps the tab icons visible in the strip, any tab click reopens the
// panel on that tab, and actions that need a panel un-collapse it themselves.

let server;
let browser;
let url;

describe('collapsed side panel stays reopenable', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-panel-collapse-test',
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

  const boot = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
    return { context, page };
  };

  const isCollapsed = (page) => page.evaluate(() => (
    globalThis.document.querySelector('.play-area').classList.contains('panel-collapsed')
  ));

  test('tab icons stay visible while collapsed and clicking one reopens that panel', async () => {
    const { context, page } = await boot();
    try {
      await page.click('.panel-toggle');
      await page.waitForFunction(() => (
        globalThis.document.querySelector('.play-area').classList.contains('panel-collapsed')
      ));

      // Every tab must remain a real, clickable target in the collapsed strip.
      const tabs = await page.evaluate(() => (
        [...globalThis.document.querySelectorAll('.panel-tabs [data-panel]')].map((tab) => {
          const rect = tab.getBoundingClientRect();
          const hit = rect.width > 0
            ? globalThis.document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            : null;
          return { panel: tab.dataset.panel, visible: rect.width > 8 && rect.height > 8, hittable: Boolean(hit && tab.contains(hit)) };
        })
      ));
      for (const tab of tabs) {
        expect(tab.visible, `${tab.panel} tab hidden while collapsed`).toBe(true);
        expect(tab.hittable, `${tab.panel} tab not clickable while collapsed`).toBe(true);
      }

      await page.click('.panel-tabs [data-panel="goals"]');
      await page.waitForFunction(() => (
        !globalThis.document.querySelector('.play-area').classList.contains('panel-collapsed')
      ), undefined, { timeout: 3000 });
      const heading = await page.evaluate(() => globalThis.document.querySelector('#panel-content h2')?.textContent);
      expect(heading).toContain('Tier');
    } finally {
      await context.close();
    }
  }, 40000);

  test('inspecting the farm while collapsed reopens the panel with the result', async () => {
    const { context, page } = await boot();
    try {
      await page.click('.panel-toggle');
      await page.waitForFunction(() => (
        globalThis.document.querySelector('.play-area').classList.contains('panel-collapsed')
      ));

      const canvasBox = await page.locator('#game-canvas canvas').boundingBox();
      await page.click('[data-tool="inspect"]').catch(() => {});
      await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      await page.waitForFunction(() => (
        !globalThis.document.querySelector('.play-area').classList.contains('panel-collapsed')
      ), undefined, { timeout: 3000 });
      const text = await page.evaluate(() => globalThis.document.querySelector('#panel-content').textContent);
      expect(text).toMatch(/Tile \d+, \d+|Fern|Alder|Poppy|Rowan/);
    } finally {
      await context.close();
    }
  }, 40000);

  test('the toggle itself still collapses and expands', async () => {
    const { context, page } = await boot();
    try {
      await page.click('.panel-toggle');
      await page.waitForFunction(() => globalThis.document.querySelector('.play-area').classList.contains('panel-collapsed'));
      await page.click('.panel-toggle');
      await page.waitForFunction(() => !globalThis.document.querySelector('.play-area').classList.contains('panel-collapsed'));
      expect(await isCollapsed(page)).toBe(false);
    } finally {
      await context.close();
    }
  }, 40000);
});
