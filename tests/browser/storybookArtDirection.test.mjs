import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { CROPS } from '../../src/game/content/crops';
import { FARM_TIERS } from '../../src/game/content/tiers';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { exponentialApproach, pingPong } from '../../src/phaser/view/farmMotionMath';
import { buildFarmSceneryLayout } from '../../src/phaser/view/farmSceneryLayout';
import {
  CREEK_HABITAT_IDS,
  TREE_SHELTER_IDS,
  wildlifeTravelProgressPerTick,
} from '../../src/game/content/wildlife';
import { duckWorldPosition, wildlifeNodeWorldPosition } from '../../src/phaser/view/farmWildlifeArt';

let server;
let browser;
let url;

const STORYBOOK_PALETTE = {
  canopy: [
    [29, 65, 51],
    [31, 70, 53],
    [36, 74, 52],
    [36, 74, 54],
    [40, 84, 61],
    [46, 91, 62],
  ],
  sunLeaf: [
    [143, 186, 103],
    [145, 185, 102],
    [155, 194, 110],
    [180, 213, 125],
    [131, 173, 94],
    [121, 168, 90],
  ],
  duck: [243, 205, 103],
  linen: [238, 215, 192],
  hay: [218, 171, 72],
  festival: [110, 182, 173],
  duckCream: [240, 225, 183],
};

function fullyExpandedFarmState() {
  const state = getFarmSnapshot(createFarmGame({ seed: 'storybook-full-expansion' }));
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) state.tiles[`${x},${y}`] ??= { x, y, kind: 'empty' };
  }
  return state;
}

function clusteredTierFourState() {
  const state = getFarmSnapshot(createFarmGame({ seed: 'storybook-worker-cluster' }));
  state.tier = FARM_TIERS[4];
  const cropIds = ['carrot', 'wheat', 'tomato', 'pumpkin'];
  for (let index = 0; index < cropIds.length; index += 1) {
    const cropId = cropIds[index];
    const tile = state.tiles[`${2 + index},2`];
    if (!tile) continue;
    tile.kind = 'plot';
    tile.plot = {
      cropId,
      growth: CROPS[cropId].growTicks,
      water: CROPS[cropId].waterTicks,
    };
  }
  state.workers = [1, 2, 3, 4].map((id) => ({
    id,
    x: 4,
    y: 4,
    task: { kind: 'idle', path: [], progress: 0 },
  }));
  return state;
}

function ecologyShowcaseState() {
  const state = getFarmSnapshot(createFarmGame({ seed: 'storybook-ecology' }));
  Object.assign(state.wildlife.ducks[0], {
    node: 'tree-shelter-elder',
    targetNode: null,
    targetFishId: null,
    travelProgress: 0,
    activity: 'sleeping',
    activityTicks: 0,
    hunger: 12,
    energy: 30,
  });
  Object.assign(state.wildlife.ducks[1], {
    node: 'creek-mid-south',
    targetNode: null,
    targetFishId: null,
    travelProgress: 0,
    activity: 'eating',
    activityTicks: 120,
    hunger: 0,
    energy: 80,
  });
  return state;
}

async function openFreshPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => globalThis.localStorage.clear());
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#game-canvas canvas').waitFor();
  return { context, page };
}

async function paletteCounts(page) {
  return page.locator('#game-canvas canvas').evaluate((element, palette) => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    const counts = Object.fromEntries(Object.keys(palette).map((key) => [key, 0]));
    for (let index = 0; index < pixels.length; index += 4) {
      for (const [key, target] of Object.entries(palette)) {
        const targets = Array.isArray(target[0]) ? target : [target];
        if (targets.some((color) => (
          Math.abs(pixels[index] - color[0]) <= 3 &&
          Math.abs(pixels[index + 1] - color[1]) <= 3 &&
          Math.abs(pixels[index + 2] - color[2]) <= 3
        ))) counts[key] += 1;
      }
    }
    return counts;
  }, STORYBOOK_PALETTE);
}

async function paletteCountInWorldRect(page, target, worldRect, frame, tolerance = 3) {
  return (await paletteSignatureInWorldRect(page, target, worldRect, frame, tolerance)).count;
}

