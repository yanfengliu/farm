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

const CREEK_BANK_KINDS = ['cattail', 'iris', 'sedge'] as const;
const COMMUNITY_BANK_PATTERN = ['left', 'right', 'right', 'left', 'left', 'right'] as const;
const CATTAIL_HEIGHT_PROFILES = [
  [12, 11, 10],
  [11, 13, 9],
  [13, 10, 12],
  [10, 12, 11],
] as const;
const CATTAIL_LEAN_PROFILES = [
  [-2, 1, 2],
  [-3, 2, 1],
  [-1, 3, 2],
  [-2, 1, 3],
] as const;
const IRIS_BLADE_PROFILES = [
  [[13, -1], [9, 2]],
  [[12, -2], [11, 1]],
  [[14, -1], [8, 3]],
  [[11, -3], [10, 2]],
] as const;
const SEDGE_BLADE_PROFILES = [
  [[10, -2], [13, 1], [8, 3], [7, -3]],
  [[12, -1], [10, 3], [9, 1], [8, -4]],
  [[9, -3], [14, 1], [7, 4], [10, -1]],
  [[11, -2], [12, 2], [10, 3], [6, -4]],
] as const;

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
  let y = layout.environment.top + 19;
  let index = 0;

  while (y < layout.environment.bottom - 14) {
    const hash = coordinateHash(index + 83, state.width * 31 + state.height * 47);
    y += 43 + (hash % 37);
    if (Math.abs(y - layout.creek.bridgeY) <= 34) y = layout.creek.bridgeY + 38 + (hash % 17);
    if (y >= layout.environment.bottom - 10) break;
    const { bank, kind } = creekBankCommunityAt(index, state.width, state.height);
    const creekX = creekCenterX(layout.creek.centerX, y);
    plants.push({
      x: bank === 'left'
        ? creekX - 9 - (Math.floor(hash / 13) % 5)
        : creekX + layout.creek.width + 7 + (Math.floor(hash / 17) % 5),
      y,
      kind,
      bank,
      variant: hash,
      bridgeY: layout.creek.bridgeY,
    });
    index += 1;
  }

  return plants;
}

