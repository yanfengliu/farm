import { beforeEach, describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { loadSavedFarmState, saveFarmState } from '../../src/persistence/localSave';

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

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
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
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
  });

  test('round-trips a complete farm state', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'save-round-trip' }));

    saveFarmState(state);

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
  });
});
