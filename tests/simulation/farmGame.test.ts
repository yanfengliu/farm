import { describe, expect, test } from 'vitest';
import {
  advanceFarm,
  createFarmGame,
  getFarmSnapshot,
  renderFarmToText,
  submitFarmCommand,
} from '../../src/game/simulation/farmGame';

function runStarterFarm(ticks: number) {
  const game = createFarmGame({ seed: 'starter-loop' });
  advanceFarm(game, ticks);
  return getFarmSnapshot(game);
}

describe('farm simulation', () => {
  test('starter farm autonomously plants, waters, harvests, and stores crops', () => {
    const state = runStarterFarm(900);

    expect(state.stats.lifetimePlanted.carrot).toBeGreaterThan(0);
    expect(state.stats.lifetimeWatered).toBeGreaterThan(0);
    expect(state.stats.lifetimeHarvested.carrot).toBeGreaterThan(0);
    expect(state.inventory.crops.carrot + state.stats.lifetimeOverflowSold.carrot).toBeGreaterThan(0);
    expect(state.workers[0]?.task.kind).not.toBe('blocked');
  });

  test('same seed and commands produce the same state', () => {
    const first = runStarterFarm(1200);
    const second = runStarterFarm(1200);

    expect(second).toEqual(first);
  });

  test('starter farm has no path tiles', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'no-paths' }));

    expect(Object.values(state.tiles).map((tile) => tile.kind)).not.toContain('path');
  });

  test('legacy saved path tiles load as empty owned land', () => {
    const legacyState = getFarmSnapshot(createFarmGame({ seed: 'legacy-paths' }));
    legacyState.tiles['3,2'] = { x: 3, y: 2, kind: 'path' as never };

    const game = createFarmGame({ seed: 'legacy-paths', state: legacyState });

    expect(getFarmSnapshot(game).tiles['3,2']?.kind).toBe('empty');
  });

  test('manual selling supports per-crop amounts and sell all crops', () => {
    const game = createFarmGame({ seed: 'selling' });
    advanceFarm(game, 1200);

    const before = getFarmSnapshot(game);
    submitFarmCommand(game, { type: 'sellCrop', cropId: 'carrot', amount: 1 });
    advanceFarm(game, 1);
    const afterSingle = getFarmSnapshot(game);

    expect(afterSingle.coins).toBe(before.coins + before.crops.carrot.sellPrice);
    expect(afterSingle.inventory.crops.carrot).toBe(before.inventory.crops.carrot - 1);

    submitFarmCommand(game, { type: 'sellAllCrops' });
    advanceFarm(game, 1);
    const afterAll = getFarmSnapshot(game);

    expect(afterAll.inventory.crops.carrot).toBe(0);
    expect(afterAll.stats.lifetimeManualSold.carrot).toBeGreaterThanOrEqual(1);
  });

  test('seed purchases spend coins and add crop-specific seeds', () => {
    const game = createFarmGame({ seed: 'seed-shop' });
    const before = getFarmSnapshot(game);

    submitFarmCommand(game, { type: 'buySeeds', cropId: 'carrot', amount: 3 });
    advanceFarm(game, 1);

    const after = getFarmSnapshot(game);
    expect(after.coins).toBe(before.coins - before.crops.carrot.seedPrice * 3);
    expect(after.inventory.seeds.carrot).toBe(before.inventory.seeds.carrot + 3);
  });

  test('global tool upgrades spend coins and persist in the farm state', () => {
    const game = createFarmGame({ seed: 'upgrades' });
    const before = getFarmSnapshot(game);

    submitFarmCommand(game, { type: 'buyUpgrade', upgradeId: 'boots' });
    advanceFarm(game, 1);

    const after = getFarmSnapshot(game);
    expect(after.coins).toBe(before.coins - 20);
    expect(after.upgrades.boots).toBe(1);
    expect(after.stats.lifetimeUpgradePurchases).toBe(1);
    expect(renderFarmToText(game)).toContain('upgrades=boots:1,wateringCan:0');
  });

  test('build commands support adjacent land expansion and undo redo', () => {
    const game = createFarmGame({ seed: 'building' });

    submitFarmCommand(game, { type: 'buyLand', x: 1, y: 1 });
    advanceFarm(game, 1);
    submitFarmCommand(game, { type: 'paintTile', x: 1, y: 1, tile: 'plot' });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).tiles['1,1']?.kind).toBe('plot');

    submitFarmCommand(game, { type: 'undo' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).tiles['1,1']?.kind).toBe('empty');

    submitFarmCommand(game, { type: 'redo' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).tiles['1,1']?.kind).toBe('plot');
  });

  test('storage capacity follows storage buildings and removed-capacity crops overflow sell', () => {
    const game = createFarmGame({ seed: 'storage-capacity' });

    submitFarmCommand(game, { type: 'placeBuilding', x: 2, y: 1, building: 'storage' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).inventory.cropCapacity).toBe(30);

    submitFarmCommand(game, { type: 'bulldoze', x: 2, y: 1 });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).inventory.cropCapacity).toBe(15);

    advanceFarm(game, 1200);
    const beforeRemoval = getFarmSnapshot(game);
    const storedBefore = Object.values(beforeRemoval.inventory.crops).reduce((sum, count) => sum + count, 0);
    const overflowBefore = Object.values(beforeRemoval.stats.lifetimeOverflowSold).reduce((sum, count) => sum + count, 0);

    expect(storedBefore).toBeGreaterThan(0);

    submitFarmCommand(game, { type: 'bulldoze', x: 6, y: 2 });
    advanceFarm(game, 1);

    const afterRemoval = getFarmSnapshot(game);
    const storedAfter = Object.values(afterRemoval.inventory.crops).reduce((sum, count) => sum + count, 0);
    const overflowAfter = Object.values(afterRemoval.stats.lifetimeOverflowSold).reduce((sum, count) => sum + count, 0);

    expect(afterRemoval.inventory.cropCapacity).toBe(0);
    expect(storedAfter).toBe(0);
    expect(overflowAfter - overflowBefore).toBe(storedBefore);
  });

  test('text renderer summarizes important playtest state', () => {
    const game = createFarmGame({ seed: 'text' });
    advanceFarm(game, 300);

    expect(renderFarmToText(game)).toContain('workers=1');
    expect(renderFarmToText(game)).toContain('cropMix=carrot:100');
    expect(renderFarmToText(game)).toContain('storage=');
  });
});
