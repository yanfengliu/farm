import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { CROPS } from '../../src/game/content/crops';
import { FARM_TIERS } from '../../src/game/content/tiers';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

let server;
let browser;
let url;

function pumpkinFarmState() {
  const state = getFarmSnapshot(createFarmGame({ seed: 'pumpkin-art' }));
  state.tier = FARM_TIERS[4];
  for (const tile of Object.values(state.tiles)) {
    if (tile.kind === 'plot') {
      tile.plot = { cropId: 'pumpkin', growth: CROPS.pumpkin.growTicks, water: CROPS.pumpkin.waterTicks };
    }
  }
  return state;
}

function fullyExpandedFarmState() {
  const state = getFarmSnapshot(createFarmGame({ seed: 'full-expansion-art' }));
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      state.tiles[`${x},${y}`] ??= { x, y, kind: 'empty' };
    }
  }
  return state;
}

describe('cozy pixel art direction', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-cozy-art-test',
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

  test('caches static meadow and ground drawing between visual frames', async () => {
    const renderer = await readFile('src/phaser/view/farmRenderer.ts', 'utf8');
    const environment = await readFile('src/phaser/view/farmEnvironment.ts', 'utf8');
    const waterside = await readFile('src/phaser/view/farmWaterside.ts', 'utf8');

    expect(renderer).toContain('#meadowSignature');
    expect(renderer).toContain('#groundSignature');
    expect(renderer).toContain('drawFarmOverstory(this.#overstory, state, TILE_SIZE)');
    expect(renderer).toContain('drawFarmAmbience(this.#water, this.#actors, this.#effects, state, TILE_SIZE, presentationTick)');
    expect(environment).toContain('export function drawFarmScenery');
    expect(waterside).toContain('export function drawCreekShimmer');
  });

  test('ambient creek and well pixels keep moving while simulation is paused', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-command="pause"]');
      await page.waitForTimeout(700);
      const canvas = page.locator('#game-canvas canvas');
      const canvasHash = () => canvas.evaluate((element) => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 17) {
          hash ^= pixels[index];
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      });
      const first = await canvasHash();
      await page.waitForTimeout(350);
      const second = await canvasHash();

      expect(await page.locator('.hud').textContent()).toContain('Paused');
      expect(second).not.toBe(first);
    } finally {
      await context.close();
    }
  }, 15000);

  test('surrounds the farm with a visible wild meadow instead of a dark void', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('#game-canvas canvas');
      const corner = await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('#game-canvas canvas');
        const pixel = canvas?.getContext('2d')?.getImageData(8, 8, 1, 1).data;
        return pixel ? { r: pixel[0], g: pixel[1], b: pixel[2] } : null;
      });
      expect(corner).not.toBeNull();
      expect(corner.g).toBeGreaterThan(45);
      expect(corner.g).toBeGreaterThan(corner.r);
      expect(corner.g).toBeGreaterThan(corner.b);
    } finally {
      await context.close();
    }
  }, 15000);

  test.each([
    { width: 1280, height: 800 },
    { width: 1024, height: 720 },
  ])('renders ripe pumpkins as substantial orange pixel clusters at $width x $height', async (viewport) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, pumpkinFarmState());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('#game-canvas canvas');
      const orangePixels = await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('#game-canvas canvas');
        const context2d = canvas?.getContext('2d');
        if (!canvas || !context2d) return 0;
        const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 190 && pixels[i + 1] >= 90 && pixels[i + 1] < 155 && pixels[i + 2] < 75) count += 1;
        }
        return count;
      });
      expect(orangePixels).toBeGreaterThan(60);
    } finally {
      await context.close();
    }
  }, 15000);

  test('permanent cottage scenery remains visible after the whole farm expands', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, fullyExpandedFarmState());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const warmLandmarkPixels = await page.locator('#game-canvas canvas').evaluate((element) => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        let count = 0;
        for (let y = 0; y < element.height * 0.4; y += 1) {
          for (let x = element.width * 0.82; x < element.width; x += 1) {
            const index = (Math.floor(y) * element.width + Math.floor(x)) * 4;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            if (r >= 180 && r <= 235 && g >= 120 && g <= 185 && b >= 55 && b <= 120) count += 1;
          }
        }
        return count;
      });
      expect(warmLandmarkPixels).toBeGreaterThan(100);
    } finally {
      await context.close();
    }
  }, 15000);

  test('camera zoom and long panning stay inside the illustrated meadow', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const canvas = page.locator('#game-canvas canvas');
      await canvas.waitFor();
      await canvas.hover();
      await page.mouse.wheel(0, 4000);
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(3500);
      await page.keyboard.up('KeyD');

      const metrics = await canvas.evaluate((element) => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        let flatBackground = 0;
        let soilPixels = 0;
        for (let y = 0; y < element.height; y += 1) {
          for (let x = 0; x < element.width; x += 1) {
            const index = (y * element.width + x) * 4;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            if ((x < 5 || y < 5 || x >= element.width - 5 || y >= element.height - 5) && r === 63 && g === 95 && b === 50) flatBackground += 1;
            if (r >= 75 && r <= 175 && g >= 38 && g <= 120 && b <= 80 && r > g * 1.18) soilPixels += 1;
          }
        }
        return { flatBackground, soilPixels };
      });

      expect(metrics.flatBackground).toBeLessThan(50);
      expect(metrics.soilPixels).toBeGreaterThan(250);
    } finally {
      await context.close();
    }
  }, 15000);

  test('camera arrows do not pan while a crop mix input owns focus', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'camera-focused-input' }));
    savedState.tier = FARM_TIERS[2];
    savedState.cropMix = { carrot: 0.75, wheat: 0.25, tomato: 0, pumpkin: 0 };
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="mix"]');
      const input = page.locator('[data-mix-number="wheat"]');
      const canvas = page.locator('#game-canvas canvas');
      const soilCentroid = () => canvas.evaluate((element) => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        let count = 0;
        let totalX = 0;
        for (let y = 0; y < element.height; y += 1) {
          for (let x = 0; x < element.width; x += 1) {
            const index = (y * element.width + x) * 4;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            if (r >= 75 && r <= 175 && g >= 38 && g <= 120 && b <= 80 && r > g * 1.18) {
              count += 1;
              totalX += x;
            }
          }
        }
        return totalX / Math.max(1, count);
      });

      const before = await soilCentroid();
      await input.focus();
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(600);
      await page.keyboard.up('ArrowUp');
      const after = await soilCentroid();

      expect(await input.evaluate((element) => element === globalThis.document.activeElement)).toBe(true);
      expect(await input.inputValue()).toBe('26');
      await expect.poll(async () => Math.round((await page.evaluate(() => globalThis.__farmDebug.getState().cropMix.wheat)) * 100)).toBe(26);
      expect(Math.abs(after - before)).toBeLessThan(3);
    } finally {
      await context.close();
    }
  }, 15000);

  test('Home and farm reset restore the framed farm after panning', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const cameraHint = await page.locator('.camera-hint').textContent();
      expect(cameraHint).toContain('Home Recenter');
      expect(cameraHint).toContain('WASD Pan');
      expect(cameraHint).toContain('Wheel Zoom');
      expect(cameraHint).not.toContain('Â');
      const canvas = page.locator('#game-canvas canvas');
      const soilCentroid = () => canvas.evaluate((element) => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        let count = 0;
        let totalX = 0;
        for (let y = 0; y < element.height; y += 1) {
          for (let x = 0; x < element.width; x += 1) {
            const index = (y * element.width + x) * 4;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            if (r >= 75 && r <= 175 && g >= 38 && g <= 120 && b <= 80 && r > g * 1.18) {
              count += 1;
              totalX += x;
            }
          }
        }
        return totalX / Math.max(1, count);
      });
      const panRight = async () => {
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(700);
        await page.keyboard.up('ArrowRight');
      };

      const framed = await soilCentroid();
      await panRight();
      expect(Math.abs(await soilCentroid() - framed)).toBeGreaterThan(20);
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);
      expect(Math.abs(await soilCentroid() - framed)).toBeLessThan(5);

      await panRight();
      await page.keyboard.press('Shift+R');
      await page.waitForTimeout(100);
      expect(Math.abs(await soilCentroid() - framed)).toBeLessThan(5);
    } finally {
      await context.close();
    }
  }, 15000);
});
