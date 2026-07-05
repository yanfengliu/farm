import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import {
  advanceFarm,
  createFarmGame,
  getFarmSnapshot,
  submitFarmCommand,
} from '../../src/game/simulation/farmGame';

let server;
let browser;
let url;

describe('tutorial tips', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-tutorial-dismiss-test',
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

  test('dismiss button hides the currently visible tip', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'dismiss-tip' }));
    savedState.inventory.seeds = { carrot: 0, wheat: 0, tomato: 0 };
    savedState.coins = savedState.crops.carrot.seedPrice * 2;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(globalThis.__farmDebug?.getState));
      await page.waitForSelector('.tutorial-tip');
      await page.click('.tutorial-close');
      await page.waitForTimeout(250);

      expect(await page.locator('.tutorial-tip').count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 15000);

  test('seed shortage tip points at visible Inventory seed buys when already in Inventory', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'inventory-seed-tip' }));
    savedState.inventory.seeds = { carrot: 0, wheat: 0, tomato: 0 };
    savedState.coins = savedState.crops.carrot.seedPrice * 2;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="buy-needed-seeds"]');

      const target = await page.locator('[data-buy-seeds="carrot"]:not([disabled])').first().boundingBox();
      const tipText = await page.locator('.tutorial-tip').innerText();

      expect(target).not.toBeNull();
      expect(tipText).toContain('Buy Seeds');
    } finally {
      await context.close();
    }
  }, 15000);

  test('seed shortage tip does not cover visible seed-buy buttons', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'inventory-seed-tip-clear-targets' }));
    savedState.inventory.seeds = { carrot: 0, wheat: 0, tomato: 0 };
    savedState.coins = savedState.crops.tomato.seedPrice * 5;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="buy-needed-seeds"]');

      const overlaps = await page.evaluate(() => {
        const tip = globalThis.document.querySelector('.tutorial-tip')?.getBoundingClientRect();
        if (!tip) return [];
        return Array.from(globalThis.document.querySelectorAll('[data-buy-seeds]'))
          .map((button) => {
            const rect = button.getBoundingClientRect();
            const overlapsTip = rect.left < tip.right
              && rect.right > tip.left
              && rect.top < tip.bottom
              && rect.bottom > tip.top;
            return {
              label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? 'seed button',
              overlapsTip,
            };
          })
          .filter((item) => item.overlapsTip)
          .map((item) => item.label);
      });

      expect(overlaps).toEqual([]);
    } finally {
      await context.close();
    }
  }, 15000);

  test('side-panel tab tutorial tip stays clear of panel controls', async () => {
    const game = createFarmGame({ seed: 'open-goals-tip-clear-panel' });
    for (let i = 0; i < 5000; i += 1) {
      if (getFarmSnapshot(game).stats.lifetimeHarvested.carrot >= 10) break;
      advanceFarm(game, 1);
    }
    const savedState = getFarmSnapshot(game);

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="open-goals-for-claim"]');

      const placement = await page.evaluate(() => {
        const tip = globalThis.document.querySelector('.tutorial-tip')?.getBoundingClientRect();
        const playArea = globalThis.document.querySelector('#play-area')?.getBoundingClientRect();
        if (!tip) return { overlaps: ['missing tip'], tipTop: -1, playTop: playArea?.top ?? -1 };
        const overlaps = Array.from(globalThis.document.querySelectorAll('#panel-content button'))
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            return rect.left < tip.right
              && rect.right > tip.left
              && rect.top < tip.bottom
              && rect.bottom > tip.top;
          })
          .map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? 'panel button');
        return { overlaps, tipTop: tip.top, playTop: playArea?.top ?? 0 };
      });

      expect(placement.overlaps).toEqual([]);
      expect(placement.tipTop).toBeGreaterThanOrEqual(placement.playTop + 8);
    } finally {
      await context.close();
    }
  }, 20000);

  test('crop mix tutorial tip stays inside the viewport', async () => {
    const game = createFarmGame({ seed: 'mix-tip-bounds' });
    for (let i = 0; i < 5000; i += 1) {
      if (getFarmSnapshot(game).stats.lifetimeHarvested.carrot >= 10) break;
      advanceFarm(game, 1);
    }
    submitFarmCommand(game, { type: 'claimNextTier' });
    advanceFarm(game, 1);
    const savedState = getFarmSnapshot(game);
    savedState.inventory.crops = { carrot: 0, wheat: 0, tomato: 0 };

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="open-mix-panel"]');

      const bounds = await page.evaluate(() => {
        const tip = globalThis.document.querySelector('.tutorial-tip');
        const rect = tip?.getBoundingClientRect();
        return {
          left: rect?.left ?? -1,
          right: rect?.right ?? -1,
          top: rect?.top ?? -1,
          bottom: rect?.bottom ?? -1,
          width: globalThis.innerWidth,
          height: globalThis.innerHeight,
        };
      });

      expect(bounds.left).toBeGreaterThanOrEqual(8);
      expect(bounds.top).toBeGreaterThanOrEqual(8);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width - 8);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height - 8);
    } finally {
      await context.close();
    }
  }, 20000);

  test('canvas tutorial tip stays above the toolbar instead of offscreen', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'canvas-tip-bounds' }));
    savedState.inventory.seeds = { carrot: 5, wheat: 0, tomato: 0 };
    for (const tile of Object.values(savedState.tiles)) {
      if (tile.kind === 'plot') {
        tile.plot = { cropId: 'carrot', growth: 1, water: 100 };
      }
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-tool="plot"]');
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="paint-empty-land"]');

      const bounds = await page.evaluate(() => {
        const tip = globalThis.document.querySelector('.tutorial-tip');
        const toolbar = globalThis.document.querySelector('.toolbar');
        const rect = tip?.getBoundingClientRect();
        const toolbarRect = toolbar?.getBoundingClientRect();
        return {
          left: rect?.left ?? -1,
          right: rect?.right ?? -1,
          top: rect?.top ?? -1,
          bottom: rect?.bottom ?? -1,
          width: globalThis.innerWidth,
          height: globalThis.innerHeight,
          toolbarTop: toolbarRect?.top ?? globalThis.innerHeight,
        };
      });

      expect(bounds.left).toBeGreaterThanOrEqual(8);
      expect(bounds.top).toBeGreaterThanOrEqual(8);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width - 8);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.toolbarTop - 8);
    } finally {
      await context.close();
    }
  }, 15000);
});
