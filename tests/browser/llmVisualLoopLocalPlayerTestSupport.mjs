import { chooseLocalHeuristicDecision } from '../../scripts/llm-visual-loop/local-player.mjs';

export function visibleAction(selector, label = selector, state = {}) {
  return { selector, label, state };
}

export function observation(visibleText, availableActions = []) {
  return { visibleText, availableActions, keyboardActions: [] };
}

export function history(...actions) {
  return actions.map((action) => ({ decision: { action } }));
}

export function decide(currentObservation, priorHistory = []) {
  return chooseLocalHeuristicDecision({
    observation: currentObservation,
    history: priorHistory,
    defaultWaitMs: 4000,
  });
}
