import { CROP_IDS, CROPS } from '../game/content/crops';
import { villageRequestById, villageRequestOffers, type VillageRequestDefinition } from '../game/content/communityRequests';
import type { FarmState } from '../game/simulation/farmGame';
import { buttonContent, cropIcon, iconSvg } from './pixelIcons';

export function villageRequestBoardMarkup(state: FarmState): string {
  if (state.tier.level === 1) {
    return `
      <section class="request-board-locked" data-request-board-locked>
        <span class="request-board-sign">${iconSvg('basket')}</span>
        <p class="banner-kicker">Village Lane</p>
        <h2>Request Board</h2>
        <p>Unlock Tier 2 to trade hand-packed crop baskets with your neighbors.</p>
        <p class="small">Requests have no timer or penalty. Pick one whenever your farm is ready.</p>
      </section>
    `;
  }

  const active = state.community.activeRequestId
    ? villageRequestById(state.community.activeRequestId)
    : undefined;
  const body = active
    ? activeVillageRequestMarkup(state, active)
    : villageRequestOffers(state.tier.level, state.community.rotationIndex)
      .map((request) => villageRequestOfferMarkup(state, request))
      .join('');

  return `
    <header class="request-board-header">
      <div>
        <span class="banner-kicker">Village Lane</span>
        <h2>Request Board</h2>
      </div>
      <div
        class="request-stamp"
        data-request-completed-count
        role="status"
        title="Completed village requests"
        aria-label="${state.community.completedCount} village request${state.community.completedCount === 1 ? '' : 's'} completed"
      >
        ${iconSvg('claim')}<strong>${state.community.completedCount}</strong>
      </div>
    </header>
    <p class="small request-board-intro">Choose one neighbor basket. Hold those crops instead of selling them, then fulfill it for a cozy premium. No deadlines, no penalties.</p>
    <div class="request-board-list">${body}</div>
  `;
}

function villageRequestOfferMarkup(state: FarmState, request: VillageRequestDefinition): string {
  const marketValue = villageRequestMarketValue(request);
  return `
    <article class="village-request-card" data-village-request="${request.id}">
      <div class="request-pin" aria-hidden="true"></div>
      <div class="request-card-heading">
        <div><span class="request-neighbor">${request.neighbor}'s note</span><strong>${request.title}</strong></div>
        <span class="request-reward">${iconSvg('coins')}${request.rewardCoins}c</span>
      </div>
      <p>${request.note}</p>
      <div class="request-needs">${villageRequestNeedsMarkup(state, request)}</div>
      <div class="request-card-footer">
        <span class="small">${request.rewardCoins - marketValue}c neighbor bonus</span>
        <button data-accept-request="${request.id}" title="Accept ${request.title}" aria-label="Accept ${request.title}">${buttonContent('basket', 'Pin basket')}</button>
      </div>
    </article>
  `;
}

function activeVillageRequestMarkup(state: FarmState, request: VillageRequestDefinition): string {
  const ready = villageRequestReady(state, request);
  return `
    <article class="village-request-card active-request-card" data-active-request data-village-request="${request.id}">
      <div class="request-ribbon">Pinned for ${request.neighbor}</div>
      <div class="request-card-heading">
        <div><span class="request-neighbor">Active basket</span><strong>${request.title}</strong></div>
        <span class="request-reward">${iconSvg('coins')}${request.rewardCoins}c</span>
      </div>
      <p>${request.note}</p>
      <div class="request-needs">${villageRequestNeedsMarkup(state, request)}</div>
      <div class="request-readiness ${ready ? 'ready' : ''}">
        ${ready ? 'Basket ready - every crop is in storage.' : 'Harvest the missing crops, then return here.'}
      </div>
      <div class="request-card-footer active-request-actions">
        <button data-command="abandon-request" title="Unpin request with no penalty" aria-label="Abandon village request">Unpin</button>
        <button class="primary-action" data-command="fulfill-request" ${ready ? '' : 'disabled'} title="Deliver crop basket" aria-label="Fulfill village request">${buttonContent('claim', 'Deliver basket')}</button>
      </div>
    </article>
  `;
}

function villageRequestNeedsMarkup(state: FarmState, request: VillageRequestDefinition): string {
  return CROP_IDS
    .filter((cropId) => (request.needs[cropId] ?? 0) > 0)
    .map((cropId) => {
      const needed = request.needs[cropId] ?? 0;
      const stored = Math.min(state.inventory.crops[cropId], needed);
      const complete = stored >= needed;
      return `<span class="request-need ${complete ? 'complete' : ''}">${iconSvg(cropIcon(cropId))}<strong>${stored}/${needed}</strong> ${CROPS[cropId].label}</span>`;
    })
    .join('');
}

function villageRequestReady(state: FarmState, request: VillageRequestDefinition): boolean {
  return CROP_IDS.every((cropId) => state.inventory.crops[cropId] >= (request.needs[cropId] ?? 0));
}

function villageRequestMarketValue(request: VillageRequestDefinition): number {
  return CROP_IDS.reduce((total, cropId) => total + (request.needs[cropId] ?? 0) * CROPS[cropId].sellPrice, 0);
}
