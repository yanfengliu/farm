import { readFile } from 'node:fs/promises';
import { assertImprovementFinding, improvementFindingToVisualPlaytestFinding, minimalImprovementFindingSchemaVersion } from 'civ-engine';
import { coverageGapFindingId, coverageLedger } from './coverage-report.mjs';
import { actionCountDelta, actionCounts, finalObservationEvidence, formatEvidence, hasActionableGuidance, jsonSafe, metricEvidence, nonEmptyString, nonNegativeInteger, slug, stableRunId, stepEvidence, textEvidence, withoutUndefined } from './report-support.mjs';
export const FARM_VISUAL_LOOP_OBJECTIVE = 'Play Farm like a real desktop player and find player-facing pain points.';
const SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);
const CATEGORIES = new Set(['visual', 'usability', 'rules', 'performance', 'accessibility', 'regression', 'bug', 'opportunity']);

export async function loadPreviousRunSummary(filePath) {
  try {
    const run = JSON.parse(await readFile(filePath, 'utf8'));
    return summarizeVisualLoopRun(run);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function createImprovementRunManifest(run) {
  return withoutUndefined({
    schemaVersion: 1,
    id: stableRunId(run),
    gameId: 'farm',
    objective: FARM_VISUAL_LOOP_OBJECTIVE,
    startedAt: run.generatedAt,
    completedAt: run.completedAt,
    sessionId: run.bundleSessionId ?? undefined,
    bundleId: run.bundleSessionId ?? undefined,
    tags: ['visual-loop', 'self-improvement', 'civ-engine'],
    data: withoutUndefined({
      url: run.url,
      mode: run.mode,
      decisionProvider: run.decisionProvider,
      maxSteps: run.summary?.maxSteps,
      steps: run.steps?.length,
      visualLoopOk: run.summary?.visualLoop?.ok,
      stopReason: run.summary?.visualLoop?.stopReason,
      traceEntries: run.summary?.visualLoop?.traceEntries,
    }),
  });
}

// Artifact-computed findings verify only after a strong replay self-check;
// vacuous/divergent replays and LLM-authored findings remain unverified.
export function strongReplayVerification(verification) {
  if (!verification || verification.ok !== true) return false;
  // Tolerate both shapes: the loop normalizes skippedSegments to a count,
  // but a raw engine SelfCheckResult carries an array.
  const skipped = Array.isArray(verification.skippedSegments)
    ? verification.skippedSegments.length
    : verification.skippedSegments ?? 0;
  return (verification.checkedSegments ?? 0) > 0 && skipped === 0;
}

// `screenshotCapture` is attached only to frames that needed a retry, so an
// absent field means a clean first attempt rather than a missing measurement.
export function degradedScreenshotFrames(run) {
  return [...(run.steps ?? []).map((step) => step?.observation), run.finalObservation]
    .filter((observation) => observation?.screenshotCapture?.degraded)
    .map((observation) => ({
      label: observation.label ?? `step-${observation.index}`,
      screenshot: observation.screenshot,
      attempts: observation.screenshotCapture.attempts,
      metrics: observation.screenshotCapture.metrics,
    }));
}

export function evaluateVisualLoop(run, options = {}) {
  const deterministic = deterministicStatusFields(run, options.verification);
  const findings = [];
  const consoleErrors = run.summary?.consoleErrors ?? [];
  const pageErrors = run.summary?.pageErrors ?? [];

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    findings.push(makeFinding(run, {
      id: 'browser-errors',
      severity: 'high',
      category: 'bug',
      title: 'Browser errors occurred during the visual loop',
      observed: [...consoleErrors, ...pageErrors].slice(0, 5).join('\n'),
      expected: 'The browser playtest should run without page errors or console errors.',
      suggestion: 'Fix the page or console error before trusting playtest findings.',
      area: 'browser runtime',
      evidence: [
        ...consoleErrors.map((message) => textEvidence('console error', message)),
        ...pageErrors.map((message) => textEvidence('page error', message)),
      ].slice(0, 8),
      ...deterministic,
      nextAction: 'autoFix',
      data: { source: 'farm.visual-loop' },
    }));
  }

  // A degraded frame means the compositor never settled and the least-corrupt
  // attempt was archived anyway. That frame is still in the packet, so the run
  // must say so rather than let a corrupt image pass review as ordinary proof.
  const degradedFrames = degradedScreenshotFrames(run);
  if (degradedFrames.length > 0) {
    findings.push(makeFinding(run, {
      id: 'screenshot-compositor-degraded',
      severity: 'medium',
      category: 'regression',
      title: 'Archived screenshots kept opaque black regions after repeated capture attempts',
      observed: degradedFrames
        .map((frame) => `${frame.label}: ${frame.attempts} attempts, black=${frame.metrics.exactBlackRatio.toFixed(4)}, `
          + `longest row=${frame.metrics.longestBlackRowRatio.toFixed(4)}, longest column=${frame.metrics.longestBlackColumnRatio.toFixed(4)}`)
        .slice(0, 5)
        .join('\n'),
      expected: 'Every archived proof frame should show the rendered farm, with no opaque black bands or tiles.',
      suggestion: 'Treat these screenshots as unreliable evidence and investigate the browser compositor before trusting visual findings from this run.',
      area: 'playtest evidence',
      evidence: degradedFrames.slice(0, 8).map((frame) => textEvidence('degraded screenshot', `${frame.label} (${frame.screenshot})`)),
      ...deterministic,
      nextAction: 'triage',
      data: { source: 'farm.visual-loop', class: 'screenshot-compositor-degraded', degradedFrames: degradedFrames.length },
    }));
  }

  if (run.summary?.visualLoop && !run.summary.visualLoop.ok) {
    findings.push(makeFinding(run, {
      id: 'visual-loop-engine-stop',
      severity: 'high',
      category: 'regression',
      title: `civ-engine visual playtest runner stopped with ${run.summary.visualLoop.stopReason}`,
      observed: JSON.stringify(run.summary.visualLoop.error ?? run.summary.visualLoop),
      expected: 'The shared civ-engine visual loop should complete without host, agent, or action failures.',
      suggestion: 'Fix the visual-loop host, action adapter, or decision provider before trusting playtest findings.',
      area: 'playtest harness',
      evidence: metricEvidence('visualLoop.stopReason', run.summary.visualLoop.stopReason),
      ...deterministic,
      nextAction: 'autoFix',
      data: { source: 'civ-engine.runVisualPlaytestLoop' },
    }));
  }

  for (const [index, engineFinding] of (run.engineFindings ?? []).entries()) {
    findings.push(makeFinding(run, improvementFindingFieldsFromEngineFinding(engineFinding, index)));
  }

  for (const step of run.steps ?? []) {
    if (!step.execution?.ok) {
      findings.push(makeFinding(run, {
        id: 'player-action-failed',
        severity: 'high',
        category: 'regression',
        title: `Player action failed at step ${step.index}`,
        observed: String(step.execution?.error ?? 'Unknown player action failure'),
        expected: 'Every action offered to the player-like agent should execute through a visible, stable control.',
        suggestion: 'Keep visible action selectors stable or adjust the loop action extraction.',
        area: 'player action adapter',
        evidence: stepEvidence(step, [
          textEvidence('action', JSON.stringify(step.decision?.action ?? null)),
          textEvidence('error', step.execution?.error ?? 'unknown'),
        ]),
        ...deterministic,
        nextAction: 'autoFix',
        data: { action: jsonSafe(step.decision?.action) },
      }));
      break;
    }
  }

  const repeatedWaits = (run.steps ?? []).filter((step) => step.decision?.action?.kind === 'wait').length;
  const clickCount = (run.steps ?? []).filter((step) => step.decision?.action?.kind === 'click').length;
  if (repeatedWaits >= 5 && clickCount <= 1) {
    findings.push(makeFinding(run, {
      id: 'visual-loop-low-agency',
      severity: 'medium',
      category: 'usability',
      title: 'The visual loop mostly waited instead of making choices',
      observed: `waits=${repeatedWaits}, clicks=${clickCount}`,
      expected: 'A player-like loop should find meaningful controls or guidance before mostly waiting.',
      suggestion: 'Expose clearer next-step controls or richer visible state so a player-like agent has something meaningful to do.',
      area: 'player guidance',
      evidence: [
        { kind: 'metric', label: 'waits', value: String(repeatedWaits) },
        { kind: 'metric', label: 'clicks', value: String(clickCount) },
      ],
      ...deterministic,
      nextAction: 'proposalOnly',
      data: { waits: repeatedWaits, clicks: clickCount },
    }));
  }

  const observationsWithoutActions = (run.steps ?? []).filter((step) => (
    (step.observation?.availableActions ?? []).length === 0
  ));
  if (observationsWithoutActions.length > 0) {
    findings.push(makeFinding(run, {
      id: 'no-visible-actions',
      severity: 'high',
      category: 'bug',
      title: 'A visual observation had no visible actions',
      observed: observationsWithoutActions.map((step) => `step ${step.index}: ${step.observation?.screenshot}`).join('\n'),
      expected: 'The playable screen should expose keyboard, button, or pointer actions after loading.',
      suggestion: 'Ensure the playable screen exposes reachable controls and keyboard actions after loading.',
      area: 'player controls',
      evidence: observationsWithoutActions.flatMap((step) => stepEvidence(step)).slice(0, 8),
      ...deterministic,
      nextAction: 'autoFix',
    }));
  }

  const finalVisibleText = run.finalObservation?.visibleText ?? '';
  const finalHasActionableGuidance = hasActionableGuidance(finalVisibleText);
  const lastDecision = run.steps?.at(-1)?.decision;
  if (lastDecision?.action?.kind === 'stop' && finalHasActionableGuidance) {
    findings.push(makeFinding(run, {
      id: 'visual-loop-stopped-with-guidance',
      severity: 'medium',
      category: 'usability',
      title: 'The visual loop stopped while final guidance was still actionable',
      observed: finalVisibleText,
      expected: 'The loop should stop only after an observation shows no actionable Farm Guide, HUD prompt, or visible restock/sell/tuning path. Tune mix, expand land, upgrade workers, or follow final guidance first.',
      suggestion: 'Teach the local visual player to follow the final visible guidance before trusting a clean stop.',
      area: 'local visual player',
      evidence: finalObservationEvidence(run),
      ...deterministic,
      nextAction: 'manualFix',
    }));
  }

  if ((run.steps?.length ?? 0) >= (run.summary?.maxSteps ?? Infinity) && finalHasActionableGuidance) {
    findings.push(makeFinding(run, {
      id: 'visual-loop-ended-with-guidance',
      severity: 'medium',
      category: 'usability',
      title: 'The visual loop hit its step cap while guidance was still actionable',
      observed: finalVisibleText,
      expected: 'The loop budget and heuristic should reach a watched state where visible guidance has been followed or consciously classified.',
      suggestion: 'Raise the run budget or teach the local visual player to follow the final visible guidance before trusting a zero-finding run.',
      area: 'local visual player',
      evidence: [
        { kind: 'metric', label: 'maxSteps', value: String(run.summary?.maxSteps) },
        ...finalObservationEvidence(run),
      ],
      ...deterministic,
      nextAction: 'manualFix',
    }));
  }

  // Curriculum signal: repeatedly-visible controls the run never exercised.
  // Low severity so real bugs always outrank them — the loop grows coverage
  // when it runs out of bugs. Capped per run, with the full gap count kept
  // in data so the cap is never a silent truncation.
  const coverage = coverageLedger(run.steps);
  for (const gap of coverage.gaps.slice(0, 3)) {
    findings.push(makeFinding(run, {
      id: coverageGapFindingId(gap.key),
      severity: 'low',
      category: 'opportunity',
      title: `Visible control never exercised: ${gap.label}`,
      observed: `"${gap.label}" (${gap.key}) was visible in ${gap.sightings} observations and never exercised this run.`,
      expected: 'Every repeatedly-visible player control is exercised by the local visual player or a rotation scenario.',
      suggestion: 'Teach the local visual player (or add a scenario) to reach this control, then keep it in the rotation.',
      area: 'coverage',
      evidence: [
        { kind: 'metric', label: `coverage.sightings ${gap.key}`, value: String(gap.sightings) },
        { kind: 'metric', label: 'coverage.gaps.total', value: String(coverage.gaps.length) },
      ],
      ...deterministic,
      nextAction: 'improveHarness',
      promotionTarget: 'scenario',
      data: { source: 'farm.coverage-report', class: `coverage-gap:${gap.key}`, gapsTotal: coverage.gaps.length },
    }));
  }

  return findings;
}

function improvementFindingFieldsFromEngineFinding(engineFinding, index) {
  const title = nonEmptyString(engineFinding?.title) ?? `civ-engine visual finding ${index + 1}`;
  const category = CATEGORIES.has(engineFinding?.category) ? engineFinding.category : 'usability';
  const severity = SEVERITIES.has(engineFinding?.severity) ? engineFinding.severity : 'medium';
  return {
    id: uniqueEngineFindingId(title, index),
    severity,
    category,
    title,
    observed: nonEmptyString(engineFinding?.observed) ?? title,
    expected: nonEmptyString(engineFinding?.expected),
    suggestion: nonEmptyString(engineFinding?.suggestion),
    area: nonEmptyString(engineFinding?.area) ?? 'civ-engine visual playtest',
    evidence: evidenceFromVisualFinding(engineFinding?.evidence),
    verificationStatus: 'unverified',
    nextAction: nextActionForEngineFinding(category, severity),
    refs: jsonSafe(engineFinding?.refs) ?? undefined,
    data: {
      source: 'civ-engine.visualPlaytestFinding',
      visualFinding: jsonSafe(engineFinding),
    },
  };
}

function uniqueEngineFindingId(title, index) {
  const suffix = slug(title) || `finding-${index + 1}`;
  return index === 0 ? `engine-${suffix}` : `engine-${suffix}-${index + 1}`;
}

function nextActionForEngineFinding(category, severity) {
  if (category === 'bug' || category === 'regression' || category === 'performance') return 'autoFix';
  if (category === 'rules' && (severity === 'high' || severity === 'critical')) return 'autoFix';
  if (category === 'visual' || category === 'opportunity') return 'proposalOnly';
  return 'manualFix';
}

function evidenceFromVisualFinding(evidence) {
  if (!evidence || typeof evidence !== 'object') return [];
  const step = nonNegativeInteger(evidence.step);
  const refs = [];
  const tick = nonNegativeInteger(evidence.tick);
  if (tick !== undefined) refs.push({ kind: 'tick', tick });
  if (step !== undefined) refs.push({ kind: 'step', step });
  if (typeof evidence.screenshotPath === 'string' && evidence.screenshotPath.length > 0) {
    refs.push(withoutUndefined({ kind: 'screenshot', step, screenshotPath: evidence.screenshotPath }));
  }
  const actionIndex = nonNegativeInteger(evidence.actionIndex);
  if (actionIndex !== undefined) {
    refs.push(withoutUndefined({ kind: 'trace', step, actionIndex }));
  }
  if (Array.isArray(evidence.stateLabels) && evidence.stateLabels.every((label) => typeof label === 'string')) {
    refs.push({
      kind: 'metric',
      label: 'stateLabels',
      value: evidence.stateLabels.join(', '),
      stateLabels: evidence.stateLabels,
    });
  }
  return refs;
}

export function visualFindingsFromImprovementFindings(findings) {
  return findings.map((finding) => improvementFindingToVisualPlaytestFinding(finding));
}

export function summarizeVisualLoopRun(run) {
  const findings = Array.isArray(run.findings) ? run.findings : [];
  const findingIds = findings.map((finding) => finding.id).filter(Boolean).sort();
  const coverageGapIds = coverageLedger(run.steps).gaps.map((gap) => coverageGapFindingId(gap.key));
  return {
    schemaVersion: 1,
    runId: run.improvementRun?.id ?? stableRunId(run),
    generatedAt: run.generatedAt,
    completedAt: run.completedAt,
    decisionProvider: run.decisionProvider,
    maxSteps: run.summary?.maxSteps,
    steps: run.summary?.visualLoop?.stepsRun ?? run.steps?.length ?? 0,
    recordedSteps: run.steps?.length ?? 0,
    ok: run.summary?.visualLoop?.ok ?? null,
    stopReason: run.summary?.visualLoop?.stopReason ?? null,
    actionCounts: actionCounts(run.steps ?? []),
    findingIds,
    openFindingIds: [...new Set([...findingIds, ...coverageGapIds])].sort(),
    findingClassifications: Object.fromEntries(findings
      .filter((finding) => finding.id)
      .map((finding) => [finding.id, withoutUndefined({
        severity: finding.severity,
        category: finding.category,
        nextAction: finding.nextAction,
        verificationStatus: finding.verificationStatus,
        disposition: finding.disposition,
      })])),
  };
}

export function compareVisualLoopRuns(previousRunSummary, currentRun) {
  const current = summarizeVisualLoopRun(currentRun);
  const currentOpenIds = current.openFindingIds ?? current.findingIds;
  if (!previousRunSummary) {
    return {
      schemaVersion: 1,
      status: 'no-baseline',
      current,
      findings: {
        resolved: [],
        added: currentOpenIds,
        persistent: [],
      },
      behavior: {
        stepsDelta: null,
        stopReasonChanged: false,
      },
    };
  }

  const previous = normalizeRunSummary(previousRunSummary);
  const previousIds = new Set(previous.openFindingIds ?? previous.findingIds);
  const currentIds = new Set(currentOpenIds);

  return {
    schemaVersion: 1,
    status: 'compared',
    previous,
    current,
    findings: {
      resolved: [...previousIds].filter((id) => !currentIds.has(id)).sort(),
      added: [...currentIds].filter((id) => !previousIds.has(id)).sort(),
      persistent: [...currentIds].filter((id) => previousIds.has(id)).sort(),
    },
    behavior: {
      stepsDelta: Number(current.steps ?? 0) - Number(previous.steps ?? 0),
      recordedStepsDelta: Number(current.recordedSteps ?? 0) - Number(previous.recordedSteps ?? 0),
      stopReasonChanged: previous.stopReason !== current.stopReason,
      okChanged: previous.ok !== current.ok,
      actionCountDelta: actionCountDelta(previous.actionCounts ?? {}, current.actionCounts ?? {}),
    },
  };
}

export function renderImprovementFindingsMarkdown(findings) {
  if (findings.length === 0) return ['- None'];
  const lines = [];
  for (const finding of findings) {
    lines.push(`- ${finding.severity.toUpperCase()} ${finding.id}: ${finding.title}`);
    lines.push(`  Classification: ${finding.nextAction}; ${finding.verificationStatus}; ${finding.disposition ?? 'candidate'}`);
    lines.push(`  Observed: ${finding.observed}`);
    if (finding.expected) lines.push(`  Expected: ${finding.expected}`);
    if (finding.suggestion) lines.push(`  Suggestion: ${finding.suggestion}`);
    if (finding.evidence?.length) lines.push(`  Evidence: ${finding.evidence.map(formatEvidence).join('; ')}`);
  }
  return lines;
}

function makeFinding(run, fields) {
  const finding = withoutUndefined({
    disposition: 'candidate',
    sourceRun: createImprovementRunManifest(run),
    ...fields,
    schemaVersion: minimalImprovementFindingSchemaVersion(fields.nextAction ?? 'proposalOnly'),
  });
  if (finding.verificationStatus === 'verified' && run.bundleSessionId) {
    finding.evidence = [
      ...(finding.evidence ?? []),
      { kind: 'bundle', bundleId: run.bundleSessionId, sessionId: run.bundleSessionId },
    ];
  }
  // Verified findings must carry addressed replayable evidence + a method —
  // the strict mode makes the verified-by-metric upgrade structurally honest.
  assertImprovementFinding(finding, {
    requireVerificationEvidence: finding.verificationStatus === 'verified',
  });
  return finding;
}

// Status fields for deterministic (artifact-computed) findings: verified by
// metric only when the replay self-check is strong AND the run exported a
// bundle to anchor the evidence; otherwise an honest 'unverified'.
function deterministicStatusFields(run, verification) {
  if (!strongReplayVerification(verification) || !run.bundleSessionId || run.replayCoverage?.partial !== false) {
    return { verificationStatus: 'unverified' };
  }
  return { verificationStatus: 'verified', verificationMethod: 'metric' };
}

function normalizeRunSummary(value) {
  if (Array.isArray(value.findingIds)) return value;
  return summarizeVisualLoopRun(value);
}

