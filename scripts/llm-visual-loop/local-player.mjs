import { hasVisibleSellableCrops } from './visible-state.mjs';
import { selectGuidedPaintAction } from './guided-paint.mjs';
import {
  adjustDecision,
  clickDecision,
  dragDecision,
  findAction,
  findKeyboardAction,
  findKeyboardControl,
  findSafeRequestPressureSellAction,
  findSeedActionForActiveRequest,
  findSeedActionForVisibleNeed,
  findUpgradeAction,
  hasActionableGuidance,
  hasExplicitSeedGuidance,
  hasVisibleZeroSeedRestock,
  hoverDecision,
  nextPaintPosition,
  pressDecision,
  recentlyClicked,
  recentlyUsedCanvas,
  requestFlowState,
  shouldSellVisibleCrops,
  summarizeActionHistory,
  tutorialActionFromText,
  viewportDecision,
  visibleTierReady,
  wheelDecision,
} from './local-player-support.mjs';

export function chooseLocalHeuristicDecision({ observation, history, defaultWaitMs }) {
  const actionHistory = history.map((step) => step.decision?.action).filter(Boolean);
  const lastAction = actionHistory.at(-1);
  const state = summarizeActionHistory(actionHistory);
  const request = requestFlowState(actionHistory);
  const {
    clickedSelectors, waitCount, canvasClickCount, pannedCamera, zoomedCamera, hoveredPanelTab,
    draggedCanvas, draggedPanelWithMouse, resizedPanelWithKeyboard, collapsedPanel, expandedPanel,
    pausedWithButton, resumedWithSpace, usedSpeed1, usedSpeed2, returnedToSpeed4AfterSpeedTour,
    compactViewport, openedInspectPanel, selectedInspectTool, inspectedCanvasTile, selectedWellTool,
    selectedStorageTool, selectedLandTool, selectedBulldozeTool, usedUndo, usedRedo, scrolledPanelDown,
    scrolledPanelUp, pressedPlotShortcut, canvasClickedAfterPlotShortcut, claimedTier, waitsAfterClaim,
    adjustedWheatNumber, adjustedTomatoNumber, adjustedPumpkinNumber, openedMixAfterTomato,
    openedGoalsAfterTomato, selectedLandAfterTomato, dismissedTutorial, carrotSold, wheatSold, tierClaims,
  } = state;

  const canvasAction = findAction(observation, 'canvas');
  const panelScrollAction = findAction(observation, '[data-player-scroll="side-panel"]');
  const inventoryAction = findAction(observation, '[data-panel="inventory"]');
  const requestsAction = findAction(observation, '[data-panel="requests"]');
  const goalsAction = findAction(observation, '[data-panel="goals"]');
  const mixAction = findAction(observation, '[data-panel="mix"]');
  const inspectPanelAction = findAction(observation, '[data-panel="inspect"]');
  const inspectToolAction = findAction(observation, '[data-tool="inspect"]');
  const panelResizeAction = findAction(observation, '[data-panel-resizer]');
  const togglePanelAction = findAction(observation, '[data-command="toggle-panel"]');
  const pauseAction = findAction(observation, '[data-command="pause"]');
  const speed1Action = findAction(observation, '[data-speed="1"]');
  const speed2Action = findAction(observation, '[data-speed="2"]');
  const plotToolAction = findAction(observation, '[data-tool="plot"]');
  const wellToolAction = findAction(observation, '[data-tool="well"]');
  const storageToolAction = findAction(observation, '[data-tool="storage"]');
  const landToolAction = findAction(observation, '[data-tool="land"]');
  const bulldozeToolAction = findAction(observation, '[data-tool="bulldoze"]');
  const undoAction = findAction(observation, '[data-command="undo"]');
  const redoAction = findAction(observation, '[data-command="redo"]');
  const selectedPlotFromShortcut = pressedPlotShortcut && /\bTOOL Plot\b/i.test(observation.visibleText);
  const selectedPlotGuideVisible = /NEXT CLICK Select Plot|FARM GUIDE Select Plot/i.test(observation.visibleText);
  const explicitPaintGuidanceVisible = /FARM GUIDE Paint Empty Land|Paint plots on empty land/i.test(observation.visibleText);
  const terminalOpenEndedGuidanceVisible = /Tune mix, expand land, upgrade workers|All crops are unlocked/i.test(observation.visibleText);

  const claimAction = findAction(observation, '[data-command="claim-tier"]');
  if (claimAction) return clickDecision(claimAction, 'A visible tier reward is ready, so claim it before watching the farm continue.');
  if (goalsAction && !goalsAction.state?.active && visibleTierReady(observation.visibleText)) {
    return clickDecision(goalsAction, 'A visible tier-ready prompt points back to Goals, so reopen Goals even if it was used earlier.');
  }

  const fulfillRequestAction = findAction(observation, '[data-command="fulfill-request"]');
  if (fulfillRequestAction) {
    return clickDecision(fulfillRequestAction, 'The pinned village basket is visibly ready, so deliver it before selling any reserved crops.');
  }
  const acceptRequestAction = findAction(observation, '[data-accept-request');
  if (acceptRequestAction) {
    return clickDecision(acceptRequestAction, 'Pin a visible village basket so the local player exercises a request from acceptance through delivery.');
  }
  if (requestsAction && !requestsAction.state?.active && /FARM GUIDE Meet The Village|NEXT CLICK Open Village Requests/i.test(observation.visibleText)) {
    return clickDecision(requestsAction, 'Open Village Requests because the visible Farm Guide introduces the basket flow.');
  }

  const requestSeedAction = request.pending ? findSeedActionForActiveRequest(observation, history) : null;
  const seedAction = requestSeedAction ?? findSeedActionForVisibleNeed(observation);
  if (seedAction && hasExplicitSeedGuidance(observation.visibleText)) {
    const rationale = requestSeedAction
      ? 'The pinned basket is missing this crop and its visible seed stock is empty, so restock it before the general tier crop.'
      : 'Workers need seeds and the visible guidance offers a direct seed-buying action.';
    return clickDecision(seedAction, rationale);
  }
  if (request.pending && inventoryAction && !inventoryAction.state?.active && hasExplicitSeedGuidance(observation.visibleText)) {
    return clickDecision(inventoryAction, 'The pinned basket is stalled by visible seed guidance, so open Inventory before waiting for crops that cannot be planted.');
  }

  const speedAction = findAction(observation, '[data-speed="4"]');
  if (speedAction && !clickedSelectors.has(speedAction.selector)) return clickDecision(speedAction, 'Use the visible 4x speed control so idle farming progress can be observed in real browser time.');
  if (canvasAction && !pannedCamera) return pressDecision('ArrowRight', 'Pan the farm camera right with the keyboard so spatial navigation is covered like a player would do it.', 260);
  if (canvasAction && !zoomedCamera) return wheelDecision(canvasAction, 'Zoom the farm camera with the mouse wheel to verify readable play after changing scale.', -360);
  if (inventoryAction && !hoveredPanelTab) return hoverDecision(inventoryAction, 'Hover the icon-only Inventory panel tab so the player can read its label before relying on the icon.');
  if (panelResizeAction && !draggedPanelWithMouse) {
    return dragDecision(panelResizeAction, 'Drag the visible side-panel resize handle with the mouse so pointer resizing is covered before keyboard resizing.', { x: 7, y: 300 }, { deltaX: -88, deltaY: 0 });
  }
  const panelResizeKeyboardAction = findKeyboardControl(observation, 'ArrowLeft', '[data-panel-resizer]');
  if (panelResizeKeyboardAction && !resizedPanelWithKeyboard) {
    return pressDecision('ArrowLeft', 'Focus the visible side-panel resize handle and press ArrowLeft so the visual player covers keyboard resizing, not only mouse dragging.', 0, panelResizeKeyboardAction);
  }
  if (togglePanelAction && !collapsedPanel) return clickDecision(togglePanelAction, 'Collapse the side panel with the visible panel toggle so the visual loop audits the compact canvas state.');
  if (togglePanelAction && collapsedPanel && !expandedPanel) return clickDecision(togglePanelAction, 'Expand the side panel again so the player can continue using the panel after the collapse audit.');
  if (pauseAction && !pausedWithButton) return clickDecision(pauseAction, 'Pause the farm with the visible toolbar button so the loop exercises the time-control affordance.');
  const resumeKeyboardAction = findKeyboardControl(observation, 'Space', '[data-command="pause"]') || findKeyboardAction(observation, 'Space');
  if (pausedWithButton && resumeKeyboardAction && !resumedWithSpace) return pressDecision('Space', 'Resume from pause with the listed Space keyboard control, matching how a desktop player would recover flow.', 0, resumeKeyboardAction);
  if (speed1Action && !usedSpeed1) return clickDecision(speed1Action, 'Cycle through 1x speed so every visible speed control gets a real player action.');
  if (speed2Action && usedSpeed1 && !usedSpeed2) return clickDecision(speed2Action, 'Cycle through 2x speed before returning to the faster idle-play pace.');
  if (speedAction && usedSpeed2 && !returnedToSpeed4AfterSpeedTour) return clickDecision(speedAction, 'Return to 4x speed after auditing the slower speed buttons.');
  if (returnedToSpeed4AfterSpeedTour && !compactViewport) return viewportDecision(1024, 720, 'Resize to a compact desktop viewport so the visual loop checks text fit without leaving desktop scope.');

  if (inspectPanelAction && !openedInspectPanel) return clickDecision(inspectPanelAction, 'Open the Inspect panel before selecting a tile so object details are visible in a screenshot.');
  if (inspectToolAction && openedInspectPanel && !selectedInspectTool) return clickDecision(inspectToolAction, 'Select the visible Inspect tool so the next canvas click uses the same mode a player sees.');
  if (canvasAction && openedInspectPanel && (selectedInspectTool || /\bTOOL Inspect\b/i.test(observation.visibleText)) && !inspectedCanvasTile) {
    return clickDecision(canvasAction, 'Inspect a visible farm tile through the canvas so the Inspect panel contents are audited in the visual replay.', { x: 410, y: 290 });
  }
  if (wellToolAction && inspectedCanvasTile && !selectedWellTool) return clickDecision(wellToolAction, 'Select the visible Well tool so the LLM-player covers the building toolbar.');
  if (storageToolAction && inspectedCanvasTile && selectedWellTool && !selectedStorageTool) return clickDecision(storageToolAction, 'Select the visible Storage tool so storage placement controls are visibly audited.');
  if (landToolAction && inspectedCanvasTile && selectedStorageTool && !selectedLandTool) return clickDecision(landToolAction, 'Select the visible Land tool so expansion controls are represented in the visual loop.');
  if (bulldozeToolAction && inspectedCanvasTile && selectedLandTool && !selectedBulldozeTool) return clickDecision(bulldozeToolAction, 'Select the visible Bulldoze tool so destructive-tool selection is audited without applying it blindly.');

  const plotShortcutAction = findKeyboardAction(observation, '1');
  if (plotShortcutAction && !pressedPlotShortcut && selectedPlotGuideVisible) return pressDecision('1', 'Use the visible Plot keyboard shortcut so the LLM-player loop can exercise toolbar hotkeys, not only mouse clicks.');
  if (selectedPlotFromShortcut && canvasAction && !canvasClickedAfterPlotShortcut && selectedPlotGuideVisible) {
    return clickDecision(canvasAction, 'The Plot shortcut already selected the tool, so continue by clicking the farm canvas instead of re-clicking the toolbar.', { x: 410, y: 290 });
  }
  if (canvasClickedAfterPlotShortcut && undoAction && !usedUndo) return clickDecision(undoAction, 'Click Undo after a visible plot placement so the history control is exercised on a real change.');
  if (usedUndo && redoAction && !usedRedo) return clickDecision(redoAction, 'Click Redo after undoing the visible plot placement so history recovery is covered too.');
  if (canvasAction && !draggedCanvas && !selectedPlotGuideVisible && /\bTOOL Plot\b|Paint plots on empty land/i.test(observation.visibleText)) {
    return dragDecision(canvasAction, 'Drag across visible farm tiles with the selected Plot tool so drag-painting is covered like a player action.', { x: 410, y: 290 }, { deltaX: 72, deltaY: 0 });
  }

  const dismissTutorialAction = findAction(observation, '[data-command="dismiss-tutorial"]');
  if (dismissTutorialAction && request.exercised && !dismissedTutorial) {
    return clickDecision(dismissTutorialAction, 'Dismiss a later Farm Guide once so the visual player covers the explicit tutorial-close control.');
  }
  const tutorialAction = selectedPlotFromShortcut && canvasClickedAfterPlotShortcut && selectedPlotGuideVisible ? null : tutorialActionFromText(observation);
  if (tutorialAction && !recentlyClicked(actionHistory, tutorialAction.selector)) return clickDecision(tutorialAction, `Follow the visible tutorial prompt: ${tutorialAction.label}.`);

  const wheatNumberAction = findAction(observation, '[data-mix-number="wheat"]');
  if (wheatNumberAction && !adjustedWheatNumber && /Crop Mix|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(wheatNumberAction, 'Type a direct Wheat crop mix percentage so the visual loop covers the same numerical control a player sees.', 40);
  }
  const tomatoNumberAction = findAction(observation, '[data-mix-number="tomato"]');
  if (tomatoNumberAction && !adjustedTomatoNumber && /Tomato|Tomatoes are unlocked|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(tomatoNumberAction, 'Type a direct Tomato crop mix percentage so the visual loop covers the newly unlocked crop control.', 25);
  }
  const pumpkinNumberAction = findAction(observation, '[data-mix-number="pumpkin"]');
  if (pumpkinNumberAction && !adjustedPumpkinNumber && /Pumpkin|Pumpkins are unlocked|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(pumpkinNumberAction, 'Type a direct Pumpkin crop mix percentage so the visual loop audits the Tier 4 crop control.', 20);
  }
  if (inventoryAction && !inventoryAction.state?.active && /Crop Mix/i.test(observation.visibleText) && /No seeds stocked/i.test(observation.visibleText) && !recentlyClicked(actionHistory, inventoryAction.selector)) {
    return clickDecision(inventoryAction, 'Crop Mix shows a crop with no seeds stocked, so open Inventory to restock visible seed rows.');
  }

  const upgradeAction = findUpgradeAction(observation);
  if (upgradeAction && /Tool Upgrades|Worker Boots|Watering Cans/i.test(observation.visibleText)) return clickDecision(upgradeAction, 'Buy the visible worker upgrade so the playtest exercises progression beyond selling and tier claims.');
  if (panelScrollAction?.state?.canScrollDown && !scrolledPanelDown && /Inventory|Tier|Crop Mix|Inspect|Request/i.test(observation.visibleText)) return wheelDecision(panelScrollAction, 'Scroll the side panel down with the mouse wheel so the LLM sees lower panel content only after a player-like scroll.', 420);
  if (panelScrollAction?.state?.canScrollUp && scrolledPanelDown && !scrolledPanelUp) return wheelDecision(panelScrollAction, 'Scroll the side panel back up so primary controls remain reachable for the next player decision.', -420);

  const safeRequestSellAction = findSafeRequestPressureSellAction(observation, history);
  if (request.pending && safeRequestSellAction) {
    return clickDecision(safeRequestSellAction, 'Storage pressure is blocking the pinned basket, so sell one crop above its reserved need.');
  }
  if (request.pending && requestsAction && !requestsAction.state?.active && !hasExplicitSeedGuidance(observation.visibleText) && !explicitPaintGuidanceVisible) {
    return clickDecision(requestsAction, 'Return to the pinned Village Request before selling so its reserved basket can be checked and delivered.');
  }
  if (!request.pending && request.fulfilled < 3 && tierClaims >= 1 && requestsAction && !requestsAction.state?.active && request.accepted > 0) {
    return clickDecision(requestsAction, 'Return to Village Requests for the next basket on the path to Tier 4.');
  }

  const carrotSellAction = findAction(observation, '[data-sell="carrot"]');
  if (!request.pending && carrotSellAction && !carrotSold && hasVisibleSellableCrops(observation.visibleText) && shouldSellVisibleCrops(observation.visibleText)) {
    return clickDecision(carrotSellAction, 'Exercise the visible single-crop Carrot sell action before using the bulk sale control.');
  }
  const wheatSellAction = findAction(observation, '[data-sell="wheat"]');
  if (!request.pending && wheatSellAction && !wheatSold && hasVisibleSellableCrops(observation.visibleText) && shouldSellVisibleCrops(observation.visibleText)) {
    return clickDecision(wheatSellAction, 'Exercise the visible single-crop Wheat sell action before using the bulk sale control.');
  }
  const sellAllAction = findAction(observation, '[data-command="sell-all"]');
  if (!request.pending && sellAllAction && hasVisibleSellableCrops(observation.visibleText) && shouldSellVisibleCrops(observation.visibleText)) {
    return clickDecision(sellAllAction, 'The visible inventory shows crops ready to sell, so sell them before waiting again.');
  }

  const guidedPaintAction = selectGuidedPaintAction({ plotToolAction, canvasAction, explicitPaintGuidanceVisible, selectedPlotGuideVisible, recentlyUsedCanvas: recentlyUsedCanvas(actionHistory) });
  if (guidedPaintAction?.kind === 'select-plot') return clickDecision(guidedPaintAction.action, 'Reselect the Plot tool before following visible paint guidance.');
  if (guidedPaintAction?.kind === 'paint') return clickDecision(guidedPaintAction.action, 'Visible plot guidance is still active, so place another plot instead of ending the run.', nextPaintPosition(canvasClickCount));
  if (canvasAction && canvasClickCount < 2 && !selectedPlotGuideVisible && /\bTOOL Plot\b|Paint plots on empty land/i.test(observation.visibleText)) {
    return clickDecision(canvasAction, 'The selected plot tool needs a field click, so click an open farm tile visible on the canvas.', nextPaintPosition(canvasClickCount));
  }
  if (seedAction && hasVisibleZeroSeedRestock(observation.visibleText)) return clickDecision(seedAction, 'Visible Inventory seed rows show zero stock, so buy seeds before ending the run.');
  if (mixAction && !mixAction.state?.active && (terminalOpenEndedGuidanceVisible || /Tune mix/i.test(observation.visibleText)) && !openedMixAfterTomato) return clickDecision(mixAction, 'Open Crop Mix because the visible open-ended guidance asks the player to tune mix.');
  if (goalsAction && !goalsAction.state?.active && (terminalOpenEndedGuidanceVisible || /upgrade workers/i.test(observation.visibleText)) && !openedGoalsAfterTomato) return clickDecision(goalsAction, 'Open Goals because the visible open-ended guidance mentions worker upgrades.');
  if (landToolAction && !landToolAction.state?.active && (terminalOpenEndedGuidanceVisible || /expand land/i.test(observation.visibleText)) && !selectedLandAfterTomato) return clickDecision(landToolAction, 'Select the Land tool because the visible open-ended guidance asks the player to expand land.');
  if (goalsAction && !clickedSelectors.has(goalsAction.selector)) return clickDecision(goalsAction, 'Open the visible Goals panel because progression and tier rewards should be understandable there.');

  if (!request.pending && lastAction?.kind === 'wait' && claimedTier && waitsAfterClaim >= 2 && !hasActionableGuidance(observation.visibleText)) {
    return { rationale: 'The loop already claimed a tier and watched the post-claim farm for two intervals.', action: { kind: 'stop' }, expectedResult: 'End with a final screenshot for review.' };
  }
  if (!request.pending && lastAction?.kind === 'wait' && waitCount >= 7 && !hasActionableGuidance(observation.visibleText)) {
    return { rationale: 'Several watch intervals have passed without a higher-priority visible action becoming available.', action: { kind: 'stop' }, expectedResult: 'Stop before creating redundant screenshots.' };
  }
  return {
    rationale: request.pending
      ? 'A village basket is pinned, so keep its crops in storage and watch for the visible delivery action.'
      : 'No higher-priority visible action is available, so watch the autonomous farm loop for progress or stalls.',
    action: { kind: 'wait', ms: defaultWaitMs },
    expectedResult: 'The next screenshot should show workers, crops, storage, goals, requests, or guidance changing over real browser time.',
  };
}
