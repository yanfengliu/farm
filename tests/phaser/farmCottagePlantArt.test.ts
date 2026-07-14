import { describe, expect, test } from 'vitest';
import { drawCottagePlants } from '../../src/phaser/view/farmCottagePlantArt';

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const COTTAGE_FOLIAGE = new Set([0x2a5339, 0x315f3c, 0x4c7a45, 0x5f873d, 0x86ad60, 0x91b966]);

function recordCottagePlants(): RecordedFill[] {
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
  drawCottagePlants(graphics as unknown as Parameters<typeof drawCottagePlants>[0], 100, 50);
  return fills;
}

function occupiedPixels(fills: RecordedFill[]): Set<string> {
  const occupied = new Set<string>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) occupied.add(`${x},${y}`);
    }
  }
  return occupied;
}

function containsSolidBlock(fills: RecordedFill[], width: number, height: number): boolean {
  const occupied = occupiedPixels(fills);
  const points = [...occupied].map((point) => point.split(',').map(Number));
  if (points.length === 0) return false;
  const xs = points.map(([x = 0]) => x);
  const ys = points.map(([, y = 0]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys) - height + 1; y += 1) {
    for (let x = Math.min(...xs); x <= Math.max(...xs) - width + 1; x += 1) {
      if (Array.from({ length: width * height }, (_, index) => (
        occupied.has(`${x + (index % width)},${y + Math.floor(index / width)}`)
      )).every(Boolean)) return true;
    }
  }
  return false;
}

describe('cottage plant pixel grammar', () => {
  test('renders both window boxes and the wall climber from perforated foliage', () => {
    const foliage = recordCottagePlants().filter((fill) => fill.alpha >= 0.8 && COTTAGE_FOLIAGE.has(fill.color));
    const pixels = occupiedPixels(foliage);

    expect(pixels.size).toBeGreaterThan(70);
    expect(foliage.every((fill) => fill.width <= 2 || fill.height <= 2 || fill.width * fill.height <= 8)).toBe(true);
    expect(containsSolidBlock(foliage, 6, 4)).toBe(false);
    expect([...pixels].filter((point) => Number(point.split(',')[0]) < 108).length, 'wall climber').toBeGreaterThan(12);
    expect([...pixels].filter((point) => Number(point.split(',')[0]) >= 108 && Number(point.split(',')[0]) < 126).length, 'left window box').toBeGreaterThan(12);
    expect([...pixels].filter((point) => Number(point.split(',')[0]) >= 143).length, 'right window box').toBeGreaterThan(12);
  });
});
