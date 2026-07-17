import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

describe('farmhand identity and storybook chrome', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-farmhand-identity-test',
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

  test('inspecting a farmhand shows their name and a painted pixel portrait', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
      await page.click('[data-command="pause"]');

      const canvasBox = await page.locator('#game-canvas canvas').boundingBox();
      await page.click('[data-tool="inspect"]');
      const inspectAt = async (screenX, screenY) => {
        const previous = await page.evaluate(() => globalThis.document.querySelector('#panel-content')?.textContent ?? '');
        await page.mouse.click(screenX, screenY);
        await page.waitForFunction((old) => {
          const text = globalThis.document.querySelector('#panel-content')?.textContent ?? '';
          return text !== old && /(?:Tile|Position:)\s+\d+, \d+/.test(text);
        }, previous, { timeout: 1500 }).catch(() => {});
        const text = await page.evaluate(() => globalThis.document.querySelector('#panel-content').textContent);
        const match = /(?:Tile|Position:)\s+(\d+), (\d+)/.exec(text);
        if (!match) throw new Error('Inspect panel showed no cell');
        return { x: Number(match[1]), y: Number(match[2]) };
      };

      const pointA = { x: canvasBox.x + canvasBox.width * 0.5, y: canvasBox.y + canvasBox.height * 0.5 };
      const pointB = { x: pointA.x + 192, y: pointA.y + 128 };
      const cellA = await inspectAt(pointA.x, pointA.y);
      const cellB = await inspectAt(pointB.x, pointB.y);
      const pxPerTileX = (pointB.x - pointA.x) / (cellB.x - cellA.x);
      const pxPerTileY = (pointB.y - pointA.y) / (cellB.y - cellA.y);

      const workerCell = await page.evaluate(() => {
        const worker = globalThis.__farmDebug.getState().workers[0];
        return { x: worker.x, y: worker.y };
      });
      let guess = {
        x: pointA.x + (workerCell.x - cellA.x) * pxPerTileX,
        y: pointA.y + (workerCell.y - cellA.y) * pxPerTileY,
      };
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const hit = await inspectAt(guess.x, guess.y);
        if (hit.x === workerCell.x && hit.y === workerCell.y) break;
        guess = { x: guess.x + (workerCell.x - hit.x) * pxPerTileX, y: guess.y + (workerCell.y - hit.y) * pxPerTileY };
      }

      // The first farmhand is Fern by authored content.
      await page.waitForFunction(() => (
        globalThis.document.querySelector('#panel-content h2')?.textContent?.includes('Fern')
      ), undefined, { timeout: 3000 });

      const portrait = await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('[data-inspect-portrait]');
        if (!canvas) return { present: false };
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set();
        let opaque = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] === 0) continue;
          opaque += 1;
          colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
        }
        const style = globalThis.getComputedStyle(canvas);
        return { present: true, opaque, distinctColors: colors.size, rendering: style.imageRendering };
      });
      expect(portrait.present).toBe(true);
      expect(portrait.opaque).toBeGreaterThan(80);
      expect(portrait.distinctColors).toBeGreaterThan(5);
      expect(portrait.rendering).toBe('pixelated');
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 45000);

  test('a coin change pulses the Coins chip', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
      await page.click('[data-buy-seeds="carrot"]');
      await page.waitForFunction(() => (
        Array.from(globalThis.document.querySelectorAll('#hud div')).some((chip) => (
          chip.querySelector('strong')?.textContent === 'Coins' && chip.classList.contains('coin-flash')
        ))
      ), undefined, { timeout: 3000 });
    } finally {
      await context.close();
    }
  }, 30000);

  test('work effects stay presentation-only: paused state and save bytes never change', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.advanceTime === 'function');
      // Run long enough for real planting/watering work, so effects have spawned.
      await page.evaluate(() => globalThis.advanceTime(30000));
      await page.click('[data-command="pause"]');
      await page.waitForTimeout(300);

      const before = await page.evaluate(() => ({
        save: globalThis.localStorage.getItem('farm.autosave.v1'),
        text: globalThis.render_game_to_text(),
      }));
      // A second of real frames: ambience and any in-flight effects keep
      // animating, and none of it may leak into simulation state or the save.
      await page.waitForTimeout(1000);
      const after = await page.evaluate(() => ({
        save: globalThis.localStorage.getItem('farm.autosave.v1'),
        text: globalThis.render_game_to_text(),
      }));

      expect(after.text).toBe(before.text);
      expect(after.save).toBe(before.save);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 45000);
});
