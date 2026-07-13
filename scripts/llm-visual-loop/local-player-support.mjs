import { visibleCropStock, visibleSeedStock } from './visible-state.mjs';

const REQUEST_CROP_IDS = ['carrot', 'wheat', 'tomato', 'pumpkin'];

export function hasExplicitSeedGuidance(visibleText) {
  return /FARM GUIDE Buy Seeds|Farmers Waiting|Restock seeds/i.test(visibleText);
}

export function hasVisibleZeroSeedRestock(visibleText) {
  return /Inventory/i.test(visibleText) &&
    ['pumpkin', 'tomato', 'wheat', 'carrot'].some((cropId) => visibleSeedStock(visibleText, cropId) === 0) &&
    !shouldSellVisibleCrops(visibleText) &&
    !hasActionableGuidance(visibleText);
}

export function hasActionableGuidance(visibleText) {
  return /FARM GUIDE (Open Goals|Buy Seeds|Claim|Tune Crop Mix|Add (?:Tomatoes|Pumpkins) To Mix|Open Inventory|Sell Crops|Select Plot|Paint Empty Land|Meet The Village|Pin A Neighbor Basket)|Restock seeds|Paint plots on empty land|Tier \d+ ready|Active basket|Harvest the missing crops/i.test(visibleText);
}

export function shouldSellVisibleCrops(visibleText) {
  const openEndedTier = /Tier (?:3 Tomato Rows|4 .*Pumpkin)|All crops are unlocked|Keep expanding the farm/i.test(visibleText);
  const storage = visibleStorage(visibleText);
  const storagePressure = storage ? storage.used >= Math.max(10, Math.floor(storage.capacity * 0.8)) : false;
  const coins = visibleCoins(visibleText);
  return (
    /FARM GUIDE (Open Inventory|Sell Crops)|Storage is almost full/i.test(visibleText) ||
    storagePressure ||
    coins < 50 ||
    !openEndedTier
  );
}

