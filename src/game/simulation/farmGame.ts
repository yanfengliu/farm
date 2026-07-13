import { World } from './civEngine';
import { CROPS, CROP_IDS, type CropId } from '../content/crops';
import {
  villageRequestById,
  villageRequestOffers,
  type VillageRequestId,
} from '../content/communityRequests';
import { UPGRADES, UPGRADE_IDS, type UpgradeId } from '../content/upgrades';
import type {
  FarmCommand,
  FarmGame,
  FarmState,
} from './farmTypes';
import {
  cloneState,
  createInitialFarmState,
  findAvailableWorkerSpawn,
  hasWorkerAt,
  idleTask,
  inBounds,
  isAdjacentToOwned,
  keyOf,
  nextWorkerId,
  normalizeFarmState,
  reconcileStorageCapacity,
  storedCropCount,
  tierState,
  tileAt,
  zeroCropRecord,
} from './farmState';
import { claimableTierLevel } from './farmProgression';
import { pushHistorySnapshot } from './farmHistory';
import { updateFarmState } from './farmSystems';
import { createInitialWildlifeState } from './wildlifeSystem';

export { claimableTierLevel } from './farmProgression';

export type {
  FarmCommand,
  FarmCommunity,
  FarmDuck,
  FarmFish,
  FarmGame,
  FarmHistory,
  FarmInventory,
  FarmState,
  FarmStats,
  FarmTier,
  FarmTile,
  FarmWildlife,
  FarmWorker,
  PlotState,
  TileKind,
  WorkerCargo,
  WorkerTask,
} from './farmTypes';


export const FARM_TPS = 10;
const LAND_COST = 5;

type FarmEvents = Record<string, never>;
type FarmCommands = { farmCommand: FarmCommand };
type FarmWorldState = { farm: FarmState };

export function createFarmGame(options: { seed?: string | number; state?: FarmState } = {}): FarmGame {
  const initial = normalizeFarmState(options.state ? cloneState(options.state) : createInitialFarmState());
  const world = new World<FarmEvents, FarmCommands, Record<string, never>, FarmWorldState>({
    gridWidth: initial.width,
    gridHeight: initial.height,
    tps: FARM_TPS,
    seed: options.seed ?? 'farm',
    strict: true,
    instrumentationProfile: 'minimal',
  });

  world.setState('farm', initial);
  world.registerValidator('farmCommand', () => true);
  world.registerHandler('farmCommand', (command, w) => {
    const state = cloneState(readFarm(w));
    applyFarmCommand(state, command);
    w.setState('farm', state);
  });
  world.registerSystem({
    name: 'farm-simulation',
    execute: (w) => {
      const state = cloneState(readFarm(w));
      updateFarmState(state);
      w.setState('farm', state);
    },
  });
  world.endSetup();
  return world;
}

export function submitFarmCommand(game: FarmGame, command: FarmCommand): void {
  game.submit('farmCommand', command);
}

export function advanceFarm(game: FarmGame, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    game.step();
  }
}

export function advanceFarmByMs(game: FarmGame, ms: number): void {
  advanceFarm(game, farmTicksForMs(ms));
}

export function farmTicksForMs(ms: number): number {
  return Math.max(0, Math.floor((ms / 1000) * FARM_TPS));
}

export function getFarmSnapshot(game: FarmGame): FarmState {
  return cloneState(readFarm(game));
}

export function renderFarmToText(game: FarmGame): string {
  const state = readFarm(game);
  const crops = CROP_IDS.map((id) => `${id}:${state.inventory.crops[id]}`).join(',');
  const seeds = CROP_IDS.map((id) => `${id}:${state.inventory.seeds[id]}`).join(',');
  const mix = CROP_IDS.filter((id) => state.cropMix[id] > 0)
    .map((id) => `${id}:${Math.round(state.cropMix[id] * 100)}`)
    .join(',');
  const upgrades = UPGRADE_IDS.map((id) => `${id}:${state.upgrades[id]}`).join(',');
  const ducks = state.wildlife
    ? state.wildlife.ducks.map((duck) => (
        `${duck.name}:${duck.activity}@${duck.targetNode ?? duck.node}` +
        `(h${duck.hunger},e${duck.energy},m${duck.meals})`
      )).join(',')
    : 'legacy';
  const availableFish = state.wildlife?.fish.filter((fish) => fish.available).length ?? 0;
  const totalFish = state.wildlife?.fish.length ?? 0;
  const storage = `${storedCropCount(state)}/${state.inventory.cropCapacity}`;
  return [
    `tick=${state.tick}`,
    `coins=${state.coins}`,
    `workers=${state.workers.length}`,
    `storage=${storage}`,
    `crops=${crops}`,
    `seeds=${seeds}`,
    `cropMix=${mix}`,
    `upgrades=${upgrades}`,
    `ducks=${ducks}`,
    `fish=${availableFish}/${totalFish}`,
    `tier=${state.tier.level}`,
    `claimableTier=${claimableTierLevel(state) ?? 0}`,
    `request=${state.community.activeRequestId ?? 'none'}`,
    `requestsCompleted=${state.community.completedCount}`,
  ].join(' ');
}



