import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { assertImprovementRunManifest } from 'civ-engine';
import {
  buildPassManifest,
  passOutcome,
  selectFixCandidate,
} from '../../scripts/llm-visual-loop/recursive-pass.mjs';

function finding(id, severity, nextAction, overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    title: id,
    severity,
    category: 'bug',
    observed: 'observed',
    verificationStatus: 'unverified',
    nextAction,
    ...overrides,
  };
}

describe('selectFixCandidate', () => {
  test('picks the highest-severity fix-classified finding', () => {
    const candidate = selectFixCandidate([
      finding('low-fix', 'low', 'autoFix'),
      finding('high-proposal', 'high', 'proposalOnly'),
      finding('medium-fix', 'medium', 'manualFix'),
    ]);
    expect(candidate?.id).toBe('medium-fix');
  });

  test('threads the candidate class into the pass manifest for fleet aggregation', async () => {
    const { buildPassManifest: build } = await import('../../scripts/llm-visual-loop/recursive-pass.mjs');
    const manifest = build({
      id: 'farm-recursive-x',
      startedAt: '2026-07-09T02:00:00.000Z',
      completedAt: '2026-07-09T02:05:00.000Z',
      candidate: { ...finding('coverage-gap-goals', 'low', 'improveHarness'), data: { class: 'coverage-gap:#goals' } },
      artifacts: [],
    });
    expect(manifest.data.candidateClass).toBe('coverage-gap:#goals');
    expect(manifest.data.candidateFindingId).toBe('coverage-gap-goals');
  });

  test('skips rejected and wontFix dispositions and returns null when nothing is fixable', () => {
    expect(selectFixCandidate([
      finding('rejected-fix', 'high', 'autoFix', { disposition: 'rejected' }),
      finding('wontfix-fix', 'high', 'manualFix', { disposition: 'wontFix' }),
      finding('observe', 'high', 'observeMore'),
    ])).toBeNull();
    expect(selectFixCandidate([])).toBeNull();
    expect(passOutcome(null)).toBe('no-fix-candidate');
  });
});

describe('buildPassManifest', () => {
  test('builds a validated engine manifest carrying the outcome and candidate', () => {
    const manifest = buildPassManifest({
      id: 'farm-recursive-20260708',
      startedAt: '2026-07-08T12:00:00.000Z',
      completedAt: '2026-07-08T12:05:00.000Z',
      durationMs: 300_000,
      provider: 'local-heuristic',
      candidate: finding('browser-errors', 'high', 'autoFix'),
      verification: { ok: true, checkedSegments: 1, skippedSegments: 0 },
      runId: 'run-1',
      artifacts: [{ kind: 'run', path: 'output/playwright/llm-visual-loop/latest.json' }],
    });
    expect(() => assertImprovementRunManifest(manifest)).not.toThrow();
    expect(manifest.stopReason).toBe('proposal-only');
    expect(manifest.data).toMatchObject({
      outcome: 'proposal-only',
      candidateFindingId: 'browser-errors',
      verification: { ok: true },
    });
  });

  test('reports no-fix-candidate without a candidate id', () => {
    const manifest = buildPassManifest({
      id: 'farm-recursive-x',
      startedAt: '2026-07-08T12:00:00.000Z',
      completedAt: '2026-07-08T12:01:00.000Z',
      candidate: null,
      artifacts: [],
    });
    expect(() => assertImprovementRunManifest(manifest)).not.toThrow();
    expect(manifest.stopReason).toBe('no-fix-candidate');
    expect(Object.keys(manifest.data ?? {})).not.toContain('candidateFindingId');
  });
});

describe('playtest-recursive script wiring', () => {
  test('spawns the visual loop and reads its canonical packet', async () => {
    const source = await readFile('scripts/playtest-recursive.mjs', 'utf8');
    expect(source).toContain('playtest:llm:visual-loop');
    expect(source).toContain('latest.json');
    expect(source).toContain('selectFixCandidate');
    expect(source).toContain('buildPassManifest');
  });

  test('persists the pass manifest and appends the passes ledger', async () => {
    const source = await readFile('scripts/playtest-recursive.mjs', 'utf8');
    expect(source).toContain('latest.pass-manifest.json');
    expect(source).toContain('passes.jsonl');
  });
});
