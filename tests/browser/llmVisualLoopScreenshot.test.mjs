import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  screenshotLooksCompositorCorrupt,
  screenshotPixelMetrics,
  selectStableCapture,
} from '../../scripts/llm-visual-loop/browser-observation.mjs';

// Ratios as a 1280x800 observation frame would report them.
function frame({ blackPixels = 0, longestRow = 0, longestColumn = 0 }) {
  return {
    exactBlackRatio: blackPixels / (1280 * 800),
    longestBlackRowRatio: longestRow / 1280,
    longestBlackColumnRatio: longestColumn / 800,
  };
}

describe('compositor corruption detection', () => {
  test('flags pure-black bands that span the frame but cover little of it', () => {
    // A band across the full width is the corruption this guard exists for, and
    // it covers only 0.37% of the frame. Gating the run-length signal behind a
    // coverage floor discarded exactly this case.
    expect(screenshotLooksCompositorCorrupt(frame({ blackPixels: 1280 * 3, longestRow: 1280, longestColumn: 3 }))).toBe(true);
    expect(screenshotLooksCompositorCorrupt(frame({ blackPixels: 800, longestRow: 1, longestColumn: 800 }))).toBe(true);
    expect(screenshotLooksCompositorCorrupt(frame({ blackPixels: 400 * 10, longestRow: 400, longestColumn: 10 }))).toBe(true);
  });

  test('flags an isolated black tile on coverage alone', () => {
    expect(screenshotLooksCompositorCorrupt(frame({ blackPixels: 64 * 64, longestRow: 64, longestColumn: 64 }))).toBe(true);
    expect(screenshotLooksCompositorCorrupt(frame({ blackPixels: 256 * 256, longestRow: 256, longestColumn: 256 }))).toBe(true);
  });

  test('leaves a frame with no opaque black alone', () => {
    // Every recorded farm frame measures exactly zero; the farm authors no pure black.
    expect(screenshotLooksCompositorCorrupt(frame({}))).toBe(false);
    expect(screenshotLooksCompositorCorrupt(frame({ blackPixels: 300, longestRow: 30, longestColumn: 10 }))).toBe(false);
  });
});

describe('stable capture selection', () => {
  const corrupt = frame({ blackPixels: 400 * 400, longestRow: 400, longestColumn: 400 });
  const clean = frame({});

  test('retries the whole attempt and returns the first clean observe-and-shoot pair', async () => {
    const pairs = [
      { observation: { tick: 1 }, buffer: Buffer.from('black-1') },
      { observation: { tick: 2 }, buffer: Buffer.from('black-2') },
      { observation: { tick: 3 }, buffer: Buffer.from('clean') },
    ];
    const metrics = [corrupt, corrupt, clean];
    let index = 0;
    let settleCount = 0;

    const result = await selectStableCapture({
      attempt: async () => pairs[index],
      inspect: async () => metrics[index++],
      settle: async () => { settleCount += 1; },
    });

    // The accepted screenshot must carry the DOM sample from its own attempt,
    // never a stale one from an earlier frame.
    expect(result.value).toEqual(pairs[2]);
    expect(result.attempts).toBe(3);
    expect(result.degraded).toBe(false);
    expect(settleCount).toBe(2);
  });

  test('reports the least-corrupt frame as degraded rather than throwing the run away', async () => {
    const worse = frame({ blackPixels: 900 * 700, longestRow: 900, longestColumn: 700 });
    const better = frame({ blackPixels: 300 * 300, longestRow: 300, longestColumn: 300 });
    const pairs = [
      { observation: { tick: 1 }, buffer: Buffer.from('worst') },
      { observation: { tick: 2 }, buffer: Buffer.from('least-bad') },
      { observation: { tick: 3 }, buffer: Buffer.from('worse-again') },
    ];
    const metrics = [worse, better, worse];
    let index = 0;

    const result = await selectStableCapture({
      maxAttempts: 3,
      attempt: async () => pairs[index],
      inspect: async () => metrics[index++],
      settle: async () => {},
    });

    expect(result.degraded).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.value).toEqual(pairs[1]);
    expect(result.metrics).toEqual(better);
  });

  test('accepts a clean first attempt without settling', async () => {
    let settleCount = 0;
    const result = await selectStableCapture({
      attempt: async () => ({ observation: {}, buffer: Buffer.from('clean') }),
      inspect: async () => clean,
      settle: async () => { settleCount += 1; },
    });

    expect(result.attempts).toBe(1);
    expect(result.degraded).toBe(false);
    expect(settleCount).toBe(0);
  });
});

describe('screenshot pixel inspection', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 120, height: 800 }, deviceScaleFactor: 1 });
  });

  afterAll(async () => {
    await browser?.close();
  });

  test('measures pure-black coverage on real Playwright PNG bytes', async () => {
    await page.setContent('<style>html,body{margin:0;width:100%;height:100%;background:#000}</style>');
    const black = await screenshotPixelMetrics(page, await page.screenshot());
    expect(black).toMatchObject({ width: 120, height: 800 });
    expect(black.exactBlackRatio).toBeGreaterThan(0.99);
    expect(black.longestBlackRowRatio).toBe(1);
    expect(black.longestBlackColumnRatio).toBe(1);

    // The farm's actual Phaser clear color must never read as corruption.
    await page.setContent('<style>html,body{margin:0;width:100%;height:100%;background:#3f5f32}</style>');
    const meadow = await screenshotPixelMetrics(page, await page.screenshot());
    expect(meadow.exactBlackPixels).toBe(0);
    expect(screenshotLooksCompositorCorrupt(meadow)).toBe(false);
  });

  test('measures the longest unbroken run, not the total per column', async () => {
    // Two 80px-tall black segments in one column, separated by a gap. The longest
    // run is 80 (0.1 of height), not their 160px sum -- a column accumulator that
    // fails to reset across the gap reports 0.2 and passes every degenerate frame.
    await page.setContent(`<style>
      html,body{margin:0;width:120px;height:800px;background:#3f5f32}
      .b{position:absolute;left:10px;width:4px;background:#000}
    </style>
    <div class="b" style="top:10px;height:80px"></div>
    <div class="b" style="top:200px;height:80px"></div>`);
    const gapped = await screenshotPixelMetrics(page, await page.screenshot());

    expect(gapped.exactBlackPixels).toBe(2 * 4 * 80);
    expect(gapped.longestBlackColumnRatio).toBeCloseTo(80 / 800, 5);
    expect(gapped.longestBlackRowRatio).toBeCloseTo(4 / 120, 5);
  });
});
