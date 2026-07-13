import { CROP_IDS, CROPS, type CropId } from '../game/content/crops';
import type { FarmState } from '../game/simulation/farmGame';
import { cropIcon, iconSvg } from './pixelIcons';

type CropMixStatus = 'locked' | 'off' | 'no-seeds' | 'needs-plots' | 'ready';

export function cropMixAllocationMarkup(state: FarmState, percentages: Record<CropId, number>): string {
  const allocated = state.tier.unlockedCrops.reduce((sum, cropId) => sum + percentages[cropId], 0);
  return `
    <div class="crop-mix-allocation" aria-live="polite">
      <strong>${allocated}%</strong> allocated across unlocked crops
    </div>
  `;
}

export function cropMixRow(state: FarmState, cropId: CropId, percentages: Record<CropId, number>): string {
  const locked = !state.tier.unlockedCrops.includes(cropId);
  const value = percentages[cropId];
  const status = cropMixStatus(state, cropId, locked, value);
  const detail = cropMixDetail(state, cropId, status);
  const actionLabel = `Set ${CROPS[cropId].label} crop mix`;
  const numberActionLabel = `Set ${CROPS[cropId].label} crop mix percentage`;
  return `
    <div class="crop-mix" data-crop-id="${cropId}" data-crop-status="${status}">
      <span class="crop-mix-name">${iconSvg(cropIcon(cropId))}${CROPS[cropId].label}</span>
      <input class="crop-mix-slider" type="range" min="0" max="100" value="${value}" data-mix="${cropId}" title="${actionLabel}" aria-label="${actionLabel}" ${locked ? 'disabled' : ''} />
      <label class="crop-mix-number">
        <input type="number" min="0" max="100" step="1" inputmode="numeric" value="${value}" data-mix-number="${cropId}" title="${numberActionLabel}" aria-label="${numberActionLabel}" ${locked ? 'disabled' : ''} />
        <span>%</span>
      </label>
      <span class="crop-mix-detail">${detail}</span>
    </div>
  `;
}

export function cropMixPercentages(state: FarmState): Record<CropId, number> {
  const unlocked = CROP_IDS.filter((cropId) => state.tier.unlockedCrops.includes(cropId));
  const weights = zeroCropPercentages();
  for (const cropId of unlocked) {
    weights[cropId] = Math.max(0, state.cropMix[cropId] ?? 0);
  }
  return allocateCropPercentages(unlocked, weights, 100);
}

export function rebalanceCropMixPercentages(state: FarmState, changedCropId: CropId, requestedValue: number): Record<CropId, number> {
  const unlocked = CROP_IDS.filter((cropId) => state.tier.unlockedCrops.includes(cropId));
  if (!unlocked.includes(changedCropId)) return cropMixPercentages(state);
  if (unlocked.length === 1) {
    const singleCropMix = zeroCropPercentages();
    singleCropMix[changedCropId] = 100;
    return singleCropMix;
  }

  const next = zeroCropPercentages();
  const changedValue = clampPercent(requestedValue);
  next[changedCropId] = changedValue;

  const remainingCrops = unlocked.filter((cropId) => cropId !== changedCropId);
  const remainingTotal = 100 - changedValue;
  const currentPercentages = cropMixPercentages(state);
  const remainingWeights = zeroCropPercentages();
  for (const cropId of remainingCrops) {
    remainingWeights[cropId] = currentPercentages[cropId];
  }

  const remainingPercentages = allocateCropPercentages(remainingCrops, remainingWeights, remainingTotal);
  for (const cropId of remainingCrops) {
    next[cropId] = remainingPercentages[cropId];
  }
  return next;
}

function allocateCropPercentages(cropIds: CropId[], weights: Record<CropId, number>, totalPercent: number): Record<CropId, number> {
  const percentages = zeroCropPercentages();
  if (cropIds.length === 0 || totalPercent <= 0) return percentages;

  const totalWeight = cropIds.reduce((sum, cropId) => sum + Math.max(0, weights[cropId]), 0);
  if (totalWeight <= 0) {
    const evenShare = Math.floor(totalPercent / cropIds.length);
    let remainder = totalPercent - evenShare * cropIds.length;
    for (const cropId of cropIds) {
      percentages[cropId] = evenShare + (remainder > 0 ? 1 : 0);
      remainder -= 1;
    }
    return percentages;
  }

  const fractional = cropIds.map((cropId) => {
    const exact = (Math.max(0, weights[cropId]) / totalWeight) * totalPercent;
    const whole = Math.floor(exact);
    percentages[cropId] = whole;
    return { cropId, remainder: exact - whole };
  });

  let remainder = totalPercent - cropIds.reduce((sum, cropId) => sum + percentages[cropId], 0);
  fractional.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return CROP_IDS.indexOf(a.cropId) - CROP_IDS.indexOf(b.cropId);
  });
  for (const item of fractional) {
    if (remainder <= 0) break;
    percentages[item.cropId] += 1;
    remainder -= 1;
  }

  return percentages;
}

function zeroCropPercentages(): Record<CropId, number> {
  return { carrot: 0, wheat: 0, tomato: 0, pumpkin: 0 };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function cropMixStatus(state: FarmState, cropId: CropId, locked: boolean, value: number): CropMixStatus {
  if (locked) return 'locked';
  if (value <= 0) return 'off';
  if (state.inventory.seeds[cropId] <= 0) return 'no-seeds';
  if (emptyPlotCount(state) <= 0) return 'needs-plots';
  return 'ready';
}

function cropMixDetail(state: FarmState, cropId: CropId, status: CropMixStatus): string {
  if (status === 'locked') return 'Locked until a later tier';

  const stock = `Seeds ${state.inventory.seeds[cropId]} - Planted ${plantedCropCount(state, cropId)}`;
  if (status === 'off') return `${stock} - Disabled in mix`;
  if (status === 'no-seeds') return `${stock} - No seeds stocked`;
  if (status === 'needs-plots') return `${stock} - Needs empty plots`;
  return `${stock} - Ready for workers`;
}

function plantedCropCount(state: FarmState, cropId: CropId): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && tile.plot?.cropId === cropId).length;
}

function emptyPlotCount(state: FarmState): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && !tile.plot).length;
}
