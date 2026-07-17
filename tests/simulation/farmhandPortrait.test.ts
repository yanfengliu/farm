import { describe, expect, test } from 'vitest';
import { FARMHAND_PORTRAIT_SIZE, drawFarmhandPortrait } from '../../src/phaser/view/farmWorkerArt';

interface RecordedRect { color: number; alpha: number; x: number; y: number; width: number; height: number; }

function record(workerId: number): RecordedRect[] {
  const rects: RecordedRect[] = [];
  let color = 0;
  let alpha = 1;
  drawFarmhandPortrait({
    fillStyle(nextColor: number, nextAlpha = 1) { color = nextColor; alpha = nextAlpha; },
    fillRect(x: number, y: number, width: number, height: number) { rects.push({ color, alpha, x, y, width, height }); },
  }, workerId);
  return rects;
}

describe('farmhand portrait art', () => {
  test('draws a multi-color standing figure fully inside the portrait bounds', () => {
    const rects = record(1);
    expect(rects.length).toBeGreaterThan(10);
    const colors = new Set(rects.map((rect) => rect.color));
    expect(colors.size).toBeGreaterThan(5);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(FARMHAND_PORTRAIT_SIZE.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(FARMHAND_PORTRAIT_SIZE.height);
    }
  });

  test('portraits are deterministic per farmhand and differ between farmhands', () => {
    expect(record(2)).toEqual(record(2));
    const shirtOf = (rects: RecordedRect[]) => rects.map((rect) => rect.color).join(',');
    expect(shirtOf(record(1))).not.toBe(shirtOf(record(2)));
    expect(shirtOf(record(3))).not.toBe(shirtOf(record(4)));
  });
});
