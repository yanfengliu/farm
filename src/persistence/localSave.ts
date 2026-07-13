import { CROP_IDS, type CropId } from '../game/content/crops';
import { villageRequestById, type VillageRequestId } from '../game/content/communityRequests';
import { UPGRADE_IDS } from '../game/content/upgrades';
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
