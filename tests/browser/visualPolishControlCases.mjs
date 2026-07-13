import { expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

export function registerVisualPolishControlCases(getRuntime) {
  test('crop mix sliders expose readable action labels', async () => {
    const { browser, url } = getRuntime();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="mix"]');
      await page.waitForSelector('[data-mix="carrot"]');

      const sliderLabels = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('input[type="range"][data-mix]'))
          .map((input) => ({
            id: input.getAttribute('data-mix'),
            ariaLabel: input.getAttribute('aria-label') ?? '',
            title: input.getAttribute('title') ?? '',
          }))
      ));

      expect(sliderLabels).toEqual([
        { id: 'carrot', ariaLabel: 'Set Carrot crop mix', title: 'Set Carrot crop mix' },
        { id: 'wheat', ariaLabel: 'Set Wheat crop mix', title: 'Set Wheat crop mix' },
        { id: 'tomato', ariaLabel: 'Set Tomato crop mix', title: 'Set Tomato crop mix' },
        { id: 'pumpkin', ariaLabel: 'Set Pumpkin crop mix', title: 'Set Pumpkin crop mix' },
      ]);
    } finally {
      await context.close();
    }
  }, 15000);

  test('compact desktop toolbar avoids truncated labels', async () => {
    const { browser, url } = getRuntime();
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.toolbar .tool-button');

      const metrics = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('.toolbar .tool-button'))
          .map((button) => {
            const label = button.querySelector('.label');
            return {
              ariaLabel: button.getAttribute('aria-label') ?? '',
              visibleLabelWidth: label?.getBoundingClientRect().width ?? 0,
              buttonRight: button.getBoundingClientRect().right,
            };
          })
      ));

      expect(metrics.every((item) => item.ariaLabel.length > 0)).toBe(true);
      expect(Math.max(...metrics.map((item) => item.visibleLabelWidth))).toBeLessThanOrEqual(1);
      expect(Math.max(...metrics.map((item) => item.buttonRight))).toBeLessThanOrEqual(1024);

      await page.hover('[data-speed="4"]');
      await expect.poll(async () => page.locator('[data-speed="4"]').evaluate((button) => (
        Number.parseFloat(globalThis.getComputedStyle(button, '::after').opacity)
      ))).toBeGreaterThan(0.9);
      const tooltip = await page.locator('[data-speed="4"]').evaluate((button) => {
        const style = globalThis.getComputedStyle(button, '::after');
        return {
          content: style.content,
          pointerEvents: style.pointerEvents,
          whiteSpace: style.whiteSpace,
        };
      });
      expect(tooltip.content).toContain('4x speed');
      expect(tooltip.pointerEvents).toBe('none');
      expect(tooltip.whiteSpace).toBe('nowrap');
    } finally {
      await context.close();
    }
  }, 15000);

  test('crop mix number inputs rebalance unlocked crops to one hundred percent', async () => {
    const { browser, url } = getRuntime();
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'crop-mix-number-input' }));
    savedState.tier = {
      level: 2,
      label: 'Wheat Rows',
      unlockedCrops: ['carrot', 'wheat'],
      nextMilestone: 'Harvest 20 wheat',
    };
    savedState.cropMix = { carrot: 0.75, wheat: 0.25, tomato: 0 };

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="mix"]');
      await page.waitForSelector('[data-mix-number="wheat"]');

      await page.locator('[data-mix-number="wheat"]').fill('40');
      await page.locator('[data-mix-number="wheat"]').dispatchEvent('change');
      await page.locator('[data-mix-number="wheat"]').blur();

      await expect.poll(async () => page.evaluate(() => {
        const values = Object.fromEntries(
          Array.from(globalThis.document.querySelectorAll('[data-mix-number]'))
            .map((input) => [input.getAttribute('data-mix-number'), Number(input.value)]),
        );
        return {
          carrot: values.carrot,
          wheat: values.wheat,
          tomato: values.tomato,
          total: Object.values(values).reduce((sum, value) => sum + value, 0),
          summary: globalThis.document.querySelector('.crop-mix-allocation')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        };
      })).toEqual({
        carrot: 60,
        wheat: 40,
        tomato: 0,
        total: 100,
        summary: '100% allocated across unlocked crops',
      });

      await expect.poll(async () => page.evaluate(() => globalThis.__farmDebug.getState().cropMix)).toMatchObject({
        carrot: 0.6,
        wheat: 0.4,
      });
      const debugMix = await page.evaluate(() => globalThis.__farmDebug.getState().cropMix);
      expect(Math.round(debugMix.carrot * 100)).toBe(60);
      expect(Math.round(debugMix.wheat * 100)).toBe(40);
      expect(Math.round(debugMix.tomato * 100)).toBe(0);
    } finally {
      await context.close();
    }
  }, 15000);

  test('crop mix number editing keeps focus until the full value is committed', async () => {
    const { browser, url } = getRuntime();
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'crop-mix-keyboard-edit' }));
    savedState.tier = {
      level: 2,
      label: 'Wheat Rows',
      unlockedCrops: ['carrot', 'wheat'],
      nextMilestone: 'Harvest 20 wheat',
    };
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
      await input.focus();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('20', { delay: 60 });

      expect(await input.evaluate((element) => element === globalThis.document.activeElement && element.isConnected)).toBe(true);
      expect(await input.inputValue()).toBe('20');

      await input.blur();
      await expect.poll(async () => page.evaluate(() => ({
        mix: globalThis.__farmDebug.getState().cropMix,
        historyLength: globalThis.__farmDebug.getState().history.undo.length,
      }))).toMatchObject({ mix: { carrot: 0.8, wheat: 0.2 }, historyLength: 1 });
    } finally {
      await context.close();
    }
  }, 15000);

  test('crop mix slider stays connected through a real pointer drag and commits once', async () => {
    const { browser, url } = getRuntime();
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'crop-mix-pointer-drag' }));
    savedState.tier = {
      level: 2,
      label: 'Wheat Rows',
      unlockedCrops: ['carrot', 'wheat'],
      nextMilestone: 'Harvest 20 wheat',
    };
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
      const slider = page.locator('[data-mix="wheat"]');
      const box = await slider.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 30 });
      expect(await slider.evaluate((element) => element.isConnected)).toBe(true);
      const draggedValue = Number(await slider.inputValue());
      expect(draggedValue).toBeGreaterThan(55);
      await page.mouse.up();

      await expect.poll(async () => page.evaluate(() => ({
        wheat: Math.round(globalThis.__farmDebug.getState().cropMix.wheat * 100),
        historyLength: globalThis.__farmDebug.getState().history.undo.length,
      }))).toEqual({ wheat: draggedValue, historyLength: 1 });
    } finally {
      await context.close();
    }
  }, 15000);
}
