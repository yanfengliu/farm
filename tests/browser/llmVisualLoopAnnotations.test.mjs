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

  test('the deterministic player creates and manages one debugging note through visible controls', () => {
    const toggle = action('[data-command="toggle-annotations"]', 'Farm Notes');
    const aimToggle = action('[data-command="start-annotation"]', 'Stop aiming');
    const canvas = action('canvas', 'Farm canvas', { actionHint: 'click-or-drag-canvas-coordinate' });
    const cancelDraft = action('[data-command="cancel-annotation"]', 'Cancel');
    const textarea = action('[data-annotation-draft]', 'What should I look at?', {
      actionHint: 'type-text',
      tagName: 'textarea',
    });
    const save = action('[data-command="save-annotation"]', 'Pin note');
    const notesPanel = action('[data-panel="annotations"]', 'Farm Notes');
    const viewNote = action('[data-command="view-annotation"]', 'View note 1');
    const annotationPin = action('[data-annotation-id="farm-note-1"]', 'Note 1: Wild Land / 8,3');
    const edit = action('[data-command="edit-annotation"]', 'Edit');
    const cancelEdit = action('[data-command="cancel-edit-annotation"]', 'Cancel edit');
    const editTextarea = action('[data-annotation-edit]', 'Edit note 1', {
      actionHint: 'type-text',
      tagName: 'textarea',
    });
    const saveEdit = action('[data-command="save-edit-annotation"]', 'Save');
    const copy = action('[data-command="copy-annotation"]', 'Copy');
    const exportOne = action('[data-command="export-annotation"]', 'Export');
    const copyAll = action('[data-command="copy-annotations"]', 'Copy all');
    const exportAll = action('[data-command="export-annotations"]', 'Export all');
    const deleteOne = action('[data-command="delete-annotation"]', 'Delete');
    const priorActions = [];
    const choose = (visibleText, availableActions) => {
      const decision = decide(visibleText, availableActions, priorActions);
      priorActions.push(decision.action);
      return decision;
    };

    const start = choose('Farm Notes 0', [toggle, canvas]);
    expect(start.action).toMatchObject({ kind: 'click', selector: toggle.selector });

    const stopAiming = choose('Choose something in the farm', [aimToggle, canvas]);
    expect(stopAiming.action).toMatchObject({ kind: 'click', selector: aimToggle.selector });

    const restartAiming = choose('Farm Notes 0', [aimToggle, canvas]);
    expect(restartAiming.action).toMatchObject({ kind: 'click', selector: aimToggle.selector });

    const capture = choose('Choose something in the farm', [aimToggle, canvas]);
    expect(capture.action).toMatchObject({ kind: 'click', selector: 'canvas' });

    const cancel = choose('What should I look at?', [textarea, cancelDraft, save]);
    expect(cancel.action).toMatchObject({ kind: 'click', selector: cancelDraft.selector });

    const recapture = choose('Choose something in the farm', [aimToggle, canvas]);
    expect(recapture.action).toMatchObject({ kind: 'click', selector: 'canvas' });

    const type = choose('What should I look at?', [textarea, cancelDraft, save]);
    expect(type.action).toMatchObject({ kind: 'type', selector: textarea.selector });
    expect(type.action.text).toMatch(/LLM playtest note/i);

    const pin = choose('What should I look at?', [textarea, cancelDraft, save]);
    expect(pin.action).toMatchObject({ kind: 'click', selector: save.selector });

    const openList = choose('Farm Notes 1', [notesPanel, viewNote]);
    expect(openList.action).toMatchObject({ kind: 'click', selector: notesPanel.selector });

    const view = choose('Farm Notes 1', [notesPanel, viewNote, edit, copy, exportOne, copyAll, exportAll, deleteOne]);
    expect(view.action).toMatchObject({ kind: 'click', selector: viewNote.selector });

    const viewPin = choose('Farm Notes 1', [annotationPin, edit, copy, exportOne, copyAll, exportAll, deleteOne]);
    expect(viewPin.action).toMatchObject({ kind: 'click', selector: annotationPin.selector });

    const beginEdit = choose('Farm Notes 1', [edit, copy, exportOne, copyAll, exportAll, deleteOne]);
    expect(beginEdit.action).toMatchObject({ kind: 'click', selector: edit.selector });
    const abandonEdit = choose('Edit note 1', [editTextarea, cancelEdit, saveEdit]);
    expect(abandonEdit.action).toMatchObject({ kind: 'click', selector: cancelEdit.selector });
    const restartEdit = choose('Farm Notes 1', [edit, copy, exportOne, copyAll, exportAll, deleteOne]);
    expect(restartEdit.action).toMatchObject({ kind: 'click', selector: edit.selector });
    const typeEdit = choose('Edit note 1', [editTextarea, cancelEdit, saveEdit]);
    expect(typeEdit.action).toMatchObject({ kind: 'type', selector: editTextarea.selector });
    const commitEdit = choose('Edit note 1', [editTextarea, cancelEdit, saveEdit]);
    expect(commitEdit.action).toMatchObject({ kind: 'click', selector: saveEdit.selector });

    expect(choose('Farm Notes 1', [edit, copy, exportOne, copyAll, exportAll, deleteOne]).action)
      .toMatchObject({ kind: 'click', selector: copy.selector });
    expect(choose('Farm Notes 1', [edit, copy, exportOne, copyAll, exportAll, deleteOne]).action)
      .toMatchObject({ kind: 'click', selector: copyAll.selector });
    expect(choose('Farm Notes 1', [edit, copy, exportOne, copyAll, exportAll, deleteOne]).action)
      .toMatchObject({ kind: 'click', selector: exportOne.selector });
    expect(choose('Farm Notes 1', [edit, copy, exportOne, copyAll, exportAll, deleteOne]).action)
      .toMatchObject({ kind: 'click', selector: exportAll.selector });
    expect(choose('Farm Notes 1', [edit, copy, exportOne, copyAll, exportAll, deleteOne]).action)
      .toMatchObject({ kind: 'click', selector: deleteOne.selector });
    expect(choose('Farm Notes 1 Confirm delete', [deleteOne]).action)
      .toMatchObject({ kind: 'click', selector: deleteOne.selector });
  });
});
