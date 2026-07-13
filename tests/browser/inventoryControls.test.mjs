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
    url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5175/';
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

      expect(disabledStates.sellButtons).toHaveLength(8);
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

  test('seed-buy controls disclose the exact quantity and total cost for the click', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-buy-seeds="carrot"]');

      const button = page.locator('[data-buy-seeds="carrot"]').first();
      const label = await button.getAttribute('aria-label');
      const text = await button.textContent();
      expect(label).toMatch(/Buy 5 Carrot seeds for 5 coins/i);
      expect(text).toMatch(/\+5/);
      expect(text).toMatch(/5c/i);

      const before = await page.evaluate(() => globalThis.__farmDebug.getState());
      await button.click();
      await page.waitForFunction((coins) => globalThis.__farmDebug.getState().coins < coins, before.coins);
      const after = await page.evaluate(() => globalThis.__farmDebug.getState());

      expect(after.inventory.seeds.carrot - before.inventory.seeds.carrot).toBe(5);
      expect(before.coins - after.coins).toBe(5);
    } finally {
      await context.close();
    }
  }, 15000);

  test('locked seed purchases explain their disabled state', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      globalThis.localStorage.clear();
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-buy-seeds="wheat"]');

      const seedRows = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('[data-buy-seeds]'))
          .map((button) => ({
            cropId: button.getAttribute('data-buy-seeds'),
            disabled: button.disabled,
            ariaLabel: button.getAttribute('aria-label') ?? '',
            title: button.getAttribute('title') ?? '',
            text: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            rowRight: button.closest('.row')?.getBoundingClientRect().right ?? 0,
            panelRight: button.closest('.side-panel')?.getBoundingClientRect().right ?? 0,
          }))
      ));

      const carrot = seedRows.find((row) => row.cropId === 'carrot');
      const wheat = seedRows.find((row) => row.cropId === 'wheat');
      const tomato = seedRows.find((row) => row.cropId === 'tomato');

      expect(carrot?.text).toContain('+5 · 5c');
      expect(wheat?.disabled).toBe(true);
      expect(wheat?.ariaLabel).toBe('Wheat seeds locked');
      expect(wheat?.title).toContain('Unlock Wheat');
      expect(wheat?.text).toContain('Locked');
      expect(tomato?.disabled).toBe(true);
      expect(tomato?.ariaLabel).toBe('Tomato seeds locked');
      expect(tomato?.text).toContain('Locked');
      expect(Math.max(...seedRows.map((row) => row.rowRight))).toBeLessThanOrEqual(
        Math.min(...seedRows.map((row) => row.panelRight)) - 8,
      );
    } finally {
      await context.close();
    }
  }, 15000);

  test('inventory crop rows stay in sync with HUD storage on the next frame', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      globalThis.localStorage.clear();
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="goals"]');
      await expect.poll(async () => page.locator('#panel-content h2').first().textContent()).toContain('Tier');
      await page.click('[data-panel="inventory"]');
      await expect.poll(async () => page.locator('#panel-content h2').first().textContent()).toContain('Inventory');

      await page.evaluate(() => {
        globalThis.window.advanceTime(60000);
      });
      await page.evaluate(() => new Promise((resolve) => {
        globalThis.requestAnimationFrame(() => resolve(undefined));
      }));

      const inventorySync = await page.evaluate(() => {
        const hudStorageText = Array.from(globalThis.document.querySelectorAll('.hud > div'))
          .find((item) => item.querySelector('strong')?.textContent?.trim() === 'Storage')
          ?.querySelector('span')
          ?.textContent
          ?.trim() ?? '0/0';
        const visibleCropTotal = Array.from(globalThis.document.querySelectorAll('.panel-content .row-label'))
          .map((label) => label.textContent ?? '')
          .filter((text) => /Carrot:|Wheat:|Tomato:/i.test(text))
          .reduce((sum, text) => {
            const amount = Number(text.match(/:\s*(\d+)/)?.[1] ?? 0);
            return sum + amount;
          }, 0);
        return {
          hudStored: Number(hudStorageText.split('/')[0] ?? 0),
          visibleCropTotal,
        };
      });

      expect(inventorySync.hudStored).toBeGreaterThan(0);
      expect(inventorySync.visibleCropTotal).toBe(inventorySync.hudStored);
    } finally {
      await context.close();
    }
  }, 15000);
});
