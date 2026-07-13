import { CROPS, CROP_IDS, type CropId } from '../content/crops';
import { villageRequestById } from '../content/communityRequests';
import { FARM_TIERS, type TierLevel } from '../content/tiers';
import type { UpgradeId } from '../content/upgrades';
import type { Position } from './civEngine';
import { trimFarmHistory } from './farmHistory';
import type { FarmCommunity, FarmState, FarmTier, FarmTile, PlotState, TileKind, WorkerTask } from './farmTypes';

const STORAGE_CAPACITY_PER_BIN = 15;
const STARTER_STORAGE_POSITION = { x: 7, y: 2 };
const LEGACY_STARTER_STORAGE_POSITION = { x: 6, y: 2 };
const WORKER_SPAWN_ORIGIN = { x: 4, y: 2 };

export function createInitialFarmState(): FarmState {
  const tiles: Record<string, FarmTile> = {};
  for (let y = 1; y <= 5; y++) {
    for (let x = 2; x <= 6; x++) {
      tiles[keyOf(x, y)] = { x, y, kind: 'empty' };
    }
  }

  for (const pos of [
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
  ]) {
    tiles[keyOf(pos.x, pos.y)] = { ...pos, kind: 'plot' };
  }

  tiles[keyOf(2, 2)] = { x: 2, y: 2, kind: 'well' };
  tiles[keyOf(STARTER_STORAGE_POSITION.x, STARTER_STORAGE_POSITION.y)] = {
    ...STARTER_STORAGE_POSITION,
    kind: 'storage',
  };

  return {
    version: 1,
    tick: 0,
    width: 12,
    height: 10,
    tiles,
    workers: [
      {
        id: 1,
        x: 4,
        y: 2,
        task: idleTask(),
      },
    ],
    inventory: {
      crops: zeroCropRecord(),
      seeds: { carrot: 8, wheat: 0, tomato: 0, pumpkin: 0 },
      cropCapacity: STORAGE_CAPACITY_PER_BIN,
    },
    coins: 25,
    cropMix: { carrot: 1, wheat: 0, tomato: 0, pumpkin: 0 },
    upgrades: zeroUpgradeRecord(),
    crops: CROPS,
    tier: tierState(1),
    stats: {
      lifetimePlanted: zeroCropRecord(),
      lifetimeHarvested: zeroCropRecord(),
      lifetimeManualSold: zeroCropRecord(),
      lifetimeOverflowSold: zeroCropRecord(),
      lifetimeWatered: 0,
      lifetimeWorkerDistance: 0,
      lifetimeLandPurchased: 0,
      lifetimeUpgradePurchases: 0,
      lifetimeRequestsCompleted: 0,
    },
    community: zeroCommunityState(),
    alerts: [],
    history: { undo: [], redo: [] },
  };
}

export function cloneState(state: FarmState): FarmState {
  return structuredClone(state);
}

export function idleTask(): WorkerTask {
  return { kind: 'idle', path: [], progress: 0 };
}

export function zeroCropRecord(): Record<CropId, number> {
  return { carrot: 0, wheat: 0, tomato: 0, pumpkin: 0 };
}

function zeroCommunityState(): FarmCommunity {
  return { activeRequestId: null, rotationIndex: 0, completedCount: 0, lifetimeCoins: 0 };
}

export function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

export function tileAt(state: FarmState, x: number, y: number): FarmTile | undefined {
  return state.tiles[keyOf(x, y)];
}

export function inBounds(state: FarmState, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function isAdjacentToOwned(state: FarmState, x: number, y: number): boolean {
  return neighbors({ x, y }).some((pos) => tileAt(state, pos.x, pos.y));
}

export function neighbors(pos: Position): Position[] {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
}

export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isReady(tile: FarmTile): boolean {
  return tile.kind === 'plot' && tile.plot !== undefined && tile.plot.growth >= CROPS[tile.plot.cropId].growTicks;
}

export function storedCropCount(state: FarmState): number {
  return Object.values(state.inventory.crops).reduce((sum, count) => sum + count, 0);
}

export function countTiles(state: FarmState, kind: TileKind): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === kind).length;
}

export function hasWorkerAt(state: FarmState, x: number, y: number): boolean {
  return state.workers.some((worker) => worker.x === x && worker.y === y);
}

export function movementMultiplier(state: FarmState): number {
  return 1 + state.upgrades.boots * 0.2;
}

export function nextWorkerId(state: FarmState): number {
  return Math.max(0, ...state.workers.map((worker) => worker.id)) + 1;
}

export function findAvailableWorkerSpawn(state: FarmState): Position | null {
  const tile = Object.values(state.tiles)
    .filter((candidate) => (
      candidate.kind !== 'well' &&
      candidate.kind !== 'storage' &&
      !hasWorkerAt(state, candidate.x, candidate.y)
    ))
    .sort((a, b) => (
      workerSpawnKindPriority(a) - workerSpawnKindPriority(b) ||
      distance(a, WORKER_SPAWN_ORIGIN) - distance(b, WORKER_SPAWN_ORIGIN) ||
      a.y - b.y ||
      a.x - b.x
    ))[0];
  return tile ? { x: tile.x, y: tile.y } : null;
}

