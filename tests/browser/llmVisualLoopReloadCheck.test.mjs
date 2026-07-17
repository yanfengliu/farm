import { describe, expect, test } from 'vitest';
import { advanceFarm, createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import {
  compareSaveReload,
  farmStateIdentity,
  runSaveReloadCheck,
} from '../../scripts/llm-visual-loop/reload-check.mjs';

// A fake Playwright page: evaluate() answers from a script, reload() flips phase.
// The reload check only reads localStorage, reloads, and reads debug state, so the
// orchestration is fully unit-testable without a browser.
function fakePage({ savedRaw, restoredState, alertText = 'Harvest 0/10 carrots', failReload = false }) {
  let phase = 'before-reload';
  const calls = [];
  return {
    calls,
    async evaluate(fn, arg) {
      const source = fn.toString();
      if (source.includes('localStorage.getItem')) return savedRaw;
      if (source.includes('__farmDebug')) {
        if (source.includes('getState')) return restoredState;
        return phase === 'after-reload';
      }
      if (source.includes('hud-alert')) return alertText;
      throw new Error(`fake page cannot answer: ${source.slice(0, 80)} ${String(arg ?? '')}`);
    },
    async reload() {
      if (failReload) throw new Error('reload refused');
      phase = 'after-reload';
      calls.push('reload');
    },
    async waitForFunction() { return true; },
  };
}

describe('farm state identity for the reload oracle', () => {
  test('extracts the progress facts a silent reset would destroy', () => {
    const game = createFarmGame({ seed: 'reload-identity' });
    advanceFarm(game, 300);
    const state = getFarmSnapshot(game);
    const identity = farmStateIdentity(state);

    expect(identity.tick).toBe(state.tick);
    expect(identity.tierLevel).toBe(state.tier.level);
    expect(identity.ownedTiles).toBe(Object.keys(state.tiles).length);
    expect(identity.workers).toBe(state.workers.length);
    expect(identity.coins).toBe(state.coins);
    expect(identity.watered).toBe(state.stats.lifetimeWatered);
    expect(identity.planted).toBeGreaterThan(0);
  });
});

describe('save/reload comparison rules', () => {
  const played = { tick: 603, tierLevel: 2, ownedTiles: 30, workers: 2, coins: 40, watered: 12, planted: 9, harvested: 6 };

  test('a faithful restore with a little post-reload simulation is clean', () => {
    const restored = { ...played, tick: 610, watered: 13, planted: 9, harvested: 7 };
    expect(compareSaveReload(played, restored)).toEqual([]);
  });

  test('a silent fresh start violates every monotonic and identity rule it breaks', () => {
    const fresh = { tick: 3, tierLevel: 1, ownedTiles: 25, workers: 1, coins: 25, watered: 0, planted: 0, harvested: 0 };
    const rules = compareSaveReload(played, fresh).map((violation) => violation.rule);
    expect(rules).toContain('tick-regressed');
    expect(rules).toContain('tier-changed');
    expect(rules).toContain('owned-tiles-changed');
    expect(rules).toContain('workers-changed');
    expect(rules).toContain('progress-regressed');
  });

  test('violations carry the numbers on both sides for the finding packet', () => {
    const fresh = { ...played, tick: 3 };
    const [violation] = compareSaveReload(played, fresh);
    expect(violation).toMatchObject({ rule: 'tick-regressed', saved: 603, restored: 3 });
  });
});

describe('runSaveReloadCheck orchestration', () => {
  const playedState = () => {
    const game = createFarmGame({ seed: 'reload-check' });
    advanceFarm(game, 200);
    return getFarmSnapshot(game);
  };

  test('skips honestly when no autosave exists', async () => {
    const page = fakePage({ savedRaw: null, restoredState: null });
    const result = await runSaveReloadCheck(page);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no-autosave');
    expect(page.calls).not.toContain('reload');
  });

  test('an unparseable autosave is a violation, not a skip', async () => {
    const page = fakePage({ savedRaw: 'not json{', restoredState: playedState() });
    const result = await runSaveReloadCheck(page);
    expect(result.status).toBe('checked');
    expect(result.violations.map((violation) => violation.rule)).toContain('save-unparseable');
  });

  test('a clean restore reports checked with zero violations', async () => {
    const state = playedState();
    const page = fakePage({ savedRaw: JSON.stringify(state), restoredState: state });
    const result = await runSaveReloadCheck(page);
    expect(result.status).toBe('checked');
    expect(result.violations).toEqual([]);
    expect(page.calls).toContain('reload');
  });

  test('a fresh-farm restore after a played save reports the loss', async () => {
    const played = playedState();
    const fresh = getFarmSnapshot(createFarmGame({ seed: 'reload-check-fresh' }));
    const page = fakePage({ savedRaw: JSON.stringify(played), restoredState: fresh });
    const result = await runSaveReloadCheck(page);
    expect(result.status).toBe('checked');
    expect(result.violations.map((violation) => violation.rule)).toContain('tick-regressed');
  });

  test('the game refusing its own save is reported as save-refused', async () => {
    const played = playedState();
    const fresh = getFarmSnapshot(createFarmGame({ seed: 'reload-check-refused' }));
    const page = fakePage({
      savedRaw: JSON.stringify(played),
      restoredState: fresh,
      alertText: 'Saved farm unreadable - autosave off until Reset.',
    });
    const result = await runSaveReloadCheck(page);
    expect(result.violations.map((violation) => violation.rule)).toContain('save-refused');
  });

  test('a reload failure surfaces as a check error instead of a throw', async () => {
    const played = playedState();
    const page = fakePage({ savedRaw: JSON.stringify(played), restoredState: null, failReload: true });
    const result = await runSaveReloadCheck(page);
    expect(result.status).toBe('error');
    expect(result.error).toContain('reload refused');
  });
});
