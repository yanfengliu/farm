import type { AnnotationPoint } from './farmAnnotations';

export interface AnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationCanvasRect extends AnnotationRect {
  normalizedX: number;
  normalizedY: number;
  normalizedWidth: number;
  normalizedHeight: number;
}

export interface FarmAnnotationBoxSelection {
  kind: 'box';
  clientRect: AnnotationRect;
  canvasRect: AnnotationCanvasRect;
  worldRect: AnnotationRect;
}

export interface FarmAnnotationBoxSelectionInput {
  clientStart: AnnotationPoint;
  clientEnd: AnnotationPoint;
  canvasStart: AnnotationPoint;
  canvasEnd: AnnotationPoint;
  worldStart: AnnotationPoint;
  worldEnd: AnnotationPoint;
  canvasSize: { width: number; height: number };
}

export interface FarmAnnotationBoxCenter {
  clientPx: AnnotationPoint;
  canvasPx: AnnotationPoint & { normalizedX: number; normalizedY: number };
  worldPx: AnnotationPoint;
}

export function annotationRectFromPoints(start: AnnotationPoint, end: AnnotationPoint): AnnotationRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function annotationRectCenter(rect: AnnotationRect): AnnotationPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function clampAnnotationCanvasPoint(
  point: AnnotationPoint,
  canvasSize: { width: number; height: number },
): AnnotationPoint {
  assertPositiveCanvasSize(canvasSize);
  return {
    x: clamp(point.x, 0, canvasSize.width),
    y: clamp(point.y, 0, canvasSize.height),
  };
}

export function createFarmAnnotationBoxSelection(
  input: FarmAnnotationBoxSelectionInput,
): FarmAnnotationBoxSelection {
  assertPositiveCanvasSize(input.canvasSize);
  const clientRect = annotationRectFromPoints(input.clientStart, input.clientEnd);
  const canvasRect = annotationRectFromPoints(input.canvasStart, input.canvasEnd);
  const worldRect = annotationRectFromPoints(input.worldStart, input.worldEnd);
  return {
    kind: 'box',
    clientRect,
    canvasRect: {
      ...canvasRect,
      normalizedX: canvasRect.x / input.canvasSize.width,
      normalizedY: canvasRect.y / input.canvasSize.height,
      normalizedWidth: canvasRect.width / input.canvasSize.width,
      normalizedHeight: canvasRect.height / input.canvasSize.height,
    },
    worldRect,
  };
}

export function farmAnnotationBoxCenter(selection: FarmAnnotationBoxSelection): FarmAnnotationBoxCenter {
  const canvasPx = annotationRectCenter(selection.canvasRect);
  return {
    clientPx: annotationRectCenter(selection.clientRect),
    canvasPx: {
      ...canvasPx,
      normalizedX: selection.canvasRect.normalizedX + selection.canvasRect.normalizedWidth / 2,
      normalizedY: selection.canvasRect.normalizedY + selection.canvasRect.normalizedHeight / 2,
    },
    worldPx: annotationRectCenter(selection.worldRect),
  };
}

export function farmAnnotationBoxMeetsMinimumSize(
  selection: FarmAnnotationBoxSelection,
  minimumCanvasSize: number,
): boolean {
  const minimum = Math.max(0, minimumCanvasSize);
  return selection.canvasRect.width >= minimum && selection.canvasRect.height >= minimum;
}

function assertPositiveCanvasSize(size: { width: number; height: number }): void {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error('Canvas dimensions must be positive finite numbers.');
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
