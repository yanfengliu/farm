import { describe, expect, test } from 'vitest';
import { SessionReplayer, type SessionBundle } from 'civ-engine';
import { CROPS } from '../../src/game/content/crops';
import { VILLAGE_REQUESTS, villageRequestOffers } from '../../src/game/content/communityRequests';
import { FARM_TIERS } from '../../src/game/content/tiers';
import { SessionRecorder } from '../../src/game/simulation/civEngine';
import {
  advanceFarm,
  claimableTierLevel,
  createFarmGame,
  getFarmSnapshot,
  submitFarmCommand,
  type FarmState,
} from '../../src/game/simulation/farmGame';

type FarmReplayEvents = Record<string, never>;
type FarmReplayCommands = { farmCommand: Parameters<typeof submitFarmCommand>[1] };
type FarmReplayState = { farm: FarmState };

function tierState(level: 2 | 3 | 4): FarmState {
  const state = getFarmSnapshot(createFarmGame({ seed: `request-tier-${level}` }));
  const tier = FARM_TIERS[level];
  state.tier = {
    level,
    label: tier.label,
    unlockedCrops: [...tier.unlockedCrops],
    nextMilestone: tier.nextMilestone,
  };
  return state;
}

function command(state: FarmState, farmCommand: Parameters<typeof submitFarmCommand>[1]): FarmState {
  const game = createFarmGame({ seed: 'request-command', state });
  submitFarmCommand(game, farmCommand);
  advanceFarm(game, 1);
  return getFarmSnapshot(game);
}

