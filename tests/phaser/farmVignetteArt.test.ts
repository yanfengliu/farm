import { describe, expect, test } from 'vitest';
import { drawBeeSkeps, drawHayBales, drawScarecrow } from '../../src/phaser/view/farmEnvironment';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type VignetteGraphics = Parameters<typeof drawHayBales>[0];

function record(draw: (graphics: VignetteGraphics) => void): RecordedFill[] {
  const fills: RecordedFill[] = [];
  let color = 0;
  let alpha = 1;
  const graphics = {
    fillStyle(nextColor: number, nextAlpha = 1) {
      color = nextColor;
      alpha = nextAlpha;
      return graphics;
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ color, alpha, x, y, width, height });
      return graphics;
    },
  };
  draw(graphics as unknown as VignetteGraphics);
  return fills;
}

function opaque(fills: RecordedFill[]): RecordedFill[] {
  return fills.filter((fill) => fill.alpha >= 0.9);
}

function occupiedPixels(fills: RecordedFill[]): Set<string> {
  const pixels = new Set<string>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) pixels.add(`${x},${y}`);
    }
  }
  return pixels;
}

function rowProfiles(fills: RecordedFill[]): Array<{ left: number; right: number; width: number }> {
  const rows = new Map<number, { left: number; right: number }>();
  for (const pixel of occupiedPixels(fills)) {
    const [x, y] = pixel.split(',').map(Number);
    const row = rows.get(y) ?? { left: x, right: x };
    row.left = Math.min(row.left, x);
    row.right = Math.max(row.right, x);
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => ({ left: row.left, right: row.right, width: row.right - row.left + 1 }));
}

function longestRepeatedWidthRun(rows: Array<{ width: number }>): number {
  let longest = 1;
  let run = 1;
  for (let index = 1; index < rows.length; index += 1) {
    run = rows[index]!.width === rows[index - 1]!.width ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

function shadowSegments(fills: RecordedFill[]): number {
  return fills.filter((fill) => fill.alpha < 0.9).length;
}

const VIGNETTES = [
  { name: 'hay bales', draw: (g: VignetteGraphics) => drawHayBales(g, 0, 0) },
  { name: 'scarecrow', draw: (g: VignetteGraphics) => drawScarecrow(g, 0, 0) },
  { name: 'bee skeps', draw: (g: VignetteGraphics) => drawBeeSkeps(g, 0, 0) },
];

// The composited authored object must not read as stacked solid rectangles:
// varied row widths and edges, negative space inside the bounding box, several
// material colors, and a broken ground shadow. Same grammar the stones,
// smoke, and plants already satisfy - pinned here after a player pinned
// "What is this?" on the hay bales.
describe.each(VIGNETTES)('southern meadow vignette pixel grammar: $name', ({ draw }) => {
  test('composite keeps an organic silhouette instead of a solid block', () => {
    const fills = record(draw);
    const body = opaque(fills);
    const rows = rowProfiles(body);
    const pixels = occupiedPixels(body);
    const widths = new Set(rows.map((row) => row.width));
    const lefts = new Set(rows.map((row) => row.left));
    const rights = new Set(rows.map((row) => row.right));
    const widest = Math.max(...rows.map((row) => row.width));

    expect(new Set(body.map((fill) => fill.color)).size).toBeGreaterThanOrEqual(4);
    expect(widths.size).toBeGreaterThanOrEqual(3);
    expect(lefts.size).toBeGreaterThanOrEqual(2);
    expect(rights.size).toBeGreaterThanOrEqual(2);
    expect(longestRepeatedWidthRun(rows)).toBeLessThanOrEqual(4);
    expect(pixels.size / (widest * rows.length)).toBeLessThanOrEqual(0.9);
    expect(shadowSegments(fills)).toBeGreaterThanOrEqual(2);
  });

  test('composite is deterministic', () => {
    expect(record(draw)).toEqual(record(draw));
  });
});
