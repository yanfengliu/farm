import { CROP_IDS, type CropId } from '../game/content/crops';
import { UPGRADE_IDS } from '../game/content/upgrades';
import { claimableTierLevel, type FarmState } from '../game/simulation/farmGame';
import { cropMixPercentages } from './cropMixPanel';

type Panel = 'inventory' | 'requests' | 'goals' | 'mix' | 'inspect';

export function storedCropCount(state: FarmState): number {
  return Object.values(state.inventory.crops).reduce((sum, count) => sum + count, 0);
}

export function storagePressureInfo(state: FarmState): { stored: number; capacity: number } | null {
  const capacity = state.inventory.cropCapacity;
  if (capacity <= 0) return null;
  const stored = storedCropCount(state);
  return stored >= Math.ceil(capacity * 0.8) ? { stored, capacity } : null;
}

export function milestoneProgressText(state: FarmState): string {
  if (state.tier.level === 1) {
    return `Harvest ${Math.min(state.stats.lifetimeHarvested.carrot, 10)}/10 carrots`;
  }
  if (state.tier.level === 2) {
    return `Harvest ${Math.min(state.stats.lifetimeHarvested.wheat, 20)}/20 wheat`;
  }
  if (state.tier.level === 3) {
    return `Requests ${Math.min(state.community.completedCount, 3)}/3 · Tomatoes ${Math.min(state.stats.lifetimeHarvested.tomato, 10)}/10`;
  }
  return state.tier.nextMilestone;
}

function plantedCropCount(state: FarmState, cropId: CropId): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && tile.plot?.cropId === cropId).length;
}

function emptyPlotCount(state: FarmState): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && !tile.plot).length;
}

export function panelStateSignature(state: FarmState, activePanel: Panel): string {
  if (activePanel === 'goals') {
    return [
      activePanel,
      state.coins,
      state.tier.level,
      milestoneProgressText(state),
      claimableTierLevel(state) ?? 0,
      ...UPGRADE_IDS.map((upgradeId) => `${upgradeId}:${state.upgrades[upgradeId]}`),
      ...CROP_IDS.map((cropId) => `${cropId}:${state.stats.lifetimePlanted[cropId]}:${state.stats.lifetimeHarvested[cropId]}`),
    ].join('|');
  }
  if (activePanel === 'requests') {
    return [
      activePanel,
      state.tier.level,
      state.community.activeRequestId ?? 'none',
      state.community.rotationIndex,
      state.community.completedCount,
      ...CROP_IDS.map((cropId) => `${cropId}:${state.inventory.crops[cropId]}`),
    ].join('|');
  }
  if (activePanel === 'mix') {
    const mixPercentages = cropMixPercentages(state);
    return [
      activePanel,
      emptyPlotCount(state),
      ...CROP_IDS.map((cropId) => [
        cropId,
        mixPercentages[cropId],
        state.inventory.seeds[cropId],
        plantedCropCount(state, cropId),
        state.tier.unlockedCrops.includes(cropId) ? 'unlocked' : 'locked',
      ].join(':')),
    ].join('|');
  }
  if (activePanel !== 'inventory') return activePanel;
  return [
    activePanel,
    state.coins,
    state.inventory.cropCapacity,
    ...CROP_IDS.map((cropId) => [
      cropId,
      state.inventory.crops[cropId],
      state.inventory.seeds[cropId],
      state.tier.unlockedCrops.includes(cropId) ? 'unlocked' : 'locked',
    ].join(':')),
  ].join('|');
}
