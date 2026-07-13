import { CROP_IDS, type CropId } from '../game/content/crops';
import { UPGRADE_IDS } from '../game/content/upgrades';
import type { FarmState } from '../game/simulation/farmGame';

const SAVE_KEY = 'farm.autosave.v1';

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

export function saveFarmState(state: FarmState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearFarmSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

function isFarmState(value: unknown): value is FarmState {
  if (!isRecord(value) || value.version !== 1) return false;
  if (!isNonNegativeInteger(value.tick) || !isPositiveInteger(value.width) || !isPositiveInteger(value.height)) return false;
  if (!isRecord(value.tiles) || !Object.values(value.tiles).every(isFarmTile)) return false;
  if (!Array.isArray(value.workers) || !value.workers.every(isFarmWorker)) return false;
  if (!isFarmInventory(value.inventory) || !isNonNegativeNumber(value.coins)) return false;
  if (!isCropNumberRecord(value.cropMix)) return false;
  if (value.upgrades !== undefined && !isUpgradeRecord(value.upgrades)) return false;
  if (!isFarmTier(value.tier) || !isFarmStats(value.stats)) return false;
  if (!Array.isArray(value.alerts) || !value.alerts.every((alert) => typeof alert === 'string')) return false;
  return isRecord(value.history) && isStringArray(value.history.undo) && isStringArray(value.history.redo);
}

function isFarmTile(value: unknown): boolean {
  if (!isRecord(value) || !isInteger(value.x) || !isInteger(value.y)) return false;
  if (!['empty', 'plot', 'well', 'storage', 'path'].includes(String(value.kind))) return false;
  if (value.plot === undefined || value.plot === null) return true;
  return isRecord(value.plot) && isCropId(value.plot.cropId) && isNonNegativeNumber(value.plot.growth) && isNonNegativeNumber(value.plot.water);
}

function isFarmWorker(value: unknown): boolean {
  if (!isRecord(value) || !isPositiveInteger(value.id) || !isInteger(value.x) || !isInteger(value.y)) return false;
  if (!isWorkerTask(value.task)) return false;
  return value.cargo === undefined || isWorkerCargo(value.cargo);
}

function isWorkerTask(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!['idle', 'blocked', 'planting', 'watering', 'harvesting', 'hauling'].includes(String(value.kind))) return false;
  if (!Array.isArray(value.path) || !value.path.every(isPosition) || !isNonNegativeNumber(value.progress)) return false;
  if (value.phase !== undefined && typeof value.phase !== 'string') return false;
  if (value.target !== undefined && !isPosition(value.target)) return false;
  return value.cropId === undefined || isCropId(value.cropId);
}

function isWorkerCargo(value: unknown): boolean {
  if (!isRecord(value) || !['water', 'seed', 'crop'].includes(String(value.kind))) return false;
  if (!isPositiveInteger(value.amount)) return false;
  return value.cropId === undefined || isCropId(value.cropId);
}

function isFarmInventory(value: unknown): boolean {
  return isRecord(value) && isCropNumberRecord(value.crops) && isCropNumberRecord(value.seeds) && isNonNegativeInteger(value.cropCapacity);
}

function isFarmTier(value: unknown): boolean {
  return isRecord(value) && [1, 2, 3].includes(Number(value.level));
}

function isFarmStats(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isCropNumberRecord(value.lifetimePlanted) &&
    isCropNumberRecord(value.lifetimeHarvested) &&
    isCropNumberRecord(value.lifetimeManualSold) &&
    isCropNumberRecord(value.lifetimeOverflowSold) &&
    isNonNegativeNumber(value.lifetimeWatered) &&
    isNonNegativeNumber(value.lifetimeWorkerDistance) &&
    isNonNegativeNumber(value.lifetimeLandPurchased) &&
    (value.lifetimeUpgradePurchases === undefined || isNonNegativeNumber(value.lifetimeUpgradePurchases));
}

function isUpgradeRecord(value: unknown): boolean {
  return isRecord(value) && UPGRADE_IDS.every((id) => isNonNegativeInteger(value[id]));
}

function isCropNumberRecord(value: unknown): boolean {
  return isRecord(value) && CROP_IDS.every((id) => isNonNegativeNumber(value[id]));
}

function isCropId(value: unknown): value is CropId {
  return typeof value === 'string' && CROP_IDS.includes(value as CropId);
}

function isPosition(value: unknown): boolean {
  return isRecord(value) && isInteger(value.x) && isInteger(value.y);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
