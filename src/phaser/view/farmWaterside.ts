import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { buildFarmSceneryLayout, FARM_ENVIRONMENT_MARGIN_TILES } from './farmSceneryLayout';

export function creekCenterX(baseX: number, y: number): number {
  return baseX + Math.round(Math.sin(y / 42) * 6 + Math.sin(y / 91) * 3);
}

export function drawCreekBed(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const streamPadding = FARM_ENVIRONMENT_MARGIN_TILES * tileSize;
  const top = -streamPadding;
  const bottom = state.height * tileSize + streamPadding;
  for (let y = top; y < bottom; y += 8) {
    const x = creekCenterX(layout.creek.centerX, y);
    g.fillStyle(0x2f5039, 0.9);
    g.fillRect(x - 10, y, layout.creek.width + 20, 9);
    g.fillStyle(0x6b7d4b, 0.75);
    g.fillRect(x - 7, y, 5, 9);
    g.fillRect(x + layout.creek.width + 2, y, 5, 9);
    g.fillStyle(0x397f8c, 1);
    g.fillRect(x, y, layout.creek.width, 9);
    g.fillStyle(0x448f99, 0.8);
    g.fillRect(x + 3, y + 1, layout.creek.width - 7, 2);
  }

  for (let y = top + 34; y < bottom; y += 61) {
    const x = creekCenterX(layout.creek.centerX, y);
    drawReeds(g, x - 9, y + 7);
    drawReeds(g, x + layout.creek.width + 7, y + 22);
  }
  for (let y = top + 82; y < bottom; y += 113) drawLilyPad(g, creekCenterX(layout.creek.centerX, y) + 15, y);
}

export function drawCreekBridge(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const y = layout.creek.bridgeY;
  const x = creekCenterX(layout.creek.centerX, y) - 9;
  g.fillStyle(0x2b4534, 0.38);
  g.fillRect(x - 2, y + 8, layout.creek.width + 23, 6);
  g.fillStyle(0x6f472b, 1);
  g.fillRect(x - 2, y + 2, layout.creek.width + 23, 9);
  g.fillStyle(0xb8793e, 1);
  for (let plankX = x; plankX < x + layout.creek.width + 19; plankX += 7) {
    g.fillRect(plankX, y, 5, 13);
    g.fillStyle(0xe0aa61, 0.9);
    g.fillRect(plankX + 1, y + 1, 3, 1);
    g.fillStyle(0xb8793e, 1);
  }
  g.fillStyle(0x50331f, 1);
  g.fillRect(x - 2, y - 2, 3, 17);
  g.fillRect(x + layout.creek.width + 18, y - 2, 3, 17);
}

export function drawCreekShimmer(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number, tick: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const top = layout.environment.top;
  const bottom = layout.environment.bottom;
  for (let y = top; y < bottom; y += 16) {
    const x = creekCenterX(layout.creek.centerX, y);
    g.fillStyle(0x78c4c0, 0.75);
    g.fillRect(x + 3 + positiveModulo(y + tick, 9), y + 4, 9, 1);
    g.fillStyle(0xb3ddd0, 0.42);
    g.fillRect(x + 19 - positiveModulo(y + tick, 7), y + 10, 6, 1);
  }
}

function drawReeds(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x89a951, 1);
  for (const offset of [0, 4, 8]) g.fillRect(x + offset, y - 9 + (offset % 3), 2, 11);
  g.fillStyle(0x8b5a35, 1);
  g.fillRect(x, y - 10, 2, 4);
  g.fillRect(x + 8, y - 8, 2, 4);
}

function drawLilyPad(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x28543d, 1);
  g.fillRect(x - 5, y, 10, 3);
  g.fillRect(x - 3, y - 2, 6, 6);
  g.fillStyle(0xf3c0bc, 1);
  g.fillRect(x, y - 3, 2, 2);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
