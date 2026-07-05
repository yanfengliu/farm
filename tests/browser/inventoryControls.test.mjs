import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

let server;
let browser;
let url;

describe('inventory controls', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-inventory-controls-test',
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

  test('empty crop inventory disables sell actions so player-like agents ignore them', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      globalThis.localStorage.clear();
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-command="sell-all"]');

      const disabledStates = await page.evaluate(() => ({
        sellButtons: Array.from(globalThis.document.querySelectorAll('button[data-sell]'))
          .map((button) => button.disabled),
        sellAll: globalThis.document.querySelector('button[data-command="sell-all"]')?.disabled ?? false,
      }));

      expect(disabledStates.sellButtons).toHaveLength(6);
      expect(disabledStates.sellButtons.every(Boolean)).toBe(true);
      expect(disabledStates.sellAll).toBe(true);
    } finally {
      await context.close();
    }
  }, 15000);

  test('unaffordable seed and upgrade purchases are disabled', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'unaffordable-actions' }));
    savedState.coins = 0;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-buy-seeds="carrot"]');

      const seedDisabled = await page.locator('button[data-buy-seeds="carrot"]').first().evaluate((button) => button.disabled);
      expect(seedDisabled).toBe(true);

      await page.click('[data-panel="goals"]');
      await page.waitForSelector('[data-buy-upgrade="boots"]');

      const upgradeStates = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('button[data-buy-upgrade]'))
          .map((button) => button.disabled)
      ));

      expect(upgradeStates).toHaveLength(2);
      expect(upgradeStates.every(Boolean)).toBe(true);
    } finally {
      await context.close();
    }
  }, 15000);
});
