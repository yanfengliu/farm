import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('LLM playtest harness player contract', () => {
  test('browser scenarios are driven through visible player controls', async () => {
    const source = await readFile('scripts/llm-playtest.mjs', 'utf8');

    expect(source).not.toContain('window.advanceTime');
    expect(source).not.toContain('window.__farmDebug.reset');
    expect(source).toContain('playerClick');
    expect(source).toContain('availableActions');
  });
});
