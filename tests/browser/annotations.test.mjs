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
  const directory = 'output/playwright/annotation-ux-review';
  await mkdir(directory, { recursive: true });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: false });
}

describe('farm annotations', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-annotations-test',
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

  test('N captures a precise comment without changing farm history and persists it', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      if (globalThis.sessionStorage.getItem('annotation-test-ready')) return;
      globalThis.localStorage.clear();
      globalThis.sessionStorage.setItem('annotation-test-ready', '1');
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('#game-canvas canvas');
      const before = await page.evaluate(() => globalThis.__farmDebug.getState());
      const canvas = page.locator('#game-canvas canvas');
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.keyboard.press('n');
      await expect.poll(async () => page.locator('[data-command="toggle-annotations"]').getAttribute('aria-pressed')).toBe('true');
      await expect.poll(async () => page.locator('.annotation-aim').count()).toBe(1);
      await captureEvidence(page, '1280-aim');
      await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);

      const textarea = page.locator('[data-annotation-draft]');
      await textarea.waitFor();
      await expect.poll(async () => page.locator('#hud').textContent()).toContain('Paused');
      await captureEvidence(page, '1280-draft');
      const draftTick = await page.evaluate(() => globalThis.__farmDebug.getState().tick);
      await page.click('[data-command="pause"]');
      await page.waitForTimeout(250);
      await expect.poll(async () => page.locator('#hud').textContent()).toContain('Paused');
      expect(await page.evaluate(() => globalThis.__farmDebug.getState().tick)).toBe(draftTick);
      await textarea.fill('<img src=x onerror="window.annotationXss=1"> The creek flower looks odd here.');
      await page.click('[data-panel="inventory"]');
      await page.click('[data-panel="annotations"]');
      expect(await textarea.inputValue()).toContain('creek flower looks odd');
      await textarea.press('Control+Enter');

      await page.waitForSelector('[data-annotation-record="1"]');
      const result = await page.evaluate(() => ({
        notes: globalThis.__farmDebug.getAnnotations(),
        state: globalThis.__farmDebug.getState(),
        text: globalThis.render_game_to_text(),
        xss: globalThis.annotationXss,
      }));
      expect(result.notes.records).toHaveLength(1);
      expect(result.notes.records[0].index).toBe(1);
      expect(result.notes.records[0].message).toContain('creek flower looks odd');
      expect(result.notes.records[0].capture.previewDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.notes.records[0].capture.pick.canvasPx.normalizedX).toBeCloseTo(0.52, 1);
      expect(result.state.history).toEqual(before.history);
      expect(result.text).toContain('annotation#1');
      expect(result.xss).toBeUndefined();
      expect(await page.locator('.annotation-pin[data-annotation-index="1"]').count()).toBe(1);
      await captureEvidence(page, '1280-pinned');

      await page.reload({ waitUntil: 'networkidle' });
      await page.click('[data-panel="annotations"]');
      await page.waitForSelector('[data-annotation-record="1"]');
      expect(await page.locator('[data-annotation-record="1"] .annotation-message').textContent()).toContain('<img src=x');
      expect(await page.evaluate(() => globalThis.annotationXss)).toBeUndefined();

      await page.click('[data-command="edit-annotation"]');
      const edit = page.locator('[data-annotation-edit]');
      await edit.fill('Edited wording survives panel changes.');
      await page.click('[data-panel="inventory"]');
      await page.click('[data-panel="annotations"]');
      expect(await edit.inputValue()).toBe('Edited wording survives panel changes.');
      await edit.press('Escape');
      expect(await page.locator('[data-annotation-record="1"] .annotation-message').textContent()).toContain('<img src=x');

      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-command="export-annotation"]');
      expect((await downloadPromise).suggestedFilename()).toBe('farm-note-1.json');
      await expect.poll(async () => page.locator('.annotation-status').textContent()).toContain('Downloaded note #1');

      await page.evaluate(() => globalThis.__farmDebug.reset());
      await expect.poll(async () => page.evaluate(() => globalThis.__farmDebug.getAnnotations().records[0]?.context)).toBe('past-farm');
      await expect.poll(async () => page.locator('.annotation-pin').count()).toBe(0);
      await page.click('[data-command="delete-annotation"]');
      await expect.poll(async () => page.locator('[data-command="delete-annotation"]').textContent()).toContain('Confirm delete');
      expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotations().records.length)).toBe(1);
      await page.click('[data-command="delete-annotation"]');
      await expect.poll(async () => page.evaluate(() => globalThis.__farmDebug.getAnnotations().records.length)).toBe(0);
      await expect.poll(async () => page.locator('.annotation-status').textContent()).toContain('Deleted note #1');
    } finally {
      await context.close();
    }
  }, 20000);

  test('keyboard capture, inline validation, reset cleanup, and hostile stored captures stay safe', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const canvas = page.locator('#game-canvas canvas');
      await canvas.focus();
      await page.keyboard.press('n');
      await page.keyboard.press('Enter');
      const textarea = page.locator('[data-annotation-draft]');
      await textarea.waitFor();
      await textarea.press('Control+Enter');
      await expect.poll(async () => page.locator('.annotation-editor-warning').isVisible()).toBe(true);
      await expect.poll(async () => page.locator('.annotation-editor-warning').textContent()).toContain('cannot be empty');

      await textarea.fill('Keyboard-only center capture.');
      await page.click('[data-panel="inventory"]');
      await page.click('[data-panel="annotations"]');
      expect(await textarea.inputValue()).toBe('Keyboard-only center capture.');
      const center = await page.evaluate(() => globalThis.__farmDebug.getAnnotationContext());
      expect(center).toContain('annotationDraft=true');

      await textarea.focus();
      await page.evaluate(() => globalThis.__farmDebug.reset());
      await expect.poll(async () => page.locator('[data-annotation-draft]').count()).toBe(0);
      expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotationContext())).toContain('annotationDraft=false');

      await canvas.focus();
      await page.keyboard.press('n');
      await page.keyboard.press('Enter');
      await page.locator('[data-annotation-draft]').fill('This valid note will be corrupted in storage.');
      await page.locator('[data-annotation-draft]').press('Control+Enter');
      const pick = await page.evaluate(() => globalThis.__farmDebug.getAnnotations().records[0].capture.pick.canvasPx);
      expect(pick.normalizedX).toBeCloseTo(0.5, 2);
      expect(pick.normalizedY).toBeCloseTo(0.5, 2);

      await page.evaluate(() => {
        const key = 'farm.annotations.v1';
        const stored = JSON.parse(globalThis.localStorage.getItem(key));
        stored.records[0].capture.farmState.tick = '<img src=x onerror="globalThis.annotationXss=1">';
        globalThis.localStorage.setItem(key, JSON.stringify(stored));
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.click('[data-panel="annotations"]');
      expect(await page.evaluate(() => globalThis.__farmDebug.getAnnotations().records.length)).toBe(0);
      expect(await page.evaluate(() => globalThis.annotationXss)).toBeUndefined();
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 20000);

  test('pins follow camera movement and View restores the captured composition', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const canvas = page.locator('#game-canvas canvas');
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      await page.keyboard.press('n');
      await page.mouse.click(box.x + box.width * 0.43, box.y + box.height * 0.44);
      await page.locator('[data-annotation-draft]').fill('Keep an eye on this corner.');
      await captureEvidence(page, '1024-draft');
      await page.locator('[data-command="save-annotation"]').click();
      const pin = page.locator('.annotation-pin[data-annotation-index="1"]');
      await pin.waitFor();
      await captureEvidence(page, '1024-pinned');
      const captured = await pin.boundingBox();

      await canvas.focus();
      await page.keyboard.press('n');
      await expect.poll(async () => page.locator('[data-command="toggle-annotations"]').getAttribute('aria-pressed'), { timeout: 2000 }).toBe('true');
      await page.mouse.click(captured.x + captured.width / 2, captured.y + captured.height / 2);
      await page.locator('[data-annotation-draft]').waitFor({ timeout: 2000 });
      await page.click('[data-command="cancel-annotation"]');
      await page.keyboard.press('Escape');
      await expect.poll(async () => page.locator('[data-command="toggle-annotations"]').getAttribute('aria-pressed'), { timeout: 2000 }).toBe('false');
      await canvas.focus();

      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(350);
      await page.keyboard.up('ArrowRight');
      await expect.poll(async () => (await pin.boundingBox())?.x ?? 0, { timeout: 3000 }).not.toBeCloseTo(captured.x, 0);

      await page.click('[data-command="view-annotation"][data-annotation-id]');
      await expect.poll(async () => (await pin.boundingBox())?.x ?? 0, { timeout: 3000 }).toBeCloseTo(captured.x, 0);
      await expect.poll(async () => pin.evaluate((element) => element.classList.contains('pulse')), { timeout: 3000 }).toBe(true);
    } finally {
      await context.close();
    }
  }, 20000);

  test('annotation controls fit at both supported desktop viewports', async () => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 720 }]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.addInitScript(() => globalThis.localStorage.clear());
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        const canvas = page.locator('#game-canvas canvas');
        await canvas.focus();
        await page.keyboard.press('n');
        await page.keyboard.press('Enter');
        const textarea = page.locator('[data-annotation-draft]');
        await textarea.fill('A responsive note with enough words to exercise wrapping in the editor and record actions.');
        const draftMetrics = await page.evaluate(() => {
          const content = globalThis.document.querySelector('.panel-content').getBoundingClientRect();
          const editor = globalThis.document.querySelector('[data-annotation-draft]').getBoundingClientRect();
          const controls = Array.from(globalThis.document.querySelectorAll('.annotation-editor-actions button'))
            .map((button) => button.getBoundingClientRect());
          return {
            contentOverflow: globalThis.document.querySelector('.panel-content').scrollWidth - globalThis.document.querySelector('.panel-content').clientWidth,
            editorLeft: content.left - editor.left,
            editorRight: editor.right - content.right,
            controlRight: Math.max(...controls.map((control) => control.right)) - content.right,
          };
        });
        expect(draftMetrics.contentOverflow).toBeLessThanOrEqual(1);
        expect(draftMetrics.editorLeft).toBeLessThanOrEqual(1);
        expect(draftMetrics.editorRight).toBeLessThanOrEqual(1);
        expect(draftMetrics.controlRight).toBeLessThanOrEqual(1);
        await textarea.press('Control+Enter');

        const metrics = await page.evaluate(() => {
          const toolbar = globalThis.document.querySelector('.toolbar').getBoundingClientRect();
          const buttons = Array.from(globalThis.document.querySelectorAll('.toolbar button'))
            .map((button) => button.getBoundingClientRect());
          const tabs = Array.from(globalThis.document.querySelectorAll('.panel-tabs button'))
            .map((button) => button.getBoundingClientRect());
          const sidePanel = globalThis.document.querySelector('.side-panel').getBoundingClientRect();
          const recordButtons = Array.from(globalThis.document.querySelectorAll('.annotation-record-actions button'));
          return {
            toolbarOverflow: Math.max(...buttons.map((button) => button.right)) - toolbar.right,
            toolbarRows: new Set(buttons.map((button) => Math.round(button.top))).size,
            tabOverflow: Math.max(...tabs.map((button) => button.right)) - sidePanel.right,
            recordOverflow: Math.max(...recordButtons.map((button) => button.getBoundingClientRect().right)) - sidePanel.right,
            clippedRecordLabels: recordButtons.filter((button) => button.scrollWidth > button.clientWidth + 1).length,
          };
        });
        expect(metrics.toolbarOverflow).toBeLessThanOrEqual(1);
        expect(metrics.toolbarRows).toBe(1);
        expect(metrics.tabOverflow).toBeLessThanOrEqual(1);
        expect(metrics.recordOverflow).toBeLessThanOrEqual(1);
        expect(metrics.clippedRecordLabels).toBe(0);
      } finally {
        await context.close();
      }
    }
  }, 30000);
});
