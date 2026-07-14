import type { AnnotationPoint } from './farmAnnotations';
import type { AnnotationRect, FarmAnnotationBoxSelection } from './farmAnnotationSelection';

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

export interface FarmAnnotationBoxPreviewGeometry {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destinationX: number;
  destinationY: number;
  destinationWidth: number;
  destinationHeight: number;
  outlineX: number;
  outlineY: number;
  outlineWidth: number;
  outlineHeight: number;
}

export function captureFarmAnnotationPreview(
  source: HTMLCanvasElement,
  canvasPx: AnnotationPoint,
  selection?: FarmAnnotationBoxSelection,
): string | null {
  try {
    const rect = source.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || source.width <= 0 || source.height <= 0) return null;
    const sourceSize = { width: source.width, height: source.height };
    const displaySize = { width: rect.width, height: rect.height };
    const geometry = selection
      ? farmAnnotationBoxPreviewGeometry(sourceSize, displaySize, selection.canvasRect)
      : farmAnnotationPreviewGeometry(sourceSize, displaySize, canvasPx);
    const preview = document.createElement('canvas');
    preview.width = PREVIEW_WIDTH;
    preview.height = PREVIEW_HEIGHT;
    const context = preview.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    const boxGeometry = 'outlineX' in geometry ? geometry : null;
    if (boxGeometry) {
      context.fillStyle = '#2b1c15';
      context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    }
    context.drawImage(
      source,
      geometry.sourceX,
      geometry.sourceY,
      geometry.sourceWidth,
      geometry.sourceHeight,
      boxGeometry?.destinationX ?? 0,
      boxGeometry?.destinationY ?? 0,
      boxGeometry?.destinationWidth ?? PREVIEW_WIDTH,
      boxGeometry?.destinationHeight ?? PREVIEW_HEIGHT,
    );
    if ('outlineX' in geometry) drawBoxOutline(context, geometry);
    else drawCrosshair(context, geometry.crosshairX, geometry.crosshairY);
    return preview.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function farmAnnotationBoxPreviewGeometry(
  source: { width: number; height: number },
  display: { width: number; height: number },
  canvasRect: AnnotationRect,
): FarmAnnotationBoxPreviewGeometry {
  const scaleX = source.width / display.width;
  const scaleY = source.height / display.height;
  const displayBoxX = clamp(canvasRect.x, 0, display.width);
  const displayBoxY = clamp(canvasRect.y, 0, display.height);
  const displayBoxRight = clamp(canvasRect.x + canvasRect.width, 0, display.width);
  const displayBoxBottom = clamp(canvasRect.y + canvasRect.height, 0, display.height);
  const displayBoxWidth = Math.max(0, displayBoxRight - displayBoxX);
  const displayBoxHeight = Math.max(0, displayBoxBottom - displayBoxY);
  let displayCropWidth = Math.min(display.width, Math.max(PREVIEW_WIDTH, displayBoxWidth + 24));
  let displayCropHeight = Math.min(display.height, Math.max(PREVIEW_HEIGHT, displayBoxHeight + 24));
  const previewAspect = PREVIEW_WIDTH / PREVIEW_HEIGHT;
  if (displayCropWidth / displayCropHeight < previewAspect) {
    displayCropWidth = Math.min(display.width, displayCropHeight * previewAspect);
  } else {
    displayCropHeight = Math.min(display.height, displayCropWidth / previewAspect);
  }
  const displayCropX = clamp(
    displayBoxX + displayBoxWidth / 2 - displayCropWidth / 2,
    0,
    display.width - displayCropWidth,
  );
  const displayCropY = clamp(
    displayBoxY + displayBoxHeight / 2 - displayCropHeight / 2,
    0,
    display.height - displayCropHeight,
  );
  const boxX = displayBoxX * scaleX;
  const boxY = displayBoxY * scaleY;
  const boxRight = displayBoxRight * scaleX;
  const boxBottom = displayBoxBottom * scaleY;
  const boxWidth = Math.max(0, boxRight - boxX);
  const boxHeight = Math.max(0, boxBottom - boxY);
  const sourceX = displayCropX * scaleX;
  const sourceY = displayCropY * scaleY;
  const sourceWidth = displayCropWidth * scaleX;
  const sourceHeight = displayCropHeight * scaleY;
  const destinationScale = Math.min(PREVIEW_WIDTH / displayCropWidth, PREVIEW_HEIGHT / displayCropHeight);
  const destinationWidth = Math.min(PREVIEW_WIDTH, displayCropWidth * destinationScale);
  const destinationHeight = Math.min(PREVIEW_HEIGHT, displayCropHeight * destinationScale);
  const destinationX = (PREVIEW_WIDTH - destinationWidth) / 2;
  const destinationY = (PREVIEW_HEIGHT - destinationHeight) / 2;
  const outlineX = clamp(
    destinationX + (boxX - sourceX) / sourceWidth * destinationWidth,
    destinationX,
    destinationX + destinationWidth,
  );
  const outlineY = clamp(
    destinationY + (boxY - sourceY) / sourceHeight * destinationHeight,
    destinationY,
    destinationY + destinationHeight,
  );
  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destinationX,
    destinationY,
    destinationWidth,
    destinationHeight,
    outlineX,
    outlineY,
    outlineWidth: clamp(boxWidth / sourceWidth * destinationWidth, 0, destinationX + destinationWidth - outlineX),
    outlineHeight: clamp(boxHeight / sourceHeight * destinationHeight, 0, destinationY + destinationHeight - outlineY),
  };
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

function drawBoxOutline(context: CanvasRenderingContext2D, geometry: FarmAnnotationBoxPreviewGeometry): void {
  const x = Math.round(geometry.outlineX);
  const y = Math.round(geometry.outlineY);
  const width = Math.max(2, Math.round(geometry.outlineWidth));
  const height = Math.max(2, Math.round(geometry.outlineHeight));
  context.fillStyle = 'rgba(37, 23, 15, 0.92)';
  drawRectOutline(context, x - 1, y - 1, width + 2, height + 2, 3);
  context.fillStyle = '#ffe2a0';
  drawRectOutline(context, x, y, width, height, 1);
}

function drawRectOutline(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
): void {
  context.fillRect(x, y, width, thickness);
  context.fillRect(x, y + height - thickness, width, thickness);
  context.fillRect(x, y, thickness, height);
  context.fillRect(x + width - thickness, y, thickness, height);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