export function visibleCoins(visibleText) {
  const match = visibleText.match(/Coins\s+(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export function visibleStorage(visibleText) {
  const match = visibleText.match(/Storage\s+(\d+)\/(\d+)/i);
  if (!match) return null;
  return {
    used: Number(match[1]),
    capacity: Number(match[2]),
  };
}

export function visibleTierReady(visibleText) {
  return /Tier \d+ ready/i.test(visibleText);
}

export function findSafeRequestPressureSellAction(observation, history) {
  if (!/\bInventory\b/i.test(observation.visibleText) || !shouldSellVisibleCrops(observation.visibleText)) return null;

  const requestText = [
    observation.visibleText,
    ...history.slice().reverse().map((step) => step.observation?.visibleText),
  ].find((text) => /Active basket/i.test(text ?? '') && parseRequestNeeds(text).size > 0);
  if (!requestText) return null;

  const needs = parseRequestNeeds(requestText);
  const candidates = REQUEST_CROP_IDS.flatMap((cropId, priority) => {
    const stock = visibleCropStock(observation.visibleText, cropId);
    const action = findAction(observation, `[data-sell="${cropId}"]`);
    const surplus = stock === null ? 0 : stock - (needs.get(cropId) ?? 0);
    return action && surplus > 0 ? [{ action, surplus, priority }] : [];
  });
  candidates.sort((left, right) => right.surplus - left.surplus || left.priority - right.priority);
  return candidates[0]?.action ?? null;
}

function parseRequestNeeds(visibleText) {
  const needs = new Map();
  const matches = String(visibleText ?? '').matchAll(/\d+\/(\d+)\s+(Carrot|Wheat|Tomato|Pumpkin)\b/gi);
  for (const match of matches) needs.set(match[2].toLowerCase(), Number(match[1]));
  return needs;
}

export function tutorialActionFromText(observation) {
  const text = observation.visibleText;
  if (/NEXT CLICK Select Plot|FARM GUIDE Select Plot/i.test(text)) return findAction(observation, '[data-tool="plot"]');
  if (/NEXT CLICK Open Inventory|FARM GUIDE Open Inventory/i.test(text)) return findAction(observation, '[data-panel="inventory"]');
  if (/NEXT CLICK Open Goals|FARM GUIDE Open Goals/i.test(text)) return findAction(observation, '[data-panel="goals"]');
  if (/NEXT CLICK Open Village Requests|FARM GUIDE Meet The Village/i.test(text)) return findAction(observation, '[data-panel="requests"]');
  if (/NEXT CLICK Pin one basket|FARM GUIDE Pin A Neighbor Basket/i.test(text)) return findAction(observation, '[data-accept-request');
  if (/NEXT CLICK Tune Crop Mix|FARM GUIDE Tune Crop Mix|FARM GUIDE Add (?:Tomatoes|Pumpkins) To Mix/i.test(text)) return findAction(observation, '[data-panel="mix"]');
  if (/NEXT CLICK Buy seeds|FARM GUIDE Buy Seeds/i.test(text)) return findSeedActionForVisibleNeed(observation);
  if (/NEXT CLICK Claim|FARM GUIDE Claim/i.test(text)) return findAction(observation, '[data-command="claim-tier"]');
  return null;
}

export function requestFlowState(actionHistory) {
  const accepted = actionHistory.filter((action) => (
    action.kind === 'click' && action.selector?.startsWith('[data-accept-request')
  )).length;
  const fulfilled = actionHistory.filter((action) => (
    action.kind === 'click' && action.selector === '[data-command="fulfill-request"]'
  )).length;
  return {
    accepted,
    fulfilled,
    pending: accepted > fulfilled,
    exercised: accepted > 0 && fulfilled > 0,
  };
}

export function summarizeActionHistory(actionHistory) {
  const clickedSelectors = new Set(actionHistory.filter((action) => action.kind === 'click').map((action) => action.selector));
  const pauseClickIndex = actionHistory.findIndex((action) => action.kind === 'click' && action.selector === '[data-command="pause"]');
  const speed2Index = actionHistory.findIndex((action) => action.kind === 'click' && action.selector === '[data-speed="2"]');
  const inspectToolIndex = actionHistory.findIndex((action) => (
    (action.kind === 'click' || action.kind === 'press') && action.selector === '[data-tool="inspect"]'
  ));
  const undoIndex = actionHistory.findIndex((action) => (
    (action.kind === 'click' && action.selector === '[data-command="undo"]') ||
    (action.kind === 'press' && action.key === 'Z')
  ));
  const plotShortcutIndex = actionHistory.findIndex((action) => action.kind === 'press' && action.key === '1');
  const claimIndex = actionHistory.findIndex((action) => action.kind === 'click' && action.selector === '[data-command="claim-tier"]');
  const tomatoAdjustIndex = actionHistory.findIndex((action) => (
    action.kind === 'adjust' && action.selector === '[data-mix-number="tomato"]'
  ));
  const afterTomato = tomatoAdjustIndex >= 0 ? actionHistory.slice(tomatoAdjustIndex + 1) : [];
  return {
    clickedSelectors,
    waitCount: actionHistory.filter((action) => action.kind === 'wait').length,
    canvasClickCount: actionHistory.filter((action) => action.kind === 'click' && action.selector === 'canvas').length,
    pannedCamera: actionHistory.some((action) => action.kind === 'press' && action.key === 'ArrowRight'),
    zoomedCamera: actionHistory.some((action) => action.kind === 'wheel' && action.selector === 'canvas'),
    hoveredPanelTab: actionHistory.some((action) => action.kind === 'hover' && action.selector === '[data-panel="inventory"]'),
    draggedCanvas: actionHistory.some((action) => action.kind === 'drag' && action.selector === 'canvas'),
    draggedPanelWithMouse: actionHistory.some((action) => action.kind === 'drag' && action.selector === '[data-panel-resizer]'),
    resizedPanelWithKeyboard: actionHistory.some((action) => action.kind === 'press' && action.selector === '[data-panel-resizer]'),
    collapsedPanel: actionHistory.filter((action) => action.kind === 'click' && action.selector === '[data-command="toggle-panel"]').length >= 1,
    expandedPanel: actionHistory.filter((action) => action.kind === 'click' && action.selector === '[data-command="toggle-panel"]').length >= 2,
    pausedWithButton: pauseClickIndex >= 0,
    resumedWithSpace: pauseClickIndex >= 0 && actionHistory.slice(pauseClickIndex + 1).some((action) => action.kind === 'press' && action.key === 'Space'),
    usedSpeed1: actionHistory.some((action) => action.kind === 'click' && action.selector === '[data-speed="1"]'),
    usedSpeed2: speed2Index >= 0,
    returnedToSpeed4AfterSpeedTour: speed2Index >= 0 && actionHistory.slice(speed2Index + 1).some((action) => action.kind === 'click' && action.selector === '[data-speed="4"]'),
    compactViewport: actionHistory.some((action) => action.kind === 'viewport' && action.width <= 1100 && action.height <= 760),
    openedInspectPanel: clickedSelectors.has('[data-panel="inspect"]'),
    selectedInspectTool: inspectToolIndex >= 0,
    inspectedCanvasTile: inspectToolIndex >= 0 && actionHistory.slice(inspectToolIndex + 1).some((action) => action.kind === 'click' && action.selector === 'canvas'),
    selectedWellTool: clickedSelectors.has('[data-tool="well"]'),
    selectedStorageTool: clickedSelectors.has('[data-tool="storage"]'),
    selectedLandTool: clickedSelectors.has('[data-tool="land"]'),
    selectedBulldozeTool: clickedSelectors.has('[data-tool="bulldoze"]'),
    usedUndo: undoIndex >= 0,
    usedRedo: undoIndex >= 0 && actionHistory.slice(undoIndex + 1).some((action) => (
      (action.kind === 'click' && action.selector === '[data-command="redo"]') || (action.kind === 'press' && action.key === 'Y')
    )),
    scrolledPanelDown: actionHistory.some((action) => action.kind === 'wheel' && action.selector === '[data-player-scroll="side-panel"]' && action.deltaY > 0),
    scrolledPanelUp: actionHistory.some((action) => action.kind === 'wheel' && action.selector === '[data-player-scroll="side-panel"]' && action.deltaY < 0),
    pressedPlotShortcut: plotShortcutIndex >= 0,
    canvasClickedAfterPlotShortcut: plotShortcutIndex >= 0 && actionHistory.slice(plotShortcutIndex + 1).some((action) => action.kind === 'click' && action.selector === 'canvas'),
    claimedTier: claimIndex >= 0,
    waitsAfterClaim: claimIndex >= 0 ? actionHistory.slice(claimIndex + 1).filter((action) => action.kind === 'wait').length : 0,
    adjustedWheatNumber: actionHistory.some((action) => action.kind === 'adjust' && action.selector === '[data-mix-number="wheat"]'),
    adjustedTomatoNumber: tomatoAdjustIndex >= 0,
    adjustedPumpkinNumber: actionHistory.some((action) => action.kind === 'adjust' && action.selector === '[data-mix-number="pumpkin"]'),
    openedMixAfterTomato: afterTomato.some((action) => action.kind === 'click' && action.selector === '[data-panel="mix"]'),
    openedGoalsAfterTomato: afterTomato.some((action) => action.kind === 'click' && action.selector === '[data-panel="goals"]'),
    selectedLandAfterTomato: afterTomato.some((action) => action.kind === 'click' && action.selector === '[data-tool="land"]'),
    dismissedTutorial: clickedSelectors.has('[data-command="dismiss-tutorial"]'),
    carrotSold: clickedSelectors.has('[data-sell="carrot"]'),
    wheatSold: clickedSelectors.has('[data-sell="wheat"]'),
    tierClaims: actionHistory.filter((action) => action.kind === 'click' && action.selector === '[data-command="claim-tier"]').length,
  };
}

export function recentlyClicked(actionHistory, selector) {
  return actionHistory.slice(-2).some((action) => action.kind === 'click' && action.selector === selector);
}

export function recentlyUsedCanvas(actionHistory) {
  return actionHistory.slice(-2).some((action) => (
    (action.kind === 'click' || action.kind === 'drag') && action.selector === 'canvas'
  ));
}

export function nextPaintPosition(canvasClickCount) {
  const positions = [
    { x: 276, y: 230 },
    { x: 326, y: 230 },
    { x: 376, y: 230 },
    { x: 426, y: 230 },
    { x: 476, y: 230 },
    { x: 276, y: 430 },
    { x: 326, y: 430 },
    { x: 376, y: 430 },
    { x: 426, y: 430 },
    { x: 476, y: 430 },
  ];
  return positions[canvasClickCount % positions.length];
}

export function clickDecision(action, rationale, position) {
  return {
    rationale,
    action: {
      kind: 'click',
      selector: action.selector,
      label: action.label,
      ...position,
    },
    expectedResult: `The visible control "${action.label}" should respond and the next screenshot should reflect the state change.`,
  };
}

export function hoverDecision(action, rationale) {
  return {
    rationale,
    action: { kind: 'hover', selector: action.selector, label: action.label },
    expectedResult: `Hovering "${action.label}" should reveal any player-visible tooltip or hover state without changing farm state.`,
  };
}

export function adjustDecision(action, rationale, value) {
  return {
    rationale,
    action: { kind: 'adjust', selector: action.selector, label: action.label, value },
    expectedResult: `The visible control "${action.label}" should change to ${value} and the next screenshot should show a rebalanced crop mix.`,
  };
}

export function pressDecision(key, rationale, durationMs = 0, keyboardAction = null) {
  return {
    rationale,
    action: {
      kind: 'press',
      key,
      durationMs,
      ...(keyboardAction ? { selector: keyboardAction.selector, label: keyboardAction.label } : {}),
    },
    expectedResult: durationMs > 0
      ? `The held ${key} key should move the farm camera while ordinary player controls remain available.`
      : `The ${key} key should trigger the same visible behavior a player would get from the keyboard.`,
  };
}

export function wheelDecision(action, rationale, deltaY) {
  return {
    rationale,
    action: { kind: 'wheel', selector: action.selector, label: action.label, deltaY },
    expectedResult: action.actionHint === 'scroll'
      ? 'The side panel should scroll while its content remains readable and clipped to the screenshot.'
      : 'The farm camera should zoom while the HUD, toolbar, and side panel stay readable.',
  };
}

export function dragDecision(action, rationale, start, delta) {
  return {
    rationale,
    action: {
      kind: 'drag', selector: action.selector, label: action.label,
      x: start.x, y: start.y, deltaX: delta.deltaX, deltaY: delta.deltaY,
    },
    expectedResult: action.actionHint === 'drag-resize'
      ? `Dragging "${action.label}" should resize the side panel while text and controls remain readable.`
      : `Dragging on "${action.label}" should apply the selected tool across visible farm tiles.`,
  };
}

export function viewportDecision(width, height, rationale) {
  return {
    rationale,
    action: { kind: 'viewport', width, height },
    expectedResult: `The game should remain readable and playable after resizing the browser viewport to ${width}x${height}.`,
  };
}

export function findAction(observation, selector) {
  return observation.availableActions.find((action) => action.selector === selector || action.selector.startsWith(selector));
}

export function findKeyboardAction(observation, key) {
  return observation.keyboardActions?.find((action) => action.key === key || action.alternateKeys?.includes(key));
}

export function findKeyboardControl(observation, key, selector) {
  const requestedKey = String(key || '');
  const requestedSelector = typeof selector === 'string' && selector.trim() ? selector.trim() : '';
  return observation.keyboardActions?.find((action) => {
    const keyMatches = action.key === requestedKey || action.alternateKeys?.includes(requestedKey);
    if (!keyMatches) return false;
    if (requestedSelector) return action.selector === requestedSelector;
    return true;
  });
}

export function findSeedAction(observation) {
  return (
    findAction(observation, '[data-seed-guidance-action]') ||
    findAction(observation, '[data-buy-seeds') ||
    observation.availableActions.find((action) => /buy .*seeds/i.test(action.label))
  );
}

export function findSeedActionForVisibleNeed(observation) {
  const milestoneCrop = visibleMilestoneCrop(observation.visibleText);
  if (milestoneCrop && visibleSeedStock(observation.visibleText, milestoneCrop) === 0) {
    const milestoneSeedAction = findAction(observation, `[data-buy-seeds="${milestoneCrop}"]`);
    if (milestoneSeedAction) return milestoneSeedAction;
  }
  for (const zeroSeedCrop of visibleZeroSeedCropsByPriority(observation.visibleText)) {
    const zeroSeedAction = findAction(observation, `[data-buy-seeds="${zeroSeedCrop}"]`);
    if (zeroSeedAction) return zeroSeedAction;
  }
  return findSeedAction(observation);
}

export function visibleMilestoneCrop(visibleText) {
  const match = visibleText.match(/Harvest\s+\d+\/\d+\s+(carrot|wheat|tomato|pumpkin)/i);
  return match ? match[1].toLowerCase() : null;
}

export function visibleZeroSeedCropsByPriority(visibleText) {
  return ['pumpkin', 'tomato', 'wheat', 'carrot'].filter((cropId) => visibleSeedStock(visibleText, cropId) === 0);
}

export function findUpgradeAction(observation) {
  return (
    findAction(observation, '[data-buy-upgrade="boots"]') ||
    findAction(observation, '[data-buy-upgrade="wateringCan"]') ||
    observation.availableActions.find((action) => action.selector?.startsWith('[data-buy-upgrade=')) ||
    observation.availableActions.find((action) => /buy (worker boots|watering cans)/i.test(action.label))
  );
}
