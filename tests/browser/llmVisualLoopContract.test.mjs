import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('LLM visual loop harness contract', () => {
  test('package exposes the step-by-step visual loop command', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

    expect(packageJson.scripts['playtest:llm:visual-loop']).toBe('node scripts/llm-visual-loop.mjs');
  });

  test('farm dev and playtest defaults avoid the AoE localhost port', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const scriptedPlaytest = await readFile('scripts/llm-playtest.mjs', 'utf8');
    const visualLoop = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(packageJson.scripts.dev).toContain('--port 5175');
    expect(packageJson.scripts.dev).toContain('--strictPort');
    expect(scriptedPlaytest).toContain('FARM_PLAYTEST_URL');
    expect(visualLoop).toContain('FARM_PLAYTEST_URL');
    expect(`${packageJson.scripts.dev}\n${scriptedPlaytest}\n${visualLoop}`).not.toContain('5173');
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

    expect(source).toContain('boundedNumber(process.env.FARM_VISUAL_LOOP_STEPS, 20');
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

  test('visual loop follows the crop mix tutorial prompt', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('NEXT CLICK Tune Crop Mix');
    expect(source).toContain('FARM GUIDE Tune Crop Mix');
    expect(source).toContain("findAction(observation, '[data-panel=\"mix\"]')");
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
  });

  test('visual loop does not persist external provider command strings', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).not.toContain('decisionProviderCommand');
  });

  test('visual loop can execute every visible action hint it offers to an LLM player', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain('click, drag, adjust, wheel, press, wait, viewport, or stop');
    expect(source).toContain("kind: 'click | drag | adjust | wheel | press | wait | viewport | stop'");
    expect(source).toContain("['click', 'drag', 'adjust', 'wheel', 'press', 'wait', 'viewport', 'stop']");
    expect(source).toContain("decision.action.kind === 'drag'");
    expect(source).toContain("decision.action.kind === 'adjust'");
    expect(source).toContain("decision.action.kind === 'wheel'");
    expect(source).toContain('page.mouse.down()');
    expect(source).toContain('page.mouse.up()');
    expect(source).toContain('page.mouse.wheel(0, decision.action.deltaY)');
    expect(source).toContain('durationMs');
    expect(source).toContain('Zoom the farm camera');
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
    expect(source).toContain("state.active = element.classList.contains('active')");
    expect(source).toContain('formatActionState(action.state)');
  });
});
