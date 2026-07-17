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
  }, 40000);

  test('every gameplay shortcut stays native inside draft and edit textareas', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => globalThis.localStorage.clear());
    const page = await context.newPage();
    const shortcutText = 'wasd WASD 1234 b i n z y r B I N Z Y R 0-= +_';

    const expectCaret = async (locator, expected) => {
      expect(await locator.evaluate((element) => element.selectionStart)).toBe(expected);
    };
    const holdKey = async (key, duration = 140) => {
      await page.keyboard.down(key);
      try {
        await page.waitForTimeout(duration);
      } finally {
        await page.keyboard.up(key);
      }
    };
    const expectSamePosition = (before, after) => {
      expect(after.x).toBeCloseTo(before.x, 1);
      expect(after.y).toBeCloseTo(before.y, 1);
    };

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        globalThis.__annotationKeyAudit = [];
        const auditKeyEvent = (event) => {
          const target = event.target;
          if (!(target instanceof Element) || !target.matches('[data-annotation-draft], [data-annotation-edit]')) return;
          const entry = {
            type: event.type,
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            defaultPrevented: false,
          };
          queueMicrotask(() => {
            entry.defaultPrevented = event.defaultPrevented;
            globalThis.__annotationKeyAudit.push(entry);
          });
        };
        globalThis.addEventListener('keydown', auditKeyEvent);
        globalThis.addEventListener('keyup', auditKeyEvent);
      });

      const canvas = page.locator('#game-canvas canvas');
      await canvas.focus();
      await page.keyboard.press('n');
      await page.keyboard.press('Enter');
      const draft = page.locator('[data-annotation-draft]');
      await draft.waitFor();

      const beforeDraft = await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return { farmId: state.farmId, history: state.history };
      });
      await page.keyboard.type(shortcutText);
      expect(await draft.inputValue()).toBe(shortcutText);
      expect(await page.locator('[data-command="toggle-annotations"]').getAttribute('aria-pressed')).toBe('true');

      await draft.fill('abcd');
      await draft.press('Home');
      await expectCaret(draft, 0);
      await draft.press('ArrowRight');
      await expectCaret(draft, 1);
      await draft.press('End');
      await expectCaret(draft, 4);
      await draft.press('ArrowLeft');
      await expectCaret(draft, 3);
      await draft.press('ArrowUp');
      await draft.press('ArrowDown');
      expect(await draft.inputValue()).toBe('abcd');

      await draft.fill('line');
      await draft.press('End');
      await draft.press('Enter');
      await draft.press('Shift+Enter');
      expect(await draft.inputValue()).toBe('line\n\n');
      await draft.fill('abcd');
      await draft.press('Home');
      await draft.press('Delete');
      await draft.press('End');
      await draft.press('Backspace');
      expect(await draft.inputValue()).toBe('bc');
      await draft.press('Control+A');
      await page.keyboard.type('Draft shortcut matrix passed.');
      await draft.press('Control+Enter');

      const record = page.locator('[data-annotation-record="1"]');
      const pin = page.locator('.annotation-pin[data-annotation-index="1"]');
      await record.waitFor();
      await pin.waitFor();
      expect(await page.evaluate(() => {
        const state = globalThis.__farmDebug.getState();
        return { farmId: state.farmId, history: state.history };
      })).toEqual(beforeDraft);

      await record.locator('[data-command="edit-annotation"]').click();
      const edit = page.locator('[data-annotation-edit]');
      await edit.fill('');
      await page.keyboard.type(shortcutText);
      expect(await edit.inputValue()).toBe(shortcutText);
      const beforeNavigation = await pin.boundingBox();
      for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Home']) {
        await holdKey(key);
      }
      expectSamePosition(beforeNavigation, await pin.boundingBox());
      expect(await edit.inputValue()).toBe(`${shortcutText}wasd`);

      await edit.press('Control+Z');
      await edit.press('Control+Y');
      await edit.press('Control+A');
      await page.keyboard.type('Edit shortcut matrix passed.');
      await edit.press('Control+Enter');
      expect(await page.locator('[data-annotation-record="1"] .annotation-message').textContent())
        .toBe('Edit shortcut matrix passed.');

      const prevented = await page.evaluate(() => globalThis.__annotationKeyAudit.filter((entry) => (
        entry.defaultPrevented && !(entry.key === 'Enter' && (entry.ctrlKey || entry.metaKey))
      )));
      expect(prevented).toEqual([]);
    } finally {
      await context.close();
    }
  }, 30000);
});
