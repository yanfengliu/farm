import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import {
  assertImprovementFinding,
  improvementFindingToVisualPlaytestFinding,
} from 'civ-engine';
import {
  compareVisualLoopRuns,
  createImprovementRunManifest,
  evaluateVisualLoop,
  summarizeVisualLoopRun,
  visualFindingsFromImprovementFindings,
} from '../../scripts/llm-visual-loop/improvement-report.mjs';

const baseStep = {
  index: 0,
  observation: {
    screenshot: 'steps/00-step-0.png',
    screenshotFile: 'C:/tmp/farm/steps/00-step-0.png',
    visibleText: 'Coins 10 Storage 0/15 Workers 1',
    availableActions: [{ label: 'Farm canvas', selector: 'canvas', actionHint: 'click-or-drag-canvas-coordinate' }],
    keyboardActions: [],
  },
  decision: {
    rationale: 'Watch the farm.',
    action: { kind: 'wait', ms: 250 },
    expectedResult: 'The farm should advance.',
  },
  execution: {
    ok: true,
    startedAt: '2026-07-07T00:00:00.000Z',
    completedAt: '2026-07-07T00:00:00.250Z',
  },
};

function makeRun(overrides = {}) {
  return {
    generatedAt: '2026-07-07T00:00:00.000Z',
    completedAt: '2026-07-07T00:00:05.000Z',
    url: 'http://127.0.0.1:5175/',
    mode: 'step-by-step-visual-loop',
    decisionProvider: 'local-heuristic',
    actionBoundary: 'player actions only',
    summary: {
      consoleErrors: [],
      pageErrors: [],
      maxSteps: 4,
      visualLoop: {
        ok: true,
        stopReason: 'agentStop',
        stepsRun: 2,
        traceEntries: 2,
        engineFindings: 0,
      },
    },
    steps: [baseStep],
    finalObservation: {
      screenshot: 'steps/final.png',
      screenshotFile: 'C:/tmp/farm/steps/final.png',
      visibleText: 'Coins 10 Storage 0/15 Workers 1',
      availableActions: [],
      keyboardActions: [],
    },
    ...overrides,
  };
}

