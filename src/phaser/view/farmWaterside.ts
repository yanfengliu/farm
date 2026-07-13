import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { buildFarmSceneryLayout, FARM_ENVIRONMENT_MARGIN_TILES } from './farmSceneryLayout';
import { coordinateHash } from './farmPixelPrimitives';

export interface CreekLilyLayout {
  x: number;
  y: number;
  size: 8 | 10 | 12;
  notch: 0 | 1 | 2 | 3;
  blossomColor: number | null;
  companion: boolean;
  bridgeY: number;
}

export interface CreekBankPlantLayout {
  x: number;
  y: number;
  kind: 'cattail' | 'iris' | 'sedge';
  bank: 'left' | 'right';
  variant: number;
  bridgeY: number;
}

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

  for (const plant of buildCreekBankPlantLayout(state, tileSize)) drawCreekBankPlant(g, plant);
  for (const lily of buildCreekLilyLayout(state, tileSize)) drawLilyPad(g, lily);
}

export function buildCreekBankPlantLayout(state: FarmState, tileSize: number): CreekBankPlantLayout[] {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const plants: CreekBankPlantLayout[] = [];
  const kinds = ['cattail', 'iris', 'sedge'] as const;
  let y = layout.environment.top + 19;
  let index = 0;

  while (y < layout.environment.bottom - 14) {
    const hash = coordinateHash(index + 83, state.width * 31 + state.height * 47);
    y += 43 + (hash % 37);
    if (Math.abs(y - layout.creek.bridgeY) <= 34) y = layout.creek.bridgeY + 38 + (hash % 17);
    if (y >= layout.environment.bottom - 10) break;
    const bank = index % 2 === 0 ? 'left' : 'right';
    const creekX = creekCenterX(layout.creek.centerX, y);
    plants.push({
      x: bank === 'left'
        ? creekX - 9 - (Math.floor(hash / 13) % 5)
        : creekX + layout.creek.width + 7 + (Math.floor(hash / 17) % 5),
      y,
      kind: kinds[index % kinds.length] ?? 'sedge',
      bank,
      variant: hash,
      bridgeY: layout.creek.bridgeY,
    });
    index += 1;
  }

  return plants;
}

export function buildCreekLilyLayout(state: FarmState, tileSize: number): CreekLilyLayout[] {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const lilies: CreekLilyLayout[] = [];
  const blossomColors = [0xf3c0bc, 0xffe2a0, 0xcbb6e8] as const;
  let y = layout.environment.top + 58;
  let index = 0;

  while (y < layout.environment.bottom - 18) {
    const hash = coordinateHash(index + 41, state.width * 17 + state.height * 29);
    y += 76 + (hash % 67);
    if (Math.abs(y - layout.creek.bridgeY) <= 28) y = layout.creek.bridgeY + 31 + (hash % 13);
    if (y >= layout.environment.bottom - 12) break;
    const channelInset = 6 + positiveModulo(Math.floor(hash / 11), layout.creek.width - 13);
    const size = [8, 10, 12][positiveModulo(Math.floor(hash / 97), 3)] as 8 | 10 | 12;
    const blossomIndex = positiveModulo(Math.floor(hash / 577), blossomColors.length);
    lilies.push({
      x: creekCenterX(layout.creek.centerX, y) + channelInset,
      y,
      size,
      notch: positiveModulo(Math.floor(hash / 31), 4) as 0 | 1 | 2 | 3,
      blossomColor: hash % 5 === 0 ? null : (blossomColors[blossomIndex] ?? blossomColors[0]),
      companion: hash % 4 === 1,
      bridgeY: layout.creek.bridgeY,
    });
    index += 1;
  }

  return lilies;
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

function drawCreekBankPlant(g: Phaser.GameObjects.Graphics, plant: CreekBankPlantLayout): void {
  const direction = plant.bank === 'left' ? -1 : 1;
  if (plant.kind === 'cattail') {
    g.fillStyle(0x759a4a, 1);
    for (const offset of [0, direction * 4, direction * 8]) {
      g.fillRect(plant.x + offset, plant.y - 10 + Math.abs(offset % 3), 2, 12);
    }
    g.fillStyle(0x815338, 1);
    g.fillRect(plant.x, plant.y - 13, 2, 5);
    g.fillRect(plant.x + direction * 8, plant.y - 10, 2, 4);
    return;
  }

  if (plant.kind === 'iris') {
    g.fillStyle(0x5f8b49, 1);
    g.fillRect(plant.x, plant.y - 12, 2, 13);
    g.fillRect(plant.x + direction * 3, plant.y - 8, 1, 9);
    g.fillStyle(plant.variant % 2 ? 0x8999d3 : 0x9b87c6, 1);
    g.fillRect(plant.x - 2, plant.y - 15, 6, 3);
    g.fillRect(plant.x, plant.y - 17, 2, 6);
    g.fillStyle(0xf0cf6a, 1);
    g.fillRect(plant.x + 1, plant.y - 14, 1, 2);
    return;
  }

  g.fillStyle(plant.variant % 2 ? 0x759c50 : 0x89a951, 1);
  g.fillRect(plant.x, plant.y - 9, 1, 10);
  g.fillRect(plant.x + direction * 3, plant.y - 12, 2, 13);
  g.fillRect(plant.x + direction * 7, plant.y - 7, 1, 8);
  g.fillRect(plant.x - direction * 3, plant.y - 6, 2, 7);
}

function drawLilyPad(g: Phaser.GameObjects.Graphics, lily: CreekLilyLayout): void {
  const { x, y, size, notch, blossomColor, companion } = lily;
  const half = Math.floor(size / 2);
  const height = Math.max(4, Math.floor(size / 2));
  g.fillStyle(0x1e4839, 0.5);
  g.fillRect(x - half - 1, y + 1, size + 2, height);
  g.fillStyle(0x28543d, 1);
  g.fillRect(x - half, y, size, height);
  g.fillRect(x - half + 2, y - 2, size - 4, height + 1);
  g.fillStyle(0x397f8c, 1);
  const notchX = notch < 2 ? x - 1 : x + 1;
  g.fillRect(notchX, notch % 2 === 0 ? y - 2 : y, 2, 3);
  if (companion) {
    g.fillStyle(0x356b49, 1);
    g.fillRect(x + half - 1, y + height, 6, 3);
    g.fillRect(x + half, y + height - 1, 4, 4);
  }
  if (blossomColor !== null) {
    const flowerX = x + (notch < 2 ? 2 : -3);
    g.fillStyle(blossomColor, 1);
    g.fillRect(flowerX, y - 4, 3, 3);
    g.fillRect(flowerX - 1, y - 3, 5, 1);
    g.fillStyle(0xffefb0, 1);
    g.fillRect(flowerX + 1, y - 3, 1, 1);
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
