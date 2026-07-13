import { describe, expect, test } from 'vitest';
import {
  advanceFarm,
  createFarmGame,
  getFarmSnapshot,
  renderFarmToText,
} from '../../src/game/simulation/farmGame';
import { wildlifeTravelProgressPerTick } from '../../src/game/content/wildlife';
import { buildCreekLilyLayout } from '../../src/phaser/view/farmWaterside';

function advanceUntil(
  game: ReturnType<typeof createFarmGame>,
  predicate: () => boolean,
  limit = 1_200,
): void {
  for (let tick = 0; tick < limit; tick += 1) {
    if (predicate()) return;
    advanceFarm(game, 1);
  }
  throw new Error(`Wildlife condition was not reached within ${limit} ticks.`);
}

describe('duck life simulation', () => {
  test('starts two named ducks with independent needs and renewable fish habitat', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'wildlife-starter' }));

    expect(state.wildlife.ducks).toHaveLength(2);
    expect(new Set(state.wildlife.ducks.map((duck) => duck.name)).size).toBe(2);
    expect(state.wildlife.ducks.every((duck) => duck.hunger >= 0 && duck.energy >= 0)).toBe(true);
    expect(state.wildlife.fish.length).toBeGreaterThanOrEqual(4);
    expect(state.wildlife.fish.every((fish) => fish.available)).toBe(true);
  });

  test('hungry ducks reserve different fish instead of converging on one meal', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'wildlife-reservations' }));
    for (const duck of state.wildlife.ducks) {
      duck.activity = 'roaming';
      duck.activityTicks = 0;
      duck.hunger = 100;
      duck.energy = 100;
      duck.targetNode = null;
      duck.targetFishId = null;
      duck.travelProgress = 0;
    }

    const game = createFarmGame({ seed: 'wildlife-reservations', state });
    advanceFarm(game, 1);

    const assigned = getFarmSnapshot(game).wildlife.ducks;
    expect(assigned.every((duck) => duck.activity === 'foraging')).toBe(true);
    expect(assigned.every((duck) => duck.targetFishId !== null)).toBe(true);
    expect(new Set(assigned.map((duck) => duck.targetFishId)).size).toBe(assigned.length);
  });

  test('a duck that reaches the shelter threshold abandons its fish reservation', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'wildlife-fatigue-boundary' }));
    const duck = state.wildlife.ducks[0]!;
    const fish = state.wildlife.fish[1]!;
    Object.assign(duck, {
      node: 'creek-north',
      targetNode: fish.node,
      targetFishId: fish.id,
      travelProgress: 50,
      activity: 'foraging',
      activityTicks: 0,
      hunger: 100,
      energy: 24,
    });
    fish.reservedByDuckId = duck.id;

    const game = createFarmGame({ seed: 'wildlife-fatigue-boundary', state });
    advanceFarm(game, 1);

    const after = getFarmSnapshot(game);
    expect(after.wildlife.ducks[0]).toMatchObject({
      activity: 'seeking-shelter',
      targetFishId: null,
      travelProgress: 0,
    });
    expect(after.wildlife.ducks[0]?.targetNode).toMatch(/^tree-shelter-/);
    expect(after.wildlife.fish[1]?.reservedByDuckId).toBeNull();
  });

  test('roaming reverses at creek ends instead of jumping to the opposite end', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'wildlife-creek-continuity' }));
    Object.assign(state.wildlife.ducks[0], {
      node: 'creek-north',
      targetNode: null,
      targetFishId: null,
      travelProgress: 0,
      activity: 'roaming',
      activityTicks: 0,
      hunger: 0,
      energy: 100,
      meals: 1,
    });

    const game = createFarmGame({ seed: 'wildlife-creek-continuity', state });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).wildlife.ducks[0]?.targetNode).toBe('creek-mid-north');
    expect(wildlifeTravelProgressPerTick('creek-north', 'creek-mid-north')).toBe(2);
    expect(wildlifeTravelProgressPerTick('creek-north', 'creek-south')).toBe(1);
    expect(wildlifeTravelProgressPerTick('creek-south', 'tree-shelter-elder')).toBe(1);
  });

  test('ducks find fish, eat, and leave the fish to respawn', () => {
    const game = createFarmGame({ seed: 'wildlife-foraging' });

    advanceUntil(game, () => getFarmSnapshot(game).wildlife.ducks.some((duck) => duck.meals > 0));
    const afterMeal = getFarmSnapshot(game);
    const eatenFish = afterMeal.wildlife.fish.find((fish) => !fish.available);

    expect(eatenFish).toBeDefined();
    expect(eatenFish?.respawnTick).toBeGreaterThan(afterMeal.tick);
    expect(afterMeal.wildlife.ducks.some((duck) => duck.activity === 'eating' || duck.meals > 0)).toBe(true);

    advanceUntil(game, () => {
      const fish = getFarmSnapshot(game).wildlife.fish.find((candidate) => candidate.id === eatenFish?.id);
      return Boolean(fish?.available);
    });

    expect(getFarmSnapshot(game).wildlife.fish.find((fish) => fish.id === eatenFish?.id)?.available).toBe(true);
  });

  test('tired ducks seek a tree shelter, sleep, and wake with restored energy', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'wildlife-shelter' }));
    const tiredDuck = state.wildlife.ducks[0]!;
    tiredDuck.activity = 'roaming';
    tiredDuck.activityTicks = 0;
    tiredDuck.hunger = 0;
    tiredDuck.energy = 0;
    tiredDuck.targetNode = null;
    tiredDuck.targetFishId = null;
    tiredDuck.travelProgress = 0;

    const game = createFarmGame({ seed: 'wildlife-shelter', state });
    advanceFarm(game, 1);

    expect(getFarmSnapshot(game).wildlife.ducks[0]).toMatchObject({
      activity: 'seeking-shelter',
      targetFishId: null,
    });
    expect(getFarmSnapshot(game).wildlife.ducks[0]?.targetNode).toMatch(/^tree-shelter-/);

    advanceUntil(game, () => getFarmSnapshot(game).wildlife.ducks[0]?.activity === 'sleeping');
    const sleeping = getFarmSnapshot(game).wildlife.ducks[0]!;
    const sleepEnergy = sleeping.energy;
    expect(sleeping.node).toMatch(/^tree-shelter-/);

    advanceUntil(game, () => getFarmSnapshot(game).wildlife.ducks[0]?.activity !== 'sleeping');
    expect(getFarmSnapshot(game).wildlife.ducks[0]?.energy).toBeGreaterThan(sleepEnergy);
  });

  test('wildlife remains deterministic and is exposed in the text playtest surface', () => {
    const first = createFarmGame({ seed: 'wildlife-determinism' });
    const second = createFarmGame({ seed: 'wildlife-determinism' });

    advanceFarm(first, 720);
    advanceFarm(second, 720);

    expect(getFarmSnapshot(first).wildlife).toEqual(getFarmSnapshot(second).wildlife);
    expect(renderFarmToText(first)).toMatch(/ducks=.*(roaming|foraging|eating|seeking-shelter|sleeping)/);
    expect(renderFarmToText(first)).toMatch(/Pip:.*@.*\(h\d+,e\d+,m\d+\)/);
    expect(renderFarmToText(first)).toMatch(/fish=\d+\/\d+/);
  });

  test('is independent of serialized duck and fish array order', () => {
    const firstState = getFarmSnapshot(createFarmGame({ seed: 'wildlife-order' }));
    for (const duck of firstState.wildlife.ducks) {
      duck.node = 'creek-north';
      duck.hunger = 100;
      duck.energy = 100;
      duck.activityTicks = 0;
    }
    const reordered = structuredClone(firstState);
    reordered.wildlife.ducks.reverse();
    reordered.wildlife.fish.reverse();
    const first = createFarmGame({ seed: 'wildlife-order', state: firstState });
    const second = createFarmGame({ seed: 'wildlife-order', state: reordered });

    advanceFarm(first, 720);
    advanceFarm(second, 720);

    const canonical = (state: ReturnType<typeof getFarmSnapshot>) => ({
      ducks: [...state.wildlife.ducks].sort((left, right) => left.id - right.id),
      fish: [...state.wildlife.fish].sort((left, right) => left.id - right.id),
    });
    expect(canonical(getFarmSnapshot(first))).toEqual(canonical(getFarmSnapshot(second)));
  });

  test('continues identically after a JSON save and game recreation', () => {
    const uninterrupted = createFarmGame({ seed: 'wildlife-save-continuation' });
    advanceFarm(uninterrupted, 500);
    const serialized = JSON.parse(JSON.stringify(getFarmSnapshot(uninterrupted)));
    const resumed = createFarmGame({ seed: 'wildlife-save-continuation', state: serialized });

    advanceFarm(uninterrupted, 500);
    advanceFarm(resumed, 500);

    expect(getFarmSnapshot(resumed).wildlife).toEqual(getFarmSnapshot(uninterrupted).wildlife);
  });

  test('keeps needs, fish cooldowns, and reservations coherent through long idle play', () => {
    const game = createFarmGame({ seed: 'wildlife-long-run' });
    advanceFarm(game, 10_000);
    const state = getFarmSnapshot(game);

    expect(state.wildlife.ducks.every((duck) => (
      duck.hunger >= 0 && duck.hunger <= 100 && duck.energy >= 0 && duck.energy <= 100 && duck.meals > 0
    ))).toBe(true);
    for (const fish of state.wildlife.fish) {
      if (fish.available) {
        expect(fish.respawnTick).toBe(0);
        if (fish.reservedByDuckId !== null) {
          const duck = state.wildlife.ducks.find((candidate) => candidate.id === fish.reservedByDuckId);
          expect(duck).toMatchObject({ activity: 'foraging', targetFishId: fish.id, targetNode: fish.node });
        }
      } else {
        expect(fish.reservedByDuckId).toBeNull();
        expect(fish.respawnTick).toBeGreaterThan(state.tick);
      }
    }
  });

  test('keeps pre-ecology replay snapshots replayable without inventing new state', () => {
    const source = createFarmGame({ seed: 'legacy-wildlife-replay' });
    const snapshot = source.serialize();
    if (!('state' in snapshot)) throw new Error('Expected a replay snapshot with custom state.');
    const legacyFarm = snapshot.state.farm as Partial<ReturnType<typeof getFarmSnapshot>>;
    delete legacyFarm.wildlife;
    const legacyUndo = structuredClone(legacyFarm);
    delete legacyUndo.history;
    legacyFarm.history!.undo = [JSON.stringify(legacyUndo)];
    const replay = createFarmGame({ seed: 'legacy-wildlife-replay' });
    replay.applySnapshot(snapshot);

    expect(() => replay.step()).not.toThrow();
    expect((replay.getState('farm') as Partial<ReturnType<typeof getFarmSnapshot>>).wildlife).toBeUndefined();
    expect(renderFarmToText(replay)).toContain('ducks=legacy');

    replay.submit('farmCommand', { type: 'undo' });
    replay.step();
    expect((replay.getState('farm') as Partial<ReturnType<typeof getFarmSnapshot>>).wildlife).toBeUndefined();
  });
});

describe('natural creek lily layout', () => {
  test('is stable while varying spacing, channel position, silhouette, and blossom treatment', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'creek-lilies' }));
    const first = buildCreekLilyLayout(state, 32);
    const second = buildCreekLilyLayout(state, 32);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(5);
    expect(new Set(first.map((lily) => lily.x)).size).toBeGreaterThan(2);
    expect(new Set(first.slice(1).map((lily, index) => lily.y - first[index]!.y)).size).toBeGreaterThan(2);
    expect(new Set(first.map((lily) => `${lily.size}:${lily.notch}:${lily.blossomColor ?? 'none'}`)).size)
      .toBeGreaterThan(2);
    expect(first.every((lily) => Math.abs(lily.y - lily.bridgeY) > 22)).toBe(true);
  });
});