describe('LLM visual loop improvement contracts', () => {
  test('records visual loop findings as civ-engine improvement findings', () => {
    const run = makeRun({
      summary: {
        consoleErrors: ['Uncaught TypeError: broken HUD'],
        pageErrors: [],
        maxSteps: 4,
        visualLoop: {
          ok: true,
          stopReason: 'agentStop',
          stepsRun: 2,
          traceEntries: 2,
          engineFindings: 0,
        },
      },
    });

    const findings = evaluateVisualLoop(run);

    expect(findings.map((finding) => finding.id)).toContain('browser-errors');
    for (const finding of findings) {
      expect(() => assertImprovementFinding(finding)).not.toThrow();
      expect(finding.sourceRun).toMatchObject({
        schemaVersion: 1,
        gameId: 'farm',
        objective: 'Play Farm like a real desktop player and find player-facing pain points.',
      });
    }
    expect(findings[0]).toMatchObject({
      schemaVersion: 1,
      severity: 'high',
      category: 'bug',
      // Findings author as claims; only strong replay verification upgrades them.
      verificationStatus: 'unverified',
      nextAction: 'autoFix',
      disposition: 'candidate',
    });
    expect(improvementFindingToVisualPlaytestFinding(findings[0]).data).toMatchObject({
      improvementLoop: {
        schemaVersion: 1,
        type: 'finding',
        finding: {
          id: findings[0].id,
          nextAction: findings[0].nextAction,
        },
      },
    });
  });

  test('classifies fixable bugs separately from proposal-only playability gaps', () => {
    const findings = evaluateVisualLoop(makeRun({
      steps: [
        baseStep,
        { ...baseStep, index: 1, decision: { ...baseStep.decision, action: { kind: 'wait', ms: 250 } } },
        { ...baseStep, index: 2, decision: { ...baseStep.decision, action: { kind: 'wait', ms: 250 } } },
        { ...baseStep, index: 3, decision: { ...baseStep.decision, action: { kind: 'wait', ms: 250 } } },
        { ...baseStep, index: 4, decision: { ...baseStep.decision, action: { kind: 'wait', ms: 250 } } },
      ],
      finalObservation: {
        screenshot: 'steps/final.png',
        screenshotFile: 'C:/tmp/farm/steps/final.png',
        visibleText: 'FARM GUIDE Paint Empty Land Do Select Plot',
        availableActions: [],
        keyboardActions: [],
      },
    }));

    const byId = new Map(findings.map((finding) => [finding.id, finding]));

    expect(byId.get('visual-loop-low-agency')).toMatchObject({
      category: 'usability',
      nextAction: 'proposalOnly',
      verificationStatus: 'unverified',
    });
    expect(byId.get('visual-loop-ended-with-guidance')).toMatchObject({
      category: 'usability',
      nextAction: 'manualFix',
      verificationStatus: 'unverified',
    });
  });

  test('does not report a capped active village basket as a clean run', () => {
    const steps = Array.from({ length: 4 }, (_, index) => ({ ...baseStep, index }));
    const findings = evaluateVisualLoop(makeRun({
      steps,
      finalObservation: {
        screenshot: 'steps/final.png',
        screenshotFile: 'C:/tmp/farm/steps/final.png',
        visibleText: 'Active basket Harvest the missing crops, then return here.',
        availableActions: [],
        keyboardActions: [],
      },
    }));

    expect(findings.find((finding) => finding.id === 'visual-loop-ended-with-guidance')).toMatchObject({
      nextAction: 'manualFix',
      verificationStatus: 'unverified',
    });
  });

  test('flips deterministic findings to verified-by-metric only under strong replay verification', () => {
    const run = makeRun({
      bundleSessionId: 'farm-session-1',
      summary: {
        consoleErrors: ['Uncaught TypeError: broken HUD'],
        pageErrors: [],
        maxSteps: 4,
        visualLoop: { ok: true, stopReason: 'agentStop', stepsRun: 2, traceEntries: 2, engineFindings: 0 },
      },
    });

    const strong = evaluateVisualLoop(run, {
      // Raw engine shape: skippedSegments is an ARRAY of skipped segments.
      verification: { ok: true, checkedSegments: 2, skippedSegments: [] },
    });
    const browserErrors = strong.find((finding) => finding.id === 'browser-errors');
    expect(browserErrors).toMatchObject({
      verificationStatus: 'verified',
      verificationMethod: 'metric',
    });
    expect(browserErrors.evidence.some(
      (ref) => ref.kind === 'bundle' && ref.bundleId === 'farm-session-1',
    )).toBe(true);
    expect(() => assertImprovementFinding(browserErrors, { requireVerificationEvidence: true })).not.toThrow();

    const vacuous = evaluateVisualLoop(run, {
      verification: { ok: true, checkedSegments: 0, skippedSegments: [] },
    });
    expect(vacuous.find((finding) => finding.id === 'browser-errors').verificationStatus).toBe('unverified');

    const partiallySkipped = evaluateVisualLoop(run, {
      verification: { ok: true, checkedSegments: 2, skippedSegments: [{ fromTick: 0, toTick: 5 }] },
    });
    expect(partiallySkipped.find((finding) => finding.id === 'browser-errors').verificationStatus).toBe('unverified');

    const normalizedCount = evaluateVisualLoop(run, {
      // The loop's boundary normalization hands the report a count.
      verification: { ok: true, checkedSegments: 2, skippedSegments: 0 },
    });
    expect(normalizedCount.find((finding) => finding.id === 'browser-errors').verificationStatus).toBe('verified');

    const divergent = evaluateVisualLoop(run, {
      verification: { ok: false, checkedSegments: 2, skippedSegments: [] },
    });
    expect(divergent.find((finding) => finding.id === 'browser-errors').verificationStatus).toBe('unverified');
  });

  test('creates a run manifest and visual-finding bridge from improvement findings', () => {
    const run = makeRun();
    const manifest = createImprovementRunManifest(run);
    const findings = evaluateVisualLoop(makeRun({
      summary: {
        consoleErrors: [],
        pageErrors: [],
        maxSteps: 4,
        visualLoop: {
          ok: false,
          stopReason: 'actionFailed',
          stepsRun: 1,
          traceEntries: 1,
          engineFindings: 0,
          error: { name: 'Error', message: 'selector disappeared', stack: null },
        },
      },
    }));
    const visualFindings = visualFindingsFromImprovementFindings(findings);

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      gameId: 'farm',
      startedAt: '2026-07-07T00:00:00.000Z',
      completedAt: '2026-07-07T00:00:05.000Z',
      tags: ['visual-loop', 'self-improvement', 'civ-engine'],
    });
    expect(visualFindings[0]).toMatchObject({
      title: findings[0].title,
      severity: findings[0].severity,
      category: findings[0].category,
      data: {
        improvementLoop: {
          type: 'finding',
        },
      },
    });
  });

  test('preserves civ-engine visual findings as standardized improvement findings', () => {
    const findings = evaluateVisualLoop(makeRun({
      engineFindings: [
        {
          title: 'Crop Mix row lacks keyboard hint',
          severity: 'medium',
          category: 'accessibility',
          observed: 'The row can be adjusted but the screenshot does not expose the keyboard path.',
          expected: 'Keyboard-adjustable controls should make the available key path discoverable.',
          suggestion: 'Show the focused-control keyboard hint near the Crop Mix row.',
          evidence: { step: 2, screenshotPath: 'steps/02-step-2.png' },
        },
      ],
    }));

    const engineFinding = findings.find((finding) => finding.id === 'engine-crop-mix-row-lacks-keyboard-hint');

    expect(engineFinding).toBeTruthy();
    expect(() => assertImprovementFinding(engineFinding)).not.toThrow();
    expect(engineFinding).toMatchObject({
      severity: 'medium',
      category: 'accessibility',
      nextAction: 'manualFix',
      // LLM-authored observations are claims — never auto-verified, even
      // when the run's replay verification is strong.
      verificationStatus: 'unverified',
      evidence: [
        { kind: 'step', step: 2 },
        { kind: 'screenshot', step: 2, screenshotPath: 'steps/02-step-2.png' },
      ],
      data: {
        source: 'civ-engine.visualPlaytestFinding',
      },
    });
  });

  test('compares reruns so before-after behavior is explicit', () => {
    const previous = {
      ...summarizeVisualLoopRun(makeRun({
        completedAt: '2026-07-07T00:00:04.000Z',
        findings: [
          { id: 'browser-errors', severity: 'high', nextAction: 'autoFix' },
          { id: 'visual-loop-ended-with-guidance', severity: 'medium', nextAction: 'manualFix' },
        ],
      })),
      runId: 'previous-run',
    };
    const currentRun = makeRun({
      completedAt: '2026-07-07T00:05:00.000Z',
      summary: {
        consoleErrors: [],
        pageErrors: [],
        maxSteps: 4,
        visualLoop: {
          ok: true,
          stopReason: 'maxSteps',
          stepsRun: 4,
          traceEntries: 4,
          engineFindings: 0,
        },
      },
      findings: [
        { id: 'visual-loop-ended-with-guidance', severity: 'medium', nextAction: 'manualFix' },
        { id: 'visual-loop-low-agency', severity: 'medium', nextAction: 'proposalOnly' },
      ],
    });

    const comparison = compareVisualLoopRuns(previous, currentRun);

    expect(comparison.status).toBe('compared');
    expect(comparison.previous.runId).toBe('previous-run');
    expect(comparison.current.stopReason).toBe('maxSteps');
    expect(comparison.findings).toMatchObject({
      resolved: ['browser-errors'],
      added: ['visual-loop-low-agency'],
      persistent: ['visual-loop-ended-with-guidance'],
    });
    expect(comparison.behavior.stepsDelta).toBe(2);
  });

  test('visual loop script wires the shared improvement report into latest.json', async () => {
    const source = await readFile('scripts/llm-visual-loop.mjs', 'utf8');

    expect(source).toContain("from './llm-visual-loop/improvement-report.mjs'");
    expect(source).toContain('const previousRunSummary = await loadPreviousRunSummary');
    expect(source).toContain('run.engineFindings = visualLoopResult.findings');
    expect(source).toContain('run.improvementRun = createImprovementRunManifest(run)');
    expect(source).toContain('run.visualFindings = visualFindingsFromImprovementFindings(run.findings)');
    expect(source).toContain('run.comparison = compareVisualLoopRuns(previousRunSummary, run)');
    // Replayable evidence + honest verification + append-only history wiring.
    expect(source).toContain('exportBundle');
    expect(source).toContain('latest.bundle.json');
    expect(source).toContain('run.findings = evaluateVisualLoop(run, { verification })');
    expect(source).toContain('llm-visual-loop-history');
    expect(source).toContain('ledger.jsonl');
    expect(source).not.toContain('fs.rm(outputDir');
  });
});
