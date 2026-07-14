import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import {
  drawFarmEnvironment,
  drawMeadowRock,
  drawSouthPathStone,
  drawSteppingStone,
} from '../../src/phaser/view/farmEnvironment';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type StoneGraphics = Parameters<typeof drawMeadowRock>[0];

interface ProductionStoneCase {
  name: string;
  variants: readonly number[];
  silhouetteVariants: readonly number[];
  draw: (graphics: StoneGraphics, variant: number) => void;
}

const PRODUCTION_STONES: ProductionStoneCase[] = [
  {
    name: 'meadow rock',
    variants: [0, 1, 2, 3, 4, 5],
    silhouetteVariants: [0, 1, 2, 3, 4, 5],
    // Meadow rocks derive their variant from x + y, so moving x selects the authored mask.
    draw: (graphics, variant) => drawMeadowRock(graphics, 10 + variant, 20),
  },
  {
    name: 'cottage stepping stone',
    variants: [0, 1, 2, 3, 4, 5, 6],
    silhouetteVariants: [0, 1, 2, 3, 4, 5],
    draw: (graphics, variant) => drawSteppingStone(graphics, 10, 20, variant),
  },
  {
    name: 'south path stone',
    variants: [6, 7, 8, 9],
    silhouetteVariants: [6, 7, 8, 9],
    draw: (graphics, variant) => drawSouthPathStone(graphics, 10, 20, variant),
  },
];

function record(draw: (graphics: StoneGraphics) => void): RecordedFill[] {
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
  draw(graphics as unknown as StoneGraphics);
  return fills;
}

function isOpaqueStonePixel(fill: RecordedFill): boolean {
  const red = (fill.color >> 16) & 0xff;
  const green = (fill.color >> 8) & 0xff;
  const blue = fill.color & 0xff;
  return fill.alpha >= 0.75 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 55;
}

function stoneRowProfiles(fills: RecordedFill[]): Array<{ left: number; right: number; width: number }> {
  const occupied = new Set<string>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) occupied.add(`${x},${y}`);
    }
  }
  const rows = new Map<number, number[]>();
  for (const pixel of occupied) {
    const [x = 0, y = 0] = pixel.split(',').map(Number);
    rows.set(y, [...(rows.get(y) ?? []), x]);
  }
  return [...rows.entries()]
    .sort(([leftY], [rightY]) => leftY - rightY)
    .map(([, xs]) => {
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      return { left, right, width: right - left + 1 };
    });
}

function longestRepeatedWidthRun(rows: Array<{ width: number }>): number {
  let longest = 0;
  let current = 0;
  let previous: number | undefined;
  for (const row of rows) {
    current = row.width === previous ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = row.width;
  }
  return longest;
}

function normalizedOpaquePixels(fills: RecordedFill[]): Set<string> {
  const pixels: Array<{ x: number; y: number }> = [];
  for (const fill of fills.filter((candidate) => candidate.alpha >= 0.75)) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) pixels.push({ x, y });
    }
  }
  const left = Math.min(...pixels.map(({ x }) => x));
  const top = Math.min(...pixels.map(({ y }) => y));
  return new Set(pixels.map(({ x, y }) => `${x - left},${y - top}`));
}

function silhouetteDifference(left: Set<string>, right: Set<string>): number {
  let difference = 0;
  for (const pixel of left) if (!right.has(pixel)) difference += 1;
  for (const pixel of right) if (!left.has(pixel)) difference += 1;
  return difference;
}

function longestHorizontalRun(fills: RecordedFill[]): number {
  const rows = new Map<number, Set<number>>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      const xs = rows.get(y) ?? new Set<number>();
      for (let x = fill.x; x < fill.x + fill.width; x += 1) xs.add(x);
      rows.set(y, xs);
    }
  }
  let longest = 0;
  for (const xs of rows.values()) {
    const sorted = [...xs].sort((left, right) => left - right);
    let run = 0;
    let previous: number | undefined;
    for (const x of sorted) {
      run = previous === x - 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = x;
    }
  }
  return longest;
}

