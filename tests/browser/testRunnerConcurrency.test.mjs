import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

async function browserSuitesLaunchingChromium() {
  const entries = await readdir('tests/browser');
  const sources = await Promise.all(entries
    .filter((entry) => entry.endsWith('.mjs'))
    .map(async (entry) => ({ entry, source: await readFile(`tests/browser/${entry}`, 'utf8') })));
  return sources.filter(({ source }) => source.includes('chromium.launch')).map(({ entry }) => entry);
}

describe('test runner concurrency', () => {
  test('vitest caps fork concurrency instead of scaling with core count', async () => {
    const { default: config } = await import('../../vitest.config.ts');
    const maxForks = config.test?.poolOptions?.forks?.maxForks;

    expect(typeof maxForks).toBe('number');
    expect(maxForks).toBeGreaterThanOrEqual(2);
    expect(maxForks).toBeLessThanOrEqual(8);
  });

  test('the fork cap stays below the number of suites that launch their own Chromium', async () => {
    const { default: config } = await import('../../vitest.config.ts');
    const maxForks = config.test?.poolOptions?.forks?.maxForks;
    const chromiumSuites = await browserSuitesLaunchingChromium();

    expect(chromiumSuites.length).toBeGreaterThan(8);
    expect(maxForks).toBeLessThan(chromiumSuites.length);
  });
});
