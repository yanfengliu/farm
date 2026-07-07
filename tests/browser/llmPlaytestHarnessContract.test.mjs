import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('LLM playtest harness player contract', () => {
  test('browser scenarios are driven through visible player controls', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).not.toContain('window.advanceTime');
    expect(source).not.toContain('window.__farmDebug.reset');
    expect(source).toContain('playerClick');
    expect(source).toContain('availableActions');
  });

  test('scripted playtest tours the complete visible player surface', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('runPlayerSurfaceTour');
    expect(source).toContain('playerCanvasClick');
    expect(source).toContain('playerCanvasDrag');
    expect(source).toContain('playerDragResize');
    expect(source).toContain('playerPress(');
    expect(source).toContain('playerPressSelector');
    expect(source).toContain('playerFillSelector');
    expect(source).toContain('playerHoldKey');
    expect(source).toContain('playerWheelCanvas');
    expect(source).toContain('playerReload');

    for (const selector of [
      '[data-panel="inventory"]',
      '[data-panel="goals"]',
      '[data-panel="mix"]',
      '[data-panel="inspect"]',
      '[data-tool="inspect"]',
      '[data-tool="plot"]',
      '[data-tool="well"]',
      '[data-tool="storage"]',
      '[data-tool="land"]',
      '[data-tool="bulldoze"]',
      'canvas',
      '[data-command="toggle-panel"]',
      '[data-panel-resizer]',
      '[data-command="undo"]',
      '[data-command="redo"]',
      '[data-command="pause"]',
      '[data-speed="1"]',
      '[data-speed="2"]',
      '[data-speed="4"]',
      '[data-mix="wheat"]',
      '[data-mix-number="wheat"]',
      '[data-command="sell-all"]',
      'ArrowRight',
      "playerPressSelector(page, '[data-panel-resizer]', 'End'",
      'Drag-paint visible farm tiles',
    ]) {
      expect(source).toContain(selector);
    }
    expect(source).toContain('Zoom the farm camera');
  });

  test('reload verification keeps autosave after the initial clean boot', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('farm-playtest-storage-cleared');
    expect(source).toContain('sessionStorage.getItem');
    expect(source).toContain('sessionStorage.setItem');
  });

  test('scenario action selectors preserve readable data attribute values', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).not.toContain('CSS.escape(dataAttribute.value)');
    expect(source).toContain('escapeAttributeValue(dataAttribute.value)');
  });

  test('scenario observations list every player-facing action surface', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('button, input[type="range"], input[type="number"], [role="button"], [role="separator"], [data-player-scroll], canvas');
    expect(source).toContain('actionHint: actionHintFor(element)');
    expect(source).toContain('state: controlStateFor(element)');
    expect(source).toContain("if (element.matches('canvas')) return 'click-or-drag-canvas-coordinate'");
    expect(source).toContain("if (element.matches('input[type=\"number\"]')) return 'adjust'");
    expect(source).toContain("if (element.matches('[data-player-scroll]')) return 'scroll'");
    expect(source).toContain('state.canScrollDown');
  });

  test('scenario observations expose directly loadable screenshot files and aligned DOM samples', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');
    const captureStart = source.indexOf('async function captureScenario');
    const captureEnd = source.indexOf('async function recordReplayBundle');
    const captureSource = source.slice(captureStart, captureEnd);
    const observationIndex = captureSource.indexOf('const scenario = await page.evaluate');
    const screenshotIndex = captureSource.indexOf('await page.screenshot');

    expect(source).toContain('const screenshotFile = path.join(screenshotDir, screenshotName)');
    expect(source).toContain('screenshotFile: absoluteScreenshotFile');
    expect(captureSource).toContain('requestAnimationFrame');
    expect(observationIndex).toBeGreaterThan(-1);
    expect(screenshotIndex).toBeGreaterThan(-1);
    expect(observationIndex).toBeLessThan(screenshotIndex);
    expect(captureSource).toContain('return scenario;');
  });

  test('scenario observations enumerate all reachable player actions without a fixed cap', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).not.toContain('.slice(0, 60)');
    expect(source).not.toContain('.slice(0, 40)');
    expect(source).not.toContain('scenario.observation.availableActions.slice');
    expect(source).toContain('isReachableToPlayer(element)');
    expect(source).toContain('elementFromPoint');
  });

  test('scripted tour captures the Inspect panel after selecting a visible tile', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');
    const inspectClick = source.indexOf('Inspect a visible farm tile through the canvas');
    const inspectCapture = source.indexOf("captureScenario(page, 'inspect-tile'");
    const returnToGoals = source.indexOf('Return to Goals panel after the surface tour');

    expect(inspectClick).toBeGreaterThan(-1);
    expect(inspectCapture).toBeGreaterThan(inspectClick);
    expect(returnToGoals).toBeGreaterThan(inspectCapture);
  });

  test('scripted tour scrolls panel content through the same wheel input a player uses', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('playerWheelSelector');
    expect(source).toContain('[data-player-scroll="side-panel"]');
    expect(source).toContain('Scroll the visible side panel content');
  });

  test('scripted seed guidance metric tracks neutral restock copy', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain("includes('Restock seeds')");
    expect(source).not.toContain("includes('Buy seeds')");
  });

  test('scripted scenario text observations come from viewport-visible text only', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).not.toContain('document.body.innerText');
    expect(source).toContain('visibleTextForPlayer()');
    expect(source).toContain('NodeFilter.SHOW_TEXT');
    expect(source).toContain('isRectVisibleToPlayer');
  });

  test('scripted observations enumerate keyboard-only camera controls', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('keyboardActions');
    expect(source).toContain('function playerKeyboardActions()');
    expect(source).toContain('Pan camera right');
    expect(source).toContain("key: 'ArrowRight'");
    expect(source).toContain("alternateKeys: ['D']");
  });

  test('scripted observations enumerate visible toolbar keyboard shortcuts', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('toolbarShortcutKeyboardActions');
    expect(source).toContain("document.querySelectorAll('.toolbar .tool-button')");
    expect(source).toContain('shortcutKeyboardLabelFor');
    expect(source).toContain('selector: playerSelectorFor(button)');
    expect(source).toContain("if (button.matches('[data-tool]')) return `Select ${label} tool`");
    expect(source).toContain("if (button.matches('[data-speed]')) return `Set ${label}`");
  });

  test('scripted observations enumerate focused control keyboard actions', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('focusedControlKeyboardActions');
    expect(source).toContain("document.querySelector('[data-panel-resizer]')");
    expect(source).toContain('input[type="range"], input[type="number"]');
    expect(source).toContain('Resize side panel wider');
    expect(source).toContain('Increase range value');
    expect(source).toContain('Increase number value');
    expect(source).toContain('requiresFocus: true');
  });
});
