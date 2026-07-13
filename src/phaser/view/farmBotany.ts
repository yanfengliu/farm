import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { buildFarmSceneryLayout, type PixelBounds } from './farmSceneryLayout';
import { coordinateHash } from './farmPixelPrimitives';

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
    { ...westernGrove, trees: [elderOffset, hazelOffset, [42, 24], [17, 42]].map(([x, y]) => [x, y]) },
    { x: farm.right + 32, y: 190, trees: [[0, 18], [29, 0], [52, 20], [21, 47]] },
    { x: 22, y: -35, trees: [[0, 0], [83, 8], [181, -3], [292, 5]] },
  ];
  const groveSpecies: TreeSpecies[][] = [
    ['elder', 'hazel', 'elder', 'hazel'],
    ['apple', 'hazel', 'apple', 'willow'],
    ['birch', 'birch', 'hazel', 'birch'],
  ];
  const trees = groves.flatMap((grove, groveIndex) => grove.trees.map(([dx = 0, dy = 0], treeIndex) => ({
    x: grove.x + dx,
    y: grove.y + dy,
    species: groveSpecies[groveIndex]?.[treeIndex] ?? 'elder',
    variant: groveIndex * 7 + treeIndex,
  })));
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
    { x: farm.right + 17, y: 184, kind: 'foxglove', variant: 12 },
    { x: farm.right + 10, y: 225, kind: 'berry', variant: 13 },
    { x: farm.right + 18, y: 254, kind: 'fern', variant: 14 },
    { x: farm.right + 9, y: 294, kind: 'mushroom', variant: 15 },
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

  return { groves, trees, plants, shelters };
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
    lavender: { left: 4, right: 5, top: 15, bottom: 1 },
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

export function drawFarmBotanyGround(
  g: Phaser.GameObjects.Graphics,
  state: FarmState,
  tileSize: number,
): void {
  const layout = buildFarmBotanyLayout(state.width, state.height, tileSize);
  for (const plant of layout.plants) drawDecorativePlant(g, plant);
  for (const tree of [...layout.trees].sort((left, right) => left.y - right.y)) drawTreeBase(g, tree);
}

export function drawFarmBotanyOverstory(
  g: Phaser.GameObjects.Graphics,
  state: FarmState,
  tileSize: number,
): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const botany = buildFarmBotanyLayout(state.width, state.height, tileSize);
  drawMixedHedgerow(g, 17, -17, 3, 3);
  drawMixedHedgerow(g, Math.round(layout.farm.right * 0.36), -14, 2, 7);
  drawMixedHedgerow(g, Math.round(layout.farm.right * 0.71), -18, 3, 11);
  drawMixedHedgerow(g, layout.farm.right + 58, 157, 5, 19);
  for (const tree of [...botany.trees].sort((left, right) => left.y - right.y)) drawTreeCanopy(g, tree);
}

export function drawWildMeadowBotany(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  tileSize: number,
): void {
  const kind = wildMeadowPlantKind(x, y);
  if (!kind) return;
  const hash = coordinateHash(x + 7, y + 11);
  drawDecorativePlant(g, {
    x: x * tileSize + 8 + (hash % 14),
    y: y * tileSize + 27,
    kind,
    variant: hash,
  });
}

function drawTreeBase(g: Phaser.GameObjects.Graphics, tree: FarmTreePlacement): void {
  const { x, y, species, variant } = tree;
  const shadowWidth = species === 'willow' ? 40 : species === 'birch' ? 22 : 31;
  g.fillStyle(0x294a34, 0.34);
  g.fillRect(x - Math.floor(shadowWidth / 2), y + 20, shadowWidth, 7);

  if (species === 'birch') {
    g.fillStyle(0xd8d1ad, 1);
    g.fillRect(x - 2, y - 1, 5, 27);
    g.fillStyle(0xf0e6c4, 1);
    g.fillRect(x - 1, y, 2, 23);
    g.fillStyle(0x5c5746, 1);
    g.fillRect(x + 1, y + 6, 3, 1);
    g.fillRect(x - 2, y + 13, 3, 1);
    g.fillRect(x + 1, y + 19, 3, 1);
    return;
  }

  g.fillStyle(species === 'willow' ? 0x55432c : 0x674126, 1);
  if (species === 'hazel') {
    g.fillRect(x - 3, y + 5, 4, 21);
    g.fillRect(x + 3, y + 3, 4, 23);
    g.fillRect(x + 8, y + 8, 3, 18);
  } else {
    g.fillRect(x + 2, y + 2, 8, 24);
    g.fillRect(x - 3, y + 7, 7, 4);
    if (variant % 2 === 0) g.fillRect(x + 8, y + 9, 7, 4);
  }
  g.fillStyle(0xa06c3d, 0.9);
  g.fillRect(x + 4, y + 5, 2, 17);
}

