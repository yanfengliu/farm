import type Phaser from 'phaser';
import {
  drawPixelLeafSpray,
  PIXEL_LEAF_SPRAY_HEIGHT,
  PIXEL_LEAF_SPRAY_WIDTH,
} from './farmFoliagePrimitives';
import { buildFarmSceneryLayout, type PixelBounds } from './farmSceneryLayout';
import { coordinateHash, drawGrassTuft } from './farmPixelPrimitives';

interface HedgerowPixelPoint {
  x: number;
  y: number;
}

export interface HedgerowLeafSpray {
  x: number;
  y: number;
  main: number;
  accent: number;
  variant: number;
}

export interface FarmHedgerowPlacement {
  id: 'north-west' | 'north-middle' | 'north-east' | 'east';
  label: string;
  x: number;
  y: number;
  count: number;
  seed: number;
  overlap: number;
}

export interface HedgerowShrub {
  x: number;
  y: number;
  width: number;
  height: number;
  foliage: number;
  accent: number;
  leafSprays: HedgerowLeafSpray[];
  groundSprouts: HedgerowPixelPoint[];
  sprig: { x: number; top: number; bottom: number; lean: -1 | 1 } | null;
  blossom: { x: number; y: number; color: number } | null;
}

export interface MixedHedgerowLayout {
  shrubs: HedgerowShrub[];
}

const FOLIAGE_COLORS = [0x477a45, 0x3f7242, 0x52814a, 0x497844] as const;
const ACCENT_COLORS = [0x5b8c4d, 0x568749, 0x659554, 0x5e8b4c] as const;
const TIP_COLORS = [0x91b966, 0x86ad60, 0x9bc26e] as const;
const BLOSSOM_COLORS = [0xe9a5a1, 0xf0cf77, 0xd9b4df, 0xc8d98b] as const;
const ORGANIC_RISE = [0, -5, 2, -2, 5, -1, 3] as const;
const LEAF_SPRAY_ANCHORS = [
  { x: 0, y: 0.43 },
  { x: 0.14, y: 0.16 },
  { x: 0.42, y: 0 },
  { x: 0.7, y: 0.17 },
  { x: 0.78, y: 0.44 },
  { x: 0.56, y: 0.66 },
  { x: 0.24, y: 0.61 },
] as const;

function mixedHash(seed: number, count: number, index: number): number {
  return coordinateHash(seed * 17 + index * 29 + 5, count * 31 + index * 43 + 11);
}

export function buildFarmHedgerowPlacements(width: number, height: number, tileSize: number): FarmHedgerowPlacement[] {
  const { farm } = buildFarmSceneryLayout(width, height, tileSize);
  return [
    { id: 'north-west', label: 'North Hedgerow', x: 17, y: -28, count: 3, seed: 3, overlap: 0 },
    { id: 'north-middle', label: 'North Hedgerow', x: Math.round(farm.right * 0.36), y: -23, count: 2, seed: 7, overlap: 0 },
    { id: 'north-east', label: 'North Hedgerow', x: Math.round(farm.right * 0.71), y: -28, count: 3, seed: 11, overlap: 0 },
    { id: 'east', label: 'Wild Hedgerow', x: farm.right + 58, y: 157, count: 5, seed: 19, overlap: 3 },
  ];
}

export function buildMixedHedgerowLayout(
  x: number,
  y: number,
  count: number,
  seed: number,
  overlap = 0,
): MixedHedgerowLayout {
  const shrubs: HedgerowShrub[] = [];
  let cursor = x;

  for (let index = 0; index < count; index += 1) {
    const hash = mixedHash(seed, count, index);
    const width = 14 + (Math.floor(hash / 7) % 4);
    const height = 17 + (Math.floor(hash / 13) % 7);
    const patternedRise = ORGANIC_RISE[(index + Math.abs(seed)) % ORGANIC_RISE.length] ?? 0;
    const shrubY = y + patternedRise + (Math.floor(hash / 101) % 3) - 1;
    const foliage = FOLIAGE_COLORS[Math.floor(hash / 7) % FOLIAGE_COLORS.length] ?? FOLIAGE_COLORS[0];
    const accent = ACCENT_COLORS[Math.floor(hash / 23) % ACCENT_COLORS.length] ?? ACCENT_COLORS[0];
    const leafSprays = LEAF_SPRAY_ANCHORS.map((anchor, sprayIndex) => {
      const sprayHash = mixedHash(seed + sprayIndex * 5, count + 11, index * 13 + sprayIndex);
      const sprayX = Math.min(
        cursor + width - PIXEL_LEAF_SPRAY_WIDTH,
        Math.max(
          cursor,
          cursor +
            Math.round((width - PIXEL_LEAF_SPRAY_WIDTH) * anchor.x) +
            ((sprayHash % 3) - 1),
        ),
      );
      const sprayY = Math.min(
        shrubY + height - PIXEL_LEAF_SPRAY_HEIGHT,
        Math.max(
          shrubY,
          shrubY +
            Math.round((height - PIXEL_LEAF_SPRAY_HEIGHT) * anchor.y) +
            ((Math.floor(sprayHash / 7) % 3) - 1),
        ),
      );
      return {
        x: sprayX,
        y: sprayY,
        main: sprayIndex % 3 === 1 ? accent : foliage,
        accent: TIP_COLORS[Math.floor(sprayHash / 17) % TIP_COLORS.length] ?? TIP_COLORS[0],
        variant: sprayHash % 12,
      };
    });
    const sprig =
      Math.floor(hash / 29) % 4 === 1
        ? {
            x: cursor + 5 + (Math.floor(hash / 31) % Math.max(1, width - 10)),
            top: shrubY - 6 - (Math.floor(hash / 67) % 4),
            bottom: shrubY + 9,
            lean: (hash % 2 === 0 ? -1 : 1) as -1 | 1,
          }
        : null;
    const groundSproutCount = 1 + (Math.floor(hash / 73) % 2);
    const groundSprouts = Array.from({ length: groundSproutCount }, (_, sproutIndex) => ({
      x: cursor + 3 + ((Math.floor(hash / (41 + sproutIndex * 12)) + sproutIndex * 11) % Math.max(1, width - 6)),
      y: shrubY + height + 2 + (sproutIndex % 2),
    }));
    const blossom =
      Math.floor(hash / 5) % 4 === 0
        ? {
            x: cursor + 4 + (Math.floor(hash / 19) % Math.max(1, width - 8)),
            y: shrubY + 5 + (Math.floor(hash / 37) % Math.max(1, height - 11)),
            color: BLOSSOM_COLORS[Math.floor(hash / 53) % BLOSSOM_COLORS.length] ?? BLOSSOM_COLORS[0],
          }
        : null;

    shrubs.push({
      x: cursor,
      y: shrubY,
      width,
      height,
      foliage,
      accent,
      leafSprays,
      groundSprouts,
      sprig,
      blossom,
    });

    const edgeGap = (Math.floor(hash / 211) % 4) - 1;
    cursor += width + edgeGap - overlap;
  }

  return { shrubs };
}

