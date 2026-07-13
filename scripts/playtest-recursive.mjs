// playtest-recursive: one proposal-only recursive self-improvement pass.
//
// Runs the visual loop, reads its canonical recursive-improvement packet
// (latest.json: engine ImprovementFindings + replay verification), selects the
// top fix-classified finding, and writes a pass manifest. farm has no
// auto-apply arm by design — the driving agent is the fix arm: fix the
// candidate, rerun this command, and compare the run comparison / ledgers
// before claiming anything fixed.
//
// Outcomes (manifest stopReason): no-fix-candidate | proposal-only | run-failed.
// Artifacts: immutable run/report/replay-bundle/pass-manifest snapshots under
// output/playwright/llm-visual-loop-history/pass-artifacts/<pass-id>/, a
// latest.pass-manifest.json pointer, and a row in history/passes.jsonl.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildPassManifest,
  currentGitCommit,
  currentGitWorktreeDirty,
  recursiveVisualLoopEnvironment,
  selectFixCandidate,
} from './llm-visual-loop/recursive-pass.mjs';
import {
  snapshotPassArtifacts,
  writePassManifest,
} from './llm-visual-loop/pass-artifacts.mjs';

const cwd = process.cwd();
const outputDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop');
const historyDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop-history');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const startedAtMs = Date.now();
const startedAt = new Date(startedAtMs).toISOString();
const passId = `farm-recursive-${startedAt.replace(/[:.]/g, '-')}`;
const loopEnvironment = recursiveVisualLoopEnvironment(process.env);
const discoveryScope = {
  mode: 'deterministic-regression',
  id: `local-heuristic-full-surface-${loopEnvironment.FARM_VISUAL_LOOP_STEPS}-step`,
  findingSource: 'mechanical-oracles-plus-semantic-control-coverage',
  supportsBroadQualityClaim: false,
};
const [gitCommit, sourceTreeDirty] = await Promise.all([
  currentGitCommit(cwd),
  currentGitWorktreeDirty(cwd),
]);
if (!gitCommit || sourceTreeDirty === null) {
  console.error('[recursive] failed to resolve the current git source state; refusing an unversioned pass.');
  await finish(null, null, null, 'run-failed', 1);
}

const loop = await runCommand(
  npmBin,
  ['run', 'playtest:llm:visual-loop'],
  loopEnvironment,
);
if (loop.exitCode !== 0) {
  await finish(null, null, null, 'run-failed', 1);
}

let run;
try {
  run = JSON.parse(await fs.readFile(path.join(outputDir, 'latest.json'), 'utf8'));
} catch (error) {
  console.error(`[recursive] failed to read latest.json: ${error?.message ?? error}`);
  await finish(null, null, null, 'run-failed', 1);
}

const verification = run.summary?.replayVerification ?? null;
const candidate = selectFixCandidate(run.findings ?? []);
if (candidate) {
  console.log(`[recursive] fix candidate: ${candidate.id} [${candidate.severity}] ${candidate.title}`);
  console.log('[recursive] farm is proposal-only: fix this finding, rerun, and compare before claiming it fixed.');
} else {
  console.log(`[recursive] no fix-classified finding in declared scope ${discoveryScope.id}`);
  console.log('[recursive] this proves the deterministic visual-loop scope only, not broad game quality or recursive-session completion.');
}
await finish(run, verification, candidate, undefined, candidate ? 0 : 0);

async function finish(runPacket, verificationResult, fixCandidate, forcedOutcome, exitCode) {
  const completedAtMs = Date.now();
  let artifacts = [];
  let immutableManifestPath = null;
  let resolvedOutcome = forcedOutcome;
  let resolvedExitCode = exitCode;
  if (runPacket) {
    try {
      const snapshot = await snapshotPassArtifacts({
        rootDir: cwd,
        outputDir,
        historyDir,
        passId,
        bundlePath: runPacket.bundlePath,
      });
      artifacts = snapshot.artifacts;
      immutableManifestPath = snapshot.passManifestPath;
    } catch (error) {
      console.error(`[recursive] failed to snapshot immutable pass artifacts: ${error?.message ?? error}`);
      resolvedOutcome = 'run-failed';
      resolvedExitCode = 1;
    }
  }
  const manifest = buildPassManifest({
    id: passId,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    gitCommit,
    sourceTreeDirty,
    provider: runPacket?.decisionProvider ?? 'local-heuristic',
    candidate: resolvedOutcome ? null : fixCandidate,
    forcedOutcome: resolvedOutcome,
    discoveryScope,
    verification: verificationResult,
    replayCoverage: runPacket?.replayCoverage,
    runId: runPacket?.improvementRun?.id,
    artifacts,
  });
  await writePassManifest({
    manifest,
    latestManifestPath: path.join(outputDir, 'latest.pass-manifest.json'),
    immutableManifestPath,
    ledgerPath: path.join(historyDir, 'passes.jsonl'),
  });
  console.log(JSON.stringify({
    outcome: manifest.stopReason,
    candidate: manifest.data?.candidateFindingId ?? null,
    discoveryScope: manifest.data?.discoveryScope ?? null,
    scopeConclusion: manifest.data?.scopeConclusion ?? null,
    broaderGoalStatus: manifest.data?.broaderGoalStatus ?? null,
    nextAction: manifest.data?.nextAction ?? null,
  }, null, 2));
  process.exit(resolvedExitCode);
}

function runCommand(cmd, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ exitCode: code ?? -1 }));
  });
}
