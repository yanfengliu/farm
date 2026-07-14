import { describe, expect, test } from 'vitest';
import {
  farmAnnotationBoxPreviewGeometry,
  farmAnnotationPreviewGeometry,
} from '../../src/annotations/farmAnnotationCapture';

describe('farm annotation preview geometry', () => {
  test('keeps the evidence crosshair on edge clicks after clamping the crop', () => {
    const source = { width: 940, height: 688 };
    const display = { width: 940, height: 688 };
    const topLeft = farmAnnotationPreviewGeometry(source, display, { x: 2, y: 3 });
    const bottomRight = farmAnnotationPreviewGeometry(source, display, { x: 938, y: 686 });

    expect(topLeft).toMatchObject({ sourceX: 0, sourceY: 0 });
    expect(topLeft.crosshairX).toBeCloseTo(2, 4);
    expect(topLeft.crosshairY).toBeCloseTo(3, 4);
    expect(bottomRight.sourceX).toBe(940 - 176);
    expect(bottomRight.sourceY).toBe(688 - 112);
    expect(bottomRight.crosshairX).toBeCloseTo(174, 4);
    expect(bottomRight.crosshairY).toBeCloseTo(110, 4);
  });

  test('keeps a boxed selection inside the preview crop and maps its outline exactly', () => {
    const geometry = farmAnnotationBoxPreviewGeometry(
      { width: 940, height: 688 },
      { width: 940, height: 688 },
      { x: 100, y: 80, width: 220, height: 160 },
    );

    expect(geometry).toMatchObject({
      sourceX: expect.closeTo(65.428571, 5),
      sourceY: 68,
      sourceWidth: expect.closeTo(289.142857, 5),
      sourceHeight: 184,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: 176,
      destinationHeight: 112,
    });
    expect(geometry.sourceWidth / geometry.sourceHeight).toBeCloseTo(176 / 112, 5);
    expect(geometry.outlineX).toBeCloseTo((100 - geometry.sourceX) / geometry.sourceWidth * 176, 5);
    expect(geometry.outlineY).toBeCloseTo(12 / 184 * 112, 5);
    expect(geometry.outlineWidth).toBeCloseTo(220 / geometry.sourceWidth * 176, 5);
    expect(geometry.outlineHeight).toBeCloseTo(160 / 184 * 112, 5);
  });

  test('preserves displayed geometry at a 2x backing-buffer scale', () => {
    const standard = farmAnnotationBoxPreviewGeometry(
      { width: 940, height: 688 },
      { width: 940, height: 688 },
      { x: 100, y: 80, width: 220, height: 160 },
    );
    const doubled = farmAnnotationBoxPreviewGeometry(
      { width: 1880, height: 1376 },
      { width: 940, height: 688 },
      { x: 100, y: 80, width: 220, height: 160 },
    );

    expect(doubled.sourceX).toBeCloseTo(standard.sourceX * 2, 5);
    expect(doubled.sourceY).toBeCloseTo(standard.sourceY * 2, 5);
    expect(doubled.sourceWidth).toBeCloseTo(standard.sourceWidth * 2, 5);
    expect(doubled.sourceHeight).toBeCloseTo(standard.sourceHeight * 2, 5);
    expect(doubled.outlineX).toBeCloseTo(standard.outlineX, 5);
    expect(doubled.outlineY).toBeCloseTo(standard.outlineY, 5);
    expect(doubled.outlineWidth).toBeCloseTo(standard.outlineWidth, 5);
    expect(doubled.outlineHeight).toBeCloseTo(standard.outlineHeight, 5);
  });

  test('letterboxes an edge-limited crop instead of stretching it', () => {
    const geometry = farmAnnotationBoxPreviewGeometry(
      { width: 940, height: 688 },
      { width: 940, height: 688 },
      { x: 120, y: 0, width: 100, height: 688 },
    );

    expect(geometry.sourceWidth).toBe(940);
    expect(geometry.sourceHeight).toBe(688);
    expect(geometry.destinationWidth).toBeLessThan(176);
    expect(geometry.destinationHeight).toBe(112);
    expect(geometry.destinationX).toBeGreaterThan(0);
    expect(geometry.destinationY).toBe(0);
  });

  test('shifts a box preview crop at canvas edges without clipping its outline', () => {
    const geometry = farmAnnotationBoxPreviewGeometry(
      { width: 940, height: 688 },
      { width: 940, height: 688 },
      { x: 900, y: 650, width: 40, height: 38 },
    );

    expect(geometry.sourceX).toBe(940 - 176);
    expect(geometry.sourceY).toBe(688 - 112);
    expect(geometry.outlineX).toBeGreaterThanOrEqual(0);
    expect(geometry.outlineY).toBeGreaterThanOrEqual(0);
    expect(geometry.outlineX + geometry.outlineWidth).toBeLessThanOrEqual(176);
    expect(geometry.outlineY + geometry.outlineHeight).toBeLessThanOrEqual(112);
  });
});
