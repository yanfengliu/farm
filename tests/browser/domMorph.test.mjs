import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import process from 'node:process';

// The morph exists so live-data re-renders stop replacing nodes under the
// player's cursor. These contracts pin the property that kills the flicker:
// unchanged elements keep their identity across a morph.

let server;
let browser;
let page;

describe('dom morph', () => {
  beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      cacheDir: 'node_modules/.vite-dom-morph-test',
      configFile: false,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5176/';
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');
    // A dynamic import inside page.evaluate gets rewritten by vitest's own
    // transform; a script tag reaches the page untouched.
    await page.addScriptTag({
      type: 'module',
      content: "import { morphInto } from '/src/ui/domMorph.ts'; globalThis.__morphInto = morphInto;",
    });
    await page.waitForFunction(() => typeof globalThis.__morphInto === 'function');
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  const run = (fn) => page.evaluate(fn);

  test('unchanged elements keep identity while changed text updates in place', async () => {
    const result = await run(() => {
      const host = document.createElement('div');
      host.innerHTML = '<h2>Goals</h2><button data-buy-upgrade="boots">Boots · 40c</button><p class="count">Harvest 5/10</p>';
      const button = host.querySelector('button');
      const heading = host.querySelector('h2');
      globalThis.__morphInto(host, '<h2>Goals</h2><button data-buy-upgrade="boots">Boots · 40c</button><p class="count">Harvest 6/10</p>');
      return {
        buttonSame: host.querySelector('button') === button,
        headingSame: host.querySelector('h2') === heading,
        countText: host.querySelector('.count').textContent,
      };
    });
    expect(result).toEqual({ buttonSame: true, headingSame: true, countText: 'Harvest 6/10' });
  });

  test('attribute changes apply to the same element instead of replacing it', async () => {
    const result = await run(() => {
      const host = document.createElement('div');
      host.innerHTML = '<button data-buy-upgrade="boots">Boots</button>';
      const button = host.querySelector('button');
      globalThis.__morphInto(host, '<button data-buy-upgrade="boots" disabled aria-disabled="true">Boots</button>');
      const afterFirst = {
        same: host.querySelector('button') === button,
        disabled: host.querySelector('button').disabled,
      };
      globalThis.__morphInto(host, '<button data-buy-upgrade="boots">Boots</button>');
      return { ...afterFirst, reEnabled: !host.querySelector('button').disabled, stillSame: host.querySelector('button') === button };
    });
    expect(result).toEqual({ same: true, disabled: true, reEnabled: true, stillSame: true });
  });

  test('structural adds and removes only touch the affected siblings', async () => {
    const result = await run(() => {
      const host = document.createElement('div');
      host.innerHTML = '<p>one</p><p>two</p>';
      const first = host.querySelector('p');
      globalThis.__morphInto(host, '<p>one</p><p>two</p><p>three</p>');
      const grown = { count: host.querySelectorAll('p').length, firstSame: host.querySelector('p') === first };
      globalThis.__morphInto(host, '<p>one</p>');
      return { ...grown, shrunk: host.querySelectorAll('p').length, firstStillSame: host.querySelector('p') === first };
    });
    expect(result).toEqual({ count: 3, firstSame: true, shrunk: 1, firstStillSame: true });
  });

  test('painted canvases and blurred input values survive a morph correctly', async () => {
    const result = await run(() => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = '<canvas width="4" height="4"></canvas><input type="number" value="30">';
      const canvas = host.querySelector('canvas');
      const context = canvas.getContext('2d');
      context.fillStyle = 'rgb(255, 0, 0)';
      context.fillRect(0, 0, 4, 4);
      const input = host.querySelector('input');
      input.value = '55';
      globalThis.__morphInto(host, '<canvas width="4" height="4"></canvas><input type="number" value="70">');
      const pixel = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
      const outcome = {
        canvasSame: host.querySelector('canvas') === canvas,
        paintSurvives: pixel[0] === 255,
        blurredFollowsState: host.querySelector('input').value === '70',
      };
      host.remove();
      return outcome;
    });
    expect(result).toEqual({ canvasSame: true, paintSurvives: true, blurredFollowsState: true });
  });

  test('focused inputs keep the value the player is editing', async () => {
    const result = await run(() => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = '<input type="number" value="30">';
      const input = host.querySelector('input');
      input.focus();
      input.value = '4';
      globalThis.__morphInto(host, '<input type="number" value="70">');
      const outcome = { editing: input.value === '4', same: host.querySelector('input') === input };
      host.remove();
      return outcome;
    });
    expect(result).toEqual({ editing: true, same: true });
  });
});
