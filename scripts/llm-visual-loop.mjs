import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildVisualPlaytestPrompt,
  runVisualPlaytestLoop,
} from 'civ-engine';
import {
  hasVisibleSellableCrops,
  visibleSeedStock,
} from './llm-visual-loop/visible-state.mjs';
import {
  compareVisualLoopRuns,
  createImprovementRunManifest,
  evaluateVisualLoop,
  loadPreviousRunSummary,
  renderImprovementFindingsMarkdown,
  visualFindingsFromImprovementFindings,
} from './llm-visual-loop/improvement-report.mjs';

const cwd = process.cwd();
const outputDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop');
const screenshotDir = path.join(outputDir, 'steps');
const preferredFarmUrl = 'http://127.0.0.1:5175/';
const configuredPlaytestUrl = process.env.FARM_PLAYTEST_URL?.trim() ?? '';
const PLAYER_ACTION_SELECTOR = 'button, input[type="range"], input[type="number"], [role="button"], [role="separator"], [data-player-scroll], canvas';
const maxSteps = boundedNumber(process.env.FARM_VISUAL_LOOP_STEPS, 64, 1, 120);
const defaultWaitMs = boundedNumber(process.env.FARM_VISUAL_LOOP_WAIT_MS, 4000, 250, 15000);
const settleMs = boundedNumber(process.env.FARM_VISUAL_LOOP_SETTLE_MS, 350, 0, 3000);
const providerCommand = process.env.FARM_LLM_VISUAL_LOOP_COMMAND?.trim() ?? '';
const latestRunPath = path.join(outputDir, 'latest.json');
const previousRunSummary = await loadPreviousRunSummary(latestRunPath);

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(screenshotDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
let server;
let browser;

try {
  if (!configuredPlaytestUrl) {
    server = await createServer({
      root: cwd,
      configFile: false,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 5175, strictPort: false },
    });
    await server.listen();
  }
  const url = configuredPlaytestUrl || server?.resolvedUrls?.local?.[0] || preferredFarmUrl;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // Storage access can be denied for restricted pre-navigation documents; this reruns on the game origin.
    }
  });
  const page = await context.newPage();

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.toolbar .tool-button');
  await page.waitForSelector('canvas');

  const run = {
    generatedAt: new Date().toISOString(),
    url,
    mode: 'step-by-step-visual-loop',
    decisionProvider: providerCommand ? 'external-command' : 'local-heuristic',
    actionBoundary: 'Each decision receives screenshot path, visible text, visible controls, and keyboard controls; execution is limited to click, hover, drag, adjust, wheel, listed-keyboard press, wait, viewport, or stop.',
    summary: {
      consoleErrors,
      pageErrors,
      maxSteps,
      defaultWaitMs,
      visualLoop: null,
    },
    steps: [],
    finalObservation: null,
    findings: [],
  };

  const observationsByStep = new Map();
  const visualPlaytestHost = {
    async observe({ step }) {
      const observation = await captureVisualObservation(page, step, `step-${step}`);
      observationsByStep.set(step, observation);
      return toVisualPlaytestObservation(observation);
    },
    async performAction(action, context) {
      const observation = observationsByStep.get(context.step);
      const decision = visualActionToFarmDecision(action);
      const execution = await executePlayerDecision(page, decision);
      run.steps.push({
        index: context.step,
        observation,
        decision,
        engineAction: action,
        execution,
      });
      if (execution.ok && settleMs > 0) await page.waitForTimeout(settleMs);
      return farmExecutionResultToVisualActionResult(action, execution, decision);
    },
  };

  const visualPlaytestAgent = {
    async decide(input) {
      const observation = observationsByStep.get(input.step);
      const prompt = buildVisualPlaytestPrompt({
        objective: 'Play Farm like a real desktop player and find player-facing pain points.',
        observation: input.observation,
        mode: input.mode,
        maxActions: 1,
      });
      const decision = await chooseVisualLoopAction({
        observation: {
          ...observation,
          prompt: `${prompt}\n\nFarm action schema and full visible action packet:\n\n${observation.prompt}`,
        },
        history: run.steps,
        defaultWaitMs,
        providerCommand,
      });
      const action = farmDecisionToVisualAction(decision);
      if (decision.action.kind === 'stop') {
        run.steps.push({
          index: input.step,
          observation,
          decision,
          engineAction: action,
          execution: {
            ok: true,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        });
      }
      return {
        rationale: decision.rationale,
        action,
        stopReason: decision.action.kind === 'stop' ? decision.rationale : undefined,
      };
    },
  };

  const visualLoopResult = await runVisualPlaytestLoop({
    host: visualPlaytestHost,
    agent: visualPlaytestAgent,
    maxSteps,
    promptMode: 'playerBlind',
  });
  run.summary.visualLoop = {
    ok: visualLoopResult.ok,
    stopReason: visualLoopResult.stopReason,
    stepsRun: visualLoopResult.stepsRun,
    traceEntries: visualLoopResult.trace.length,
    engineFindings: visualLoopResult.findings.length,
    error: visualLoopResult.error,
  };
  run.engineFindings = visualLoopResult.findings;

  run.finalObservation = await captureVisualObservation(page, run.steps.length, 'final');
  run.completedAt = new Date().toISOString();
  run.improvementRun = createImprovementRunManifest(run);
  run.findings = evaluateVisualLoop(run);
  run.visualFindings = visualFindingsFromImprovementFindings(run.findings);
  run.comparison = compareVisualLoopRuns(previousRunSummary, run);
  const report = renderVisualLoopMarkdown(run);

  await fs.writeFile(latestRunPath, `${JSON.stringify(run, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), report);
  await fs.writeFile(path.join(outputDir, 'latest.html'), renderVisualLoopHtml(run));

  console.log(JSON.stringify({
    report: path.relative(cwd, path.join(outputDir, 'latest.md')),
    data: path.relative(cwd, path.join(outputDir, 'latest.json')),
    replayViewer: path.relative(cwd, path.join(outputDir, 'latest.html')),
    screenshots: path.relative(cwd, screenshotDir),
    steps: run.steps.length,
    findings: run.findings.map((finding) => ({ id: finding.id, severity: finding.severity, title: finding.title })),
  }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

async function captureVisualObservation(page, stepIndex, label) {
  const screenshotName = `${String(stepIndex).padStart(2, '0')}-${label}.png`;
  const screenshotFile = path.join(screenshotDir, screenshotName);
  const absoluteScreenshotFile = path.resolve(screenshotFile);
  const screenshotPath = path.join('steps', screenshotName).replaceAll('\\', '/');

  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  const observation = await page.evaluate(({ observationIndex, observationLabel, screenshotPath, screenshotFile, playerActionSelector }) => {
    const visibleText = visibleTextForPlayer();
    const availableActions = Array.from(document.querySelectorAll(playerActionSelector))
      .filter((element) => isVisible(element) && isReachableToPlayer(element) && !element.disabled)
      .map((element) => ({
        label: actionLabelFor(element),
        selector: playerSelectorFor(element),
        tagName: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || undefined,
        role: element.getAttribute('role') || undefined,
        actionHint: actionHintFor(element),
        state: controlStateFor(element),
        bounds: roundedBounds(element.getBoundingClientRect()),
      }));
    const keyboardActions = playerKeyboardActions();

    return {
      index: observationIndex,
      label: observationLabel,
      screenshot: screenshotPath,
      screenshotFile,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio,
      },
      visibleText,
      availableActions,
      keyboardActions,
      prompt: buildDecisionPrompt({ screenshotPath, screenshotFile, visibleText, availableActions, keyboardActions }),
    };

    function buildDecisionPrompt(observation) {
      return [
        'You are playtesting a desktop idle farming game as a real player.',
        'Use the screenshot, visible controls, and listed keyboard controls only. Pick one action from the schema: click, hover, drag, adjust, wheel, press, wait, viewport, or stop. Click and canvas drag actions may include x/y coordinates relative to the chosen element. Press actions must use a listed keyboard control; include its selector when the control says it requires focus.',
        `Screenshot file to inspect: ${observation.screenshotFile}`,
        JSON.stringify(observation, null, 2),
      ].join('\n\n');
    }

    function playerKeyboardActions() {
      return [
        { label: 'Pan camera left', key: 'ArrowLeft', alternateKeys: ['A'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera right', key: 'ArrowRight', alternateKeys: ['D'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera up', key: 'ArrowUp', alternateKeys: ['W'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera down', key: 'ArrowDown', alternateKeys: ['S'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        ...toolbarShortcutKeyboardActions(),
        ...focusedControlKeyboardActions(),
      ];
    }

    function toolbarShortcutKeyboardActions() {
      return Array.from(document.querySelectorAll('.toolbar .tool-button'))
        .filter((button) => isVisible(button) && isReachableToPlayer(button))
        .map((button) => {
          const shortcut = button.querySelector?.('.key')?.textContent?.trim();
          if (!shortcut) return null;
          const label = actionLabelFor(button);
          return {
            label: shortcutKeyboardLabelFor(button, label),
            key: shortcut,
            alternateKeys: [],
            actionHint: 'press',
            selector: playerSelectorFor(button),
            state: {
              ...controlStateFor(button),
              canHold: false,
            },
          };
        })
        .filter(Boolean);
    }

    function shortcutKeyboardLabelFor(button, label) {
      if (button.matches('[data-tool]')) return `Select ${label} tool`;
      if (button.matches('[data-command="undo"]')) return 'Undo';
      if (button.matches('[data-command="redo"]')) return 'Redo';
      if (button.matches('[data-command="pause"]')) return label;
      if (button.matches('[data-speed]')) return `Set ${label}`;
      return label;
    }

    function focusedControlKeyboardActions() {
      const actions = [];
      const resizer = document.querySelector('[data-panel-resizer]');
      if (resizer && isVisible(resizer) && isReachableToPlayer(resizer)) {
        const selector = playerSelectorFor(resizer);
        const state = {
          ...controlStateFor(resizer),
          canHold: false,
          requiresFocus: true,
        };
        actions.push(
          { label: 'Resize side panel wider', key: 'ArrowLeft', alternateKeys: [], actionHint: 'press', selector, state },
          { label: 'Resize side panel narrower', key: 'ArrowRight', alternateKeys: [], actionHint: 'press', selector, state },
          { label: 'Resize side panel to minimum', key: 'Home', alternateKeys: [], actionHint: 'press', selector, state },
          { label: 'Resize side panel to maximum', key: 'End', alternateKeys: [], actionHint: 'press', selector, state },
        );
      }

      for (const input of document.querySelectorAll('input[type="range"], input[type="number"]')) {
        if (!isVisible(input) || !isReachableToPlayer(input) || input.disabled) continue;
        const selector = playerSelectorFor(input);
        const label = actionLabelFor(input);
        const state = {
          ...controlStateFor(input),
          canHold: false,
          requiresFocus: true,
        };
        if (input instanceof HTMLInputElement && input.type === 'number') {
          actions.push(
            { label: `Decrease number value: ${label}`, key: 'ArrowDown', alternateKeys: [], actionHint: 'press', selector, state },
            { label: `Increase number value: ${label}`, key: 'ArrowUp', alternateKeys: [], actionHint: 'press', selector, state },
          );
          continue;
        }
        actions.push(
          { label: `Decrease range value: ${label}`, key: 'ArrowLeft', alternateKeys: [], actionHint: 'press', selector, state },
          { label: `Increase range value: ${label}`, key: 'ArrowRight', alternateKeys: [], actionHint: 'press', selector, state },
        );
      }

      return actions;
    }

    function actionHintFor(element) {
      if (element.matches('[data-player-scroll]')) return 'scroll';
      if (element.matches('canvas')) return 'click-or-drag-canvas-coordinate';
      if (element.matches('[role="separator"]')) return 'drag-resize';
      if (element.matches('input[type="range"]')) return 'adjust';
      if (element.matches('input[type="number"]')) return 'adjust';
      return 'click';
    }

    function controlStateFor(element) {
      const state = {};
      state.active = element.classList.contains('active');
      const shortcut = element.querySelector?.('.key')?.textContent?.trim();
      if (shortcut) state.shortcut = shortcut;
      const ariaPressed = element.getAttribute('aria-pressed');
      if (ariaPressed !== null) state.pressed = ariaPressed;
      const ariaExpanded = element.getAttribute('aria-expanded');
      if (ariaExpanded !== null) state.expanded = ariaExpanded;
      if (element instanceof HTMLInputElement) {
        state.value = element.value;
        if (element.min !== '') state.min = element.min;
        if (element.max !== '') state.max = element.max;
        if (element.step !== '') state.step = element.step;
      }
      if (element instanceof HTMLElement && element.matches('[data-player-scroll]')) {
        const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
        state.scrollTop = Math.round(element.scrollTop);
        state.clientHeight = Math.round(element.clientHeight);
        state.scrollHeight = Math.round(element.scrollHeight);
        state.canScrollUp = element.scrollTop > 1;
        state.canScrollDown = element.scrollTop < maxScrollTop - 1;
      }
      return state;
    }

    function actionLabelFor(element) {
      return compactLabel(
        element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.textContent ||
        element.tagName.toLowerCase(),
      );
    }

    function compactLabel(value) {
      return value.replace(/\s+/g, ' ').trim().slice(0, 2400);
    }

    function normalizeVisibleText(value) {
      return value.replace(/\s+/g, ' ').trim();
    }

    function visibleTextForPlayer() {
      const fragments = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || !isTextContainerVisible(parent)) return NodeFilter.FILTER_REJECT;

          const range = document.createRange();
          range.selectNodeContents(node);
          const visible = Array.from(range.getClientRects()).some((rect) => (
            isRectVisibleToPlayer(rect, parent) && isTextReachableToPlayer(rect, parent)
          ));
          return visible ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });

      while (true) {
        const node = walker.nextNode();
        if (!node) break;
        fragments.push(node.textContent ?? '');
      }

      return normalizeVisibleText(fragments.join(' '));
    }

    function isTextContainerVisible(element) {
      if (element.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        isRectVisibleToPlayer(rect, element)
      );
    }

    function isRectVisibleToPlayer(rect, element) {
      const clip = visibleClipFor(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > clip.left &&
        rect.left < clip.right &&
        rect.bottom > clip.top &&
        rect.top < clip.bottom
      );
    }

    function isReachableToPlayer(element) {
      const rect = element.getBoundingClientRect();
      return hitTestPoints(rect, element).some((point) => {
        const topElement = document.elementFromPoint(point.x, point.y);
        return Boolean(topElement && (topElement === element || element.contains(topElement)));
      });
    }

    function isTextReachableToPlayer(rect, parent) {
      return hitTestPoints(rect, parent).some((point) => {
        const topElement = document.elementFromPoint(point.x, point.y);
        return Boolean(topElement && (topElement === parent || parent.contains(topElement)));
      });
    }

    function hitTestPoints(rect, element) {
      const clip = visibleClipFor(element);
      const left = Math.max(rect.left, clip.left);
      const right = Math.min(rect.right, clip.right);
      const top = Math.max(rect.top, clip.top);
      const bottom = Math.min(rect.bottom, clip.bottom);
      if (right <= left || bottom <= top) return [];

      const insetX = Math.min(4, Math.max(0, (right - left) / 3));
      const insetY = Math.min(4, Math.max(0, (bottom - top) / 3));
      return [
        { x: (left + right) / 2, y: (top + bottom) / 2 },
        { x: left + insetX, y: top + insetY },
        { x: right - insetX, y: top + insetY },
        { x: left + insetX, y: bottom - insetY },
        { x: right - insetX, y: bottom - insetY },
      ].filter((point) => (
        point.x >= 0 &&
        point.x < window.innerWidth &&
        point.y >= 0 &&
        point.y < window.innerHeight
      ));
    }

    function visibleClipFor(element) {
      let clip = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };

      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clips = /(auto|scroll|hidden|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
        if (clips) {
          const rect = ancestor.getBoundingClientRect();
          clip = {
            left: Math.max(clip.left, rect.left),
            top: Math.max(clip.top, rect.top),
            right: Math.min(clip.right, rect.right),
            bottom: Math.min(clip.bottom, rect.bottom),
          };
        }
      }

      return clip;
    }

    function roundedBounds(rect) {
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    function playerSelectorFor(element) {
      const dataAttribute = Array.from(element.attributes).find((attribute) => (
        attribute.name.startsWith('data-') && attribute.name !== 'data-tutorial-tip'
      ));
      if (dataAttribute) {
        return dataAttribute.value
          ? `[${dataAttribute.name}="${escapeAttributeValue(dataAttribute.value)}"]`
          : `[${dataAttribute.name}]`;
      }
      if (element.id) return `#${CSS.escape(element.id)}`;
      if (element.matches('canvas')) return 'canvas';
      if (element.getAttribute('role')) return `[role="${CSS.escape(element.getAttribute('role'))}"]`;
      return element.tagName.toLowerCase();
    }

    function escapeAttributeValue(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
  }, {
    observationIndex: stepIndex,
    observationLabel: label,
    screenshotPath,
    screenshotFile: absoluteScreenshotFile,
    playerActionSelector: PLAYER_ACTION_SELECTOR,
  });
  await page.screenshot({ path: screenshotFile, fullPage: false });
  return observation;
}

