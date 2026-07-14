import { describe, expect, test } from 'vitest';
import {
  buildFarmHedgerowPlacements,
  buildMixedHedgerowLayout,
  drawMixedHedgerow,
  farmHedgerowVisualBounds,
} from '../../src/phaser/view/farmHedgerow';
import { buildFarmSceneryLayout } from '../../src/phaser/view/farmSceneryLayout';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function recordingGraphics(): { graphics: Parameters<typeof drawMixedHedgerow>[0]; fills: RecordedFill[] } {
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
  return { graphics: graphics as unknown as Parameters<typeof drawMixedHedgerow>[0], fills };
}

describe('mixed hedgerow art layout', () => {
  test('builds a deterministic, irregular chain of overlapping shrub silhouettes', () => {
    const production = buildFarmHedgerowPlacements(12, 10, 32).find((hedge) => hedge.id === 'east');
    expect(production).toBeDefined();
    const productionAnchor = production?.x ?? 0;
    const first = buildMixedHedgerowLayout(
      productionAnchor,
      production?.y ?? 0,
      production?.count ?? 0,
      production?.seed ?? 0,
      production?.overlap ?? 0,
    );
    const second = buildMixedHedgerowLayout(
      productionAnchor,
      production?.y ?? 0,
      production?.count ?? 0,
      production?.seed ?? 0,
      production?.overlap ?? 0,
    );

    expect(second).toEqual(first);
    expect(first.shrubs).toHaveLength(5);

    const widths = first.shrubs.map((shrub) => shrub.width);
    const tops = first.shrubs.map((shrub) => shrub.y);
    const bases = first.shrubs.map((shrub) => shrub.y + shrub.height);
    expect(new Set(widths).size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...bases) - Math.min(...bases)).toBeGreaterThanOrEqual(5);
    expect(new Set(first.shrubs.map((shrub) => shrub.highlights.length)).size).toBeGreaterThanOrEqual(2);
    const last = first.shrubs.at(-1);
    expect(last).toBeDefined();
    const footprintWidth = (last?.x ?? 0) + (last?.width ?? 0) - productionAnchor;
    const footprintHeight = Math.max(...bases) - Math.min(...tops);
    expect(footprintWidth).toBeGreaterThanOrEqual(60);
    expect(footprintWidth).toBeLessThanOrEqual(90);
    expect(footprintWidth / footprintHeight).toBeLessThan(4.8);

    for (const [index, shrub] of first.shrubs.entries()) {
      expect(shrub.lobes.length).toBeGreaterThanOrEqual(4);
      expect(shrub.lobes.every((lobe) => lobe.width < shrub.width || lobe.height < shrub.height)).toBe(true);
      expect(shrub.lobes.every((lobe) => lobe.width / lobe.height <= 2.5)).toBe(true);
      expect(shrub.lobes.every((lobe) => lobe.width < shrub.width * 0.72)).toBe(true);

      const next = first.shrubs[index + 1];
      if (next) {
        const gap = next.x - (shrub.x + shrub.width);
        expect(gap).toBeGreaterThanOrEqual(-15);
        expect(gap).toBeLessThanOrEqual(4);
      }
    }
  });

  test('varies the organic layout by seed without moving its anchor', () => {
    const first = buildMixedHedgerowLayout(17, -17, 3, 3);
    const alternate = buildMixedHedgerowLayout(17, -17, 3, 13);

    expect(first.shrubs[0]?.x).toBe(17);
    expect(alternate.shrubs[0]?.x).toBe(17);
    expect(alternate).not.toEqual(first);
  });

  test('renders compact pixel clusters instead of shrub-width rectangular strips', () => {
    const production = buildFarmHedgerowPlacements(12, 10, 32).find((hedge) => hedge.id === 'east');
    expect(production).toBeDefined();
    const hedge = production ?? { x: 0, y: 0, count: 0, seed: 0, overlap: 0 };
    const layout = buildMixedHedgerowLayout(hedge.x, hedge.y, hedge.count, hedge.seed, hedge.overlap);
    const { graphics, fills } = recordingGraphics();

    drawMixedHedgerow(graphics, hedge.x, hedge.y, hedge.count, hedge.seed, hedge.overlap);

    expect(fills.length).toBeGreaterThan(layout.shrubs.length * 20);
    expect(fills.every((fill) => [fill.x, fill.y, fill.width, fill.height].every(Number.isInteger))).toBe(true);
    expect(fills.every((fill) => fill.width > 0 && fill.height > 0)).toBe(true);
    const narrowestShrub = Math.min(...layout.shrubs.map((shrub) => shrub.width));
    const widestFill = Math.max(...fills.map((fill) => fill.width));
    expect(widestFill).toBeLessThan(narrowestShrub * 0.72);
    expect(fills.filter((fill) => fill.color === 0x4d603b && fill.alpha === 0.25)).toHaveLength(
      layout.shrubs.length * 2,
    );
  });

  test('keeps every authored hedge inside the default recenter view', () => {
    const scenery = buildFarmSceneryLayout(12, 10, 32);
    const cameraPadding = 32 / 2;
    const breathingRoom = 4;

    for (const hedge of buildFarmHedgerowPlacements(12, 10, 32)) {
      const bounds = farmHedgerowVisualBounds(hedge);
      expect(bounds.left, hedge.id).toBeGreaterThanOrEqual(scenery.frame.left - cameraPadding + breathingRoom);
      expect(bounds.right, hedge.id).toBeLessThanOrEqual(scenery.frame.right + cameraPadding - breathingRoom);
      expect(bounds.top, hedge.id).toBeGreaterThanOrEqual(scenery.frame.top - cameraPadding + breathingRoom);
      expect(bounds.bottom, hedge.id).toBeLessThanOrEqual(scenery.frame.bottom + cameraPadding - breathingRoom);
    }
  });
});
