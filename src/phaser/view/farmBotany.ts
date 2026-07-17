import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { drawDecorativePlant, drawTreeBase, drawTreeCanopy } from './farmBotanyArt';
import { buildFarmHedgerowPlacements, drawMixedHedgerow } from './farmHedgerow';
import { buildFarmSceneryLayout, type FarmSceneryLayout, type PixelBounds } from './farmSceneryLayout';
import { coordinateHash } from './farmPixelPrimitives';
import { creekCenterX } from './farmWaterside';

export type TreeSpecies = 'apple' | 'birch' | 'elder' | 'hazel' | 'willow';
export type DecorativePlantKind = 'berry' | 'fern' | 'foxglove' | 'lavender' | 'mushroom';
export type FarmTreeShelterId = 'tree-shelter-elder' | 'tree-shelter-hazel';

export interface PixelPoint {
  x: number;
  y: number;
}

export interface FarmGroveAnchor {
  x: number;
  y: number;
  trees: number[][];
}

export interface FarmTreePlacement {
  x: number;
  y: number;
  species: TreeSpecies;
  variant: number;
}

export interface FarmPlantPlacement {
  x: number;
  y: number;
  kind: DecorativePlantKind;
  variant: number;
}

export interface FarmBotanyLayout {
  groves: FarmGroveAnchor[];
  trees: FarmTreePlacement[];
  plants: FarmPlantPlacement[];
  shelters: Record<FarmTreeShelterId, PixelPoint>;
}

export function buildFarmBotanyLayout(width: number, height: number, tileSize: number): FarmBotanyLayout {
  const { farm } = buildFarmSceneryLayout(width, height, tileSize);
  const westernGrove = { x: -105, y: 11 };
  const elderOffset = [0, 20] as const;
  const hazelOffset = [22, 2] as const;
  const groves: FarmGroveAnchor[] = [
    { ...westernGrove, trees: [elderOffset, hazelOffset, [26, 64], [17, 42]].map(([x, y]) => [x, y]) },
    { x: farm.right + 32, y: 210, trees: [[0, 18], [29, 0], [52, 20], [21, 124]] },
    { x: 22, y: -35, trees: [[0, 0], [83, 8], [181, -3], [292, 5]] },
  ];
  const groveSpecies: TreeSpecies[][] = [
    ['elder', 'hazel', 'elder', 'hazel'],
    ['apple', 'hazel', 'apple', 'willow'],
    ['birch', 'birch', 'hazel', 'birch'],
  ];
  const trees = groves.flatMap((grove, groveIndex) =>
    grove.trees.map(([dx = 0, dy = 0], treeIndex) => ({
      x: grove.x + dx,
      y: grove.y + dy,
      species: groveSpecies[groveIndex]?.[treeIndex] ?? 'elder',
      variant: groveIndex * 7 + treeIndex,
    })),
  );
  trees.push(
    { x: -96, y: 110, species: 'willow', variant: 23 },
    { x: -98, y: farm.bottom - 38, species: 'willow', variant: 29 },
    { x: 142, y: farm.bottom + 24, species: 'elder', variant: 31 },
    { x: 276, y: farm.bottom + 27, species: 'hazel', variant: 37 },
  );

  const plants: FarmPlantPlacement[] = [
    { x: -26, y: 78, kind: 'fern', variant: 0 },
    { x: -18, y: 103, kind: 'foxglove', variant: 1 },
    { x: -24, y: 126, kind: 'berry', variant: 2 },
    { x: -17, y: 220, kind: 'lavender', variant: 3 },
    { x: -26, y: 245, kind: 'fern', variant: 4 },
    { x: -20, y: 286, kind: 'mushroom', variant: 5 },
    { x: 58, y: -9, kind: 'foxglove', variant: 6 },
    { x: 91, y: -11, kind: 'fern', variant: 7 },
    { x: 151, y: -8, kind: 'lavender', variant: 8 },
    { x: 218, y: -10, kind: 'berry', variant: 9 },
    { x: 329, y: -8, kind: 'foxglove', variant: 10 },
    { x: farm.right + 9, y: 164, kind: 'lavender', variant: 11 },
    { x: farm.right + 49, y: 184, kind: 'foxglove', variant: 12 },
    { x: farm.right + 10, y: 225, kind: 'berry', variant: 13 },
    { x: farm.right + 18, y: 254, kind: 'fern', variant: 14 },
    { x: farm.right + 7, y: 294, kind: 'mushroom', variant: 15 },
    { x: 35, y: farm.bottom + 16, kind: 'mushroom', variant: 16 },
    { x: 70, y: farm.bottom + 16, kind: 'fern', variant: 17 },
    { x: 105, y: farm.bottom + 16, kind: 'lavender', variant: 18 },
    { x: 189, y: farm.bottom + 16, kind: 'foxglove', variant: 19 },
    { x: 226, y: farm.bottom + 16, kind: 'berry', variant: 20 },
    { x: 319, y: farm.bottom + 16, kind: 'fern', variant: 21 },
  ];

  const shelters: Record<FarmTreeShelterId, PixelPoint> = {
    'tree-shelter-elder': { x: westernGrove.x + elderOffset[0], y: westernGrove.y + elderOffset[1] },
    'tree-shelter-hazel': { x: westernGrove.x + hazelOffset[0], y: westernGrove.y + hazelOffset[1] },
  };
  trees.push(...borderWoodlandTrees(width, height, tileSize));
  return { groves, trees, plants, shelters };
}

