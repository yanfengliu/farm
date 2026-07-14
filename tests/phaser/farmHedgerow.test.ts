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

function isPlantGreen(color: number): boolean {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return green >= red + 12 && green >= blue + 12;
}

function containsSolidBlock(fills: RecordedFill[], blockWidth: number, blockHeight: number): boolean {
  const occupied = new Set<string>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) occupied.add(`${x},${y}`);
    }
  }
  const xs = fills.flatMap((fill) => [fill.x, fill.x + fill.width]);
  const ys = fills.flatMap((fill) => [fill.y, fill.y + fill.height]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  for (let y = top; y <= bottom - blockHeight; y += 1) {
    for (let x = left; x <= right - blockWidth; x += 1) {
      let solid = true;
      for (let offsetY = 0; offsetY < blockHeight && solid; offsetY += 1) {
        for (let offsetX = 0; offsetX < blockWidth; offsetX += 1) {
          if (!occupied.has(`${x + offsetX},${y + offsetY}`)) {
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

function paintedBounds(fills: RecordedFill[]) {
  return {
    left: Math.min(...fills.map((fill) => fill.x)),
    top: Math.min(...fills.map((fill) => fill.y)),
    right: Math.max(...fills.map((fill) => fill.x + fill.width)),
    bottom: Math.max(...fills.map((fill) => fill.y + fill.height)),
  };
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
    expect(new Set(first.shrubs.flatMap((shrub) => shrub.leafSprays.map((spray) => spray.variant))).size).toBeGreaterThanOrEqual(6);
    const last = first.shrubs.at(-1);
    expect(last).toBeDefined();
    const footprintWidth = (last?.x ?? 0) + (last?.width ?? 0) - productionAnchor;
    const footprintHeight = Math.max(...bases) - Math.min(...tops);
    expect(footprintWidth).toBeGreaterThanOrEqual(60);
    expect(footprintWidth).toBeLessThanOrEqual(90);
    expect(footprintWidth / footprintHeight).toBeLessThan(4.8);

    for (const [index, shrub] of first.shrubs.entries()) {
      expect(shrub.leafSprays).toHaveLength(7);
      expect(new Set(shrub.leafSprays.map((spray) => spray.x)).size).toBeGreaterThanOrEqual(4);
      expect(new Set(shrub.leafSprays.map((spray) => spray.y)).size).toBeGreaterThanOrEqual(4);
      expect(
        shrub.leafSprays.every(
          (spray) =>
            spray.x >= shrub.x &&
            spray.x + 7 <= shrub.x + shrub.width &&
            spray.y >= shrub.y &&
            spray.y + 5 <= shrub.y + shrub.height,
        ),
      ).toBe(true);

      const next = first.shrubs[index + 1];
      if (next) {
        const gap = next.x - (shrub.x + shrub.width);
        expect(gap).toBeGreaterThanOrEqual(-4);
        expect(gap).toBeLessThanOrEqual(-1);
        expect(-gap).toBeLessThanOrEqual(Math.floor(Math.min(shrub.width, next.width) * 0.3));
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

  test('renders every authored canopy from narrow leaf pixels without green rectangular masses', () => {
    for (const hedge of buildFarmHedgerowPlacements(12, 10, 32)) {
      const layout = buildMixedHedgerowLayout(hedge.x, hedge.y, hedge.count, hedge.seed, hedge.overlap);
      const bounds = farmHedgerowVisualBounds(hedge);
      const { graphics, fills } = recordingGraphics();

      drawMixedHedgerow(graphics, hedge.x, hedge.y, hedge.count, hedge.seed, hedge.overlap);

      expect(fills.length, hedge.id).toBeGreaterThan(layout.shrubs.length * 20);
      expect(
        fills.every((fill) => [fill.x, fill.y, fill.width, fill.height].every(Number.isInteger)),
        hedge.id,
      ).toBe(true);
      expect(fills.every((fill) => fill.width > 0 && fill.height > 0), hedge.id).toBe(true);
      expect(Math.min(...fills.map((fill) => fill.x)), hedge.id).toBeGreaterThanOrEqual(bounds.left);
      expect(Math.max(...fills.map((fill) => fill.x + fill.width)), hedge.id).toBeLessThanOrEqual(bounds.right);
      expect(Math.min(...fills.map((fill) => fill.y)), hedge.id).toBeGreaterThanOrEqual(bounds.top);
      expect(Math.max(...fills.map((fill) => fill.y + fill.height)), hedge.id).toBeLessThanOrEqual(bounds.bottom);

      const canopyFills = fills.filter((fill) => fill.alpha >= 0.8 && isPlantGreen(fill.color));
      expect(canopyFills.length, hedge.id).toBeGreaterThan(layout.shrubs.length * 30);
      expect(
        canopyFills.every((fill) => fill.width <= 2 || fill.height <= 2 || fill.width * fill.height <= 8),
        hedge.id,
      ).toBe(true);
      expect(containsSolidBlock(canopyFills, 8, 6), hedge.id).toBe(false);
      expect(new Set(canopyFills.map((fill) => fill.color)).size, hedge.id).toBeGreaterThanOrEqual(5);
      expect(fills.filter((fill) => fill.color === 0x4d603b && fill.alpha === 0.25), hedge.id).toHaveLength(
        layout.shrubs.length * 2,
      );
    }
  });

  test('keeps painted foliage beneath the original player annotation center', () => {
    const hedge = buildFarmHedgerowPlacements(12, 10, 32).find((placement) => placement.id === 'east');
    expect(hedge).toBeDefined();
    const { graphics, fills } = recordingGraphics();
    if (!hedge) return;
    drawMixedHedgerow(graphics, hedge.x, hedge.y, hedge.count, hedge.seed, hedge.overlap);

    const foliage = fills.filter((fill) => fill.alpha >= 0.8 && isPlantGreen(fill.color));
    expect(
      foliage.some(
        (fill) =>
          fill.x <= 494.5 &&
          fill.x + fill.width >= 494.5 &&
          fill.y <= 163.25 &&
          fill.y + fill.height >= 163.25,
      ),
    ).toBe(true);
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

  test('keeps every painted north-hedgerow pixel above fully expanded farmland', () => {
    const scenery = buildFarmSceneryLayout(12, 10, 32);
    const northernHedges = buildFarmHedgerowPlacements(12, 10, 32).filter((hedge) => hedge.id !== 'east');
    const bounds = [];

    expect(northernHedges).toHaveLength(3);
    for (const hedge of northernHedges) {
      const { graphics, fills } = recordingGraphics();
      drawMixedHedgerow(graphics, hedge.x, hedge.y, hedge.count, hedge.seed, hedge.overlap);
      const painted = paintedBounds(fills);
      const semantic = farmHedgerowVisualBounds(hedge);
      bounds.push({ id: hedge.id, painted, semantic });
      expect(painted.bottom, hedge.id).toBeLessThanOrEqual(scenery.farm.top);
      expect(semantic.bottom, hedge.id).toBeLessThanOrEqual(scenery.farm.top);
    }
    expect(bounds).toEqual([
      {
        id: 'north-west',
        painted: { left: 17, top: -37, right: 63, bottom: -1 },
        semantic: { left: 14, top: -37, right: 68, bottom: 0 },
      },
      {
        id: 'north-middle',
        painted: { left: 138, top: -28, right: 165, bottom: -1 },
        semantic: { left: 135, top: -28, right: 170, bottom: 0 },
      },
      {
        id: 'north-east',
        painted: { left: 273, top: -30, right: 317, bottom: -1 },
        semantic: { left: 270, top: -30, right: 322, bottom: 0 },
      },
    ]);
  });
});
