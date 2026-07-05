import { World, findGridPath, type Position } from './civEngine';
import { CROPS, CROP_IDS, type CropDefinition, type CropId } from '../content/crops';
import { FARM_TIERS, type TierLevel } from '../content/tiers';
import { UPGRADES, UPGRADE_IDS, type UpgradeId } from '../content/upgrades';

export type TileKind = 'empty' | 'plot' | 'well' | 'storage';

export interface PlotState {
  cropId: CropId;
  growth: number;
  water: number;
}

export interface FarmTile {
  x: number;
  y: number;
  kind: TileKind;
  plot?: PlotState;
}

export interface FarmInventory {
  crops: Record<CropId, number>;
  seeds: Record<CropId, number>;
  cropCapacity: number;
}

export interface FarmStats {
  lifetimePlanted: Record<CropId, number>;
  lifetimeHarvested: Record<CropId, number>;
  lifetimeManualSold: Record<CropId, number>;
  lifetimeOverflowSold: Record<CropId, number>;
  lifetimeWatered: number;
  lifetimeWorkerDistance: number;
  lifetimeLandPurchased: number;
  lifetimeUpgradePurchases: number;
}

export interface WorkerCargo {
  kind: 'water' | 'seed' | 'crop';
  cropId?: CropId;
  amount: number;
}

export interface WorkerTask {
  kind: 'idle' | 'planting' | 'watering' | 'harvesting' | 'hauling' | 'blocked';
  phase?: 'to-storage' | 'to-well' | 'to-plot' | 'to-dropoff';
  target?: Position;
  cropId?: CropId;
  path: Position[];
  progress: number;
}

export interface FarmWorker {
  id: number;
  x: number;
  y: number;
  task: WorkerTask;
  cargo?: WorkerCargo;
}

export interface FarmTier {
  level: number;
  label: string;
  unlockedCrops: CropId[];
  nextMilestone: string;
}

export interface FarmHistory {
  undo: string[];
  redo: string[];
}

export interface FarmState {
  version: 1;
  tick: number;
  width: number;
  height: number;
  tiles: Record<string, FarmTile>;
  workers: FarmWorker[];
  inventory: FarmInventory;
  coins: number;
  cropMix: Record<CropId, number>;
  upgrades: Record<UpgradeId, number>;
  crops: Record<CropId, CropDefinition>;
  tier: FarmTier;
  stats: FarmStats;
  alerts: string[];
  history: FarmHistory;
}

export type FarmCommand =
  | { type: 'sellCrop'; cropId: CropId; amount: number }
  | { type: 'sellAllCrops' }
  | { type: 'buySeeds'; cropId: CropId; amount: number }
  | { type: 'buyUpgrade'; upgradeId: UpgradeId }
  | { type: 'buyLand'; x: number; y: number }
  | { type: 'paintTile'; x: number; y: number; tile: 'empty' | 'plot' }
  | { type: 'placeBuilding'; x: number; y: number; building: 'well' | 'storage' }
  | { type: 'bulldoze'; x: number; y: number }
  | { type: 'setCropMix'; mix: Partial<Record<CropId, number>> }
  | { type: 'undo' }
  | { type: 'redo' };

type FarmEvents = Record<string, never>;
type FarmCommands = { farmCommand: FarmCommand };
type FarmWorldState = { farm: FarmState };

export type FarmGame = World<FarmEvents, FarmCommands, Record<string, never>, FarmWorldState>;

const FARM_TPS = 10;
const STARTER_SEED_TRICKLE_TICKS = 240;
const LAND_COST = 5;
const STORAGE_CAPACITY_PER_BIN = 15;

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
  const ticks = Math.max(0, Math.floor((ms / 1000) * FARM_TPS));
  advanceFarm(game, ticks);
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
    `tier=${state.tier.level}`,
  ].join(' ');
}

function createInitialFarmState(): FarmState {
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
  tiles[keyOf(6, 2)] = { x: 6, y: 2, kind: 'storage' };

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
      seeds: { carrot: 8, wheat: 0, tomato: 0 },
      cropCapacity: STORAGE_CAPACITY_PER_BIN,
    },
    coins: 25,
    cropMix: { carrot: 1, wheat: 0, tomato: 0 },
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
    },
    alerts: [],
    history: { undo: [], redo: [] },
  };
}