/**
 * A deterministic woodland ringing the legal camera world, so panning to any
 * edge meets forest instead of open quilt. Trees grow from a jittered lattice
 * with density thinning from the world edge toward the framed view; species
 * pools differ per side so the forest reads as terrain, not decoration. Every
 * placement keeps its visual bounds inside the environment, outside the framed
 * view (which contains all protected landmarks), and off the creek water.
 */
function borderWoodlandTrees(width: number, height: number, tileSize: number): FarmTreePlacement[] {
  const layout = buildFarmSceneryLayout(width, height, tileSize);
  const { environment, frame } = layout;
  const breathing = 26;
  const step = 52;
  const trees: FarmTreePlacement[] = [];
  for (let latticeY = environment.top + 30; latticeY <= environment.bottom - 30; latticeY += step) {
    for (let latticeX = environment.left + 30; latticeX <= environment.right - 30; latticeX += step) {
      const hash = coordinateHash(latticeX + 101, latticeY + 57);
      const x = latticeX + (hash % 37) - 18;
      const y = latticeY + ((hash >> 3) % 33) - 16;
      const edgeDistance = Math.min(
        x - environment.left,
        environment.right - x,
        y - environment.top,
        environment.bottom - y,
      );
      const presence = edgeDistance < 130 ? 88 : edgeDistance < 250 ? 55 : 30;
      if (hash % 100 >= presence) continue;
      const species = borderSpecies(frame, x, y, hash);
      const candidate: FarmTreePlacement = { x, y, species, variant: 100 + (hash % 97) };
      if (!borderTreeFits(candidate, layout, breathing)) continue;
      trees.push(candidate);
    }
  }
  return trees;
}

function borderSpecies(frame: PixelBounds, x: number, y: number, hash: number): TreeSpecies {
  const pools: Record<'north' | 'south' | 'west' | 'east', TreeSpecies[]> = {
    north: ['birch', 'hazel', 'birch', 'elder'],
    south: ['willow', 'elder', 'hazel', 'willow'],
    west: ['elder', 'willow', 'hazel', 'elder'],
    east: ['apple', 'hazel', 'birch', 'apple'],
  };
  const side = y < frame.top ? 'north' : y > frame.bottom ? 'south' : x < frame.left ? 'west' : 'east';
  const pool = pools[side];
  return pool[(hash >> 5) % pool.length] ?? 'elder';
}

