import type Phaser from 'phaser';
import { drawPixelLeafSpray } from './farmFoliagePrimitives';

export function drawCottagePlants(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  for (const [index, windowX] of [8, 43].entries()) {
    drawPixelLeafSpray(g, x + windowX, y + 37, 0x5f873d, 0x91b966, index + 2, 0x315f3c);
    g.fillStyle(index === 0 ? 0xf4d778 : 0xe9a5a1, 1);
    g.fillRect(x + windowX + 2, y + 38, 2, 1);
    g.fillRect(x + windowX + 5, y + 37, 1, 2);
  }

  g.fillStyle(0x2a5339, 1);
  drawPixelPath(g, x + 3, y + 49, x + 2, y + 31);
  drawPixelLeafSpray(g, x - 2, y + 28, 0x4c7a45, 0x86ad60, 4, 0x2a5339);
  drawPixelLeafSpray(g, x - 1, y + 38, 0x5f873d, 0x91b966, 9, 0x315f3c);
  g.fillStyle(0xf4d778, 1);
  g.fillRect(x + 4, y + 34, 2, 1);
  g.fillRect(x + 5, y + 35, 1, 2);
}

function drawPixelPath(
  g: Phaser.GameObjects.Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / Math.max(1, steps);
    const bend = step > steps * 0.35 && step < steps * 0.7 ? 1 : 0;
    g.fillRect(Math.round(fromX + (toX - fromX) * progress) + bend, Math.round(fromY + (toY - fromY) * progress), 1, 1);
  }
}
