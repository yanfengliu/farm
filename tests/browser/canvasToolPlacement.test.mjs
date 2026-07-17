import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

// The visual loop selects the Land, Well, Storage, and Bulldoze tools but never applies
// them through the canvas, and the headless suite drives buyLand/placeBuilding only as
// direct commands. This contract closes the integration: a real click at real screen
// coordinates must reach the intended cell through the camera and change both the
// simulation state and the HUD.

let server;
let browser;
let url;

describe('canvas tool placement through real clicks', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-canvas-tool-test',
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

  test('Well, Storage, Land, and Bulldoze clicks land on the intended cells and update the HUD', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
      // Deliberately NOT paused: submitFarmCommand queues into the civ-engine world and
      // commands only apply during a step, so a paused farm silently defers every
      // placement. The test plays under the same conditions as a real player and keeps
      // its targets away from the moving worker instead.

      const canvasBox = await page.locator('#game-canvas canvas').boundingBox();
      const readState = () => page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return {
          width: state.width,
          height: state.height,
          coins: state.coins,
          capacity: state.inventory.cropCapacity,
          landPurchased: state.stats.lifetimeLandPurchased,
          tiles: Object.fromEntries(Object.entries(state.tiles).map(([key, tile]) => [key, tile.kind])),
          workers: state.workers.map((worker) => `${worker.x},${worker.y}`),
          workerReach: state.workers.flatMap((worker) => [
            `${worker.x},${worker.y}`,
            ...worker.task.path.map((step) => `${step.x},${step.y}`),
            ...(worker.task.target ? [`${worker.task.target.x},${worker.task.target.y}`] : []),
          ]),
        };
      });

      // Calibration: with Inspect selected, a click prints "Tile x, y" (or a worker's
      // "Position: x, y") in the panel, revealing which cell the camera mapped it to.
      await page.click('[data-tool="inspect"]');
      const inspectAt = async (screenX, screenY) => {
        // The panel keeps the previous inspection on screen, so a wait on the bare
        // pattern is satisfied before the new frame renders. Wait for the text to
        // change; a re-inspection of the same cell legitimately never changes it, so
        // a quiet timeout falls through to parsing whatever is current.
        const previous = await page.evaluate(() => globalThis.document.querySelector('#panel-content')?.textContent ?? '');
        await page.mouse.click(screenX, screenY);
        await page.waitForFunction((old) => {
          const text = globalThis.document.querySelector('#panel-content')?.textContent ?? '';
          return text !== old && /(?:Tile|Position:)\s+\d+, \d+/.test(text);
        }, previous, { timeout: 1500 }).catch(() => {});
        const text = await page.evaluate(() => globalThis.document.querySelector('#panel-content').textContent);
        const match = /(?:Tile|Position:)\s+(\d+), (\d+)/.exec(text);
        if (!match) throw new Error(`Inspect panel showed no cell after clicking ${screenX},${screenY}`);
        return { x: Number(match[1]), y: Number(match[2]) };
      };

      const pointA = { x: canvasBox.x + canvasBox.width * 0.5, y: canvasBox.y + canvasBox.height * 0.5 };
      const pointB = { x: pointA.x + 192, y: pointA.y + 128 };
      const cellA = await inspectAt(pointA.x, pointA.y);
      const cellB = await inspectAt(pointB.x, pointB.y);
      expect(cellB.x).toBeGreaterThan(cellA.x);
      expect(cellB.y).toBeGreaterThan(cellA.y);
      const pxPerTileX = (pointB.x - pointA.x) / (cellB.x - cellA.x);
      const pxPerTileY = (pointB.y - pointA.y) / (cellB.y - cellA.y);

      // Aim for a cell, then verify with Inspect and correct by the observed cell delta.
      // Every target is confirmed exact before the real tool ever clicks it, so the
      // placement assertions below cannot be excused by a mapping miss.
      const screenForCell = async (target) => {
        let guess = {
          x: pointA.x + (target.x - cellA.x) * pxPerTileX,
          y: pointA.y + (target.y - cellA.y) * pxPerTileY,
        };
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const hit = await inspectAt(guess.x, guess.y);
          if (hit.x === target.x && hit.y === target.y) return guess;
          guess = { x: guess.x + (target.x - hit.x) * pxPerTileX, y: guess.y + (target.y - hit.y) * pxPerTileY };
        }
        throw new Error(`Could not calibrate a screen point for cell ${target.x},${target.y}`);
      };
      const onScreen = (point) => (
        point.x > canvasBox.x + 8 && point.x < canvasBox.x + canvasBox.width - 8 &&
        point.y > canvasBox.y + 8 && point.y < canvasBox.y + canvasBox.height - 8
      );

      const before = await readState();
      // Exclude anywhere the worker is, is walking through, or is heading to, plus a
      // one-cell margin around the worker itself - the farm keeps simulating during the
      // test, and placeBuilding refuses cells a worker occupies at application time.
      const reach = new Set(before.workerReach);
      const nearWorker = (cell) => before.workers.some((key) => {
        const [wx, wy] = key.split(',').map(Number);
        return Math.abs(cell.x - wx) <= 1 && Math.abs(cell.y - wy) <= 1;
      });
      const emptyOwned = Object.entries(before.tiles)
        .filter(([key, kind]) => kind === 'empty' && !reach.has(key))
        .map(([key]) => ({ x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) }))
        .filter((cell) => !nearWorker(cell));
      expect(emptyOwned.length).toBeGreaterThanOrEqual(2);

      // A locked in-bounds cell adjacent to owned land, for the Land purchase.
      const owned = new Set(Object.keys(before.tiles));
      const lockedAdjacent = [];
      for (const key of owned) {
        const [x, y] = key.split(',').map(Number);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= before.width || ny >= before.height) continue;
          if (!owned.has(`${nx},${ny}`)) lockedAdjacent.push({ x: nx, y: ny });
        }
      }
      expect(lockedAdjacent.length).toBeGreaterThan(0);

      const pickVisible = async (candidates) => {
        for (const cell of candidates) {
          const rough = {
            x: pointA.x + (cell.x - cellA.x) * pxPerTileX,
            y: pointA.y + (cell.y - cellA.y) * pxPerTileY,
          };
          if (!onScreen(rough)) continue;
          try {
            return { cell, screen: await screenForCell(cell) };
          } catch {
            continue;
          }
        }
        throw new Error('No candidate cell is visible and calibratable');
      };

      const wellTarget = await pickVisible(emptyOwned);
      const storageTarget = await pickVisible(emptyOwned.filter((cell) => (
        cell.x !== wellTarget.cell.x || cell.y !== wellTarget.cell.y
      )));
      const landTarget = await pickVisible(lockedAdjacent);

      // Phaser processes pointer input on its next game step, so a click's command lands
      // one frame after page.mouse.click returns. Wait on the state change itself; the
      // timeout converts a missed placement into a failure with the cell named.
      const waitForTileKind = async (cell, kind) => {
        await page.waitForFunction(([key, expected]) => (
          globalThis.__farmDebug.getState().tiles[key]?.kind === expected
        ), [`${cell.x},${cell.y}`, kind], { timeout: 5000 });
      };

      // Well: a free-standing click on an empty owned cell becomes a well in the save state.
      await page.click('[data-tool="well"]');
      await page.mouse.click(wellTarget.screen.x, wellTarget.screen.y);
      await waitForTileKind(wellTarget.cell, 'well');
      let state = await readState();

      // Storage: the cell converts and shared capacity grows, in state and in the HUD.
      const capacityBefore = state.capacity;
      await page.click('[data-tool="storage"]');
      await page.mouse.click(storageTarget.screen.x, storageTarget.screen.y);
      await waitForTileKind(storageTarget.cell, 'storage');
      state = await readState();
      expect(state.capacity).toBeGreaterThan(capacityBefore);
      await page.waitForFunction((expected) => (
        Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
          item.querySelector('strong')?.textContent?.trim() === 'Storage'
        ))?.querySelector('span')?.textContent?.trim()?.endsWith(`/${expected}`)
      ), state.capacity);

      // Land: the locked cell becomes owned, coins fall by the land cost, and the HUD follows.
      const coinsBefore = state.coins;
      await page.click('[data-tool="land"]');
      await page.mouse.click(landTarget.screen.x, landTarget.screen.y);
      await waitForTileKind(landTarget.cell, 'empty');
      state = await readState();
      expect(state.coins).toBeLessThan(coinsBefore);
      expect(state.landPurchased).toBe(before.landPurchased + 1);
      await page.waitForFunction((expected) => (
        Array.from(globalThis.document.querySelectorAll('#hud div')).find((item) => (
          item.querySelector('strong')?.textContent?.trim() === 'Coins'
        ))?.querySelector('span')?.textContent?.trim() === String(expected)
      ), state.coins);

      // Bulldoze: the placed well clears back to empty owned land.
      await page.click('[data-tool="bulldoze"]');
      await page.mouse.click(wellTarget.screen.x, wellTarget.screen.y);
      await waitForTileKind(wellTarget.cell, 'empty');

      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 45000);
});
