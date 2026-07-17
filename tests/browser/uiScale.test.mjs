import { chromium } from '@playwright/test';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

let server;
let browser;
let url;

describe('desktop UI scale', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-ui-scale-test',
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

  test('toolbar buttons and icons are readable at desktop size', async () => {
    const savedState = getFarmSnapshot(createFarmGame({ seed: 'scaled-ui-guide' }));
    savedState.inventory.seeds = { carrot: 0, wheat: 0, tomato: 0 };
    savedState.coins = savedState.crops.carrot.seedPrice * 2;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, savedState);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('.toolbar .tool-button');
      await page.waitForSelector('.tutorial-tip');

      const metrics = await page.evaluate(() => {
        const buttons = Array.from(globalThis.document.querySelectorAll('.toolbar .tool-button'));
        const icons = Array.from(globalThis.document.querySelectorAll('.toolbar .button-icon'));
        const toolbarLabel = globalThis.document.querySelector('.toolbar .label');
        const toolbarKey = globalThis.document.querySelector('.toolbar .key');
        const hudValue = globalThis.document.querySelector('.hud span');
        const panelRow = globalThis.document.querySelector('.panel-content .row');
        const tutorialParagraph = globalThis.document.querySelector('.tutorial-tip p');
        return {
          minButtonHeight: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
          maxButtonWidth: Math.max(...buttons.map((button) => button.getBoundingClientRect().width)),
          minIconWidth: Math.min(...icons.map((icon) => icon.getBoundingClientRect().width)),
          maxToolbarHeight: globalThis.document.querySelector('.toolbar')?.getBoundingClientRect().height ?? 0,
          toolbarLabelFont: Number.parseFloat(globalThis.getComputedStyle(toolbarLabel).fontSize),
          toolbarKeyFont: Number.parseFloat(globalThis.getComputedStyle(toolbarKey).fontSize),
          hudValueFont: Number.parseFloat(globalThis.getComputedStyle(hudValue).fontSize),
          panelRowFont: Number.parseFloat(globalThis.getComputedStyle(panelRow).fontSize),
          tutorialParagraphFont: Number.parseFloat(globalThis.getComputedStyle(tutorialParagraph).fontSize),
          horizontalOverflow: Math.max(0, globalThis.document.documentElement.scrollWidth - globalThis.innerWidth),
        };
      });

      expect(metrics.minButtonHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.maxButtonWidth).toBeLessThanOrEqual(96);
      expect(metrics.minIconWidth).toBeGreaterThanOrEqual(20);
      expect(metrics.maxToolbarHeight).toBeLessThanOrEqual(72);
      expect(metrics.toolbarLabelFont).toBeGreaterThanOrEqual(12);
      expect(metrics.toolbarKeyFont).toBeGreaterThanOrEqual(11);
      expect(metrics.hudValueFont).toBeGreaterThanOrEqual(14);
      expect(metrics.panelRowFont).toBeGreaterThanOrEqual(15);
      expect(metrics.tutorialParagraphFont).toBeGreaterThanOrEqual(13);
      expect(metrics.horizontalOverflow).toBe(0);
    } finally {
      await context.close();
    }
  }, 30000);
});
