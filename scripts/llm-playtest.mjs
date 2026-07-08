import process from 'node:process';

const defaultDeepVisualSteps = '120';

if (!process.env.FARM_VISUAL_LOOP_STEPS) {
  process.env.FARM_VISUAL_LOOP_STEPS = defaultDeepVisualSteps;
}

console.warn(
  [
    '[deprecated] npm run playtest:llm now delegates to npm run playtest:llm:visual-loop.',
    'Use playtest:llm:visual-loop directly for the canonical screenshot/action LLM player.',
    `FARM_VISUAL_LOOP_STEPS=${process.env.FARM_VISUAL_LOOP_STEPS}.`,
    'FARM_PLAYTEST_URL is still supported by the visual loop when attaching to a running Farm server.',
  ].join(' '),
);

await import('./llm-visual-loop.mjs');