function drawTreeCanopy(g: Phaser.GameObjects.Graphics, tree: FarmTreePlacement): void {
  if (tree.species === 'birch') drawBirchCanopy(g, tree.x, tree.y, tree.variant);
  else if (tree.species === 'willow') drawWillowCanopy(g, tree.x, tree.y, tree.variant);
  else if (tree.species === 'apple') drawAppleCanopy(g, tree.x, tree.y, tree.variant);
  else if (tree.species === 'hazel') drawHazelCanopy(g, tree.x, tree.y, tree.variant);
  else drawElderCanopy(g, tree.x, tree.y, tree.variant);
}

function drawElderCanopy(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
  g.fillStyle(0x1d4133, 0.62);
  g.fillRect(x - 15, y - 9, 41, 26);
  g.fillStyle(0x28543d, 1);
  g.fillRect(x - 13, y - 14, 34, 27);
  g.fillRect(x - 15, y - 5, 41, 15);
  g.fillStyle(variant % 2 ? 0x3d7048 : 0x356944, 1);
  g.fillRect(x - 7, y - 20, 23, 18);
  g.fillRect(x + 8, y - 10, 23, 14);
  g.fillStyle(0x8fba67, 1);
  g.fillRect(x - 2, y - 17, 9, 4);
  g.fillRect(x + 14, y - 7, 8, 3);
  if (variant % 3 === 0) {
    g.fillStyle(0x7e668b, 1);
    g.fillRect(x + 2, y - 6, 2, 2);
    g.fillRect(x + 19, y, 2, 2);
  }
}

function drawHazelCanopy(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
  g.fillStyle(0x244a36, 1);
  g.fillRect(x - 13, y - 10, 22, 22);
  g.fillRect(x + 3, y - 15, 23, 24);
  g.fillRect(x - 7, y - 20, 19, 16);
  g.fillStyle(variant % 2 ? 0x4b7b4c : 0x427447, 1);
  g.fillRect(x - 9, y - 15, 14, 11);
  g.fillRect(x + 8, y - 11, 14, 13);
  g.fillStyle(0x9bc26e, 1);
  g.fillRect(x - 4, y - 17, 6, 3);
  g.fillRect(x + 12, y - 8, 7, 3);
}

function drawBirchCanopy(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
  g.fillStyle(0x2e5b3e, 1);
  g.fillRect(x - 10, y - 20, 21, 25);
  g.fillRect(x - 15, y - 13, 31, 15);
  g.fillStyle(variant % 2 ? 0x72a557 : 0x689c50, 1);
  g.fillRect(x - 7, y - 26, 16, 17);
  g.fillRect(x + 4, y - 16, 17, 13);
  g.fillRect(x - 18, y - 9, 15, 10);
  g.fillStyle(0xb4d57d, 1);
  g.fillRect(x - 3, y - 23, 7, 4);
  g.fillRect(x + 9, y - 13, 6, 3);
}

function drawAppleCanopy(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
  g.fillStyle(0x244a34, 1);
  g.fillRect(x - 17, y - 11, 39, 24);
  g.fillStyle(0x3f7043, 1);
  g.fillRect(x - 12, y - 18, 28, 27);
  g.fillRect(x + 7, y - 11, 20, 17);
  g.fillStyle(0x83ad5e, 1);
  g.fillRect(x - 6, y - 15, 10, 4);
  g.fillRect(x + 11, y - 8, 7, 3);
  g.fillStyle(variant % 2 ? 0xe19a54 : 0xd76752, 1);
  g.fillRect(x - 5, y - 4, 3, 3);
  g.fillRect(x + 12, y - 2, 3, 3);
  g.fillRect(x + 3, y + 4, 3, 3);
}

