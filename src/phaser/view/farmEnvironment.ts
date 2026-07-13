import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';

export const FARM_ENVIRONMENT_MARGIN_TILES = 14;

export function drawFarmEnvironment(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const margin = FARM_ENVIRONMENT_MARGIN_TILES * tileSize;
  g.fillStyle(0x496f3d, 1);
  g.fillRect(-margin, -margin, state.width * tileSize + margin * 2, state.height * tileSize + margin * 2);

  for (let y = -FARM_ENVIRONMENT_MARGIN_TILES; y < state.height + FARM_ENVIRONMENT_MARGIN_TILES; y += 1) {
    for (let x = -FARM_ENVIRONMENT_MARGIN_TILES; x < state.width + FARM_ENVIRONMENT_MARGIN_TILES; x += 1) {
      const px = x * tileSize;
      const py = y * tileSize;
      g.fillStyle(tileVariant(x, y, [0x527b43, 0x4b733e, 0x577f46]), 0.42);
      g.fillRect(px, py, tileSize, tileSize);
      const hash = coordinateHash(x, y);
      if (hash % 7 === 0) drawFlowerClump(g, px + 7 + (hash % 15), py + 9 + (hash % 11), hash);
      if (hash % 13 === 0) drawMeadowRock(g, px + 6 + (hash % 17), py + 8 + (hash % 12));
      if (hash % 5 === 0) drawGrassTuft(g, px + 5 + (hash % 19), py + 7 + (hash % 16), 0x79a75a);
    }
  }

  const eastEdge = state.width * tileSize;
  drawCreek(g);
  drawCottage(g, eastEdge + 16, 22);
  drawSteppingPath(g, eastEdge);
  drawTreeGrove(g, -20, 18, 0);
  drawTreeGrove(g, eastEdge + 72, 248, 1);
  drawFarmSign(g, eastEdge + 4, 104);
}

export function drawWildMeadowCell(g: Phaser.GameObjects.Graphics, x: number, y: number, tileSize: number): void {
  const px = x * tileSize;
  const py = y * tileSize;
  g.fillStyle(tileVariant(x, y, [0x4e7640, 0x557d45, 0x496f3d]), 0.62);
  g.fillRect(px, py, tileSize, tileSize);
  if (coordinateHash(x, y) % 4 === 0) drawGrassTuft(g, px + 10, py + 13, 0x7fac5c);
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

export function drawCreekShimmer(g: Phaser.GameObjects.Graphics, tick: number): void {
  for (let y = -80; y < 390; y += 8) {
    const sway = Math.round(Math.sin(y / 35) * 7);
    const x = -72 + sway;
    g.fillStyle(0x55a4aa, 0.8);
    g.fillRect(x + 3 + ((y + tick) % 9), y + 2, 10, 1);
    g.fillStyle(0x8bc4b7, 0.55);
    g.fillRect(x + 18 - ((y + tick) % 7), y + 6, 7, 1);
  }
}

function drawCreek(g: Phaser.GameObjects.Graphics): void {
  for (let y = -80; y < 390; y += 8) {
    const sway = Math.round(Math.sin(y / 35) * 7);
    const x = -72 + sway;
    g.fillStyle(0x36593e, 0.75);
    g.fillRect(x - 7, y, 45, 9);
    g.fillStyle(0x397f8c, 1);
    g.fillRect(x, y, 31, 9);
  }
  for (const y of [22, 86, 151, 224, 301]) {
    const sway = Math.round(Math.sin(y / 35) * 7);
    drawReeds(g, -78 + sway, y);
    drawReeds(g, -35 + sway, y + 13);
  }
  g.fillStyle(0x80603d, 1);
  g.fillRect(-77, 171, 43, 6);
  g.fillStyle(0xc19055, 1);
  for (let x = -74; x < -36; x += 7) g.fillRect(x, 169, 4, 10);
  g.fillStyle(0xe0b76d, 0.8);
  g.fillRect(-73, 170, 35, 1);
}

function drawReeds(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x7d9a4c, 1);
  for (const offset of [0, 4, 8]) g.fillRect(x + offset, y - 9 + (offset % 3), 2, 11);
  g.fillStyle(0x8b5a35, 1);
  g.fillRect(x, y - 10, 2, 4);
  g.fillRect(x + 8, y - 8, 2, 4);
}

