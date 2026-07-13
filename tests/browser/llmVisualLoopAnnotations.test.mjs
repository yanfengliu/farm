import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  farmDecisionToVisualAction,
  visualActionToFarmDecision,
} from '../../scripts/llm-visual-loop/action-adapter.mjs';
import { chooseLocalHeuristicDecision } from '../../scripts/llm-visual-loop/local-player.mjs';
import { normalizeDecision } from '../../scripts/llm-visual-loop/player-provider.mjs';

function action(selector, label, extras = {}) {
  return { selector, label, state: {}, ...extras };
}

function decide(visibleText, availableActions, priorActions = []) {
  return chooseLocalHeuristicDecision({
    observation: { visibleText, availableActions, keyboardActions: [] },
    history: priorActions.map((priorAction) => ({ decision: { action: priorAction } })),
    defaultWaitMs: 4000,
  });
}

describe('LLM visual-loop annotation controls', () => {
  test('enumerates visible comment textareas and offers bounded text entry', async () => {
    const [loopSource, observationSource, providerSource] = await Promise.all([
      readFile('scripts/llm-visual-loop.mjs', 'utf8'),
      readFile('scripts/llm-visual-loop/browser-observation.mjs', 'utf8'),
      readFile('scripts/llm-visual-loop/player-provider.mjs', 'utf8'),
    ]);

    expect(loopSource).toContain('textarea');
    expect(observationSource).toContain("return 'type-text'");
    expect(observationSource).toContain('state.maxLength');
    expect(providerSource).toContain("kind: 'click | hover | drag | adjust | type | wheel | press | wait | viewport | stop'");
    expect(providerSource).toContain("decision.action.kind === 'type'");
    expect(providerSource).toContain('await locator.fill(decision.action.text)');
  });

  test('round-trips freeform text without converting it to a numeric adjustment', () => {
    const decision = {
      rationale: 'Record the exact visual concern.',
      action: {
        kind: 'type',
        selector: '[data-annotation-draft]',
        label: 'What should I look at?',
        text: 'The duck overlaps this reed bed.',
      },
      expectedResult: 'The comment appears in the draft.',
    };

    expect(farmDecisionToVisualAction(decision)).toMatchObject({
      kind: 'type',
      target: '[data-annotation-draft]',
      text: 'The duck overlaps this reed bed.',
    });
    expect(visualActionToFarmDecision({
      kind: 'type',
      target: '[data-annotation-draft]',
      text: 'The duck overlaps this reed bed.',
    }, 4000)).toMatchObject({
      action: {
        kind: 'type',
        selector: '[data-annotation-draft]',
        text: 'The duck overlaps this reed bed.',
      },
    });
  });

  test('rejects action kinds that do not match the observed control contract', () => {
    const textarea = action('[data-annotation-draft]', 'What should I look at?', {
      actionHint: 'type-text',
      state: { maxLength: 12 },
      bounds: { x: 0, y: 0, width: 240, height: 90 },
    });
    const observation = { availableActions: [textarea], keyboardActions: [] };
    const decision = (kind, extras = {}) => normalizeDecision({
      rationale: 'Exercise the visible comment field.',
      action: { kind, selector: textarea.selector, ...extras },
      expectedResult: 'The field changes.',
    }, observation, 'test-provider', 4000);

    expect(decision('adjust', { value: 50 }).action).toEqual({ kind: 'wait', ms: 4000 });
    expect(decision('click').action).toEqual({ kind: 'wait', ms: 4000 });
    expect(decision('type', { text: '   ' }).action).toEqual({ kind: 'wait', ms: 4000 });
    expect(decision('type', { text: 'A deliberately long note' }).action).toMatchObject({
      kind: 'type',
      selector: textarea.selector,
      text: 'A deliberate',
    });
  });

  test('the deterministic player creates one complete debugging note through visible controls', () => {
    const toggle = action('[data-command="toggle-annotations"]', 'Farm Notes');
    const canvas = action('canvas', 'Farm canvas', { actionHint: 'click-or-drag-canvas-coordinate' });
    const textarea = action('[data-annotation-draft]', 'What should I look at?', {
      actionHint: 'type-text',
      tagName: 'textarea',
    });
    const save = action('[data-command="save-annotation"]', 'Pin note');
    const notesPanel = action('[data-panel="annotations"]', 'Farm Notes');
    const savedNote = action('[data-annotation-id="farm-note-1"]', 'Note 1: Wild Land / 8,3');

    const start = decide('Farm Notes 0', [toggle, canvas]);
    expect(start.action).toMatchObject({ kind: 'click', selector: toggle.selector });

    const capture = decide('Choose something in the farm', [toggle, canvas], [start.action]);
    expect(capture.action).toMatchObject({ kind: 'click', selector: 'canvas' });

    const type = decide('What should I look at?', [textarea, save], [start.action, capture.action]);
    expect(type.action).toMatchObject({ kind: 'type', selector: textarea.selector });
    expect(type.action.text).toMatch(/LLM playtest note/i);

    const pin = decide('What should I look at?', [textarea, save], [start.action, capture.action, type.action]);
    expect(pin.action).toMatchObject({ kind: 'click', selector: save.selector });

    const openList = decide('Farm Notes 1', [notesPanel, savedNote], [start.action, capture.action, type.action, pin.action]);
    expect(openList.action).toMatchObject({ kind: 'click', selector: notesPanel.selector });

    const view = decide('Farm Notes 1', [notesPanel, savedNote], [start.action, capture.action, type.action, pin.action, openList.action]);
    expect(view.action).toMatchObject({ kind: 'click', selector: savedNote.selector });
  });
});