export function farmHedgerowVisualBounds(placement: FarmHedgerowPlacement): PixelBounds {
  const { shrubs } = buildMixedHedgerowLayout(
    placement.x,
    placement.y,
    placement.count,
    placement.seed,
    placement.overlap,
  );
  return {
    left: Math.min(...shrubs.map((shrub) => shrub.x - 3)),
    right: Math.max(...shrubs.map((shrub) => shrub.x + shrub.width + 3)),
    top: Math.min(...shrubs.map((shrub) => shrub.sprig?.top ?? shrub.y)),
    bottom: Math.max(...shrubs.map((shrub) => shrub.y + shrub.height + 5)),
  };
}

function drawWoodyStem(
  g: Phaser.GameObjects.Graphics,
  x: number,
  top: number,
  bottom: number,
  lean: -1 | 1,
): void {
  g.fillStyle(0x775a3d, 1);
  for (let stemY = bottom; stemY >= top; stemY -= 2) {
    const drift = Math.floor((bottom - stemY) / 6) * lean;
    g.fillRect(x + drift, stemY - 1, 1, 2);
  }
}

export function drawMixedHedgerow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  count: number,
  seed: number,
  overlap = 0,
): void {
  const { shrubs } = buildMixedHedgerowLayout(x, y, count, seed, overlap);

  for (const shrub of shrubs) {
    const base = shrub.y + shrub.height;
    g.fillStyle(0x4d603b, 0.25);
    g.fillRect(shrub.x + 1, base, Math.ceil(shrub.width * 0.42), 3);
    g.fillRect(shrub.x + Math.floor(shrub.width * 0.54), base + 1, Math.ceil(shrub.width * 0.3), 2);
    const stemHash = coordinateHash(shrub.x, shrub.y);
    drawWoodyStem(
      g,
      shrub.x + 5 + (stemHash % Math.max(1, shrub.width - 10)),
      shrub.y + Math.floor(shrub.height * 0.38),
      base,
      stemHash % 2 === 0 ? -1 : 1,
    );
    drawWoodyStem(
      g,
      shrub.x + Math.floor(shrub.width * 0.7),
      shrub.y + Math.floor(shrub.height * 0.5),
      base,
      stemHash % 2 === 0 ? 1 : -1,
    );
    if (shrub.sprig) {
      drawWoodyStem(g, shrub.sprig.x, shrub.sprig.top + 3, shrub.sprig.bottom, shrub.sprig.lean);
      drawPixelLeafSpray(g, shrub.sprig.x - 3, shrub.sprig.top, 0x4a7b45, 0x91b966, stemHash);
    }
  }

  for (const shrub of shrubs) {
    for (const spray of shrub.leafSprays) {
      drawPixelLeafSpray(g, spray.x, spray.y, spray.main, spray.accent, spray.variant);
    }

    if (shrub.blossom) {
      g.fillStyle(shrub.blossom.color, 1);
      g.fillRect(shrub.blossom.x, shrub.blossom.y, 2, 2);
      g.fillStyle(0xffe9a7, 1);
      g.fillRect(shrub.blossom.x + 1, shrub.blossom.y, 1, 1);
    }
    for (const sprout of shrub.groundSprouts) drawGrassTuft(g, sprout.x, sprout.y, 0x739a50);
  }
}
