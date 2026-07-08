import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('deprecated scripted LLM playtest command', () => {
  test('playtest:llm remains as a compatibility entrypoint', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

    expect(packageJson.scripts['playtest:llm']).toBe('node scripts/llm-playtest.mjs');
    expect(packageJson.scripts['playtest:llm:visual-loop']).toBe('node scripts/llm-visual-loop.mjs');
  });

  test('deprecated entrypoint delegates to the canonical visual loop', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain('[deprecated]');
    expect(source).toContain('playtest:llm:visual-loop');
    expect(source).toContain('FARM_VISUAL_LOOP_STEPS');
    expect(source).toContain('FARM_PLAYTEST_URL');
    expect(source).toContain("await import('./llm-visual-loop.mjs')");
    expect(source).not.toContain('output/playwright/llm-playtest');
    expect(source).not.toContain('SessionBundle');
  });

  test('compatibility entrypoint defaults to a deep progression audit', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).toContain("const defaultDeepVisualSteps = '120'");
    expect(source).toContain('if (!process.env.FARM_VISUAL_LOOP_STEPS)');
  });
});