describe('meadow stone pixel grammar', () => {
  test('paints ground-level cottage stepping stones before the raised clothesline', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'stone-clothesline-order' }));
    const fills = record((graphics) => drawFarmEnvironment(graphics, state, 32));
    const steppingStoneIndexes = fills.flatMap((fill, index) => fill.color === 0x8d9277 ? [index] : []);
    const clotheslineIndexes = fills.flatMap((fill, index) => fill.color === 0xeed7c0 ? [index] : []);

    expect(steppingStoneIndexes.length).toBeGreaterThan(0);
    expect(clotheslineIndexes.length).toBeGreaterThan(0);
    expect(Math.max(...steppingStoneIndexes)).toBeLessThan(Math.min(...clotheslineIndexes));
  });

  test.each([
    ...[0, 1, 2, 3, 4, 5].map(
      (variant) =>
        [
          `meadow rock variant ${variant}`,
          (g: Parameters<typeof drawMeadowRock>[0]) => drawMeadowRock(g, 10 + variant, 20),
        ] as const,
    ),
    ...Array.from(
      { length: 7 },
      (_, variant) =>
        [
          `cottage stepping stone variant ${variant}`,
          (g: Parameters<typeof drawMeadowRock>[0]) => drawSteppingStone(g, 10, 20, variant),
        ] as const,
    ),
    ...Array.from(
      { length: 4 },
      (_, offset) =>
        [
          `south path stone variant ${offset + 6}`,
          (g: Parameters<typeof drawMeadowRock>[0]) => drawSouthPathStone(g, 10, 20, offset + 6),
        ] as const,
    ),
  ])('renders %s as an irregular stepped rock rather than a grey rectangle', (_name, draw) => {
    const fills = record(draw);
    const stoneFills = fills.filter(isOpaqueStonePixel);
    const rows = stoneRowProfiles(stoneFills);
    const widestRow = Math.max(...rows.map((row) => row.width));
    const occupiedArea = rows.reduce((total, row) => total + row.width, 0);

    expect(stoneFills.length).toBeGreaterThanOrEqual(2);
    expect(stoneFills.every((fill) => fill.height <= 2)).toBe(true);
    expect(new Set(stoneFills.map((fill) => fill.color)).size).toBeGreaterThanOrEqual(3);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(new Set(rows.map((row) => row.left)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(rows.map((row) => row.right)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(rows.map((row) => row.width)).size).toBeGreaterThanOrEqual(3);
    expect(longestRepeatedWidthRun(rows)).toBeLessThanOrEqual(2);
    expect(occupiedArea / (widestRow * rows.length)).toBeLessThanOrEqual(0.88);
    expect(rows[0]?.width ?? 0).toBeLessThan(widestRow);
    expect(rows.at(-1)?.width ?? 0).toBeLessThan(widestRow);
  });

  test.each(PRODUCTION_STONES)('$name has materially different production silhouettes', ({ draw, silhouetteVariants }) => {
    const authoredVariants = silhouetteVariants;
    const silhouettes = authoredVariants.map((variant) =>
      normalizedOpaquePixels(record((graphics) => draw(graphics, variant))),
    );

    expect(new Set(silhouettes.map((pixels) => [...pixels].sort().join('|'))).size).toBe(authoredVariants.length);
    for (let left = 0; left < silhouettes.length; left += 1) {
      for (let right = left + 1; right < silhouettes.length; right += 1) {
        expect(
          silhouetteDifference(silhouettes[left] ?? new Set(), silhouettes[right] ?? new Set()),
          `variants ${authoredVariants[left]} and ${authoredVariants[right]} differ by only a token notch`,
        ).toBeGreaterThanOrEqual(6);
      }
    }
  });

  test.each(PRODUCTION_STONES)('$name uses small highlight facets across every production mask', ({ draw, variants }) => {
    for (const variant of variants) {
      const fills = record((graphics) => draw(graphics, variant));
      const highlights = fills.filter((fill) => fill.alpha >= 0.75 && fill.alpha < 1);

      expect(highlights.length, `variant ${variant} has no highlight facets`).toBeGreaterThanOrEqual(2);
      expect(highlights.every((fill) => fill.width <= 2 && fill.height === 1)).toBe(true);
      expect(longestHorizontalRun(highlights), `variant ${variant} has a layered highlight band`).toBeLessThanOrEqual(2);
    }
  });
});
