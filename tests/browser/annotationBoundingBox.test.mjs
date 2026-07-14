import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

async function captureEvidence(page, name) {
  if (process.env.FARM_CAPTURE_ANNOTATION_EVIDENCE !== '1') return;
  const directory = 'output/playwright/annotation-box-review';
  await mkdir(directory, { recursive: true });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: false });
}

async function pointAt(canvas, xFraction, yFraction) {
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  return {
    x: bounds.x + bounds.width * xFraction,
    y: bounds.y + bounds.height * yFraction,
  };
}

async function holdKey(page, key, duration = 300) {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(duration);
  } finally {
    await page.keyboard.up(key);
  }
}

describe('Farm Notes bounding boxes', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-annotation-box-test',
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

  test('drags, persists, reprojects, and restores a world-space bounding-box note', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      if (globalThis.sessionStorage.getItem('annotation-box-test-ready')) return;
      globalThis.localStorage.clear();
      globalThis.sessionStorage.setItem('annotation-box-test-ready', '1');
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const canvas = page.locator('#game-canvas canvas');
      await canvas.waitFor();
      const before = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return {
          farmId: state.farmId,
          history: state.history,
          tileKinds: Object.fromEntries(Object.entries(state.tiles).map(([key, tile]) => [key, tile.kind])),
        };
      });

      await page.keyboard.press('n');
      const pointMode = page.locator('[data-command="set-annotation-point"]');
      const boxMode = page.locator('[data-command="set-annotation-box"]');
      await expect.poll(async () => pointMode.getAttribute('aria-pressed')).toBe('true');
      await boxMode.click();
      await expect.poll(async () => boxMode.getAttribute('aria-pressed')).toBe('true');
      await expect.poll(async () => page.evaluate(() => globalThis.__farmDebug.getAnnotationContext())).toContain('annotationMode=box');

      const start = await pointAt(canvas, 0.68, 0.62);
      const end = await pointAt(canvas, 0.29, 0.31);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      const tickAtDragStart = await page.evaluate(() => globalThis.__farmDebug.getState().tick);
      await page.mouse.move(end.x, end.y, { steps: 8 });
      const liveBox = page.locator('[data-annotation-box-draft]');
      await liveBox.waitFor();
      await expect.poll(async () => page.evaluate(() => globalThis.__farmDebug.getAnnotationContext()))
        .toContain('annotationDragging=true');
      const liveBounds = await liveBox.boundingBox();
      expect(liveBounds.width).toBeGreaterThan(120);
      expect(liveBounds.height).toBeGreaterThan(90);
      expect(await page.locator('[data-annotation-draft]').count()).toBe(0);
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => globalThis.__farmDebug.getState().tick)).toBe(tickAtDragStart);
      await captureEvidence(page, '1024-live-box');
      await page.mouse.up();

      const textarea = page.locator('[data-annotation-draft]');
      await textarea.waitFor();
      await expect.poll(async () => liveBox.count()).toBe(1);
      await expect.poll(async () => page.evaluate(() => globalThis.__farmDebug.getAnnotationContext()))
        .toContain('annotationDragging=false');
      await expect.poll(async () => page.locator('#hud').textContent()).toContain('Paused');
      await captureEvidence(page, '1024-box-draft');
      await textarea.fill('The whole reed and lily cluster feels too regular.');
      await textarea.press('Control+Enter');

      const region = page.locator('.annotation-box[data-annotation-index="1"]');
      const badge = page.locator('.annotation-box-pin[data-annotation-id][data-annotation-index="1"]');
      await region.waitFor();
      await badge.waitFor();
      const capturedBounds = await region.boundingBox();
      expect(capturedBounds.width).toBeGreaterThan(120);
      expect(capturedBounds.height).toBeGreaterThan(90);
      await captureEvidence(page, '1024-saved-box');

      const saved = await page.evaluate(async () => {
        const record = globalThis.__farmDebug.getAnnotations().records[0];
        const exported = JSON.parse(globalThis.__farmDebug.exportAnnotation(record.id));
        const stored = JSON.parse(globalThis.localStorage.getItem('farm.annotations.v1')).records[0];
        const image = new Image();
        image.src = record.capture.previewDataUrl;
        await image.decode();
        const preview = globalThis.document.createElement('canvas');
        preview.width = image.width;
        preview.height = image.height;
        const context = preview.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, preview.width, preview.height).data;
        let outlinePixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] === 255 && pixels[index + 1] === 226 && pixels[index + 2] === 160 && pixels[index + 3] === 255) {
            outlinePixels += 1;
          }
        }
        return { record, exported, stored, outlinePixels, text: globalThis.render_game_to_text() };
      });
      expect(saved.record.capture.pick.selection).toMatchObject({
        kind: 'box',
        canvasRect: {
          normalizedX: expect.closeTo(0.29, 2),
          normalizedY: expect.closeTo(0.31, 2),
          normalizedWidth: expect.closeTo(0.39, 2),
          normalizedHeight: expect.closeTo(0.31, 2),
        },
      });
      expect(saved.record.capture.pick.canvasPx.normalizedX).toBeCloseTo(0.485, 2);
      expect(saved.record.capture.pick.canvasPx.normalizedY).toBeCloseTo(0.465, 2);
      expect(saved.record.capture.pick.selection.worldRect.width).toBeGreaterThan(0);
      expect(saved.record.capture.pick.selection.worldRect.height).toBeGreaterThan(0);
      expect(saved.record.capture.pick.viewport.devicePixelRatio).toBe(2);
      expect(saved.record.capture.previewDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(saved.outlinePixels).toBeGreaterThan(250);
      expect(saved.exported.capture.pick.selection).toEqual(saved.record.capture.pick.selection);
      expect(saved.stored.capture.pick.selection).toEqual(saved.record.capture.pick.selection);
      expect(saved.text).toContain('shape=box');
      const after = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return {
          farmId: state.farmId,
          history: state.history,
          tileKinds: Object.fromEntries(Object.entries(state.tiles).map(([key, tile]) => [key, tile.kind])),
        };
      });
      expect(after).toEqual(before);

      const viewButton = page.locator('.annotation-record-focus');
      await expect.poll(async () => viewButton.evaluate((element) => element === globalThis.document.activeElement)).toBe(true);
      await canvas.focus();
      await holdKey(page, 'KeyD');
      await expect.poll(async () => (await region.boundingBox())?.x ?? capturedBounds.x)
        .toBeLessThan(capturedBounds.x - 10);
      const pannedBounds = await region.boundingBox();
      expect(pannedBounds.width).toBeCloseTo(capturedBounds.width, 0);
      expect(pannedBounds.height).toBeCloseTo(capturedBounds.height, 0);

      await canvas.hover();
      await page.mouse.wheel(0, -500);
      await expect.poll(async () => (await region.boundingBox())?.width ?? pannedBounds.width)
        .toBeGreaterThan(pannedBounds.width + 10);

      await page.click('[data-command="view-annotation"][data-annotation-id]');
      await expect.poll(async () => (await region.boundingBox())?.x ?? 0).toBeCloseTo(capturedBounds.x, 0);
      await expect.poll(async () => (await region.boundingBox())?.y ?? 0).toBeCloseTo(capturedBounds.y, 0);
      await expect.poll(async () => (await region.boundingBox())?.width ?? 0).toBeCloseTo(capturedBounds.width, 0);
      await expect.poll(async () => (await region.boundingBox())?.height ?? 0).toBeCloseTo(capturedBounds.height, 0);

      await page.reload({ waitUntil: 'networkidle' });
      await page.click('[data-panel="annotations"]');
      await page.waitForSelector('[data-annotation-record="1"]');
      const reloadedRegion = page.locator('.annotation-box[data-annotation-index="1"]');
      const reloadedBadge = page.locator('.annotation-box-pin[data-annotation-index="1"]');
      await reloadedRegion.waitFor();
      await reloadedBadge.waitFor();
      const reloadedBounds = await reloadedRegion.boundingBox();
      expect(reloadedBounds.width).toBeGreaterThan(120);
      expect(reloadedBounds.height).toBeGreaterThan(90);
      expect(await page.locator('[data-annotation-record="1"] .annotation-message').textContent())
        .toBe('The whole reed and lily cluster feels too regular.');
      expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotations().records[0].capture.pick.selection))
        .toEqual(saved.record.capture.pick.selection);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 30000);

  test('rejects tiny boxes, cancels active drags, and keeps keyboard and point capture usable', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const canvas = page.locator('#game-canvas canvas');
      await canvas.focus();
      await page.keyboard.press('n');
      await page.click('[data-command="set-annotation-box"]');

      const tinyStart = await pointAt(canvas, 0.4, 0.4);
      await page.mouse.move(tinyStart.x, tinyStart.y);
      await page.mouse.down();
      await page.mouse.move(tinyStart.x + 4, tinyStart.y + 4);
      await page.mouse.up();
      expect(await page.locator('[data-annotation-draft]').count()).toBe(0);
      expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotations().records.length)).toBe(0);
      await expect.poll(async () => page.locator('.annotation-status').textContent()).toContain('Drag a larger box');
      await expect.poll(async () => page.locator('#hud').textContent()).not.toContain('Paused');
      await expect.poll(async () => page.locator('[data-command="toggle-annotations"]').getAttribute('aria-pressed')).toBe('true');

      const dragStart = await pointAt(canvas, 0.35, 0.35);
      const dragEnd = await pointAt(canvas, 0.58, 0.54);
      await page.mouse.move(dragStart.x, dragStart.y);
      await page.mouse.down();
      await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 5 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(await page.locator('[data-annotation-box-draft]').count()).toBe(0);
      expect(await page.locator('[data-annotation-draft]').count()).toBe(0);
      await expect.poll(async () => page.locator('#hud').textContent()).not.toContain('Paused');
      await expect.poll(async () => page.locator('[data-command="toggle-annotations"]').getAttribute('aria-pressed')).toBe('true');
      await page.keyboard.press('Escape');
      await expect.poll(async () => page.locator('[data-command="toggle-annotations"]').getAttribute('aria-pressed')).toBe('false');

      await page.keyboard.press('n');
      await page.click('[data-command="set-annotation-point"]');
      await canvas.click({ position: { x: 320, y: 260 } });
      const pointDraft = page.locator('[data-annotation-draft]');
      await pointDraft.waitFor();
      await pointDraft.fill('Point capture still works.');
      await pointDraft.press('Control+Enter');
      expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotations().records[0].capture.pick.selection)).toBeUndefined();

      await canvas.focus();
      await page.keyboard.press('n');
      await page.click('[data-command="set-annotation-box"]');
      await canvas.focus();
      await page.keyboard.press('Enter');
      const keyboardDraft = page.locator('[data-annotation-draft]');
      await keyboardDraft.waitFor();
      await keyboardDraft.fill('Keyboard-centered area.');
      await keyboardDraft.press('Control+Enter');
      const keyboardSelection = await page.evaluate(() => globalThis.__farmDebug.getAnnotations().records[1].capture.pick.selection);
      expect(keyboardSelection.kind).toBe('box');
      expect(keyboardSelection.canvasRect.normalizedX + keyboardSelection.canvasRect.normalizedWidth / 2).toBeCloseTo(0.5, 2);
      expect(keyboardSelection.canvasRect.normalizedY + keyboardSelection.canvasRect.normalizedHeight / 2).toBeCloseTo(0.5, 2);
    } finally {
      await context.close();
    }
  }, 20000);

  test('captures off-canvas releases and ignores Enter until the active drag ends', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const canvas = page.locator('#game-canvas canvas');
      await canvas.focus();
      await page.keyboard.press('n');
      await page.click('[data-command="set-annotation-box"]');

      const start = await pointAt(canvas, 0.42, 0.34);
      const end = await pointAt(canvas, 0.64, 0.53);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      try {
        await page.mouse.move(end.x, end.y, { steps: 5 });
        await page.keyboard.press('Enter');
        expect(await page.locator('[data-annotation-draft]').count()).toBe(0);
        expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotationContext())).toContain('annotationDragging=true');
      } finally {
        await page.mouse.up();
      }
      await page.locator('[data-annotation-draft]').waitFor();
      await page.keyboard.press('Escape');
      await expect.poll(async () => page.locator('#hud').textContent()).not.toContain('Paused');

      const bounds = await canvas.boundingBox();
      expect(bounds).not.toBeNull();
      const outside = { x: bounds.x + bounds.width + 90, y: bounds.y + bounds.height * 0.56 };
      const inside = await pointAt(canvas, 0.72, 0.35);
      await page.mouse.move(inside.x, inside.y);
      await page.mouse.down();
      await page.mouse.move(outside.x, outside.y, { steps: 8 });
      await page.mouse.up();

      await page.locator('[data-annotation-draft]').waitFor({ timeout: 3000 });
      const selection = await page.evaluate(() => ({
        context: globalThis.__farmDebug.getAnnotationContext(),
        draft: globalThis.document.querySelector('[data-annotation-draft]') !== null,
      }));
      expect(selection.draft).toBe(true);
      expect(selection.context).toContain('annotationDragging=false');
      await page.keyboard.press('Escape');
      await expect.poll(async () => page.locator('#hud').textContent()).not.toContain('Paused');

      await canvas.focus();
      await page.keyboard.press('Space');
      await expect.poll(async () => page.locator('#hud').textContent()).toContain('Paused');
      const lostStart = await pointAt(canvas, 0.31, 0.31);
      const lostEnd = await pointAt(canvas, 0.52, 0.49);
      await page.mouse.move(lostStart.x, lostStart.y);
      await page.mouse.down();
      try {
        await page.mouse.move(lostEnd.x, lostEnd.y, { steps: 5 });
        expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotationContext())).toContain('annotationDragging=true');
        await canvas.dispatchEvent('lostpointercapture', { pointerId: 1 });
        await expect.poll(async () => page.evaluate(() => globalThis.__farmDebug.getAnnotationContext())).toContain('annotationDragging=false');
        expect(await page.locator('[data-annotation-draft]').count()).toBe(0);
        expect(await page.locator('#hud').textContent()).toContain('Paused');
      } finally {
        await page.mouse.up();
      }

      const pausedSaveStart = await pointAt(canvas, 0.35, 0.36);
      const pausedSaveEnd = await pointAt(canvas, 0.56, 0.54);
      await page.mouse.move(pausedSaveStart.x, pausedSaveStart.y);
      await page.mouse.down();
      await page.mouse.move(pausedSaveEnd.x, pausedSaveEnd.y, { steps: 5 });
      await page.mouse.up();
      const pausedDraft = page.locator('[data-annotation-draft]');
      await pausedDraft.fill('This paused farm must stay paused.');
      await pausedDraft.press('Control+Enter');
      await expect.poll(async () => page.locator('#hud').textContent()).toContain('Paused');
    } finally {
      await page.mouse.up().catch(() => {});
      await context.close();
    }
  }, 20000);

  test('keeps box controls and projected annotations inside supported desktop layouts', async () => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 720 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.addInitScript(() => globalThis.localStorage.clear());
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        const canvas = page.locator('#game-canvas canvas');
        await canvas.focus();
        await page.keyboard.press('n');
        await page.click('[data-command="set-annotation-box"]');
        const start = await pointAt(canvas, 0.22, 0.24);
        const end = await pointAt(canvas, 0.55, 0.53);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 5 });
        await captureEvidence(page, `${viewport.width}-live-box`);
        await page.mouse.up();
        await page.locator('[data-annotation-draft]').fill('Desktop layout box.');
        await page.locator('[data-annotation-draft]').press('Control+Enter');

        const metrics = await page.evaluate(() => {
          const content = globalThis.document.querySelector('.panel-content');
          const mode = globalThis.document.querySelector('.annotation-mode-switch');
          const box = globalThis.document.querySelector('.annotation-box');
          const canvas = globalThis.document.querySelector('#game-canvas canvas');
          const modeRect = mode.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const boxRect = box.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          return {
            contentOverflow: content.scrollWidth - content.clientWidth,
            modeLeft: contentRect.left - modeRect.left,
            modeRight: modeRect.right - contentRect.right,
            boxIntersectsCanvas: boxRect.right >= canvasRect.left && boxRect.left <= canvasRect.right &&
              boxRect.bottom >= canvasRect.top && boxRect.top <= canvasRect.bottom,
          };
        });
        expect(metrics.contentOverflow).toBeLessThanOrEqual(1);
        expect(metrics.modeLeft).toBeLessThanOrEqual(1);
        expect(metrics.modeRight).toBeLessThanOrEqual(1);
        expect(metrics.boxIntersectsCanvas).toBe(true);
        await captureEvidence(page, `${viewport.width}-saved-box`);
      } finally {
        await context.close();
      }
    }
  }, 30000);
});
