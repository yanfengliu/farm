import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

let server;
let browser;
let url;

function alphaFromCssColor(color) {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return 1;
  const parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
  return parts.length >= 4 ? parts[3] : 1;
}

describe('visual polish', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-visual-polish-test',
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

  test('canvas backdrop uses warm charcoal instead of flat black', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('#game-canvas canvas');

      const backdropPixel = await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('#game-canvas canvas');
        const context2d = canvas?.getContext('2d');
        const pixel = context2d?.getImageData(8, 8, 1, 1).data;
        return pixel ? { r: pixel[0], g: pixel[1], b: pixel[2] } : null;
      });

      expect(backdropPixel).not.toBeNull();
      expect(backdropPixel.r).toBeGreaterThanOrEqual(22);
      expect(backdropPixel.r).toBeGreaterThan(backdropPixel.b);
    } finally {
      await context.close();
    }
  }, 15000);

  test('hud stats are grouped into readable chips', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.hud > div');

      const chipStyle = await page.locator('.hud > div').first().evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: Number.parseFloat(style.borderRadius),
          paddingLeft: Number.parseFloat(style.paddingLeft),
        };
      });

      expect(alphaFromCssColor(chipStyle.backgroundColor)).toBeGreaterThan(0.04);
      expect(chipStyle.borderRadius).toBeGreaterThanOrEqual(4);
      expect(chipStyle.paddingLeft).toBeGreaterThanOrEqual(6);
    } finally {
      await context.close();
    }
  }, 15000);

  test('hud and goals show milestone progress counts', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'milestone-progress-copy' }));
    savedState.tier = {
      level: 2,
      label: 'Wheat Rows',
      unlockedCrops: ['carrot', 'wheat'],
      nextMilestone: 'Harvest 20 wheat',
    };
    savedState.stats.lifetimeHarvested.wheat = 7;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.hud-alert');

      const hudObjective = await page.locator('.hud-alert').textContent();
      expect(hudObjective).toContain('Harvest 7/20 wheat');

      await page.click('[data-panel="goals"]');
      await expect.poll(async () => page.locator('#panel-content h2').first().textContent()).toContain('Tier');
      const goalsMilestone = await page.evaluate(() => {
        const nextHeading = Array.from(globalThis.document.querySelectorAll('#panel-content h3'))
          .find((heading) => heading.textContent?.trim() === 'Next milestone');
        return nextHeading?.nextElementSibling?.textContent?.trim() ?? '';
      });

      expect(goalsMilestone).toBe('Harvest 7/20 wheat');
    } finally {
      await context.close();
    }
  }, 15000);

  test('inventory rows have visible item surfaces without overflowing', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.panel-content .row');

      const metrics = await page.locator('.panel-content .row').first().evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: Number.parseFloat(style.borderRadius),
          right: rect.right,
          panelRight: element.closest('.side-panel')?.getBoundingClientRect().right ?? 0,
        };
      });

      expect(alphaFromCssColor(metrics.backgroundColor)).toBeGreaterThan(0.04);
      expect(metrics.borderRadius).toBeGreaterThanOrEqual(4);
      expect(metrics.right).toBeLessThanOrEqual(metrics.panelRight - 8);
    } finally {
      await context.close();
    }
  }, 15000);

  test('side panel tabs stay icon-led at default width', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.panel-tabs button[data-panel]');

      const tabMetrics = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('.panel-tabs button[data-panel]'))
          .map((button) => {
            const text = button.querySelector('.button-text');
            return {
              label: button.getAttribute('aria-label') ?? '',
              textWidth: text?.getBoundingClientRect().width ?? 0,
              iconWidth: button.querySelector('.button-icon')?.getBoundingClientRect().width ?? 0,
            };
          })
      ));

      expect(tabMetrics.every((tab) => tab.label.length > 0)).toBe(true);
      expect(Math.max(...tabMetrics.map((tab) => tab.iconWidth))).toBeGreaterThanOrEqual(18);
      expect(Math.max(...tabMetrics.map((tab) => tab.textWidth))).toBeLessThanOrEqual(1);
    } finally {
      await context.close();
    }
  }, 15000);

  test('icon-only panel tabs expose readable hover labels', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.panel-tabs button[data-panel]');

      await page.hover('[data-panel="inventory"]');

      await expect.poll(async () => page.locator('[data-panel="inventory"]').evaluate((button) => (
        Number.parseFloat(globalThis.getComputedStyle(button, '::after').opacity)
      ))).toBeGreaterThan(0.9);

      const tooltip = await page.locator('[data-panel="inventory"]').evaluate((button) => {
        const style = globalThis.getComputedStyle(button, '::after');
        return {
          content: style.content,
          opacity: Number.parseFloat(style.opacity),
          pointerEvents: style.pointerEvents,
          whiteSpace: style.whiteSpace,
        };
      });

      expect(tooltip.content).toContain('Inventory');
      expect(tooltip.pointerEvents).toBe('none');
      expect(tooltip.whiteSpace).toBe('nowrap');
    } finally {
      await context.close();
    }
  }, 15000);

  test('overflowing side panels advertise scrollable content', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="goals"]');
      await page.waitForSelector('.tier-list');

      const topState = await page.evaluate(() => {
        const panel = globalThis.document.querySelector('.side-panel');
        const content = globalThis.document.querySelector('#panel-content');
        return {
          scrollable: (content?.scrollHeight ?? 0) > (content?.clientHeight ?? 0) + 1,
          canScrollUp: panel?.classList.contains('can-scroll-up') ?? false,
          canScrollDown: panel?.classList.contains('can-scroll-down') ?? false,
        };
      });

      expect(topState.scrollable).toBe(true);
      expect(topState.canScrollUp).toBe(false);
      expect(topState.canScrollDown).toBe(true);

      await page.locator('#panel-content').evaluate((content) => {
        content.scrollTop = content.scrollHeight;
        content.dispatchEvent(new globalThis.Event('scroll'));
      });

      await expect.poll(async () => page.evaluate(() => {
        const panel = globalThis.document.querySelector('.side-panel');
        return {
          canScrollUp: panel?.classList.contains('can-scroll-up') ?? false,
          canScrollDown: panel?.classList.contains('can-scroll-down') ?? false,
        };
      })).toEqual({
        canScrollUp: true,
        canScrollDown: false,
      });
    } finally {
      await context.close();
    }
  }, 15000);

  test('icon-only panel tabs remain clickable through their pixel glyphs', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-panel="goals"] .pixel-icon rect');

      await page.locator('[data-panel="goals"] .pixel-icon rect').first().click();

      await expect.poll(async () => (
        page.locator('#panel-content h2').first().textContent()
      )).toContain('Tier');
    } finally {
      await context.close();
    }
  }, 15000);

  test('inspect panel explains selected farm objects', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="inspect"]');
      await page.locator('canvas').click({ position: { x: 390, y: 300 } });

      await expect.poll(async () => (
        page.locator('#panel-content').textContent()
      )).toContain('Well');
      const text = await page.locator('#panel-content').textContent();
      expect(text).toContain('Water source');
      expect(text).toContain('Workers refill here');
      expect(text).toContain('Blocks movement');
    } finally {
      await context.close();
    }
  }, 15000);

  test('crop mix sliders expose readable action labels', async () => {
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
      ]);
    } finally {
      await context.close();
    }
  }, 15000);

  test('crop mix rows explain seed stock and planting readiness', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'crop-mix-context' }));
    savedState.tier = {
      level: 2,
      label: 'Wheat Rows',
      unlockedCrops: ['carrot', 'wheat'],
      nextMilestone: 'Harvest 20 wheat',
    };
    savedState.cropMix = { carrot: 0.75, wheat: 0.25, tomato: 0 };
    savedState.inventory.seeds = { carrot: 0, wheat: 4, tomato: 0 };
    for (const tile of Object.values(savedState.tiles)) {
      if (tile.kind === 'plot') {
        delete tile.plot;
      }
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="mix"]');
      await page.waitForSelector('.crop-mix');

      const rows = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('.crop-mix'))
          .map((row) => ({
            cropId: row.getAttribute('data-crop-id'),
            status: row.getAttribute('data-crop-status'),
            detail: row.querySelector('.crop-mix-detail')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            right: row.getBoundingClientRect().right,
            panelRight: row.closest('.side-panel')?.getBoundingClientRect().right ?? 0,
          }))
      ));

      const carrot = rows.find((row) => row.cropId === 'carrot');
      const wheat = rows.find((row) => row.cropId === 'wheat');
      const tomato = rows.find((row) => row.cropId === 'tomato');

      expect(carrot).toBeDefined();
      expect(wheat).toBeDefined();
      expect(tomato).toBeDefined();
      expect(carrot?.detail).toContain('Seeds 0');
      expect(carrot?.detail).toContain('No seeds stocked');
      expect(wheat?.status).toBe('ready');
      expect(wheat?.detail).toContain('Seeds 4');
      expect(wheat?.detail).toContain('Seeds 4 - Planted 0 - Ready for workers');
      expect(wheat?.detail).toContain('Ready for workers');
      expect(wheat?.detail).not.toContain('·');
      expect(tomato?.status).toBe('locked');
      expect(tomato?.detail).toContain('Locked until a later tier');
      expect(Math.max(...rows.map((row) => row.right))).toBeLessThanOrEqual(
        Math.min(...rows.map((row) => row.panelRight)) - 8,
      );
    } finally {
      await context.close();
    }
  }, 15000);

  test('goals seed guidance prioritizes the active milestone crop', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'milestone-seed-guidance' }));
    savedState.tier = {
      level: 2,
      label: 'Wheat Rows',
      unlockedCrops: ['carrot', 'wheat'],
      nextMilestone: 'Harvest 20 wheat',
    };
    savedState.cropMix = { carrot: 0.6, wheat: 0.4, tomato: 0 };
    savedState.inventory.seeds = { carrot: 0, wheat: 0, tomato: 0 };
    savedState.coins = 20;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-panel="goals"]');
      await page.waitForSelector('.seed-guidance');

      const actions = await page.evaluate(() => (
        Array.from(globalThis.document.querySelectorAll('[data-seed-guidance-action]'))
          .map((button) => ({
            cropId: button.getAttribute('data-seed-guidance-action'),
            label: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            left: button.getBoundingClientRect().left,
          }))
      ));
      const tipAction = await page.locator('[data-tutorial-tip="buy-needed-seeds"] .tutorial-detail p').first().textContent();

      expect(actions.map((action) => action.cropId)).toEqual(['wheat', 'carrot']);
      expect(actions[0]?.label).toMatch(/Wheat goal 2c/i);
      expect(actions[0]?.left).toBeLessThan(actions[1]?.left ?? Number.POSITIVE_INFINITY);
      expect(tipAction).toMatch(/Wheat goal seed/i);
    } finally {
      await context.close();
    }
  }, 15000);

  test('compact desktop toolbar avoids truncated labels', async () => {
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

      const debugMix = await page.evaluate(() => globalThis.__farmDebug.getState().cropMix);
      expect(Math.round(debugMix.carrot * 100)).toBe(60);
      expect(Math.round(debugMix.wheat * 100)).toBe(40);
      expect(Math.round(debugMix.tomato * 100)).toBe(0);
    } finally {
      await context.close();
    }
  }, 15000);
});
