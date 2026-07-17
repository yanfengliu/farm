import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

// Commands queue into the civ-engine world and apply during a step, and a paused
// farm never steps on its own. Without special handling every player command -
// buying seeds, placing buildings, undo - silently defers until unpause and the
// click looks dead. The product decision: a paused farm still applies player
// edits immediately by stepping exactly one tick per command, so edits are
// visible and deterministic while autonomous work stays halted.

let server;
let browser;
let url;

describe('player commands while paused', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-paused-commands-test',
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

  test('a paused farm applies a visible player purchase instead of deferring it', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
      await page.click('[data-command="pause"]');
      await page.waitForFunction(() => (
        Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
          item.querySelector('strong')?.textContent?.trim() === 'Speed'
        ))?.querySelector('span')?.textContent?.trim() === 'Paused'
      ));

      const before = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return { tick: state.tick, coins: state.coins, carrotSeeds: state.inventory.seeds.carrot };
      });

      await page.click('[data-buy-seeds="carrot"]');
      // The purchase must land while STILL paused - no unpause, no waiting for one.
      await page.waitForFunction(([coins, seeds]) => {
        const state = globalThis.__farmDebug.getState();
        return state.coins < coins && state.inventory.seeds.carrot > seeds;
      }, [before.coins, before.carrotSeeds], { timeout: 3000 });

      const after = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return { tick: state.tick, coins: state.coins, carrotSeeds: state.inventory.seeds.carrot };
      });
      // Exactly one tick per paused edit: the edit applies, and the farm does not
      // free-run while paused.
      expect(after.tick).toBe(before.tick + 1);

      // The farm must still be paused, and stay put: no further ticks accumulate.
      const speed = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
          item.querySelector('strong')?.textContent?.trim() === 'Speed'
        ))?.querySelector('span')?.textContent?.trim()
      ));
      expect(speed).toBe('Paused');
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => globalThis.__farmDebug.getState().tick)).toBe(after.tick);

      // Undo while paused must also apply immediately. Seed purchases are outside
      // the undo domain by design, so exercise it through an undoable farm edit:
      // paint a plot at the canvas center and identify the painted cell by diffing
      // tile kinds, which keeps the test independent of camera framing.
      const tilesBefore = await page.evaluate(() => (
        Object.fromEntries(Object.entries(globalThis.__farmDebug.getState().tiles).map(([key, tile]) => [key, tile.kind]))
      ));
      const canvasBox = await page.locator('#game-canvas canvas').boundingBox();
      await page.click('[data-tool="plot"]');
      await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      const paintedCell = await page.waitForFunction((previous) => {
        const tiles = globalThis.__farmDebug.getState().tiles;
        const changed = Object.entries(tiles).find(([key, tile]) => tile.kind === 'plot' && previous[key] === 'empty');
        return changed ? changed[0] : false;
      }, tilesBefore, { timeout: 3000 }).then((handle) => handle.jsonValue());

      await page.click('[data-command="undo"]');
      await page.waitForFunction((key) => (
        globalThis.__farmDebug.getState().tiles[key]?.kind === 'empty'
      ), paintedCell, { timeout: 3000 });

      // Still paused through it all.
      expect(await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
          item.querySelector('strong')?.textContent?.trim() === 'Speed'
        ))?.querySelector('span')?.textContent?.trim()
      ))).toBe('Paused');
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 30000);
});
