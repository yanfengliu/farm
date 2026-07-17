import { FARMHAND_PORTRAIT_SIZE, drawFarmhandPortrait } from '../phaser/view/farmWorkerArt';
import type { PixelPainter } from '../phaser/view/pixelPainter';

/**
 * Adapts a DOM canvas 2D context to the PixelPainter contract so Inspect
 * portraits reuse the exact scene art. The import pulls no Phaser runtime:
 * the art module's Phaser references are type-only.
 */
function canvasPainter(context: CanvasRenderingContext2D): PixelPainter {
  let fill = 'rgba(0, 0, 0, 1)';
  return {
    fillStyle(color: number, alpha = 1) {
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      fill = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    fillRect(x: number, y: number, width: number, height: number) {
      context.fillStyle = fill;
      context.fillRect(x, y, width, height);
    },
  };
}

export function paintFarmhandPortrait(canvas: HTMLCanvasElement, workerId: number): void {
  canvas.width = FARMHAND_PORTRAIT_SIZE.width;
  canvas.height = FARMHAND_PORTRAIT_SIZE.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawFarmhandPortrait(canvasPainter(context), workerId);
}