function applyFarmCommand(state: FarmState, command: FarmCommand): void {
  switch (command.type) {
    case 'sellCrop':
      sellCrop(state, command.cropId, command.amount);
      break;
    case 'sellAllCrops':
      for (const cropId of CROP_IDS) {
        sellCrop(state, cropId, state.inventory.crops[cropId]);
      }
      break;
    case 'buySeeds':
      buySeeds(state, command.cropId, command.amount);
      break;
    case 'buyUpgrade':
      mutateWithHistory(state, () => buyUpgrade(state, command.upgradeId));
      break;
    case 'claimNextTier':
      mutateWithHistory(state, () => claimNextTier(state));
      break;
    case 'acceptVillageRequest':
      mutateWithHistory(state, () => acceptVillageRequest(state, command.requestId));
      break;
    case 'abandonVillageRequest':
      mutateWithHistory(state, () => abandonVillageRequest(state));
      break;
    case 'fulfillVillageRequest':
      mutateWithHistory(state, () => fulfillVillageRequest(state));
      break;
    case 'buyLand':
      mutateWithHistory(state, () => buyLand(state, command.x, command.y));
      break;
    case 'paintTile':
      mutateWithHistory(state, () => paintTile(state, command.x, command.y, command.tile));
      break;
    case 'placeBuilding':
      mutateWithHistory(state, () => placeBuilding(state, command.x, command.y, command.building));
      break;
    case 'bulldoze':
      mutateWithHistory(state, () => paintTile(state, command.x, command.y, 'empty'));
      break;
    case 'setCropMix':
      mutateWithHistory(state, () => setCropMix(state, command.mix));
      break;
    case 'undo':
      restoreHistory(state, 'undo');
      break;
    case 'redo':
      restoreHistory(state, 'redo');
      break;
  }
}

function sellCrop(state: FarmState, cropId: CropId, amount: number): void {
  const count = Math.max(0, Math.min(state.inventory.crops[cropId], Math.floor(amount)));
  state.inventory.crops[cropId] -= count;
  state.coins += count * CROPS[cropId].sellPrice;
  state.stats.lifetimeManualSold[cropId] += count;
}

function buySeeds(state: FarmState, cropId: CropId, amount: number): void {
  if (!state.tier.unlockedCrops.includes(cropId)) return;
  const count = Math.max(0, Math.floor(amount));
  const affordable = Math.floor(state.coins / CROPS[cropId].seedPrice);
  const purchased = Math.min(count, affordable);
  if (purchased <= 0) return;
  state.coins -= purchased * CROPS[cropId].seedPrice;
  state.inventory.seeds[cropId] += purchased;
}

function acceptVillageRequest(state: FarmState, requestId: VillageRequestId): void {
  if (state.community.activeRequestId) return;
  const isOffered = villageRequestOffers(state.tier.level, state.community.rotationIndex)
    .some((request) => request.id === requestId);
  if (!isOffered) return;
  state.community.activeRequestId = requestId;
}

function abandonVillageRequest(state: FarmState): void {
  state.community.activeRequestId = null;
}

function fulfillVillageRequest(state: FarmState): void {
  if (!state.community.activeRequestId) return;
  const request = villageRequestById(state.community.activeRequestId);
  if (!request || request.unlockTier > state.tier.level) return;
  const ready = CROP_IDS.every((cropId) => state.inventory.crops[cropId] >= (request.needs[cropId] ?? 0));
  if (!ready) return;

  for (const cropId of CROP_IDS) {
    state.inventory.crops[cropId] -= request.needs[cropId] ?? 0;
  }
  state.coins += request.rewardCoins;
  state.community.activeRequestId = null;
  state.community.rotationIndex += 1;
  state.community.completedCount += 1;
  state.community.lifetimeCoins += request.rewardCoins;
  state.stats.lifetimeRequestsCompleted += 1;
}

