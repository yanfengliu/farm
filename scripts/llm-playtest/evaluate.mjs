const severityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function evaluatePlaytest(run) {
  const findings = [];
  const consoleErrors = run.summary?.consoleErrors ?? [];
  const pageErrors = run.summary?.pageErrors ?? [];

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    findings.push({
      id: 'browser-errors',
      severity: 'P0',
      title: 'Browser errors occurred during playtest',
      evidence: [...pageErrors, ...consoleErrors].slice(0, 6).join('\n'),
      recommendation: 'Fix runtime errors before judging gameplay feel.',
    });
  }

  for (const scenario of run.scenarios ?? []) {
    const metrics = scenario.metrics ?? {};

    if (metrics.horizontalOverflow > 0) {
      findings.push({
        id: `${scenario.id}-horizontal-overflow`,
        severity: 'P1',
        scenarioId: scenario.id,
        screenshot: scenario.screenshot,
        title: `${scenario.label} overflows horizontally`,
        evidence: `Observed ${metrics.horizontalOverflow}px horizontal overflow in ${scenario.id}.`,
        recommendation: 'Tighten fixed widths or allow panel content to wrap within the viewport.',
      });
    }

    if (scenario.id === 'tier-ready' && metrics.hasClaimButton) {
      if (!metrics.hasUnlockBanner) {
        findings.push({
          id: 'tier-ready-banner-missing',
          severity: 'P1',
          scenarioId: scenario.id,
          screenshot: scenario.screenshot,
          title: 'Tier-ready state lacks a proud unlock banner',
          evidence: 'The tier is claimable, but the Goals panel does not expose a dedicated celebratory banner.',
          recommendation: 'Replace the plain unlock row with a glassy tier-ready banner, decorations, and a prominent claim action.',
        });
      }

      if ((metrics.rewardChipCount ?? 0) < 3) {
        findings.push({
          id: 'tier-unlock-details-thin',
          severity: 'P1',
          scenarioId: scenario.id,
          screenshot: scenario.screenshot,
          title: 'Tier unlock details are too thin',
          evidence: `Only ${metrics.rewardChipCount ?? 0} reward detail item(s) were detected.`,
          recommendation: 'List concrete unlocks such as new crop, worker count, seed bundle, and crop mix change.',
        });
      }

      if (metrics.tier > 1 || metrics.workers > 1) {
        findings.push({
          id: 'tier-auto-claimed',
          severity: 'P0',
          scenarioId: scenario.id,
          screenshot: scenario.screenshot,
          title: 'Tier rewards applied before player claim',
          evidence: `Tier ${metrics.tier}, workers ${metrics.workers}, claimable tier ${metrics.claimableTier}.`,
          recommendation: 'Keep milestone completion separate from tier claiming.',
        });
      }
    }

    if (scenario.id === 'worker-care' && metrics.thirstyPlots > 0 && !metrics.hasWateringWorker) {
      findings.push({
        id: 'worker-care-priority-missing',
        severity: 'P1',
        scenarioId: scenario.id,
        screenshot: scenario.screenshot,
        title: 'Workers are not visibly prioritizing thirsty crops',
        evidence: `${metrics.thirstyPlots} thirsty plot(s), watering worker present: ${metrics.hasWateringWorker}.`,
        recommendation: 'Prioritize watering growing crops before assigning new planting tasks.',
      });
    }

    if (scenario.id === 'worker-care' && (metrics.duplicateWorkerTargetCount ?? 0) > 0) {
      findings.push({
        id: 'worker-duplicate-targets',
        severity: 'P1',
        scenarioId: scenario.id,
        screenshot: scenario.screenshot,
        title: 'Workers are duplicating the same plot target',
        evidence: `${metrics.duplicateWorkerTargetCount} duplicate active worker target(s) were detected.`,
        recommendation: 'Reserve active plot targets so extra workers choose different planting, watering, or harvesting jobs when work is available.',
      });
    }

    if (
      scenario.id === 'worker-care' &&
      metrics.idleWorkers > 0 &&
      metrics.emptyPlots > 0 &&
      metrics.availableUnlockedSeeds === 0 &&
      metrics.canBuyUnlockedSeeds &&
      !metrics.hasSeedGuidance
    ) {
      findings.push({
        id: 'seed-shortage-guidance-missing',
        severity: 'P2',
        scenarioId: scenario.id,
        screenshot: scenario.screenshot,
        title: 'Idle seed shortage lacks player guidance',
        evidence: `${metrics.idleWorkers} idle worker(s), ${metrics.emptyPlots} empty plot(s), and no unlocked seeds available while coins can buy seeds.`,
        recommendation: 'Show a compact alert or panel hint that tells the player to buy seeds when farmers are waiting on seed stock.',
      });
    }

    if (
      scenario.id === 'worker-care' &&
      metrics.idleWorkers > 0 &&
      metrics.emptyPlots > 0 &&
      metrics.availableUnlockedSeeds === 0 &&
      metrics.canBuyUnlockedSeeds &&
      metrics.hasSeedGuidance &&
      (metrics.seedGuidanceActionCount ?? 0) === 0
    ) {
      findings.push({
        id: 'seed-shortage-action-missing',
        severity: 'P2',
        scenarioId: scenario.id,
        screenshot: scenario.screenshot,
        title: 'Seed shortage guidance is not actionable',
        evidence: 'The worker-care state explains that farmers need seeds, but no visible seed-buy action is attached to the hint.',
        recommendation: 'Add a compact buy-seeds action to the visible guidance so the player can resolve the stall without hunting through panels.',
      });
    }
  }

  const scenariosById = new Map((run.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  const workerCare = scenariosById.get('worker-care');
  const postReload = scenariosById.get('post-reload');
  if (workerCare?.metrics && postReload?.metrics) {
    const before = workerCare.metrics;
    const after = postReload.metrics;
    const reloadedFreshFarm = (
      (Number(after.tier ?? 0) < Number(before.tier ?? 0)) ||
      (Number(after.workers ?? 0) < Number(before.workers ?? 0)) ||
      (Number(after.tick ?? 0) < Math.max(0, Number(before.tick ?? 0) - 120))
    );

    if (reloadedFreshFarm) {
      findings.push({
        id: 'autosave-reload-lost-state',
        severity: 'P1',
        scenarioId: postReload.id,
        screenshot: postReload.screenshot,
        title: 'Reload did not preserve the autosaved farm',
        evidence: `Before reload: tick ${before.tick}, tier ${before.tier}, workers ${before.workers}. After reload: tick ${after.tick}, tier ${after.tier}, workers ${after.workers}.`,
        recommendation: 'Keep the browser playtest clean boot from clearing localStorage during reload, and verify the farm autosave payload restores progress.',
      });
    }
  }

  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id));
}

