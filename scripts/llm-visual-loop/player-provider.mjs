import { spawn } from 'node:child_process';
import { chooseLocalHeuristicDecision } from './local-player.mjs';
import { findKeyboardControl } from './local-player-support.mjs';

export async function chooseVisualLoopAction({ observation, history, defaultWaitMs, providerCommand }) {
  if (providerCommand) {
    const decision = await chooseWithExternalProvider(providerCommand, { observation, history });
    return normalizeDecision(decision, observation, 'external-command', defaultWaitMs);
  }
  return normalizeDecision(
    chooseLocalHeuristicDecision({ observation, history, defaultWaitMs }),
    observation,
    'local-heuristic',
    defaultWaitMs,
  );
}

async function chooseWithExternalProvider(command, payload) {
  const result = await runJsonCommand(command, {
    schema: {
      rationale: 'short explanation',
      action: {
        kind: 'click | hover | drag | adjust | type | wheel | press | wait | viewport | stop',
        selector: 'required for click, hover, drag, adjust, type, and wheel; optional for press unless the listed keyboard control requires focus',
        x: 'optional x coordinate relative to the clicked or dragged element',
        y: 'optional y coordinate relative to the clicked or dragged element',
        deltaX: 'optional horizontal drag distance in pixels',
        deltaY: 'optional vertical drag or wheel distance in pixels',
        value: 'optional adjustment target from 0 to 100 for range or number controls',
        text: 'required bounded comment text for type actions on a listed textarea',
        key: 'required for press', durationMs: 'optional hold duration for press', ms: 'optional for wait',
        width: 'required for viewport', height: 'required for viewport',
      },
      expectedResult: 'short expectation',
    },
    ...payload,
  });
  return JSON.parse(result);
}

function runJsonCommand(command, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Provider command timed out after 30000ms')); }, 30000);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Provider command exited ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(`${JSON.stringify(payload, null, 2)}\n`);
  });
}

export function normalizeDecision(decision, observation, provider, defaultWaitMs) {
  const fallback = {
    rationale: `${provider} returned an unusable action, so the harness will wait and capture another player-visible frame.`,
    action: { kind: 'wait', ms: defaultWaitMs },
    expectedResult: 'Another screenshot should make the next decision easier.',
    provider,
  };
  if (!decision || typeof decision !== 'object') return fallback;
  const action = decision.action && typeof decision.action === 'object' ? decision.action : {};
  const kind = ['click', 'hover', 'drag', 'adjust', 'type', 'wheel', 'press', 'wait', 'viewport', 'stop'].includes(action.kind) ? action.kind : 'wait';
  const normalized = {
    rationale: String(decision.rationale || fallback.rationale), action: { kind },
    expectedResult: String(decision.expectedResult || fallback.expectedResult), provider,
  };
  if (['click', 'hover', 'drag', 'adjust', 'type', 'wheel'].includes(kind)) {
    const visibleAction = observation.availableActions.find((candidate) => candidate.selector === action.selector);
    if (!visibleAction) return fallback;
    if (!actionHintAllowsKind(visibleAction.actionHint, kind)) return fallback;
    normalized.action.selector = visibleAction.selector;
    normalized.action.label = visibleAction.label;
    if (kind === 'click' && Number.isFinite(Number(action.x)) && Number.isFinite(Number(action.y))) {
      normalized.action.x = boundedNumber(action.x, Math.round(visibleAction.bounds.width / 2), 0, visibleAction.bounds.width);
      normalized.action.y = boundedNumber(action.y, Math.round(visibleAction.bounds.height / 2), 0, visibleAction.bounds.height);
    } else if (kind === 'drag') {
      normalized.action.x = boundedNumber(action.x, Math.round(visibleAction.bounds.width / 2), 0, visibleAction.bounds.width);
      normalized.action.y = boundedNumber(action.y, Math.round(visibleAction.bounds.height / 2), 0, visibleAction.bounds.height);
      normalized.action.deltaX = boundedNumber(action.deltaX, -96, -360, 360);
      normalized.action.deltaY = boundedNumber(action.deltaY, 0, -220, 220);
    } else if (kind === 'adjust') {
      normalized.action.value = boundedNumber(action.value, 50, 0, 100);
    } else if (kind === 'type') {
      const maximum = boundedNumber(visibleAction.state?.maxLength, 500, 1, 2000);
      normalized.action.text = String(action.text ?? '').slice(0, maximum);
      if (!normalized.action.text.trim()) return fallback;
    } else if (kind === 'wheel') {
      normalized.action.deltaY = boundedNumber(action.deltaY, -320, -900, 900);
    }
  } else if (kind === 'press') {
    const visibleKeyboardAction = findKeyboardControl(observation, action.key, action.selector);
    if (!visibleKeyboardAction) return fallback;
    normalized.action.key = String(action.key || visibleKeyboardAction.key);
    normalized.action.label = visibleKeyboardAction.label;
    normalized.action.selector = visibleKeyboardAction.selector;
    normalized.action.requiresFocus = Boolean(visibleKeyboardAction.state?.requiresFocus);
    normalized.action.durationMs = visibleKeyboardAction.state?.canHold ? boundedNumber(action.durationMs, 0, 0, 1500) : 0;
  } else if (kind === 'wait') normalized.action.ms = boundedNumber(action.ms, defaultWaitMs, 100, 15000);
  else if (kind === 'viewport') {
    normalized.action.width = boundedNumber(action.width, 1280, 800, 1800);
    normalized.action.height = boundedNumber(action.height, 800, 600, 1100);
  }
  return normalized;
}

