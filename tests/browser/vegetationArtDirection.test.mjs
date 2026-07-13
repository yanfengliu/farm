import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

let server;
let browser;
let url;

function fullyExpandedFarmState() {
  const state = getFarmSnapshot(createFarmGame({ seed: 'expanded-botany-art' }));
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) state.tiles[`${x},${y}`] ??= { x, y, kind: 'empty' };
  }
  return state;
}

describe('living farm vegetation art direction', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-vegetation-art-test',
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

  test.each([
    { width: 1280, height: 800 },
    { width: 1024, height: 720 },
  ])('keeps distinct tree and understory palettes readable at $width x $height', async (viewport) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-command="pause"]');
      const metrics = await page.locator('#game-canvas canvas').evaluate((canvas) => {
        const context2d = canvas.getContext('2d');
        const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = {
          appleFruit: [225, 154, 84],
          birchBark: [216, 209, 173],
          lavender: [176, 155, 210],
          mushroomCap: [201, 120, 89],
        };
        return Object.fromEntries(Object.entries(colors).map(([name, color]) => {
          let count = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (
              pixels[index] === color[0]
              && pixels[index + 1] === color[1]
              && pixels[index + 2] === color[2]
            ) count += 1;
          }
          return [name, count];
        }));
      });

      expect(metrics.birchBark).toBeGreaterThan(15);
      expect(metrics.appleFruit).toBeGreaterThan(10);
      expect(metrics.lavender).toBeGreaterThan(20);
      expect(metrics.mushroomCap).toBeGreaterThan(8);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 15000);

  test('keeps fully expanded empty ground softly planted without tall obstructions', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, fullyExpandedFarmState());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-command="pause"]');
      const cloverPixels = await page.locator('#game-canvas canvas').evaluate((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] === 134 && pixels[index + 1] === 185 && pixels[index + 2] === 102) count += 1;
        }
        return count;
      });

      expect(cloverPixels).toBeGreaterThan(24);
    } finally {
      await context.close();
    }
  }, 15000);
});