function creekBankCommunityAt(
  index: number,
  width: number,
  height: number,
): Pick<CreekBankPlantLayout, 'bank' | 'kind'> {
  const communityIndex = Math.floor(index / 6);
  const slot = positiveModulo(index, 6);
  const communityHash = coordinateHash(communityIndex + 197, width * 59 + height * 83);
  const pair = Math.floor(slot / 2);
  const kindDirection = Math.floor(communityHash / 7) % 2 === 0 ? 1 : -1;
  const kindIndex = positiveModulo((communityHash % CREEK_BANK_KINDS.length) + pair * kindDirection, CREEK_BANK_KINDS.length);
  const authoredBank = COMMUNITY_BANK_PATTERN[slot] ?? 'left';
  const mirrorBanks = communityHash % 2 === 1;
  const bank = mirrorBanks ? (authoredBank === 'left' ? 'right' : 'left') : authoredBank;
  return { bank, kind: CREEK_BANK_KINDS[kindIndex] ?? 'sedge' };
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

export function drawCreekBankPlant(g: Phaser.GameObjects.Graphics, plant: CreekBankPlantLayout): void {
  const direction = plant.bank === 'left' ? -1 : 1;
  const profile = positiveModulo(plant.variant, 4);
  if (plant.kind === 'cattail') {
    const heights = CATTAIL_HEIGHT_PROFILES[profile] ?? CATTAIL_HEIGHT_PROFILES[0];
    const leans = CATTAIL_LEAN_PROFILES[profile] ?? CATTAIL_LEAN_PROFILES[0];
    const bladeBases = [plant.x, plant.x + direction * 4, plant.x + direction * 8] as const;
    for (const [blade, baseX] of bladeBases.entries()) {
      drawBankBlade(g, baseX, plant.y + 1, heights[blade] ?? 10, direction * (leans[blade] ?? 1), 0x759a4a);
    }
    g.fillStyle(0x815338, 1);
    drawCattailHeadForBlade(g, bladeBases[0], plant.y + 1, heights[0], direction * leans[0], profile % 2 === 0 ? 5 : 4);
    if (profile !== 1) {
      drawCattailHeadForBlade(g, bladeBases[2], plant.y + 1, heights[2], direction * leans[2], profile === 2 ? 5 : 4);
    }
    return;
  }

  if (plant.kind === 'iris') {
    const blades = IRIS_BLADE_PROFILES[profile] ?? IRIS_BLADE_PROFILES[0];
    drawBankBlade(g, plant.x, plant.y, blades[0][0], direction * blades[0][1], 0x5f8b49);
    drawBankBlade(g, plant.x + direction * 3, plant.y, blades[1][0], direction * blades[1][1], 0x5f8b49);
    g.fillStyle(plant.variant % 2 ? 0x8999d3 : 0x9b87c6, 1);
    drawIrisPetals(g, plant.x, plant.y, direction, profile);
    g.fillStyle(0xf0cf6a, 1);
    g.fillRect(plant.x + (profile === 2 ? direction : 0), plant.y - 15, 1, 2);
    return;
  }

  const sedge = plant.variant % 2 ? 0x759c50 : 0x89a951;
  const blades = SEDGE_BLADE_PROFILES[profile] ?? SEDGE_BLADE_PROFILES[0];
  const bladeBases = [plant.x, plant.x + direction * 3, plant.x + direction * 7, plant.x - direction * 3] as const;
  for (const [blade, baseX] of bladeBases.entries()) {
    const bladeProfile = blades[blade] ?? blades[0];
    drawBankBlade(g, baseX, plant.y, bladeProfile[0], direction * bladeProfile[1], sedge);
  }
}

function drawIrisPetals(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  direction: -1 | 1,
  profile: number,
): void {
  const spread = profile % 2 === 0 ? 4 : 5;
  const topRise = profile >= 2 ? 20 : 19;
  const topDrift = profile === 1 ? -direction : profile === 2 ? direction : 0;
  g.fillRect(x - spread, y - 15, 2, 1);
  g.fillRect(x - spread + 1, y - 14 - (profile === 3 ? 1 : 0), 2, 1);
  g.fillRect(x + spread - 1, y - 15 + (profile === 1 ? 1 : 0), 2, 1);
  g.fillRect(x + spread - 2, y - 14, 2, 1);
  g.fillRect(x + topDrift, y - topRise, 1, 2);
  g.fillRect(x + topDrift + direction, y - topRise + 1, 1, 2);
  g.fillRect(x - 1, y - 13, 2, 1);
  g.fillRect(x + direction * (profile >= 2 ? 2 : 1), y - 12, 2, 1);
  if (profile >= 2) g.fillRect(x - direction * 3, y - 13, 1, 1);
}

function drawBankBlade(
  g: Phaser.GameObjects.Graphics,
  baseX: number,
  baseY: number,
  height: number,
  lean: number,
  color: number,
): void {
  g.fillStyle(color, 1);
  for (let rise = 0; rise < height; rise += 1) {
    const progress = rise / Math.max(1, height - 1);
    const curve = progress > 0.55 ? Math.sign(lean) : 0;
    g.fillRect(baseX + Math.round(lean * progress) + curve, baseY - rise, 1, 1);
  }
}

function drawCattailHead(g: Phaser.GameObjects.Graphics, x: number, top: number, height: 4 | 5): void {
  for (let row = 0; row < height; row += 1) {
    const width = row === 0 || row === height - 1 ? 1 : 2;
    g.fillRect(x - Math.floor(width / 2), top + row, width, 1);
  }
}

function drawCattailHeadForBlade(
  g: Phaser.GameObjects.Graphics,
  baseX: number,
  baseY: number,
  bladeHeight: number,
  lean: number,
  headHeight: 4 | 5,
): void {
  const tipX = baseX + lean + Math.sign(lean);
  drawCattailHead(g, tipX, baseY - bladeHeight - headHeight + 2, headHeight);
}

export function drawLilyPad(g: Phaser.GameObjects.Graphics, lily: CreekLilyLayout): void {
  const { x, y, size, notch, blossomColor, companion } = lily;
  const half = Math.floor(size / 2);
  const pixels = lilyPadPixels(x, y, size, notch);
  g.fillStyle(0x1e4839, 0.5);
  for (const pixel of pixels) g.fillRect(pixel.x + 1, pixel.y + 2, 1, 1);
  for (const pixel of pixels) {
    const edge = pixel.row === pixels.at(-1)?.row || pixel.column === 0;
    const glint = pixel.row === 1 && pixel.column % 3 === 0;
    g.fillStyle(edge ? 0x1e4839 : glint ? 0x4c7a52 : 0x28543d, 1);
    g.fillRect(pixel.x, pixel.y, 1, 1);
  }
  if (companion) {
    const companionRows = [2, 5, 4, 2] as const;
    for (const [row, width] of companionRows.entries()) {
      g.fillStyle(row === companionRows.length - 1 ? 0x28543d : 0x356b49, 1);
      const left = x + half + 1 + Math.floor((5 - width) / 2);
      for (let column = 0; column < width; column += 1) {
        if (row < 2 && column === Math.floor(width / 2)) continue;
        g.fillRect(left + column, y + Math.floor(size / 2) + row, 1, 1);
      }
    }
  }
  if (blossomColor !== null) {
    const flowerX = x + (notch < 2 ? 2 : -3);
    const flowerY = y - 4;
    g.fillStyle(blossomColor, 1);
    g.fillRect(flowerX - 3, flowerY, 2, 1);
    g.fillRect(flowerX + 2, flowerY + 1, 2, 1);
    g.fillRect(flowerX, flowerY - 2, 1, 2);
    g.fillRect(flowerX + 1, flowerY + 2, 1, 2);
    g.fillStyle(0xffefb0, 1);
    g.fillRect(flowerX, flowerY, 2, 1);
  }
}

interface LilyPixel {
  x: number;
  y: number;
  row: number;
  column: number;
}

function lilyPadPixels(x: number, y: number, size: CreekLilyLayout['size'], notch: CreekLilyLayout['notch']): LilyPixel[] {
  const profiles: Record<CreekLilyLayout['size'], readonly [number, number][]> = {
    8: [[4, 1], [7, 0], [8, 0], [7, 1], [4, 2]],
    10: [[5, 1], [8, 0], [10, 0], [9, 0], [7, 1], [4, 3]],
    12: [[5, 2], [9, 0], [12, 0], [11, 1], [9, 1], [7, 2], [4, 4]],
  };
  const gapDrifts = [
    [0, 0, -1, -1, 0],
    [0, 1, 1, 0, 0],
    [-1, -1, 0, 1, 0],
    [1, 1, 0, -1, 0],
  ] as const;
  const rows = profiles[size];
  const top = y - 2;
  const pixels: LilyPixel[] = [];

  for (const [row, [width, inset]] of rows.entries()) {
    const left = x - Math.floor(size / 2) + inset;
    const gapCenter = Math.floor(width / 2) + (gapDrifts[notch][row] ?? 0);
    const cutNotch = row < rows.length - 2;
    for (let column = 0; column < width; column += 1) {
      if (cutNotch && (column === gapCenter || column === gapCenter - 1)) continue;
      pixels.push({ x: left + column, y: top + row, row, column });
    }
  }
  return pixels;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