function actionHintAllowsKind(actionHint, kind) {
  if (actionHint === 'scroll') return kind === 'wheel';
  if (actionHint === 'click-or-drag-canvas-coordinate') return ['click', 'drag', 'wheel'].includes(kind);
  if (actionHint === 'drag-resize') return kind === 'drag';
  if (actionHint === 'adjust') return kind === 'adjust';
  if (actionHint === 'type-text') return kind === 'type';
  return ['click', 'hover'].includes(kind);
}

export async function executePlayerDecision(page, decision) {
  const startedAt = new Date().toISOString();
  try {
    if (decision.action.kind === 'click') {
      const clickOptions = { timeout: 5000 };
      if (Number.isFinite(decision.action.x) && Number.isFinite(decision.action.y)) clickOptions.position = { x: decision.action.x, y: decision.action.y };
      await page.locator(decision.action.selector).first().click(clickOptions);
    } else if (decision.action.kind === 'hover') await page.locator(decision.action.selector).first().hover({ timeout: 5000 });
    else if (decision.action.kind === 'drag') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Cannot drag ${decision.action.selector}; no visible bounds`);
      const startX = box.x + decision.action.x;
      const startY = box.y + decision.action.y;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      try {
        await page.mouse.move(startX + decision.action.deltaX, startY + decision.action.deltaY, { steps: 8 });
      } finally {
        await page.mouse.up();
      }
    } else if (decision.action.kind === 'adjust') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const isNumberInput = await locator.evaluate((element) => element instanceof HTMLInputElement && element.type === 'number');
      if (isNumberInput) {
        await locator.fill(String(decision.action.value));
        await locator.dispatchEvent('change');
        await locator.blur();
      }
      else {
        const box = await locator.boundingBox();
        if (!box) throw new Error(`Cannot adjust ${decision.action.selector}; no visible bounds`);
        await page.mouse.click(box.x + box.width * (decision.action.value / 100), box.y + box.height / 2);
      }
    } else if (decision.action.kind === 'type') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const isTextArea = await locator.evaluate((element) => element instanceof HTMLTextAreaElement);
      if (!isTextArea) throw new Error(`Cannot type into ${decision.action.selector}; it is not a visible textarea`);
      await locator.fill(decision.action.text);
    } else if (decision.action.kind === 'wheel') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Cannot wheel ${decision.action.selector}; no visible bounds`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, decision.action.deltaY);
    } else if (decision.action.kind === 'press') {
      if (decision.action.selector && decision.action.requiresFocus) await page.locator(decision.action.selector).first().focus();
      if (decision.action.durationMs > 0) {
        await page.keyboard.down(decision.action.key);
        await page.waitForTimeout(decision.action.durationMs);
        await page.keyboard.up(decision.action.key);
      } else await page.keyboard.press(decision.action.key);
    } else if (decision.action.kind === 'wait') await page.waitForTimeout(decision.action.ms);
    else if (decision.action.kind === 'viewport') await page.setViewportSize({ width: decision.action.width, height: decision.action.height });
    return { ok: true, startedAt, completedAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, startedAt, completedAt: new Date().toISOString(), error: error.message };
  }
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
