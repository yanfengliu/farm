import type { CropId } from '../../game/content/crops';
import type { FarmState } from '../../game/simulation/farmGame';
import type { PixelPainter } from './pixelPainter';
import { coordinateHash } from './farmPixelPrimitives';

export type WorkEffectKind = 'plant-dust' | 'water-droplets' | 'harvest-sparkle';

export interface WorkEffectSpawn { kind: WorkEffectKind; x: number; y: number; }
export interface WorkEffectTotals { planted: number; watered: number; harvested: number; }

interface WorkerLike { x: number; y: number; task: { kind: string }; }

const EFFECT_LIFETIME_MS = 700;
const MAX_LIVE_EFFECTS = 48;

const VERBS: ReadonlyArray<{ stat: keyof WorkEffectTotals; taskKind: string; effect: WorkEffectKind }> = [
  { stat: 'planted', taskKind: 'planting', effect: 'plant-dust' },
  { stat: 'watered', taskKind: 'watering', effect: 'water-droplets' },
  { stat: 'harvested', taskKind: 'harvesting', effect: 'harvest-sparkle' },
];

export function workEffectTotals(state: FarmState): WorkEffectTotals {
  const sum = (record: Record<CropId, number>) => Object.values(record).reduce((total, value) => total + value, 0);
  return {
    planted: sum(state.stats.lifetimePlanted),
    watered: state.stats.lifetimeWatered,
    harvested: sum(state.stats.lifetimeHarvested),
  };
}

/**
 * Pure decision: when a lifetime stat grew between two snapshots, celebrate at
 * every worker currently performing the matching task. Purely decorative -
 * spawns never enter simulation state, saves, or replay.
 */
export function workEffectSpawns(
  previous: WorkEffectTotals,
  next: WorkEffectTotals,
  workers: readonly WorkerLike[],
): WorkEffectSpawn[] {
  const spawns: WorkEffectSpawn[] = [];
  for (const verb of VERBS) {
    if (next[verb.stat] <= previous[verb.stat]) continue;
    for (const candidate of workers) {
      if (candidate.task.kind !== verb.taskKind) continue;
      spawns.push({ kind: verb.effect, x: candidate.x, y: candidate.y });
    }
  }
  return spawns;
}

interface LiveEffect extends WorkEffectSpawn { bornAt: number; seed: number; }

/**
 * Presentation-only particle lane. observe() diffs snapshots on simulation
 * data; draw() animates on presentation time, so paused farms spawn nothing
 * new while in-flight puffs finish, matching the documented ambience rule.
 */
export class FarmWorkEffects {
  #previous: WorkEffectTotals | null = null;
  #live: LiveEffect[] = [];

  observe(state: FarmState, nowMs: number): void {
    const next = workEffectTotals(state);
    if (this.#previous) {
      for (const spawn of workEffectSpawns(this.#previous, next, state.workers)) {
        this.#live.push({ ...spawn, bornAt: nowMs, seed: coordinateHash(spawn.x, spawn.y) });
        if (this.#live.length > MAX_LIVE_EFFECTS) this.#live.shift();
      }
    }
    this.#previous = next;
  }

  draw(g: PixelPainter, tileSize: number, nowMs: number): void {
    this.#live = this.#live.filter((effect) => nowMs - effect.bornAt < EFFECT_LIFETIME_MS);
    for (const effect of this.#live) {
      const age = (nowMs - effect.bornAt) / EFFECT_LIFETIME_MS;
      const fade = 1 - age;
      const centerX = effect.x * tileSize + tileSize / 2;
      const centerY = effect.y * tileSize + tileSize / 2;
      if (effect.kind === 'plant-dust') this.drawDust(g, centerX, centerY, age, fade, effect.seed);
      else if (effect.kind === 'water-droplets') this.drawDroplets(g, centerX, centerY, age, fade, effect.seed);
      else this.drawSparkle(g, centerX, centerY, age, fade, effect.seed);
    }
  }

  private drawDust(g: PixelPainter, x: number, y: number, age: number, fade: number, seed: number): void {
    g.fillStyle(0x8a6a45, 0.5 * fade);
    const spread = Math.round(2 + age * 5);
    g.fillRect(x - spread, y + 6 - Math.round(age * 2), 2, 1);
    g.fillRect(x + spread - 1, y + 6 - Math.round(age * 3), 2, 1);
    g.fillStyle(0xa5825a, 0.4 * fade);
    g.fillRect(x + (seed % 3) - 1, y + 4 - Math.round(age * 4), 1, 1);
  }

  private drawDroplets(g: PixelPainter, x: number, y: number, age: number, fade: number, seed: number): void {
    g.fillStyle(0x72c8df, 0.75 * fade);
    const fall = Math.round(age * 7);
    g.fillRect(x - 4 + (seed % 2), y - 2 + fall, 1, 2);
    g.fillRect(x + 3 - (seed % 2), y - 4 + fall, 1, 2);
    g.fillStyle(0xbfe6ef, 0.55 * fade);
    g.fillRect(x, y - 6 + fall, 1, 1);
  }

  private drawSparkle(g: PixelPainter, x: number, y: number, age: number, fade: number, seed: number): void {
    const rise = Math.round(age * 8);
    g.fillStyle(0xf0c36a, 0.85 * fade);
    g.fillRect(x - 5 + (seed % 3), y - 4 - rise, 1, 1);
    g.fillRect(x + 4 - (seed % 3), y - 7 - rise, 1, 1);
    g.fillStyle(0xffe9b0, 0.9 * fade);
    g.fillRect(x, y - 9 - rise, 1, 2);
    g.fillRect(x - 1, y - 8 - rise, 3, 1);
  }
}
