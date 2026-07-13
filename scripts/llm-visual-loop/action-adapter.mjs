export function toVisualPlaytestObservation(observation) {
  return {
    screenshot: {
      path: observation.screenshotFile,
      mime: 'image/png',
      width: observation.viewport?.width,
      height: observation.viewport?.height,
      alt: `${observation.label} screenshot`,
    },
    visibleText: observation.visibleText ? [observation.visibleText] : [],
    controls: [
      ...observation.availableActions.map((action) => ({
        id: action.selector,
        label: action.label || action.selector,
        target: action.selector,
        actionKinds: visualActionKindsFor(action),
        bounds: action.bounds,
        enabled: true,
        description: `${action.actionHint}${formatActionState(action.state)}`,
      })),
      ...(observation.keyboardActions ?? []).map((action) => ({
        id: `key:${action.key}:${action.selector ?? ''}`,
        label: action.label,
        target: action.selector ?? action.key,
        actionKinds: ['key'],
        enabled: true,
        description: formatKeyboardAction(action),
      })),
    ],
    state: [{
      label: 'Farm visual action packet',
      audience: 'reviewer',
      summary: `${observation.availableActions.length} visible controls, ${observation.keyboardActions?.length ?? 0} keyboard controls`,
      value: {
        availableActions: observation.availableActions,
        keyboardActions: observation.keyboardActions ?? [],
      },
    }],
    metadata: { index: observation.index, label: observation.label, screenshot: observation.screenshot },
  };
}

function visualActionKindsFor(action) {
  if (action.actionHint === 'scroll') return ['wheel'];
  if (action.actionHint === 'click-or-drag-canvas-coordinate') return ['click', 'drag', 'wheel'];
  if (action.actionHint === 'drag-resize') return ['drag', 'key'];
  if (action.type === 'number') return ['type', 'key'];
  if (action.type === 'range') return ['click', 'key'];
  return ['click', 'hover'];
}

export function farmDecisionToVisualAction(decision) {
  const action = decision.action;
  const common = { label: action.label, reason: decision.rationale, farmDecision: decision };
  if (action.kind === 'click') {
    return { kind: 'click', target: action.selector, point: Number.isFinite(action.x) && Number.isFinite(action.y) ? { x: action.x, y: action.y } : undefined, ...common };
  }
  if (action.kind === 'hover') return { kind: 'hover', target: action.selector, ...common };
  if (action.kind === 'drag') return { kind: 'drag', target: action.selector, from: { x: action.x, y: action.y }, to: { x: action.x + action.deltaX, y: action.y + action.deltaY }, ...common };
  if (action.kind === 'adjust') return { kind: 'type', target: action.selector, text: String(action.value), ...common };
  if (action.kind === 'wheel') return { kind: 'wheel', target: action.selector, deltaY: action.deltaY, ...common };
  if (action.kind === 'press') return { kind: 'key', key: action.key, target: action.selector, durationMs: action.durationMs, requiresFocus: action.requiresFocus, ...common };
  if (action.kind === 'wait') return { kind: 'wait', durationMs: action.ms, ...common };
  if (action.kind === 'viewport') return { kind: 'viewport', viewport: { width: action.width, height: action.height }, ...common };
  return { kind: 'stop', reason: decision.rationale, ...common };
}

export function visualActionToFarmDecision(action, defaultWaitMs) {
  if (action.farmDecision) return action.farmDecision;
  const target = action.target;
  const base = {
    rationale: action.reason || 'civ-engine visual action selected by the playtest agent.',
    expectedResult: 'The next screenshot should show the result of this player-facing action.',
  };
  if (action.kind === 'click') return { ...base, action: { kind: 'click', selector: target, label: action.label, ...(action.point ? { x: action.point.x, y: action.point.y } : {}) } };
  if (action.kind === 'hover') return { ...base, action: { kind: 'hover', selector: target, label: action.label } };
  if (action.kind === 'drag') return { ...base, action: { kind: 'drag', selector: target, label: action.label, x: action.from.x, y: action.from.y, deltaX: action.to.x - action.from.x, deltaY: action.to.y - action.from.y } };
  if (action.kind === 'type') return { ...base, action: { kind: 'adjust', selector: target, label: action.label, value: Number(action.text) } };
  if (action.kind === 'wheel') return { ...base, action: { kind: 'wheel', selector: target, label: action.label, deltaY: action.deltaY ?? 0 } };
  if (action.kind === 'key') return { ...base, action: { kind: 'press', key: action.key, selector: target, label: action.label, durationMs: action.durationMs ?? 0, requiresFocus: Boolean(action.requiresFocus) } };
  if (action.kind === 'wait') return { ...base, action: { kind: 'wait', ms: action.durationMs ?? defaultWaitMs } };
  if (action.kind === 'viewport') return { ...base, action: { kind: 'viewport', width: action.viewport.width, height: action.viewport.height } };
  return { ...base, action: { kind: 'stop' } };
}

export function farmExecutionResultToVisualActionResult(action, execution, decision) {
  return {
    ok: execution.ok,
    action,
    message: execution.ok ? decision.expectedResult : execution.error,
    ...(execution.error ? { error: { name: 'FarmPlayerActionError', message: execution.error, stack: null } } : {}),
  };
}

export function formatActionState(state) {
  return state ? ` | state ${JSON.stringify(state)}` : '';
}

export function formatKeyboardAction(action) {
  const alternates = action.alternateKeys?.length ? ` | alternate keys ${action.alternateKeys.join(', ')}` : '';
  const selector = action.selector ? ` | ${action.selector}` : '';
  return `${action.label} | ${action.key}${alternates}${selector} | ${action.actionHint}${formatActionState(action.state)}`;
}
