import { CROP_IDS, type CropId } from '../game/content/crops';
import type { VillageRequestId } from '../game/content/communityRequests';
import { FARM_TIER_LIST } from '../game/content/tiers';
import { UPGRADE_IDS, type UpgradeId } from '../game/content/upgrades';
import type { FarmAnnotationInteraction } from '../annotations/farmAnnotations';
import type { FarmCommand, FarmState } from '../game/simulation/farmGame';
import { cropMixAllocationMarkup, cropMixPercentages, cropMixRow, rebalanceCropMixPercentages } from './cropMixPanel';
import { FARM_TOOLS, mountFarmShell, toolLabel, type FarmShellElements, type Panel, type Tool } from './appShell';
import { inventoryRow, seedGuidanceRow, seedRow, tierUnlockRow, upgradeRow } from './farmPanelRows';
import { inspectMarkup } from './inspectPanel';
import { milestoneProgressText, panelStateSignature, storedCropCount } from './panelState';
import { PanelResizeController } from './panelResize';
import { buttonContent, iconSvg, toolbarButtonContent } from './pixelIcons';
import { villageRequestBoardMarkup } from './requestBoard';
import { TutorialOverlay } from './tutorialOverlay';
import type { FarmAnnotationUi } from './farmAnnotationUi';

export interface FarmUiBridge {
  getState(): FarmState;
  submit(command: FarmCommand): void;
  resetFarm(): void;
}

const PANEL_RENDER_INTERVAL_MS = 250;
const SPEED_STORAGE_KEY = 'farm-speed-v1';
const DRAFT_GAMEPLAY_KEYS = new Set([
  ' ', '0', '1', '2', '3', '4', '-', '=', 'a', 'b', 'd', 'home', 'i', 's', 'w', 'y', 'z',
  'arrowdown', 'arrowleft', 'arrowright', 'arrowup',
]);

export class FarmUiController {
  readonly shell: FarmShellElements;
  readonly #bridge: FarmUiBridge;
  readonly #tutorial: TutorialOverlay;
  #selectedTool: Tool = 'inspect';
  #activePanel: Panel = 'inventory';
  #selectedCell: { x: number; y: number } | null = null;
  #paused = false;
  #speed = loadSpeed();
  #panelCollapsed = false;
  #lastHudMarkup = '';
  #lastToolbarMarkup = '';
  #lastPanelMarkup = '';
  #lastRenderedPanel: Panel | null = null;
  #lastRenderedCollapsed = false;
  #lastPanelRenderedAt = 0;
  #lastPanelStateSignature = '';
  #persistenceWarning: string | null = null;
  #annotations: FarmAnnotationUi | null = null;

  constructor(bridge: FarmUiBridge) {
    this.#bridge = bridge;
    this.shell = mountFarmShell();
    this.#tutorial = new TutorialOverlay(this.shell);
    new PanelResizeController({
      shell: this.shell,
      isCollapsed: () => this.#panelCollapsed,
      onLayout: () => this.syncPanelScrollAffordance(),
    });
    this.attachEvents();
  }

  get selectedTool(): Tool {
    return this.#selectedTool;
  }

  get selectedCell(): { x: number; y: number } | null {
    return this.#selectedCell;
  }

  get paused(): boolean {
    return this.#paused;
  }

  get speed(): 1 | 2 | 4 {
    return this.#speed;
  }

  attachAnnotationUi(annotations: FarmAnnotationUi): void {
    this.#annotations = annotations;
    this.invalidateAnnotationPanel();
  }

  annotationInteraction(): FarmAnnotationInteraction {
    return {
      selectedTool: this.#annotations?.isAiming || this.#annotations?.isDrafting ? 'note' : this.#selectedTool,
      activePanel: this.#activePanel,
      paused: this.#paused,
      speed: this.#speed,
    };
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
  }

  openAnnotationPanel(): void {
    this.#activePanel = 'annotations';
    this.#panelCollapsed = false;
    this.invalidateAnnotationPanel();
  }

  invalidateAnnotationPanel(): void {
    this.#lastPanelMarkup = '';
    this.#lastRenderedPanel = null;
    this.#lastPanelStateSignature = '';
  }

  render(): void {
    const state = this.#bridge.getState();
    this.renderHud(state);
    this.renderToolbar();
    this.renderPanel(state);
    this.#tutorial.render(state, this.#activePanel, this.#selectedTool);
    this.#annotations?.renderOverlay();
  }

