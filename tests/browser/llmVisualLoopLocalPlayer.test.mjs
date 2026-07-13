import { describe, expect, test } from 'vitest';
import { chooseLocalHeuristicDecision } from '../../scripts/llm-visual-loop/local-player.mjs';
import { nextPaintPosition } from '../../scripts/llm-visual-loop/local-player-support.mjs';

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

  test('opens Inventory for visible seed guidance after the request curriculum is complete', () => {
    const completedRequests = Array.from({ length: 3 }, (_, index) => [
      { kind: 'click', selector: `[data-accept-request="basket-${index}"]` },
      { kind: 'click', selector: '[data-command="fulfill-request"]' },
    ]).flat();
    const decision = decide(
      observation(
        'Restock seeds to keep farmers planting. Village Lane Request Board.',
        [visibleAction('[data-panel="inventory"]', 'Inventory', { active: false })],
      ),
      history(...completedRequests),
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

  test('dismisses a blocking paint tutorial before clicking the canvas', () => {
    const decision = decide(observation(
      'FARM GUIDE Paint Empty Land Click an empty green tile.',
      [
        visibleAction('canvas', 'canvas', { active: false }),
        visibleAction('[data-command="dismiss-tutorial"]', 'Dismiss tip'),
      ],
    ));

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-command="dismiss-tutorial"]' });
  });

  test('exercises each unlocked single-crop sell before Sell All', () => {
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

    const tomatoDecision = decide(
      observation(
        'Inventory Coins 2 Storage 3/15 Carrot: 0 Wheat: 0 Tomato: 3 Sell All',
        [
          visibleAction('[data-sell="tomato"]', 'Sell 1 Tomato'),
          visibleAction('[data-command="sell-all"]', 'Sell All'),
        ],
      ),
      history(carrotDecision.action, wheatDecision.action),
    );
    expect(tomatoDecision.action).toMatchObject({ kind: 'click', selector: '[data-sell="tomato"]' });

    const pumpkinDecision = decide(
      observation(
        'Tier 4 Harvest Hearth Inventory Coins 200 Storage 3/15 Pumpkin: 3 Sell All',
        [
          visibleAction('[data-sell="pumpkin"]', 'Sell 1 Pumpkin'),
          visibleAction('[data-command="sell-all"]', 'Sell All'),
        ],
      ),
      history(carrotDecision.action, wheatDecision.action, tomatoDecision.action),
    );
    expect(pumpkinDecision.action).toMatchObject({ kind: 'click', selector: '[data-sell="pumpkin"]' });
  });

  test('buys Watering Cans after exercising Worker Boots once', () => {
    const decision = decide(
      observation(
        'Goals Tool Upgrades Worker Boots 1/3 Watering Cans 0/2',
        [
          visibleAction('[data-buy-upgrade="boots"]', 'Buy Worker Boots'),
          visibleAction('[data-buy-upgrade="wateringCan"]', 'Buy Watering Cans'),
        ],
      ),
      history({ kind: 'click', selector: '[data-buy-upgrade="boots"]' }),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-buy-upgrade="wateringCan"]' });
  });

  test('returns to Goals for Watering Cans after reaching Tier 4', () => {
    const decision = decide(
      observation(
        'Tier 4 Harvest Hearth Inventory Fill village baskets, tune the harvest, and keep expanding',
        [visibleAction('[data-panel="goals"]', 'Goals', { active: false })],
      ),
      history(
        { kind: 'click', selector: '[data-buy-upgrade="boots"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'adjust', selector: '[data-mix-number="tomato"]', value: 25 },
        { kind: 'click', selector: '[data-panel="goals"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-panel="goals"]' });
  });

  test('buys a Tier 4 pumpkin seed bundle even when starter stock remains', () => {
    const decision = decide(
      observation(
        'Tier 4 Harvest Hearth Inventory Pumpkin seeds: 4 +5 25c',
        [visibleAction('[data-buy-seeds="pumpkin"]', 'Buy 5 Pumpkin seeds')],
      ),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-buy-seeds="pumpkin"]' });
  });

  test('buys a Tier 3 tomato seed bundle even when starter stock remains', () => {
    const decision = decide(
      observation(
        'Tier 3 Tomato Rows Inventory Tomato seeds: 2 +5 15c',
        [visibleAction('[data-buy-seeds="tomato"]', 'Buy 5 Tomato seeds')],
      ),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-buy-seeds="tomato"]' });
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

  test('audits both Tier 2 crop-mix input modes before moving on', () => {
    const availableActions = [
      visibleAction('[data-mix="carrot"]', 'Set Carrot crop mix'),
      visibleAction('[data-mix-number="carrot"]', 'Set Carrot crop mix percentage'),
      visibleAction('[data-mix="wheat"]', 'Set Wheat crop mix'),
      visibleAction('[data-mix-number="wheat"]', 'Set Wheat crop mix percentage'),
    ];
    const visibleText = 'Tier 2 Wheat Rows Crop Mix 100% allocated across unlocked crops';
    const carrotNumber = decide(observation(visibleText, availableActions));
    expect(carrotNumber.action).toMatchObject({ kind: 'adjust', selector: '[data-mix-number="carrot"]' });
    const carrotSlider = decide(observation(visibleText, availableActions), history(carrotNumber.action));
    expect(carrotSlider.action).toMatchObject({ kind: 'adjust', selector: '[data-mix="carrot"]' });
    const wheatSlider = decide(observation(visibleText, availableActions), history(carrotNumber.action, carrotSlider.action));
    expect(wheatSlider.action).toMatchObject({ kind: 'adjust', selector: '[data-mix="wheat"]' });
    const wheatNumber = decide(observation(visibleText, availableActions), history(carrotNumber.action, carrotSlider.action, wheatSlider.action));
    expect(wheatNumber.action).toMatchObject({ kind: 'adjust', selector: '[data-mix-number="wheat"]' });
  });

  test('targets empty framed-farm rows when following plot guidance', () => {
    expect(nextPaintPosition(0)).toEqual({ x: 340, y: 340 });
    expect(nextPaintPosition(5)).toEqual({ x: 340, y: 390 });
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
        { kind: 'click', selector: '[data-sell="pumpkin"]' },
        { kind: 'wait', ms: 4000 },
        { kind: 'wait', ms: 4000 },
      ),
    );

    expect(decision.action.kind).toBe('stop');
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