describe('village requests', () => {
  test('authored baskets fit base storage and pay a meaningful cozy premium', () => {
    expect(VILLAGE_REQUESTS).toHaveLength(12);
    for (const request of VILLAGE_REQUESTS) {
      const entries = Object.entries(request.needs);
      const cropCount = entries.reduce((sum, [, amount]) => sum + (amount ?? 0), 0);
      const marketValue = entries.reduce((sum, [cropId, amount]) => (
        sum + CROPS[cropId as keyof typeof CROPS].sellPrice * (amount ?? 0)
      ), 0);

      expect(cropCount, request.id).toBeLessThanOrEqual(15);
      expect(request.rewardCoins, request.id).toBeGreaterThanOrEqual(Math.ceil(marketValue * 1.5));
      expect(request.rewardCoins, request.id).toBeLessThanOrEqual(Math.ceil(marketValue * 1.6));
      expect(entries.every(([cropId]) => FARM_TIERS[request.unlockTier].unlockedCrops.includes(cropId as keyof typeof CROPS))).toBe(true);
    }
  });

  test('stay locked on tier one and offer a deterministic pair for each later tier', () => {
    expect(villageRequestOffers(1, 0)).toEqual([]);

    const first = villageRequestOffers(2, 0);
    expect(first).toHaveLength(2);
    expect(first.map((request) => request.id)).toEqual(villageRequestOffers(2, 0).map((request) => request.id));
    expect(villageRequestOffers(2, 1).map((request) => request.id)).not.toEqual(first.map((request) => request.id));
    expect(first.every((request) => request.unlockTier === 2)).toBe(true);
  });

  test('normalization clears an active request from a tier the save has not unlocked', () => {
    const state = tierState(2);
    state.community.activeRequestId = villageRequestOffers(4, 0)[0].id;

    const normalized = getFarmSnapshot(createFarmGame({ seed: 'request-tier-repair', state }));

    expect(normalized.community.activeRequestId).toBeNull();
  });

  test('accepts one visible request and lets the player abandon it without a penalty', () => {
    const initial = tierState(2);
    const [first, second] = villageRequestOffers(2, initial.community.rotationIndex);

    const accepted = command(initial, { type: 'acceptVillageRequest', requestId: first.id });
    expect(accepted.community.activeRequestId).toBe(first.id);

    const ignored = command(accepted, { type: 'acceptVillageRequest', requestId: second.id });
    expect(ignored.community.activeRequestId).toBe(first.id);

    const abandoned = command(ignored, { type: 'abandonVillageRequest' });
    expect(abandoned.community.activeRequestId).toBeNull();
    expect(abandoned.coins).toBe(initial.coins);
    expect(abandoned.community.completedCount).toBe(0);
  });

  test('fulfillment consumes only the basket, pays its premium, and rotates offers', () => {
    const initial = tierState(2);
    const [request] = villageRequestOffers(2, initial.community.rotationIndex);
    initial.community.activeRequestId = request.id;
    for (const [cropId, amount] of Object.entries(request.needs)) {
      initial.inventory.crops[cropId as keyof typeof initial.inventory.crops] = amount + 1;
    }
    const coinsBefore = initial.coins;
    const cropsBefore = { ...initial.inventory.crops };

    const fulfilled = command(initial, { type: 'fulfillVillageRequest' });

    expect(fulfilled.community.activeRequestId).toBeNull();
    expect(fulfilled.community.completedCount).toBe(1);
    expect(fulfilled.community.rotationIndex).toBe(1);
    expect(fulfilled.community.lifetimeCoins).toBe(request.rewardCoins);
    expect(fulfilled.stats.lifetimeRequestsCompleted).toBe(1);
    expect(fulfilled.coins).toBe(coinsBefore + request.rewardCoins);
    for (const [cropId, amount] of Object.entries(request.needs)) {
      expect(fulfilled.inventory.crops[cropId as keyof typeof cropsBefore]).toBe(cropsBefore[cropId as keyof typeof cropsBefore] - amount);
    }
    expect(villageRequestOffers(2, fulfilled.community.rotationIndex).map((offer) => offer.id))
      .not.toEqual(villageRequestOffers(2, 0).map((offer) => offer.id));
  });

  test('an incomplete basket stays active and changes no inventory or coins', () => {
    const initial = tierState(3);
    const [request] = villageRequestOffers(3, initial.community.rotationIndex);
    initial.community.activeRequestId = request.id;
    initial.inventory.crops = { carrot: 0, wheat: 0, tomato: 0, pumpkin: 0 };

    const fulfilled = command(initial, { type: 'fulfillVillageRequest' });

    expect(fulfilled.community.activeRequestId).toBe(request.id);
    expect(fulfilled.community.completedCount).toBe(0);
    expect(fulfilled.coins).toBe(initial.coins);
    expect(fulfilled.inventory.crops).toEqual(initial.inventory.crops);
  });

  test('pumpkin tier requires three completed requests plus a real tomato harvest', () => {
    const state = tierState(3);
    state.community.completedCount = 3;
    state.community.rotationIndex = 3;
    state.stats.lifetimeRequestsCompleted = 3;
    state.stats.lifetimeHarvested.tomato = 9;
    expect(claimableTierLevel(state)).toBeNull();

    state.stats.lifetimeHarvested.tomato = 10;
    expect(claimableTierLevel(state)).toBe(4);

    const claimed = command(state, { type: 'claimNextTier' });
    expect(claimed.tier.level).toBe(4);
    expect(claimed.tier.unlockedCrops).toContain('pumpkin');
    expect(claimed.inventory.seeds.pumpkin).toBeGreaterThanOrEqual(4);
    expect(claimed.cropMix.pumpkin).toBeGreaterThan(0);
  });

  test('spawns claimed farmhands on safe owned tiles and preserves nearby buildings through history', () => {
    const state = tierState(3);
    state.community.completedCount = 3;
    state.community.rotationIndex = 3;
    state.stats.lifetimeRequestsCompleted = 3;
    state.stats.lifetimeHarvested.tomato = 10;
    state.workers[0].x = 3;
    state.workers[0].y = 2;
    state.workers.push(
      { id: 2, x: 3, y: 1, task: { kind: 'idle', path: [], progress: 0 } },
      { id: 3, x: 5, y: 1, task: { kind: 'idle', path: [], progress: 0 } },
    );
    state.tiles['4,2'] = { x: 4, y: 2, kind: 'storage' };
    const game = createFarmGame({ seed: 'safe-tier-worker', state });

    submitFarmCommand(game, { type: 'claimNextTier' });
    advanceFarm(game, 1);
    const claimed = getFarmSnapshot(game);
    const claimedWorker = claimed.workers.find((worker) => worker.id === 4);
    expect(claimed.tier.level).toBe(4);
    expect(claimed.workers).toHaveLength(4);
    expect(claimed.tiles['4,2']?.kind).toBe('storage');
    expect(claimedWorker).toBeDefined();
    expect(claimedWorker).not.toMatchObject({ x: 4, y: 2 });
    const claimedSpawnTile = claimed.tiles[`${claimedWorker!.x},${claimedWorker!.y}`];
    expect(claimedSpawnTile?.kind).not.toMatch(/well|storage/);

    submitFarmCommand(game, { type: 'undo' });
    advanceFarm(game, 1);
    expect(getFarmSnapshot(game).tiles['4,2']?.kind).toBe('storage');

    submitFarmCommand(game, { type: 'redo' });
    advanceFarm(game, 1);
    const redone = getFarmSnapshot(game);
    expect(redone.tier.level).toBe(4);
    expect(redone.workers).toHaveLength(4);
    expect(redone.tiles['4,2']?.kind).toBe('storage');
    expect(redone.workers.every((worker) => {
      const tile = redone.tiles[`${worker.x},${worker.y}`];
      return tile?.kind !== 'well' && tile?.kind !== 'storage';
    })).toBe(true);
  });

  test('normalization fail-closes inconsistent request progress counters', () => {
    const state = tierState(3);
    state.community.completedCount = 3;
    state.community.rotationIndex = 1;
    state.stats.lifetimeRequestsCompleted = 2;
    state.stats.lifetimeHarvested.tomato = 10;

    const normalized = getFarmSnapshot(createFarmGame({ seed: 'request-progress-repair', state }));

    expect(normalized.community.completedCount).toBe(1);
    expect(normalized.community.rotationIndex).toBe(1);
    expect(normalized.stats.lifetimeRequestsCompleted).toBe(1);
    expect(claimableTierLevel(normalized)).toBeNull();
  });

  test('request fulfillment, tier claiming, undo, and redo survive deterministic session replay', () => {
    const state = tierState(3);
    state.community.completedCount = 2;
    state.community.rotationIndex = 2;
    state.stats.lifetimeRequestsCompleted = 2;
    state.stats.lifetimeHarvested.tomato = 10;
    const [request] = villageRequestOffers(3, state.community.rotationIndex);
    for (const [cropId, amount] of Object.entries(request.needs)) {
      state.inventory.crops[cropId as keyof typeof state.inventory.crops] = amount;
    }
    const game = createFarmGame({ seed: 'request-session-replay', state });
    const recorder = new SessionRecorder<
      FarmReplayEvents,
      FarmReplayCommands,
      unknown,
      Record<string, never>,
      FarmReplayState
    >({ world: game });
    recorder.connect();

    for (const farmCommand of [
      { type: 'acceptVillageRequest', requestId: request.id } as const,
      { type: 'fulfillVillageRequest' } as const,
      { type: 'claimNextTier' } as const,
      { type: 'undo' } as const,
      { type: 'redo' } as const,
    ]) {
      submitFarmCommand(game, farmCommand);
      advanceFarm(game, 1);
    }
    recorder.disconnect();

    const bundle = recorder.toBundle() as unknown as SessionBundle<
      FarmReplayEvents,
      FarmReplayCommands,
      unknown
    >;
    const replayer = SessionReplayer.fromBundle<
      FarmReplayEvents,
      FarmReplayCommands,
      unknown,
      Record<string, never>,
      FarmReplayState
    >(bundle, {
      worldFactory: (snapshot) => {
        const replay = createFarmGame({ seed: snapshot.config.seed });
        replay.applySnapshot(snapshot);
        return replay;
      },
    });
    const selfCheck = replayer.selfCheck({ stopOnFirstDivergence: true });

    expect(selfCheck.ok).toBe(true);
    expect(selfCheck.checkedSegments).toBeGreaterThan(0);
    expect(selfCheck.skippedSegments).toHaveLength(0);
    expect(selfCheck.stateDivergences).toHaveLength(0);
    expect(selfCheck.eventDivergences).toHaveLength(0);
    expect(selfCheck.executionDivergences).toHaveLength(0);
  });

  test('request choices and rewards participate in undo and redo', () => {
    const initial = tierState(2);
    const [request] = villageRequestOffers(2, initial.community.rotationIndex);
    for (const [cropId, amount] of Object.entries(request.needs)) {
      initial.inventory.crops[cropId as keyof typeof initial.inventory.crops] = amount + 1;
    }

    const accepted = command(initial, { type: 'acceptVillageRequest', requestId: request.id });
    const fulfilled = command(accepted, { type: 'fulfillVillageRequest' });
    const undone = command(fulfilled, { type: 'undo' });
    expect(undone.community.activeRequestId).toBe(request.id);
    expect(undone.community.completedCount).toBe(0);

    const redone = command(undone, { type: 'redo' });
    expect(redone.community.activeRequestId).toBeNull();
    expect(redone.community.completedCount).toBe(1);
  });
});
