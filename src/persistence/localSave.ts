import { CROP_IDS, type CropId } from '../game/content/crops';
import { villageRequestById, type VillageRequestId } from '../game/content/communityRequests';
import { UPGRADE_IDS } from '../game/content/upgrades';
import {
  CREEK_HABITAT_IDS,
  DUCK_ACTIVITY_IDS,
  DUCK_PROFILES,
  isCreekHabitatId,
  isTreeShelterId,
  isWildlifeNodeId,
} from '../game/content/wildlife';
import type { FarmState } from '../game/simulation/farmGame';

const SAVE_KEY = 'farm.autosave.v1';
const LEGACY_CROP_IDS: CropId[] = ['carrot', 'wheat', 'tomato'];
const MIN_OWNED_TILES = 25;

export function loadSavedFarmState(): FarmState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isFarmState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveFarmState(state: FarmState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearFarmSave(): boolean {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

function isFarmState(value: unknown): value is FarmState {
  if (!isFarmCore(value)) return false;
  return isRecord(value.history) && isHistoryArray(value.history.undo) && isHistoryArray(value.history.redo);
}

function isFarmCore(value: unknown): value is Omit<FarmState, 'history'> & Record<string, unknown> {
  if (!isRecord(value) || value.version !== 1) return false;
  const width = value.width;
  const height = value.height;
  if (!isNonNegativeInteger(value.tick) || !isPositiveInteger(width) || !isPositiveInteger(height)) return false;
  if (!isRecord(value.tiles) || !isValidTileMap(value.tiles, width, height)) return false;
  if (!Array.isArray(value.workers) || !areFarmWorkersValid(value.workers, value.tiles, width, height)) return false;
  if (!isFarmInventory(value.inventory) || !isNonNegativeInteger(value.coins)) return false;
  if (!isCropNumberRecord(value.cropMix)) return false;
  if (value.upgrades !== undefined && !isUpgradeRecord(value.upgrades)) return false;
  if (!isFarmTier(value.tier) || !isFarmStats(value.stats)) return false;
  if (value.community !== undefined && !isFarmCommunity(value.community)) return false;
  if (value.wildlife !== undefined && !isFarmWildlife(value.wildlife, value.tick)) return false;
  if (!Array.isArray(value.alerts) || !value.alerts.every((alert) => typeof alert === 'string')) return false;
  return true;
}

function isValidTileMap(tiles: Record<string, unknown>, width: number, height: number): boolean {
  const entries = Object.entries(tiles);
  return entries.length >= MIN_OWNED_TILES && entries.every(([key, tile]) => (
    isFarmTile(tile) &&
    isRecord(tile) &&
    key === `${tile.x},${tile.y}` &&
    isPositionInBounds(tile, width, height)
  )) && isConnectedTileMap(tiles);
}

function isConnectedTileMap(tiles: Record<string, unknown>): boolean {
  const owned = new Set(Object.keys(tiles));
  const first = owned.values().next().value as string | undefined;
  if (!first) return false;
  const visited = new Set([first]);
  const queue = [first];
  while (queue.length > 0) {
    const key = queue.shift()!;
    const [x, y] = key.split(',').map(Number);
    for (const neighbor of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
      if (!owned.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited.size === owned.size;
}

function areFarmWorkersValid(
  workers: unknown[],
  tiles: Record<string, unknown>,
  width: number,
  height: number,
): boolean {
  if (workers.length === 0) return false;
  const ids = new Set<number>();
  for (const worker of workers) {
    if (!isFarmWorker(worker, tiles, width, height) || !isRecord(worker)) return false;
    if (ids.has(worker.id as number)) return false;
    ids.add(worker.id as number);
  }
  return true;
}

function isPositionInBounds(value: Record<string, unknown>, width: number, height: number): boolean {
  return isInteger(value.x) && isInteger(value.y) &&
    value.x >= 0 && value.y >= 0 && value.x < width && value.y < height;
}

function isFarmTile(value: unknown): boolean {
  if (!isRecord(value) || !isInteger(value.x) || !isInteger(value.y)) return false;
  if (!['empty', 'plot', 'well', 'storage', 'path'].includes(String(value.kind))) return false;
  if (value.plot === undefined || value.plot === null) return true;
  return isRecord(value.plot) && isCropId(value.plot.cropId) && isNonNegativeInteger(value.plot.growth) && isNonNegativeInteger(value.plot.water);
}

function isFarmWorker(value: unknown, tiles: Record<string, unknown>, width: number, height: number): boolean {
  if (!isRecord(value) || !isPositiveInteger(value.id) || !isInteger(value.x) || !isInteger(value.y)) return false;
  if (!isWalkableOwnedPosition(value, tiles, width, height)) return false;
  if (!isWorkerTask(value.task, tiles, width, height)) return false;
  return value.cargo === undefined || isWorkerCargo(value.cargo);
}

function isWorkerTask(value: unknown, tiles: Record<string, unknown>, width: number, height: number): boolean {
  if (!isRecord(value)) return false;
  if (!['idle', 'blocked', 'planting', 'watering', 'harvesting', 'hauling'].includes(String(value.kind))) return false;
  if (!Array.isArray(value.path) || !value.path.every((position) => (
    isWalkableOwnedPosition(position, tiles, width, height)
  )) || !isNonNegativeNumber(value.progress)) return false;
  if (value.phase !== undefined && typeof value.phase !== 'string') return false;
  if (value.target !== undefined && !isOwnedPosition(value.target, tiles, width, height)) return false;
  return value.cropId === undefined || isCropId(value.cropId);
}

function isWalkableOwnedPosition(
  value: unknown,
  tiles: Record<string, unknown>,
  width: number,
  height: number,
): boolean {
  if (!isOwnedPosition(value, tiles, width, height) || !isRecord(value)) return false;
  const tile = tiles[`${value.x},${value.y}`];
  return isRecord(tile) && tile.kind !== 'well' && tile.kind !== 'storage';
}

function isOwnedPosition(
  value: unknown,
  tiles: Record<string, unknown>,
  width: number,
  height: number,
): boolean {
  if (!isRecord(value) || !isPositionInBounds(value, width, height)) return false;
  return isRecord(tiles[`${value.x},${value.y}`]);
}

function isWorkerCargo(value: unknown): boolean {
  if (!isRecord(value) || !['water', 'seed', 'crop'].includes(String(value.kind))) return false;
  if (!isPositiveInteger(value.amount)) return false;
  return value.cropId === undefined || isCropId(value.cropId);
}

function isFarmInventory(value: unknown): boolean {
  return isRecord(value) && isCropIntegerRecord(value.crops) && isCropIntegerRecord(value.seeds) && isNonNegativeInteger(value.cropCapacity);
}

function isFarmTier(value: unknown): boolean {
  return isRecord(value) && [1, 2, 3, 4].includes(Number(value.level));
}

function isFarmStats(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isCropIntegerRecord(value.lifetimePlanted) &&
    isCropIntegerRecord(value.lifetimeHarvested) &&
    isCropIntegerRecord(value.lifetimeManualSold) &&
    isCropIntegerRecord(value.lifetimeOverflowSold) &&
    isNonNegativeInteger(value.lifetimeWatered) &&
    isNonNegativeInteger(value.lifetimeWorkerDistance) &&
    isNonNegativeInteger(value.lifetimeLandPurchased) &&
    (value.lifetimeUpgradePurchases === undefined || isNonNegativeInteger(value.lifetimeUpgradePurchases)) &&
    (value.lifetimeRequestsCompleted === undefined || isNonNegativeInteger(value.lifetimeRequestsCompleted));
}

function isFarmCommunity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.activeRequestId !== null && (typeof value.activeRequestId !== 'string' || !villageRequestById(value.activeRequestId as VillageRequestId))) return false;
  return isNonNegativeInteger(value.rotationIndex) &&
    isNonNegativeInteger(value.completedCount) &&
    isNonNegativeInteger(value.lifetimeCoins);
}

function isUpgradeRecord(value: unknown): boolean {
  return isRecord(value) && UPGRADE_IDS.every((id) => isNonNegativeInteger(value[id]));
}

function isFarmWildlife(value: unknown, currentTick: number): boolean {
  if (!isRecord(value) || !Array.isArray(value.ducks) || !Array.isArray(value.fish)) return false;
  if (value.ducks.length !== DUCK_PROFILES.length || value.fish.length !== CREEK_HABITAT_IDS.length) return false;
  const expectedDuckNames = new Map<number, string>(DUCK_PROFILES.map((duck) => [duck.id, duck.name]));
  const expectedFishNodes = new Map<number, string>(CREEK_HABITAT_IDS.map((node, index) => [index + 1, node]));
  const duckIds = new Set<number>();
  const fishIds = new Set<number>();
  for (const fish of value.fish) {
    if (!isFarmFish(fish) || !isRecord(fish) || fishIds.has(fish.id as number)) return false;
    if (expectedFishNodes.get(fish.id as number) !== fish.node) return false;
    fishIds.add(fish.id as number);
  }
  for (const duck of value.ducks) {
    if (!isFarmDuck(duck) || !isRecord(duck) || duckIds.has(duck.id as number)) return false;
    if (expectedDuckNames.get(duck.id as number) !== duck.name) return false;
    if (!isDuckMachineStateCoherent(duck)) return false;
    duckIds.add(duck.id as number);
    if (duck.targetFishId !== null && !fishIds.has(duck.targetFishId as number)) return false;
  }
  const ducks = value.ducks as Array<Record<string, unknown>>;
  for (const fish of value.fish) {
    if (!isRecord(fish)) return false;
    if (fish.reservedByDuckId !== null && !duckIds.has(fish.reservedByDuckId as number)) return false;
    if (fish.available === true && fish.respawnTick !== 0) return false;
    if (fish.available === false && (fish.reservedByDuckId !== null || (fish.respawnTick as number) <= currentTick)) return false;
    if (fish.reservedByDuckId !== null) {
      const duck = ducks.find((candidate) => candidate.id === fish.reservedByDuckId);
      if (!duck || duck.activity !== 'foraging' || duck.targetFishId !== fish.id || duck.targetNode !== fish.node) return false;
    }
  }
  for (const duck of ducks) {
    if (duck.targetFishId === null) {
      if (duck.activity === 'foraging') return false;
      continue;
    }
    const fish = (value.fish as Array<Record<string, unknown>>).find((candidate) => candidate.id === duck.targetFishId);
    if (!fish || duck.activity !== 'foraging' || duck.targetNode !== fish.node || fish.reservedByDuckId !== duck.id) return false;
  }
  return true;
}

function isFarmDuck(value: unknown): boolean {
  if (!isRecord(value) || !isPositiveInteger(value.id) || typeof value.name !== 'string' || value.name.length === 0) return false;
  if (!isWildlifeNodeId(value.node) || (value.targetNode !== null && !isWildlifeNodeId(value.targetNode))) return false;
  if (value.targetFishId !== null && !isPositiveInteger(value.targetFishId)) return false;
  if (!isBoundedInteger(value.travelProgress, 0, 100) || !isBoundedInteger(value.hunger, 0, 100)) return false;
  if (!isBoundedInteger(value.energy, 0, 100) || !isNonNegativeInteger(value.activityTicks)) return false;
  return typeof value.activity === 'string' &&
    DUCK_ACTIVITY_IDS.includes(value.activity as (typeof DUCK_ACTIVITY_IDS)[number]) &&
    isNonNegativeInteger(value.meals);
}

function isDuckMachineStateCoherent(duck: Record<string, unknown>): boolean {
  const activity = duck.activity;
  const targetNode = duck.targetNode;
  const targetFishId = duck.targetFishId;
  const travelProgress = duck.travelProgress as number;
  if (targetNode === null && travelProgress !== 0) return false;
  if (targetNode !== null && travelProgress >= 100) return false;
  if (activity !== 'foraging' && targetFishId !== null) return false;

  if (activity === 'sleeping') {
    return isTreeShelterId(duck.node) && targetNode === null && duck.activityTicks === 0;
  }
  if (activity === 'seeking-shelter') {
    return isTreeShelterId(targetNode) && targetFishId === null && duck.activityTicks === 0;
  }
  if (activity === 'foraging') {
    return isCreekHabitatId(targetNode) && isPositiveInteger(targetFishId) && duck.activityTicks === 0;
  }
  if (activity === 'eating') {
    return isCreekHabitatId(duck.node) && targetNode === null && targetFishId === null &&
      isPositiveInteger(duck.activityTicks);
  }
  return activity === 'roaming' && targetFishId === null &&
    (targetNode === null || isCreekHabitatId(targetNode));
}

function isFarmFish(value: unknown): boolean {
  return isRecord(value) &&
    isPositiveInteger(value.id) &&
    isCreekHabitatId(value.node) &&
    typeof value.available === 'boolean' &&
    (value.reservedByDuckId === null || isPositiveInteger(value.reservedByDuckId)) &&
    isNonNegativeInteger(value.respawnTick);
}

function isCropNumberRecord(value: unknown): boolean {
  return isCropRecord(value, isNonNegativeNumber);
}

function isCropIntegerRecord(value: unknown): boolean {
  return isCropRecord(value, isNonNegativeInteger);
}

function isCropRecord(value: unknown, validate: (quantity: unknown) => boolean): boolean {
  return isRecord(value) &&
    LEGACY_CROP_IDS.every((id) => validate(value[id])) &&
    (value.pumpkin === undefined || validate(value.pumpkin));
}

function isCropId(value: unknown): value is CropId {
  return typeof value === 'string' && CROP_IDS.includes(value as CropId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHistoryArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'string') return false;
    try {
      const parsed: unknown = JSON.parse(item);
      return isFarmCore(parsed) && parsed.history === undefined;
    } catch {
      return false;
    }
  });
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return isInteger(value) && value >= minimum && value <= maximum;
}
