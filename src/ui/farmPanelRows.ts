import { CROP_IDS, CROPS, type CropId } from '../game/content/crops';
import { seedPurchaseQuote } from '../game/content/economy';
import { FARM_TIERS, FARM_TIER_LIST, type TierLevel } from '../game/content/tiers';
import { UPGRADES, type UpgradeId } from '../game/content/upgrades';
import { claimableTierLevel, type FarmState } from '../game/simulation/farmGame';
import { buttonContent, cropIcon, iconSvg } from './pixelIcons';

export function inventoryRow(state: FarmState, cropId: CropId): string {
  const count = state.inventory.crops[cropId];
  const disabled = count > 0 ? '' : 'disabled';
  return `
    <div class="row">
      <span class="row-label">${iconSvg(cropIcon(cropId))}${CROPS[cropId].label}: ${count}</span>
      <span>
        <button data-sell="${cropId}" data-amount="1" ${disabled} title="Sell 1 ${CROPS[cropId].label}" aria-label="Sell 1 ${CROPS[cropId].label}">${buttonContent('coins', '1')}</button>
        <button data-sell="${cropId}" data-amount="5" ${disabled} title="Sell 5 ${CROPS[cropId].label}" aria-label="Sell 5 ${CROPS[cropId].label}">${buttonContent('coins', '5')}</button>
      </span>
    </div>
  `;
}


export function seedRow(state: FarmState, cropId: CropId): string {
  const locked = !state.tier.unlockedCrops.includes(cropId);
  const quote = seedPurchaseQuote(state.coins, cropId);
  const unaffordable = quote.amount === 0;
  const disabled = locked || unaffordable;
  const label = CROPS[cropId].label;
  const coinLabel = quote.cost === 1 ? 'coin' : 'coins';
  const actionLabel = locked ? `${label} seeds locked` : `Buy ${quote.amount} ${label} seeds for ${quote.cost} ${coinLabel}`;
  const title = locked ? `Unlock ${label} before buying seeds` : actionLabel;
  const buttonLabel = locked ? 'Locked' : `+${quote.amount} · ${quote.cost}c`;
  return `
    <div class="row">
      <span class="row-label">${iconSvg(cropIcon(cropId))}${label} seeds: ${state.inventory.seeds[cropId]}</span>
      <button data-buy-seeds="${cropId}" data-buy-seeds-amount="${quote.amount}" ${disabled ? 'disabled' : ''} title="${title}" aria-label="${actionLabel}">${buttonContent('seed', buttonLabel)}</button>
    </div>
  `;
}

export function tierUnlockRow(state: FarmState): string {
  const level = claimableTierLevel(state);
  if (!level) {
    const terminalTier = FARM_TIER_LIST[FARM_TIER_LIST.length - 1];
    const terminalCopy = 'All crops are unlocked. Fill village baskets, tune crop mix, expand land, and shape the harvest your way.';
    const currentCopy = state.tier.level >= terminalTier.level
      ? terminalCopy
      : 'Complete the milestone, then claim the next tier here.';
    return `
      <section class="tier-current-card">
        <span class="banner-kicker">Current Tier</span>
        <strong>${state.tier.label}</strong>
        <p class="small">${currentCopy}</p>
      </section>
    `;
  }
  const tier = FARM_TIERS[level];
  const currentTier = FARM_TIERS[state.tier.level as TierLevel];
  return `
    <section class="tier-unlock-banner" aria-label="Tier ${tier.level} ready">
      <div class="tier-banner-decoration" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="tier-banner-copy">
        <span class="banner-kicker">Tier Ready</span>
        <strong>Tier ${tier.level}: ${tier.label}</strong>
        <p>${currentTier.reward}</p>
      </div>
      <div class="reward-grid">
        ${currentTier.rewardDetails.map((detail) => `<span class="reward-chip">${iconSvg('claim')} ${detail}</span>`).join('')}
      </div>
      <button class="primary-action claim-button" data-command="claim-tier" title="Unlock Tier ${tier.level}" aria-label="Unlock Tier ${tier.level}">${buttonContent('claim', 'Claim Rewards')}</button>
    </section>
  `;
}