async function paletteSignatureInWorldRect(page, target, worldRect, frame, tolerance = 3) {
  return page.locator('#game-canvas canvas').evaluate((element, args) => {
    const frameWidth = args.frame.right - args.frame.left;
    const frameHeight = args.frame.bottom - args.frame.top;
    const zoom = Math.max(0.78, Math.min(
      2,
      element.width / (frameWidth + 32),
      element.height / (frameHeight + 32),
    ));
    const centerX = (args.frame.left + args.frame.right) / 2;
    const centerY = (args.frame.top + args.frame.bottom) / 2;
    const left = Math.max(0, Math.floor(element.width / 2 + (args.worldRect.left - centerX) * zoom));
    const right = Math.min(element.width, Math.ceil(element.width / 2 + (args.worldRect.right - centerX) * zoom));
    const top = Math.max(0, Math.floor(element.height / 2 + (args.worldRect.top - centerY) * zoom));
    const bottom = Math.min(element.height, Math.ceil(element.height / 2 + (args.worldRect.bottom - centerY) * zoom));
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    const targets = Array.isArray(args.target[0]) ? args.target : [args.target];
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * element.width + x) * 4;
        if (targets.some((color) => (
          Math.abs(pixels[index] - color[0]) <= args.tolerance &&
          Math.abs(pixels[index + 1] - color[1]) <= args.tolerance &&
          Math.abs(pixels[index + 2] - color[2]) <= args.tolerance
        ))) {
          count += 1;
          sumX += x;
          sumY += y;
        }
      }
    }
    return { count, sumX, sumY };
  }, { target, worldRect, frame, tolerance });
}

async function paletteSignature(page, target) {
  return page.locator('#game-canvas canvas').evaluate((element, color) => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < element.height; y += 1) {
      for (let x = 0; x < element.width; x += 1) {
        const index = (y * element.width + x) * 4;
        if (
          Math.abs(pixels[index] - color[0]) <= 3 &&
          Math.abs(pixels[index + 1] - color[1]) <= 3 &&
          Math.abs(pixels[index + 2] - color[2]) <= 3
        ) {
          count += 1;
          sumX += x;
          sumY += y;
        }
      }
    }
    return { count, sumX, sumY };
  }, target);
}

