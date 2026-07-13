import type Phaser from 'phaser';

export function coordinateHash(x: number, y: number): number {
  return Math.abs((x * 73856093) ^ (y * 19349663));
}

export function tileVariant(x: number, y: number, colors: readonly number[]): number {
  return colors[Math.abs((x * 17 + y * 31) % colors.length)] ?? colors[0] ?? 0xffffff;
}

export function drawGrassTuft(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
  g.fillStyle(color, 0.9);
  g.fillRect(x, y - 4, 1, 5);
  g.fillRect(x - 2, y - 2, 2, 1);
  g.fillRect(x + 1, y - 3, 2, 1);
}

export function drawFlowerClump(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  drawGrassTuft(g, x, y + 3, 0x70984f);
  g.fillStyle(seed % 2 === 0 ? 0xf4d778 : 0xe9a5a1, 1);
  g.fillRect(x - 1, y, 2, 2);
  g.fillStyle(0xffefb0, 1);
  g.fillRect(x, y, 1, 1);
}
