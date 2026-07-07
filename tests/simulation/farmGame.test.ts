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

function advanceUntil(
  game: ReturnType<typeof createFarmGame>,
  predicate: () => boolean,
  maxTicks = 4000,
) {
  for (let i = 0; i < maxTicks && !predicate(); i++) {
    advanceFarm(game, 1);
  }
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

  test('starter farm begins with utility storage outside the starter plots', () => {
    const game = createFarmGame({ seed: 'starter-storage' });
    const state = getFarmSnapshot(game);

    expect(state.tiles['7,2']?.kind).toBe('storage');
    expect(['3,3', '4,3', '5,3'].map((key) => state.tiles[key]?.kind)).toEqual(['plot', 'plot', 'plot']);
    expect(state.inventory.cropCapacity).toBe(15);

    advanceFarm(game, 30);

    const active = getFarmSnapshot(game);
    expect(active.stats.lifetimeWorkerDistance).toBeGreaterThan(0);
    expect(active.workers[0]?.task.kind).not.toBe('blocked');
  });

  test('legacy saved path tiles load as empty owned land', () => {
    const legacyState = getFarmSnapshot(createFarmGame({ seed: 'legacy-paths' }));
    legacyState.tiles['3,2'] = { x: 3, y: 2, kind: 'path' as never };

    const game = createFarmGame({ seed: 'legacy-paths', state: legacyState });

    expect(getFarmSnapshot(game).tiles['3,2']?.kind).toBe('empty');
  });

  test('legacy saves recover starter utility storage', () => {
    const oldLayout = getFarmSnapshot(createFarmGame({ seed: 'legacy-storage' }));
    oldLayout.tiles['6,2'] = { x: 6, y: 2, kind: 'storage' };
    delete oldLayout.tiles['7,2'];

    const migrated = createFarmGame({ seed: 'legacy-storage', state: oldLayout });

    expect(getFarmSnapshot(migrated).tiles['6,2']?.kind).toBe('empty');
    expect(getFarmSnapshot(migrated).tiles['7,2']?.kind).toBe('storage');
    expect(getFarmSnapshot(migrated).inventory.cropCapacity).toBe(15);

    const missingStorage = getFarmSnapshot(createFarmGame({ seed: 'missing-storage' }));
    for (const tile of Object.values(missingStorage.tiles)) {
      if (tile.kind === 'storage') tile.kind = 'empty';
    }

    const recovered = createFarmGame({ seed: 'missing-storage', state: missingStorage });

    expect(getFarmSnapshot(recovered).tiles['7,2']?.kind).toBe('storage');
    expect(getFarmSnapshot(recovered).inventory.cropCapacity).toBe(15);
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

  test('alerts the player when workers are waiting for buyable seeds', () => {
    const stalled = getFarmSnapshot(createFarmGame({ seed: 'seed-guidance' }));
    stalled.inventory.seeds = { carrot: 0, wheat: 0, tomato: 0 };
    stalled.coins = stalled.crops.carrot.seedPrice * 2;

    const game = createFarmGame({ seed: 'seed-guidance', state: stalled });
    advanceFarm(game, 1);

    const alertText = getFarmSnapshot(game).alerts.join(' ');
    expect(alertText).toContain('Restock seeds');
    expect(alertText).not.toContain('Inventory');
  });

  test('alerts the player when workers have seeds but no empty plots', () => {
    const stalled = getFarmSnapshot(createFarmGame({ seed: 'plot-guidance' }));
    stalled.inventory.seeds = { carrot: 5, wheat: 0, tomato: 0 };
    stalled.cropMix = { carrot: 1, wheat: 0, tomato: 0 };
    for (const tile of Object.values(stalled.tiles)) {
      if (tile.kind === 'plot') {
        tile.plot = { cropId: 'carrot', growth: 1, water: 100 };
      }
    }

    const game = createFarmGame({ seed: 'plot-guidance', state: stalled });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).alerts.join(' ')).toContain('Paint plots');
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

  test('milestone completion waits for the player to claim the next tier', () => {
    const game = createFarmGame({ seed: 'manual-tier' });

    advanceUntil(game, () => getFarmSnapshot(game).stats.lifetimeHarvested.carrot >= 10);
    const ready = getFarmSnapshot(game);

    expect(ready.stats.lifetimeHarvested.carrot).toBeGreaterThanOrEqual(10);
    expect(ready.tier.level).toBe(1);
    expect(ready.workers).toHaveLength(1);
    expect(ready.tier.unlockedCrops).toEqual(['carrot']);
    expect(ready.alerts.join(' ')).toContain('Tier 2 ready');

    submitFarmCommand(game, { type: 'claimNextTier' });
    advanceFarm(game, 1);
    const claimed = getFarmSnapshot(game);

    expect(claimed.tier.level).toBe(2);
    expect(claimed.workers).toHaveLength(2);
    expect(claimed.inventory.seeds.wheat).toBeGreaterThanOrEqual(4);
    expect(claimed.cropMix.wheat).toBeGreaterThan(0);

    submitFarmCommand(game, { type: 'undo' });
    advanceFarm(game, 1);
    const undone = getFarmSnapshot(game);

    expect(undone.tier.level).toBe(1);
    expect(undone.workers).toHaveLength(1);
    expect(undone.inventory.seeds.wheat).toBe(0);

    submitFarmCommand(game, { type: 'redo' });
    advanceFarm(game, 1);
    const redone = getFarmSnapshot(game);

    expect(redone.tier.level).toBe(2);
    expect(redone.workers).toHaveLength(2);
    expect(redone.inventory.seeds.wheat).toBeGreaterThanOrEqual(4);
  });

  test('multiple workers reserve different planting targets when enough plots are available', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'worker-reservations' }));
    state.workers.push({ id: 2, x: 4, y: 2, task: { kind: 'idle', path: [], progress: 0 } });
    state.inventory.seeds.carrot = 10;

    const game = createFarmGame({ seed: 'worker-reservations', state });
    advanceFarm(game, 1);

    const assignedTargets = getFarmSnapshot(game).workers
      .filter((worker) => worker.task.kind === 'planting')
      .map((worker) => `${worker.task.target?.x},${worker.task.target?.y}`);

    expect(assignedTargets).toHaveLength(2);
    expect(new Set(assignedTargets).size).toBe(assignedTargets.length);
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

  test('plot painting does not replace existing structures', () => {
    const game = createFarmGame({ seed: 'protect-structures' });

    expect(getFarmSnapshot(game).tiles['2,2']?.kind).toBe('well');
    expect(getFarmSnapshot(game).tiles['7,2']?.kind).toBe('storage');

    submitFarmCommand(game, { type: 'paintTile', x: 2, y: 2, tile: 'plot' });
    advanceFarm(game, 1);
    submitFarmCommand(game, { type: 'paintTile', x: 7, y: 2, tile: 'plot' });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).tiles['2,2']?.kind).toBe('well');
    expect(getFarmSnapshot(game).tiles['7,2']?.kind).toBe('storage');

    submitFarmCommand(game, { type: 'bulldoze', x: 2, y: 2 });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).tiles['2,2']?.kind).toBe('empty');
  });

  test('placement tools do not override occupied cells until bulldozed', () => {
    const game = createFarmGame({ seed: 'no-overwrite-build' });

    submitFarmCommand(game, { type: 'placeBuilding', x: 3, y: 3, building: 'storage' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).tiles['3,3']?.kind).toBe('plot');

    submitFarmCommand(game, { type: 'placeBuilding', x: 2, y: 2, building: 'storage' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).tiles['2,2']?.kind).toBe('well');

    submitFarmCommand(game, { type: 'placeBuilding', x: 7, y: 2, building: 'well' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).tiles['7,2']?.kind).toBe('storage');

    submitFarmCommand(game, { type: 'bulldoze', x: 3, y: 3 });
    advanceFarm(game, 1);
    submitFarmCommand(game, { type: 'placeBuilding', x: 3, y: 3, building: 'storage' });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).tiles['3,3']?.kind).toBe('storage');
  });

  test('blocking buildings cannot be placed on workers', () => {
    const game = createFarmGame({ seed: 'worker-safe-build' });

    expect(getFarmSnapshot(game).workers[0]).toMatchObject({ x: 4, y: 2 });
    expect(getFarmSnapshot(game).tiles['4,2']?.kind).toBe('empty');

    submitFarmCommand(game, { type: 'placeBuilding', x: 4, y: 2, building: 'storage' });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).tiles['4,2']?.kind).toBe('empty');
    expect(getFarmSnapshot(game).workers[0]?.task.kind).not.toBe('blocked');
  });

  test('legacy saves recover workers trapped inside blocking buildings', () => {
    const trapped = getFarmSnapshot(createFarmGame({ seed: 'worker-trap-recovery' }));
    trapped.tiles['4,2'] = { x: 4, y: 2, kind: 'storage' };

    const game = createFarmGame({ seed: 'worker-trap-recovery', state: trapped });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).tiles['4,2']?.kind).toBe('empty');
    expect(getFarmSnapshot(game).workers[0]?.task.kind).not.toBe('blocked');
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

    submitFarmCommand(game, { type: 'bulldoze', x: 7, y: 2 });
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
