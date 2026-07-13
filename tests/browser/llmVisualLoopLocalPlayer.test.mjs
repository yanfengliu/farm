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

  test('abandons the first unready basket once to cover the no-penalty choice', () => {
    const decision = decide(
      observation(
        'Active basket Soup Pot 0/5 Carrot 0/2 Wheat Harvest the missing crops.',
        [visibleAction('[data-command="abandon-request"]', 'Abandon village request')],
      ),
      history({ kind: 'click', selector: '[data-accept-request="soup-pot"]' }),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-command="abandon-request"]' });
  });

  test('keeps the replacement basket after covering abandon once', () => {
    const decision = decide(
      observation(
        'Active basket Bakery Basket 0/4 Carrot Harvest the missing crops.',
        [visibleAction('[data-command="abandon-request"]', 'Abandon village request')],
      ),
      history(
        { kind: 'click', selector: '[data-accept-request="soup-pot"]' },
        { kind: 'click', selector: '[data-command="abandon-request"]' },
        { kind: 'click', selector: '[data-accept-request="bakery-basket"]' },
      ),
    );

    expect(decision.action.kind).toBe('wait');
  });

  test('does not pin a fourth basket after three deliveries', () => {
    const completedRequests = Array.from({ length: 3 }, (_, index) => [
      { kind: 'click', selector: `[data-accept-request="basket-${index}"]` },
      { kind: 'click', selector: '[data-command="fulfill-request"]' },
    ]).flat();
    const decision = decide(
      observation(
        'Village Lane Request Board Choose one neighbor basket.',
        [visibleAction('[data-accept-request="extra-basket"]', 'Accept Extra Basket')],
      ),
      history(...completedRequests),
    );

    expect(decision.action.kind).toBe('wait');
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

  test('opens Inventory when an active basket is stalled by visible seed guidance', () => {
    const decision = decide(
      observation(
        'Restock seeds to keep farmers planting. Active basket 0/6 Wheat Harvest the missing crops, then return here.',
        [visibleAction('[data-panel="inventory"]', 'Inventory', { active: false })],
      ),
      history(
        { kind: 'hover', selector: '[data-panel="inventory"]' },
        { kind: 'click', selector: '[data-accept-request="mill-morning"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-panel="inventory"]' });
  });

  test('sells only visible crop surplus when a full bin blocks an active basket', () => {
    const decision = decide(
      observation(
        'Coins 171 Storage 15/15 Inventory Carrot: 4 Wheat: 11 Tomato: 0 Pumpkin: 0',
        [
          visibleAction('[data-panel="requests"]', 'Village Requests', { active: false }),
          visibleAction('[data-sell="carrot"]', 'Sell 1 Carrot'),
          visibleAction('[data-sell="wheat"]', 'Sell 1 Wheat'),
          visibleAction('[data-command="sell-all"]', 'Sell all crops'),
        ],
      ),
      [{
        observation: { visibleText: 'Active basket Soup Pot 4/5 Carrot 2/2 Wheat Harvest the missing crops.' },
        decision: { action: { kind: 'click', selector: '[data-accept-request="soup-pot"]' } },
      }],
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-sell="wheat"]' });
  });

  test('stops pressure selling after two storage slots are free', () => {
    const decision = decide(
      observation(
        'Coins 171 Storage 13/15 Inventory Carrot: 4 Wheat: 9 Tomato: 0 Pumpkin: 0',
        [
          visibleAction('[data-panel="requests"]', 'Village Requests', { active: false }),
          visibleAction('[data-sell="carrot"]', 'Sell 1 Carrot'),
          visibleAction('[data-sell="wheat"]', 'Sell 1 Wheat'),
        ],
      ),
      [{
        observation: { visibleText: 'Active basket Soup Pot 4/5 Carrot 2/2 Wheat Harvest the missing crops.' },
        decision: { action: { kind: 'click', selector: '[data-accept-request="soup-pot"]' } },
      }],
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-panel="requests"]' });
  });

  test('prioritizes zero-stock seeds for the missing basket crop over the tier milestone crop', () => {
    const decision = decide(
      observation(
        'Restock seeds to keep farmers planting. Harvest 2/10 Tomato Inventory Carrot: 3 Wheat: 3 Tomato: 0 Carrot seeds: 0 Tomato seeds: 0',
        [
          visibleAction('[data-buy-seeds="carrot"]', 'Buy 5 Carrot seeds'),
          visibleAction('[data-buy-seeds="tomato"]', 'Buy 5 Tomato seeds'),
        ],
      ),
      [{
        observation: { visibleText: 'Active basket Creek Picnic 3/4 Carrot 3/3 Wheat Harvest the missing crops.' },
        decision: { action: { kind: 'click', selector: '[data-accept-request="creek-picnic"]' } },
      }],
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-buy-seeds="carrot"]' });
  });

  test('does not carry an abandoned basket seed deficit into later play', () => {
    const decision = decide(
      observation(
        'Restock seeds to keep farmers planting. Harvest 2/10 Tomato Inventory Carrot: 3 Wheat: 3 Tomato: 0 Carrot seeds: 0 Tomato seeds: 0',
        [
          visibleAction('[data-buy-seeds="carrot"]', 'Buy 5 Carrot seeds'),
          visibleAction('[data-buy-seeds="tomato"]', 'Buy 5 Tomato seeds'),
        ],
      ),
      [
        {
          observation: { visibleText: 'Active basket Creek Picnic 3/4 Carrot 3/3 Wheat Harvest the missing crops.' },
          decision: { action: { kind: 'click', selector: '[data-accept-request="creek-picnic"]' } },
        },
        { decision: { action: { kind: 'click', selector: '[data-command="abandon-request"]' } } },
      ],
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-buy-seeds="tomato"]' });
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
