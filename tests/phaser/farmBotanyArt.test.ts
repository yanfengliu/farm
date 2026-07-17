import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import {
  buildFarmBotanyLayout,
  decorativePlantVisualBounds,
  drawFarmBotanyGround,
  drawFarmBotanyOverstory,
} from '../../src/phaser/view/farmBotany';
import { drawDecorativePlant } from '../../src/phaser/view/farmBotanyArt';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function recordingGraphics(): {
  graphics: Parameters<typeof drawFarmBotanyGround>[0];
  fills: RecordedFill[];
} {
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
  return { graphics: graphics as unknown as Parameters<typeof drawFarmBotanyGround>[0], fills };
}

function isPlantGreen(color: number): boolean {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return green >= red + 12 && green >= blue + 12;
}

function findSolidBlock(
  fills: RecordedFill[],
  blockWidth: number,
  blockHeight: number,
): { x: number; y: number } | null {
  const occupied = new Set<string>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) occupied.add(`${x},${y}`);
    }
  }
  // Loop rather than spread: the border woodland pushed the recorded fill count
  // past what a spread argument list tolerates.
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const fill of fills) {
    left = Math.min(left, fill.x);
    right = Math.max(right, fill.x + fill.width);
    top = Math.min(top, fill.y);
    bottom = Math.max(bottom, fill.y + fill.height);
  }

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
      if (solid) return { x, y };
    }
  }
  return null;
}

describe('farm botany pixel grammar', () => {
  test('builds foliage from narrow pixel sprays rather than broad green rectangles', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'botany-leaf-grammar' }));
    const ground = recordingGraphics();
    const overstory = recordingGraphics();

    drawFarmBotanyGround(ground.graphics, state, 32);
    drawFarmBotanyOverstory(overstory.graphics, state, 32);

    const fills = [...ground.fills, ...overstory.fills];
    const foliage = fills.filter((fill) => fill.alpha >= 0.8 && isPlantGreen(fill.color));
    const groundFoliage = ground.fills.filter((fill) => fill.alpha >= 0.8 && isPlantGreen(fill.color));
    const overstoryFoliage = overstory.fills.filter((fill) => fill.alpha >= 0.8 && isPlantGreen(fill.color));
    expect(foliage.length).toBeGreaterThan(250);
    expect(foliage.every((fill) => fill.width <= 2 || fill.height <= 2 || fill.width * fill.height <= 10)).toBe(true);
    expect(findSolidBlock(groundFoliage, 8, 6), 'ground foliage').toBeNull();
    expect(findSolidBlock(overstoryFoliage, 8, 6), 'overstory foliage').toBeNull();
    expect(findSolidBlock(foliage, 8, 6), 'composited foliage').toBeNull();
  });

  test('keeps trunks, blossoms, fruit, and fungi out of post and block silhouettes', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'botany-structure-grammar' }));
    const ground = recordingGraphics();
    const overstory = recordingGraphics();

    drawFarmBotanyGround(ground.graphics, state, 32);
    drawFarmBotanyOverstory(overstory.graphics, state, 32);

    const opaque = [...ground.fills, ...overstory.fills].filter((fill) => fill.alpha >= 0.75);
    const nonFoliage = opaque.filter((fill) => !isPlantGreen(fill.color));
    expect(opaque.every((fill) => fill.width <= 2 || fill.height <= 2 || fill.width * fill.height <= 8)).toBe(true);
    expect(findSolidBlock(nonFoliage, 4, 8), 'trunk or prop block').toBeNull();
  });

  test('keeps every decorative plant pixel inside its semantic annotation bounds', () => {
    const layout = buildFarmBotanyLayout(12, 10, 32);
    for (const plant of layout.plants) {
      const recording = recordingGraphics();
      drawDecorativePlant(recording.graphics, plant);
      const bounds = decorativePlantVisualBounds(plant);
      expect(Math.min(...recording.fills.map((fill) => fill.x)), `${plant.kind} left`).toBeGreaterThanOrEqual(bounds.left);
      expect(Math.max(...recording.fills.map((fill) => fill.x + fill.width - 1)), `${plant.kind} right`).toBeLessThanOrEqual(bounds.right);
      expect(Math.min(...recording.fills.map((fill) => fill.y)), `${plant.kind} top`).toBeGreaterThanOrEqual(bounds.top);
      expect(Math.max(...recording.fills.map((fill) => fill.y + fill.height - 1)), `${plant.kind} bottom`).toBeLessThanOrEqual(bounds.bottom);
    }
  });
});