function updateFarmState(state: FarmState): void {
  state.tick += 1;
  state.alerts = [];
  trickleStarterSeeds(state);
  growPlots(state);

  for (const worker of state.workers) {
    updateWorker(state, worker);
  }

  updateTier(state);
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
  const ready = findNearestTile(state, worker, (tile) => tile.kind === 'plot' && isReady(tile));
  if (ready) {
    routeWorkerTo(state, worker, 'harvesting', 'to-plot', ready);
    return;
  }

  const thirsty = findNearestTile(state, worker, (tile) => (
    tile.kind === 'plot' &&
    tile.plot !== undefined &&
    tile.plot.water <= 0 &&
    tile.plot.growth < CROPS[tile.plot.cropId].growTicks
  ));
  if (thirsty && findNearestBuilding(state, worker, 'well')) {
    routeWorkerToWell(state, worker, thirsty);
    return;
  }

  const emptyPlot = findNearestTile(state, worker, (tile) => tile.kind === 'plot' && !tile.plot);
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
  tile.kind = kind;
  delete tile.plot;
  reconcileStorageCapacity(state);
}

function placeBuilding(state: FarmState, x: number, y: number, building: 'well' | 'storage'): void {
  const tile = tileAt(state, x, y);
  if (!tile) return;
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

function updateTier(state: FarmState): void {
  if (state.tier.level === 1 && state.stats.lifetimeHarvested.carrot >= 10) {
    state.tier = tierState(2);
    state.workers.push({ id: 2, x: 4, y: 2, task: idleTask() });
    state.inventory.seeds.wheat += 4;
    state.cropMix = { carrot: 0.75, wheat: 0.25, tomato: 0 };
  }
  if (state.tier.level === 2 && state.stats.lifetimeHarvested.wheat >= 20) {
    state.tier = tierState(3);
    state.workers.push({ id: 3, x: 4, y: 2, task: idleTask() });
    state.inventory.seeds.tomato += 4;
    state.cropMix = { carrot: 0.6, wheat: 0.25, tomato: 0.15 };
  }
}

function mutateWithHistory(state: FarmState, mutate: () => void): void {
  const before = serializeCore(state);
  mutate();
  if (serializeCore(state) === before) return;
  state.history.undo.push(before);
  state.history.redo = [];
}

function restoreHistory(state: FarmState, direction: 'undo' | 'redo'): void {
  const source = direction === 'undo' ? state.history.undo : state.history.redo;
  const target = direction === 'undo' ? state.history.redo : state.history.undo;
  const serialized = source.pop();
  if (!serialized) return;
  target.push(serializeCore(state));
  const restored = JSON.parse(serialized) as Omit<FarmState, 'history'>;
  const history = state.history;
  Object.assign(state, restored, { history });
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

function cloneState(state: FarmState): FarmState {
  return structuredClone(state);
}

function idleTask(): WorkerTask {
  return { kind: 'idle', path: [], progress: 0 };
}

function zeroCropRecord(): Record<CropId, number> {
  return { carrot: 0, wheat: 0, tomato: 0 };
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

function tileAt(state: FarmState, x: number, y: number): FarmTile | undefined {
  return state.tiles[keyOf(x, y)];
}

function inBounds(state: FarmState, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.width && y < state.height;
}

function isAdjacentToOwned(state: FarmState, x: number, y: number): boolean {
  return neighbors({ x, y }).some((pos) => tileAt(state, pos.x, pos.y));
}

function neighbors(pos: Position): Position[] {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isReady(tile: FarmTile): boolean {
  return tile.kind === 'plot' && tile.plot !== undefined && tile.plot.growth >= CROPS[tile.plot.cropId].growTicks;
}

function storedCropCount(state: FarmState): number {
  return Object.values(state.inventory.crops).reduce((sum, count) => sum + count, 0);
}

function countTiles(state: FarmState, kind: TileKind): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === kind).length;
}

function movementMultiplier(state: FarmState): number {
  return 1 + state.upgrades.boots * 0.2;
}

function reconcileStorageCapacity(state: FarmState): void {
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

function tierState(level: TierLevel): FarmTier {
  const tier = FARM_TIERS[level];
  return { ...tier, unlockedCrops: [...tier.unlockedCrops] };
}

function normalizeFarmState(state: FarmState): FarmState {
  for (const tile of Object.values(state.tiles)) {
    const legacyKind = (tile as { kind: string }).kind;
    if (legacyKind === 'path') {
      tile.kind = 'empty';
      delete tile.plot;
    }
  }
  state.upgrades = { ...zeroUpgradeRecord(), ...(state.upgrades ?? {}) };
  state.stats.lifetimeUpgradePurchases ??= 0;
  return state;
}