describe('storybook pixel art direction', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-storybook-art-test',
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

  test('keeps looping ambience continuous and worker easing independent of frame partitioning', () => {
    const route = Array.from({ length: 243 }, (_, tick) => pingPong(tick * 2, 240));
    for (let index = 1; index < route.length; index += 1) {
      expect(Math.abs(route[index] - route[index - 1])).toBeLessThanOrEqual(2);
    }

    const combined = exponentialApproach(200, 42);
    const half = exponentialApproach(100, 42);
    expect(combined).toBeCloseTo(1 - (1 - half) ** 2, 12);
  });

  test('keeps every duck habitat route below a cozy per-tick pixel step', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'storybook-duck-travel' }));
    const duck = state.wildlife.ducks[0];
    const nodes = [...CREEK_HABITAT_IDS, ...TREE_SHELTER_IDS];
    let largestStep = 0;
    for (const from of nodes) {
      for (const to of nodes) {
        if (from === to) continue;
        Object.assign(duck, { node: from, targetNode: to });
        const progressStep = wildlifeTravelProgressPerTick(from, to);
        let previous = null;
        for (let progress = 0; progress <= 100; progress += progressStep) {
          duck.travelProgress = progress;
          const current = duckWorldPosition(state, 32, duck);
          if (previous) largestStep = Math.max(largestStep, Math.hypot(current.x - previous.x, current.y - previous.y));
          previous = current;
        }
      }
    }
    expect(largestStep).toBeLessThanOrEqual(6);
  });

  test('splits deterministic scenery, waterside, ambience, workers, and interaction art into focused layers', async () => {
    const [renderer, environment, waterside, ambience, wildlife, workers] = await Promise.all([
      readFile('src/phaser/view/farmRenderer.ts', 'utf8'),
      readFile('src/phaser/view/farmEnvironment.ts', 'utf8'),
      readFile('src/phaser/view/farmWaterside.ts', 'utf8'),
      readFile('src/phaser/view/farmAmbience.ts', 'utf8'),
      readFile('src/phaser/view/farmWildlifeArt.ts', 'utf8'),
      readFile('src/phaser/view/farmWorkerArt.ts', 'utf8'),
    ]);

    expect(renderer).toContain("scene.add.graphics().setDepth(50)");
    expect(renderer).toContain('drawFarmOverstory');
    expect(renderer).toContain('drawFarmAmbience');
    expect(renderer).toContain('drawFarmhand');
    expect(renderer).toContain('state.tier.level');
    expect(environment).toContain('drawCottageGarden');
    expect(environment).toContain('drawSouthernMeadowStory');
    expect(environment).toContain('drawPerchedCrow');
    expect(environment).toContain('drawTierFlourishes');
    expect(waterside).toContain('creekCenterX');
    expect(waterside).toContain('FARM_ENVIRONMENT_MARGIN_TILES');
    expect(ambience).toContain('drawFarmWildlife');
    expect(ambience).toContain('drawButterflies');
    expect(ambience).not.toContain('Math.random');
    expect(wildlife).toContain("duck.activity === 'sleeping'");
    expect(wildlife).toContain("duck.activity === 'foraging'");
    expect(wildlife).toContain('state.wildlife.fish');
    expect(wildlife).not.toContain('Math.random');
    expect(workers).toContain("worker.task.kind === 'watering'");
    expect(workers).toContain('worker.cargo?.cropId');
  });

  test.each([
    { width: 1280, height: 800 },
    { width: 1024, height: 720 },
  ])('frames the farm with layered canopy and visible creek wildlife at $width x $height', async (viewport) => {
    const { context, page } = await openFreshPage(viewport);
    try {
      const counts = await paletteCounts(page);
      expect(counts.canopy).toBeGreaterThan(120);
      expect(counts.sunLeaf).toBeGreaterThan(24);
      expect(counts.duck).toBeGreaterThan(4);
      expect(counts.hay).toBeGreaterThan(20);
    } finally {
      await context.close();
    }
  }, 30000);

  test('adds readable cottage-garden linen details to the wide farm frame', async () => {
    const { context, page } = await openFreshPage({ width: 1280, height: 800 });
    try {
      const counts = await paletteCounts(page);
      expect(counts.linen).toBeGreaterThan(10);
    } finally {
      await context.close();
    }
  }, 30000);

  test('grows the cottage edge into a harvest-festival vignette at Tier 4', async () => {
    const early = await openFreshPage({ width: 1280, height: 800 });
    const lateContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await lateContext.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, clusteredTierFourState());
    const latePage = await lateContext.newPage();
    try {
      await latePage.goto(url, { waitUntil: 'networkidle' });
      await latePage.locator('#game-canvas canvas').waitFor();
      const earlyCounts = await paletteCounts(early.page);
      const lateCounts = await paletteCounts(latePage);
      expect(earlyCounts.festival).toBeLessThan(3);
      expect(lateCounts.festival).toBeGreaterThan(20);
    } finally {
      await early.context.close();
      await lateContext.close();
    }
  }, 30000);

  test('replaces the southern meadow story with playable ground as land becomes owned', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, fullyExpandedFarmState());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('#game-canvas canvas').waitFor();
      const counts = await paletteCounts(page);
      const layout = buildFarmSceneryLayout(12, 10, 32);
      const canopyInsideFarm = await paletteCountInWorldRect(page, STORYBOOK_PALETTE.canopy, layout.farm, layout.frame);
      expect(counts.hay).toBeLessThan(5);
      expect(counts.linen).toBeGreaterThan(10);
      expect(canopyInsideFarm).toBeLessThan(5);
    } finally {
      await context.close();
    }
  }, 30000);

  test('pauses duck decisions with the farm instead of running a separate visual-only route', async () => {
    const { context, page } = await openFreshPage({ width: 1280, height: 800 });
    try {
      await page.click('[data-command="pause"]');
      const firstState = await page.evaluate(() => window.__farmDebug.getState().wildlife);
      const duckCentroid = () => page.locator('#game-canvas canvas').evaluate((element, target) => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        let count = 0;
        let totalX = 0;
        let totalY = 0;
        for (let y = 0; y < element.height; y += 1) {
          for (let x = 0; x < element.width * 0.24; x += 1) {
            const index = (y * element.width + x) * 4;
            if (
              Math.abs(pixels[index] - target[0]) <= 3 &&
              Math.abs(pixels[index + 1] - target[1]) <= 3 &&
              Math.abs(pixels[index + 2] - target[2]) <= 3
            ) {
              count += 1;
              totalX += x;
              totalY += y;
            }
          }
        }
        return { count, x: totalX / Math.max(1, count), y: totalY / Math.max(1, count) };
      }, STORYBOOK_PALETTE.duck);

      const first = await duckCentroid();
      await page.waitForTimeout(700);
      const second = await duckCentroid();
      const secondState = await page.evaluate(() => window.__farmDebug.getState().wildlife);
      expect(first.count).toBeGreaterThan(4);
      expect(second.count).toBeGreaterThan(4);
      expect(secondState).toEqual(firstState);
      expect(second).toEqual(first);
    } finally {
      await context.close();
    }
  }, 30000);

  test.each([
    { width: 1280, height: 800 },
    { width: 1024, height: 720 },
  ])('shows one duck sleeping under a tree while its companion fishes at $width x $height', async (viewport) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const state = ecologyShowcaseState();
    await context.addInitScript((saved) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(saved));
    }, state);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('#game-canvas canvas').waitFor();
      await page.click('[data-command="pause"]');
      const frame = buildFarmSceneryLayout(state.width, state.height, 32).frame;
      const shelter = wildlifeNodeWorldPosition(state, 32, 'tree-shelter-elder', 1);
      const fishing = wildlifeNodeWorldPosition(state, 32, 'creek-mid-south', 2);
      const sleepingPixels = await paletteCountInWorldRect(page, STORYBOOK_PALETTE.duck, {
        left: shelter.x - 14, top: shelter.y - 14, right: shelter.x + 14, bottom: shelter.y + 14,
      }, frame);
      const fishingPixels = await paletteCountInWorldRect(page, STORYBOOK_PALETTE.duckCream, {
        left: fishing.x - 14, top: fishing.y - 14, right: fishing.x + 14, bottom: fishing.y + 14,
      }, frame);
      expect(sleepingPixels).toBeGreaterThan(4);
      expect(fishingPixels).toBeGreaterThan(4);
    } finally {
      await context.close();
    }
  }, 30000);

  test('freezes farmhand poses while paused even as the meadow ambience continues', async () => {
    const { context, page } = await openFreshPage({ width: 1280, height: 800 });
    try {
      await expect.poll(() => page.evaluate(() => (
        window.__farmDebug.getState().workers.some((worker) => worker.task.path.length > 0)
      )), { timeout: 5000 }).toBe(true);
      await page.click('[data-command="pause"]');
      await page.waitForTimeout(700);
      const samples = [await paletteSignature(page, [79, 134, 166])];
      for (let index = 0; index < 2; index += 1) {
        await page.waitForTimeout(500);
        samples.push(await paletteSignature(page, [79, 134, 166]));
      }
      expect(samples[0].count).toBeGreaterThan(10);
      expect(samples[1]).toEqual(samples[0]);
      expect(samples[2]).toEqual(samples[0]);
    } finally {
      await context.close();
    }
  }, 30000);

  test.each([
    { width: 1280, height: 800 },
    { width: 1024, height: 720 },
  ])('keeps a mature Tier 4 crop mix and all four converged farmhands readable at $width x $height', async (viewport) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript((state) => {
      globalThis.localStorage.clear();
      globalThis.localStorage.setItem('farm.autosave.v1', JSON.stringify(state));
    }, clusteredTierFourState());
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.click('[data-command="pause"]');
      await page.waitForTimeout(300);
      const colors = [[79, 134, 166], [182, 93, 82], [102, 140, 85], [139, 104, 160]];
      const layout = buildFarmSceneryLayout(12, 10, 32);
      const cropChecks = [
        { cropId: 'carrot', x: 2, color: [[232, 117, 45], [185, 93, 43], [255, 180, 92]] },
        { cropId: 'wheat', x: 3, color: [[184, 134, 56], [229, 185, 79], [255, 223, 121]] },
        { cropId: 'tomato', x: 4, color: [[217, 75, 63], [130, 59, 50], [255, 123, 100]] },
        { cropId: 'pumpkin', x: 5, color: [[232, 117, 45], [169, 68, 36], [245, 164, 71], [141, 59, 37]] },
      ];
      const planted = await page.evaluate((checks) => checks.map(({ x }) => (
        window.__farmDebug.getState().tiles[`${x},2`]?.plot?.cropId ?? null
      )), cropChecks);
      expect(planted).toEqual(cropChecks.map(({ cropId }) => cropId));
      for (const { cropId, x, color } of cropChecks) {
        const count = await paletteCountInWorldRect(
          page,
          color,
          { left: x * 32, top: 2 * 32, right: (x + 1) * 32, bottom: 3 * 32 },
          layout.frame,
          10,
        );
        expect(count, `${cropId} mature palette`).toBeGreaterThan(2);
      }
      const workerRect = { left: 4 * 32 - 24, top: 4 * 32 - 30, right: 5 * 32 + 24, bottom: 5 * 32 + 30 };
      const signatures = await Promise.all(
        colors.map((color) => paletteSignatureInWorldRect(page, color, workerRect, layout.frame)),
      );
      for (const signature of signatures) expect(signature.count).toBeGreaterThan(10);
      const centers = signatures.map((signature) => ({
        x: signature.sumX / signature.count,
        y: signature.sumY / signature.count,
      }));
      for (let left = 0; left < centers.length; left += 1) {
        for (let right = left + 1; right < centers.length; right += 1) {
          expect(Math.hypot(centers[left].x - centers[right].x, centers[left].y - centers[right].y)).toBeGreaterThan(14);
        }
      }
    } finally {
      await context.close();
    }
  }, 30000);
});