function buyUpgrade(state: FarmState, upgradeId: UpgradeId): void {
  const definition = UPGRADES[upgradeId];
  const currentLevel = state.upgrades[upgradeId];
  if (currentLevel >= definition.maxLevel) return;
  const cost = definition.costs[currentLevel];
  if (state.coins < cost) return;
  state.coins -= cost;
  state.upgrades[upgradeId] = currentLevel + 1;
  state.stats.lifetimeUpgradePurchases += 1;
}

function buyLand(state: FarmState, x: number, y: number): void {
  if (!inBounds(state, x, y) || tileAt(state, x, y)) return;
  if (!isAdjacentToOwned(state, x, y)) return;
  if (state.coins < LAND_COST) return;
  state.coins -= LAND_COST;
  state.tiles[keyOf(x, y)] = { x, y, kind: 'empty' };
  state.stats.lifetimeLandPurchased += 1;
}

function paintTile(state: FarmState, x: number, y: number, kind: 'empty' | 'plot'): void {
  const tile = tileAt(state, x, y);
  if (!tile) return;
  if (kind === 'plot' && tile.kind !== 'empty') return;
  tile.kind = kind;
  delete tile.plot;
  reconcileStorageCapacity(state);
}

function placeBuilding(state: FarmState, x: number, y: number, building: 'well' | 'storage'): void {
  const tile = tileAt(state, x, y);
  if (!tile) return;
  if (tile.kind !== 'empty') return;
  if (hasWorkerAt(state, x, y)) return;
  tile.kind = building;
  delete tile.plot;
  reconcileStorageCapacity(state);
}

function setCropMix(state: FarmState, mix: Partial<Record<CropId, number>>): void {
  const next = zeroCropRecord();
  for (const cropId of state.tier.unlockedCrops) {
    next[cropId] = Math.max(0, mix[cropId] ?? 0);
  }
  const total = Object.values(next).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return;
  for (const cropId of CROP_IDS) {
    state.cropMix[cropId] = next[cropId] / total;
  }
}

function claimNextTier(state: FarmState): void {
  const nextLevel = claimableTierLevel(state);
  if (!nextLevel) return;
  const workerSpawn = findAvailableWorkerSpawn(state);
  if (!workerSpawn) return;

  state.tier = tierState(nextLevel);
  state.workers.push({ id: nextWorkerId(state), ...workerSpawn, task: idleTask() });
  if (nextLevel === 2) {
    state.inventory.seeds.wheat += 4;
    state.cropMix = { carrot: 0.75, wheat: 0.25, tomato: 0, pumpkin: 0 };
  } else if (nextLevel === 3) {
    state.inventory.seeds.tomato += 4;
    state.cropMix = { carrot: 0.6, wheat: 0.25, tomato: 0.15, pumpkin: 0 };
  } else if (nextLevel === 4) {
    state.inventory.seeds.pumpkin += 4;
    state.cropMix = { carrot: 0.45, wheat: 0.25, tomato: 0.15, pumpkin: 0.15 };
  }
}


function mutateWithHistory(state: FarmState, mutate: () => void): void {
  const before = serializeCore(state);
  mutate();
  if (serializeCore(state) === before) return;
  pushHistorySnapshot(state.history.undo, before);
  state.history.redo = [];
}

function restoreHistory(state: FarmState, direction: 'undo' | 'redo'): void {
  const source = direction === 'undo' ? state.history.undo : state.history.redo;
  const target = direction === 'undo' ? state.history.redo : state.history.undo;
  const serialized = source.pop();
  if (!serialized) return;
  pushHistorySnapshot(target, serializeCore(state));
  const restored = JSON.parse(serialized) as Omit<FarmState, 'history'>;
  const history = state.history;
  const preserveLegacyWildlifeAbsence = !state.wildlife && !restored.wildlife;
  Object.assign(state, restored, {
    history,
    wildlife: restored.wildlife ?? (preserveLegacyWildlifeAbsence ? undefined : createInitialWildlifeState()),
  });
  normalizeFarmState(state);
  if (preserveLegacyWildlifeAbsence) delete (state as Partial<FarmState>).wildlife;
}

function serializeCore(state: FarmState): string {
  const core: Partial<FarmState> = { ...state };
  delete core.history;
  return JSON.stringify(core);
}

function readFarm(game: FarmGame): FarmState {
  const state = game.getState('farm');
  if (!state) {
    throw new Error('Farm state is missing');
  }
  return state;
}
