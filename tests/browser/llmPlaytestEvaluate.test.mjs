import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  buildAnnotations,
  evaluatePlaytest,
  renderPlaytestMarkdown,
} from '../../scripts/llm-playtest/evaluate.mjs';

const baseRun = {
  generatedAt: '2026-07-04T00:00:00.000Z',
  summary: {
    consoleErrors: [],
    pageErrors: [],
  },
  scenarios: [
    {
      id: 'tier-ready',
      label: 'Tier ready goals panel',
      text: 'tick=656 workers=1 tier=1 claimableTier=2',
      screenshot: 'tier-ready.png',
      metrics: {
        tick: 656,
        tier: 1,
        workers: 1,
        claimableTier: 2,
        hasClaimButton: true,
        hasUnlockBanner: false,
        rewardChipCount: 1,
        horizontalOverflow: 0,
      },
    },
  ],
};

describe('LLM playtest evaluator', () => {
  test('flags tier claim UI that lacks a celebratory banner and detailed unlocks', () => {
    const findings = evaluatePlaytest(baseRun);

    expect(findings.map((finding) => finding.id)).toContain('tier-ready-banner-missing');
    expect(findings.map((finding) => finding.id)).toContain('tier-unlock-details-thin');
  });

  test('renders an LLM-readable markdown report with evidence and findings', () => {
    const findings = evaluatePlaytest(baseRun);
    const markdown = renderPlaytestMarkdown(baseRun, findings);

    expect(markdown).toContain('# LLM Playtest Report');
    expect(markdown).toContain('tier-ready-banner-missing');
    expect(markdown).toContain('tick=656 workers=1 tier=1 claimableTier=2');
  });

  test('renders visible observations and player actions for LLM control', () => {
    const run = {
      ...baseRun,
      scenarios: [
        {
          ...baseRun.scenarios[0],
          observation: {
            screenshot: 'tier-ready.png',
            visibleText: 'Coins 25 Storage 9/15 Workers 1 Tier Ready Claim Rewards',
            availableActions: [
              { label: 'Claim Rewards', selector: '[data-command="claim-tier"]', bounds: { x: 900, y: 300, width: 120, height: 28 } },
            ],
            playerActionsSincePrevious: [
              { kind: 'click', label: 'Open Goals panel', selector: '[data-panel="goals"]' },
            ],
          },
        },
      ],
    };

    const markdown = renderPlaytestMarkdown(run, []);

    expect(markdown).toContain('Visible Observation');
    expect(markdown).toContain('Claim Rewards');
    expect(markdown).toContain('[data-command="claim-tier"]');
    expect(markdown).toContain('Open Goals panel');
  });

  test('renders action hints and control state in visible observations', () => {
    const run = {
      ...baseRun,
      scenarios: [
        {
          ...baseRun.scenarios[0],
          observation: {
            screenshot: 'crop-mix.png',
            visibleText: 'Crop Mix 100% allocated',
            availableActions: [
              {
                label: 'Set Wheat crop mix percentage',
                selector: '[data-mix-number="wheat"]',
                actionHint: 'adjust',
                state: { value: '40', min: '0', max: '100', active: false },
              },
            ],
            playerActionsSincePrevious: [],
          },
        },
      ],
    };

    const markdown = renderPlaytestMarkdown(run, []);

    expect(markdown).toContain('[data-mix-number="wheat"]');
    expect(markdown).toContain('adjust');
    expect(markdown).toContain('"value":"40"');
  });

  test('renders every available player action in the Markdown review packet', async () => {
    const source = await readFile('scripts/llm-playtest/evaluate.mjs', 'utf8');

    expect(source).not.toContain('scenario.observation.availableActions.slice');
  });

  test('renders keyboard controls in visible observations', () => {
    const run = {
      ...baseRun,
      scenarios: [
        {
          ...baseRun.scenarios[0],
          observation: {
            screenshot: 'farm.png',
            visibleText: 'Farm canvas',
            availableActions: [],
            keyboardActions: [
              {
                label: 'Pan camera right',
                key: 'ArrowRight',
                alternateKeys: ['D'],
                actionHint: 'press',
              },
            ],
            playerActionsSincePrevious: [],
          },
        },
      ],
    };

    const markdown = renderPlaytestMarkdown(run, []);

    expect(markdown).toContain('keyboardActions');
    expect(markdown).toContain('Pan camera right');
    expect(markdown).toContain('ArrowRight');
    expect(markdown).toContain('D');
  });

  test('converts findings into improvement annotations anchored to scenario evidence', () => {
    const findings = evaluatePlaytest(baseRun);
    const annotations = buildAnnotations(baseRun, findings);

    expect(annotations[0]).toMatchObject({
      kind: 'improvement',
      scenarioId: 'tier-ready',
      replayTick: 656,
      screenshot: 'tier-ready.png',
    });
    expect(annotations.map((annotation) => annotation.id)).toContain('tier-ready-banner-missing');
  });

  test('flags idle workers that need a visible seed buying prompt', () => {
    const run = {
      ...baseRun,
      scenarios: [
        {
          id: 'worker-care',
          label: 'Worker care priorities',
          text: 'tick=2048 workers=2 seeds=carrot:0,wheat:0,tomato:0',
          screenshot: 'worker-care.png',
          metrics: {
            tick: 2048,
            idleWorkers: 2,
            emptyPlots: 3,
            availableUnlockedSeeds: 0,
            canBuyUnlockedSeeds: true,
            hasSeedGuidance: false,
            horizontalOverflow: 0,
            thirstyPlots: 0,
            hasWateringWorker: false,
          },
        },
      ],
    };

    const findings = evaluatePlaytest(run);

    expect(findings.map((finding) => finding.id)).toContain('seed-shortage-guidance-missing');
  });

  test('flags seed shortage guidance that lacks an immediate buy action', () => {
    const run = {
      ...baseRun,
      scenarios: [
        {
          id: 'worker-care',
          label: 'Worker care priorities',
          text: 'tick=2048 workers=2 seeds=carrot:0,wheat:0,tomato:0',
          screenshot: 'worker-care.png',
          metrics: {
            tick: 2048,
            idleWorkers: 2,
            emptyPlots: 3,
            availableUnlockedSeeds: 0,
            canBuyUnlockedSeeds: true,
            hasSeedGuidance: true,
            seedGuidanceActionCount: 0,
            horizontalOverflow: 0,
            thirstyPlots: 0,
            hasWateringWorker: false,
          },
        },
      ],
    };

    const findings = evaluatePlaytest(run);

    expect(findings.map((finding) => finding.id)).toContain('seed-shortage-action-missing');
  });

  test('flags workers duplicating the same active plot target', () => {
    const run = {
      ...baseRun,
      scenarios: [
        {
          id: 'worker-care',
          label: 'Worker care priorities',
          text: 'tick=320 workers=2',
          screenshot: 'worker-care.png',
          metrics: {
            tick: 320,
            idleWorkers: 0,
            emptyPlots: 3,
            availableUnlockedSeeds: 4,
            canBuyUnlockedSeeds: true,
            hasSeedGuidance: false,
            horizontalOverflow: 0,
            thirstyPlots: 0,
            hasWateringWorker: false,
            duplicateWorkerTargetCount: 1,
          },
        },
      ],
    };

    const findings = evaluatePlaytest(run);

    expect(findings.map((finding) => finding.id)).toContain('worker-duplicate-targets');
  });

  test('flags reload checks that lose the autosaved farm state', () => {
    const run = {
      ...baseRun,
      scenarios: [
        {
          id: 'worker-care',
          label: 'Worker care priorities',
          text: 'tick=1200 workers=2 tier=2',
          screenshot: 'worker-care.png',
          metrics: {
            tick: 1200,
            tier: 2,
            workers: 2,
            horizontalOverflow: 0,
            thirstyPlots: 0,
            hasWateringWorker: false,
            duplicateWorkerTargetCount: 0,
          },
        },
        {
          id: 'post-reload',
          label: 'Autosave state after normal reload',
          text: 'tick=5 workers=1 tier=1',
          screenshot: 'post-reload.png',
          metrics: {
            tick: 5,
            tier: 1,
            workers: 1,
            horizontalOverflow: 0,
            thirstyPlots: 0,
            hasWateringWorker: false,
            duplicateWorkerTargetCount: 0,
          },
        },
      ],
    };

    const findings = evaluatePlaytest(run);

    expect(findings.map((finding) => finding.id)).toContain('autosave-reload-lost-state');
  });
});
