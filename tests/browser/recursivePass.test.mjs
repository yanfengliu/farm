import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { assertImprovementRunManifest } from 'civ-engine';
import {
  snapshotPassArtifacts,
  writePassManifest,
} from '../../scripts/llm-visual-loop/pass-artifacts.mjs';
import {
  buildPassManifest,
  passOutcome,
  recursiveVisualLoopEnvironment,
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

function visualRunFixture({ rootDir, outputDir, runId, screenshotName = '00-step-0.png' }) {
  const screenshot = `steps/${screenshotName}`;
  const screenshotFile = path.join(outputDir, 'steps', screenshotName);
  return {
    generatedAt: '2026-07-13T12:00:00.000Z',
    url: 'http://127.0.0.1:5175/',
    decisionProvider: 'local-heuristic',
    actionBoundary: 'browser-only',
    bundlePath: path.relative(rootDir, path.join(outputDir, 'latest.bundle.json')),
    improvementRun: { id: runId },
    findings: [],
    steps: [{
      index: 0,
      observation: {
        label: 'step 0',
        screenshot,
        screenshotFile,
        visibleText: 'A small farm',
        availableActions: [],
        keyboardActions: [],
      },
      decision: {
        action: { kind: 'wait', ms: 100 },
        rationale: 'Watch the farm.',
        expectedResult: 'The farm advances.',
      },
      execution: { ok: true },
    }],
    finalObservation: {
      label: 'final',
      screenshot,
      screenshotFile,
      visibleText: 'A small farm',
      availableActions: [],
      keyboardActions: [],
    },
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
      gitCommit: '1234567890abcdef1234567890abcdef12345678',
      sourceTreeDirty: true,
      provider: 'local-heuristic',
      candidate: finding('browser-errors', 'high', 'autoFix'),
      discoveryScope: {
        mode: 'deterministic-regression',
        id: 'local-heuristic-full-surface',
        findingSource: 'mechanical-oracles-plus-semantic-control-coverage',
        supportsBroadQualityClaim: false,
      },
      verification: { ok: true, checkedSegments: 1, skippedSegments: 0 },
      replayCoverage: { startTick: 4096, endTick: 4160, durationTicks: 64, partial: true },
      runId: 'run-1',
      artifacts: [{ kind: 'run', path: 'output/playwright/llm-visual-loop/latest.json' }],
    });
    expect(() => assertImprovementRunManifest(manifest)).not.toThrow();
    expect(manifest.stopReason).toBe('proposal-only');
    expect(manifest.gitCommit).toBe('1234567890abcdef1234567890abcdef12345678');
    expect(manifest.data).toMatchObject({
      outcome: 'proposal-only',
      candidateFindingId: 'browser-errors',
      sourceTreeDirty: true,
      sourceRevision: '1234567890abcdef1234567890abcdef12345678+dirty',
      discoveryScope: {
        mode: 'deterministic-regression',
        id: 'local-heuristic-full-surface',
        supportsBroadQualityClaim: false,
      },
      scopeConclusion: 'candidate-found',
      broaderGoalStatus: 'in-progress',
      nextAction: 'fix-candidate',
      verification: { ok: true },
      replayCoverage: { startTick: 4096, endTick: 4160, durationTicks: 64, partial: true },
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
    expect(manifest.data).toMatchObject({
      discoveryScope: {
        mode: 'unspecified',
        id: 'unspecified',
        findingSource: 'unspecified',
        supportsBroadQualityClaim: false,
      },
      sourceTreeDirty: false,
      sourceRevision: 'unversioned',
      scopeConclusion: 'no-candidate-in-declared-scope',
      broaderGoalStatus: 'not-evaluated',
      nextAction: 'broaden-discovery',
    });
  });
});

