import { describe, expect, test } from 'vitest';
import {
  buildFarmBotanyLayout,
  farmTreeVisualBounds,
} from '../../src/phaser/view/farmBotany';
import { buildFarmSceneryLayout } from '../../src/phaser/view/farmSceneryLayout';
import { creekCenterX } from '../../src/phaser/view/farmWaterside';

const TILE_SIZE = 32;
const WIDTH = 12;
const HEIGHT = 10;

function borderTrees() {
  const layout = buildFarmSceneryLayout(WIDTH, HEIGHT, TILE_SIZE);
  const trees = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE).trees;
  const frame = layout.frame;
  return {
    layout,
    trees: trees.filter((tree) => {
      const bounds = farmTreeVisualBounds(tree);
      return bounds.right < frame.left || bounds.left > frame.right ||
        bounds.bottom < frame.top || bounds.top > frame.bottom;
    }),
  };
}

describe('border woodland framing the meadow', () => {
  test('the outer ring is covered in many trees on every side of the world', () => {
    const { layout, trees } = borderTrees();
    expect(trees.length).toBeGreaterThanOrEqual(120);

    const north = trees.filter((tree) => tree.y < layout.frame.top);
    const south = trees.filter((tree) => tree.y > layout.frame.bottom);
    const west = trees.filter((tree) => tree.x < layout.frame.left);
    const east = trees.filter((tree) => tree.x > layout.frame.right);
    expect(north.length).toBeGreaterThanOrEqual(20);
    expect(south.length).toBeGreaterThanOrEqual(20);
    expect(west.length).toBeGreaterThanOrEqual(15);
    expect(east.length).toBeGreaterThanOrEqual(15);
  });

  test('every woodland tree stays inside the legal camera world and out of the framed view', () => {
    const { layout, trees } = borderTrees();
    for (const tree of trees) {
      const bounds = farmTreeVisualBounds(tree);
      expect(bounds.left).toBeGreaterThanOrEqual(layout.environment.left);
      expect(bounds.right).toBeLessThanOrEqual(layout.environment.right);
      expect(bounds.top).toBeGreaterThanOrEqual(layout.environment.top);
      expect(bounds.bottom).toBeLessThanOrEqual(layout.environment.bottom);
      const insideFrame = bounds.right >= layout.frame.left && bounds.left <= layout.frame.right &&
        bounds.bottom >= layout.frame.top && bounds.top <= layout.frame.bottom;
      expect(insideFrame, `tree at ${tree.x},${tree.y} encroaches on the framed view`).toBe(false);
    }
  });

  test('the woodland leaves the creek water open along its whole run', () => {
    const { layout, trees } = borderTrees();
    for (const tree of trees) {
      const bounds = farmTreeVisualBounds(tree);
      const creekLeft = creekCenterX(layout.creek.centerX, tree.y) - 4;
      const creekRight = creekCenterX(layout.creek.centerX, tree.y) + layout.creek.width + 4;
      const overlapsCreek = bounds.right >= creekLeft && bounds.left <= creekRight;
      expect(overlapsCreek, `tree at ${tree.x},${tree.y} stands in the creek`).toBe(false);
    }
  });

  test('the woodland reads as a natural forest, not a plantation row', () => {
    const { trees } = borderTrees();
    expect(new Set(trees.map((tree) => tree.species)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(trees.map((tree) => `${tree.x},${tree.y}`)).size).toBe(trees.length);
    // Jittered placement: many distinct column and row positions rather than a grid.
    expect(new Set(trees.map((tree) => tree.x % 56)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(trees.map((tree) => tree.y % 56)).size).toBeGreaterThanOrEqual(8);
  });

  test('the woodland is deterministic and leaves the authored groves and shelters untouched', () => {
    const first = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE);
    const second = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE);
    expect(first.trees).toEqual(second.trees);
    expect(first.shelters).toEqual({
      'tree-shelter-elder': { x: -105, y: 31 },
      'tree-shelter-hazel': { x: -83, y: 13 },
    });
    expect(first.groves).toHaveLength(3);
  });
});
