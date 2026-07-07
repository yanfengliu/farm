import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SessionRecorder, SessionReplayer, bundleSummary } from 'civ-engine';
import { buildAnnotations, evaluatePlaytest, renderPlaytestMarkdown } from './llm-playtest/evaluate.mjs';

const cwd = process.cwd();
const outputDir = path.join(cwd, 'output', 'playwright', 'llm-playtest');
const screenshotDir = path.join(outputDir, 'screenshots');
const preferredFarmUrl = 'http://127.0.0.1:5175/';
const configuredPlaytestUrl = process.env.FARM_PLAYTEST_URL?.trim() ?? '';
const PLAYER_ACTION_SELECTOR = 'button, input[type="range"], input[type="number"], [role="button"], [role="separator"], [data-player-scroll], canvas';

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(screenshotDir, { recursive: true });

const server = await createServer({
  root: cwd,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5175, strictPort: false },
});

const consoleErrors = [];
const pageErrors = [];
const scenarios = [];
const playerActions = [];
let scenarioActionCursor = 0;
let browser;

try {
  if (!configuredPlaytestUrl) {
    await server.listen();
  }
  const url = configuredPlaytestUrl || server.resolvedUrls?.local?.[0] || preferredFarmUrl;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    const cleanBootKey = 'farm-playtest-storage-cleared';
    if (sessionStorage.getItem(cleanBootKey)) return;
    localStorage.clear();
    sessionStorage.setItem(cleanBootKey, 'true');
  });
  const page = await context.newPage();

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.toolbar .tool-button');
  await page.waitForSelector('canvas');
  await playerClick(page, '[data-speed="4"]', 'Set visible speed control to 4x');

  scenarios.push(await captureScenario(page, 'fresh-start', 'Fresh playable farm'));

  await runPlayerSurfaceTour(page);
  await playerWait(page, 250, 'Let the full player-surface tour settle');
  scenarios.push(await captureScenario(page, 'player-surface-tour', 'Full visible player surface tour'));

  await playerClick(page, '[data-panel="goals"]', 'Open Goals panel');
  await playerWaitForSelector(page, '[data-command="claim-tier"]', 'Wait until the visible Goals panel offers tier claiming', 60000);
  await playerWait(page, 250, 'Let the tier-ready UI settle');
  scenarios.push(await captureScenario(page, 'tier-ready', 'Tier ready goals panel'));

  const hasClaimButton = await page.locator('[data-command="claim-tier"]').count();
  if (hasClaimButton > 0) {
    await playerClick(page, '[data-command="claim-tier"]', 'Click the visible tier claim button');
    await playerWaitForHudValue(page, 'Workers', '2', 'Wait until the visible HUD shows the claimed worker reward', 10000);
    await playerWait(page, 250, 'Let the tier-claimed UI settle');
  }
  scenarios.push(await captureScenario(page, 'tier-claimed', 'Tier claimed goals panel'));

  await playerClick(page, '[data-panel="mix"]', 'Open Crop Mix panel after tier unlock');
  await playerFillSelector(page, '[data-mix-number="wheat"]', '40', 'Type a direct Wheat crop mix percentage');
  await playerPressSelector(page, '[data-mix="wheat"]', 'ArrowRight', 'Adjust wheat crop mix through the focused range input');
  await playerPressSelector(page, '[data-mix="carrot"]', 'ArrowLeft', 'Adjust carrot crop mix through the focused range input');
  await playerWait(page, 150, 'Let crop mix adjustment settle');
  scenarios.push(await captureScenario(page, 'crop-mix-adjusted', 'Crop mix adjusted through visible numeric and range controls'));

  await playerClick(page, '[data-panel="inventory"]', 'Open Inventory panel for sell controls');
  await page.waitForSelector('[data-command="sell-all"]', { state: 'visible', timeout: 1000 }).catch(() => null);
  const canSellAll = await page.locator('[data-command="sell-all"]').first().isEnabled().catch(() => false);
  if (canSellAll) {
    await playerClick(page, '[data-command="sell-all"]', 'Sell all visible stored crops through the Inventory panel');
    await playerWait(page, 150, 'Let the visible sale settle');
  }
  scenarios.push(await captureScenario(page, 'post-sale', 'Inventory sell controls exercised'));

  await playerSetViewport(page, { width: 1024, height: 720 }, 'Resize to compact desktop viewport');
  await playerWait(page, 150, 'Let compact layout settle');
  scenarios.push(await captureScenario(page, 'compact-desktop', 'Compact desktop viewport'));

  await playerWait(page, 15000, 'Watch the farm run at visible 4x speed for worker-care inspection');
  await playerWait(page, 250, 'Let worker-care UI settle');
  scenarios.push(await captureScenario(page, 'worker-care', 'Worker care priorities'));

  await playerReload(page, 'Reload browser to verify autosave through normal page reload');
  await playerWait(page, 250, 'Let the reloaded autosave state settle');
  scenarios.push(await captureScenario(page, 'post-reload', 'Autosave state after normal reload'));

  const run = {
    generatedAt: new Date().toISOString(),
    url,
    summary: {
      consoleErrors,
      pageErrors,
    },
    scenarios,
  };
  const findings = evaluatePlaytest(run);
  const annotations = buildAnnotations(run, findings);
  const replay = await recordReplayBundle(server, annotations);
  run.replay = replay.summary;
  const report = renderPlaytestMarkdown(run, findings);

  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify({ ...run, findings, annotations }, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), report);
  await fs.writeFile(path.join(outputDir, 'latest.annotations.json'), `${JSON.stringify(annotations, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.bundle.json'), `${JSON.stringify(replay.bundle)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.replay.json'), `${JSON.stringify(replay.data, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.replay.md'), replay.markdown);
  await fs.writeFile(path.join(outputDir, 'latest.replay.html'), renderReplayHtml(run, replay.data));

  console.log(JSON.stringify({
    report: path.relative(cwd, path.join(outputDir, 'latest.md')),
    data: path.relative(cwd, path.join(outputDir, 'latest.json')),
    annotations: path.relative(cwd, path.join(outputDir, 'latest.annotations.json')),
    replay: path.relative(cwd, path.join(outputDir, 'latest.replay.md')),
    replayViewer: path.relative(cwd, path.join(outputDir, 'latest.replay.html')),
    bundle: path.relative(cwd, path.join(outputDir, 'latest.bundle.json')),
    screenshots: path.relative(cwd, screenshotDir),
    findings: findings.map((finding) => ({ id: finding.id, severity: finding.severity, title: finding.title })),
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}

async function runPlayerSurfaceTour(page) {
  await playerClick(page, '[data-panel="inventory"]', 'Open Inventory panel');
  await playerClick(page, '[data-panel="goals"]', 'Open Goals panel');
  await playerWheelSelector(page, '[data-player-scroll="side-panel"]', 420, 'Scroll the visible side panel content down');
  await playerWait(page, 150, 'Let the scrolled side panel settle');
  scenarios.push(await captureScenario(page, 'side-panel-scrolled', 'Side panel after visible wheel scrolling'));
  await playerWheelSelector(page, '[data-player-scroll="side-panel"]', -420, 'Scroll the visible side panel content back up');
  await playerClick(page, '[data-panel="mix"]', 'Open Crop Mix panel');
  await playerClick(page, '[data-panel="inspect"]', 'Open Inspect panel');
  await playerDragResize(page, '[data-panel-resizer]', -88, 0, 'Drag the visible side-panel resize handle wider');
  await playerClick(page, '[data-command="toggle-panel"]', 'Collapse the visible side panel');
  await playerClick(page, '[data-command="toggle-panel"]', 'Expand the visible side panel');
  await playerClick(page, '[data-command="pause"]', 'Pause with the visible toolbar control');
  await playerPress(page, 'Space', 'Resume with the visible keyboard shortcut');
  await playerClick(page, '[data-speed="1"]', 'Switch to visible 1x speed');
  await playerClick(page, '[data-speed="2"]', 'Switch to visible 2x speed');
  await playerClick(page, '[data-speed="4"]', 'Return to visible 4x speed');
  await playerClick(page, '[data-tool="plot"]', 'Select Plot tool');
  await playerCanvasDrag(page, 390, 300, 72, 0, 'Drag-paint visible farm tiles with the Plot tool');
  await playerCanvasClick(page, 390, 300, 'Paint a plot on visible owned land');
  await playerClick(page, '[data-command="undo"]', 'Undo the plot paint through the visible toolbar');
  await playerClick(page, '[data-command="redo"]', 'Redo the plot paint through the visible toolbar');
  await playerClick(page, '[data-tool="well"]', 'Select Well tool');
  await playerCanvasClick(page, 535, 348, 'Place a well through a visible canvas click');
  await playerClick(page, '[data-tool="storage"]', 'Select Storage tool');
  await playerCanvasClick(page, 584, 348, 'Place storage through a visible canvas click');
  await playerClick(page, '[data-tool="land"]', 'Select Land tool');
  await playerCanvasClick(page, 342, 300, 'Buy adjacent land through a visible canvas click');
  await playerClick(page, '[data-tool="bulldoze"]', 'Select Bulldoze tool');
  await playerCanvasClick(page, 390, 300, 'Bulldoze the player-painted plot through the canvas');
  await playerClick(page, '[data-command="undo"]', 'Undo the bulldoze through the visible toolbar');
  await playerClick(page, '[data-tool="inspect"]', 'Select Inspect tool');
  await playerCanvasClick(page, 390, 300, 'Inspect a visible farm tile through the canvas');
  await playerWait(page, 150, 'Let the Inspect panel render selected tile details');
  scenarios.push(await captureScenario(page, 'inspect-tile', 'Inspect panel after visible tile selection'));
  await playerHoldKey(page, 'ArrowRight', 260, 'Pan the farm camera right with the keyboard');
  await playerWheelCanvas(page, -360, 'Zoom the farm camera with the mouse wheel');
  await playerClick(page, '[data-panel="goals"]', 'Return to Goals panel after the surface tour');
  await playerClick(page, '[data-speed="4"]', 'Keep the farm at visible 4x speed after the tour');
}

async function playerClick(page, selector, label) {
  await page.locator(selector).first().click();
  playerActions.push({ kind: 'click', label, selector });
}

async function playerCanvasClick(page, x, y, label) {
  await page.locator('canvas').first().click({ position: { x, y } });
  playerActions.push({ kind: 'click', label, selector: 'canvas', position: { x, y } });
}

async function playerCanvasDrag(page, x, y, deltaX, deltaY, label) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Cannot drag canvas; no visible bounds');
  const startX = box.x + x;
  const startY = box.y + y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
  await page.mouse.up();
  playerActions.push({ kind: 'drag', label, selector: 'canvas', position: { x, y }, deltaX, deltaY });
}

async function playerDragResize(page, selector, deltaX, deltaY, label) {
  const locator = page.locator(selector).first();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Cannot drag ${selector}; no visible bounds`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
  await page.mouse.up();
  playerActions.push({ kind: 'drag', label, selector, deltaX, deltaY });
}

async function playerWaitForSelector(page, selector, label, timeout) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  playerActions.push({ kind: 'waitForSelector', label, selector, timeout });
}

async function playerWaitForText(page, text, label, timeout) {
  await page.waitForFunction((expected) => document.body.textContent?.includes(expected), text, { timeout });
  playerActions.push({ kind: 'waitForText', label, text, timeout });
}

async function playerWaitForHudValue(page, hudLabel, value, label, timeout) {
  await page.waitForFunction(({ expectedLabel, expectedValue }) => (
    Array.from(document.querySelectorAll('#hud div')).some((item) => (
      item.querySelector('strong')?.textContent?.trim() === expectedLabel &&
      item.querySelector('span')?.textContent?.trim() === expectedValue
    ))
  ), { expectedLabel: hudLabel, expectedValue: value }, { timeout });
  playerActions.push({ kind: 'waitForHudValue', label, hudLabel, value, timeout });
}

async function playerPress(page, key, label) {
  await page.keyboard.press(key);
  playerActions.push({ kind: 'press', label, key });
}

async function playerHoldKey(page, key, durationMs, label) {
  await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(key);
  playerActions.push({ kind: 'press', label, key, durationMs });
}

async function playerPressSelector(page, selector, key, label) {
  await page.locator(selector).first().focus();
  await page.keyboard.press(key);
  playerActions.push({ kind: 'press', label, selector, key });
}

async function playerFillSelector(page, selector, value, label) {
  await page.locator(selector).first().fill(value);
  playerActions.push({ kind: 'fill', label, selector, value });
}

async function playerWheelCanvas(page, deltaY, label) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('Cannot wheel canvas; no visible bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  playerActions.push({ kind: 'wheel', label, selector: 'canvas', deltaY });
}

async function playerWheelSelector(page, selector, deltaY, label) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Cannot wheel ${selector}; no visible bounds`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  playerActions.push({ kind: 'wheel', label, selector, deltaY });
}

async function playerWait(page, ms, label) {
  await page.waitForTimeout(ms);
  playerActions.push({ kind: 'wait', label, ms });
}

async function playerSetViewport(page, viewport, label) {
  await page.setViewportSize(viewport);
  playerActions.push({ kind: 'viewport', label, viewport });
}

async function playerReload(page, label) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.toolbar .tool-button');
  await page.waitForSelector('canvas');
  playerActions.push({ kind: 'reload', label });
}

