import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

const SAVE_KEY = 'farm.autosave.v1';
// Valid JSON this build rejects at `isFarmCore` (version !== 1) - what schema drift produces.
const UNREADABLE_SAVE = JSON.stringify({ version: 2, tick: 4242, coins: 999 });

let server;
let browser;
let url;

// Clears storage on a context's first boot only, so a later page.reload() sees the save
// the first boot wrote. An unguarded addInitScript re-clears on every navigation, which
// is exactly why no reload could ever observe a restore before.
function clearOnFirstBootOnly(context, key) {
  return context.addInitScript((cleanBootKey) => {
    if (globalThis.sessionStorage.getItem(cleanBootKey)) return;
    globalThis.localStorage.clear();
    globalThis.sessionStorage.setItem(cleanBootKey, 'true');
  }, key);
}

function seedSave(context, raw) {
  return context.addInitScript(([saveKey, payload]) => {
    globalThis.localStorage.setItem(saveKey, payload);
  }, [SAVE_KEY, raw]);
}

function readSave(page) {
  return page.evaluate((saveKey) => globalThis.localStorage.getItem(saveKey), SAVE_KEY);
}

function readAlert(page) {
  return page.evaluate(() => {
    const element = globalThis.document.querySelector('.hud-alert');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      text: element.textContent.trim(),
      // `.hud-alert` ellipsizes rather than wrapping, so a message can be complete in the
      // DOM and still lose the half naming the way out.
      truncated: element.scrollWidth > element.clientWidth + 1,
      offRight: Math.round(rect.right) > globalThis.innerWidth,
      bodyScrollsX: globalThis.document.body.scrollWidth > globalThis.innerWidth,
    };
  });
}

async function bootFarm(context) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
  return page;
}

describe('farm save survives a real browser reload', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-save-reload-test',
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

  test('a played farm is restored after reload instead of silently starting over', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await clearOnFirstBootOnly(context, 'farm-save-reload-restore-cleared');
    const page = await bootFarm(context);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.waitForFunction(() => typeof globalThis.advanceTime === 'function');
      await page.evaluate(() => globalThis.advanceTime(60000));

      // Identify the farm by several independent facts: a restore that carries the tick
      // across while dropping progress must not read as success.
      const saved = await page.evaluate((saveKey) => {
        const state = JSON.parse(globalThis.localStorage.getItem(saveKey));
        return {
          tick: state.tick,
          tier: state.tier.level,
          ownedTiles: Object.keys(state.tiles).length,
          watered: state.stats.lifetimeWatered,
          planted: state.stats.lifetimePlanted.carrot,
        };
      }, SAVE_KEY);
      expect(saved.tick).toBeGreaterThan(100);
      expect(saved.watered).toBeGreaterThan(0);

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
      const restored = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return {
          tick: state.tick,
          tier: state.tier.level,
          ownedTiles: Object.keys(state.tiles).length,
          watered: state.stats.lifetimeWatered,
          planted: state.stats.lifetimePlanted.carrot,
        };
      });

      // A silent reset restarts at tick 0 with zeroed lifetime stats. Monotonic fields may
      // only move forward as the restored sim keeps running.
      expect(restored.tick).toBeGreaterThanOrEqual(saved.tick);
      expect(restored.watered).toBeGreaterThanOrEqual(saved.watered);
      expect(restored.planted).toBeGreaterThanOrEqual(saved.planted);
      expect(restored.tier).toBe(saved.tier);
      expect(restored.ownedTiles).toBe(saved.ownedTiles);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 30000);

  test('a first-time player with no save starts fresh without a persistence warning', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await clearOnFirstBootOnly(context, 'farm-save-reload-firstrun-cleared');
    const page = await bootFarm(context);

    try {
      const alert = await readAlert(page);
      expect(alert).not.toBeNull();
      expect(alert.text).not.toBe('');
      expect(alert.text).not.toMatch(/unreadable|could not be read/i);
      // A first run must still autosave normally.
      await page.waitForTimeout(1500);
      expect(JSON.parse(await readSave(page)).version).toBe(1);
    } finally {
      await context.close();
    }
  }, 30000);

  test('an unreadable save is never overwritten by autosave', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await clearOnFirstBootOnly(context, 'farm-save-reload-noclobber-cleared');
    await seedSave(context, UNREADABLE_SAVE);
    const page = await bootFarm(context);

    try {
      // Autosave runs on a ~1s timer, so several would have landed by now.
      await page.waitForTimeout(1500);

      expect(await readSave(page)).toBe(UNREADABLE_SAVE);
      const alert = await readAlert(page);
      expect(alert.text).toMatch(/unreadable/i);
    } finally {
      await context.close();
    }
  }, 30000);

  test('Reset drops the unreadable save and lets autosave resume', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await clearOnFirstBootOnly(context, 'farm-save-reload-reset-cleared');
    await seedSave(context, UNREADABLE_SAVE);
    const page = await bootFarm(context);

    try {
      await page.waitForTimeout(1200);
      expect(await readSave(page)).toBe(UNREADABLE_SAVE);

      await page.keyboard.press('Shift+R');
      await page.waitForFunction(([saveKey, blocked]) => {
        const raw = globalThis.localStorage.getItem(saveKey);
        return raw !== null && raw !== blocked;
      }, [SAVE_KEY, UNREADABLE_SAVE]);

      // Proves the guard above was actually holding autosave back rather than autosave
      // never running: the same timer now writes a real save the moment it is allowed.
      const resumed = JSON.parse(await readSave(page));
      expect(resumed.version).toBe(1);
      const alert = await readAlert(page);
      expect(alert.text).not.toMatch(/unreadable/i);
    } finally {
      await context.close();
    }
  }, 30000);

  test.each([
    { width: 1280, height: 800 },
    { width: 1024, height: 720 },
  ])('the unreadable-save notice reads in full at $width x $height', async (viewport) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await clearOnFirstBootOnly(context, `farm-save-reload-fit-${viewport.width}-cleared`);
    await seedSave(context, UNREADABLE_SAVE);
    const page = await bootFarm(context);

    try {
      const alert = await readAlert(page);
      expect(alert.text).toMatch(/unreadable/i);
      expect(alert.text).toMatch(/Reset/);
      expect(alert.truncated).toBe(false);
      expect(alert.offRight).toBe(false);
      expect(alert.bodyScrollsX).toBe(false);
    } finally {
      await context.close();
    }
  }, 30000);
});
