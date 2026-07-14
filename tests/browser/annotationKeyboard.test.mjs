import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';

let server;
let browser;
let url;

describe('Farm Notes keyboard ownership', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-annotation-keyboard-test',
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

  test('WASD types in note editors and still pans the camera from canvas focus', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      if (globalThis.sessionStorage.getItem('annotation-wasd-test-ready')) return;
      globalThis.localStorage.clear();
      globalThis.sessionStorage.setItem('annotation-wasd-test-ready', '1');
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const draftMessage = 'Wade walks east and sees ducks: wasd WASD.';
    const editTypedMessage = 'Sawdust and reeds need care: WASD wasd.';
    const editedMessage = `${editTypedMessage}d`;

    const savedMessages = async () => page.evaluate(() => {
      const record = globalThis.__farmDebug.getAnnotations().records[0];
      const exported = record ? globalThis.__farmDebug.exportAnnotation(record.id) : null;
      const stored = JSON.parse(globalThis.localStorage.getItem('farm.annotations.v1'));
      return {
        debug: record?.message ?? null,
        exported: exported ? JSON.parse(exported).message : null,
        stored: stored?.records?.[0]?.message ?? null,
      };
    });

    const holdKey = async (key, duration = 300) => {
      await page.keyboard.down(key);
      try {
        await page.waitForTimeout(duration);
      } finally {
        await page.keyboard.up(key);
      }
    };

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const canvas = page.locator('#game-canvas canvas');
      await canvas.focus();
      await page.keyboard.press('n');
      await page.keyboard.press('Enter');

      const draft = page.locator('[data-annotation-draft]');
      await draft.waitFor();
      await draft.focus();
      expect(await draft.evaluate((element) => element === globalThis.document.activeElement)).toBe(true);
      await page.keyboard.type(draftMessage);
      expect(await draft.inputValue()).toBe(draftMessage);
      await draft.press('Control+Enter');

      const record = page.locator('[data-annotation-record="1"]');
      const pin = page.locator('.annotation-pin[data-annotation-index="1"]');
      await record.waitFor();
      await pin.waitFor();
      expect(await savedMessages()).toEqual({ debug: draftMessage, exported: draftMessage, stored: draftMessage });

      const cameraBeforeEditing = await pin.boundingBox();
      expect(cameraBeforeEditing).not.toBeNull();
      await record.locator('[data-command="edit-annotation"]').click();
      const edit = page.locator('[data-annotation-edit]');
      await edit.focus();
      expect(await edit.evaluate((element) => element === globalThis.document.activeElement)).toBe(true);
      await edit.press('Control+A');
      await page.keyboard.type(editTypedMessage);
      await holdKey('KeyD');
      expect(await edit.inputValue()).toBe(editedMessage);
      const cameraAfterEditing = await pin.boundingBox();
      expect(cameraAfterEditing.x).toBeCloseTo(cameraBeforeEditing.x, 1);
      expect(cameraAfterEditing.y).toBeCloseTo(cameraBeforeEditing.y, 1);
      await edit.press('Control+Enter');
      expect(await savedMessages()).toEqual({ debug: editedMessage, exported: editedMessage, stored: editedMessage });

      const viewButton = record.locator('.annotation-record-focus');
      await expect.poll(async () => viewButton.evaluate((element) => element === globalThis.document.activeElement)).toBe(true);
      await canvas.focus();
      expect(await canvas.evaluate((element) => element === globalThis.document.activeElement)).toBe(true);
      const beforeD = await pin.boundingBox();
      await holdKey('KeyD');
      await expect.poll(async () => (await pin.boundingBox())?.x ?? beforeD.x).toBeLessThan(beforeD.x - 10);
      const beforeA = await pin.boundingBox();
      await holdKey('KeyA');
      await expect.poll(async () => (await pin.boundingBox())?.x ?? beforeA.x).toBeGreaterThan(beforeA.x + 10);
      const beforeS = await pin.boundingBox();
      await holdKey('KeyS');
      await expect.poll(async () => (await pin.boundingBox())?.y ?? beforeS.y).toBeLessThan(beforeS.y - 10);
      const beforeW = await pin.boundingBox();
      await holdKey('KeyW');
      await expect.poll(async () => (await pin.boundingBox())?.y ?? beforeW.y).toBeGreaterThan(beforeW.y + 10);

      await page.reload({ waitUntil: 'networkidle' });
      await page.click('[data-panel="annotations"]');
      await page.waitForSelector('[data-annotation-record="1"]');
      expect(await page.locator('[data-annotation-record="1"] .annotation-message').textContent()).toBe(editedMessage);
      expect(await savedMessages()).toEqual({ debug: editedMessage, exported: editedMessage, stored: editedMessage });
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 20000);
});
