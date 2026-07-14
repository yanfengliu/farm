import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import {
  buildFarmBotanyLayout,
  decorativePlantVisualBounds,
  farmTreeVisualBounds,
} from '../../src/phaser/view/farmBotany';
import { buildFarmSceneryLayout } from '../../src/phaser/view/farmSceneryLayout';

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
      const botany = buildFarmBotanyLayout(12, 10, 32);
      const groups = {
        appleFruit: botany.trees.filter((tree) => tree.species === 'apple').map(farmTreeVisualBounds),
        birchBark: botany.trees.filter((tree) => tree.species === 'birch').map(farmTreeVisualBounds),
        lavender: botany.plants.filter((plant) => plant.kind === 'lavender').map(decorativePlantVisualBounds),
        mushroomCap: botany.plants.filter((plant) => plant.kind === 'mushroom').map(decorativePlantVisualBounds),
      };
      const frame = buildFarmSceneryLayout(12, 10, 32).frame;
      const metrics = await page.locator('#game-canvas canvas').evaluate((canvas, args) => {
        const context2d = canvas.getContext('2d');
        const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = {
          appleFruit: [[225, 154, 84], [215, 103, 82]],
          birchBark: [[216, 209, 173], [240, 230, 196]],
          lavender: [[176, 155, 210], [155, 135, 198]],
          mushroomCap: [[201, 120, 89], [217, 164, 95]],
        };
        const frameWidth = args.frame.right - args.frame.left;
        const frameHeight = args.frame.bottom - args.frame.top;
        const zoom = Math.max(0.78, Math.min(
          2,
          canvas.width / (frameWidth + 32),
          canvas.height / (frameHeight + 32),
        ));
        const centerX = (args.frame.left + args.frame.right) / 2;
        const centerY = (args.frame.top + args.frame.bottom) / 2;
        return Object.fromEntries(Object.entries(colors).map(([name, palette]) => {
          let count = 0;
          const visited = new Set();
          for (const bounds of args.groups[name]) {
            const left = Math.max(0, Math.floor(canvas.width / 2 + (bounds.left - centerX) * zoom));
            const right = Math.min(canvas.width, Math.ceil(canvas.width / 2 + (bounds.right + 1 - centerX) * zoom));
            const top = Math.max(0, Math.floor(canvas.height / 2 + (bounds.top - centerY) * zoom));
            const bottom = Math.min(canvas.height, Math.ceil(canvas.height / 2 + (bounds.bottom + 1 - centerY) * zoom));
            for (let y = top; y < bottom; y += 1) {
              for (let x = left; x < right; x += 1) {
                if (visited.has(`${x},${y}`)) continue;
                visited.add(`${x},${y}`);
                const index = (y * canvas.width + x) * 4;
                if (palette.some((color) => (
                  Math.abs(pixels[index] - color[0]) <= 10
                  && Math.abs(pixels[index + 1] - color[1]) <= 10
                  && Math.abs(pixels[index + 2] - color[2]) <= 10
                ))) count += 1;
              }
            }
          }
          return [name, count];
        }));
      }, { frame, groups });

      const minimums = viewport.width < 1200
        ? { birchBark: 15, appleFruit: 2, lavender: 3, mushroomCap: 8 }
        : { birchBark: 50, appleFruit: 5, lavender: 20, mushroomCap: 30 };
      for (const [name, minimum] of Object.entries(minimums)) {
        expect(metrics[name], `${name} pixels inside authored bounds`).toBeGreaterThan(minimum);
      }
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
