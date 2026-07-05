import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('LLM visual loop harness contract', () => {
  test('package exposes the step-by-step visual loop command', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

    expect(packageJson.scripts['playtest:llm:visual-loop']).toBe('node scripts/llm-visual-loop.mjs');
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

  test('visual action selectors preserve readable data attribute values', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('CSS.escape(dataAttribute.value)');
    expect(source).toContain('escapeAttributeValue(dataAttribute.value)');
  });

  test('visual loop has enough default budget to reach the first tier claim', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('boundedNumber(process.env.FARM_VISUAL_LOOP_STEPS, 16');
  });

  test('visual loop recognizes both seed guidance and buy-seed controls', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function findSeedAction');
    expect(source).toContain("findAction(observation, '[data-buy-seeds')");
  });

  test('visual loop follows the crop mix tutorial prompt', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('NEXT CLICK Tune Crop Mix');
    expect(source).toContain("findAction(observation, '[data-panel=\"mix\"]')");
  });

  test('visual loop tries a visible worker upgrade during the goals flow', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('function findUpgradeAction');
    expect(source).toContain("findAction(observation, '[data-buy-upgrade=\"boots\"]')");
  });

  test('visual loop does not persist external provider command strings', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('decisionProviderCommand');
  });

  test('visual loop can execute every visible action hint it offers to an LLM player', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('click, drag, adjust, press, wait, viewport, or stop');
    expect(source).toContain("kind: 'click | drag | adjust | press | wait | viewport | stop'");
    expect(source).toContain("['click', 'drag', 'adjust', 'press', 'wait', 'viewport', 'stop']");
    expect(source).toContain("decision.action.kind === 'drag'");
    expect(source).toContain("decision.action.kind === 'adjust'");
    expect(source).toContain('page.mouse.down()');
    expect(source).toContain('page.mouse.up()');
  });
});