function consumeScenarioActions() {
  const actions = playerActions.slice(scenarioActionCursor);
  scenarioActionCursor = playerActions.length;
  return actions;
}

async function captureScenario(page, id, label) {
  const screenshotName = `${id}.png`;
  await page.screenshot({ path: path.join(screenshotDir, screenshotName), fullPage: false });
  const actionsSincePrevious = consumeScenarioActions();

  return page.evaluate(({ scenarioId, scenarioLabel, screenshotPath, playerActionsSincePrevious, playerActionSelector }) => {
    const state = window.__farmDebug.getState();
    const text = window.render_game_to_text();
    const tiles = Object.values(state.tiles);
    const unlockedCrops = state.tier.unlockedCrops.filter((cropId) => state.cropMix[cropId] > 0);
    const thirstyPlots = tiles.filter((tile) => (
      tile.kind === 'plot' &&
      tile.plot &&
      tile.plot.water <= 0 &&
      tile.plot.growth < state.crops[tile.plot.cropId].growTicks
    )).length;
    const hasWateringWorker = state.workers.some((worker) => worker.task.kind === 'watering');
    const activePlotTargets = state.workers
      .filter((worker) => (
        (worker.task.kind === 'planting' || worker.task.kind === 'watering' || worker.task.kind === 'harvesting') &&
        worker.task.target
      ))
      .map((worker) => `${worker.task.target.x},${worker.task.target.y}`);
    const duplicateWorkerTargetCount = activePlotTargets.length - new Set(activePlotTargets).size;
    const claimableMatch = text.match(/claimableTier=(\d+)/);
    const visibleText = visibleTextForPlayer();
    const availableActions = Array.from(document.querySelectorAll(playerActionSelector))
      .filter((element) => isVisible(element) && !element.disabled)
      .slice(0, 40)
      .map((element) => ({
        label: element.getAttribute('aria-label') || element.getAttribute('title') || compactText(element.textContent ?? ''),
        selector: playerSelectorFor(element),
        tagName: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || undefined,
        role: element.getAttribute('role') || undefined,
        actionHint: actionHintFor(element),
        state: controlStateFor(element),
        bounds: roundedBounds(element.getBoundingClientRect()),
      }));
    const keyboardActions = playerKeyboardActions();

    return {
      id: scenarioId,
      label: scenarioLabel,
      screenshot: screenshotPath,
      text,
      observation: {
        screenshot: screenshotPath,
        visibleText,
        availableActions,
        keyboardActions,
        playerActionsSincePrevious,
      },
      metrics: {
        tier: state.tier.level,
        tick: state.tick,
        workers: state.workers.length,
        claimableTier: claimableMatch ? Number(claimableMatch[1]) : 0,
        hasClaimButton: Boolean(document.querySelector('[data-command="claim-tier"]')),
        hasUnlockBanner: Boolean(document.querySelector('.tier-unlock-banner')),
        rewardChipCount: document.querySelectorAll('.reward-chip').length,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        toolbarButtons: document.querySelectorAll('.tool-button').length,
        maxToolbarButtonHeight: Math.max(0, ...Array.from(document.querySelectorAll('.tool-button')).map((button) => Math.round(button.getBoundingClientRect().height))),
        thirstyPlots,
        hasWateringWorker,
        duplicateWorkerTargetCount,
        plantedPlots: tiles.filter((tile) => tile.kind === 'plot' && tile.plot).length,
        emptyPlots: tiles.filter((tile) => tile.kind === 'plot' && !tile.plot).length,
        idleWorkers: state.workers.filter((worker) => worker.task.kind === 'idle').length,
        availableUnlockedSeeds: unlockedCrops.reduce((sum, cropId) => sum + state.inventory.seeds[cropId], 0),
        canBuyUnlockedSeeds: unlockedCrops.some((cropId) => state.coins >= state.crops[cropId].seedPrice),
        hasSeedGuidance: (document.body.textContent ?? '').includes('Buy seeds'),
        seedGuidanceActionCount: Array.from(document.querySelectorAll('[data-seed-guidance-action], [data-buy-seeds]:not([disabled])'))
          .filter((element) => isVisible(element) && !element.disabled)
          .length,
      },
    };

    function compactText(value) {
      return value.replace(/\s+/g, ' ').trim().slice(0, 2200);
    }

    function visibleTextForPlayer() {
      const fragments = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || !isTextContainerVisible(parent)) return NodeFilter.FILTER_REJECT;

          const range = document.createRange();
          range.selectNodeContents(node);
          const visible = Array.from(range.getClientRects()).some((rect) => isRectVisibleToPlayer(rect, parent));
          return visible ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });

      while (fragments.length < 180) {
        const node = walker.nextNode();
        if (!node) break;
        fragments.push(node.textContent ?? '');
      }

      return compactText(fragments.join(' '));
    }

    function playerKeyboardActions() {
      return [
        { label: 'Pan camera left', key: 'ArrowLeft', alternateKeys: ['A'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera right', key: 'ArrowRight', alternateKeys: ['D'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera up', key: 'ArrowUp', alternateKeys: ['W'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera down', key: 'ArrowDown', alternateKeys: ['S'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        ...toolbarShortcutKeyboardActions(),
      ];
    }

    function toolbarShortcutKeyboardActions() {
      return Array.from(document.querySelectorAll('.toolbar .tool-button'))
        .filter((button) => isVisible(button))
        .map((button) => {
          const shortcut = button.querySelector?.('.key')?.textContent?.trim();
          if (!shortcut) return null;
          const label = (
            button.getAttribute('aria-label') ||
            button.getAttribute('title') ||
            compactText(button.textContent ?? '')
          );
          return {
            label: shortcutKeyboardLabelFor(button, label),
            key: shortcut,
            alternateKeys: [],
            actionHint: 'press',
            selector: playerSelectorFor(button),
            state: {
              ...controlStateFor(button),
              canHold: false,
            },
          };
        })
        .filter(Boolean);
    }

    function shortcutKeyboardLabelFor(button, label) {
      if (button.matches('[data-tool]')) return `Select ${label} tool`;
      if (button.matches('[data-command="undo"]')) return 'Undo';
      if (button.matches('[data-command="redo"]')) return 'Redo';
      if (button.matches('[data-command="pause"]')) return label;
      if (button.matches('[data-speed]')) return `Set ${label}`;
      return label;
    }

    function isTextContainerVisible(element) {
      if (element.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function actionHintFor(element) {
      if (element.matches('[data-player-scroll]')) return 'scroll';
      if (element.matches('canvas')) return 'click-or-drag-canvas-coordinate';
      if (element.matches('[role="separator"]')) return 'drag-resize';
      if (element.matches('input[type="range"]')) return 'adjust';
      if (element.matches('input[type="number"]')) return 'adjust';
      return 'click';
    }

    function controlStateFor(element) {
      const state = {};
      state.active = element.classList.contains('active');
      const shortcut = element.querySelector?.('.key')?.textContent?.trim();
      if (shortcut) state.shortcut = shortcut;
      const ariaPressed = element.getAttribute('aria-pressed');
      if (ariaPressed !== null) state.pressed = ariaPressed;
      const ariaExpanded = element.getAttribute('aria-expanded');
      if (ariaExpanded !== null) state.expanded = ariaExpanded;
      if (element instanceof HTMLInputElement) {
        state.value = element.value;
        if (element.min !== '') state.min = element.min;
        if (element.max !== '') state.max = element.max;
        if (element.step !== '') state.step = element.step;
      }
      if (element instanceof HTMLElement && element.matches('[data-player-scroll]')) {
        const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
        state.scrollTop = Math.round(element.scrollTop);
        state.clientHeight = Math.round(element.clientHeight);
        state.scrollHeight = Math.round(element.scrollHeight);
        state.canScrollUp = element.scrollTop > 1;
        state.canScrollDown = element.scrollTop < maxScrollTop - 1;
      }
      return state;
    }

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        isRectVisibleToPlayer(rect, element)
      );
    }

    function isRectVisibleToPlayer(rect, element) {
      const clip = visibleClipFor(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > clip.left &&
        rect.left < clip.right &&
        rect.bottom > clip.top &&
        rect.top < clip.bottom
      );
    }

    function visibleClipFor(element) {
      let clip = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };

      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clips = /(auto|scroll|hidden|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
        if (clips) {
          const rect = ancestor.getBoundingClientRect();
          clip = {
            left: Math.max(clip.left, rect.left),
            top: Math.max(clip.top, rect.top),
            right: Math.min(clip.right, rect.right),
            bottom: Math.min(clip.bottom, rect.bottom),
          };
        }
      }

      return clip;
    }

    function roundedBounds(rect) {
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    function playerSelectorFor(element) {
      const dataAttribute = Array.from(element.attributes).find((attribute) => (
        attribute.name.startsWith('data-') && attribute.name !== 'data-tutorial-tip'
      ));
      if (dataAttribute) {
        return dataAttribute.value
          ? `[${dataAttribute.name}="${escapeAttributeValue(dataAttribute.value)}"]`
          : `[${dataAttribute.name}]`;
      }
      if (element.id) return `#${CSS.escape(element.id)}`;
      if (element.getAttribute('role')) return `[role="${CSS.escape(element.getAttribute('role'))}"]`;
      return element.tagName.toLowerCase();
    }

    function escapeAttributeValue(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
  }, {
    scenarioId: id,
    scenarioLabel: label,
    screenshotPath: path.join('screenshots', screenshotName).replaceAll('\\', '/'),
    playerActionsSincePrevious: actionsSincePrevious,
    playerActionSelector: PLAYER_ACTION_SELECTOR,
  });
}

async function recordReplayBundle(server, annotations) {
  const farm = await server.ssrLoadModule('/src/game/simulation/farmGame.ts');
  const {
    advanceFarm,
    createFarmGame,
    getFarmSnapshot,
    renderFarmToText,
    submitFarmCommand,
  } = farm;

  const game = createFarmGame({ seed: 'llm-replay' });
  const recorder = new SessionRecorder({ world: game, snapshotInterval: 60 });
  const markers = [];

  recorder.connect();
  addMarker('fresh-start', 'Fresh farm booted for LLM replay inspection.');

  for (let i = 0; i < 900; i += 1) {
    advanceFarm(game, 1);
    const state = getFarmSnapshot(game);
    const harvested = Object.values(state.stats.lifetimeHarvested).reduce((sum, value) => sum + value, 0);
    if (harvested >= 10) break;
  }
  addMarker('tier-ready', 'First milestone reached; tier should be claimable but not auto-claimed.');

  for (const annotation of annotations.filter((entry) => entry.scenarioId === 'tier-ready')) {
    addMarker(annotation.id, `Improvement: ${annotation.title}. ${annotation.recommendation}`);
  }

  submitFarmCommand(game, { type: 'claimNextTier' });
  advanceFarm(game, 1);
  addMarker('tier-claimed', 'Player claim command applied; tier rewards should now be visible in state.');

  advanceFarm(game, 240);
  addMarker('worker-care', 'Post-claim worker-care window for planting, watering, harvesting, and hauling inspection.');

  recorder.disconnect();
  const bundle = recorder.toBundle();
  const replayer = SessionReplayer.fromBundle(bundle, {
    worldFactory: (snapshot) => {
      const replayGame = createFarmGame({ seed: 'llm-replay' });
      replayGame.applySnapshot(snapshot);
      return replayGame;
    },
  });
  const selfCheck = replayer.selfCheck({ stopOnFirstDivergence: true });
  const sampleTicks = [...new Set([
    bundle.metadata.startTick,
    ...markers.map((marker) => marker.tick),
    bundle.metadata.endTick,
  ])].sort((a, b) => a - b);
  const samples = sampleTicks.map((tick) => {
    const world = replayer.openAt(tick);
    const state = getFarmSnapshot(world);
    return {
      tick,
      text: renderFarmToText(world),
      tier: state.tier.level,
      workers: state.workers.length,
      workerTasks: state.workers.map((worker) => `${worker.id}:${worker.task.kind}:${worker.task.phase ?? 'none'}`),
      plantedPlots: Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && tile.plot).length,
      emptyPlots: Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && !tile.plot).length,
    };
  });
  const data = {
    summary: bundleSummary(bundle),
    selfCheck,
    markers,
    samples,
  };

  return {
    bundle,
    data,
    summary: {
      bundle: 'latest.bundle.json',
      report: 'latest.replay.md',
      selfCheckOk: selfCheck.ok,
      markerCount: markers.length,
      sampleTicks,
    },
    markdown: renderReplayMarkdown(data),
  };

  function addMarker(id, text) {
    const state = getFarmSnapshot(game);
    const tick = state.tick;
    recorder.addMarker({
      kind: 'annotation',
      text,
      refs: { tickRange: { from: tick, to: tick } },
    });
    markers.push({
      id,
      tick,
      text,
      state: renderFarmToText(game),
    });
  }
}