function drawWillowCanopy(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
  g.fillStyle(0x1f4635, 1);
  g.fillRect(x - 21, y - 16, 43, 20);
  g.fillRect(x - 21, y - 7, 49, 14);
  g.fillStyle(variant % 2 ? 0x4f7e49 : 0x477746, 1);
  g.fillRect(x - 15, y - 22, 32, 20);
  g.fillRect(x - 21, y - 10, 15, 23);
  g.fillRect(x + 11, y - 9, 16, 25);
  g.fillStyle(0x79a85a, 1);
  g.fillRect(x - 9, y - 18, 12, 4);
  for (const offset of [-18, -9, 7, 17]) g.fillRect(x + offset, y + 3 + Math.abs(offset % 4), 3, 11);
}

function drawDecorativePlant(g: Phaser.GameObjects.Graphics, plant: FarmPlantPlacement): void {
  const { x, y, kind, variant } = plant;
  if (kind === 'fern') {
    g.fillStyle(0x315f3c, 1);
    g.fillRect(x, y - 10, 2, 11);
    g.fillStyle(variant % 2 ? 0x6e9c50 : 0x79a85a, 1);
    for (let row = 0; row < 4; row += 1) {
      g.fillRect(x - 5 + row, y - 9 + row * 2, 5 - row, 2);
      g.fillRect(x + 2, y - 9 + row * 2, 5 - row, 2);
    }
  } else if (kind === 'foxglove') {
    g.fillStyle(0x557d43, 1);
    g.fillRect(x, y - 14, 2, 15);
    g.fillStyle(variant % 2 ? 0xd597b4 : 0xc5a1d6, 1);
    g.fillRect(x - 3, y - 13, 4, 3);
    g.fillRect(x + 1, y - 10, 4, 3);
    g.fillRect(x - 2, y - 7, 4, 3);
  } else if (kind === 'lavender') {
    g.fillStyle(0x527a42, 1);
    for (const offset of [-3, 0, 3]) g.fillRect(x + offset, y - 9 - Math.abs(offset), 1, 10 + Math.abs(offset));
    g.fillStyle(variant % 2 ? 0x9b87c6 : 0xb09bd2, 1);
    g.fillRect(x - 4, y - 13, 3, 4);
    g.fillRect(x - 1, y - 15, 3, 5);
    g.fillRect(x + 2, y - 12, 3, 4);
  } else if (kind === 'berry') {
    g.fillStyle(0x2a5339, 1);
    g.fillRect(x - 6, y - 8, 14, 8);
    g.fillRect(x - 3, y - 12, 9, 10);
    g.fillStyle(0x5f8f4f, 1);
    g.fillRect(x - 4, y - 10, 5, 3);
    g.fillRect(x + 2, y - 7, 5, 3);
    g.fillStyle(variant % 2 ? 0xc95968 : 0x73567c, 1);
    g.fillRect(x - 2, y - 5, 2, 2);
    g.fillRect(x + 4, y - 9, 2, 2);
  } else {
    g.fillStyle(0xe8d2ad, 1);
    g.fillRect(x - 1, y - 3, 2, 4);
    g.fillRect(x + 5, y - 2, 2, 3);
    g.fillStyle(variant % 2 ? 0xc97859 : 0xd9a45f, 1);
    g.fillRect(x - 3, y - 6, 7, 3);
    g.fillRect(x + 3, y - 4, 6, 2);
  }
}

function drawMixedHedgerow(g: Phaser.GameObjects.Graphics, x: number, y: number, count: number, seed: number): void {
  let cursor = x;
  for (let index = 0; index < count; index += 1) {
    const hash = coordinateHash(seed + index, count + index * 3);
    const width = 17 + (hash % 8);
    const height = 10 + (Math.floor(hash / 7) % 7);
    const offsetY = Math.floor(hash / 41) % 5;
    g.fillStyle(0x244b38, 1);
    g.fillRect(cursor - 3, y + offsetY + 3, width + 7, height - 2);
    g.fillStyle(index % 3 === 0 ? 0x467c4a : 0x3c7045, 1);
    g.fillRect(cursor, y + offsetY, width, height);
    g.fillStyle(0x90b968, 1);
    g.fillRect(cursor + 4 + (hash % 5), y + offsetY + 2, 5, 2);
    if (hash % 4 === 0) {
      g.fillStyle(0xe9a5a1, 1);
      g.fillRect(cursor + width - 4, y + offsetY + 5, 2, 2);
    }
    cursor += width + 10 + (hash % 8);
  }
}
