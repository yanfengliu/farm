import type { CropDefinition, CropId } from '../content/crops';
import type { VillageRequestId } from '../content/communityRequests';
import type { TierLevel } from '../content/tiers';
import type { UpgradeId } from '../content/upgrades';
import type { CreekHabitatId, DuckActivity, WildlifeNodeId } from '../content/wildlife';
import type { Position, World } from './civEngine';

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
  lifetimeRequestsCompleted: number;
}

export interface FarmCommunity {
  activeRequestId: VillageRequestId | null;
  rotationIndex: number;
  completedCount: number;
  lifetimeCoins: number;
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

export interface FarmDuck {
  id: number;
  name: string;
  node: WildlifeNodeId;
  targetNode: WildlifeNodeId | null;
  targetFishId: number | null;
  travelProgress: number;
  activity: DuckActivity;
  activityTicks: number;
  hunger: number;
  energy: number;
  meals: number;
}

export interface FarmFish {
  id: number;
  node: CreekHabitatId;
  available: boolean;
  reservedByDuckId: number | null;
  respawnTick: number;
}

export interface FarmWildlife {
  ducks: FarmDuck[];
  fish: FarmFish[];
}

export interface FarmTier {
  level: TierLevel;
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
  community: FarmCommunity;
  wildlife: FarmWildlife;
  alerts: string[];
  history: FarmHistory;
}

export type FarmCommand =
  | { type: 'sellCrop'; cropId: CropId; amount: number }
  | { type: 'sellAllCrops' }
  | { type: 'buySeeds'; cropId: CropId; amount: number }
  | { type: 'buyUpgrade'; upgradeId: UpgradeId }
  | { type: 'claimNextTier' }
  | { type: 'acceptVillageRequest'; requestId: VillageRequestId }
  | { type: 'abandonVillageRequest' }
  | { type: 'fulfillVillageRequest' }
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
