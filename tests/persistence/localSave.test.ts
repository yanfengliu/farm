import { beforeEach, describe, expect, test } from 'vitest';
import { advanceFarm, createFarmGame, getFarmSnapshot, submitFarmCommand } from '../../src/game/simulation/farmGame';
import { clearFarmSave, loadSavedFarmState, saveFarmState } from '../../src/persistence/localSave';

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();
  failWrites = false;
  failDeletes = false;

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failDeletes) throw new DOMException('Storage access denied', 'SecurityError');
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    this.#values.set(key, value);
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storage,
});

describe('local farm save boundary', () => {
  beforeEach(() => {
    storage.clear();
    storage.failWrites = false;
    storage.failDeletes = false;
  });

  test('round-trips a complete farm state', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'save-round-trip' }));

    expect(saveFarmState(state)).toBe(true);

    expect(loadSavedFarmState()).toEqual(state);
  });

  test('fails closed without replacing the last good save when storage rejects a write', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'save-quota' }));
    expect(saveFarmState(state)).toBe(true);
    const lastGoodSave = storage.getItem('farm.autosave.v1');

    storage.failWrites = true;
    state.coins += 100;

    expect(saveFarmState(state)).toBe(false);
    expect(storage.getItem('farm.autosave.v1')).toBe(lastGoodSave);
  });

  test('reports a rejected save reset without throwing', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'clear-failure' }));
    expect(saveFarmState(state)).toBe(true);
    storage.failDeletes = true;

    expect(clearFarmSave()).toBe(false);
    expect(loadSavedFarmState()).toEqual(state);
  });

  test('rejects malformed JSON and unsupported versions', () => {
    storage.setItem('farm.autosave.v1', '{broken');
    expect(loadSavedFarmState()).toBeNull();

    storage.setItem('farm.autosave.v1', JSON.stringify({ version: 2 }));
    expect(loadSavedFarmState()).toBeNull();
  });

  test('rejects partial version-one objects before they reach simulation normalization', () => {
    storage.setItem('farm.autosave.v1', JSON.stringify({ version: 1 }));
    expect(loadSavedFarmState()).toBeNull();

    const state = getFarmSnapshot(createFarmGame({ seed: 'invalid-save-shape' }));
    storage.setItem('farm.autosave.v1', JSON.stringify({ ...state, workers: null }));
    expect(loadSavedFarmState()).toBeNull();

    const badHistory = getFarmSnapshot(createFarmGame({ seed: 'invalid-history' }));
    badHistory.history.undo = ['{broken'];
    storage.setItem('farm.autosave.v1', JSON.stringify(badHistory));
    expect(loadSavedFarmState()).toBeNull();
  });

  test('rejects maps that cannot support a reachable farm', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'invalid-map-shape' }));

    storage.setItem('farm.autosave.v1', JSON.stringify({ ...state, tiles: {} }));
    expect(loadSavedFarmState()).toBeNull();

    const mismatchedTileKey = structuredClone(state);
    mismatchedTileKey.tiles['99,99'] = mismatchedTileKey.tiles['3,3'];
    delete mismatchedTileKey.tiles['3,3'];
    storage.setItem('farm.autosave.v1', JSON.stringify(mismatchedTileKey));
    expect(loadSavedFarmState()).toBeNull();

    const outOfBoundsWorker = structuredClone(state);
    outOfBoundsWorker.workers[0]!.x = state.width;
    storage.setItem('farm.autosave.v1', JSON.stringify(outOfBoundsWorker));
    expect(loadSavedFarmState()).toBeNull();

    const workerOnWildMeadow = structuredClone(state);
    workerOnWildMeadow.workers[0]!.x = 0;
    workerOnWildMeadow.workers[0]!.y = 0;
    storage.setItem('farm.autosave.v1', JSON.stringify(workerOnWildMeadow));
    expect(loadSavedFarmState()).toBeNull();

    const disconnectedLand = structuredClone(state);
    disconnectedLand.tiles['0,0'] = { x: 0, y: 0, kind: 'empty' };
    storage.setItem('farm.autosave.v1', JSON.stringify(disconnectedLand));
    expect(loadSavedFarmState()).toBeNull();

    const isolatedStarter = structuredClone(state);
    isolatedStarter.tiles = { '0,0': { x: 0, y: 0, kind: 'empty' } };
    isolatedStarter.workers[0]!.x = 0;
    isolatedStarter.workers[0]!.y = 0;
    storage.setItem('farm.autosave.v1', JSON.stringify(isolatedStarter));
    expect(loadSavedFarmState()).toBeNull();
  });

  test('rejects fractional crop quantities before simulation can spend them below zero', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'fractional-inventory' }));
    state.inventory.seeds.carrot = 0.5;

    storage.setItem('farm.autosave.v1', JSON.stringify(state));

    expect(loadSavedFarmState()).toBeNull();
  });

  test('rejects unsafe worker paths and duplicate worker identities', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'invalid-worker-state' }));
    state.workers[0]!.task.path = [{ x: 999, y: 999 }];
    state.workers[0]!.task.progress = 3;
    storage.setItem('farm.autosave.v1', JSON.stringify(state));
    expect(loadSavedFarmState()).toBeNull();

    const duplicateWorkers = getFarmSnapshot(createFarmGame({ seed: 'duplicate-workers' }));
    duplicateWorkers.workers.push({
      id: duplicateWorkers.workers[0]!.id,
      x: 3,
      y: 2,
      task: { kind: 'idle', path: [], progress: 0 },
    });
    storage.setItem('farm.autosave.v1', JSON.stringify(duplicateWorkers));
    expect(loadSavedFarmState()).toBeNull();
  });

  test('migrates pre-pumpkin saves and their undo snapshots into the expanded state', () => {
    const legacy = JSON.parse(JSON.stringify(getFarmSnapshot(createFarmGame({ seed: 'legacy-crops' }))));
    for (const record of [
      legacy.inventory.crops,
      legacy.inventory.seeds,
      legacy.cropMix,
      legacy.stats.lifetimePlanted,
      legacy.stats.lifetimeHarvested,
      legacy.stats.lifetimeManualSold,
      legacy.stats.lifetimeOverflowSold,
    ]) {
      delete record.pumpkin;
    }
    delete legacy.community;
    delete legacy.stats.lifetimeRequestsCompleted;
    const legacyUndo = structuredClone(legacy);
    delete legacyUndo.history;
    legacy.history.undo = [JSON.stringify(legacyUndo)];
    storage.setItem('farm.autosave.v1', JSON.stringify(legacy));

    const loaded = loadSavedFarmState();
    expect(loaded).not.toBeNull();
    const game = createFarmGame({ seed: 'legacy-crops', state: loaded! });
    expect(getFarmSnapshot(game).inventory.crops.pumpkin).toBe(0);
    expect(getFarmSnapshot(game).community.completedCount).toBe(0);

    submitFarmCommand(game, { type: 'undo' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).inventory.seeds.pumpkin).toBe(0);
    expect(getFarmSnapshot(game).community.activeRequestId).toBeNull();
  });
});
