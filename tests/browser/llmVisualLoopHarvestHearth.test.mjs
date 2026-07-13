import { describe, expect, test } from 'vitest';
import { chooseLocalHeuristicDecision } from '../../scripts/llm-visual-loop/local-player.mjs';

function visibleAction(selector, label, state = {}) {
  return { selector, label, state };
}

function observation(visibleText, availableActions) {
  return { visibleText, availableActions, keyboardActions: [] };
}

function history(...actions) {
  return actions.map((action) => ({ decision: { action } }));
}

function decide(currentObservation, priorHistory) {
  return chooseLocalHeuristicDecision({
    observation: currentObservation,
    history: priorHistory,
    defaultWaitMs: 4000,
  });
}

describe('LLM visual-loop Harvest Hearth curriculum', () => {
  test('does not buy unrelated seeds because a locked future crop has zero stock', () => {
    const decision = decide(
      observation(
        'Tier 3 Tomato Rows Inventory Coins 200 Storage 0/15 Carrot seeds: 27 Wheat seeds: 3 Tomato seeds: 5 Pumpkin seeds: 0 Locked',
        [visibleAction('[data-buy-seeds="carrot"]', 'Buy 5 Carrot seeds')],
      ),
      history(),
    );

    expect(decision.action.kind).toBe('wait');
  });

  test('audits the Tomato slider after its numeric Crop Mix input', () => {
    const decision = decide(
      observation(
        'Tier 3 Tomato Rows Crop Mix 100% allocated across unlocked crops',
        [visibleAction('[data-mix="tomato"]', 'Set Tomato crop mix')],
      ),
      history({ kind: 'adjust', selector: '[data-mix-number="tomato"]', value: 25 }),
    );

    expect(decision.action).toMatchObject({ kind: 'adjust', selector: '[data-mix="tomato"]' });
  });

  test('opens Crop Mix after Tier 4 until the Pumpkin percentage is audited', () => {
    const decision = decide(
      observation(
        'Tier 4 Harvest Hearth Fill village baskets, tune the harvest, and keep expanding',
        [visibleAction('[data-panel="mix"]', 'Crop Mix', { active: false })],
      ),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-buy-upgrade="wateringCan"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-panel="mix"]' });
  });

  test('audits the Pumpkin slider after its numeric Crop Mix input', () => {
    const decision = decide(
      observation(
        'Tier 4 Harvest Hearth Crop Mix 100% allocated across unlocked crops',
        [visibleAction('[data-mix="pumpkin"]', 'Set Pumpkin crop mix')],
      ),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'adjust', selector: '[data-mix-number="pumpkin"]', value: 20 },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'adjust', selector: '[data-mix="pumpkin"]' });
  });

  test('returns to Inventory after setting Pumpkin mix until one Pumpkin is sold', () => {
    const decision = decide(
      observation(
        'Tier 4 Harvest Hearth Crop Mix Pumpkin 20%',
        [visibleAction('[data-panel="inventory"]', 'Inventory', { active: false })],
      ),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-buy-upgrade="wateringCan"]' },
        { kind: 'adjust', selector: '[data-mix-number="pumpkin"]', value: 20 },
        { kind: 'adjust', selector: '[data-mix="pumpkin"]', value: 20 },
        { kind: 'hover', selector: '[data-panel="inventory"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-panel="inventory"]' });
  });

  test('buys Watering Cans from Goals before returning to the Pumpkin inventory watch', () => {
    const decision = decide(
      observation(
        'Tier 4 Harvest Hearth Goals Tool Upgrades Watering Cans 0/2',
        [
          visibleAction('[data-panel="inventory"]', 'Inventory', { active: false }),
          visibleAction('[data-panel="goals"]', 'Goals', { active: true }),
          visibleAction('[data-buy-upgrade="wateringCan"]', 'Buy Watering Cans'),
        ],
      ),
      history(
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'click', selector: '[data-command="claim-tier"]' },
        { kind: 'adjust', selector: '[data-mix-number="pumpkin"]', value: 20 },
        { kind: 'hover', selector: '[data-panel="inventory"]' },
      ),
    );

    expect(decision.action).toMatchObject({ kind: 'click', selector: '[data-buy-upgrade="wateringCan"]' });
  });

  test('does not bounce back to Goals after an unaffordable Tier 4 upgrade was inspected', () => {
    const priorActions = [
      { kind: 'click', selector: '[data-command="claim-tier"]' },
      { kind: 'click', selector: '[data-command="claim-tier"]' },
      { kind: 'click', selector: '[data-panel="goals"]' },
      { kind: 'click', selector: '[data-command="claim-tier"]' },
      { kind: 'click', selector: '[data-panel="mix"]' },
      { kind: 'adjust', selector: '[data-mix-number="pumpkin"]', value: 20 },
      { kind: 'adjust', selector: '[data-mix="pumpkin"]', value: 20 },
      { kind: 'click', selector: '[data-sell="pumpkin"]' },
    ];
    const decision = decide(
      observation(
        'Tier 4 Harvest Hearth Crop Mix 100% allocated across unlocked crops',
        [visibleAction('[data-panel="goals"]', 'Goals', { active: false })],
      ),
      history(...priorActions),
    );

    expect(decision.action).toMatchObject({ kind: 'wait' });
  });
});