function toVisualPlaytestObservation(observation) {
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
    state: [
      {
        label: 'Farm visual action packet',
        audience: 'reviewer',
        summary: `${observation.availableActions.length} visible controls, ${observation.keyboardActions?.length ?? 0} keyboard controls`,
        value: {
          availableActions: observation.availableActions,
          keyboardActions: observation.keyboardActions ?? [],
        },
      },
    ],
    metadata: {
      index: observation.index,
      label: observation.label,
      screenshot: observation.screenshot,
    },
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

function farmDecisionToVisualAction(decision) {
  const action = decision.action;
  const common = {
    label: action.label,
    reason: decision.rationale,
    farmDecision: decision,
  };
  if (action.kind === 'click') {
    return {
      kind: 'click',
      target: action.selector,
      point: Number.isFinite(action.x) && Number.isFinite(action.y)
        ? { x: action.x, y: action.y }
        : undefined,
      ...common,
    };
  }
  if (action.kind === 'hover') {
    return {
      kind: 'hover',
      target: action.selector,
      ...common,
    };
  }
  if (action.kind === 'drag') {
    return {
      kind: 'drag',
      target: action.selector,
      from: { x: action.x, y: action.y },
      to: { x: action.x + action.deltaX, y: action.y + action.deltaY },
      ...common,
    };
  }
  if (action.kind === 'adjust') {
    return {
      kind: 'type',
      target: action.selector,
      text: String(action.value),
      ...common,
    };
  }
  if (action.kind === 'wheel') {
    return {
      kind: 'wheel',
      target: action.selector,
      deltaY: action.deltaY,
      ...common,
    };
  }
  if (action.kind === 'press') {
    return {
      kind: 'key',
      key: action.key,
      target: action.selector,
      durationMs: action.durationMs,
      requiresFocus: action.requiresFocus,
      ...common,
    };
  }
  if (action.kind === 'wait') {
    return {
      kind: 'wait',
      durationMs: action.ms,
      ...common,
    };
  }
  if (action.kind === 'viewport') {
    return {
      kind: 'viewport',
      viewport: {
        width: action.width,
        height: action.height,
      },
      ...common,
    };
  }
  return {
    kind: 'stop',
    reason: decision.rationale,
    ...common,
  };
}

function visualActionToFarmDecision(action) {
  if (action.farmDecision) return action.farmDecision;
  const target = action.target;
  const base = {
    rationale: action.reason || 'civ-engine visual action selected by the playtest agent.',
    expectedResult: 'The next screenshot should show the result of this player-facing action.',
  };
  if (action.kind === 'click') {
    return {
      ...base,
      action: {
        kind: 'click',
        selector: target,
        label: action.label,
        ...(action.point ? { x: action.point.x, y: action.point.y } : {}),
      },
    };
  }
  if (action.kind === 'hover') {
    return {
      ...base,
      action: {
        kind: 'hover',
        selector: target,
        label: action.label,
      },
    };
  }
  if (action.kind === 'drag') {
    return {
      ...base,
      action: {
        kind: 'drag',
        selector: target,
        label: action.label,
        x: action.from.x,
        y: action.from.y,
        deltaX: action.to.x - action.from.x,
        deltaY: action.to.y - action.from.y,
      },
    };
  }
  if (action.kind === 'type') {
    return {
      ...base,
      action: {
        kind: 'adjust',
        selector: target,
        label: action.label,
        value: Number(action.text),
      },
    };
  }
  if (action.kind === 'wheel') {
    return {
      ...base,
      action: {
        kind: 'wheel',
        selector: target,
        label: action.label,
        deltaY: action.deltaY ?? 0,
      },
    };
  }
  if (action.kind === 'key') {
    return {
      ...base,
      action: {
        kind: 'press',
        key: action.key,
        selector: target,
        label: action.label,
        durationMs: action.durationMs ?? 0,
        requiresFocus: Boolean(action.requiresFocus),
      },
    };
  }
  if (action.kind === 'wait') {
    return {
      ...base,
      action: {
        kind: 'wait',
        ms: action.durationMs ?? defaultWaitMs,
      },
    };
  }
  if (action.kind === 'viewport') {
    return {
      ...base,
      action: {
        kind: 'viewport',
        width: action.viewport.width,
        height: action.viewport.height,
      },
    };
  }
  return {
    ...base,
    action: { kind: 'stop' },
  };
}

function farmExecutionResultToVisualActionResult(action, execution, decision) {
  return {
    ok: execution.ok,
    action,
    message: execution.ok ? decision.expectedResult : execution.error,
    ...(execution.error ? {
      error: {
        name: 'FarmPlayerActionError',
        message: execution.error,
        stack: null,
      },
    } : {}),
  };
}

async function chooseVisualLoopAction({ observation, history, defaultWaitMs, providerCommand }) {
  if (providerCommand) {
    const decision = await chooseWithExternalProvider(providerCommand, { observation, history });
    return normalizeDecision(decision, observation, 'external-command');
  }

  return normalizeDecision(chooseLocalHeuristicDecision({ observation, history, defaultWaitMs }), observation, 'local-heuristic');
}

function chooseLocalHeuristicDecision({ observation, history, defaultWaitMs }) {
  const actionHistory = history.map((step) => step.decision?.action).filter(Boolean);
  const lastAction = actionHistory.at(-1);
  const clickedSelectors = new Set(actionHistory.filter((action) => action.kind === 'click').map((action) => action.selector));
  const waitCount = actionHistory.filter((action) => action.kind === 'wait').length;
  const canvasClickCount = actionHistory.filter((action) => action.kind === 'click' && action.selector === 'canvas').length;
  const pannedCamera = actionHistory.some((action) => action.kind === 'press' && action.key === 'ArrowRight');
  const zoomedCamera = actionHistory.some((action) => (
    action.kind === 'wheel' &&
    action.selector === 'canvas'
  ));
  const hoveredPanelTab = actionHistory.some((action) => (
    action.kind === 'hover' &&
    action.selector === '[data-panel="inventory"]'
  ));
  const draggedCanvas = actionHistory.some((action) => action.kind === 'drag' && action.selector === 'canvas');
  const draggedPanelWithMouse = actionHistory.some((action) => (
    action.kind === 'drag' &&
    action.selector === '[data-panel-resizer]'
  ));
  const resizedPanelWithKeyboard = actionHistory.some((action) => (
    action.kind === 'press' &&
    action.selector === '[data-panel-resizer]'
  ));
  const collapsedPanel = actionHistory.filter((action) => (
    action.kind === 'click' &&
    action.selector === '[data-command="toggle-panel"]'
  )).length >= 1;
  const expandedPanel = actionHistory.filter((action) => (
    action.kind === 'click' &&
    action.selector === '[data-command="toggle-panel"]'
  )).length >= 2;
  const pauseClickIndex = actionHistory.findIndex((action) => (
    action.kind === 'click' &&
    action.selector === '[data-command="pause"]'
  ));
  const pausedWithButton = pauseClickIndex >= 0;
  const resumedWithSpace = pauseClickIndex >= 0 && actionHistory
    .slice(pauseClickIndex + 1)
    .some((action) => action.kind === 'press' && action.key === 'Space');
  const speed1Index = actionHistory.findIndex((action) => (
    action.kind === 'click' &&
    action.selector === '[data-speed="1"]'
  ));
  const speed2Index = actionHistory.findIndex((action) => (
    action.kind === 'click' &&
    action.selector === '[data-speed="2"]'
  ));
  const usedSpeed1 = speed1Index >= 0;
  const usedSpeed2 = speed2Index >= 0;
  const returnedToSpeed4AfterSpeedTour = speed2Index >= 0 && actionHistory
    .slice(speed2Index + 1)
    .some((action) => action.kind === 'click' && action.selector === '[data-speed="4"]');
  const compactViewport = actionHistory.some((action) => (
    action.kind === 'viewport' &&
    action.width <= 1100 &&
    action.height <= 760
  ));
  const openedInspectPanel = clickedSelectors.has('[data-panel="inspect"]');
  const inspectToolIndex = actionHistory.findIndex((action) => (
    (action.kind === 'click' || action.kind === 'press') &&
    action.selector === '[data-tool="inspect"]'
  ));
  const selectedInspectTool = inspectToolIndex >= 0;
  const inspectedCanvasTile = inspectToolIndex >= 0 && actionHistory
    .slice(inspectToolIndex + 1)
    .some((action) => action.kind === 'click' && action.selector === 'canvas');
  const selectedWellTool = clickedSelectors.has('[data-tool="well"]');
  const selectedStorageTool = clickedSelectors.has('[data-tool="storage"]');
  const selectedLandTool = clickedSelectors.has('[data-tool="land"]');
  const selectedBulldozeTool = clickedSelectors.has('[data-tool="bulldoze"]');
  const undoIndex = actionHistory.findIndex((action) => (
    (action.kind === 'click' && action.selector === '[data-command="undo"]') ||
    (action.kind === 'press' && action.key === 'Z')
  ));
  const usedUndo = undoIndex >= 0;
  const usedRedo = undoIndex >= 0 && actionHistory
    .slice(undoIndex + 1)
    .some((action) => (
      (action.kind === 'click' && action.selector === '[data-command="redo"]') ||
      (action.kind === 'press' && action.key === 'Y')
    ));
  const scrolledPanelDown = actionHistory.some((action) => (
    action.kind === 'wheel' &&
    action.selector === '[data-player-scroll="side-panel"]' &&
    action.deltaY > 0
  ));
  const scrolledPanelUp = actionHistory.some((action) => (
    action.kind === 'wheel' &&
    action.selector === '[data-player-scroll="side-panel"]' &&
    action.deltaY < 0
  ));
  const plotShortcutIndex = actionHistory.findIndex((action) => action.kind === 'press' && action.key === '1');
  const pressedPlotShortcut = plotShortcutIndex >= 0;
  const canvasClickedAfterPlotShortcut = plotShortcutIndex >= 0 && actionHistory
    .slice(plotShortcutIndex + 1)
    .some((action) => action.kind === 'click' && action.selector === 'canvas');
  const claimedTier = actionHistory.some((action) => action.kind === 'click' && action.selector === '[data-command="claim-tier"]');
  const waitsAfterClaim = claimedTier
    ? actionHistory.slice(actionHistory.findIndex((action) => action.kind === 'click' && action.selector === '[data-command="claim-tier"]') + 1)
      .filter((action) => action.kind === 'wait').length
    : 0;
  const canvasAction = findAction(observation, 'canvas');
  const panelScrollAction = findAction(observation, '[data-player-scroll="side-panel"]');
  const inventoryAction = findAction(observation, '[data-panel="inventory"]');
  const goalsAction = findAction(observation, '[data-panel="goals"]');
  const mixAction = findAction(observation, '[data-panel="mix"]');
  const inspectPanelAction = findAction(observation, '[data-panel="inspect"]');
  const inspectToolAction = findAction(observation, '[data-tool="inspect"]');
  const panelResizeAction = findAction(observation, '[data-panel-resizer]');
  const togglePanelAction = findAction(observation, '[data-command="toggle-panel"]');
  const pauseAction = findAction(observation, '[data-command="pause"]');
  const speed1Action = findAction(observation, '[data-speed="1"]');
  const speed2Action = findAction(observation, '[data-speed="2"]');
  const wellToolAction = findAction(observation, '[data-tool="well"]');
  const storageToolAction = findAction(observation, '[data-tool="storage"]');
  const landToolAction = findAction(observation, '[data-tool="land"]');
  const bulldozeToolAction = findAction(observation, '[data-tool="bulldoze"]');
  const undoAction = findAction(observation, '[data-command="undo"]');
  const redoAction = findAction(observation, '[data-command="redo"]');
  const selectedPlotFromShortcut = pressedPlotShortcut && /\bTOOL Plot\b/i.test(observation.visibleText);
  const selectedPlotGuideVisible = /NEXT CLICK Select Plot|FARM GUIDE Select Plot/i.test(observation.visibleText);
  const explicitPaintGuidanceVisible = /FARM GUIDE Paint Empty Land|Paint plots on empty land/i.test(observation.visibleText);
  const terminalOpenEndedGuidanceVisible = /Tune mix, expand land, upgrade workers/i.test(observation.visibleText);

  const claimAction = findAction(observation, '[data-command="claim-tier"]');
  if (claimAction) {
    return clickDecision(claimAction, 'A visible tier reward is ready, so claim it before watching the farm continue.');
  }

  if (goalsAction && !goalsAction.state?.active && visibleTierReady(observation.visibleText)) {
    return clickDecision(goalsAction, 'A visible tier-ready prompt points back to Goals, so reopen Goals even if it was used earlier.');
  }

  const seedAction = findSeedActionForVisibleNeed(observation);
  if (seedAction && hasExplicitSeedGuidance(observation.visibleText)) {
    return clickDecision(seedAction, 'Workers need seeds and the visible guidance offers a direct seed-buying action.');
  }

  const speedAction = findAction(observation, '[data-speed="4"]');
  if (speedAction && !clickedSelectors.has(speedAction.selector)) {
    return clickDecision(speedAction, 'Use the visible 4x speed control so idle farming progress can be observed in real browser time.');
  }

  if (canvasAction && !pannedCamera) {
    return pressDecision('ArrowRight', 'Pan the farm camera right with the keyboard so spatial navigation is covered like a player would do it.', 260);
  }

  if (canvasAction && !zoomedCamera) {
    return wheelDecision(canvasAction, 'Zoom the farm camera with the mouse wheel to verify readable play after changing scale.', -360);
  }

  if (inventoryAction && !hoveredPanelTab) {
    return hoverDecision(
      inventoryAction,
      'Hover the icon-only Inventory panel tab so the player can read its label before relying on the icon.',
    );
  }

  if (panelResizeAction && !draggedPanelWithMouse) {
    return dragDecision(
      panelResizeAction,
      'Drag the visible side-panel resize handle with the mouse so pointer resizing is covered before keyboard resizing.',
      { x: 7, y: 300 },
      { deltaX: -88, deltaY: 0 },
    );
  }

  const panelResizeKeyboardAction = findKeyboardControl(observation, 'ArrowLeft', '[data-panel-resizer]');
  if (panelResizeKeyboardAction && !resizedPanelWithKeyboard) {
    return pressDecision(
      'ArrowLeft',
      'Focus the visible side-panel resize handle and press ArrowLeft so the visual player covers keyboard resizing, not only mouse dragging.',
      0,
      panelResizeKeyboardAction,
    );
  }

  if (togglePanelAction && !collapsedPanel) {
    return clickDecision(togglePanelAction, 'Collapse the side panel with the visible panel toggle so the visual loop audits the compact canvas state.');
  }

  if (togglePanelAction && collapsedPanel && !expandedPanel) {
    return clickDecision(togglePanelAction, 'Expand the side panel again so the player can continue using the panel after the collapse audit.');
  }

  if (pauseAction && !pausedWithButton) {
    return clickDecision(pauseAction, 'Pause the farm with the visible toolbar button so the loop exercises the time-control affordance.');
  }

  const resumeKeyboardAction = findKeyboardControl(observation, 'Space', '[data-command="pause"]') || findKeyboardAction(observation, 'Space');
  if (pausedWithButton && resumeKeyboardAction && !resumedWithSpace) {
    return pressDecision('Space', 'Resume from pause with the listed Space keyboard control, matching how a desktop player would recover flow.', 0, resumeKeyboardAction);
  }

  if (speed1Action && !usedSpeed1) {
    return clickDecision(speed1Action, 'Cycle through 1x speed so every visible speed control gets a real player action.');
  }

  if (speed2Action && usedSpeed1 && !usedSpeed2) {
    return clickDecision(speed2Action, 'Cycle through 2x speed before returning to the faster idle-play pace.');
  }

  if (speedAction && usedSpeed2 && !returnedToSpeed4AfterSpeedTour) {
    return clickDecision(speedAction, 'Return to 4x speed after auditing the slower speed buttons.');
  }

  if (returnedToSpeed4AfterSpeedTour && !compactViewport) {
    return viewportDecision(1024, 720, 'Resize to a compact desktop viewport so the visual loop checks text fit without leaving desktop scope.');
  }

  if (inspectPanelAction && !openedInspectPanel) {
    return clickDecision(inspectPanelAction, 'Open the Inspect panel before selecting a tile so object details are visible in a screenshot.');
  }

  if (inspectToolAction && openedInspectPanel && !selectedInspectTool) {
    return clickDecision(inspectToolAction, 'Select the visible Inspect tool so the next canvas click uses the same mode a player sees.');
  }

  if (canvasAction && openedInspectPanel && (selectedInspectTool || /\bTOOL Inspect\b/i.test(observation.visibleText)) && !inspectedCanvasTile) {
    return clickDecision(
      canvasAction,
      'Inspect a visible farm tile through the canvas so the Inspect panel contents are audited in the visual replay.',
      { x: 410, y: 290 },
    );
  }

  if (wellToolAction && inspectedCanvasTile && !selectedWellTool) {
    return clickDecision(wellToolAction, 'Select the visible Well tool so the LLM-player covers the building toolbar.');
  }

  if (storageToolAction && inspectedCanvasTile && selectedWellTool && !selectedStorageTool) {
    return clickDecision(storageToolAction, 'Select the visible Storage tool so storage placement controls are visibly audited.');
  }

  if (landToolAction && inspectedCanvasTile && selectedStorageTool && !selectedLandTool) {
    return clickDecision(landToolAction, 'Select the visible Land tool so expansion controls are represented in the visual loop.');
  }

  if (bulldozeToolAction && inspectedCanvasTile && selectedLandTool && !selectedBulldozeTool) {
    return clickDecision(bulldozeToolAction, 'Select the visible Bulldoze tool so destructive-tool selection is audited without applying it blindly.');
  }

  const plotShortcutAction = findKeyboardAction(observation, '1');
  if (plotShortcutAction && !pressedPlotShortcut && selectedPlotGuideVisible) {
    return pressDecision('1', 'Use the visible Plot keyboard shortcut so the LLM-player loop can exercise toolbar hotkeys, not only mouse clicks.');
  }

  if (
    selectedPlotFromShortcut &&
    canvasAction &&
    !canvasClickedAfterPlotShortcut &&
    selectedPlotGuideVisible
  ) {
    return clickDecision(
      canvasAction,
      'The Plot shortcut already selected the tool, so continue by clicking the farm canvas instead of re-clicking the toolbar.',
      { x: 410, y: 290 },
    );
  }

  if (canvasClickedAfterPlotShortcut && undoAction && !usedUndo) {
    return clickDecision(undoAction, 'Click Undo after a visible plot placement so the history control is exercised on a real change.');
  }

  if (usedUndo && redoAction && !usedRedo) {
    return clickDecision(redoAction, 'Click Redo after undoing the visible plot placement so history recovery is covered too.');
  }

  if (canvasAction && !draggedCanvas && !selectedPlotGuideVisible && /\bTOOL Plot\b|Paint plots on empty land/i.test(observation.visibleText)) {
    return dragDecision(canvasAction,
      'Drag across visible farm tiles with the selected Plot tool so drag-painting is covered like a player action.',
      { x: 410, y: 290 },
      { deltaX: 72, deltaY: 0 },
    );
  }

  const tutorialAction = selectedPlotFromShortcut && canvasClickedAfterPlotShortcut && selectedPlotGuideVisible
    ? null
    : tutorialActionFromText(observation);
  if (tutorialAction && !recentlyClicked(actionHistory, tutorialAction.selector)) {
    return clickDecision(tutorialAction, `Follow the visible tutorial prompt: ${tutorialAction.label}.`);
  }

  const wheatNumberAction = findAction(observation, '[data-mix-number="wheat"]');
  const adjustedWheatNumber = actionHistory.some((action) => (
    action.kind === 'adjust' && action.selector === '[data-mix-number="wheat"]'
  ));
  if (wheatNumberAction && !adjustedWheatNumber && /Crop Mix|allocated across unlocked crops/i.test(observation.visibleText)) {
    return adjustDecision(
      wheatNumberAction,
      'Type a direct Wheat crop mix percentage so the visual loop covers the same numerical control a player sees.',
      40,
    );
  }
  const tomatoNumberAction = findAction(observation, '[data-mix-number="tomato"]');
  const adjustedTomatoNumber = actionHistory.some((action) => (
    action.kind === 'adjust' && action.selector === '[data-mix-number="tomato"]'
  ));
  const tomatoAdjustIndex = actionHistory.findIndex((action) => (
    action.kind === 'adjust' && action.selector === '[data-mix-number="tomato"]'
  ));
  const openedMixAfterTomato = tomatoAdjustIndex >= 0 && actionHistory
    .slice(tomatoAdjustIndex + 1)
    .some((action) => action.kind === 'click' && action.selector === '[data-panel="mix"]');
  const openedGoalsAfterTomato = tomatoAdjustIndex >= 0 && actionHistory
    .slice(tomatoAdjustIndex + 1)
    .some((action) => action.kind === 'click' && action.selector === '[data-panel="goals"]');
  const selectedLandAfterTomato = tomatoAdjustIndex >= 0 && actionHistory
    .slice(tomatoAdjustIndex + 1)
    .some((action) => action.kind === 'click' && action.selector === '[data-tool="land"]');
  if (
    tomatoNumberAction &&
    !adjustedTomatoNumber &&
    /Tomato|Tomatoes are unlocked|allocated across unlocked crops/i.test(observation.visibleText)
  ) {
    return adjustDecision(
      tomatoNumberAction,
      'Type a direct Tomato crop mix percentage so the visual loop covers the newly unlocked crop control.',
      25,
    );
  }
  if (
    inventoryAction &&
    !inventoryAction.state?.active &&
    /Crop Mix/i.test(observation.visibleText) &&
    /No seeds stocked/i.test(observation.visibleText) &&
    !recentlyClicked(actionHistory, inventoryAction.selector)
  ) {
    return clickDecision(
      inventoryAction,
      'Crop Mix shows a crop with no seeds stocked, so open Inventory to restock visible seed rows.',
    );
  }

  const upgradeAction = findUpgradeAction(observation);
  if (upgradeAction && /Tool Upgrades|Worker Boots|Watering Cans/i.test(observation.visibleText)) {
    return clickDecision(upgradeAction, 'Buy the visible worker upgrade so the playtest exercises progression beyond selling and tier claims.');
  }

  if (panelScrollAction?.state?.canScrollDown && !scrolledPanelDown && /Inventory|Tier|Crop Mix|Inspect/i.test(observation.visibleText)) {
    return wheelDecision(panelScrollAction, 'Scroll the side panel down with the mouse wheel so the LLM sees lower panel content only after a player-like scroll.', 420);
  }

  if (panelScrollAction?.state?.canScrollUp && scrolledPanelDown && !scrolledPanelUp) {
    return wheelDecision(panelScrollAction, 'Scroll the side panel back up so primary controls remain reachable for the next player decision.', -420);
  }

  const sellAllAction = findAction(observation, '[data-command="sell-all"]');
  if (sellAllAction && hasVisibleSellableCrops(observation.visibleText) && shouldSellVisibleCrops(observation.visibleText)) {
    return clickDecision(sellAllAction, 'The visible inventory shows crops ready to sell, so sell them before waiting again.');
  }

  if (canvasAction && explicitPaintGuidanceVisible && !selectedPlotGuideVisible && !recentlyUsedCanvas(actionHistory)) {
    return clickDecision(
      canvasAction,
      'Visible plot guidance is still active, so place another plot instead of ending the run.',
      nextPaintPosition(canvasClickCount),
    );
  }

  if (canvasAction && canvasClickCount < 2 && !selectedPlotGuideVisible && /\bTOOL Plot\b|Paint plots on empty land/i.test(observation.visibleText)) {
    return clickDecision(
      canvasAction,
      'The selected plot tool needs a field click, so click an open farm tile visible on the canvas.',
      nextPaintPosition(canvasClickCount),
    );
  }

  if (seedAction && hasVisibleZeroSeedRestock(observation.visibleText)) {
    return clickDecision(seedAction, 'Visible Inventory seed rows show zero stock, so buy seeds before ending the run.');
  }

  if (mixAction && !mixAction.state?.active && (terminalOpenEndedGuidanceVisible || /Tune mix/i.test(observation.visibleText)) && !openedMixAfterTomato) {
    return clickDecision(mixAction, 'Open Crop Mix because the visible open-ended guidance asks the player to tune mix.');
  }

  if (goalsAction && !goalsAction.state?.active && (terminalOpenEndedGuidanceVisible || /upgrade workers/i.test(observation.visibleText)) && !openedGoalsAfterTomato) {
    return clickDecision(goalsAction, 'Open Goals because the visible open-ended guidance mentions worker upgrades.');
  }

  if (landToolAction && !landToolAction.state?.active && (terminalOpenEndedGuidanceVisible || /expand land/i.test(observation.visibleText)) && !selectedLandAfterTomato) {
    return clickDecision(landToolAction, 'Select the Land tool because the visible open-ended guidance asks the player to expand land.');
  }

  if (goalsAction && !clickedSelectors.has(goalsAction.selector)) {
    return clickDecision(goalsAction, 'Open the visible Goals panel because progression and tier rewards should be understandable there.');
  }

  if (lastAction?.kind === 'wait' && claimedTier && waitsAfterClaim >= 2 && !hasActionableGuidance(observation.visibleText)) {
    return {
      rationale: 'The loop already claimed a tier and watched the post-claim farm for two intervals.',
      action: { kind: 'stop' },
      expectedResult: 'End with a final screenshot for review.',
    };
  }

  if (lastAction?.kind === 'wait' && waitCount >= 7 && !hasActionableGuidance(observation.visibleText)) {
    return {
      rationale: 'Several watch intervals have passed without a higher-priority visible action becoming available.',
      action: { kind: 'stop' },
      expectedResult: 'Stop before creating redundant screenshots.',
    };
  }

  return {
    rationale: 'No higher-priority visible action is available, so watch the autonomous farm loop for progress or stalls.',
    action: { kind: 'wait', ms: defaultWaitMs },
    expectedResult: 'The next screenshot should show workers, crops, storage, goals, or guidance changing over real browser time.',
  };
}

function hasExplicitSeedGuidance(visibleText) {
  return /FARM GUIDE Buy Seeds|Farmers Waiting|Restock seeds/i.test(visibleText);
}

function hasVisibleZeroSeedRestock(visibleText) {
  return /Inventory/i.test(visibleText) &&
    /(?:Carrot|Wheat|Tomato) seeds: 0\s+\d+c/i.test(visibleText) &&
    !shouldSellVisibleCrops(visibleText) &&
    !hasActionableGuidance(visibleText);
}

function hasActionableGuidance(visibleText) {
  return /FARM GUIDE (Open Goals|Buy Seeds|Claim|Tune Crop Mix|Add Tomatoes To Mix|Open Inventory|Sell Crops|Select Plot|Paint Empty Land)|Restock seeds|Paint plots on empty land|Tier \d+ ready/i.test(visibleText);
}

function shouldSellVisibleCrops(visibleText) {
  const openEndedTier = /Tier 3 Tomato Rows|Keep expanding the farm/i.test(visibleText);
  const storage = visibleStorage(visibleText);
  const storagePressure = storage ? storage.used >= Math.max(10, Math.floor(storage.capacity * 0.8)) : false;
  const coins = visibleCoins(visibleText);
  return (
    /FARM GUIDE (Open Inventory|Sell Crops)|Storage is almost full/i.test(visibleText) ||
    storagePressure ||
    coins < 50 ||
    !openEndedTier
  );
}

function visibleCoins(visibleText) {
  const match = visibleText.match(/Coins\s+(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function visibleStorage(visibleText) {
  const match = visibleText.match(/Storage\s+(\d+)\/(\d+)/i);
  if (!match) return null;
  return {
    used: Number(match[1]),
    capacity: Number(match[2]),
  };
}

function visibleTierReady(visibleText) {
  return /Tier \d+ ready/i.test(visibleText);
}

function tutorialActionFromText(observation) {
  const text = observation.visibleText;
  if (/NEXT CLICK Select Plot|FARM GUIDE Select Plot/i.test(text)) return findAction(observation, '[data-tool="plot"]');
  if (/NEXT CLICK Open Inventory|FARM GUIDE Open Inventory/i.test(text)) return findAction(observation, '[data-panel="inventory"]');
  if (/NEXT CLICK Open Goals|FARM GUIDE Open Goals/i.test(text)) return findAction(observation, '[data-panel="goals"]');
  if (/NEXT CLICK Tune Crop Mix|FARM GUIDE Tune Crop Mix|FARM GUIDE Add Tomatoes To Mix/i.test(text)) return findAction(observation, '[data-panel="mix"]');
  if (/NEXT CLICK Buy seeds|FARM GUIDE Buy Seeds/i.test(text)) return findSeedActionForVisibleNeed(observation);
  if (/NEXT CLICK Claim|FARM GUIDE Claim/i.test(text)) return findAction(observation, '[data-command="claim-tier"]');
  return null;
}

function recentlyClicked(actionHistory, selector) {
  return actionHistory.slice(-2).some((action) => action.kind === 'click' && action.selector === selector);
}

function recentlyUsedCanvas(actionHistory) {
  return actionHistory.slice(-2).some((action) => (
    (action.kind === 'click' || action.kind === 'drag') && action.selector === 'canvas'
  ));
}

function nextPaintPosition(canvasClickCount) {
  const positions = [
    { x: 276, y: 230 },
    { x: 326, y: 230 },
    { x: 376, y: 230 },
    { x: 426, y: 230 },
    { x: 476, y: 230 },
    { x: 276, y: 430 },
    { x: 326, y: 430 },
    { x: 376, y: 430 },
    { x: 426, y: 430 },
    { x: 476, y: 430 },
  ];
  return positions[canvasClickCount % positions.length];
}

function clickDecision(action, rationale, position) {
  return {
    rationale,
    action: {
      kind: 'click',
      selector: action.selector,
      label: action.label,
      ...position,
    },
    expectedResult: `The visible control "${action.label}" should respond and the next screenshot should reflect the state change.`,
  };
}

function hoverDecision(action, rationale) {
  return {
    rationale,
    action: {
      kind: 'hover',
      selector: action.selector,
      label: action.label,
    },
    expectedResult: `Hovering "${action.label}" should reveal any player-visible tooltip or hover state without changing farm state.`,
  };
}

function adjustDecision(action, rationale, value) {
  return {
    rationale,
    action: {
      kind: 'adjust',
      selector: action.selector,
      label: action.label,
      value,
    },
    expectedResult: `The visible control "${action.label}" should change to ${value} and the next screenshot should show a rebalanced crop mix.`,
  };
}

function pressDecision(key, rationale, durationMs = 0, keyboardAction = null) {
  return {
    rationale,
    action: {
      kind: 'press',
      key,
      durationMs,
      ...(keyboardAction ? { selector: keyboardAction.selector, label: keyboardAction.label } : {}),
    },
    expectedResult: durationMs > 0
      ? `The held ${key} key should move the farm camera while ordinary player controls remain available.`
      : `The ${key} key should trigger the same visible behavior a player would get from the keyboard.`,
  };
}

function wheelDecision(action, rationale, deltaY) {
  return {
    rationale,
    action: {
      kind: 'wheel',
      selector: action.selector,
      label: action.label,
      deltaY,
    },
    expectedResult: action.actionHint === 'scroll'
      ? 'The side panel should scroll while its content remains readable and clipped to the screenshot.'
      : 'The farm camera should zoom while the HUD, toolbar, and side panel stay readable.',
  };
}

function dragDecision(action, rationale, start, delta) {
  return {
    rationale,
    action: {
      kind: 'drag',
      selector: action.selector,
      label: action.label,
      x: start.x,
      y: start.y,
      deltaX: delta.deltaX,
      deltaY: delta.deltaY,
    },
    expectedResult: action.actionHint === 'drag-resize'
      ? `Dragging "${action.label}" should resize the side panel while text and controls remain readable.`
      : `Dragging on "${action.label}" should apply the selected tool across visible farm tiles.`,
  };
}

function viewportDecision(width, height, rationale) {
  return {
    rationale,
    action: {
      kind: 'viewport',
      width,
      height,
    },
    expectedResult: `The game should remain readable and playable after resizing the browser viewport to ${width}x${height}.`,
  };
}

function findAction(observation, selector) {
  return observation.availableActions.find((action) => action.selector === selector || action.selector.startsWith(selector));
}

function findKeyboardAction(observation, key) {
  return observation.keyboardActions?.find((action) => action.key === key || action.alternateKeys?.includes(key));
}

function findKeyboardControl(observation, key, selector) {
  const requestedKey = String(key || '');
  const requestedSelector = typeof selector === 'string' && selector.trim() ? selector.trim() : '';
  return observation.keyboardActions?.find((action) => {
    const keyMatches = action.key === requestedKey || action.alternateKeys?.includes(requestedKey);
    if (!keyMatches) return false;
    if (requestedSelector) return action.selector === requestedSelector;
    return true;
  });
}

function findSeedAction(observation) {
  return (
    findAction(observation, '[data-seed-guidance-action]') ||
    findAction(observation, '[data-buy-seeds') ||
    observation.availableActions.find((action) => /buy .*seeds/i.test(action.label))
  );
}

function findSeedActionForVisibleNeed(observation) {
  const milestoneCrop = visibleMilestoneCrop(observation.visibleText);
  if (milestoneCrop && visibleSeedStock(observation.visibleText, milestoneCrop) === 0) {
    const milestoneSeedAction = findAction(observation, `[data-buy-seeds="${milestoneCrop}"]`);
    if (milestoneSeedAction) return milestoneSeedAction;
  }
  for (const zeroSeedCrop of visibleZeroSeedCropsByPriority(observation.visibleText)) {
    const zeroSeedAction = findAction(observation, `[data-buy-seeds="${zeroSeedCrop}"]`);
    if (zeroSeedAction) return zeroSeedAction;
  }
  return findSeedAction(observation);
}

function visibleMilestoneCrop(visibleText) {
  const match = visibleText.match(/Harvest\s+\d+\/\d+\s+(carrot|wheat|tomato)/i);
  return match ? match[1].toLowerCase() : null;
}

function visibleZeroSeedCropsByPriority(visibleText) {
  return ['tomato', 'wheat', 'carrot'].filter((cropId) => visibleSeedStock(visibleText, cropId) === 0);
}

function findUpgradeAction(observation) {
  return (
    findAction(observation, '[data-buy-upgrade="boots"]') ||
    findAction(observation, '[data-buy-upgrade="wateringCan"]') ||
    observation.availableActions.find((action) => action.selector?.startsWith('[data-buy-upgrade=')) ||
    observation.availableActions.find((action) => /buy (worker boots|watering cans)/i.test(action.label))
  );
}

async function chooseWithExternalProvider(command, payload) {
  const result = await runJsonCommand(command, {
    schema: {
      rationale: 'short explanation',
      action: {
        kind: 'click | hover | drag | adjust | wheel | press | wait | viewport | stop',
        selector: 'required for click, hover, drag, adjust, and wheel; optional for press unless the listed keyboard control requires focus',
        x: 'optional x coordinate relative to the clicked or dragged element',
        y: 'optional y coordinate relative to the clicked or dragged element',
        deltaX: 'optional horizontal drag distance in pixels',
        deltaY: 'optional vertical drag or wheel distance in pixels',
        value: 'optional adjustment target from 0 to 100 for range or number controls',
        key: 'required for press',
        durationMs: 'optional hold duration for press',
        ms: 'optional for wait',
        width: 'required for viewport',
        height: 'required for viewport',
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
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Provider command timed out after 30000ms'));
    }, 30000);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Provider command exited ${code}: ${stderr.trim()}`));
      }
    });

    child.stdin.end(`${JSON.stringify(payload, null, 2)}\n`);
  });
}

function normalizeDecision(decision, observation, provider) {
  const fallback = {
    rationale: `${provider} returned an unusable action, so the harness will wait and capture another player-visible frame.`,
    action: { kind: 'wait', ms: defaultWaitMs },
    expectedResult: 'Another screenshot should make the next decision easier.',
    provider,
  };

  if (!decision || typeof decision !== 'object') return fallback;

  const action = decision.action && typeof decision.action === 'object' ? decision.action : {};
  const kind = ['click', 'hover', 'drag', 'adjust', 'wheel', 'press', 'wait', 'viewport', 'stop'].includes(action.kind) ? action.kind : 'wait';
  const normalized = {
    rationale: String(decision.rationale || fallback.rationale),
    action: { kind },
    expectedResult: String(decision.expectedResult || fallback.expectedResult),
    provider,
  };

  if (kind === 'click') {
    const visibleAction = observation.availableActions.find((candidate) => candidate.selector === action.selector);
    if (!visibleAction) return fallback;
    normalized.action.selector = visibleAction.selector;
    normalized.action.label = visibleAction.label;
    if (Number.isFinite(Number(action.x)) && Number.isFinite(Number(action.y))) {
      normalized.action.x = boundedNumber(action.x, Math.round(visibleAction.bounds.width / 2), 0, visibleAction.bounds.width);
      normalized.action.y = boundedNumber(action.y, Math.round(visibleAction.bounds.height / 2), 0, visibleAction.bounds.height);
    }
  } else if (kind === 'hover') {
    const visibleAction = observation.availableActions.find((candidate) => candidate.selector === action.selector);
    if (!visibleAction) return fallback;
    normalized.action.selector = visibleAction.selector;
    normalized.action.label = visibleAction.label;
  } else if (kind === 'drag') {
    const visibleAction = observation.availableActions.find((candidate) => candidate.selector === action.selector);
    if (!visibleAction) return fallback;
    normalized.action.selector = visibleAction.selector;
    normalized.action.label = visibleAction.label;
    normalized.action.x = boundedNumber(action.x, Math.round(visibleAction.bounds.width / 2), 0, visibleAction.bounds.width);
    normalized.action.y = boundedNumber(action.y, Math.round(visibleAction.bounds.height / 2), 0, visibleAction.bounds.height);
    normalized.action.deltaX = boundedNumber(action.deltaX, -96, -360, 360);
    normalized.action.deltaY = boundedNumber(action.deltaY, 0, -220, 220);
  } else if (kind === 'adjust') {
    const visibleAction = observation.availableActions.find((candidate) => candidate.selector === action.selector);
    if (!visibleAction) return fallback;
    normalized.action.selector = visibleAction.selector;
    normalized.action.label = visibleAction.label;
    normalized.action.value = boundedNumber(action.value, 50, 0, 100);
  } else if (kind === 'wheel') {
    const visibleAction = observation.availableActions.find((candidate) => candidate.selector === action.selector);
    if (!visibleAction) return fallback;
    normalized.action.selector = visibleAction.selector;
    normalized.action.label = visibleAction.label;
    normalized.action.deltaY = boundedNumber(action.deltaY, -320, -900, 900);
  } else if (kind === 'press') {
    const visibleKeyboardAction = findKeyboardControl(observation, action.key, action.selector);
    if (!visibleKeyboardAction) return fallback;
    normalized.action.key = String(action.key || visibleKeyboardAction.key);
    normalized.action.label = visibleKeyboardAction.label;
    normalized.action.selector = visibleKeyboardAction.selector;
    normalized.action.requiresFocus = Boolean(visibleKeyboardAction.state?.requiresFocus);
    normalized.action.durationMs = visibleKeyboardAction.state?.canHold
      ? boundedNumber(action.durationMs, 0, 0, 1500)
      : 0;
  } else if (kind === 'wait') {
    normalized.action.ms = boundedNumber(action.ms, defaultWaitMs, 100, 15000);
  } else if (kind === 'viewport') {
    normalized.action.width = boundedNumber(action.width, 1280, 800, 1800);
    normalized.action.height = boundedNumber(action.height, 800, 600, 1100);
  }

  return normalized;
}

async function executePlayerDecision(page, decision) {
  const startedAt = new Date().toISOString();
  try {
    if (decision.action.kind === 'click') {
      const clickOptions = { timeout: 5000 };
      if (Number.isFinite(decision.action.x) && Number.isFinite(decision.action.y)) {
        clickOptions.position = { x: decision.action.x, y: decision.action.y };
      }
      await page.locator(decision.action.selector).first().click(clickOptions);
    } else if (decision.action.kind === 'hover') {
      await page.locator(decision.action.selector).first().hover({ timeout: 5000 });
    } else if (decision.action.kind === 'drag') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Cannot drag ${decision.action.selector}; no visible bounds`);
      const startX = box.x + decision.action.x;
      const startY = box.y + decision.action.y;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + decision.action.deltaX, startY + decision.action.deltaY, { steps: 8 });
      await page.mouse.up();
    } else if (decision.action.kind === 'adjust') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const isNumberInput = await locator.evaluate((element) => (
        element instanceof HTMLInputElement && element.type === 'number'
      ));
      if (isNumberInput) {
        await locator.fill(String(decision.action.value));
        return {
          ok: true,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Cannot adjust ${decision.action.selector}; no visible bounds`);
      const trackX = box.x + box.width * (decision.action.value / 100);
      const trackY = box.y + box.height / 2;
      await page.mouse.click(trackX, trackY);
    } else if (decision.action.kind === 'wheel') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Cannot wheel ${decision.action.selector}; no visible bounds`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, decision.action.deltaY);
    } else if (decision.action.kind === 'press') {
      if (decision.action.selector && decision.action.requiresFocus) {
        await page.locator(decision.action.selector).first().focus();
      }
      if (decision.action.durationMs > 0) {
        await page.keyboard.down(decision.action.key);
        await page.waitForTimeout(decision.action.durationMs);
        await page.keyboard.up(decision.action.key);
      } else {
        await page.keyboard.press(decision.action.key);
      }
    } else if (decision.action.kind === 'wait') {
      await page.waitForTimeout(decision.action.ms);
    } else if (decision.action.kind === 'viewport') {
      await page.setViewportSize({ width: decision.action.width, height: decision.action.height });
    }

    return {
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      startedAt,
      completedAt: new Date().toISOString(),
      error: error.message,
    };
  }
}

function renderVisualLoopMarkdown(run) {
  const lines = [
    '# LLM Visual Loop Playtest',
    '',
    `Generated: ${run.generatedAt}`,
    `URL: ${run.url}`,
    `Decision provider: ${run.decisionProvider}`,
    `Action boundary: ${run.actionBoundary}`,
    '',
    '## Artifacts',
    '',
    '- `latest.json` - full observations, prompts, decisions, and execution results',
    '- `latest.html` - screenshot replay viewer with decisions',
    '- `steps/` - per-step screenshots used for decisions',
    '',
    '## Findings',
    '',
  ];

  lines.push(...renderImprovementFindingsMarkdown(run.findings));

  lines.push('');
  lines.push('## Rerun Comparison');
  lines.push('');
  lines.push(...renderComparisonMarkdown(run.comparison));

  lines.push('');
  lines.push('## Steps');
  lines.push('');

  for (const step of run.steps) {
    lines.push(`### Step ${step.index}`);
    lines.push('');
    lines.push(`Screenshot: ${step.observation.screenshot}`);
    lines.push(`Screenshot file: ${step.observation.screenshotFile}`);
    lines.push(`Visible text: ${step.observation.visibleText}`);
    lines.push(`Decision: ${step.decision.action.kind} - ${step.decision.rationale}`);
    lines.push(`Expected result: ${step.decision.expectedResult}`);
    lines.push(`Execution: ${step.execution.ok ? 'ok' : `failed - ${step.execution.error}`}`);
    lines.push('');
    lines.push('Available actions:');
    for (const action of step.observation.availableActions) {
      lines.push(`- ${action.label || action.selector} | ${action.selector} | ${action.actionHint}${formatActionState(action.state)} | ${JSON.stringify(action.bounds)}`);
    }
    if ((step.observation.keyboardActions ?? []).length > 0) {
      lines.push('Keyboard actions:');
      for (const action of step.observation.keyboardActions) {
        lines.push(`- ${formatKeyboardAction(action)}`);
      }
    }
    lines.push('');
  }

  if (run.finalObservation) {
    lines.push('## Final Observation');
    lines.push('');
    lines.push(`Screenshot: ${run.finalObservation.screenshot}`);
    lines.push(`Screenshot file: ${run.finalObservation.screenshotFile}`);
    lines.push(`Visible text: ${run.finalObservation.visibleText}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderComparisonMarkdown(comparison) {
  if (!comparison || comparison.status === 'no-baseline') {
    return [
      '- No previous `latest.json` baseline was available for this run.',
      `- Current stop reason: ${comparison?.current?.stopReason ?? 'unknown'}`,
      `- Current findings: ${(comparison?.current?.findingIds ?? []).join(', ') || 'none'}`,
    ];
  }
  return [
    `- Status: ${comparison.status}`,
    `- Previous run: ${comparison.previous.runId} (${comparison.previous.stopReason ?? 'unknown'}, ${comparison.previous.steps ?? 0} steps)`,
    `- Current run: ${comparison.current.runId} (${comparison.current.stopReason ?? 'unknown'}, ${comparison.current.steps ?? 0} steps)`,
    `- Steps delta: ${comparison.behavior.stepsDelta}`,
    `- Resolved findings: ${comparison.findings.resolved.join(', ') || 'none'}`,
    `- Added findings: ${comparison.findings.added.join(', ') || 'none'}`,
    `- Persistent findings: ${comparison.findings.persistent.join(', ') || 'none'}`,
  ];
}

function formatActionState(state) {
  return state ? ` | state ${JSON.stringify(state)}` : '';
}

function formatKeyboardAction(action) {
  const alternates = action.alternateKeys?.length ? ` | alternate keys ${action.alternateKeys.join(', ')}` : '';
  const selector = action.selector ? ` | ${action.selector}` : '';
  return `${action.label} | ${action.key}${alternates}${selector} | ${action.actionHint}${formatActionState(action.state)}`;
}

function renderVisualLoopHtml(run) {
  const runJson = JSON.stringify(run);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Farm LLM Visual Loop</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #050505; color: #f5f5f5; }
      body { margin: 0; height: 100vh; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) 390px; }
      main { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; min-height: 0; height: 100vh; overflow: hidden; }
      img { width: 100%; height: 100%; object-fit: contain; background: #0b0b0b; }
      aside { height: 100vh; box-sizing: border-box; border-left: 1px solid rgba(255,255,255,.18); padding: 14px; overflow: auto; background: rgba(255,255,255,.05); }
      button { border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); color: inherit; padding: 6px 10px; border-radius: 4px; cursor: pointer; }
      button:hover, button.active { background: rgba(255,255,255,.2); }
      .strip { display: flex; gap: 6px; padding: 8px; border-top: 1px solid rgba(255,255,255,.16); overflow-x: auto; background: rgba(255,255,255,.04); }
      .meta { color: #c8c8c8; font-size: 12px; line-height: 1.45; }
      pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; background: rgba(255,255,255,.07); padding: 8px; border-radius: 4px; }
      li { margin: 8px 0; }
    </style>
  </head>
  <body>
    <main>
      <img id="frame" alt="Visual loop screenshot" />
      <div class="strip" id="strip"></div>
    </main>
    <aside>
      <h1>Visual Loop</h1>
      <p class="meta" id="frameMeta"></p>
      <h2>Decision</h2>
      <pre id="decision"></pre>
      <h2>Visible Text</h2>
      <pre id="visibleText"></pre>
      <h2>Actions</h2>
      <ul id="actions"></ul>
      <h2>Keyboard</h2>
      <ul id="keyboardActions"></ul>
      <h2>Findings</h2>
      <pre id="findings"></pre>
    </aside>
    <script>
      const run = ${runJson};
      const frames = [
        ...run.steps.map((step) => ({ kind: 'step', ...step })),
        { kind: 'final', observation: run.finalObservation, decision: { action: { kind: 'none' }, rationale: 'Final screenshot.' }, execution: { ok: true } },
      ].filter((frame) => frame.observation);
      let index = 0;
      const frame = document.getElementById('frame');
      const strip = document.getElementById('strip');
      const frameMeta = document.getElementById('frameMeta');
      const decision = document.getElementById('decision');
      const visibleText = document.getElementById('visibleText');
      const actions = document.getElementById('actions');
      const keyboardActions = document.getElementById('keyboardActions');
      const findings = document.getElementById('findings');
      findings.textContent = JSON.stringify(run.findings, null, 2);
      for (const [i, item] of frames.entries()) {
        const button = document.createElement('button');
        button.textContent = item.kind === 'final' ? 'final' : 'step ' + item.index;
        button.addEventListener('click', () => show(i));
        strip.append(button);
      }
      function show(next) {
        index = next;
        const item = frames[index];
        frame.src = item.observation.screenshot;
        frameMeta.textContent = item.observation.label + ' / ' + item.observation.screenshot;
        decision.textContent = JSON.stringify({ decision: item.decision, execution: item.execution }, null, 2);
        visibleText.textContent = item.observation.visibleText;
        actions.innerHTML = item.observation.availableActions.map((action) => '<li><strong>' + escapeHtml(action.label || action.selector) + '</strong><br /><span class="meta">' + escapeHtml(action.selector) + ' / ' + action.actionHint + escapeHtml(formatActionState(action.state)) + '</span></li>').join('');
        keyboardActions.innerHTML = (item.observation.keyboardActions || []).map((action) => '<li><strong>' + escapeHtml(action.label) + '</strong><br /><span class="meta">' + escapeHtml(action.key) + escapeHtml(action.alternateKeys?.length ? ' / ' + action.alternateKeys.join(', ') : '') + escapeHtml(action.selector ? ' / ' + action.selector : '') + ' / ' + escapeHtml(action.actionHint + formatActionState(action.state)) + '</span></li>').join('');
        [...strip.children].forEach((button, i) => button.classList.toggle('active', i === index));
      }
      function formatActionState(state) {
        return state ? ' / state ' + JSON.stringify(state) : '';
      }
      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
      }
      show(0);
    </script>
  </body>
</html>
`;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
