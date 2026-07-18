import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

// Player report: a farmhand walking across the inspected cell hijacked the
// panel with his info. Selection is now explicit - click the hand or his
// roster row - and cell inspection never shows a worker.

let server;
let browser;
let url;

describe('explicit farmhand selection', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-farmhand-selection-test',
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

  test('clicking a farmhand selects him; clicking land shows the tile with no hijack', async () => {
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
      const clickCell = async (target) => {
        let guess = {
          x: pointA.x + (target.x - cellA.x) * pxPerTileX,
          y: pointA.y + (target.y - cellA.y) * pxPerTileY,
        };
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const hit = await inspectAt(guess.x, guess.y);
          if (hit.x === target.x && hit.y === target.y) return;
          guess = { x: guess.x + (target.x - hit.x) * pxPerTileX, y: guess.y + (target.y - hit.y) * pxPerTileY };
        }
        throw new Error(`could not click cell ${target.x},${target.y}`);
      };

      // Click the farmhand's tile: explicit selection, panel shows Fern.
      const workerCell = await page.evaluate(() => {
        const worker = globalThis.__farmDebug.getState().workers[0];
        return { x: worker.x, y: worker.y };
      });
      await clickCell(workerCell);
      await page.waitForFunction(() => (
        globalThis.document.querySelector('#panel-content h2')?.textContent === 'Fern'
      ), undefined, { timeout: 3000 });

      // The roster tab reflects the same selection.
      await page.click('[data-panel="farmhands"]');
      await page.waitForFunction(() => (
        globalThis.document.querySelector('[data-select-farmhand="1"]')?.getAttribute('aria-pressed') === 'true'
      ), undefined, { timeout: 3000 });

      // Clicking an empty owned cell shows the tile card - never a farmhand.
      await page.click('[data-tool="inspect"]');
      const emptyCell = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        const workers = new Set(state.workers.map((worker) => `${worker.x},${worker.y}`));
        const tile = Object.values(state.tiles).find((candidate) => (
          candidate.kind === 'empty' && !workers.has(`${candidate.x},${candidate.y}`)
        ));
        return { x: tile.x, y: tile.y };
      });
      await clickCell(emptyCell);
      const heading = await page.evaluate(() => globalThis.document.querySelector('#panel-content h2')?.textContent);
      expect(heading).toBe('Empty Land');
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 45000);

  test('the roster lists every farmhand and row clicks toggle the highlight', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
      await page.click('[data-panel="farmhands"]');
      await page.waitForSelector('[data-select-farmhand="1"]');

      const roster = await page.evaluate(() => ({
        heading: globalThis.document.querySelector('#panel-content h2')?.textContent,
        name: globalThis.document.querySelector('.farmhand-row strong')?.textContent,
        portraitPainted: (() => {
          const canvas = globalThis.document.querySelector('.farmhand-row canvas');
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
          return false;
        })(),
      }));
      expect(roster.heading).toContain('Farmhands');
      expect(roster.name).toBe('Fern');
      expect(roster.portraitPainted).toBe(true);

      await page.click('[data-select-farmhand="1"]');
      await page.waitForFunction(() => (
        globalThis.document.querySelector('[data-select-farmhand="1"]')?.getAttribute('aria-pressed') === 'true'
      ));
      await page.click('[data-select-farmhand="1"]');
      await page.waitForFunction(() => (
        globalThis.document.querySelector('[data-select-farmhand="1"]')?.getAttribute('aria-pressed') === 'false'
      ));
    } finally {
      await context.close();
    }
  }, 45000);
});
