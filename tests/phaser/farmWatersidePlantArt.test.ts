import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import {
  buildCreekBankPlantLayout,
  drawCreekBankPlant,
  drawLilyPad,
  type CreekBankPlantLayout,
  type CreekLilyLayout,
} from '../../src/phaser/view/farmWaterside';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type WatersideGraphics = Parameters<typeof drawLilyPad>[0];
const LILY_COLORS = new Set([0x1e4839, 0x28543d, 0x356b49, 0x4c7a52]);
const BLOSSOM_COLORS = new Set([0x8999d3, 0x9b87c6, 0xf0cf6a, 0xf3c0bc, 0xffe2a0, 0xcbb6e8, 0xffefb0]);
const BANK_FOLIAGE = new Set([0x5f8b49, 0x759a4a, 0x759c50, 0x89a951]);

function record(draw: (graphics: WatersideGraphics) => void): RecordedFill[] {
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
  draw(graphics as unknown as WatersideGraphics);
  return fills;
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

function normalizedPixels(fills: RecordedFill[]): string {
  const points = [...occupiedPixels(fills)].map((point) => point.split(',').map(Number));
  const left = Math.min(...points.map(([x = 0]) => x));
  const top = Math.min(...points.map(([, y = 0]) => y));
  return points.map(([x = 0, y = 0]) => `${x - left},${y - top}`).sort().join('|');
}

function containsSolidBlock(fills: RecordedFill[], width: number, height: number): boolean {
  const occupied = occupiedPixels(fills);
  const points = [...occupied].map((point) => point.split(',').map(Number));
  const xs = points.map(([x = 0]) => x);
  const ys = points.map(([, y = 0]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys) - height + 1; y += 1) {
    for (let x = Math.min(...xs); x <= Math.max(...xs) - width + 1; x += 1) {
      let solid = true;
      for (let dy = 0; dy < height && solid; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          if (!occupied.has(`${x + dx},${y + dy}`)) {
            solid = false;
            break;
          }
        }
      }
      if (solid) return true;
    }
  }
  return false;
}

describe('waterside plant pixel grammar', () => {
  test.each(['cattail', 'iris', 'sedge'] as const)('renders %s leaves as tapered one-pixel blades on both banks', (kind) => {
    for (const bank of ['left', 'right'] as const) {
      for (const variant of [0, 1]) {
        const plant: CreekBankPlantLayout = { x: 40, y: 30, kind, bank, variant, bridgeY: 0 };
        const fills = record((graphics) => drawCreekBankPlant(graphics, plant));
        const foliage = fills.filter((fill) => BANK_FOLIAGE.has(fill.color));

        expect(occupiedPixels(foliage).size, `${kind} ${bank} foliage`).toBeGreaterThan(18);
        expect(
          foliage.every((fill) => fill.width === 1 || fill.height === 1),
          `${kind} ${bank} uses broad green bars`,
        ).toBe(true);
        expect(containsSolidBlock(foliage, 4, 4), `${kind} ${bank} rectangular foliage`).toBe(false);

        if (kind === 'cattail') {
          const seedHeads = fills.filter((fill) => fill.color === 0x815338);
          expect(occupiedPixels(seedHeads).size).toBeGreaterThanOrEqual(6);
          expect(seedHeads.every((fill) => fill.width * fill.height <= 2), 'blocky cattail head').toBe(true);
        }
      }
    }
  });

  test('gives every production bank community multiple authored silhouettes per species and bank', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'waterside-production-silhouettes' }));
    const signatures = new Map<string, string[]>();

    for (const plant of buildCreekBankPlantLayout(state, 32)) {
      const fills = record((graphics) => drawCreekBankPlant(graphics, plant));
      const key = `${plant.kind}:${plant.bank}`;
      const existing = signatures.get(key) ?? [];
      existing.push(normalizedPixels(fills.filter((fill) => fill.alpha >= 0.8)));
      signatures.set(key, existing);
    }

    expect([...signatures.keys()].sort()).toEqual([
      'cattail:left',
      'cattail:right',
      'iris:left',
      'iris:right',
      'sedge:left',
      'sedge:right',
    ]);
    for (const [key, variants] of signatures) {
      expect(variants.length, `${key} production count`).toBeGreaterThanOrEqual(2);
      expect(new Set(variants).size, `${key} silhouette diversity`).toBeGreaterThanOrEqual(2);
    }
  });

  test.each([8, 10, 12] as const)('renders size %i lily pads with four distinct notches and optional companions', (size) => {
    const silhouettes: string[] = [];
    for (const notch of [0, 1, 2, 3] as const) {
      for (const companion of [false, true]) {
        const lily: CreekLilyLayout = {
          x: 40,
          y: 30,
          size,
          notch,
          blossomColor: 0xf3c0bc,
          companion,
          bridgeY: 0,
        };
        const fills = record((graphics) => drawLilyPad(graphics, lily));
        const pad = fills.filter((fill) => LILY_COLORS.has(fill.color));
        const blossom = fills.filter((fill) => BLOSSOM_COLORS.has(fill.color));

        expect(pad.every((fill) => fill.height === 1), `size ${size} notch ${notch} broad pad row`).toBe(true);
        expect(new Set(pad.map((fill) => fill.color)).size).toBeGreaterThanOrEqual(3);
        expect(containsSolidBlock(pad.filter((fill) => fill.alpha >= 0.8), 8, 4)).toBe(false);
        expect(blossom.every((fill) => fill.width * fill.height <= 2), 'blocky lily blossom').toBe(true);
        if (companion) expect(occupiedPixels(pad).size).toBeGreaterThan(size * 3);
        else silhouettes.push(normalizedPixels(pad.filter((fill) => fill.alpha >= 0.8)));
      }
    }
    expect(new Set(silhouettes).size).toBe(4);
  });

  test.each(['left', 'right'] as const)('renders %s-bank iris blooms as separated pixel petals', (bank) => {
    for (const variant of [0, 1]) {
      const plant: CreekBankPlantLayout = { x: 40, y: 30, kind: 'iris', bank, variant, bridgeY: 0 };
      const fills = record((graphics) => drawCreekBankPlant(graphics, plant));
      const bloom = fills.filter((fill) => BLOSSOM_COLORS.has(fill.color));
      const pixels = occupiedPixels(bloom);
      const xs = [...pixels].map((point) => Number(point.split(',')[0]));
      const ys = [...pixels].map((point) => Number(point.split(',')[1]));

      expect(pixels.size).toBeGreaterThanOrEqual(10);
      expect(bloom.every((fill) => fill.width * fill.height <= 2)).toBe(true);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(6);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(5);
      expect(containsSolidBlock(bloom, 4, 3)).toBe(false);
    }
  });
});