export function reconcileStorageCapacity(state: FarmState): void {
  state.inventory.cropCapacity = countTiles(state, 'storage') * STORAGE_CAPACITY_PER_BIN;
  let excess = storedCropCount(state) - state.inventory.cropCapacity;
  if (excess <= 0) return;

  for (const cropId of CROP_IDS) {
    if (excess <= 0) return;
    const sold = Math.min(state.inventory.crops[cropId], excess);
    state.inventory.crops[cropId] -= sold;
    state.coins += sold * CROPS[cropId].sellPrice;
    state.stats.lifetimeOverflowSold[cropId] += sold;
    excess -= sold;
  }
}

function zeroUpgradeRecord(): Record<UpgradeId, number> {
  return { boots: 0, wateringCan: 0 };
}

export function tierState(level: TierLevel): FarmTier {
  const tier = FARM_TIERS[level];
  return { ...tier, unlockedCrops: [...tier.unlockedCrops] };
}

export function normalizeFarmState(state: FarmState): FarmState {
  for (const tile of Object.values(state.tiles)) {
    if ((tile as { plot?: PlotState | null }).plot === null) {
      delete tile.plot;
    }
    const legacyKind = (tile as { kind: string }).kind;
    if (legacyKind === 'path') {
      tile.kind = 'empty';
      delete tile.plot;
    }
    if ((tile.kind === 'well' || tile.kind === 'storage') && hasWorkerAt(state, tile.x, tile.y)) {
      tile.kind = 'empty';
      delete tile.plot;
    }
  }
  normalizeStarterUtilityStorage(state);
  state.inventory.crops = { ...zeroCropRecord(), ...state.inventory.crops };
  state.inventory.seeds = { ...zeroCropRecord(), ...state.inventory.seeds };
  state.cropMix = { ...zeroCropRecord(), ...state.cropMix };
  state.crops = CROPS;
  state.tier = tierState(state.tier.level);
  state.upgrades = { ...zeroUpgradeRecord(), ...(state.upgrades ?? {}) };
  state.stats.lifetimePlanted = { ...zeroCropRecord(), ...state.stats.lifetimePlanted };
  state.stats.lifetimeHarvested = { ...zeroCropRecord(), ...state.stats.lifetimeHarvested };
  state.stats.lifetimeManualSold = { ...zeroCropRecord(), ...state.stats.lifetimeManualSold };
  state.stats.lifetimeOverflowSold = { ...zeroCropRecord(), ...state.stats.lifetimeOverflowSold };
  state.stats.lifetimeUpgradePurchases ??= 0;
  state.stats.lifetimeRequestsCompleted ??= 0;
  state.community = { ...zeroCommunityState(), ...(state.community ?? {}) };
  normalizeCommunityProgress(state);
  if (state.community.activeRequestId) {
    const activeRequest = villageRequestById(state.community.activeRequestId);
    if (!activeRequest || activeRequest.unlockTier > state.tier.level) {
      state.community.activeRequestId = null;
    }
  }
  trimFarmHistory(state.history);
  reconcileStorageCapacity(state);
  return state;
}

function workerSpawnKindPriority(tile: FarmTile): number {
  return tile.kind === 'empty' ? 0 : 1;
}

function normalizeCommunityProgress(state: FarmState): void {
  const consistentCompletedCount = Math.min(
    normalizeProgressCounter(state.community.rotationIndex),
    normalizeProgressCounter(state.community.completedCount),
    normalizeProgressCounter(state.stats.lifetimeRequestsCompleted),
  );
  state.community.rotationIndex = consistentCompletedCount;
  state.community.completedCount = consistentCompletedCount;
  state.stats.lifetimeRequestsCompleted = consistentCompletedCount;
}

function normalizeProgressCounter(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function normalizeStarterUtilityStorage(state: FarmState): void {
  const legacyStorage = tileAt(state, LEGACY_STARTER_STORAGE_POSITION.x, LEGACY_STARTER_STORAGE_POSITION.y);
  if (legacyStorage?.kind === 'storage' && canRecoverStarterStorageAt(state, STARTER_STORAGE_POSITION.x, STARTER_STORAGE_POSITION.y)) {
    state.tiles[keyOf(STARTER_STORAGE_POSITION.x, STARTER_STORAGE_POSITION.y)] = {
      ...STARTER_STORAGE_POSITION,
      kind: 'storage',
    };
    legacyStorage.kind = 'empty';
    delete legacyStorage.plot;
  }

  if (countTiles(state, 'storage') > 0) return;
  if (!canRecoverStarterStorageAt(state, STARTER_STORAGE_POSITION.x, STARTER_STORAGE_POSITION.y)) return;
  state.tiles[keyOf(STARTER_STORAGE_POSITION.x, STARTER_STORAGE_POSITION.y)] = {
    ...STARTER_STORAGE_POSITION,
    kind: 'storage',
  };
}

function canRecoverStarterStorageAt(state: FarmState, x: number, y: number): boolean {
  if (hasWorkerAt(state, x, y)) return false;
  const tile = tileAt(state, x, y);
  return !tile || tile.kind === 'empty';
}