export function seedGuidanceRow(state: FarmState): string {
  if (!seedRestockNeeded(state)) return '';

  const milestoneCrop = milestoneCropId(state);
  const buyableCrops = state.tier.unlockedCrops.filter((cropId) => (
    state.cropMix[cropId] > 0 &&
    state.inventory.seeds[cropId] === 0 &&
    state.coins >= CROPS[cropId].seedPrice
  )).sort((a, b) => {
    if (a === milestoneCrop) return -1;
    if (b === milestoneCrop) return 1;
    return 0;
  });
  if (buyableCrops.length === 0) return '';

  return `
    <section class="seed-guidance" aria-label="Seed guidance">
      <div>
        <span class="banner-kicker">Farmers Waiting</span>
        <strong>Restock seeds</strong>
        <p class="small">Empty plots are ready, but farmers have no seeds to plant.</p>
      </div>
      <div class="seed-actions">
        ${buyableCrops.map((cropId) => {
          const isMilestoneCrop = cropId === milestoneCrop;
          const quote = seedPurchaseQuote(state.coins, cropId);
          const label = isMilestoneCrop
            ? `${CROPS[cropId].label} goal +${quote.amount} · ${quote.cost}c`
            : `${CROPS[cropId].label} +${quote.amount} · ${quote.cost}c`;
          const actionLabel = isMilestoneCrop
            ? `Buy ${quote.amount} ${CROPS[cropId].label} seeds for ${quote.cost} coins for current milestone`
            : `Buy ${quote.amount} ${CROPS[cropId].label} seeds for ${quote.cost} coins`;
          return `
          <button data-buy-seeds="${cropId}" data-buy-seeds-amount="${quote.amount}" data-seed-guidance-action="${cropId}" title="${actionLabel}" aria-label="${actionLabel}">
            ${buttonContent(cropIcon(cropId), label)}
          </button>
        `;
        }).join('')}
      </div>
    </section>
  `;
}

export function milestoneCropId(state: FarmState): CropId | null {
  const milestone = state.tier.nextMilestone.toLowerCase();
  return CROP_IDS.find((cropId) => milestone.includes(cropId)) ?? null;
}

export function seedBuyTargetAvailable(state: FarmState, cropId: CropId): boolean {
  return state.tier.unlockedCrops.includes(cropId) &&
    state.cropMix[cropId] > 0 &&
    state.inventory.seeds[cropId] === 0 &&
    state.coins >= CROPS[cropId].seedPrice;
}

export function seedRestockNeeded(state: FarmState): boolean {
  if (state.alerts.some((alert) => alert.includes('Restock seeds'))) return true;
  if (!state.workers.some((worker) => worker.task.kind === 'idle')) return false;
  if (!Object.values(state.tiles).some((tile) => tile.kind === 'plot' && !tile.plot)) return false;

  const desiredCrops = state.tier.unlockedCrops.filter((cropId) => state.cropMix[cropId] > 0);
  if (desiredCrops.length === 0) return false;

  const availableSeeds = desiredCrops.reduce((sum, cropId) => sum + state.inventory.seeds[cropId], 0);
  return availableSeeds <= 0 && desiredCrops.some((cropId) => seedBuyTargetAvailable(state, cropId));
}

export function upgradeRow(state: FarmState, upgradeId: UpgradeId): string {
  const upgrade = UPGRADES[upgradeId];
  const level = state.upgrades[upgradeId];
  const maxed = level >= upgrade.maxLevel;
  const cost = upgrade.costs[level];
  const disabled = maxed || state.coins < cost;
  return `
    <div class="upgrade-row">
      <div>
        <strong>${upgrade.label} ${level}/${upgrade.maxLevel}</strong>
        <p class="small">${upgrade.description}</p>
      </div>
      <button data-buy-upgrade="${upgradeId}" ${disabled ? 'disabled' : ''} title="${maxed ? `${upgrade.label} maxed` : `Buy ${upgrade.label}`}" aria-label="${maxed ? `${upgrade.label} maxed` : `Buy ${upgrade.label}`}">${buttonContent('upgrade', maxed ? 'Max' : `${cost}c`)}</button>
    </div>
  `;
}
