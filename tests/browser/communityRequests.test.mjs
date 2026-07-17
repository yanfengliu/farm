import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { villageRequestOffers } from '../../src/game/content/communityRequests';
import { FARM_TIERS } from '../../src/game/content/tiers';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

let server;
let browser;
let url;

describe('village request board', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-community-requests-test',
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

  test('shows deterministic offers and completes a stocked basket from the panel', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'request-panel' }));
    const tier = FARM_TIERS[2];
    savedState.tier = { level: 2, label: tier.label, unlockedCrops: [...tier.unlockedCrops], nextMilestone: tier.nextMilestone };
    const [request] = villageRequestOffers(2, savedState.community.rotationIndex);
    for (const [cropId, amount] of Object.entries(request.needs)) {
      savedState.inventory.crops[cropId] = amount;
    }
    const coinsBefore = savedState.coins;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="requests"]');
      await page.waitForSelector('[data-village-request]');

      expect(await page.locator('[data-village-request]').count()).toBe(2);
      const firstCard = page.locator(`[data-village-request="${request.id}"]`);
      expect(await firstCard.textContent()).toContain(request.neighbor);
      expect(await firstCard.textContent()).toContain(`${request.rewardCoins}c`);
      await firstCard.locator('[data-accept-request]').click();
      await page.waitForFunction((requestId) => globalThis.__farmDebug.getState().community.activeRequestId === requestId, request.id);

      expect(await page.locator('[data-active-request]').textContent()).toContain('Basket ready');
      await page.click('[data-command="fulfill-request"]');
      await page.waitForFunction(() => globalThis.__farmDebug.getState().community.completedCount === 1);

      const state = await page.evaluate(() => globalThis.__farmDebug.getState());
      expect(state.community.activeRequestId).toBeNull();
      expect(state.coins).toBe(coinsBefore + request.rewardCoins);
      expect(await page.locator('[data-request-completed-count]').textContent()).toContain('1');
      expect(await page.locator('[data-request-completed-count]').getAttribute('aria-label')).toBe('1 village request completed');
    } finally {
      await context.close();
    }
  }, 20000);

  test('explains that the board unlocks at tier two', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="requests"]');
      expect(await page.locator('[data-request-board-locked]').textContent()).toContain('Tier 2');
    } finally {
      await context.close();
    }
  }, 30000);

  test('Farm Guide introduces the request board after tier two unlocks', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'request-guide' }));
    const tier = FARM_TIERS[2];
    savedState.tier = { level: 2, label: tier.label, unlockedCrops: [...tier.unlockedCrops], nextMilestone: tier.nextMilestone };

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-tutorial-tip="open-request-board"]');
      expect(await page.locator('[data-tutorial-tip="open-request-board"]').textContent()).toContain('Village Requests');

      await page.click('[data-panel="requests"]');
      await page.waitForSelector('[data-tutorial-tip="accept-first-request"]');
      expect(await page.locator('[data-tutorial-tip="accept-first-request"]').textContent()).toContain('Pin one basket');
    } finally {
      await context.close();
    }
  }, 30000);
});