function borderTreeFits(tree: FarmTreePlacement, layout: FarmSceneryLayout, breathing: number): boolean {
  const bounds = farmTreeVisualBounds(tree);
  const { environment, frame, creek } = layout;
  if (bounds.left < environment.left || bounds.right > environment.right) return false;
  if (bounds.top < environment.top || bounds.bottom > environment.bottom) return false;
  const nearFrame = bounds.right >= frame.left - breathing && bounds.left <= frame.right + breathing &&
    bounds.bottom >= frame.top - breathing && bounds.top <= frame.bottom + breathing;
  if (nearFrame) return false;
  const creekLeft = creekCenterX(creek.centerX, tree.y) - 6;
  const creekRight = creekCenterX(creek.centerX, tree.y) + creek.width + 6;
  if (bounds.right >= creekLeft && bounds.left <= creekRight) return false;
  return true;
}

export function farmGroveAnchors(state: Pick<FarmState, 'width' | 'height'>, tileSize: number): FarmGroveAnchor[] {
  return buildFarmBotanyLayout(state.width, state.height, tileSize).groves;
}

export function farmTreeShelterAnchor(
  state: Pick<FarmState, 'width' | 'height'>,
  tileSize: number,
  shelter: FarmTreeShelterId,
): PixelPoint {
  return buildFarmBotanyLayout(state.width, state.height, tileSize).shelters[shelter];
}

export function farmTreeVisualBounds(tree: FarmTreePlacement): PixelBounds {
  const extents: Record<TreeSpecies, { left: number; right: number; top: number }> = {
    apple: { left: 17, right: 27, top: 18 },
    birch: { left: 18, right: 21, top: 26 },
    elder: { left: 15, right: 31, top: 20 },
    hazel: { left: 15, right: 26, top: 20 },
    willow: { left: 21, right: 28, top: 22 },
  };
  const extent = extents[tree.species];
  return { left: tree.x - extent.left, right: tree.x + extent.right, top: tree.y - extent.top, bottom: tree.y + 27 };
}

export function decorativePlantVisualBounds(plant: FarmPlantPlacement): PixelBounds {
  const extents: Record<DecorativePlantKind, { left: number; right: number; top: number; bottom: number }> = {
    berry: { left: 6, right: 8, top: 12, bottom: 0 },
    fern: { left: 5, right: 7, top: 10, bottom: 1 },
    foxglove: { left: 3, right: 5, top: 14, bottom: 1 },
    lavender: { left: 4, right: 5, top: 16, bottom: 1 },
    mushroom: { left: 3, right: 9, top: 6, bottom: 1 },
  };
  const extent = extents[plant.kind];
  return {
    left: plant.x - extent.left,
    right: plant.x + extent.right,
    top: plant.y - extent.top,
    bottom: plant.y + extent.bottom,
  };
}

export function wildMeadowPlantKind(x: number, y: number): DecorativePlantKind | null {
  const variant = coordinateHash(x + 13, y + 29) % 31;
  return (['fern', 'mushroom', 'berry', 'lavender', 'foxglove'] as const)[variant] ?? null;
}

export function drawFarmBotanyGround(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const layout = buildFarmBotanyLayout(state.width, state.height, tileSize);
  for (const plant of layout.plants) drawDecorativePlant(g, plant);
  for (const tree of [...layout.trees].sort((left, right) => left.y - right.y)) drawTreeBase(g, tree);
}

export function drawFarmBotanyOverstory(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const layout = buildFarmBotanyLayout(state.width, state.height, tileSize);
  for (const hedge of buildFarmHedgerowPlacements(state.width, state.height, tileSize)) {
    drawMixedHedgerow(g, hedge.x, hedge.y, hedge.count, hedge.seed, hedge.overlap);
  }
  for (const tree of [...layout.trees].sort((left, right) => left.y - right.y)) drawTreeCanopy(g, tree);
}

export function drawWildMeadowBotany(g: Phaser.GameObjects.Graphics, x: number, y: number, tileSize: number): void {
  const kind = wildMeadowPlantKind(x, y);
  if (!kind) return;
  const hash = coordinateHash(x + 7, y + 11);
  drawDecorativePlant(g, { x: x * tileSize + 8 + (hash % 14), y: y * tileSize + 27, kind, variant: hash });
}
