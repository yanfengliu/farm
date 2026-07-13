import { CROPS, type CropId } from '../content/crops';
import { FARM_TIERS } from '../content/tiers';
import { findGridPath, type Position } from './civEngine';
import { claimableTierLevel } from './farmProgression';
import { distance, idleTask, isReady, movementMultiplier, neighbors, storedCropCount, tileAt, zeroCropRecord } from './farmState';
import type { FarmState, FarmTile, FarmWorker, WorkerTask } from './farmTypes';
import { updateWildlife } from './wildlifeSystem';

const STARTER_SEED_TRICKLE_TICKS = 240;

export function updateFarmState(state: FarmState): void {
  state.tick += 1;
  state.alerts = [];
  trickleStarterSeeds(state);
  growPlots(state);
  updateWildlife(state);

  for (const worker of state.workers) {
    updateWorker(state, worker);
  }

  updateTierAlerts(state);
  updateSeedGuidanceAlerts(state);
  updatePlantingSpaceAlerts(state);
}

function trickleStarterSeeds(state: FarmState): void {
  if (state.tick % STARTER_SEED_TRICKLE_TICKS !== 0) return;
  if (state.inventory.seeds.carrot > 0 || state.coins > 0) return;
  state.inventory.seeds.carrot += 1;
  state.alerts.push('A spare carrot seed was found.');
}

function growPlots(state: FarmState): void {
  for (const tile of Object.values(state.tiles)) {
    if (tile.kind !== 'plot' || !tile.plot) continue;
    if (tile.plot.growth >= CROPS[tile.plot.cropId].growTicks) continue;
    if (tile.plot.water <= 0) continue;
    tile.plot.growth += 1;
    tile.plot.water -= 1;
  }
}

function updateWorker(state: FarmState, worker: FarmWorker): void {
  if (worker.task.path.length > 0) {
    moveWorkerAlongPath(state, worker);
    return;
  }

  if (completeWorkerTaskPhase(state, worker)) {
    return;
  }

  assignWorkerTask(state, worker);
}

function moveWorkerAlongPath(state: FarmState, worker: FarmWorker): void {
  const next = worker.task.path[0];
  if (!next) return;
  const speed = movementMultiplier(state);
  worker.task.progress += speed;
  if (worker.task.progress < 4) return;

  worker.task.progress = 0;
  worker.x = next.x;
  worker.y = next.y;
  worker.task.path = worker.task.path.slice(1);
  state.stats.lifetimeWorkerDistance += 1;
}

function completeWorkerTaskPhase(state: FarmState, worker: FarmWorker): boolean {
  const task = worker.task;
  if (!task.target) return false;

  if (task.kind === 'planting' && task.phase === 'to-storage' && task.cropId) {
    if (state.inventory.seeds[task.cropId] <= 0) {
      worker.task = idleTask();
      return true;
    }
    state.inventory.seeds[task.cropId] -= 1;
    worker.cargo = { kind: 'seed', cropId: task.cropId, amount: 1 };
    routeWorkerTo(state, worker, 'planting', 'to-plot', task.target, task.cropId);
    return true;
  }

  if (task.kind === 'planting' && task.phase === 'to-plot' && worker.cargo?.kind === 'seed' && worker.cargo.cropId) {
    const tile = tileAt(state, task.target.x, task.target.y);
    if (tile?.kind === 'plot' && !tile.plot) {
      tile.plot = { cropId: worker.cargo.cropId, growth: 0, water: 0 };
      state.stats.lifetimePlanted[worker.cargo.cropId] += 1;
    }
    delete worker.cargo;
    worker.task = idleTask();
    return true;
  }

  if (task.kind === 'watering' && task.phase === 'to-well') {
    worker.cargo = { kind: 'water', amount: 1 };
    routeWorkerTo(state, worker, 'watering', 'to-plot', task.target);
    return true;
  }

  if (task.kind === 'watering' && task.phase === 'to-plot' && worker.cargo?.kind === 'water') {
    const tile = tileAt(state, task.target.x, task.target.y);
    if (tile?.kind === 'plot' && tile.plot) {
      tile.plot.water = CROPS[tile.plot.cropId].waterTicks + state.upgrades.wateringCan * 30;
      state.stats.lifetimeWatered += 1;
    }
    delete worker.cargo;
    worker.task = idleTask();
    return true;
  }

  if (task.kind === 'harvesting' && task.phase === 'to-plot') {
    const tile = tileAt(state, task.target.x, task.target.y);
    if (tile?.kind === 'plot' && tile.plot && isReady(tile)) {
      const cropId = tile.plot.cropId;
      delete tile.plot;
      worker.cargo = { kind: 'crop', cropId, amount: 1 };
      state.stats.lifetimeHarvested[cropId] += 1;
      if (state.tick % Math.max(2, Math.round(1 / CROPS[cropId].seedReturnChance)) === 0) {
        state.inventory.seeds[cropId] += 1;
      }
      routeWorkerToDropoff(state, worker, cropId);
      return true;
    }
    worker.task = idleTask();
    return true;
  }

  if (task.kind === 'hauling' && task.phase === 'to-dropoff' && worker.cargo?.kind === 'crop' && worker.cargo.cropId) {
    storeCropOrOverflowSell(state, worker.cargo.cropId, worker.cargo.amount);
    delete worker.cargo;
    worker.task = idleTask();
    return true;
  }

  return false;
}

