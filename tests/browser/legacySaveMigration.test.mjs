import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { advanceFarm, createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

const SAVE_KEY = 'farm.autosave.v1';

// A save from before the Village Harvest and ecology eras: no wildlife, no community,
// no upgrades record, no pumpkin entries, and neither optional lifetime counter.
// Validation accepts every one of these as absent, and normalizeFarmState fills each in.
// The unit suite proves that migration on an in-memory double; this fixture drives it
// through the real boot path - main.ts, Phaser, autosave - where a migrated state that
// is unit-valid could still throw in the renderer.
function legacyEraSaveFixture() {
  const game = createFarmGame({ seed: 'legacy-browser-boot' });
  advanceFarm(game, 600);
  const state = getFarmSnapshot(game);
  const strip = (record) => {
    delete record.wildlife;
    delete record.community;
    delete record.upgrades;
    delete record.stats.lifetimeUpgradePurchases;
    delete record.stats.lifetimeRequestsCompleted;
    for (const crops of [
      record.inventory.crops, record.inventory.seeds, record.cropMix,
      record.stats.lifetimePlanted, record.stats.lifetimeHarvested,
      record.stats.lifetimeManualSold, record.stats.lifetimeOverflowSold,
    ]) {
      delete crops.pumpkin;
    }
  };
  strip(state);
  const undoSnapshot = structuredClone(state);
  delete undoSnapshot.history;
  state.history.undo = [JSON.stringify(undoSnapshot)];
  return { raw: JSON.stringify(state), tick: state.tick };
}

let server;
let browser;
let url;

describe('legacy save boots through the real browser', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-legacy-save-test',
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

  test('a pre-ecology save migrates, renders, and writes back a current save', async () => {
    const fixture = legacyEraSaveFixture();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(([saveKey, raw]) => {
      globalThis.localStorage.setItem(saveKey, raw);
    }, [SAVE_KEY, fixture.raw]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');

      // The legacy save must be loaded, not refused as unreadable.
      const alert = await page.evaluate(() => (
        globalThis.document.querySelector('.hud-alert')?.textContent?.trim() ?? ''
      ));
      expect(alert).not.toMatch(/unreadable/i);

      const migrated = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return {
          tick: state.tick,
          duckNames: state.wildlife.ducks.map((duck) => duck.name).sort(),
          fishCount: state.wildlife.fish.length,
          upgrades: state.upgrades,
          communityPresent: Boolean(state.community),
          pumpkinCrops: state.inventory.crops.pumpkin,
          pumpkinMix: state.cropMix.pumpkin,
        };
      });
      // The played farm survived - not a silent fresh start.
      expect(migrated.tick).toBeGreaterThanOrEqual(fixture.tick);
      // Every additive migration landed.
      expect(migrated.duckNames).toEqual(['Mallow', 'Pip']);
      expect(migrated.fishCount).toBeGreaterThanOrEqual(4);
      expect(migrated.upgrades).toEqual({ boots: 0, wateringCan: 0 });
      expect(migrated.communityPresent).toBe(true);
      expect(migrated.pumpkinCrops).toBe(0);
      expect(migrated.pumpkinMix).toBe(0);

      // The migrated ecology reaches the renderer's text projection, not only state.
      const text = await page.evaluate(() => globalThis.render_game_to_text());
      expect(text).toContain('Pip:');
      expect(text).toContain('Mallow:');

      // The scene actually painted rather than bailing after a migration-era throw.
      const painted = await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('canvas');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const seen = new Set();
        for (let index = 0; index < pixels.length; index += 40) {
          seen.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
        }
        return seen.size;
      });
      expect(painted).toBeGreaterThan(50);

      // Autosave now writes the migrated shape back, closing the round trip:
      // the next boot of this farm is no longer a legacy boot.
      await page.waitForFunction((saveKey) => {
        const raw = globalThis.localStorage.getItem(saveKey);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        return saved.wildlife !== undefined && saved.community !== undefined;
      }, SAVE_KEY, { timeout: 5000 });

      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 30000);
});
