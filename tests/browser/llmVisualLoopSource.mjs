import { readFile as readFileFromDisk } from 'node:fs/promises';

export { readFileFromDisk };

export const VISUAL_LOOP_MODULES = [
  'scripts/llm-visual-loop.mjs',
  'scripts/llm-visual-loop/browser-observation.mjs',
  'scripts/llm-visual-loop/action-adapter.mjs',
  'scripts/llm-visual-loop/player-provider.mjs',
  'scripts/llm-visual-loop/local-player.mjs',
  'scripts/llm-visual-loop/local-player-support.mjs',
  'scripts/llm-visual-loop/report-renderers.mjs',
  'scripts/llm-visual-loop/improvement-report.mjs',
  'scripts/llm-visual-loop/report-support.mjs',
];

export async function readFile(file, encoding) {
  if (file === 'scripts/llm-visual-loop.mjs') {
    return (await Promise.all(VISUAL_LOOP_MODULES.map((modulePath) => readFileFromDisk(modulePath, 'utf8')))).join('\n');
  }
  return readFileFromDisk(file, encoding);
}
