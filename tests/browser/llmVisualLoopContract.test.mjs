import { describe, expect, test } from 'vitest';
import { readFile, readFileFromDisk, VISUAL_LOOP_MODULES } from './llmVisualLoopSource.mjs';

describe('LLM visual loop harness contract', () => {
  test('visual loop entry point and extracted driver modules stay reviewable', async () => {
    for (const modulePath of VISUAL_LOOP_MODULES) {
      const source = await readFileFromDisk(modulePath, 'utf8');
      expect(source.split(/\r?\n/).length, modulePath).toBeLessThanOrEqual(500);
    }
  });

  test('package exposes the step-by-step visual loop command', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

    expect(packageJson.scripts['playtest:llm:visual-loop']).toBe('node scripts/llm-visual-loop.mjs');
  });

  test('workflow lint includes the playtest scripts it executes', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

    expect(packageJson.scripts.lint).toContain('scripts');
  });

  test('farm dev and playtest defaults avoid the AoE localhost port', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const deprecatedPlaytest = await readFile('scripts/llm-playtest.mjs', 'utf8');
    const visualLoop = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(packageJson.scripts.dev).toContain('--port 5175');
    expect(packageJson.scripts.dev).toContain('--strictPort');
    expect(deprecatedPlaytest).toContain('FARM_PLAYTEST_URL');
    expect(visualLoop).toContain('FARM_PLAYTEST_URL');
    expect(`${packageJson.scripts.dev}\n${deprecatedPlaytest}\n${visualLoop}`).not.toContain('5173');
  });

  test('visual loop observes screenshots and executes only player-facing actions', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('window.advanceTime');
    expect(source).not.toContain('window.__farmDebug.reset');
    expect(source).not.toContain('submitFarmCommand');
    expect(source).toContain('captureVisualObservation');
    expect(source).toContain('chooseVisualLoopAction');
    expect(source).toContain('executePlayerDecision');
    expect(source).toContain('availableActions');
    expect(source).toContain('screenshot');
  });

  test('visual loop reuses civ-engine visual playtest runner contracts', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain("from 'civ-engine'");
    expect(source).toContain('runVisualPlaytestLoop');
    expect(source).toContain('buildVisualPlaytestPrompt');
    expect(source).toContain('const visualPlaytestHost');
    expect(source).toContain('const visualPlaytestAgent');
    expect(source).toContain('toVisualPlaytestObservation');
    expect(source).toContain('farmDecisionToVisualAction');
    expect(source).toContain('visualActionToFarmDecision');
    expect(source).toContain('visualLoopResult');
  });

  test('visual loop observations give LLM providers a directly loadable screenshot file', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('const screenshotFile = path.join(screenshotDir, screenshotName)');
    expect(source).toContain('screenshotFile: absoluteScreenshotFile');
    expect(source).toContain('screenshotFile, visibleText, availableActions, keyboardActions');
    expect(source).toContain('`Screenshot file to inspect: ${observation.screenshotFile}`');
  });

  test('visual loop samples DOM observation on a rendered frame before writing the screenshot', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');
    const captureStart = source.indexOf('async function captureVisualObservation');
    const captureEnd = source.indexOf('async function chooseVisualLoopAction');
    const captureSource = source.slice(captureStart, captureEnd);
    const observationIndex = captureSource.indexOf('const observation = await page.evaluate');
    const screenshotIndex = captureSource.indexOf('await page.screenshot');

    expect(captureSource).toContain('requestAnimationFrame');
    expect(observationIndex).toBeGreaterThan(-1);
    expect(screenshotIndex).toBeGreaterThan(-1);
    expect(observationIndex).toBeLessThan(screenshotIndex);
    expect(captureSource).toContain('return observation;');
  });

  test('visual action selectors preserve readable data attribute values', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('CSS.escape(dataAttribute.value)');
    expect(source).toContain('escapeAttributeValue(dataAttribute.value)');
  });

  test('visual loop has enough default budget to cover the surface audit and first tier path', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('boundedNumber(process.env.FARM_VISUAL_LOOP_STEPS, 80');
    expect(source).toContain('boundedNumber(process.env.FARM_VISUAL_LOOP_STEPS, 80, 1, 120)');
  });

  test('visual loop flags a capped run when the final screenshot still has actionable guidance', async () => {
    const source = [
      await readFile('scripts/llm-visual-loop.mjs', 'utf8'),
      await readFile('scripts/llm-visual-loop/improvement-report.mjs', 'utf8'),
    ].join('\n');

    expect(source).toContain('(run.steps?.length ?? 0) >= (run.summary?.maxSteps ?? Infinity)');
    expect(source).toContain('const finalHasActionableGuidance = hasActionableGuidance(finalVisibleText)');
    expect(source).toContain('visual-loop-ended-with-guidance');
  });

  test('visual loop flags any clean stop when the final screenshot still has actionable guidance', async () => {
    const source = [
      await readFile('scripts/llm-visual-loop.mjs', 'utf8'),
      await readFile('scripts/llm-visual-loop/improvement-report.mjs', 'utf8'),
    ].join('\n');

    expect(source).toContain("lastDecision?.action?.kind === 'stop'");
    expect(source).toContain('visual-loop-stopped-with-guidance');
    expect(source).toContain('Tune mix, expand land, upgrade workers');
  });

  test('visual loop reports civ-engine runner failures as findings', async () => {
    const source = [
      await readFile('scripts/llm-visual-loop.mjs', 'utf8'),
      await readFile('scripts/llm-visual-loop/improvement-report.mjs', 'utf8'),
    ].join('\n');

    expect(source).toContain('visual-loop-engine-stop');
    expect(source).toContain('civ-engine visual playtest runner stopped with');
    expect(source).toContain('run.summary?.visualLoop && !run.summary.visualLoop.ok');
  });

  test('visual loop storage setup tolerates restricted browser documents', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');
    const initScript = source.slice(
      source.indexOf('await context.addInitScript(() => {'),
      source.indexOf('  });', source.indexOf('await context.addInitScript(() => {')) + '  });'.length,
    );

    expect(initScript).toContain('try {');
    expect(initScript).toContain('catch');
    expect(initScript).toContain('Storage access can be denied');
  });

  test('visual loop recognizes both seed guidance and buy-seed controls', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function findSeedAction');
    expect(source).toContain("findAction(observation, '[data-buy-seeds')");
  });

  test('visual loop seed decisions ignore incidental Farm Guide why copy', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('/Buy seeds|Buy .* seeds|Farmers Waiting/i');
    expect(source).toContain('FARM GUIDE Buy Seeds');
    expect(source).toContain('Farmers Waiting');
  });

  test('visual loop restocks visible zero-seed inventory rows before stopping', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function hasVisibleZeroSeedRestock');
    expect(source).toContain('seedAction && hasVisibleZeroSeedRestock(observation.visibleText)');
    expect(source).toContain('Visible Inventory seed rows show zero stock, so buy seeds before ending the run.');
    expect(source).toContain('!shouldSellVisibleCrops(visibleText)');
  });

  test('visual loop prefers the active milestone crop when restocking visible inventory rows', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function findSeedActionForVisibleNeed(observation)');
    expect(source).toContain('visibleMilestoneCrop(observation.visibleText)');
    expect(source).toContain('findAction(observation, `[data-buy-seeds="${milestoneCrop}"]`)');
    expect(source).toContain('for (const zeroSeedCrop of visibleZeroSeedCropsByPriority(observation.visibleText))');
    expect(source).toContain('if (zeroSeedAction) return zeroSeedAction;');
    expect(source).toContain('const seedAction = findSeedActionForVisibleNeed(observation);');
  });

  test('visual loop follows goal-specific Farm Guide seed cards', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');
    const tutorialStart = source.indexOf('function tutorialActionFromText(observation)');
    const tutorialEnd = source.indexOf('function recentlyClicked', tutorialStart);
    const tutorialSource = source.slice(tutorialStart, tutorialEnd);

    expect(tutorialSource).toContain('FARM GUIDE Buy Seeds');
    expect(tutorialSource).toContain('return findSeedActionForVisibleNeed(observation);');
    expect(tutorialSource).not.toContain('return findSeedAction(observation);');
  });

  test('visual loop follows the crop mix tutorial prompt', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('NEXT CLICK Tune Crop Mix');
    expect(source).toContain('FARM GUIDE Tune Crop Mix');
    expect(source).toContain('FARM GUIDE Add (?:Tomatoes|Pumpkins) To Mix');
    expect(source).toContain("findAction(observation, '[data-panel=\"mix\"]')");
  });

  test('visual loop adjusts the tomato numeric crop mix once tomatoes unlock', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain("findAction(observation, '[data-mix-number=\"tomato\"]')");
    expect(source).toContain("action.selector === '[data-mix-number=\"tomato\"]'");
    expect(source).toContain('Type a direct Tomato crop mix percentage');
  });

  test('visual loop opens Inventory when Crop Mix shows missing seed stock', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('No seeds stocked');
    expect(source).toContain('Crop Mix shows a crop with no seeds stocked');
    expect(source).toContain("findAction(observation, '[data-panel=\"inventory\"]')");
  });

  test('visual loop reopens Goals when visible HUD copy says a tier is ready', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function visibleTierReady(visibleText)');
    expect(source).toContain('goalsAction && !goalsAction.state?.active && visibleTierReady(observation.visibleText)');
    expect(source).toContain('A visible tier-ready prompt points back to Goals');
  });

  test('visual loop reads stabilized Farm Guide prompts without treating them as HUD tool state', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('FARM GUIDE Select Plot');
    expect(source).toContain('FARM GUIDE Open Goals');
    expect(source).toContain('/\\bTOOL Plot\\b|Paint plots on empty land/i');
  });

  test('visual loop tries a visible worker upgrade during the goals flow', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function findUpgradeAction');
    expect(source).toContain("findAction(observation, '[data-buy-upgrade=\"boots\"]')");
    expect(source).toContain("findAction(observation, '[data-buy-upgrade=\"wateringCan\"]')");
    expect(source).toContain("action.selector?.startsWith('[data-buy-upgrade=')");
    expect(source).not.toContain('!clickedSelectors.has(upgradeAction.selector)');
  });

  test('visual loop does not persist external provider command strings', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('decisionProviderCommand');
  });

  test('visual loop can execute every visible action hint it offers to an LLM player', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('click, hover, drag, adjust, wheel, press, wait, viewport, or stop');
    expect(source).toContain("kind: 'click | hover | drag | adjust | wheel | press | wait | viewport | stop'");
    expect(source).toContain("['click', 'hover', 'drag', 'adjust', 'wheel', 'press', 'wait', 'viewport', 'stop']");
    expect(source).toContain("decision.action.kind === 'drag'");
    expect(source).toContain("decision.action.kind === 'hover'");
    expect(source).toContain("decision.action.kind === 'adjust'");
    expect(source).toContain("decision.action.kind === 'wheel'");
    expect(source).toContain('await page.locator(decision.action.selector).first().hover');
    expect(source).toContain('page.mouse.down()');
    expect(source).toContain('page.mouse.up()');
    expect(source).toContain('page.mouse.wheel(0, decision.action.deltaY)');
    expect(source).toContain('durationMs');
    expect(source).toContain('Zoom the farm camera');
  });

  test('visual loop advertises and can execute canvas drag painting', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain("if (element.matches('canvas')) return 'click-or-drag-canvas-coordinate'");
    expect(source).toContain('dragDecision(canvasAction');
    expect(source).toContain('draggedCanvas');
    expect(source).toContain('decision.action.x');
    expect(source).toContain('decision.action.y');
    expect(source).toContain('startX = box.x + decision.action.x');
    expect(source).toContain('startY = box.y + decision.action.y');
  });

  test('visual loop can observe and fill crop mix number inputs', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('input[type="number"]');
    expect(source).toContain('[data-mix-number="wheat"]');
    expect(source).toContain('locator.fill(String(decision.action.value))');
  });

  test('visual observations include player-visible control state', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('state: controlStateFor(element)');
    expect(source).toContain('function controlStateFor(element)');
    expect(source).toContain('state.value = element.value');
    expect(source).toContain("const state = { active: element.classList.contains('active') }");
    expect(source).toContain('formatActionState(action.state)');
  });

  test('visual observations enumerate all reachable player actions without a fixed cap', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('.slice(0, 60)');
    expect(source).not.toContain('.slice(0, 40)');
    expect(source).not.toContain('step.observation.availableActions.slice');
    expect(source).toContain('isReachableToPlayer(element)');
    expect(source).toContain('elementFromPoint');
  });

  test('visual observations describe only text visible to the player', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('document.body.innerText');
    expect(source).toContain('visibleTextForPlayer()');
    expect(source).toContain('NodeFilter.SHOW_TEXT');
    expect(source).toContain('isRectVisibleToPlayer');
  });

  test('visual observations do not cap player-visible text before sending it to the LLM', async () => {
    const visualLoopSource = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(visualLoopSource).not.toContain('while (fragments.length < 180)');
    expect(visualLoopSource).not.toContain('return compactText(fragments.join');
    expect(visualLoopSource).toContain('return normalizeVisibleText(fragments.join');
  });

  test('visual loop exposes scrollable side-panel content as a wheel target', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('[data-player-scroll]');
    expect(source).toContain("if (element.matches('[data-player-scroll]')) return 'scroll'");
    expect(source).toContain('state.canScrollDown');
    expect(source).toContain('Scroll the side panel');
  });

  test('visual loop does not count panel wheel scrolling as camera zoom coverage', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain("zoomedCamera: actionHistory.some((action) => action.kind === 'wheel' && action.selector === 'canvas')");
  });

  test('visual loop observations enumerate keyboard-only camera controls', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('keyboardActions');
    expect(source).toContain('function playerKeyboardActions()');
    expect(source).toContain('Pan camera right');
    expect(source).toContain("key: 'ArrowRight'");
    expect(source).toContain("alternateKeys: ['D']");
    expect(source).toContain('Recenter camera');
    expect(source).toContain("key: 'Home'");
  });

  test('visual loop observations enumerate visible toolbar keyboard shortcuts', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('toolbarShortcutKeyboardActions');
    expect(source).toContain("document.querySelectorAll('.toolbar .tool-button')");
    expect(source).toContain('shortcutKeyboardLabelFor');
    expect(source).toContain('selector: playerSelectorFor(button)');
    expect(source).toContain("if (button.matches('[data-tool]')) return `Select ${label} tool`");
    expect(source).toContain("if (button.matches('[data-speed]')) return `Set ${label}`");
  });

  test('visual loop can choose visible toolbar shortcuts as press actions', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('findKeyboardAction(observation,');
    expect(source).toContain("findKeyboardAction(observation, '1')");
    expect(source).toContain("pressDecision('1'");
  });

  test('visual loop limits press decisions to listed player keyboard controls', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function findKeyboardControl(observation, key, selector)');
    expect(source).toContain('const visibleKeyboardAction = findKeyboardControl(observation, action.key, action.selector)');
    expect(source).toContain('if (!visibleKeyboardAction) return fallback');
    expect(source).toContain('normalized.action.selector = visibleKeyboardAction.selector');
  });

  test('visual loop exposes selector-focused keyboard controls', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('focusedControlKeyboardActions');
    expect(source).toContain("document.querySelector('[data-panel-resizer]')");
    expect(source).toContain('input[type="range"], input[type="number"]');
    expect(source).toContain('Resize side panel wider');
    expect(source).toContain('Increase range value');
    expect(source).toContain('Increase number value');
    expect(source).toContain('requiresFocus: true');
    expect(source).toContain('await page.locator(decision.action.selector).first().focus()');
  });

  test('visual loop local heuristic exercises a focused resize keyboard action', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('resizedPanelWithKeyboard');
    expect(source).toContain("findKeyboardControl(observation, 'ArrowLeft', '[data-panel-resizer]')");
    expect(source).toContain('Focus the visible side-panel resize handle');
    expect(source).toContain('selector: keyboardAction.selector');
  });

  test('visual loop local heuristic exercises the retired scripted surface tour controls', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('draggedPanelWithMouse');
    expect(source).toContain('Drag the visible side-panel resize handle');
    expect(source).toContain('collapsedPanel');
    expect(source).toContain('pausedWithButton');
    expect(source).toContain('Cycle through 1x speed');
    expect(source).toContain('Cycle through 2x speed');
    expect(source).toContain('openedInspectPanel');
    expect(source).toContain('Inspect a visible farm tile through the canvas');
    expect(source).toContain('Select the visible Well tool');
    expect(source).toContain('Select the visible Storage tool');
    expect(source).toContain('Select the visible Land tool');
    expect(source).toContain('Select the visible Bulldoze tool');
    expect(source).toContain('Click Undo after a visible plot placement');
    expect(source).toContain('Click Redo after undoing the visible plot placement');
    expect(source).toContain('Resize to a compact desktop viewport');
    expect(source).toContain('terminalOpenEndedGuidanceVisible');
    expect(source).toContain('openedMixAfterTomato');
    expect(source).toContain('openedGoalsAfterTomato');
    expect(source).toContain('selectedLandAfterTomato');
  });

  test('visual loop local heuristic hovers an icon-only panel tab', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('hoveredPanelTab');
    expect(source).toContain('hoverDecision(');
    expect(source).toContain('Hover the icon-only Inventory panel tab');
  });

  test('visual loop treats a pressed Plot shortcut as satisfying the Select Plot guide', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('selectedPlotFromShortcut');
    expect(source).toContain('canvasClickedAfterPlotShortcut');
    expect(source).toContain('The Plot shortcut already selected the tool');
    expect(source).toContain('FARM GUIDE Select Plot');
    expect(source).toContain('TOOL Plot');
  });

  test('visual loop plot clicks target visible open owned land bands', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('{ x: 276, y: 230 }');
    expect(source).toContain('{ x: 476, y: 430 }');
    expect(source).toContain('nextPaintPosition(canvasClickCount)');
  });

  test('visual loop reselects Plot before following visible paint guidance', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain("const plotToolAction = findAction(observation, '[data-tool=\"plot\"]')");
    expect(source).toContain('selectGuidedPaintAction({');
    expect(source).toContain('Reselect the Plot tool before following visible paint guidance');
  });

  test('visual loop keeps playing while actionable guidance remains after a tier claim', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function hasActionableGuidance');
    expect(source).toContain('claimedTier && waitsAfterClaim >= 2 && !hasActionableGuidance(observation.visibleText)');
    expect(source).toContain('waitCount >= 7 && !hasActionableGuidance(observation.visibleText)');
    expect(source).toContain('FARM GUIDE Paint Empty Land');
  });

  test('visual loop does not endlessly sell trivial late-game inventory at the step cap', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function shouldSellVisibleCrops');
    expect(source).toContain('openEndedTier');
    expect(source).toContain('storagePressure');
    expect(source).toContain('coins < 50');
  });

  test('visual loop waits after recent player actions before stopping', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('const lastAction = actionHistory.at(-1);');
    expect(source).toContain("lastAction?.kind === 'wait' && claimedTier && waitsAfterClaim >= 2");
    expect(source).toContain("lastAction?.kind === 'wait' && waitCount >= 7");
  });

  test('visual loop replay viewer keeps screenshots in the viewport while metadata scrolls', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('height: 100vh;');
    expect(source).toContain('overflow: hidden;');
    expect(source).toContain('main {');
    expect(source).toContain('min-height: 0;');
    expect(source).toContain('aside {');
    expect(source).toContain('overflow: auto;');
  });
});
