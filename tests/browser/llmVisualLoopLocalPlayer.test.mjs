import { describe, expect, test } from 'vitest';
import { chooseLocalHeuristicDecision } from '../../scripts/llm-visual-loop/local-player.mjs';

function visibleAction(selector, label = selector, state = {}) {
  return { selector, label, state };
}

function observation(visibleText, availableActions = []) {
  return { visibleText, availableActions, keyboardActions: [] };
}

function history(...actions) {
  return actions.map((action) => ({ decision: { action } }));
}

function decide(currentObservation, priorHistory = []) {
  return chooseLocalHeuristicDecision({
    observation: currentObservation,
    history: priorHistory,
    defaultWaitMs: 4000,
  });
}

describe('LLM visual-loop deterministic local player', () => {
  test('opens the Village Requests board from visible guidance', () => {
    const decision = decide(observation(
      'FARM GUIDE Meet The Village Do Open Village Requests on the right panel.',
      [visibleAction('[data-panel="requests"]', 'Village Requests')],
    ));

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-panel="requests"]' });
  });

  test('accepts a visible village request', () => {
    const decision = decide(observation(
      'FARM GUIDE Pin A Neighbor Basket Do Pin one basket from the board.',
      [visibleAction('[data-accept-request="pantry-carrots"]', 'Accept Pantry Carrots')],
    ));

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-accept-request="pantry-carrots"]' });
  });

  test('preserves sellable crops while a village basket is active', () => {
    const decision = decide(
      observation(
        'Inventory Coins 60 Storage 4/15 Carrot: 4 Sell All',
        [
          visibleAction('[data-sell="carrot"]', 'Sell 1 Carrot'),
          visibleAction('[data-command="sell-all"]', 'Sell All'),
        ],
      ),
      history({ kind: 'click', selector: '[data-accept-request="pantry-carrots"]' }),
    );

    expect(decision.action.kind).toBe('wait');
  });

  test('fulfills a ready active village basket', () => {
    const decision = decide(
      observation(
        'Active basket Basket ready - every crop is in storage.',
        [visibleAction('[data-command="fulfill-request"]', 'Fulfill village request')],
      ),
      history({ kind: 'click', selector: '[data-accept-request="pantry-carrots"]' }),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-command="fulfill-request"]' });
  });

  test('does not clean-stop while an accepted basket is still gathering crops', () => {
    const priorHistory = history(
      { kind: 'click', selector: '[data-accept-request="pantry-carrots"]' },
      ...Array.from({ length: 7 }, () => ({ kind: 'wait', ms: 4000 })),
    );

    const decision = decide(observation(
      'Active basket Harvest the missing crops, then return here.',
      [],
    ), priorHistory);

    expect(decision.action.kind).toBe('wait');
  });

  test('dismisses a later tutorial after proving the request flow', () => {
    const decision = decide(
      observation(
        'FARM GUIDE Tune Crop Mix',
        [visibleAction('[data-command="dismiss-tutorial"]', 'Dismiss tip')],
      ),
      history(
        { kind: 'click', selector: '[data-accept-request="pantry-carrots"]' },
        { kind: 'click', selector: '[data-command="fulfill-request"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-command="dismiss-tutorial"]' });
  });

  test('exercises carrot and wheat single-crop sells before Sell All', () => {
    const carrotDecision = decide(observation(
      'Inventory Coins 0 Storage 3/15 Carrot: 3 Wheat: 0 Sell All',
      [
        visibleAction('[data-sell="carrot"]', 'Sell 1 Carrot'),
        visibleAction('[data-command="sell-all"]', 'Sell All'),
      ],
    ));
    expect(carrotDecision.action).toMatchObject({ kind: 'click', selector: '[data-sell="carrot"]' });

    const wheatDecision = decide(
      observation(
        'Inventory Coins 1 Storage 3/15 Carrot: 0 Wheat: 3 Sell All',
        [
          visibleAction('[data-sell="wheat"]', 'Sell 1 Wheat'),
          visibleAction('[data-command="sell-all"]', 'Sell All'),
        ],
      ),
      history(carrotDecision.action),
    );
    expect(wheatDecision.action).toMatchObject({ kind: 'click', selector: '[data-sell="wheat"]' });
  });

  test('prioritizes a visible zero-stock pumpkin seed action', () => {
    const decision = decide(observation(
      'Inventory Restock seeds Pumpkin seeds: 0 +5 20c Tomato seeds: 0 +5 15c',
      [
        visibleAction('[data-buy-seeds="pumpkin"]', 'Buy 5 Pumpkin seeds'),
        visibleAction('[data-buy-seeds="tomato"]', 'Buy 5 Tomato seeds'),
      ],
    ));

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-buy-seeds="pumpkin"]' });
  });

  test('audits the Tier 4 pumpkin crop-mix number control', () => {
    const decision = decide(observation(
      'Crop Mix Pumpkins are unlocked allocated across unlocked crops',
      [visibleAction('[data-mix-number="pumpkin"]', 'Pumpkin percentage')],
    ));

    expect(decision.action).toMatchObject({ kind: 'adjust', selector: '[data-mix-number="pumpkin"]' });
  });
});
