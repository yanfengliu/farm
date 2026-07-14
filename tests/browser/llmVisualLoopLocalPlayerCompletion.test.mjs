import { describe, expect, test } from 'vitest';
import { nextPaintPosition } from '../../scripts/llm-visual-loop/local-player-support.mjs';
import {
  decide,
  history,
  observation,
  visibleAction,
} from './llmVisualLoopLocalPlayerTestSupport.mjs';

describe('LLM visual-loop deterministic local player', () => {
  test('targets empty framed-farm rows when following plot guidance', () => {
    expect(nextPaintPosition(0)).toEqual({ x: 340, y: 340 });
    expect(nextPaintPosition(5)).toEqual({ x: 340, y: 390 });
  });

  test('never applies a delayed Undo after another gameplay command', () => {
    const decision = decide(
      observation(
        'Active basket Harvest the missing crops.',
        [visibleAction('[data-command="undo"]', 'Undo')],
      ),
      history(
        { kind: 'press', key: '1', selector: '[data-tool="plot"]' },
        { kind: 'click', selector: 'canvas' },
        { kind: 'click', selector: '[data-accept-request="soup-pot"]' },
      ),
    );

    expect(decision.action.kind).toBe('wait');
  });

  test('finishes Undo and Redo immediately before a tier claim can change history', () => {
    const controls = [
      visibleAction('[data-command="claim-tier"]', 'Claim tier'),
      visibleAction('[data-command="undo"]', 'Undo'),
      visibleAction('[data-command="redo"]', 'Redo'),
    ];
    const painted = history(
      { kind: 'press', key: '1', selector: '[data-tool="plot"]' },
      { kind: 'click', selector: 'canvas' },
    );

    const undo = decide(observation('Tier 2 ready', controls), painted);
    expect(undo.action).toMatchObject({ kind: 'click', selector: '[data-command="undo"]' });

    const redo = decide(observation('Tier 2 ready', controls), [
      ...painted,
      ...history(undo.action),
    ]);
    expect(redo.action).toMatchObject({ kind: 'click', selector: '[data-command="redo"]' });
  });

  test('only successful browser executions advance the local curriculum', () => {
    const failed = (action) => ({ decision: { action }, execution: { ok: false } });

    const afterFailedAccept = decide(
      observation('Pinned basket', [
        visibleAction('[data-command="abandon-request"]', 'Abandon request'),
      ]),
      [failed({ kind: 'click', selector: '[data-accept-request="soup-pot"]' })],
    );
    expect(afterFailedAccept.action.kind).toBe('wait');

    const afterFailedPaint = decide(
      observation('Plot selected', [visibleAction('[data-command="undo"]', 'Undo')]),
      [
        ...history({ kind: 'press', key: '1', selector: '[data-tool="plot"]' }),
        failed({ kind: 'click', selector: 'canvas' }),
      ],
    );
    expect(afterFailedPaint.action.kind).toBe('wait');

    const painted = history(
      { kind: 'press', key: '1', selector: '[data-tool="plot"]' },
      { kind: 'click', selector: 'canvas' },
    );
    const afterFailedUndo = decide(
      observation('Plot selected', [
        visibleAction('[data-command="undo"]', 'Undo'),
        visibleAction('[data-command="redo"]', 'Redo'),
      ]),
      [...painted, failed({ kind: 'click', selector: '[data-command="undo"]' })],
    );
    expect(afterFailedUndo.action).toMatchObject({
      kind: 'click',
      selector: '[data-command="undo"]',
    });
  });

  test('does not treat a watched Tier 2 farm as the end of progression', () => {
    const decision = decide(
      observation('Tier 2 Wheat Rows Harvest 16/20 wheat'),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'wait', ms: 4000 },
        { kind: 'wait', ms: 4000 },
      ),
    );

    expect(decision.action.kind).toBe('wait');
  });

  test('does not let the generic wait limit stop a Tier 3 farm', () => {
    const waits = Array.from({ length: 7 }, () => ({ kind: 'wait', ms: 4000 }));
    const decision = decide(
      observation('Tier 3 Tomato Rows Requests 3/3 Tomatoes 5/10'),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        ...waits,
      ),
    );

    expect(decision.action.kind).toBe('wait');
  });

  test('allows a watched Tier 4 farm to clean-stop', () => {
    const decision = decide(
      observation('Tier 4 Harvest Hearth Fill village baskets, tune the harvest, and keep expanding'),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'adjust', selector: '[data-mix-number="pumpkin"]', value: 20 },
        { kind: 'adjust', selector: '[data-mix="pumpkin"]', value: 20 },
        { kind: 'click', selector: '[data-sell="carrot"]' },
        { kind: 'click', selector: '[data-sell="wheat"]' },
        { kind: 'click', selector: '[data-sell="tomato"]' },
        { kind: 'click', selector: '[data-sell="pumpkin"]' },
        { kind: 'wait', ms: 4000 },
        { kind: 'wait', ms: 4000 },
      ),
    );

    expect(decision.action.kind).toBe('stop');
  });

  test('waits for a sell trigger, then sells Tomato before the Tier 4 clean stop', () => {
    const beforeTomato = history(
      { kind: 'click', selector: '[data-command="claim-tier"]' },
      { kind: 'click', selector: '[data-command="claim-tier"]' },
      { kind: 'click', selector: '[data-command="claim-tier"]' },
      { kind: 'adjust', selector: '[data-mix-number="pumpkin"]', value: 20 },
      { kind: 'adjust', selector: '[data-mix="pumpkin"]', value: 20 },
      { kind: 'click', selector: '[data-sell="carrot"]' },
      { kind: 'click', selector: '[data-sell="wheat"]' },
      { kind: 'click', selector: '[data-sell="pumpkin"]' },
      { kind: 'wait', ms: 4000 },
      { kind: 'wait', ms: 4000 },
    );
    const sellAction = visibleAction('[data-sell="tomato"]', 'Sell 1 Tomato');

    const lowPressureDecision = decide(
      observation(
        'Coins 251 Storage 6/15 Tier 4 Harvest Hearth Inventory Tomato: 1 Pumpkin: 0',
        [sellAction],
      ),
      beforeTomato,
    );
    expect(lowPressureDecision.action.kind).toBe('wait');

    const pressureDecision = decide(
      observation(
        'Coins 251 Storage 12/15 Tier 4 Harvest Hearth Inventory Tomato: 3 Pumpkin: 0',
        [sellAction],
      ),
      [...beforeTomato, ...history(lowPressureDecision.action)],
    );

    expect(pressureDecision.action).toMatchObject({ kind: 'click', selector: '[data-sell="tomato"]' });
  });

  test('does not clean-stop at Tier 4 before growing and selling a Pumpkin', () => {
    const decision = decide(
      observation('Tier 4 Harvest Hearth Fill village baskets, tune the harvest, and keep expanding'),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'adjust', selector: '[data-mix-number="pumpkin"]', value: 20 },
        { kind: 'wait', ms: 4000 },
        { kind: 'wait', ms: 4000 },
      ),
    );

    expect(decision.action.kind).toBe('wait');
  });

  test('counts terminal watches from the latest tier claim instead of earlier tiers', () => {
    const decision = decide(
      observation('Tier 4 Harvest Hearth Fill village baskets, tune the harvest, and keep expanding'),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'wait', ms: 4000 },
        { kind: 'wait', ms: 4000 },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'wait', ms: 4000 },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'wait', ms: 4000 },
      ),
    );

    expect(decision.action.kind).toBe('wait');
  });
});
