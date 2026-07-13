import { describe, expect, test } from 'vitest';
import { farmAnnotationPreviewGeometry } from '../../src/annotations/farmAnnotationCapture';

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
});
