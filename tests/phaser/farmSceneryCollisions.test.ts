import { describe, expect, test } from 'vitest';
import { FARM_TIERS } from '../../src/game/content/tiers';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { buildFarmBotanyLayout, decorativePlantVisualBounds } from '../../src/phaser/view/farmBotany';
import { drawDecorativePlant, drawTreeBase } from '../../src/phaser/view/farmBotanyArt';
import { drawCottageGarden, drawFarmEnvironment } from '../../src/phaser/view/farmEnvironment';
import {
  buildFarmHedgerowPlacements,
  drawMixedHedgerow,
  farmHedgerowVisualBounds,
} from '../../src/phaser/view/farmHedgerow';
import { buildFarmSceneryLayout, type PixelBounds } from '../../src/phaser/view/farmSceneryLayout';
import { creekCenterX } from '../../src/phaser/view/farmWaterside';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type RecordingGraphics = Parameters<typeof drawFarmEnvironment>[0];

function record(draw: (graphics: RecordingGraphics) => void): RecordedFill[] {
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
  draw(graphics as unknown as RecordingGraphics);
  return fills;
}

function paintedBounds(fills: RecordedFill[]): PixelBounds {
  return {
    left: Math.min(...fills.map((fill) => fill.x)),
    top: Math.min(...fills.map((fill) => fill.y)),
    right: Math.max(...fills.map((fill) => fill.x + fill.width)),
    bottom: Math.max(...fills.map((fill) => fill.y + fill.height)),
  };
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

function boundsIntersect(left: PixelBounds, right: PixelBounds): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

describe('production scenery collision clearance', () => {
  test('moves the creek elder base onto the west bank without changing named shelters', () => {
    const layout = buildFarmSceneryLayout(12, 10, 32);
    const botany = buildFarmBotanyLayout(12, 10, 32);
    const creekElder = botany.trees.find((tree) => tree.variant === 2 && tree.species === 'elder');

    expect(creekElder).toMatchObject({ x: -79, y: 75, species: 'elder', variant: 2 });
    expect(botany.shelters).toEqual({
      'tree-shelter-elder': { x: -105, y: 31 },
      'tree-shelter-hazel': { x: -83, y: 13 },
    });
    expect(botany.groves[0]?.trees[2]).toEqual([26, 64]);
    if (!creekElder) return;

    const fills = record((graphics) => drawTreeBase(graphics, creekElder));
    const basePixels = occupiedPixels(fills);
    const waterCollisions = [...basePixels].filter((pixel) => {
      const [x = 0, y = 0] = pixel.split(',').map(Number);
      const creekRow = layout.environment.top + Math.floor((y - layout.environment.top) / 8) * 8;
      const waterLeft = creekCenterX(layout.creek.centerX, creekRow);
      return x >= waterLeft && x < waterLeft + layout.creek.width;
    });

    expect(waterCollisions).toEqual([]);
  });

  test('places every sign pixel in the framed garden-path clearing', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'sign-clearance' }));
    const layout = buildFarmSceneryLayout(state.width, state.height, 32);
    const environmentFills = record((graphics) => drawFarmEnvironment(graphics, state, 32));
    const signFills = environmentFills.slice(-7);
    const signBounds = paintedBounds(signFills);

    expect(layout.sign).toEqual({ x: 388, y: 170 });
    expect(signBounds).toEqual({ left: 388, top: 170, right: 430, bottom: 199 });
    expect(signBounds.left - layout.farm.right).toBe(4);
    expect(signBounds.top - layout.garden.bottom).toBe(25);
    expect(signBounds.left).toBeGreaterThanOrEqual(layout.frame.left);
    expect(signBounds.top).toBeGreaterThanOrEqual(layout.frame.top);
    expect(signBounds.right).toBeLessThanOrEqual(layout.frame.right);
    expect(signBounds.bottom).toBeLessThanOrEqual(layout.frame.bottom);

    const gardenFills = record((graphics) => drawCottageGarden(graphics, state, 32));
    const bedAndCabbageColors = new Set([0x805035, 0xb06e45, 0x315f3c, 0x5f934c, 0x6aa052, 0x9bc36d]);
    const bedAndCabbagePixels = occupiedPixels(gardenFills.filter((fill) => bedAndCabbageColors.has(fill.color)));
    expect([...occupiedPixels(signFills)].filter((pixel) => bedAndCabbagePixels.has(pixel))).toEqual([]);

    const botany = buildFarmBotanyLayout(state.width, state.height, 32);
    const eastFoxglove = botany.plants.find((plant) => plant.kind === 'foxglove' && plant.variant === 12);
    expect(eastFoxglove).toMatchObject({ x: 433, y: 184 });
    const botanyFills = botany.plants.flatMap((plant) =>
      record((graphics) => drawDecorativePlant(graphics, plant)),
    );
    const botanyPixels = occupiedPixels(botanyFills);
    expect([...occupiedPixels(signFills)].filter((pixel) => botanyPixels.has(pixel))).toEqual([]);

    const eastHedge = buildFarmHedgerowPlacements(state.width, state.height, 32).find((hedge) => hedge.id === 'east');
    expect(eastHedge).toBeDefined();
    if (!eastHedge) return;
    const eastHedgeFills = record((graphics) =>
      drawMixedHedgerow(
        graphics,
        eastHedge.x,
        eastHedge.y,
        eastHedge.count,
        eastHedge.seed,
        eastHedge.overlap,
      ),
    );
    const eastHedgePixels = occupiedPixels(eastHedgeFills);
    expect([...occupiedPixels(signFills)].filter((pixel) => eastHedgePixels.has(pixel))).toEqual([]);
    expect(farmHedgerowVisualBounds(eastHedge).left - signBounds.right).toBe(9);
    if (eastFoxglove) {
      expect(farmHedgerowVisualBounds(eastHedge).left - decorativePlantVisualBounds(eastFoxglove).right).toBe(1);
    }

    const stallY = layout.farm.bottom - 61;
    const stallBounds = { left: layout.farm.right + 11, top: stallY + 4, right: layout.farm.right + 81, bottom: stallY + 47 };
    const bridgeBounds = {
      left: layout.creek.centerX - 39,
      top: layout.creek.bridgeY - 30,
      right: layout.creek.centerX + layout.creek.width + 28,
      bottom: layout.creek.bridgeY + 30,
    };
    for (const [name, landmark] of [
      ['farm', layout.farm],
      ['garden', layout.garden],
      ['stall', stallBounds],
      ['bridge', bridgeBounds],
    ] as const) {
      expect(boundsIntersect(signBounds, landmark), name).toBe(false);
    }
  });

  test('nudges the east mushroom cap one pixel clear of the Tier 4 stall', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'mushroom-stall-clearance' }));
    state.tier = FARM_TIERS[4];
    const layout = buildFarmSceneryLayout(state.width, state.height, 32);
    const eastMushroom = buildFarmBotanyLayout(state.width, state.height, 32).plants.find(
      (plant) => plant.kind === 'mushroom' && plant.variant === 15,
    );

    expect(eastMushroom).toMatchObject({ x: layout.farm.right + 7, y: 294 });
    if (!eastMushroom) return;

    const capColors = new Set([0xc97859, 0xd9a45f]);
    const capFills = record((graphics) => drawDecorativePlant(graphics, eastMushroom)).filter((fill) =>
      capColors.has(fill.color),
    );
    const stallStructureColors = new Set([0x314932, 0x684128, 0xd8a34e, 0xd46b75, 0xf0c36a]);
    const stallRegionLeft = layout.farm.right + 11;
    const stallTop = layout.farm.bottom - 57;
    const stallRight = layout.farm.right + 81;
    const stallBottom = layout.farm.bottom - 14;
    const stallStructureFills = record((graphics) => drawFarmEnvironment(graphics, state, 32)).filter(
      (fill) =>
        stallStructureColors.has(fill.color) &&
        fill.x < stallRight &&
        fill.x + fill.width > stallRegionLeft &&
        fill.y < stallBottom &&
        fill.y + fill.height > stallTop,
    );
    const stallPixels = occupiedPixels(stallStructureFills);
    expect([...occupiedPixels(capFills)].filter((pixel) => stallPixels.has(pixel))).toEqual([]);
    expect(paintedBounds(capFills).right).toBe(layout.farm.right + 16);
  });
});
