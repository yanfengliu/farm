import { describe, expect, test } from 'vitest';
import { assertImprovementFinding } from 'civ-engine';
import { coverageLedger, COVERAGE_MIN_SIGHTINGS } from '../../scripts/llm-visual-loop/coverage-report.mjs';
import { evaluateVisualLoop } from '../../scripts/llm-visual-loop/improvement-report.mjs';
import { selectFixCandidate } from '../../scripts/llm-visual-loop/recursive-pass.mjs';

function control(selector, label = selector) {
  return { label, selector, tagName: 'button', actionHint: 'click', bounds: { x: 0, y: 0, width: 10, height: 10 } };
}

function step(index, availableActions, decisionAction) {
  return {
    index,
    observation: { availableActions, visibleText: '' },
    decision: decisionAction ? { action: decisionAction } : { action: { kind: 'wait' } },
    execution: { ok: true },
  };
}

function baseRun(steps) {
  return {
    generatedAt: '2026-07-09T02:00:00.000Z',
    completedAt: '2026-07-09T02:05:00.000Z',
    url: 'http://localhost:5173',
    mode: 'local',
    decisionProvider: 'local-heuristic',
    steps,
    summary: { maxSteps: 40, visualLoop: { ok: true, stopReason: 'agentStop', traceEntries: steps.length } },
    finalObservation: { visibleText: '' },
  };
}

describe('coverageLedger', () => {
  test('reports repeatedly-visible, never-exercised controls and skips exercised or rare ones', () => {
    const steps = [];
    for (let i = 0; i < COVERAGE_MIN_SIGHTINGS + 1; i++) {
      steps.push(step(i, [control('#sell'), control('#crop-mix'), ...(i < 2 ? [control('#rare')] : [])],
        i === 0 ? { kind: 'click', selector: '#sell', label: 'Sell' } : undefined));
    }
    const ledger = coverageLedger(steps);
    expect(ledger.gaps.map((gap) => gap.key)).toEqual(['#crop-mix']);
    expect(ledger.offered).toBe(3);
    expect(ledger.exercised).toBe(1);
    const gap = ledger.gaps[0];
    expect(gap.sightings).toBeGreaterThanOrEqual(COVERAGE_MIN_SIGHTINGS);
  });

  test('counts any decision kind that targets the selector as exercising it', () => {
    const steps = [];
    for (let i = 0; i < COVERAGE_MIN_SIGHTINGS; i++) {
      steps.push(step(i, [control('#tomato-pct')], i === 0 ? { kind: 'adjust', selector: '#tomato-pct', value: 40 } : undefined));
    }
    expect(coverageLedger(steps).gaps).toEqual([]);
  });

  test('duplicate-selector controls count once per observation, not once per element', () => {
    // "Sell 1 Carrot" and "Sell 5 Carrot" share [data-sell="carrot"]: one
    // step offering both is ONE sighting, so the transient filter and the
    // finding text keep honest per-observation units.
    const steps = [];
    for (let i = 0; i < COVERAGE_MIN_SIGHTINGS; i++) {
      steps.push(step(i, [control('[data-sell="carrot"]', 'Sell 1'), control('[data-sell="carrot"]', 'Sell 5')]));
    }
    const ledger = coverageLedger(steps);
    expect(ledger.gaps).toHaveLength(1);
    expect(ledger.gaps[0].sightings).toBe(COVERAGE_MIN_SIGHTINGS);
  });

  test('gaps come back deterministically ordered: sightings desc, then key', () => {
    const steps = [];
    for (let i = 0; i < COVERAGE_MIN_SIGHTINGS + 2; i++) {
      const offered = [control('#late'), control('#b-often'), control('#a-often')];
      // #late appears from step 2 onward only.
      steps.push(step(i, i < 2 ? offered.slice(1) : offered));
    }
    expect(coverageLedger(steps).gaps.map((gap) => gap.key)).toEqual(['#a-often', '#b-often', '#late']);
  });

  test('treats rotating village request offers as one exercised control family', () => {
    const steps = [];
    for (let i = 0; i < COVERAGE_MIN_SIGHTINGS; i++) {
      steps.push(step(
        i,
        [
          control('[data-accept-request="mill-morning"]', 'Accept Mill Morning'),
          control('[data-accept-request="bakery-basket"]', 'Accept Bakery Basket'),
        ],
        i === 0
          ? { kind: 'click', selector: '[data-accept-request="bakery-basket"]', label: 'Accept Bakery Basket' }
          : undefined,
      ));
    }

    const ledger = coverageLedger(steps);
    expect(ledger.offered).toBe(1);
    expect(ledger.exercised).toBe(1);
    expect(ledger.gaps).toEqual([]);
  });
});

describe('coverage-gap findings through evaluateVisualLoop', () => {
  function runWithGap() {
    const steps = [];
    for (let i = 0; i < COVERAGE_MIN_SIGHTINGS + 2; i++) {
      steps.push(step(i, [control('#goals', 'Goals'), control('#sell', 'Sell')],
        { kind: 'click', selector: '#sell', label: 'Sell' }));
    }
    return baseRun(steps);
  }

  test('emits a low-severity improveHarness finding with a stable data.class', () => {
    const findings = evaluateVisualLoop(runWithGap());
    const gap = findings.find((finding) => finding.data?.class === 'coverage-gap:#goals');
    expect(gap).toBeDefined();
    expect(gap.severity).toBe('low');
    expect(gap.nextAction).toBe('improveHarness');
    expect(gap.promotionTarget).toBe('scenario');
    expect(gap.schemaVersion).toBe(2);
    expect(gap.verificationStatus).toBe('unverified');
    expect(() => assertImprovementFinding(gap, { requireVerificationEvidence: false })).not.toThrow();
  });

  test('verifies coverage gaps by metric when the replay self-check is strong and a bundle exists', () => {
    const run = {
      ...runWithGap(),
      bundleSessionId: 'bundle-99',
      replayCoverage: { startTick: 0, endTick: 64, durationTicks: 64, partial: false },
    };
    const verification = { ok: true, checkedSegments: 2, skippedSegments: [] };
    const findings = evaluateVisualLoop(run, { verification });
    const gap = findings.find((finding) => finding.data?.class === 'coverage-gap:#goals');
    expect(gap.verificationStatus).toBe('verified');
    expect(gap.verificationMethod).toBe('metric');
    expect(() => assertImprovementFinding(gap)).not.toThrow();
  });
});

describe('selectFixCandidate with improveHarness', () => {
  function finding(id, severity, nextAction) {
    return { schemaVersion: 2, id, title: id, severity, category: 'opportunity', observed: 'o', verificationStatus: 'unverified', nextAction };
  }

  test('selects an improveHarness gap when nothing else is open', () => {
    expect(selectFixCandidate([finding('coverage-gap-goals', 'low', 'improveHarness')])?.id).toBe('coverage-gap-goals');
  });

  test('real bugs still outrank coverage gaps', () => {
    const candidate = selectFixCandidate([
      finding('coverage-gap-goals', 'low', 'improveHarness'),
      { ...finding('guidance-stall', 'medium', 'manualFix'), schemaVersion: 1 },
    ]);
    expect(candidate?.id).toBe('guidance-stall');
  });
});