  applyTool(x: number, y: number): void {
    this.#selectedCell = { x, y };
    const command = this.commandForTool(x, y);
    if (command) this.#bridge.submit(command);
  }

  canDragTool(): boolean {
    if (this.#annotations?.isAiming || this.#annotations?.isDrafting) return false;
    return this.#selectedTool !== 'inspect' && this.#selectedTool !== 'well' && this.#selectedTool !== 'storage';
  }

  invalidateAfterReset(): void {
    this.#lastHudMarkup = '';
    this.#lastToolbarMarkup = '';
    this.#lastPanelMarkup = '';
    this.#lastPanelStateSignature = '';
    this.#tutorial.invalidate();
  }

  setPersistenceWarning(warning: string | null): void {
    if (warning === this.#persistenceWarning) return;
    this.#persistenceWarning = warning;
    this.#lastHudMarkup = '';
  }

  private commandForTool(x: number, y: number): FarmCommand | null {
    switch (this.#selectedTool) {
      case 'inspect':
        this.#activePanel = 'inspect';
        return null;
      case 'plot':
        return { type: 'paintTile', x, y, tile: 'plot' };
      case 'well':
        return { type: 'placeBuilding', x, y, building: 'well' };
      case 'storage':
        return { type: 'placeBuilding', x, y, building: 'storage' };
      case 'land':
        return { type: 'buyLand', x, y };
      case 'bulldoze':
        return { type: 'bulldoze', x, y };
    }
  }

  private renderHud(state: FarmState): void {
    const storage = `${storedCropCount(state)}/${state.inventory.cropCapacity}`;
    const markup = `
      <div><strong>Coins</strong><span>${state.coins}</span></div>
      <div><strong>Storage</strong><span>${storage}</span></div>
      <div><strong>Workers</strong><span>${state.workers.length}</span></div>
      <div><strong>Tier</strong><span>${state.tier.level} ${state.tier.label}</span></div>
      <div><strong>Tool</strong><span>${this.#annotations?.isAiming || this.#annotations?.isDrafting ? 'Note' : toolLabel(this.#selectedTool)}</span></div>
      <div><strong>Speed</strong><span>${this.#paused ? 'Paused' : `${this.#speed}x`}</span></div>
      <div class="hud-alert">${this.#persistenceWarning ?? state.alerts[0] ?? milestoneProgressText(state)}</div>
    `;
    if (markup !== this.#lastHudMarkup) {
      this.shell.hud.innerHTML = markup;
      this.#lastHudMarkup = markup;
    }
  }

  private renderToolbar(): void {
    const toolButtons = FARM_TOOLS.map((tool) => {
      if (tool.key === 'Z' || tool.key === 'Y') {
        const command = tool.key === 'Z' ? 'undo' : 'redo';
        return `<button class="tool-button" data-command="${command}" title="${tool.label} (${tool.key})" aria-label="${tool.label}">${toolbarButtonContent(tool.icon, tool.key, tool.label)}</button>`;
      }
      return `<button class="tool-button ${this.#selectedTool === tool.id ? 'active' : ''}" data-tool="${tool.id}" title="${tool.label} (${tool.key})" aria-label="${tool.label}">${toolbarButtonContent(tool.icon, tool.key, tool.label)}</button>`;
    }).join('');
    const speedButtons = [
      `<button class="tool-button ${this.#paused ? 'active' : ''}" data-command="pause" title="${this.#paused ? 'Resume' : 'Pause'} (Space)" aria-label="${this.#paused ? 'Resume' : 'Pause'}">${toolbarButtonContent(this.#paused ? 'play' : 'pause', 'Space', this.#paused ? 'Resume' : 'Pause')}</button>`,
      `<button class="tool-button ${!this.#paused && this.#speed === 1 ? 'active' : ''}" data-speed="1" title="1x speed (0)" aria-label="1x speed">${toolbarButtonContent('gauge', '0', '1x')}</button>`,
      `<button class="tool-button ${!this.#paused && this.#speed === 2 ? 'active' : ''}" data-speed="2" title="2x speed (-)" aria-label="2x speed">${toolbarButtonContent('zap', '-', '2x')}</button>`,
      `<button class="tool-button ${!this.#paused && this.#speed === 4 ? 'active' : ''}" data-speed="4" title="4x speed (=)" aria-label="4x speed">${toolbarButtonContent('zap', '=', '4x')}</button>`,
    ].join('');
    const annotationActive = Boolean(this.#annotations?.isAiming || this.#annotations?.isDrafting);
    const annotationButton = `<button class="tool-button ${annotationActive ? 'active' : ''}" data-command="toggle-annotations" title="Farm Notes (N)" aria-label="Farm Notes" aria-pressed="${annotationActive}">${toolbarButtonContent('note', 'N', 'Note')}</button>`;
    const markup = toolButtons + annotationButton + speedButtons;
    if (markup !== this.#lastToolbarMarkup) {
      this.shell.toolbar.innerHTML = markup;
      this.#lastToolbarMarkup = markup;
    }
  }

  private renderPanel(state: FarmState): void {
    this.shell.playArea.classList.toggle('panel-collapsed', this.#panelCollapsed);
    const toggle = document.querySelector<HTMLButtonElement>('.panel-toggle');
    if (toggle) {
      toggle.innerHTML = iconSvg(this.#panelCollapsed ? 'undo' : 'redo');
      toggle.title = this.#panelCollapsed ? 'Expand panel' : 'Collapse panel';
      toggle.setAttribute('aria-label', toggle.title);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-panel]')) {
      button.classList.toggle('active', button.dataset.panel === this.#activePanel);
    }
    const annotationCount = document.querySelector<HTMLElement>('.annotation-tab-count');
    if (annotationCount) {
      annotationCount.textContent = String(this.#annotations?.count ?? 0);
      annotationCount.hidden = !this.#annotations?.count;
    }

    const now = performance.now();
    const signature = panelStateSignature(state, this.#activePanel);
    const forceRender = this.#activePanel !== this.#lastRenderedPanel ||
      this.#panelCollapsed !== this.#lastRenderedCollapsed ||
      signature !== this.#lastPanelStateSignature;
    const activeElement = document.activeElement;
    const focusedLiveControl = (this.#activePanel === 'mix' &&
      activeElement instanceof HTMLInputElement &&
      Boolean(activeElement.dataset.mix || activeElement.dataset.mixNumber)) ||
      (this.#activePanel === 'annotations' && activeElement instanceof HTMLTextAreaElement);
    if (focusedLiveControl) {
      this.syncPanelScrollAffordance();
      return;
    }
    if (!forceRender && now - this.#lastPanelRenderedAt < PANEL_RENDER_INTERVAL_MS) {
      this.syncPanelScrollAffordance();
      return;
    }

    const markup = this.panelMarkup(state);
    if (markup !== this.#lastPanelMarkup) {
      this.shell.panelContent.innerHTML = markup;
      this.#lastPanelMarkup = markup;
    }
    this.#lastRenderedPanel = this.#activePanel;
    this.#lastRenderedCollapsed = this.#panelCollapsed;
    this.#lastPanelRenderedAt = now;
    this.#lastPanelStateSignature = signature;
    this.syncPanelScrollAffordance();
  }

  private panelMarkup(state: FarmState): string {
    if (this.#activePanel === 'inventory') {
      const hasSellableCrops = storedCropCount(state) > 0;
      return `
        <h2>Inventory</h2>
        ${CROP_IDS.map((id) => inventoryRow(state, id)).join('')}
        <h3>Seeds</h3>
        ${CROP_IDS.map((id) => seedRow(state, id)).join('')}
        <button data-command="sell-all" ${hasSellableCrops ? '' : 'disabled'} title="Sell all crops" aria-label="Sell all crops">${buttonContent('coins', 'Sell All')}</button>
        <p class="small">Crop overflow auto-sells at normal price. Seeds never auto-sell.</p>
      `;
    }
    if (this.#activePanel === 'requests') return villageRequestBoardMarkup(state);
    if (this.#activePanel === 'goals') return goalsMarkup(state);
    if (this.#activePanel === 'mix') {
      const percentages = cropMixPercentages(state);
      return `
        <h2>Crop Mix</h2>
        ${cropMixAllocationMarkup(state, percentages)}
        ${CROP_IDS.map((id) => cropMixRow(state, id, percentages)).join('')}
        <p class="small">Set one crop directly. The remaining unlocked crops automatically share the rest.</p>
      `;
    }
    if (this.#activePanel === 'annotations') return this.#annotations?.panelMarkup(state) ?? '';
    return inspectMarkup(state, this.#selectedCell);
  }

  private syncPanelScrollAffordance(): void {
    const content = this.shell.panelContent;
    const scrollable = !this.#panelCollapsed && content.scrollHeight > content.clientHeight + 1;
    this.shell.sidePanel.classList.toggle('can-scroll-up', scrollable && content.scrollTop > 1);
    this.shell.sidePanel.classList.toggle(
      'can-scroll-down',
      scrollable && content.scrollTop + content.clientHeight < content.scrollHeight - 1,
    );
  }

  private attachEvents(): void {
    this.shell.panelContent.addEventListener('scroll', () => this.syncPanelScrollAffordance());
    document.addEventListener('click', (event) => this.handleClick(event));
    document.addEventListener('input', (event) => this.handleMixPreview(event));
    document.addEventListener('change', (event) => this.handleMixCommit(event));
    document.addEventListener('keydown', (event) => this.handleKeydown(event));
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const clickedTutorialTarget = this.#tutorial.activeTargetContains(target);
    if (this.#annotations?.handleClick(target)) {
      if (clickedTutorialTarget) this.#tutorial.markActiveTargetSeen();
      return;
    }

    const panel = target.closest<HTMLElement>('[data-panel]')?.dataset.panel as Panel | undefined;
    if (panel) {
      this.#activePanel = panel;
      if (panel === 'mix') this.markMixTutorialsSeen();
    }

    if (this.#annotations?.ownsGameplayInput) {
      const command = target.closest<HTMLElement>('[data-command]')?.dataset.command;
      if (command === 'toggle-annotations') this.handleNamedCommand(command);
      return;
    }

    const tool = target.closest<HTMLElement>('[data-tool]')?.dataset.tool as Tool | undefined;
    if (tool) {
      this.#selectedTool = tool;
      this.#annotations?.stopAiming();
    }

    const command = target.closest<HTMLElement>('[data-command]')?.dataset.command;
    if (command === 'dismiss-tutorial') {
      this.#tutorial.markActiveTargetSeen();
      return;
    }
    this.handleNamedCommand(command);

    const nextSpeed = target.closest<HTMLElement>('[data-speed]')?.dataset.speed;
    if (nextSpeed) this.setSpeed(Number(nextSpeed));

    const sell = target.closest<HTMLElement>('[data-sell]');
    if (sell?.dataset.sell) {
      this.#bridge.submit({ type: 'sellCrop', cropId: sell.dataset.sell as CropId, amount: Number(sell.dataset.amount ?? 1) });
    }
    const request = target.closest<HTMLElement>('[data-accept-request]')?.dataset.acceptRequest;
    if (request) this.#bridge.submit({ type: 'acceptVillageRequest', requestId: request as VillageRequestId });
    const seeds = target.closest<HTMLElement>('[data-buy-seeds]');
    if (seeds?.dataset.buySeeds) {
      this.#bridge.submit({
        type: 'buySeeds',
        cropId: seeds.dataset.buySeeds as CropId,
        amount: Number(seeds.dataset.buySeedsAmount ?? 0),
      });
    }
    const upgrade = target.closest<HTMLElement>('[data-buy-upgrade]')?.dataset.buyUpgrade;
    if (upgrade) this.#bridge.submit({ type: 'buyUpgrade', upgradeId: upgrade as UpgradeId });
    if (clickedTutorialTarget) this.#tutorial.markActiveTargetSeen();
  }

  private handleNamedCommand(command: string | undefined): void {
    if (this.#annotations?.ownsGameplayInput && command !== 'toggle-annotations') return;
    if (command === 'undo') this.#bridge.submit({ type: 'undo' });
    if (command === 'redo') this.#bridge.submit({ type: 'redo' });
    if (command === 'pause' && !this.#annotations?.ownsGameplayInput) this.#paused = !this.#paused;
    if (command === 'toggle-annotations') this.#annotations?.toggleAiming();
    if (command === 'toggle-panel') this.#panelCollapsed = !this.#panelCollapsed;
    if (command === 'claim-tier') this.#bridge.submit({ type: 'claimNextTier' });
    if (command === 'abandon-request') this.#bridge.submit({ type: 'abandonVillageRequest' });
    if (command === 'fulfill-request') this.#bridge.submit({ type: 'fulfillVillageRequest' });
    if (command === 'sell-all') this.#bridge.submit({ type: 'sellAllCrops' });
  }

  private handleMixPreview(event: Event): void {
    const target = event.target;
    if (target instanceof Element && this.#annotations?.handleInput(target)) return;
    if (this.#annotations?.ownsGameplayInput) return;
    if (!(target instanceof HTMLInputElement)) return;
    const cropId = (target.dataset.mix ?? target.dataset.mixNumber) as CropId | undefined;
    if (!cropId || (target.dataset.mixNumber && target.value.trim() === '')) return;
    const requestedValue = Number(target.value);
    if (!Number.isFinite(requestedValue)) return;
    const percentages = rebalanceCropMixPercentages(this.#bridge.getState(), cropId, requestedValue);
    for (const id of CROP_IDS) {
      for (const control of this.shell.panelContent.querySelectorAll<HTMLInputElement>(`[data-mix="${id}"], [data-mix-number="${id}"]`)) {
        control.value = String(percentages[id]);
      }
    }
    const allocated = this.shell.panelContent.querySelector<HTMLElement>('.crop-mix-allocation strong');
    if (allocated) allocated.textContent = `${this.#bridge.getState().tier.unlockedCrops.reduce((sum, id) => sum + percentages[id], 0)}%`;
  }

  private handleMixCommit(event: Event): void {
    if (this.#annotations?.ownsGameplayInput) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const cropId = (target.dataset.mix ?? target.dataset.mixNumber) as CropId | undefined;
    if (!cropId || target.value.trim() === '') return;
    const requestedValue = Number(target.value);
    if (!Number.isFinite(requestedValue)) return;
    const mix = rebalanceCropMixPercentages(this.#bridge.getState(), cropId, requestedValue);
    this.#bridge.submit({ type: 'setCropMix', mix });
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (this.#annotations?.handleKeydown(event)) return;
    if (
      event.target instanceof Element &&
      event.target.closest('button, input, select, textarea, [contenteditable="true"], [role="button"]')
    ) return;
    const key = event.key.toLowerCase();
    if (
      this.#annotations?.ownsGameplayInput &&
      (DRAFT_GAMEPLAY_KEYS.has(key) || (key === 'r' && event.shiftKey))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (key === ' ') {
      event.preventDefault();
      if (!this.#annotations?.ownsGameplayInput) this.#paused = !this.#paused;
    }
    else if (key === '1') this.#selectedTool = 'plot';
    else if (key === '2') this.#selectedTool = 'well';
    else if (key === '3') this.#selectedTool = 'storage';
    else if (key === '4') this.#selectedTool = 'land';
    else if (key === 'b') this.#selectedTool = 'bulldoze';
    else if (key === 'i') this.#selectedTool = 'inspect';
    else if (key === 'z') this.#bridge.submit({ type: 'undo' });
    else if (key === 'y') this.#bridge.submit({ type: 'redo' });
    else if (key === '0') this.setSpeed(1);
    else if (key === '-') this.setSpeed(2);
    else if (key === '=') this.setSpeed(4);
    else if (key === 'r' && event.shiftKey) this.#bridge.resetFarm();
    this.#tutorial.markShortcutSeen(key);
  }

  private markMixTutorialsSeen(): void {
    const state = this.#bridge.getState();
    if (state.tier.unlockedCrops.length > 1 && !this.#tutorial.isSeen('open-mix-panel')) {
      this.#tutorial.markSeen('open-mix-panel');
    }
    if (state.tier.unlockedCrops.includes('tomato') && !this.#tutorial.isSeen('open-mix-for-tomatoes')) {
      this.#tutorial.markSeen('open-mix-for-tomatoes');
    }
  }

  private setSpeed(next: number): void {
    this.#speed = next === 2 || next === 4 ? next : 1;
    if (!this.#annotations?.ownsGameplayInput) this.#paused = false;
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, String(this.#speed));
    } catch {
      // Local storage can fail in private or restricted browser contexts.
    }
  }
}

function goalsMarkup(state: FarmState): string {
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

function loadSpeed(): 1 | 2 | 4 {
  try {
    const stored = Number(localStorage.getItem(SPEED_STORAGE_KEY));
    return stored === 2 || stored === 4 ? stored : 1;
  } catch {
    return 1;
  }
}
