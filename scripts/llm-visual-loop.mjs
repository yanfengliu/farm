import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildVisualPlaytestPrompt, runVisualPlaytestLoop, SessionReplayer } from 'civ-engine';
import {
  farmDecisionToVisualAction,
  farmExecutionResultToVisualActionResult,
  toVisualPlaytestObservation,
  visualActionToFarmDecision,
} from './llm-visual-loop/action-adapter.mjs';
import { captureVisualObservation } from './llm-visual-loop/browser-observation.mjs';
import {
  compareVisualLoopRuns,
  createImprovementRunManifest,
  evaluateVisualLoop,
  loadPreviousRunSummary,
  visualFindingsFromImprovementFindings,
} from './llm-visual-loop/improvement-report.mjs';
import { chooseVisualLoopAction, executePlayerDecision } from './llm-visual-loop/player-provider.mjs';
import { renderVisualLoopHtml, renderVisualLoopMarkdown } from './llm-visual-loop/report-renderers.mjs';

const cwd = process.cwd();
const outputDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop');
const screenshotDir = path.join(outputDir, 'steps');
const preferredFarmUrl = 'http://127.0.0.1:5175/';
const configuredPlaytestUrl = process.env.FARM_PLAYTEST_URL?.trim() ?? '';
const PLAYER_ACTION_SELECTOR = 'button, input[type="range"], input[type="number"], [role="button"], [role="separator"], [data-player-scroll], canvas';
const maxSteps = boundedNumber(process.env.FARM_VISUAL_LOOP_STEPS, 80, 1, 120);
const defaultWaitMs = boundedNumber(process.env.FARM_VISUAL_LOOP_WAIT_MS, 4000, 250, 15000);
const settleMs = boundedNumber(process.env.FARM_VISUAL_LOOP_SETTLE_MS, 350, 0, 3000);
const providerCommand = process.env.FARM_LLM_VISUAL_LOOP_COMMAND?.trim() ?? '';
const historyDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop-history');
const ledgerPath = path.join(historyDir, 'ledger.jsonl');
const latestRunPath = path.join(outputDir, 'latest.json');
const previousRunSummary = await loadPreviousRunSummary(latestRunPath);
const observationOptions = { cwd, screenshotDir, playerActionSelector: PLAYER_ACTION_SELECTOR };

// Append-only history: archive the previous run instead of destroying it, so
// cross-run comparisons and audits have more than a single run of memory.
await archivePreviousRun(outputDir, historyDir);
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
    summary: { consoleErrors, pageErrors, maxSteps, defaultWaitMs, visualLoop: null },
    steps: [],
    finalObservation: null,
    findings: [],
  };

  const observationsByStep = new Map();
  const visualPlaytestHost = {
    async observe({ step }) {
      const observation = await captureVisualObservation(page, step, `step-${step}`, observationOptions);
      observationsByStep.set(step, observation);
      return toVisualPlaytestObservation(observation);
    },
    async performAction(action, context) {
      const observation = observationsByStep.get(context.step);
      const decision = visualActionToFarmDecision(action, defaultWaitMs);
      const execution = await executePlayerDecision(page, decision);
      run.steps.push({ index: context.step, observation, decision, engineAction: action, execution });
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
        observation: { ...observation, prompt: `${prompt}\n\nFarm action schema and full visible action packet:\n\n${observation.prompt}` },
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
          execution: { ok: true, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        });
      }
      return { rationale: decision.rationale, action, stopReason: decision.action.kind === 'stop' ? decision.rationale : undefined };
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
  run.finalObservation = await captureVisualObservation(page, run.steps.length, 'final', observationOptions);
  run.completedAt = new Date().toISOString();

  // Export replay evidence only after the visible loop, then mechanically
  // self-check it before any deterministic finding can be marked verified.
  const bundle = await page.evaluate(() => window.__farmDebug?.exportBundle?.() ?? null);
  const bundlePath = path.join(outputDir, 'latest.bundle.json');
  let verification = null;
  if (bundle) {
    await fs.writeFile(bundlePath, `${JSON.stringify(bundle)}\n`);
    run.bundleSessionId = bundle.metadata?.sessionId ?? null;
    run.bundlePath = path.relative(cwd, bundlePath);
    verification = await verifyBundleWithReplaySelfCheck(bundle, server);
    run.summary.replayVerification = verification;
  }

  run.improvementRun = createImprovementRunManifest(run);
  run.findings = evaluateVisualLoop(run, { verification });
  run.visualFindings = visualFindingsFromImprovementFindings(run.findings);
  run.comparison = compareVisualLoopRuns(previousRunSummary, run);
  const report = renderVisualLoopMarkdown(run);
  await fs.writeFile(latestRunPath, `${JSON.stringify(run, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), report);
  await fs.writeFile(path.join(outputDir, 'latest.html'), renderVisualLoopHtml(run));
  await appendLedgerEntry(ledgerPath, run.improvementRun);

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

async function archivePreviousRun(runDir, archiveRoot) {
  try {
    await fs.access(runDir);
  } catch {
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = path.join(archiveRoot, stamp);
  await fs.mkdir(archiveRoot, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.rename(runDir, archiveDir);
      return;
    } catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    }
  }
  try {
    await fs.mkdir(archiveDir, { recursive: true });
    for (const entry of await fs.readdir(runDir)) await fs.rename(path.join(runDir, entry), path.join(archiveDir, entry));
    await fs.rm(runDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[visual-loop] could not archive previous run (${error?.message ?? error}); continuing in place`);
  }
}

async function appendLedgerEntry(filePath, improvementRun) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(improvementRun)}\n`);
}

async function verifyBundleWithReplaySelfCheck(bundle, viteServer) {
  if (!viteServer) return null;
  try {
    const farmGameModule = await viteServer.ssrLoadModule('/src/game/simulation/farmGame.ts');
    const replayer = SessionReplayer.fromBundle(bundle, {
      worldFactory: (snapshot) => {
        const game = farmGameModule.createFarmGame({ seed: snapshot?.config?.seed ?? 'farm' });
        game.applySnapshot(snapshot);
        return game;
      },
    });
    const selfCheck = replayer.selfCheck({ stopOnFirstDivergence: true });
    return {
      ok: selfCheck.ok,
      checkedSegments: selfCheck.checkedSegments,
      skippedSegments: selfCheck.skippedSegments?.length ?? 0,
      stateDivergences: selfCheck.stateDivergences?.length ?? 0,
      eventDivergences: selfCheck.eventDivergences?.length ?? 0,
      executionDivergences: selfCheck.executionDivergences?.length ?? 0,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
