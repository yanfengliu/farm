import { describe, expect, test } from 'vitest';
import {
  buildFarmBotanyLayout,
  decorativePlantVisualBounds,
  farmGroveAnchors,
  farmTreeShelterAnchor,
  farmTreeVisualBounds,
  wildMeadowPlantKind,
} from '../../src/phaser/view/farmBotany';
import { buildFarmSceneryLayout } from '../../src/phaser/view/farmSceneryLayout';

const WIDTH = 12;
const HEIGHT = 10;
const TILE_SIZE = 32;

function pointInside(point, bounds, padding = 0) {
  return point.x >= bounds.left - padding
    && point.x <= bounds.right + padding
    && point.y >= bounds.top - padding
    && point.y <= bounds.bottom + padding;
}

function boundsIntersect(left, right) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function boundsInside(inner, outer, padding = 0) {
  return inner.left >= outer.left - padding
    && inner.right <= outer.right + padding
    && inner.top >= outer.top - padding
    && inner.bottom <= outer.bottom + padding;
}

describe('farm botany layout', () => {
  test('builds a deterministic, varied woodland frame', () => {
    const first = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE);
    const second = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE);

    expect(second).toEqual(first);
    expect(first.trees.length).toBeGreaterThanOrEqual(16);
    expect(new Set(first.trees.map((tree) => tree.species))).toEqual(new Set([
      'apple',
      'birch',
      'elder',
      'hazel',
      'willow',
    ]));
    expect(new Set(first.trees.filter((tree) => tree.y < 0).map((tree) => tree.species)).size).toBeGreaterThan(1);
    expect(new Set(first.trees.map((tree) => `${tree.x},${tree.y}`)).size).toBe(first.trees.length);
  });

  test('keeps permanent trees and plant clusters clear of expansion and landmarks', () => {
    const scenery = buildFarmSceneryLayout(WIDTH, HEIGHT, TILE_SIZE);
    const botany = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE);
    const bridge = {
      left: scenery.creek.centerX - 28,
      right: scenery.creek.centerX + scenery.creek.width + 28,
      top: scenery.creek.bridgeY - 30,
      bottom: scenery.creek.bridgeY + 30,
    };

    for (const tree of botany.trees) {
      const visualBounds = farmTreeVisualBounds(tree);
      expect(pointInside(tree, scenery.farm, 17), `${tree.species} tree intrudes on expandable land`).toBe(false);
      expect(pointInside(tree, scenery.garden, 24), `${tree.species} tree crowds the cottage garden`).toBe(false);
      expect(pointInside(tree, bridge), `${tree.species} tree blocks the bridge`).toBe(false);
      expect(boundsIntersect(visualBounds, scenery.farm), `${tree.species} pixels intrude on expandable land`).toBe(false);
      expect(boundsIntersect(visualBounds, bridge), `${tree.species} pixels block the bridge`).toBe(false);
      expect(boundsInside(visualBounds, scenery.frame, TILE_SIZE / 2), `${tree.species} pixels clip at recenter`).toBe(true);
    }

    for (const plant of botany.plants) {
      const visualBounds = decorativePlantVisualBounds(plant);
      expect(pointInside(plant, scenery.farm, 5), `${plant.kind} plant intrudes on expandable land`).toBe(false);
      expect(pointInside(plant, bridge), `${plant.kind} plant blocks the bridge`).toBe(false);
      expect(boundsIntersect(visualBounds, scenery.farm), `${plant.kind} pixels intrude on expandable land`).toBe(false);
      expect(boundsIntersect(visualBounds, bridge), `${plant.kind} pixels block the bridge`).toBe(false);
    }
    expect(new Set(botany.plants.map((plant) => plant.kind)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(botany.plants.map((plant) => `${plant.x},${plant.y}`)).size).toBe(botany.plants.length);
  });

  test('keeps shelter art anchored to the first natural grove', () => {
    const state = { width: WIDTH, height: HEIGHT };
    const groves = farmGroveAnchors(state, TILE_SIZE);
    const layout = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE);

    expect(groves[0]).toEqual(layout.groves[0]);
    expect(groves[0]?.trees).toHaveLength(4);
  });

  test('names both duck shelters independently of decorative tree ordering', () => {
    const state = { width: WIDTH, height: HEIGHT };
    const layout = buildFarmBotanyLayout(WIDTH, HEIGHT, TILE_SIZE);
    const elder = farmTreeShelterAnchor(state, TILE_SIZE, 'tree-shelter-elder');
    const hazel = farmTreeShelterAnchor(state, TILE_SIZE, 'tree-shelter-hazel');

    expect(elder).toEqual({ x: -105, y: 31 });
    expect(hazel).toEqual({ x: -83, y: 13 });
    expect(layout.trees).toContainEqual(expect.objectContaining({ ...elder, species: 'elder' }));
    expect(layout.trees).toContainEqual(expect.objectContaining({ ...hazel, species: 'hazel' }));
  });

  test('gives unowned meadow cells sparse, repeatable plant variety', () => {
    const firstPass = [];
    const secondPass = [];
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        firstPass.push(wildMeadowPlantKind(x, y));
        secondPass.push(wildMeadowPlantKind(x, y));
      }
    }

    expect(secondPass).toEqual(firstPass);
    expect(firstPass.filter(Boolean).length).toBeGreaterThanOrEqual(10);
    expect(firstPass.filter(Boolean).length).toBeLessThanOrEqual(24);
    expect(new Set(firstPass.filter(Boolean))).toEqual(new Set([
      'berry',
      'fern',
      'foxglove',
      'lavender',
      'mushroom',
    ]));
  });
});
