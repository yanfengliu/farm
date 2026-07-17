import { expect, test } from 'vitest';
import {
  advanceFarm,
  createFarmGame,
  getFarmSnapshot,
  submitFarmCommand,
} from '../../src/game/simulation/farmGame';

export function registerTutorialCropMixCases(getRuntime) {
  test('crop mix tutorial tip stays inside the viewport', async () => {
    const { browser, url } = getRuntime();
    const game = createFarmGame({ seed: 'mix-tip-bounds' });
    for (let i = 0; i < 5000; i += 1) {
      if (getFarmSnapshot(game).stats.lifetimeHarvested.carrot >= 10) break;
      advanceFarm(game, 1);
    }
    submitFarmCommand(game, { type: 'claimNextTier' });
    advanceFarm(game, 1);
    const savedState = getFarmSnapshot(game);
    savedState.inventory.crops = { carrot: 0, wheat: 0, tomato: 0 };

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
      globalThis.localStorage.setItem('farm-tutorial-seen-v1', JSON.stringify({
        'open-request-board': true,
        'accept-first-request': true,
      }));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="open-mix-panel"]');

      const bounds = await page.evaluate(() => {
        const tip = globalThis.document.querySelector('.tutorial-tip');
        const rect = tip?.getBoundingClientRect();
        return {
          left: rect?.left ?? -1,
          right: rect?.right ?? -1,
          top: rect?.top ?? -1,
          bottom: rect?.bottom ?? -1,
          width: globalThis.innerWidth,
          height: globalThis.innerHeight,
        };
      });

      expect(bounds.left).toBeGreaterThanOrEqual(8);
      expect(bounds.top).toBeGreaterThanOrEqual(8);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width - 8);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height - 8);
    } finally {
      await context.close();
    }
  }, 20000);

  test('opening crop mix before its guide appears prevents a stale crop mix tip', async () => {
    const { browser, url } = getRuntime();
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'mix-seen-through-use' }));
    savedState.tier = {
      level: 2,
      label: 'Wheat Rows',
      unlockedCrops: ['carrot', 'wheat'],
      nextMilestone: 'Harvest 20 wheat',
    };
    savedState.cropMix = { carrot: 0.75, wheat: 0.25, tomato: 0 };
    savedState.inventory.crops = { carrot: 2, wheat: 0, tomato: 0 };
    savedState.inventory.seeds = { carrot: 0, wheat: 4, tomato: 0 };

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="sell-first-crop"]');

      await page.click('[data-panel="mix"]');
      await page.waitForSelector('.crop-mix[data-crop-id="wheat"]');
      await page.click('[data-panel="inventory"]');
      await page.click('[data-command="sell-all"]');
      await page.waitForTimeout(350);

      const visibleTip = await page.locator('.tutorial-tip').evaluateAll((tips) => (
        tips.map((tip) => ({
          id: tip.getAttribute('data-tutorial-tip'),
          text: tip.textContent ?? '',
        }))
      ));

      expect(visibleTip.some((tip) => tip.id === 'open-mix-panel')).toBe(false);
      expect(visibleTip.some((tip) => tip.text.includes('Tune Crop Mix'))).toBe(false);
    } finally {
      await context.close();
    }
  }, 30000);

  test('tomato unlock nudges players back to crop mix after the wheat mix guide was seen', async () => {
    const { browser, url } = getRuntime();
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'tomato-mix-guide' }));
    savedState.tier = {
      level: 3,
      label: 'Tomato Rows',
      unlockedCrops: ['carrot', 'wheat', 'tomato'],
      nextMilestone: 'Keep expanding the farm',
    };
    savedState.cropMix = { carrot: 0.6, wheat: 0.25, tomato: 0.15 };
    savedState.inventory.crops = { carrot: 0, wheat: 0, tomato: 0 };
    savedState.inventory.seeds = { carrot: 1, wheat: 1, tomato: 4 };
    const emptyLand = Object.values(savedState.tiles).find((tile) => tile.kind === 'empty');
    if (emptyLand) {
      emptyLand.kind = 'plot';
      emptyLand.plot = null;
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
      globalThis.localStorage.setItem('farm-tutorial-seen-v1', JSON.stringify({
        'open-mix-panel': true,
        'open-request-board': true,
        'accept-first-request': true,
      }));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.tutorial-tip[data-tutorial-tip="open-mix-for-tomatoes"]');

      const tip = await page.locator('.tutorial-tip').evaluate((element) => ({
        title: element.querySelector('.tutorial-title')?.textContent?.trim() ?? '',
        summary: element.querySelector('.tutorial-summary')?.textContent?.trim() ?? '',
        action: element.querySelector('.tutorial-detail p')?.textContent?.trim() ?? '',
      }));

      expect(tip.title).toBe('Add Tomatoes To Mix');
      expect(tip.summary).toMatch(/Tomatoes are unlocked/i);
      expect(tip.action).toMatch(/Crop Mix/i);
    } finally {
      await context.close();
    }
  }, 30000);
}
