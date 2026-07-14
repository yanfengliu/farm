import { describe, expect, test } from 'vitest';
import {
  annotationRectCenter,
  annotationRectFromPoints,
  clampAnnotationCanvasPoint,
  createFarmAnnotationBoxSelection,
  farmAnnotationBoxCenter,
  farmAnnotationBoxMeetsMinimumSize,
} from '../../src/annotations/farmAnnotationSelection';

describe('farm annotation box selection', () => {
  test('normalizes reverse drags into canonical rectangles and an exact center pick', () => {
    const selection = createFarmAnnotationBoxSelection({
      clientStart: { x: 500, y: 400 },
      clientEnd: { x: 100, y: 200 },
      canvasStart: { x: 480, y: 350 },
      canvasEnd: { x: 80, y: 150 },
      worldStart: { x: 300, y: 250 },
      worldEnd: { x: 100, y: 150 },
      canvasSize: { width: 800, height: 600 },
    });

    expect(selection).toEqual({
      kind: 'box',
      clientRect: { x: 100, y: 200, width: 400, height: 200 },
      canvasRect: {
        x: 80,
        y: 150,
        width: 400,
        height: 200,
        normalizedX: 0.1,
        normalizedY: 0.25,
        normalizedWidth: 0.5,
        normalizedHeight: 1 / 3,
      },
      worldRect: { x: 100, y: 150, width: 200, height: 100 },
    });
    const center = farmAnnotationBoxCenter(selection);
    expect(center).toMatchObject({
      clientPx: { x: 300, y: 300 },
      canvasPx: {
        x: 280,
        y: 250,
        normalizedX: 0.35,
      },
      worldPx: { x: 200, y: 200 },
    });
    expect(center.canvasPx.normalizedY).toBeCloseTo(5 / 12, 12);
  });

  test('clamps pointer coordinates to the canvas without hiding the min-size decision', () => {
    expect(clampAnnotationCanvasPoint({ x: -3, y: 620 }, { width: 800, height: 600 }))
      .toEqual({ x: 0, y: 600 });
    expect(clampAnnotationCanvasPoint({ x: 900, y: -8 }, { width: 800, height: 600 }))
      .toEqual({ x: 800, y: 0 });

    const selection = createFarmAnnotationBoxSelection({
      clientStart: { x: 10, y: 20 },
      clientEnd: { x: 15, y: 30 },
      canvasStart: { x: 10, y: 20 },
      canvasEnd: { x: 15, y: 30 },
      worldStart: { x: 5, y: 10 },
      worldEnd: { x: 7.5, y: 15 },
      canvasSize: { width: 800, height: 600 },
    });

    expect(farmAnnotationBoxMeetsMinimumSize(selection, 6)).toBe(false);
    expect(farmAnnotationBoxMeetsMinimumSize(selection, 5)).toBe(true);
    expect(farmAnnotationBoxMeetsMinimumSize(selection, 0)).toBe(true);
  });

  test('exposes reusable rectangle normalization and center helpers', () => {
    const rect = annotationRectFromPoints({ x: 14, y: -2 }, { x: -6, y: 8 });
    expect(rect).toEqual({ x: -6, y: -2, width: 20, height: 10 });
    expect(annotationRectCenter(rect)).toEqual({ x: 4, y: 3 });
  });

  test('rejects unusable canvas dimensions at the pure construction boundary', () => {
    expect(() => createFarmAnnotationBoxSelection({
      clientStart: { x: 1, y: 1 },
      clientEnd: { x: 2, y: 2 },
      canvasStart: { x: 1, y: 1 },
      canvasEnd: { x: 2, y: 2 },
      worldStart: { x: 1, y: 1 },
      worldEnd: { x: 2, y: 2 },
      canvasSize: { width: 0, height: 600 },
    })).toThrow('Canvas dimensions must be positive');
  });
});