function assignWorkerTask(state: FarmState, worker: FarmWorker): void {
  const ready = findNearestTile(state, worker, (tile) => (
    tile.kind === 'plot' &&
    isReady(tile) &&
    !isPlotTaskReserved(state, worker, tile)
  ));
  if (ready) {
    routeWorkerTo(state, worker, 'harvesting', 'to-plot', ready);
    return;
  }

  const thirsty = findNearestTile(state, worker, (tile) => (
    tile.kind === 'plot' &&
    tile.plot !== undefined &&
    tile.plot.water <= 0 &&
    tile.plot.growth < CROPS[tile.plot.cropId].growTicks &&
    !isPlotTaskReserved(state, worker, tile)
  ));
  if (thirsty && findNearestBuilding(state, worker, 'well')) {
    routeWorkerToWell(state, worker, thirsty);
    return;
  }

  const emptyPlot = findNearestTile(state, worker, (tile) => (
    tile.kind === 'plot' &&
    !tile.plot &&
    !isPlotTaskReserved(state, worker, tile)
  ));
  const cropId = emptyPlot ? chooseCropForPlanting(state) : null;
  if (emptyPlot && cropId && state.inventory.seeds[cropId] > 0) {
    routeWorkerToStorage(state, worker, emptyPlot, cropId);
    return;
  }

  worker.task = idleTask();
}

function routeWorkerToStorage(state: FarmState, worker: FarmWorker, plot: FarmTile, cropId: CropId): void {
  const storage = findNearestBuilding(state, worker, 'storage');
  if (!storage) {
    worker.task = { ...idleTask(), kind: 'blocked' };
    return;
  }
  const path = pathToReach(state, worker, storage);
  if (!path) {
    worker.task = { ...idleTask(), kind: 'blocked' };
    return;
  }
  worker.task = {
    kind: 'planting',
    phase: 'to-storage',
    target: { x: plot.x, y: plot.y },
    cropId,
    path,
    progress: 0,
  };
}

function routeWorkerToWell(state: FarmState, worker: FarmWorker, plot: FarmTile): void {
  const well = findNearestBuilding(state, worker, 'well');
  if (!well) {
    worker.task = { ...idleTask(), kind: 'blocked' };
    return;
  }
  const path = pathToReach(state, worker, well);
  if (!path) {
    worker.task = { ...idleTask(), kind: 'blocked' };
    return;
  }
  worker.task = {
    kind: 'watering',
    phase: 'to-well',
    target: { x: plot.x, y: plot.y },
    path,
    progress: 0,
  };
}

function routeWorkerToDropoff(state: FarmState, worker: FarmWorker, cropId: CropId): void {
  const storage = findNearestBuilding(state, worker, 'storage');
  if (!storage) {
    worker.task = { ...idleTask(), kind: 'blocked' };
    return;
  }
  const path = pathToReach(state, worker, storage);
  worker.task = path
    ? {
        kind: 'hauling',
        phase: 'to-dropoff',
        target: { x: storage.x, y: storage.y },
        cropId,
        path,
        progress: 0,
      }
    : { ...idleTask(), kind: 'blocked' };
}

function routeWorkerTo(
  state: FarmState,
  worker: FarmWorker,
  kind: WorkerTask['kind'],
  phase: WorkerTask['phase'],
  target: Position,
  cropId?: CropId,
): void {
  const path = pathToTile(state, worker, target);
  if (!path) {
    worker.task = { ...idleTask(), kind: 'blocked' };
    return;
  }
  worker.task = { kind, phase, target, path, progress: 0 };
  if (cropId) {
    worker.task.cropId = cropId;
  }
}

function pathToReach(state: FarmState, worker: FarmWorker, target: FarmTile): Position[] | null {
  const candidates = neighbors(target)
    .filter((pos) => isWalkable(state, pos.x, pos.y))
    .map((pos) => pathToTile(state, worker, pos))
    .filter((path): path is Position[] => path !== null)
    .sort((a, b) => a.length - b.length);
  return candidates[0] ?? null;
}