function renderReplayMarkdown(data) {
  const lines = [
    '# LLM Playtest Replay',
    '',
    `Self-check: ${data.selfCheck.ok ? 'ok' : 'failed'}`,
    `Duration ticks: ${data.summary.durationTicks}`,
    `Markers: ${data.markers.length}`,
    '',
    '## Markers',
    '',
  ];

  for (const marker of data.markers) {
    lines.push(`- tick ${marker.tick}: ${marker.id} - ${marker.text}`);
  }

  lines.push('');
  lines.push('## Sampled State');
  lines.push('');

  for (const sample of data.samples) {
    lines.push(`### Tick ${sample.tick}`);
    lines.push('');
    lines.push(`- ${sample.text}`);
    lines.push(`- worker tasks: ${sample.workerTasks.join(', ') || 'none'}`);
    lines.push(`- plots: ${sample.plantedPlots} planted, ${sample.emptyPlots} empty`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderReplayHtml(run, replayData) {
  const scenariosJson = JSON.stringify(run.scenarios ?? []);
  const replayJson = JSON.stringify(replayData);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Farm LLM Replay</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #050505; color: #f4f4f4; }
      body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
      main { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; }
      img { width: 100%; height: 100%; object-fit: contain; background: #0b0b0b; }
      aside { border-left: 1px solid rgba(255,255,255,.18); padding: 14px; overflow: auto; background: rgba(255,255,255,.04); }
      button { border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); color: inherit; padding: 6px 10px; border-radius: 4px; cursor: pointer; }
      button:hover, button.active { background: rgba(255,255,255,.18); }
      .strip { display: flex; gap: 6px; padding: 8px; border-top: 1px solid rgba(255,255,255,.16); overflow-x: auto; background: rgba(255,255,255,.04); }
      .meta { color: #bcbcbc; font-size: 12px; line-height: 1.45; }
      pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; background: rgba(255,255,255,.06); padding: 8px; border-radius: 4px; }
      li { margin: 8px 0; }
    </style>
  </head>
  <body>
    <main>
      <img id="frame" alt="Replay screenshot" />
      <div class="strip" id="strip"></div>
    </main>
    <aside>
      <h1>LLM Replay</h1>
      <p class="meta" id="frameMeta"></p>
      <h2>Scenario State</h2>
      <pre id="state"></pre>
      <h2>Replay Markers</h2>
      <ul id="markers"></ul>
      <h2>Sampled Replay</h2>
      <pre id="samples"></pre>
    </aside>
    <script>
      const scenarios = ${scenariosJson};
      const replay = ${replayJson};
      let index = 0;
      const frame = document.getElementById('frame');
      const strip = document.getElementById('strip');
      const frameMeta = document.getElementById('frameMeta');
      const state = document.getElementById('state');
      const markers = document.getElementById('markers');
      const samples = document.getElementById('samples');
      for (const [i, scenario] of scenarios.entries()) {
        const button = document.createElement('button');
        button.textContent = scenario.id;
        button.addEventListener('click', () => show(i));
        strip.append(button);
      }
      markers.innerHTML = replay.markers.map((marker) => '<li><strong>tick ' + marker.tick + '</strong><br />' + marker.text + '</li>').join('');
      samples.textContent = replay.samples.map((sample) => 'tick ' + sample.tick + ': ' + sample.text + '\\nworkers: ' + sample.workerTasks.join(', ')).join('\\n\\n');
      function show(next) {
        index = next;
        const scenario = scenarios[index];
        frame.src = scenario.screenshot;
        frameMeta.textContent = scenario.label + ' / ' + scenario.screenshot;
        state.textContent = scenario.text + '\\n\\nObservation:\\n' + JSON.stringify(scenario.observation ?? {}, null, 2) + '\\n\\nMetrics:\\n' + JSON.stringify(scenario.metrics, null, 2);
        [...strip.children].forEach((button, i) => button.classList.toggle('active', i === index));
      }
      show(0);
      setInterval(() => show((index + 1) % scenarios.length), 3500);
    </script>
  </body>
</html>
`;
}
