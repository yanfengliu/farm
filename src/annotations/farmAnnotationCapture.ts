import type { AnnotationPoint } from './farmAnnotations';

const PREVIEW_WIDTH = 176;
const PREVIEW_HEIGHT = 112;

export interface FarmAnnotationPreviewGeometry {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  crosshairX: number;
  crosshairY: number;
}

export function captureFarmAnnotationPreview(
  source: HTMLCanvasElement,
  canvasPx: AnnotationPoint,
): string | null {
  try {
    const rect = source.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || source.width <= 0 || source.height <= 0) return null;
    const geometry = farmAnnotationPreviewGeometry(
      { width: source.width, height: source.height },
      { width: rect.width, height: rect.height },
      canvasPx,
    );
    const preview = document.createElement('canvas');
    preview.width = PREVIEW_WIDTH;
    preview.height = PREVIEW_HEIGHT;
    const context = preview.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      source,
      geometry.sourceX,
      geometry.sourceY,
      geometry.sourceWidth,
      geometry.sourceHeight,
      0,
      0,
      PREVIEW_WIDTH,
      PREVIEW_HEIGHT,
    );
    drawCrosshair(context, geometry.crosshairX, geometry.crosshairY);
    return preview.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function farmAnnotationPreviewGeometry(
  source: { width: number; height: number },
  display: { width: number; height: number },
  canvasPx: AnnotationPoint,
): FarmAnnotationPreviewGeometry {
  const scaleX = source.width / display.width;
  const scaleY = source.height / display.height;
  const selectedX = canvasPx.x * scaleX;
  const selectedY = canvasPx.y * scaleY;
  const sourceWidth = Math.min(source.width, Math.round(PREVIEW_WIDTH * scaleX));
  const sourceHeight = Math.min(source.height, Math.round(PREVIEW_HEIGHT * scaleY));
  const sourceX = clamp(Math.round(selectedX - sourceWidth / 2), 0, source.width - sourceWidth);
  const sourceY = clamp(Math.round(selectedY - sourceHeight / 2), 0, source.height - sourceHeight);
  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    crosshairX: clamp((selectedX - sourceX) / sourceWidth * PREVIEW_WIDTH, 0, PREVIEW_WIDTH - 1),
    crosshairY: clamp((selectedY - sourceY) / sourceHeight * PREVIEW_HEIGHT, 0, PREVIEW_HEIGHT - 1),
  };
}

function drawCrosshair(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.fillStyle = 'rgba(37, 23, 15, 0.92)';
  context.fillRect(x - 10, y - 1, 7, 3);
  context.fillRect(x + 4, y - 1, 7, 3);
  context.fillRect(x - 1, y - 10, 3, 7);
  context.fillRect(x - 1, y + 4, 3, 7);
  context.fillStyle = '#ffe2a0';
  context.fillRect(x - 9, y, 6, 1);
  context.fillRect(x + 4, y, 6, 1);
  context.fillRect(x, y - 9, 1, 6);
  context.fillRect(x, y + 4, 1, 6);
  context.fillRect(x - 1, y - 1, 3, 3);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
