import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

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
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="open-goals-for-seeds"]');
      await page.click('.tutorial-close');
      await page.waitForTimeout(250);

      expect(await page.locator('.tutorial-tip').count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 15000);
});
