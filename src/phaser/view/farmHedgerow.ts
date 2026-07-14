import type Phaser from 'phaser';
import { buildFarmSceneryLayout, type PixelBounds } from './farmSceneryLayout';
import { coordinateHash, drawGrassTuft } from './farmPixelPrimitives';

export interface HedgerowPixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HedgerowPixelPoint {
  x: number;
  y: number;
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
  lobes: HedgerowPixelRect[];
  leafPockets: HedgerowPixelRect[];
  highlights: HedgerowPixelRect[];
  groundSprouts: HedgerowPixelPoint[];
  sprig: { x: number; top: number; bottom: number; lean: -1 | 1 } | null;
  blossom: { x: number; y: number; color: number } | null;
}

export interface MixedHedgerowLayout {
  shrubs: HedgerowShrub[];
}

const FOLIAGE_COLORS = [0x477a45, 0x3f7242, 0x52814a, 0x497844] as const;
const ACCENT_COLORS = [0x5b8c4d, 0x568749, 0x659554, 0x5e8b4c] as const;
const BLOSSOM_COLORS = [0xe9a5a1, 0xf0cf77, 0xd9b4df, 0xc8d98b] as const;
const ORGANIC_RISE = [0, -5, 2, -2, 5, -1, 3] as const;

function mixedHash(seed: number, count: number, index: number): number {
  return coordinateHash(seed * 17 + index * 29 + 5, count * 31 + index * 43 + 11);
}

export function buildFarmHedgerowPlacements(width: number, height: number, tileSize: number): FarmHedgerowPlacement[] {
  const { farm } = buildFarmSceneryLayout(width, height, tileSize);
  return [
    { id: 'north-west', label: 'North Hedgerow', x: 17, y: -17, count: 3, seed: 3, overlap: 0 },
    { id: 'north-middle', label: 'North Hedgerow', x: Math.round(farm.right * 0.36), y: -14, count: 2, seed: 7, overlap: 0 },
    { id: 'north-east', label: 'North Hedgerow', x: Math.round(farm.right * 0.71), y: -18, count: 3, seed: 11, overlap: 0 },
    { id: 'east', label: 'Wild Hedgerow', x: farm.right + 58, y: 157, count: 5, seed: 19, overlap: 13 },
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
    const width = 21 + (hash % 9);
    const height = 18 + (Math.floor(hash / 13) % 9);
    const patternedRise = ORGANIC_RISE[(index + Math.abs(seed)) % ORGANIC_RISE.length] ?? 0;
    const shrubY = y + patternedRise + (Math.floor(hash / 101) % 3) - 1;
    const leftWidth = Math.ceil(width * 0.4);
    const middleWidth = Math.ceil(width * 0.44);
    const rightWidth = Math.ceil(width * 0.36);
    const lobes: HedgerowPixelRect[] = [
      { x: cursor, y: shrubY + 6, width: leftWidth, height: height - 8 },
      { x: cursor + Math.floor(width * 0.17), y: shrubY + 2, width: middleWidth, height: height - 6 },
      { x: cursor + Math.floor(width * 0.47), y: shrubY, width: Math.ceil(width * 0.41), height: height - 7 },
      { x: cursor + Math.floor(width * 0.68), y: shrubY + 5, width: rightWidth, height: height - 9 },
    ];
    const leafPockets = [
      { x: cursor + 3 + (hash % 4), y: shrubY + height - 8, width: 4, height: 3 },
      { x: cursor + width - 9, y: shrubY + 7 + (Math.floor(hash / 17) % 3), width: 3, height: 3 },
    ];
    const highlightCount = 1 + (Math.floor(hash / 47) % 3);
    const highlights = Array.from({ length: highlightCount }, (_, highlightIndex) => ({
      x: cursor + 3 + (mixedHash(seed + 23, count + 7, index * 3 + highlightIndex) % Math.max(1, width - 7)),
      y: shrubY + 3 + ((Math.floor(hash / (19 + highlightIndex * 8)) + highlightIndex * 3) % Math.max(1, height - 10)),
      width: highlightIndex === 0 ? 3 : 2,
      height: 2,
    }));
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
      foliage: FOLIAGE_COLORS[Math.floor(hash / 7) % FOLIAGE_COLORS.length] ?? FOLIAGE_COLORS[0],
      accent: ACCENT_COLORS[Math.floor(hash / 23) % ACCENT_COLORS.length] ?? ACCENT_COLORS[0],
      lobes,
      leafPockets,
      highlights,
      groundSprouts,
      sprig,
      blossom,
    });

    const edgeGap = (Math.floor(hash / 211) % 6) - 4;
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

function drawPixelLobe(g: Phaser.GameObjects.Graphics, lobe: HedgerowPixelRect, color: number, x = 0, y = 0): void {
  const shoulder = Math.max(2, Math.floor(lobe.width / 5));
  g.fillStyle(color, 1);
  g.fillRect(lobe.x + x + shoulder, lobe.y + y, lobe.width - shoulder * 2, 2);
  g.fillRect(lobe.x + x + 1, lobe.y + y + 2, lobe.width - 2, Math.max(2, lobe.height - 5));
  g.fillRect(lobe.x + x, lobe.y + y + 4, lobe.width, Math.max(2, lobe.height - 8));
  g.fillRect(lobe.x + x + 2, lobe.y + y + lobe.height - 3, lobe.width - 4, 3);
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
    if (shrub.sprig) {
      g.fillStyle(0x775a3d, 1);
      g.fillRect(shrub.sprig.x, shrub.sprig.top + 3, 2, shrub.sprig.bottom - shrub.sprig.top - 3);
      g.fillStyle(0x4a7b45, 1);
      g.fillRect(shrub.sprig.x - 3, shrub.sprig.top + 2, 4, 3);
      g.fillRect(shrub.sprig.x + shrub.sprig.lean, shrub.sprig.top, 5, 3);
    }
  }

  for (const shrub of shrubs) {
    for (const lobe of shrub.lobes) drawPixelLobe(g, lobe, 0x284d38, -1, 2);
    for (const [index, lobe] of shrub.lobes.entries()) {
      drawPixelLobe(g, lobe, index === 1 || index === shrub.lobes.length - 1 ? shrub.accent : shrub.foliage);
    }

    g.fillStyle(0x315f3e, 1);
    for (const pocket of shrub.leafPockets) g.fillRect(pocket.x, pocket.y, pocket.width, pocket.height);

    g.fillStyle(0x91b966, 1);
    for (const highlight of shrub.highlights) g.fillRect(highlight.x, highlight.y, highlight.width, highlight.height);

    if (shrub.blossom) {
      g.fillStyle(shrub.blossom.color, 1);
      g.fillRect(shrub.blossom.x, shrub.blossom.y, 2, 2);
      g.fillStyle(0xffe9a7, 1);
      g.fillRect(shrub.blossom.x + 1, shrub.blossom.y, 1, 1);
    }
    for (const sprout of shrub.groundSprouts) drawGrassTuft(g, sprout.x, sprout.y, 0x739a50);
  }
}
