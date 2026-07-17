import { describe, expect, test } from 'vitest';
import {
  FarmWorkEffects,
  workEffectSpawns,
  workEffectTotals,
  type WorkEffectTotals,
} from '../../src/phaser/view/farmWorkEffects';
import { advanceFarm, createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';

const totals = (planted: number, watered: number, harvested: number): WorkEffectTotals => ({ planted, watered, harvested });
const worker = (id: number, x: number, y: number, kind: string) => ({ id, x, y, task: { kind, path: [], progress: 0 } });

describe('work effect spawn decisions', () => {
  test('a planted increase spawns dust at each planting worker', () => {
    const spawns = workEffectSpawns(totals(3, 0, 0), totals(4, 0, 0), [
      worker(1, 2, 3, 'planting'),
      worker(2, 5, 5, 'watering'),
    ]);
    expect(spawns).toEqual([{ kind: 'plant-dust', x: 2, y: 3 }]);
  });

  test('each verb maps to its own effect and multiple matching workers each spawn', () => {
    const spawns = workEffectSpawns(totals(0, 2, 7), totals(0, 3, 8), [
      worker(1, 1, 1, 'watering'),
      worker(2, 4, 4, 'watering'),
      worker(3, 6, 2, 'harvesting'),
    ]);
    expect(spawns).toContainEqual({ kind: 'water-droplets', x: 1, y: 1 });
    expect(spawns).toContainEqual({ kind: 'water-droplets', x: 4, y: 4 });
    expect(spawns).toContainEqual({ kind: 'harvest-sparkle', x: 6, y: 2 });
    expect(spawns).toHaveLength(3);
  });

  test('no stat change spawns nothing even with busy workers', () => {
    expect(workEffectSpawns(totals(5, 5, 5), totals(5, 5, 5), [worker(1, 2, 2, 'planting')])).toEqual([]);
  });

  test('spawned effects draw pixels near the working tile and expire after their lifetime', () => {
    const game = createFarmGame({ seed: 'work-effect-draw' });
    advanceFarm(game, 600);
    const played = getFarmSnapshot(game);
    played.workers[0]!.task = { kind: 'watering', path: [], progress: 0 };

    const effects = new FarmWorkEffects();
    effects.observe(played, 1000);
    const bumped = structuredClone(played);
    bumped.stats.lifetimeWatered += 1;
    effects.observe(bumped, 1016);

    const record = () => {
      const rects: Array<{ x: number; y: number }> = [];
      effects.draw({ fillStyle() {}, fillRect(x: number, y: number) { rects.push({ x, y }); } }, 32, 1100);
      return rects;
    };
    const rects = record();
    expect(rects.length).toBeGreaterThan(0);
    const worker = played.workers[0]!;
    for (const rect of rects) {
      expect(Math.abs(rect.x - (worker.x * 32 + 16))).toBeLessThanOrEqual(20);
      expect(Math.abs(rect.y - (worker.y * 32 + 16))).toBeLessThanOrEqual(24);
    }

    // Past the lifetime the lane is empty again.
    const expired: unknown[] = [];
    effects.draw({ fillStyle() {}, fillRect(x: number) { expired.push(x); } }, 32, 5000);
    expect(expired).toEqual([]);
  });

  test('totals project lifetime stats from real farm state and only ever grow', () => {
    const game = createFarmGame({ seed: 'work-effects' });
    const before = workEffectTotals(getFarmSnapshot(game));
    advanceFarm(game, 600);
    const after = workEffectTotals(getFarmSnapshot(game));
    expect(after.planted).toBeGreaterThanOrEqual(before.planted);
    expect(after.watered).toBeGreaterThanOrEqual(before.watered);
    expect(after.harvested).toBeGreaterThanOrEqual(before.harvested);
    // The starter farm plants within a minute, so the diff path is exercised.
    expect(after.planted).toBeGreaterThan(before.planted);
  });
});
