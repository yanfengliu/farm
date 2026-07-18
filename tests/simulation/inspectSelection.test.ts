import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { inspectMarkup } from '../../src/ui/inspectPanel';
import { farmhandsMarkup } from '../../src/ui/farmhandsPanel';

describe('explicit inspect selection', () => {
  test('a selected cell keeps showing the tile even while a farmhand stands on it', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'selection-cell' }));
    const worker = state.workers[0]!;
    const markup = inspectMarkup(state, { x: worker.x, y: worker.y });
    // The player selected the CELL; a passing farmhand must not hijack the panel.
    expect(markup).not.toContain('data-inspect-portrait');
    expect(markup).not.toContain('Fern');
    expect(markup).toContain(`Tile ${worker.x}, ${worker.y}`);
  });

  test('an explicitly selected farmhand stays selected as he moves', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'selection-worker' }));
    const markup = inspectMarkup(state, { kind: 'worker', id: 1 });
    expect(markup).toContain('Fern');
    expect(markup).toContain('data-inspect-portrait="1"');

    const moved = structuredClone(state);
    moved.workers[0]!.x += 1;
    const followed = inspectMarkup(moved, { kind: 'worker', id: 1 });
    expect(followed).toContain('Fern');
    expect(followed).toContain(`Position: ${moved.workers[0]!.x}, ${moved.workers[0]!.y}`);
  });

  test('a selection for a farmhand who no longer exists falls back gracefully', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'selection-missing' }));
    const markup = inspectMarkup(state, { kind: 'worker', id: 99 });
    expect(markup).toContain('Select a tile or worker');
  });
});

describe('farmhands roster panel', () => {
  test('lists every farmhand with name, portrait, and live task', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'roster' }));
    const markup = farmhandsMarkup(state, null);
    expect(markup).toContain('Farmhands');
    expect(markup).toContain('Fern');
    expect(markup).toContain('data-inspect-portrait="1"');
    expect(markup).toContain('data-select-farmhand="1"');
  });

  test('marks the explicitly selected farmhand row', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'roster-selected' }));
    const markup = farmhandsMarkup(state, 1);
    expect(markup).toMatch(/farmhand-row selected[\s\S]*data-select-farmhand="1"/);
  });
});
