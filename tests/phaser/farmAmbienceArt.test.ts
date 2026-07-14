import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { drawChimneySmoke } from '../../src/phaser/view/farmAmbience';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function recordingGraphics(): {
  graphics: Parameters<typeof drawChimneySmoke>[0];
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
  return { graphics: graphics as unknown as Parameters<typeof drawChimneySmoke>[0], fills };
}

function hasSolidBlock(fills: RecordedFill[], width: number, height: number): boolean {
  const occupied = new Set<string>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) occupied.add(`${x},${y}`);
    }
  }
  const xs = fills.flatMap((fill) => [fill.x, fill.x + fill.width]);
  const ys = fills.flatMap((fill) => [fill.y, fill.y + fill.height]);
  for (let y = Math.min(...ys); y <= Math.max(...ys) - height; y += 1) {
    for (let x = Math.min(...xs); x <= Math.max(...xs) - width; x += 1) {
      let complete = true;
      for (let offsetY = 0; offsetY < height && complete; offsetY += 1) {
        for (let offsetX = 0; offsetX < width; offsetX += 1) {
          if (!occupied.has(`${x + offsetX},${y + offsetY}`)) {
            complete = false;
            break;
          }
        }
      }
      if (complete) return true;
    }
  }
  return false;
}

describe('farm ambience pixel art', () => {
  test('breaks chimney smoke into drifting pixel puffs instead of grey rectangles', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'organic-smoke' }));
    const frameSignatures = new Set<string>();

    for (let tick = 0; tick < 20; tick += 1) {
      const recording = recordingGraphics();
      drawChimneySmoke(recording.graphics, state, 32, tick);
      expect(recording.fills.length).toBeGreaterThan(15);
      expect(recording.fills.every((fill) => fill.height === 1 && fill.width <= 2)).toBe(true);
      expect(hasSolidBlock(recording.fills, 3, 2), `tick ${tick}`).toBe(false);
      expect(new Set(recording.fills.map((fill) => fill.color)).size).toBeGreaterThan(1);
      frameSignatures.add(recording.fills.map((fill) => `${fill.x},${fill.y},${fill.width}`).join('|'));
    }

    expect(frameSignatures.size).toBeGreaterThan(8);
  });
});