describe('playtest-recursive script wiring', () => {
  test('keeps pass artifacts and its immutable manifest stable after latest files are replaced', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'farm-recursive-pass-'));
    const outputDir = path.join(rootDir, 'output', 'playwright', 'llm-visual-loop');
    const historyDir = path.join(rootDir, 'output', 'playwright', 'llm-visual-loop-history');
    const passId = 'farm-recursive-original';

    try {
      await mkdir(path.join(outputDir, 'steps'), { recursive: true });
      const originalRun = visualRunFixture({ rootDir, outputDir, runId: 'run-original' });
      await writeFile(
        path.join(outputDir, 'latest.json'),
        `${JSON.stringify(originalRun)}\n`,
      );
      await writeFile(path.join(outputDir, 'latest.md'), '# run-original\n');
      await writeFile(path.join(outputDir, 'latest.html'), '<p>run-original</p>\n');
      await writeFile(
        path.join(outputDir, 'latest.bundle.json'),
        `${JSON.stringify({ metadata: { sessionId: 'bundle-original' } })}\n`,
      );
      await writeFile(path.join(outputDir, 'steps', '00-step-0.png'), 'original screenshot');

      const replayCoverage = {
        startTick: 4096,
        endTick: 4160,
        durationTicks: 64,
        partial: true,
      };
      const snapshot = await snapshotPassArtifacts({
        rootDir,
        outputDir,
        historyDir,
        passId,
        bundlePath: path.join(outputDir, 'latest.bundle.json'),
      });
      const manifest = buildPassManifest({
        id: passId,
        startedAt: '2026-07-13T12:00:00.000Z',
        completedAt: '2026-07-13T12:01:00.000Z',
        candidate: null,
        runId: 'run-original',
        replayCoverage,
        artifacts: snapshot.artifacts,
      });
      const ledgerPath = path.join(historyDir, 'passes.jsonl');
      await writePassManifest({
        manifest,
        latestManifestPath: path.join(outputDir, 'latest.pass-manifest.json'),
        immutableManifestPath: snapshot.passManifestPath,
        ledgerPath,
      });

      await rename(path.join(outputDir, 'latest.json'), path.join(outputDir, 'previous.json'));
      await rename(path.join(outputDir, 'latest.md'), path.join(outputDir, 'previous.md'));
      await rename(
        path.join(outputDir, 'latest.bundle.json'),
        path.join(outputDir, 'previous.bundle.json'),
      );
      await rename(path.join(outputDir, 'steps'), path.join(outputDir, 'previous-steps'));
      await writeFile(
        path.join(outputDir, 'latest.json'),
        `${JSON.stringify(visualRunFixture({ rootDir, outputDir, runId: 'run-replacement' }))}\n`,
      );
      await writeFile(path.join(outputDir, 'latest.md'), '# run-replacement\n');
      await writeFile(
        path.join(outputDir, 'latest.bundle.json'),
        `${JSON.stringify({ metadata: { sessionId: 'bundle-replacement' } })}\n`,
      );
      await mkdir(path.join(outputDir, 'steps'));
      await writeFile(path.join(outputDir, 'steps', '00-step-0.png'), 'replacement screenshot');

      const immutableManifest = JSON.parse(await readFile(snapshot.passManifestPath, 'utf8'));
      const ledgerManifest = JSON.parse((await readFile(ledgerPath, 'utf8')).trim());
      expect(immutableManifest.artifacts).toEqual(snapshot.artifacts);
      expect(ledgerManifest.artifacts).toEqual(snapshot.artifacts);
      expect(immutableManifest.data.runId).toBe('run-original');
      expect(ledgerManifest.data.runId).toBe('run-original');
      expect(immutableManifest.data.replayCoverage).toEqual(replayCoverage);
      expect(ledgerManifest.data.replayCoverage).toEqual(replayCoverage);

      for (const artifact of ledgerManifest.artifacts) {
        await expect(access(path.resolve(rootDir, artifact.path))).resolves.toBeUndefined();
      }
      const stableRunArtifact = ledgerManifest.artifacts.find((artifact) => artifact.kind === 'run');
      const stableRun = JSON.parse(
        await readFile(path.resolve(rootDir, stableRunArtifact.path), 'utf8'),
      );
      expect(stableRun.improvementRun.id).toBe('run-original');
      const stableBundleArtifact = ledgerManifest.artifacts.find(
        (artifact) => artifact.kind === 'bundle',
      );
      expect(path.resolve(rootDir, stableRun.bundlePath))
        .toBe(path.resolve(rootDir, stableBundleArtifact.path));
      const stableScreenshot = path.resolve(
        path.dirname(path.resolve(rootDir, stableRunArtifact.path)),
        stableRun.steps[0].observation.screenshot,
      );
      expect(stableRun.steps[0].observation.screenshotFile).toBe(stableScreenshot);
      expect(stableRun.finalObservation.screenshotFile).toBe(stableScreenshot);
      expect(await readFile(stableScreenshot, 'utf8')).toBe('original screenshot');
      const stableReportArtifact = ledgerManifest.artifacts.find(
        (artifact) => artifact.kind === 'report',
      );
      expect(await readFile(path.resolve(rootDir, stableReportArtifact.path), 'utf8'))
        .toContain(`Screenshot file: ${stableScreenshot}`);
      const stableHtmlArtifact = ledgerManifest.artifacts.find(
        (artifact) => artifact.kind === 'report-html',
      );
      expect(await readFile(path.resolve(rootDir, stableHtmlArtifact.path), 'utf8'))
        .toContain('steps/00-step-0.png');
      const stableBundle = JSON.parse(
        await readFile(path.resolve(rootDir, stableBundleArtifact.path), 'utf8'),
      );
      expect(stableBundle.metadata.sessionId).toBe('bundle-original');
      expect(JSON.parse(await readFile(path.join(outputDir, 'latest.json'), 'utf8')).improvementRun.id)
        .toBe('run-replacement');
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test('rejects missing visual evidence without leaving a pass artifact directory', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'farm-recursive-pass-failure-'));
    const outputDir = path.join(rootDir, 'output', 'playwright', 'llm-visual-loop');
    const historyDir = path.join(rootDir, 'output', 'playwright', 'llm-visual-loop-history');
    const passId = 'farm-recursive-incomplete';

    try {
      await mkdir(path.join(outputDir, 'steps'), { recursive: true });
      await writeFile(
        path.join(outputDir, 'latest.json'),
        `${JSON.stringify(visualRunFixture({
          rootDir,
          outputDir,
          runId: 'run-incomplete',
          screenshotName: 'missing.png',
        }))}\n`,
      );
      await writeFile(path.join(outputDir, 'latest.md'), '# run-incomplete\n');
      await writeFile(path.join(outputDir, 'latest.html'), '<p>run-incomplete</p>\n');
      await writeFile(
        path.join(outputDir, 'latest.bundle.json'),
        `${JSON.stringify({ metadata: { sessionId: 'bundle-incomplete' } })}\n`,
      );
      await expect(snapshotPassArtifacts({
        rootDir,
        outputDir,
        historyDir,
        passId,
        bundlePath: path.join(outputDir, 'latest.bundle.json'),
      }))
        .rejects.toThrow();
      await expect(access(path.join(historyDir, 'pass-artifacts', passId)))
        .rejects.toThrow();
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test('uses the Harvest Hearth plus Farm Notes budget by default and normalizes explicit bounds', () => {
    expect(recursiveVisualLoopEnvironment({ PATH: 'farm-path' })).toMatchObject({
      PATH: 'farm-path',
      FARM_VISUAL_LOOP_STEPS: '160',
    });
    expect(recursiveVisualLoopEnvironment({ FARM_VISUAL_LOOP_STEPS: '72' })).toMatchObject({
      FARM_VISUAL_LOOP_STEPS: '72',
    });
    expect(recursiveVisualLoopEnvironment({ FARM_VISUAL_LOOP_STEPS: '999' })).toMatchObject({
      FARM_VISUAL_LOOP_STEPS: '160',
    });
    expect(recursiveVisualLoopEnvironment({ FARM_VISUAL_LOOP_STEPS: 'bogus' })).toMatchObject({
      FARM_VISUAL_LOOP_STEPS: '160',
    });
  });

  test('spawns the visual loop and reads its canonical packet', async () => {
    const source = await readFile('scripts/playtest-recursive.mjs', 'utf8');
    expect(source).toContain('playtest:llm:visual-loop');
    expect(source).toContain('latest.json');
    expect(source).toContain('selectFixCandidate');
    expect(source).toContain('buildPassManifest');
    expect(source).toContain('currentGitCommit');
    expect(source).toContain('currentGitWorktreeDirty');
    expect(source).toContain('discoveryScope');
  });

  test('persists the pass manifest and appends the passes ledger', async () => {
    const source = await readFile('scripts/playtest-recursive.mjs', 'utf8');
    expect(source).toContain('latest.pass-manifest.json');
    expect(source).toContain('passes.jsonl');
    expect(source).toContain('bundlePath: runPacket.bundlePath');
    expect(source).toContain('replayCoverage: runPacket?.replayCoverage');
    expect(source).toContain("resolvedOutcome = 'run-failed'");
    expect(source).toContain('resolvedExitCode = 1');
  });
});
