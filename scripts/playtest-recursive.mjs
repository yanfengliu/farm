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
// Artifacts: output/playwright/llm-visual-loop/latest.pass-manifest.json plus a
// row in output/playwright/llm-visual-loop-history/passes.jsonl.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildPassManifest,
  selectFixCandidate,
} from './llm-visual-loop/recursive-pass.mjs';

const cwd = process.cwd();
const outputDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop');
const historyDir = path.join(cwd, 'output', 'playwright', 'llm-visual-loop-history');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const startedAtMs = Date.now();
const startedAt = new Date(startedAtMs).toISOString();

const loop = await runCommand(npmBin, ['run', 'playtest:llm:visual-loop']);
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
  console.log('[recursive] no fix-classified finding in this run');
}
await finish(run, verification, candidate, undefined, candidate ? 0 : 0);

async function finish(runPacket, verificationResult, fixCandidate, forcedOutcome, exitCode) {
  const completedAtMs = Date.now();
  const manifest = buildPassManifest({
    id: `farm-recursive-${startedAt.replace(/[:.]/g, '-')}`,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    provider: runPacket?.decisionProvider ?? 'local-heuristic',
    candidate: forcedOutcome ? null : fixCandidate,
    verification: verificationResult,
    runId: runPacket?.improvementRun?.id,
    artifacts: [
      { kind: 'run', path: path.relative(cwd, path.join(outputDir, 'latest.json')) },
      { kind: 'report', path: path.relative(cwd, path.join(outputDir, 'latest.md')) },
    ],
  });
  if (forcedOutcome) {
    manifest.stopReason = forcedOutcome;
    manifest.data = { ...(manifest.data ?? {}), outcome: forcedOutcome };
  }
  await fs.writeFile(
    path.join(outputDir, 'latest.pass-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ).catch(() => {});
  await fs.mkdir(historyDir, { recursive: true });
  await fs.appendFile(path.join(historyDir, 'passes.jsonl'), `${JSON.stringify(manifest)}\n`);
  console.log(JSON.stringify({ outcome: manifest.stopReason, candidate: fixCandidate?.id ?? null }, null, 2));
  process.exit(exitCode);
}

function runCommand(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ exitCode: code ?? -1 }));
  });
}