function pathToTile(state: FarmState, worker: FarmWorker, target: Position): Position[] | null {
  if (worker.x === target.x && worker.y === target.y) return [];
  const result = findGridPath({
    width: state.width,
    height: state.height,
    start: { x: worker.x, y: worker.y },
    goal: target,
    blocked: (x, y) => !isWalkable(state, x, y),
    cost: () => 1,
  });
  return result ? result.path.slice(1) : null;
}

function isWalkable(state: FarmState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  if (!tile) return false;
  return tile.kind !== 'well' && tile.kind !== 'storage';
}

function findNearestTile(
  state: FarmState,
  worker: FarmWorker,
  predicate: (tile: FarmTile) => boolean,
): FarmTile | null {
  return Object.values(state.tiles)
    .filter(predicate)
    .sort((a, b) => distance(worker, a) - distance(worker, b))[0] ?? null;
}

function findNearestBuilding(state: FarmState, worker: FarmWorker, kind: 'well' | 'storage'): FarmTile | null {
  return findNearestTile(state, worker, (tile) => tile.kind === kind);
}

function isPlotTaskReserved(state: FarmState, worker: FarmWorker, tile: FarmTile): boolean {
  return state.workers.some((other) => (
    other.id !== worker.id &&
    (other.task.kind === 'planting' || other.task.kind === 'watering' || other.task.kind === 'harvesting') &&
    other.task.target?.x === tile.x &&
    other.task.target.y === tile.y
  ));
}

function chooseCropForPlanting(state: FarmState): CropId | null {
  const unlocked = state.tier.unlockedCrops.filter((id) => state.cropMix[id] > 0);
  if (unlocked.length === 0) return null;

  const planted = zeroCropRecord();
  for (const tile of Object.values(state.tiles)) {
    if (tile.kind === 'plot' && tile.plot) {
      planted[tile.plot.cropId] += 1;
    }
  }
  const totalPlanted = Object.values(planted).reduce((sum, count) => sum + count, 0);
  return unlocked
    .filter((id) => state.inventory.seeds[id] > 0)
    .sort((a, b) => {
      const aDelta = state.cropMix[a] - (totalPlanted === 0 ? 0 : planted[a] / totalPlanted);
      const bDelta = state.cropMix[b] - (totalPlanted === 0 ? 0 : planted[b] / totalPlanted);
      return bDelta - aDelta;
    })[0] ?? null;
}

function storeCropOrOverflowSell(state: FarmState, cropId: CropId, amount: number): void {
  for (let i = 0; i < amount; i++) {
    if (storedCropCount(state) < state.inventory.cropCapacity) {
      state.inventory.crops[cropId] += 1;
    } else {
      state.coins += CROPS[cropId].sellPrice;
      state.stats.lifetimeOverflowSold[cropId] += 1;
    }
  }
}

function updateTierAlerts(state: FarmState): void {
  const nextLevel = claimableTierLevel(state);
  if (!nextLevel) return;
  const nextTier = FARM_TIERS[nextLevel];
  state.alerts.push(`Tier ${nextLevel} ready: unlock ${nextTier.label} in Goals.`);
}

function updateSeedGuidanceAlerts(state: FarmState): void {
  if (state.alerts.length > 0) return;
  if (!state.workers.some((worker) => worker.task.kind === 'idle')) return;
  if (!Object.values(state.tiles).some((tile) => tile.kind === 'plot' && !tile.plot)) return;

  const desiredCrops = state.tier.unlockedCrops.filter((cropId) => state.cropMix[cropId] > 0);
  if (desiredCrops.length === 0) return;

  const availableSeeds = desiredCrops.reduce((sum, cropId) => sum + state.inventory.seeds[cropId], 0);
  if (availableSeeds > 0) return;
  if (!desiredCrops.some((cropId) => state.coins >= CROPS[cropId].seedPrice)) return;

  state.alerts.push('Restock seeds to keep farmers planting.');
}

function updatePlantingSpaceAlerts(state: FarmState): void {
  if (state.alerts.length > 0) return;
  if (!state.workers.some((worker) => worker.task.kind === 'idle')) return;
  if (Object.values(state.tiles).some((tile) => tile.kind === 'plot' && !tile.plot)) return;
  if (!Object.values(state.tiles).some((tile) => tile.kind === 'empty')) return;

  const desiredCrops = state.tier.unlockedCrops.filter((cropId) => state.cropMix[cropId] > 0);
  if (desiredCrops.length === 0) return;

  const availableSeeds = desiredCrops.reduce((sum, cropId) => sum + state.inventory.seeds[cropId], 0);
  if (availableSeeds <= 0) return;

  state.alerts.push('Paint plots on empty land so farmers can plant seeds.');
}
