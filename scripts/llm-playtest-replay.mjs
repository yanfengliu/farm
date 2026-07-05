import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { SessionReplayer } from 'civ-engine';

const cwd = process.cwd();
const args = process.argv.slice(2);
const bundlePath = args.find((arg) => !arg.startsWith('--')) ?? path.join('output', 'playwright', 'llm-playtest', 'latest.bundle.json');
const tickArgIndex = args.indexOf('--ticks');
const requestedTicks = tickArgIndex >= 0
  ? args[tickArgIndex + 1].split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value))
  : null;

const server = await createServer({
  root: cwd,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const farm = await server.ssrLoadModule('/src/game/simulation/farmGame.ts');
  const { createFarmGame, getFarmSnapshot, renderFarmToText } = farm;
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const replayer = SessionReplayer.fromBundle(bundle, {
    worldFactory: (snapshot) => {
      const game = createFarmGame({ seed: 'llm-replay' });
      game.applySnapshot(snapshot);
      return game;
    },
  });
  const selfCheck = replayer.selfCheck({ stopOnFirstDivergence: true });
  const markerTicks = (bundle.markers ?? [])
    .map((marker) => marker.refs?.tickRange?.from)
    .filter((tick) => Number.isFinite(tick));
  const ticks = [...new Set(requestedTicks ?? [
    bundle.metadata.startTick,
    ...markerTicks,
    bundle.metadata.endTick,
  ])].sort((a, b) => a - b);
  const samples = ticks.map((tick) => {
    const world = replayer.openAt(tick);
    const state = getFarmSnapshot(world);
    return {
      tick,
      text: renderFarmToText(world),
      tier: state.tier.level,
      workers: state.workers.length,
      workerTasks: state.workers.map((worker) => `${worker.id}:${worker.task.kind}:${worker.task.phase ?? 'none'}`),
    };
  });
  const markdown = renderReplayInspectMarkdown(bundlePath, selfCheck, bundle.markers ?? [], samples);
  const outPath = path.join(path.dirname(bundlePath), 'latest.replay-inspect.md');
  await writeFile(outPath, markdown);
  console.log(markdown);
  console.log(JSON.stringify({ report: outPath, selfCheckOk: selfCheck.ok, ticks }, null, 2));
} finally {
  await server.close();
}

function renderReplayInspectMarkdown(source, selfCheck, markers, samples) {
  const lines = [
    '# Replay Inspect',
    '',
    `Bundle: \`${source}\``,
    `Self-check: ${selfCheck.ok ? 'ok' : 'failed'}`,
    '',
    '## Markers',
    '',
  ];

  if (markers.length === 0) {
    lines.push('No markers.');
  } else {
    for (const marker of markers) {
      const from = marker.refs?.tickRange?.from ?? '?';
      lines.push(`- tick ${from}: ${marker.text}`);
    }
  }

  lines.push('');
  lines.push('## Samples');
  lines.push('');

  for (const sample of samples) {
    lines.push(`- tick ${sample.tick}: ${sample.text}`);
    lines.push(`  - workers: ${sample.workerTasks.join(', ') || 'none'}`);
  }

  return `${lines.join('\n')}\n`;
}
