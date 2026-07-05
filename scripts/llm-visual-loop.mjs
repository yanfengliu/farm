import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hasVisibleSellableCrops } from './llm-visual-loop/visible-state.mjs';

const cwd = process.cwd();
const outputDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop');
const screenshotDir = path.join(outputDir, 'steps');
const maxSteps = boundedNumber(process.env.FARM_VISUAL_LOOP_STEPS, 18, 1, 40);
const defaultWaitMs = boundedNumber(process.env.FARM_VISUAL_LOOP_WAIT_MS, 4000, 250, 15000);
const settleMs = boundedNumber(process.env.FARM_VISUAL_LOOP_SETTLE_MS, 350, 0, 3000);
const providerCommand = process.env.FARM_LLM_VISUAL_LOOP_COMMAND?.trim() ?? '';

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  root: cwd,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});

const consoleErrors = [];
const pageErrors = [];
let browser;

try {
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.clear();
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
    actionBoundary: 'Each decision receives screenshot path, visible text, and visible controls; execution is limited to click, drag, adjust, wheel, press, wait, viewport, or stop.',
    summary: {
      consoleErrors,
      pageErrors,
      maxSteps,
      defaultWaitMs,
    },
    steps: [],
    finalObservation: null,
    findings: [],
  };

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const observation = await captureVisualObservation(page, stepIndex, `step-${stepIndex}`);
    const decision = await chooseVisualLoopAction({
      observation,
      history: run.steps,
      defaultWaitMs,
      providerCommand,
    });
    const execution = await executePlayerDecision(page, decision);

    run.steps.push({
      index: stepIndex,
      observation,
      decision,
      execution,
    });

    if (!execution.ok || decision.action.kind === 'stop') break;
    if (settleMs > 0) await page.waitForTimeout(settleMs);
  }

  run.finalObservation = await captureVisualObservation(page, run.steps.length, 'final');
  run.findings = evaluateVisualLoop(run);
  const report = renderVisualLoopMarkdown(run);

  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(run, null, 2)}\n`);
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
  await server.close();
}

async function captureVisualObservation(page, stepIndex, label) {
  const screenshotName = `${String(stepIndex).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: path.join(screenshotDir, screenshotName), fullPage: false });

  return page.evaluate(({ observationIndex, observationLabel, screenshotPath }) => {
    const visibleText = compactText(document.body.innerText ?? '');
    const availableActions = Array.from(document.querySelectorAll('button, input[type="range"], [role="button"], [role="separator"], canvas'))
      .filter((element) => isVisible(element) && !element.disabled)
      .slice(0, 60)
      .map((element) => ({
        label: actionLabelFor(element),
        selector: playerSelectorFor(element),
        tagName: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || undefined,
        actionHint: actionHintFor(element),
        bounds: roundedBounds(element.getBoundingClientRect()),
      }));

    return {
      index: observationIndex,
      label: observationLabel,
      screenshot: screenshotPath,
      visibleText,
      availableActions,
      prompt: buildDecisionPrompt({ screenshotPath, visibleText, availableActions }),
    };

    function buildDecisionPrompt(observation) {
      return [
        'You are playtesting a desktop idle farming game as a real player.',
        'Use the screenshot and visible controls only. Pick one action from the schema: click, drag, adjust, wheel, press, wait, viewport, or stop. Click actions may include x/y coordinates relative to the chosen element.',
        JSON.stringify(observation, null, 2),
      ].join('\n\n');
    }

    function actionHintFor(element) {
      if (element.matches('canvas')) return 'click-canvas-coordinate';
      if (element.matches('[role="separator"]')) return 'drag-resize';
      if (element.matches('input[type="range"]')) return 'adjust';
      return 'click';
    }

    function actionLabelFor(element) {
      return compactText(
        element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.textContent ||
        element.tagName.toLowerCase(),
      );
    }

    function compactText(value) {
      return value.replace(/\s+/g, ' ').trim().slice(0, 2400);
    }

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
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
    screenshotPath: path.join('steps', screenshotName).replaceAll('\\', '/'),
  });
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
  const clickedSelectors = new Set(actionHistory.filter((action) => action.kind === 'click').map((action) => action.selector));
  const waitCount = actionHistory.filter((action) => action.kind === 'wait').length;
  const canvasClickCount = actionHistory.filter((action) => action.kind === 'click' && action.selector === 'canvas').length;
  const pannedCamera = actionHistory.some((action) => action.kind === 'press' && action.key === 'ArrowRight');
  const zoomedCamera = actionHistory.some((action) => action.kind === 'wheel');
  const claimedTier = actionHistory.some((action) => action.kind === 'click' && action.selector === '[data-command="claim-tier"]');
  const waitsAfterClaim = claimedTier
    ? actionHistory.slice(actionHistory.findIndex((action) => action.kind === 'click' && action.selector === '[data-command="claim-tier"]') + 1)
      .filter((action) => action.kind === 'wait').length
    : 0;
  const canvasAction = findAction(observation, 'canvas');

  const claimAction = findAction(observation, '[data-command="claim-tier"]');
  if (claimAction) {
    return clickDecision(claimAction, 'A visible tier reward is ready, so claim it before watching the farm continue.');
  }

  const seedAction = findSeedAction(observation);
  if (seedAction && /Buy seeds|Buy .* seeds|Farmers Waiting/i.test(observation.visibleText)) {
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

  const tutorialAction = tutorialActionFromText(observation);
  if (tutorialAction && !recentlyClicked(actionHistory, tutorialAction.selector)) {
    return clickDecision(tutorialAction, `Follow the visible tutorial prompt: ${tutorialAction.label}.`);
  }

  const upgradeAction = findUpgradeAction(observation);
  if (upgradeAction && !clickedSelectors.has(upgradeAction.selector) && /Tool Upgrades|Worker Boots/i.test(observation.visibleText)) {
    return clickDecision(upgradeAction, 'Buy the visible worker upgrade so the playtest exercises progression beyond selling and tier claims.');
  }

  const sellAllAction = findAction(observation, '[data-command="sell-all"]');
  if (sellAllAction && hasVisibleSellableCrops(observation.visibleText)) {
    return clickDecision(sellAllAction, 'The visible inventory shows crops ready to sell, so sell them before waiting again.');
  }

  if (canvasAction && canvasClickCount < 2 && /TOOL Plot|Paint plots|Select Plot/i.test(observation.visibleText)) {
    return clickDecision(
      canvasAction,
      'The selected plot tool needs a field click, so click an open farm tile visible on the canvas.',
      { x: 410, y: 290 },
    );
  }

  const goalsAction = findAction(observation, '[data-panel="goals"]');
  if (goalsAction && !clickedSelectors.has(goalsAction.selector)) {
    return clickDecision(goalsAction, 'Open the visible Goals panel because progression and tier rewards should be understandable there.');
  }

  if (claimedTier && waitsAfterClaim >= 2) {
    return {
      rationale: 'The loop already claimed a tier and watched the post-claim farm for two intervals.',
      action: { kind: 'stop' },
      expectedResult: 'End with a final screenshot for review.',
    };
  }

  if (waitCount >= 7) {
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

function tutorialActionFromText(observation) {
  const text = observation.visibleText;
  if (/NEXT CLICK Select Plot/i.test(text)) return findAction(observation, '[data-tool="plot"]');
  if (/NEXT CLICK Open Inventory/i.test(text)) return findAction(observation, '[data-panel="inventory"]');
  if (/NEXT CLICK Open Goals/i.test(text)) return findAction(observation, '[data-panel="goals"]');
  if (/NEXT CLICK Tune Crop Mix/i.test(text)) return findAction(observation, '[data-panel="mix"]');
  if (/NEXT CLICK Buy seeds/i.test(text)) return findSeedAction(observation);
  if (/NEXT CLICK Claim/i.test(text)) return findAction(observation, '[data-command="claim-tier"]');
  return null;
}

function recentlyClicked(actionHistory, selector) {
  return actionHistory.slice(-2).some((action) => action.kind === 'click' && action.selector === selector);
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

function pressDecision(key, rationale, durationMs = 0) {
  return {
    rationale,
    action: {
      kind: 'press',
      key,
      durationMs,
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
    expectedResult: 'The farm camera should zoom while the HUD, toolbar, and side panel stay readable.',
  };
}

function findAction(observation, selector) {
  return observation.availableActions.find((action) => action.selector === selector || action.selector.startsWith(selector));
}

function findSeedAction(observation) {
  return (
    findAction(observation, '[data-seed-guidance-action]') ||
    findAction(observation, '[data-buy-seeds') ||
    observation.availableActions.find((action) => /buy .*seeds/i.test(action.label))
  );
}

function findUpgradeAction(observation) {
  return (
    findAction(observation, '[data-buy-upgrade="boots"]') ||
    observation.availableActions.find((action) => /buy worker boots/i.test(action.label))
  );
}

async function chooseWithExternalProvider(command, payload) {
  const result = await runJsonCommand(command, {
    schema: {
      rationale: 'short explanation',
      action: {
        kind: 'click | drag | adjust | wheel | press | wait | viewport | stop',
        selector: 'required for click, drag, adjust, and wheel',
        x: 'optional x coordinate relative to the clicked element',
        y: 'optional y coordinate relative to the clicked element',
        deltaX: 'optional horizontal drag distance in pixels',
        deltaY: 'optional vertical drag or wheel distance in pixels',
        value: 'optional adjustment target from 0 to 100 for range controls',
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
  const kind = ['click', 'drag', 'adjust', 'wheel', 'press', 'wait', 'viewport', 'stop'].includes(action.kind) ? action.kind : 'wait';
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
  } else if (kind === 'drag') {
    const visibleAction = observation.availableActions.find((candidate) => candidate.selector === action.selector);
    if (!visibleAction) return fallback;
    normalized.action.selector = visibleAction.selector;
    normalized.action.label = visibleAction.label;
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
    normalized.action.key = String(action.key || 'Escape');
    normalized.action.durationMs = boundedNumber(action.durationMs, 0, 0, 1500);
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
    } else if (decision.action.kind === 'drag') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Cannot drag ${decision.action.selector}; no visible bounds`);
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + decision.action.deltaX, startY + decision.action.deltaY, { steps: 8 });
      await page.mouse.up();
    } else if (decision.action.kind === 'adjust') {
      const locator = page.locator(decision.action.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
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

function evaluateVisualLoop(run) {
  const findings = [];
  if (run.summary.consoleErrors.length > 0 || run.summary.pageErrors.length > 0) {
    findings.push({
      id: 'browser-errors',
      severity: 'high',
      title: 'Browser errors occurred during the visual loop',
      evidence: [...run.summary.consoleErrors, ...run.summary.pageErrors].slice(0, 5),
      recommendation: 'Fix the page or console error before trusting playtest findings.',
    });
  }

  for (const step of run.steps) {
    if (!step.execution.ok) {
      findings.push({
        id: 'player-action-failed',
        severity: 'high',
        title: `Player action failed at step ${step.index}`,
        evidence: [step.decision.action, step.execution.error],
        recommendation: 'Keep visible action selectors stable or adjust the loop action extraction.',
      });
      break;
    }
  }

  const repeatedWaits = run.steps.filter((step) => step.decision.action.kind === 'wait').length;
  const clickCount = run.steps.filter((step) => step.decision.action.kind === 'click').length;
  if (repeatedWaits >= 5 && clickCount <= 1) {
    findings.push({
      id: 'visual-loop-low-agency',
      severity: 'medium',
      title: 'The visual loop mostly waited instead of making choices',
      evidence: [`waits=${repeatedWaits}`, `clicks=${clickCount}`],
      recommendation: 'Expose clearer next-step controls or richer visible state so a player-like agent has something meaningful to do.',
    });
  }

  const observationsWithoutActions = run.steps.filter((step) => step.observation.availableActions.length === 0);
  if (observationsWithoutActions.length > 0) {
    findings.push({
      id: 'no-visible-actions',
      severity: 'high',
      title: 'A visual observation had no visible actions',
      evidence: observationsWithoutActions.map((step) => `step ${step.index}: ${step.observation.screenshot}`),
      recommendation: 'Ensure the playable screen exposes keyboard, button, or pointer actions after loading.',
    });
  }

  return findings;
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

  if (run.findings.length === 0) {
    lines.push('- None');
  } else {
    for (const finding of run.findings) {
      lines.push(`- ${finding.severity.toUpperCase()} ${finding.id}: ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence.map((item) => JSON.stringify(item)).join('; ')}`);
      lines.push(`  Recommendation: ${finding.recommendation}`);
    }
  }

  lines.push('');
  lines.push('## Steps');
  lines.push('');

  for (const step of run.steps) {
    lines.push(`### Step ${step.index}`);
    lines.push('');
    lines.push(`Screenshot: ${step.observation.screenshot}`);
    lines.push(`Visible text: ${step.observation.visibleText}`);
    lines.push(`Decision: ${step.decision.action.kind} - ${step.decision.rationale}`);
    lines.push(`Expected result: ${step.decision.expectedResult}`);
    lines.push(`Execution: ${step.execution.ok ? 'ok' : `failed - ${step.execution.error}`}`);
    lines.push('');
    lines.push('Available actions:');
    for (const action of step.observation.availableActions.slice(0, 18)) {
      lines.push(`- ${action.label || action.selector} | ${action.selector} | ${action.actionHint} | ${JSON.stringify(action.bounds)}`);
    }
    lines.push('');
  }

  if (run.finalObservation) {
    lines.push('## Final Observation');
    lines.push('');
    lines.push(`Screenshot: ${run.finalObservation.screenshot}`);
    lines.push(`Visible text: ${run.finalObservation.visibleText}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
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
      body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 390px; }
      main { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; }
      img { width: 100%; height: 100%; object-fit: contain; background: #0b0b0b; }
      aside { border-left: 1px solid rgba(255,255,255,.18); padding: 14px; overflow: auto; background: rgba(255,255,255,.05); }
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
        actions.innerHTML = item.observation.availableActions.map((action) => '<li><strong>' + escapeHtml(action.label || action.selector) + '</strong><br /><span class="meta">' + escapeHtml(action.selector) + ' / ' + action.actionHint + '</span></li>').join('');
        [...strip.children].forEach((button, i) => button.classList.toggle('active', i === index));
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
