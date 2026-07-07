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

    expect(source).toContain('button, input[type="range"], input[type="number"], [role="button"], [role="separator"], canvas');
    expect(source).toContain('actionHint: actionHintFor(element)');
    expect(source).toContain('state: controlStateFor(element)');
    expect(source).toContain("if (element.matches('canvas')) return 'click-canvas-coordinate'");
    expect(source).toContain("if (element.matches('input[type=\"number\"]')) return 'adjust'");
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
});