function drawCottage(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x30482f, 0.42);
  g.fillRect(x - 9, y + 44, 72, 12);
  g.fillStyle(0x8f5d38, 1);
  g.fillRect(x, y + 18, 54, 34);
  g.fillStyle(0xd8a75f, 1);
  g.fillRect(x + 4, y + 22, 46, 27);
  g.fillStyle(0x6f3428, 1);
  g.fillRect(x - 7, y + 12, 68, 8);
  g.fillStyle(0xb94f3b, 1);
  for (let row = 0; row < 4; row += 1) g.fillRect(x - 4 + row * 2, y + 8 + row * 3, 62 - row * 4, 4);
  g.fillStyle(0xeb8862, 0.9);
  g.fillRect(x + 2, y + 11, 52, 2);
  g.fillStyle(0x694229, 1);
  g.fillRect(x + 22, y + 31, 13, 21);
  g.fillStyle(0x3a6170, 1);
  g.fillRect(x + 7, y + 29, 10, 10);
  g.fillRect(x + 40, y + 29, 10, 10);
  g.fillStyle(0x9bd1c5, 1);
  g.fillRect(x + 9, y + 31, 6, 5);
  g.fillRect(x + 42, y + 31, 6, 5);
  g.fillStyle(0xffd879, 1);
  g.fillRect(x + 31, y + 41, 2, 2);
  g.fillStyle(0x754130, 1);
  g.fillRect(x + 43, y - 1, 8, 15);
  g.fillStyle(0xdbc6a0, 0.5);
  g.fillRect(x + 46, y - 6, 5, 4);
  g.fillRect(x + 49, y - 11, 4, 3);
}

function drawSteppingPath(g: Phaser.GameObjects.Graphics, eastEdge: number): void {
  const stones = [
    [eastEdge + 39, 80], [eastEdge + 32, 92], [eastEdge + 25, 104],
    [eastEdge + 18, 116], [eastEdge + 11, 128], [eastEdge + 5, 140],
  ];
  for (const [x, y] of stones) {
    g.fillStyle(0x40583d, 0.35);
    g.fillRect(x - 1, y + 4, 13, 4);
    g.fillStyle(0x8d9277, 1);
    g.fillRect(x, y, 11, 6);
    g.fillStyle(0xb9b48e, 0.8);
    g.fillRect(x + 2, y + 1, 5, 1);
  }
}

function drawTreeGrove(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
  for (const [dx, dy] of [[0, 20], [22, 2], [42, 24], [17, 42]]) {
    const px = x + dx;
    const py = y + dy;
    g.fillStyle(0x354b30, 0.42);
    g.fillRect(px - 9, py + 17, 32, 8);
    g.fillStyle(0x674126, 1);
    g.fillRect(px + 4, py + 7, 7, 18);
    g.fillStyle(variant ? 0x356342 : 0x3d6d3c, 1);
    g.fillRect(px - 6, py - 7, 28, 20);
    g.fillStyle(variant ? 0x4f8351 : 0x56864a, 1);
    g.fillRect(px - 2, py - 13, 20, 20);
    g.fillStyle(0x7ca35e, 0.9);
    g.fillRect(px + 3, py - 10, 8, 3);
  }
}

function drawFarmSign(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x5e3823, 1);
  g.fillRect(x + 7, y + 13, 4, 16);
  g.fillRect(x + 30, y + 13, 4, 16);
  g.fillStyle(0xa96835, 1);
  g.fillRect(x, y, 42, 18);
  g.fillStyle(0xd99c58, 1);
  g.fillRect(x + 3, y + 3, 36, 3);
  g.fillStyle(0x5f3c27, 1);
  g.fillRect(x + 8, y + 9, 4, 3);
  g.fillRect(x + 15, y + 7, 3, 7);
  g.fillRect(x + 22, y + 9, 11, 3);
}

function drawMeadowRock(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x536052, 1);
  g.fillRect(x, y + 2, 7, 4);
  g.fillStyle(0x7b8975, 1);
  g.fillRect(x + 1, y, 5, 4);
  g.fillStyle(0xa4ad91, 0.75);
  g.fillRect(x + 2, y + 1, 2, 1);
}

function tileVariant(x: number, y: number, colors: number[]): number {
  return colors[Math.abs((x * 17 + y * 31) % colors.length)] ?? colors[0];
}

function coordinateHash(x: number, y: number): number {
  return Math.abs((x * 73856093) ^ (y * 19349663));
}
