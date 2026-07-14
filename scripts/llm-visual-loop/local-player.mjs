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
  findVisibleZeroSeedAction,
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
  typeDecision,
  visibleStorage,
  viewportDecision,
  visibleTierReady,
  wheelDecision,
} from './local-player-support.mjs';

export function chooseLocalHeuristicDecision({ observation, history, defaultWaitMs }) {
  const actionHistory = history
    .filter((step) => step.execution?.ok !== false)
    .map((step) => step.decision?.action)
    .filter(Boolean);
  const lastAction = actionHistory.at(-1);
  const state = summarizeActionHistory(actionHistory);
  const request = requestFlowState(actionHistory);
  const {
    clickedSelectors, canvasClickCount, pannedCamera, zoomedCamera, hoveredPanelTab,
    draggedCanvas, draggedPanelWithMouse, resizedPanelWithKeyboard, collapsedPanel, expandedPanel,
    pausedWithButton, resumedWithSpace, usedSpeed1, usedSpeed2, returnedToSpeed4AfterSpeedTour,
    compactViewport, openedInspectPanel, selectedInspectTool, inspectedCanvasTile, selectedWellTool,
    selectedStorageTool, selectedLandTool, selectedBulldozeTool, usedUndo, usedRedo, scrolledPanelDown,
    scrolledPanelUp, pressedPlotShortcut, canvasClickedAfterPlotShortcut, waitsAfterClaim, checkedGoalsAfterLatestClaim,
    adjustedCarrotNumber, adjustedCarrotSlider, adjustedWheatSlider, adjustedWheatNumber,
    adjustedTomatoNumber, adjustedTomatoSlider, adjustedPumpkinNumber, adjustedPumpkinSlider, openedMixAfterTomato,
    openedGoalsAfterTomato, selectedLandAfterTomato, dismissedTutorial, carrotSold, wheatSold, tomatoSold, pumpkinSold, tierClaims,
    startedAnnotation, annotationAimToggleCount, selectedAnnotationPoint, selectedAnnotationBox,
    capturedAnnotation, cancelledAnnotationDraft,
    typedAnnotation, savedAnnotation, openedAnnotationPanel, viewedAnnotation, viewedAnnotationPin,
    annotationEditStarts, cancelledAnnotationEdit, typedAnnotationEdit, savedAnnotationEdit,
    copiedAnnotation, copiedAnnotations, exportedAnnotation, exportedAnnotations, deleteAnnotationClicks,
  } = state;

  const canvasAction = findAction(observation, 'canvas');
  const panelScrollAction = findAction(observation, '[data-player-scroll="side-panel"]');
  const inventoryAction = findAction(observation, '[data-panel="inventory"]');
  const sellAllAction = findAction(observation, '[data-command="sell-all"]');
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
  const dismissTutorialAction = findAction(observation, '[data-command="dismiss-tutorial"]');
  const annotationToggleAction = findAction(observation, '[data-command="toggle-annotations"]');
  const annotationDraftAction = findAction(observation, '[data-annotation-draft]');
  const saveAnnotationAction = findAction(observation, '[data-command="save-annotation"]');
  const annotationPanelAction = findAction(observation, '[data-panel="annotations"]');
  const viewAnnotationAction = findAction(observation, '[data-command="view-annotation"]');
  const annotationPinAction = findAction(observation, '[data-annotation-id=');
  const annotationAimAction = findAction(observation, '[data-command="start-annotation"]');
  const annotationPointAction = findAction(observation, '[data-command="set-annotation-point"]');
  const annotationBoxAction = findAction(observation, '[data-command="set-annotation-box"]');
  const cancelAnnotationAction = findAction(observation, '[data-command="cancel-annotation"]');
  const editAnnotationAction = findAction(observation, '[data-command="edit-annotation"]');
  const annotationEditAction = findAction(observation, '[data-annotation-edit]');
  const cancelEditAnnotationAction = findAction(observation, '[data-command="cancel-edit-annotation"]');
  const saveEditAnnotationAction = findAction(observation, '[data-command="save-edit-annotation"]');
  const copyAnnotationAction = findAction(observation, '[data-command="copy-annotation"]');
  const copyAnnotationsAction = findAction(observation, '[data-command="copy-annotations"]');
  const exportAnnotationAction = findAction(observation, '[data-command="export-annotation"]');
  const exportAnnotationsAction = findAction(observation, '[data-command="export-annotations"]');
  const deleteAnnotationAction = findAction(observation, '[data-command="delete-annotation"]');
  const annotationPointModeConfirmed = selectedAnnotationPoint && annotationPointAction?.state?.pressed === 'true';
  const annotationBoxModeConfirmed = selectedAnnotationBox && annotationBoxAction?.state?.pressed === 'true';
  const annotationBoxDraftVisible = Boolean(
    annotationDraftAction && /\bBoxing\b|\bPin box\b/i.test(observation.visibleText),
  );
  const capturedBoxAnnotation = annotationBoxDraftVisible || (
    capturedAnnotation && (typedAnnotation || savedAnnotation)
  );
  const selectedPlotFromShortcut = pressedPlotShortcut && /\bTOOL Plot\b/i.test(observation.visibleText);
  const selectedPlotGuideVisible = /NEXT CLICK Select Plot|FARM GUIDE Select Plot/i.test(observation.visibleText);
  const explicitPaintGuidanceVisible = /FARM GUIDE Paint Empty Land|Paint plots on empty land/i.test(observation.visibleText);
  const terminalOpenEndedGuidanceVisible = /Tune mix, expand land, upgrade workers|All crops are unlocked/i.test(observation.visibleText);
  const urgentStorageGuidanceVisible = /FARM GUIDE Open Inventory|Storage is almost full/i.test(observation.visibleText);
  const storage = visibleStorage(observation.visibleText);
  const storageAtCapacity = Boolean(storage && storage.used >= storage.capacity);
  const guidedPaintAction = selectGuidedPaintAction({
    plotToolAction,
    canvasAction,
    explicitPaintGuidanceVisible,
    selectedPlotGuideVisible,
    recentlyUsedCanvas: recentlyUsedCanvas(actionHistory),
  });

  const latestActionPaintedCanvas = lastAction?.kind === 'click' && lastAction.selector === 'canvas';
  if (canvasClickedAfterPlotShortcut && latestActionPaintedCanvas && undoAction && !usedUndo) {
    return clickDecision(undoAction, 'Undo the plot immediately after painting it so history coverage cannot roll back a later gameplay command.');
  }
  if (usedUndo && lastAction?.kind === 'click' && lastAction.selector === '[data-command="undo"]' && redoAction && !usedRedo) {
    return clickDecision(redoAction, 'Redo the just-undone plot before any other gameplay command changes the history target.');
  }

  const claimAction = findAction(observation, '[data-command="claim-tier"]');
  if (claimAction) return clickDecision(claimAction, 'A visible tier reward is ready, so claim it before watching the farm continue.');
  if (goalsAction && !goalsAction.state?.active && visibleTierReady(observation.visibleText)) {
    return clickDecision(goalsAction, 'A visible tier-ready prompt points back to Goals, so reopen Goals even if it was used earlier.');
  }

  const fulfillRequestAction = findAction(observation, '[data-command="fulfill-request"]');
  if (fulfillRequestAction) {
    return clickDecision(fulfillRequestAction, 'The pinned village basket is visibly ready, so deliver it before selling any reserved crops.');
  }
  const abandonRequestAction = findAction(observation, '[data-command="abandon-request"]');
  if (abandonRequestAction && request.accepted === 1 && request.fulfilled === 0 && request.abandoned === 0) {
    return clickDecision(abandonRequestAction, 'Unpin the first unready basket once so the no-deadline request board also proves its no-penalty choice.');
  }
  const acceptRequestAction = findAction(observation, '[data-accept-request');
  if (acceptRequestAction && request.fulfilled < 3) {
    return clickDecision(acceptRequestAction, 'Pin a visible village basket so the local player exercises a request from acceptance through delivery.');
  }
  if (requestsAction && !requestsAction.state?.active && /FARM GUIDE Meet The Village|NEXT CLICK Open Village Requests/i.test(observation.visibleText)) {
    return clickDecision(requestsAction, 'Open Village Requests because the visible Farm Guide introduces the basket flow.');
  }

  const requestSeedAction = request.pending ? findSeedActionForActiveRequest(observation, history) : null;
  const visibleZeroSeedAction = findVisibleZeroSeedAction(observation);
  const seedAction = requestSeedAction ?? findSeedActionForVisibleNeed(observation);
  if (seedAction && hasExplicitSeedGuidance(observation.visibleText)) {
    const rationale = requestSeedAction
      ? 'The pinned basket is missing this crop and its visible seed stock is empty, so restock it before the general tier crop.'
      : 'Workers need seeds and the visible guidance offers a direct seed-buying action.';
    return clickDecision(seedAction, rationale);
  }
  if (inventoryAction && !inventoryAction.state?.active && hasExplicitSeedGuidance(observation.visibleText)) {
    const rationale = request.pending
      ? 'The pinned basket is stalled by visible seed guidance, so open Inventory before waiting for crops that cannot be planted.'
      : 'Visible seed guidance says planting is stalled, so open Inventory from the current panel before waiting again.';
    return clickDecision(inventoryAction, rationale);
  }
  if (dismissTutorialAction && !dismissedTutorial && /FARM GUIDE Paint Empty Land/i.test(observation.visibleText)) {
    return clickDecision(dismissTutorialAction, 'Dismiss the canvas-blocking paint card before following its guidance on the farm itself.');
  }
  if (dismissTutorialAction && guidedPaintAction?.kind === 'paint') {
    return clickDecision(
      dismissTutorialAction,
      'Dismiss the current guide card before following separate visible paint guidance on the canvas.',
    );
  }

  if (cancelAnnotationAction && capturedBoxAnnotation && !cancelledAnnotationDraft) {
    return clickDecision(
      cancelAnnotationAction,
      'Cancel the first captured draft once so annotation pause cleanup and re-aiming stay in the player rotation.',
    );
  }
  if (annotationDraftAction && capturedBoxAnnotation && !typedAnnotation) {
    return typeDecision(
      annotationDraftAction,
      'Write a bounded debugging comment through the same visible field available to the player.',
      'LLM playtest note: verify the selected detail and camera framing.',
    );
  }
  if (saveAnnotationAction && typedAnnotation && !savedAnnotation) {
    return clickDecision(
      saveAnnotationAction,
      'Pin the completed debugging note so its marker, list row, persistence, and debug bundle enter the visual replay.',
    );
  }
  if (annotationPanelAction && savedAnnotation && !openedAnnotationPanel) {
    return clickDecision(
      annotationPanelAction,
      'Open the saved Farm Notes list through its player-facing panel tab so the new pin can be reviewed.',
    );
  }
  if (viewAnnotationAction && openedAnnotationPanel && !viewedAnnotation) {
    return clickDecision(
      viewAnnotationAction,
      'View the saved note so its camera restoration and highlighted world marker enter the visual replay.',
    );
  }
  if (annotationPinAction && viewedAnnotation && !viewedAnnotationPin) {
    return clickDecision(
      annotationPinAction,
      'Click the world pin after using View so both player-facing ways to restore the captured camera are exercised.',
    );
  }
  if (editAnnotationAction && viewedAnnotation && viewedAnnotationPin && annotationEditStarts === 0) {
    return clickDecision(editAnnotationAction, 'Open the saved note editor through its visible record action.');
  }
  if (cancelEditAnnotationAction && annotationEditStarts === 1 && !cancelledAnnotationEdit) {
    return clickDecision(cancelEditAnnotationAction, 'Cancel one edit so the non-destructive editor exit remains covered.');
  }
  if (editAnnotationAction && viewedAnnotation && viewedAnnotationPin && cancelledAnnotationEdit && annotationEditStarts === 1) {
    return clickDecision(editAnnotationAction, 'Reopen the note editor to complete and save an actual revision.');
  }
  if (annotationEditAction && annotationEditStarts >= 2 && !typedAnnotationEdit) {
    return typeDecision(
      annotationEditAction,
      'Revise the saved debugging comment through the visible edit field.',
      'Edited LLM playtest note: the selected detail and camera framing are verified.',
    );
  }
  if (saveEditAnnotationAction && typedAnnotationEdit && !savedAnnotationEdit) {
    return clickDecision(saveEditAnnotationAction, 'Save the revised note before exercising its sharing and deletion controls.');
  }
  if (copyAnnotationAction && savedAnnotationEdit && !copiedAnnotation) {
    return clickDecision(copyAnnotationAction, 'Copy the single note bundle through its visible record action.');
  }
  if (copyAnnotationsAction && copiedAnnotation && !copiedAnnotations) {
    return clickDecision(copyAnnotationsAction, 'Copy the complete Farm Notes collection through the bulk action.');
  }
  if (exportAnnotationAction && copiedAnnotations && !exportedAnnotation) {
    return clickDecision(exportAnnotationAction, 'Export the single note after its clipboard path has been exercised.');
  }
  if (exportAnnotationsAction && exportedAnnotation && !exportedAnnotations) {
    return clickDecision(exportAnnotationsAction, 'Export the complete note collection through the bulk action.');
  }
  if (deleteAnnotationAction && exportedAnnotations && deleteAnnotationClicks < 2) {
    return clickDecision(
      deleteAnnotationAction,
      deleteAnnotationClicks === 0
        ? 'Start the guarded note deletion so the confirmation state enters the visual replay.'
        : 'Confirm the already-requested note deletion through the second explicit click.',
    );
  }
  if (annotationAimAction && startedAnnotation && !capturedBoxAnnotation && annotationAimToggleCount < 2) {
    return clickDecision(
      annotationAimAction,
      annotationAimToggleCount === 0
        ? 'Stop aiming once so the annotation mode cancel path is exercised before choosing a target.'
        : 'Restart aiming from the Notes panel so target selection can continue after cancellation.',
    );
  }
  if (annotationPointAction && startedAnnotation && annotationAimToggleCount >= 2 &&
    !selectedAnnotationBox && !annotationPointModeConfirmed) {
    return clickDecision(
      annotationPointAction,
      'Select the visible Point note control once before switching modes so both annotation targeting choices are exercised.',
    );
  }
  if (annotationBoxAction && startedAnnotation && selectedAnnotationPoint && !annotationBoxModeConfirmed) {
    return clickDecision(
      annotationBoxAction,
      'Switch to the visible Box note control so the annotation can identify a whole visual region, not only one point.',
    );
  }
  if (canvasAction && startedAnnotation && annotationBoxModeConfirmed && !capturedBoxAnnotation) {
    return dragDecision(
      canvasAction,
      'Drag a bounded box around a visible farm region through the same canvas gesture available to the player.',
      { x: 430, y: 240 },
      { deltaX: 180, deltaY: 120 },
      'The selected farm region should become a paused annotation draft with a visible bounding box and evidence preview.',
    );
  }
  if (annotationToggleAction && !startedAnnotation) {
    return clickDecision(
      annotationToggleAction,
      'Open Farm Notes so the LLM-player proves the debugging annotation flow end to end.',
    );
  }

  const recentlyCheckedRequest = actionHistory.slice(-4).some((action) => (
    action.kind === 'click' && action.selector === '[data-panel="requests"]'
  ));
  if (
    request.pending &&
    recentlyCheckedRequest &&
    !fulfillRequestAction &&
    !requestSeedAction &&
    !explicitPaintGuidanceVisible &&
    !hasExplicitSeedGuidance(observation.visibleText)
  ) {
    return {
      rationale: 'The pinned basket was just checked and is not ready, so let autonomous workers harvest before reopening panels.',
      action: { kind: 'wait', ms: defaultWaitMs },
      expectedResult: 'The watched interval should advance crops and workers without spending the action budget on panel thrashing.',
    };
  }
  if (!request.pending && urgentStorageGuidanceVisible && inventoryAction && !inventoryAction.state?.active) {
    return clickDecision(
      inventoryAction,
      'Storage is visibly full, so open Inventory before returning to late-game planning controls.',
    );
  }
  if (!request.pending && (urgentStorageGuidanceVisible || storageAtCapacity) && sellAllAction) {
    return clickDecision(
      sellAllAction,
      'Clear the visibly full storage bin so workers can resume harvesting before more crop-mix tuning.',
    );
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
  if (canvasAction && !draggedCanvas && !selectedPlotGuideVisible && /\bTOOL Plot\b|Paint plots on empty land/i.test(observation.visibleText)) {
    return dragDecision(canvasAction, 'Drag across visible farm tiles with the selected Plot tool so drag-painting is covered like a player action.', { x: 410, y: 290 }, { deltaX: 72, deltaY: 0 });
  }

  if (dismissTutorialAction && request.exercised && !dismissedTutorial) {
    return clickDecision(dismissTutorialAction, 'Dismiss a later Farm Guide once so the visual player covers the explicit tutorial-close control.');
  }
  const tutorialAction = selectedPlotFromShortcut && canvasClickedAfterPlotShortcut && selectedPlotGuideVisible ? null : tutorialActionFromText(observation);
  if (tutorialAction && !recentlyClicked(actionHistory, tutorialAction.selector)) return clickDecision(tutorialAction, `Follow the visible tutorial prompt: ${tutorialAction.label}.`);

  const carrotNumberAction = findAction(observation, '[data-mix-number="carrot"]');
  if (carrotNumberAction && !adjustedCarrotNumber && /Crop Mix|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(carrotNumberAction, 'Type a direct Carrot crop mix percentage so the visual loop covers its precise numerical control.', 60);
  }
  const carrotSliderAction = findAction(observation, '[data-mix="carrot"]');
  if (carrotSliderAction && !adjustedCarrotSlider && /Crop Mix|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(carrotSliderAction, 'Adjust the visible Carrot crop mix slider so its pointer-style control is covered alongside the number field.', 55);
  }
  const wheatSliderAction = findAction(observation, '[data-mix="wheat"]');
  if (wheatSliderAction && !adjustedWheatSlider && /Crop Mix|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(wheatSliderAction, 'Adjust the visible Wheat crop mix slider so both Tier 2 planning controls are exercised.', 40);
  }
  const wheatNumberAction = findAction(observation, '[data-mix-number="wheat"]');
  if (wheatNumberAction && !adjustedWheatNumber && /Crop Mix|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(wheatNumberAction, 'Type a direct Wheat crop mix percentage so the visual loop covers the same numerical control a player sees.', 40);
  }
  const tomatoNumberAction = findAction(observation, '[data-mix-number="tomato"]');
  if (tomatoNumberAction && !adjustedTomatoNumber && /Tomato|Tomatoes are unlocked|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(tomatoNumberAction, 'Type a direct Tomato crop mix percentage so the visual loop covers the newly unlocked crop control.', 25);
  }
  const tomatoSliderAction = findAction(observation, '[data-mix="tomato"]');
  if (tomatoSliderAction && !adjustedTomatoSlider && /Tomato|Tomatoes are unlocked|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(tomatoSliderAction, 'Adjust the visible Tomato crop mix slider after its number field so both input modes are covered.', 25);
  }
  const pumpkinNumberAction = findAction(observation, '[data-mix-number="pumpkin"]');
  if (pumpkinNumberAction && !adjustedPumpkinNumber && /Pumpkin|Pumpkins are unlocked|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(pumpkinNumberAction, 'Type a direct Pumpkin crop mix percentage so the visual loop audits the Tier 4 crop control.', 20);
  }
  const pumpkinSliderAction = findAction(observation, '[data-mix="pumpkin"]');
  if (pumpkinSliderAction && !adjustedPumpkinSlider && /Pumpkin|Pumpkins are unlocked|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(pumpkinSliderAction, 'Adjust the visible Pumpkin crop mix slider after its number field so both input modes are covered.', 20);
  }
  if (inventoryAction && !inventoryAction.state?.active && /Crop Mix/i.test(observation.visibleText) && /No seeds stocked/i.test(observation.visibleText) && !recentlyClicked(actionHistory, inventoryAction.selector)) {
    return clickDecision(inventoryAction, 'Crop Mix shows a crop with no seeds stocked, so open Inventory to restock visible seed rows.');
  }

  const wateringCanBought = clickedSelectors.has('[data-buy-upgrade="wateringCan"]');
  const upgradeAction = findUpgradeAction(observation, clickedSelectors);
  if (upgradeAction && /Tool Upgrades|Worker Boots|Watering Cans/i.test(observation.visibleText)) return clickDecision(upgradeAction, 'Buy the visible worker upgrade so the playtest exercises progression beyond selling and tier claims.');
  if (!request.pending && tierClaims >= 3 && goalsAction && !goalsAction.state?.active && !wateringCanBought && !checkedGoalsAfterLatestClaim) {
    return clickDecision(goalsAction, 'Return to Goals after reaching Tier 4 so the remaining Watering Cans upgrade is not hidden behind an earlier Goals visit.');
  }
  if (!request.pending && tierClaims >= 3 && mixAction && !mixAction.state?.active && (!adjustedPumpkinNumber || !adjustedPumpkinSlider)) {
    return clickDecision(mixAction, 'Open Crop Mix after reaching Tier 4 so Pumpkin receives a visible planting share before the run can stop.');
  }
  if (!request.pending && tierClaims >= 3 && adjustedPumpkinNumber && adjustedPumpkinSlider && !pumpkinSold && inventoryAction && !inventoryAction.state?.active) {
    return clickDecision(inventoryAction, 'Return to Inventory after setting Pumpkin mix so the first harvested Pumpkin can be sold through its visible control.');
  }
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
  const tomatoSellAction = findAction(observation, '[data-sell="tomato"]');
  if (!request.pending && tomatoSellAction && !tomatoSold && hasVisibleSellableCrops(observation.visibleText) && shouldSellVisibleCrops(observation.visibleText)) {
    return clickDecision(tomatoSellAction, 'Exercise the visible single-crop Tomato sell action before using the bulk sale control.');
  }
  const pumpkinSellAction = findAction(observation, '[data-sell="pumpkin"]');
  if (!request.pending && pumpkinSellAction && !pumpkinSold) {
    return clickDecision(pumpkinSellAction, 'Exercise the visible single-crop Pumpkin sell action before using the bulk sale control.');
  }
  const tomatoSeedAction = findAction(observation, '[data-buy-seeds="tomato"]');
  if (!request.pending && tierClaims >= 2 && tomatoSeedAction && !clickedSelectors.has(tomatoSeedAction.selector)) {
    return clickDecision(tomatoSeedAction, 'Buy one visible Tomato seed bundle after reaching Tier 3 so its Inventory control is exercised even while starter stock remains.');
  }
  const pumpkinSeedAction = findAction(observation, '[data-buy-seeds="pumpkin"]');
  if (!request.pending && tierClaims >= 3 && pumpkinSeedAction && !clickedSelectors.has(pumpkinSeedAction.selector)) {
    return clickDecision(pumpkinSeedAction, 'Buy one visible Pumpkin seed bundle after reaching Tier 4 so its late-game Inventory control is exercised even while starter stock remains.');
  }
  if (!request.pending && sellAllAction && hasVisibleSellableCrops(observation.visibleText) && shouldSellVisibleCrops(observation.visibleText)) {
    return clickDecision(sellAllAction, 'The visible inventory shows crops ready to sell, so sell them before waiting again.');
  }

  if (guidedPaintAction?.kind === 'select-plot') return clickDecision(guidedPaintAction.action, 'Reselect the Plot tool before following visible paint guidance.');
  if (guidedPaintAction?.kind === 'paint') return clickDecision(guidedPaintAction.action, 'Visible plot guidance is still active, so place another plot instead of ending the run.', nextPaintPosition(canvasClickCount));
  if (canvasAction && canvasClickCount < 2 && !selectedPlotGuideVisible && /\bTOOL Plot\b|Paint plots on empty land/i.test(observation.visibleText)) {
    return clickDecision(canvasAction, 'The selected plot tool needs a field click, so click an open farm tile visible on the canvas.', nextPaintPosition(canvasClickCount));
  }
  if (visibleZeroSeedAction && hasVisibleZeroSeedRestock(observation.visibleText)) return clickDecision(visibleZeroSeedAction, 'Visible Inventory seed rows show enabled zero-stock seed controls, so restock one before ending the run.');
  if (mixAction && !mixAction.state?.active && (terminalOpenEndedGuidanceVisible || /Tune mix/i.test(observation.visibleText)) && !openedMixAfterTomato) return clickDecision(mixAction, 'Open Crop Mix because the visible open-ended guidance asks the player to tune mix.');
  if (goalsAction && !goalsAction.state?.active && (terminalOpenEndedGuidanceVisible || /upgrade workers/i.test(observation.visibleText)) && !openedGoalsAfterTomato) return clickDecision(goalsAction, 'Open Goals because the visible open-ended guidance mentions worker upgrades.');
  if (landToolAction && !landToolAction.state?.active && (terminalOpenEndedGuidanceVisible || /expand land/i.test(observation.visibleText)) && !selectedLandAfterTomato) return clickDecision(landToolAction, 'Select the Land tool because the visible open-ended guidance asks the player to expand land.');
  if (goalsAction && !clickedSelectors.has(goalsAction.selector)) return clickDecision(goalsAction, 'Open the visible Goals panel because progression and tier rewards should be understandable there.');

  if (!request.pending && lastAction?.kind === 'wait' && tierClaims >= 3 && pumpkinSold && adjustedPumpkinNumber && adjustedPumpkinSlider && waitsAfterClaim >= 2 && !hasActionableGuidance(observation.visibleText)) {
    return { rationale: 'The loop reached Tier 4 and watched the Harvest Hearth farm for two intervals.', action: { kind: 'stop' }, expectedResult: 'End with a final screenshot for review.' };
  }
  return {
    rationale: request.pending
      ? 'A village basket is pinned, so keep its crops in storage and watch for the visible delivery action.'
      : 'No higher-priority visible action is available, so watch the autonomous farm loop for progress or stalls.',
    action: { kind: 'wait', ms: defaultWaitMs },
    expectedResult: 'The next screenshot should show workers, crops, storage, goals, requests, or guidance changing over real browser time.',
  };
}