export function buildAnnotations(run, findings) {
  const scenariosById = new Map((run.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  return findings.map((finding) => {
    const scenario = scenariosById.get(finding.scenarioId);
    return {
      id: finding.id,
      kind: 'improvement',
      severity: finding.severity,
      title: finding.title,
      scenarioId: finding.scenarioId ?? 'run',
      replayTick: scenario?.metrics?.tick ?? null,
      screenshot: finding.screenshot ?? scenario?.screenshot ?? null,
      evidence: finding.evidence,
      recommendation: finding.recommendation,
      status: 'open',
    };
  });
}

export function renderPlaytestMarkdown(run, findings) {
  const lines = [
    '# LLM Playtest Report',
    '',
    `Generated: ${run.generatedAt}`,
    '',
    '## How To Read This',
    '',
    'This report is written for an LLM or developer to review like a player: inspect the screenshots, compare the structured state to the visible UI, then implement the highest-impact findings.',
    '',
    '## Findings',
    '',
  ];

  if (findings.length === 0) {
    lines.push('No automated findings. Review the screenshots for subjective feel and polish.');
  } else {
    for (const finding of findings) {
      lines.push(`### ${finding.severity} ${finding.id}`);
      lines.push('');
      lines.push(`**${finding.title}**`);
      lines.push('');
      lines.push(`Evidence: ${finding.evidence || 'No additional evidence.'}`);
      lines.push('');
      lines.push(`Recommendation: ${finding.recommendation}`);
      lines.push('');
    }
  }

  lines.push('## Scenario Evidence');
  lines.push('');

  for (const scenario of run.scenarios ?? []) {
    lines.push(`### ${scenario.label}`);
    lines.push('');
    lines.push(`- id: \`${scenario.id}\``);
    if (scenario.screenshot) lines.push(`- screenshot: \`${scenario.screenshot}\``);
    if (scenario.text) lines.push(`- text: \`${scenario.text}\``);
    if (scenario.observation) {
      lines.push('- Visible Observation:');
      if (scenario.observation.visibleText) {
        lines.push(`  - visibleText: \`${truncate(scenario.observation.visibleText, 420)}\``);
      }
      if ((scenario.observation.playerActionsSincePrevious ?? []).length > 0) {
        lines.push('  - playerActionsSincePrevious:');
        for (const action of scenario.observation.playerActionsSincePrevious) {
          lines.push(`    - ${action.kind}: ${action.label}${action.selector ? ` (${action.selector})` : ''}`);
        }
      }
      if ((scenario.observation.availableActions ?? []).length > 0) {
        lines.push('  - availableActions:');
        for (const action of scenario.observation.availableActions.slice(0, 16)) {
          lines.push(`    - ${formatAvailableAction(action)}`);
        }
      }
      if ((scenario.observation.keyboardActions ?? []).length > 0) {
        lines.push('  - keyboardActions:');
        for (const action of scenario.observation.keyboardActions) {
          lines.push(`    - ${formatKeyboardAction(action)}`);
        }
      }
    }
    lines.push('- metrics:');
    for (const [key, value] of Object.entries(scenario.metrics ?? {})) {
      lines.push(`  - ${key}: ${JSON.stringify(value)}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function formatAvailableAction(action) {
  const label = action.label || 'Unlabeled action';
  const hint = action.actionHint ? ` | ${action.actionHint}` : '';
  const state = action.state ? ` | state ${JSON.stringify(action.state)}` : '';
  return `${label}: \`${action.selector}\`${hint}${state}`;
}

function formatKeyboardAction(action) {
  const alternates = action.alternateKeys?.length ? ` | alternate keys ${action.alternateKeys.join(', ')}` : '';
  const state = action.state ? ` | state ${JSON.stringify(action.state)}` : '';
  return `${action.label}: \`${action.key}\`${alternates} | ${action.actionHint}${state}`;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}
