import { FARM_TIER_LIST } from '../game/content/tiers';
import { UPGRADE_IDS } from '../game/content/upgrades';
import type { FarmState } from '../game/simulation/farmGame';
import { seedGuidanceRow, tierUnlockRow, upgradeRow } from './farmPanelRows';
import { milestoneProgressText } from './panelState';

export function goalsMarkup(state: FarmState): string {
  return `
    <h2>Tier ${state.tier.level}</h2>
    <p>${state.tier.label}</p>
    <h3>Next milestone</h3>
    <p>${milestoneProgressText(state)}</p>
    ${tierUnlockRow(state)}
    ${seedGuidanceRow(state)}
    <h3>Tool Upgrades</h3>
    ${UPGRADE_IDS.map((id) => upgradeRow(state, id)).join('')}
    <h3>Progression</h3>
    <div class="tier-list">
      ${FARM_TIER_LIST.map((tier) => `
        <div class="${tier.level === state.tier.level ? 'current' : ''}">
          <strong>Tier ${tier.level}: ${tier.label}</strong>
          <span>${tier.nextMilestone}</span>
          <span>${tier.reward}</span>
        </div>
      `).join('')}
    </div>
    <h3>Stats</h3>
    <p class="small">Planted carrots: ${state.stats.lifetimePlanted.carrot}</p>
    <p class="small">Harvested carrots: ${state.stats.lifetimeHarvested.carrot}</p>
    <p class="small">Worker distance: ${state.stats.lifetimeWorkerDistance}</p>
    <p class="small">Land purchased: ${state.stats.lifetimeLandPurchased}</p>
    <p class="small">Village requests: ${state.stats.lifetimeRequestsCompleted}</p>
  `;
}
