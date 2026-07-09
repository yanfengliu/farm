import { createImprovementRunManifest } from 'civ-engine';

// Pure decisions for the proposal-only recursive pass (scripts/playtest-recursive.mjs).
// farm has no auto-apply arm by design: the pass surfaces the top fix-classified
// finding and the driving agent is the fix arm (fix, rerun, compare ledgers).
// Outcome vocabulary matches aoe2's recursive pass where applicable.

const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const FIX_ACTIONS = new Set(['autoFix', 'manualFix']);
const CLOSED_DISPOSITIONS = new Set(['rejected', 'wontFix']);

export function selectFixCandidate(findings) {
  const open = (findings ?? []).filter(
    (finding) =>
      FIX_ACTIONS.has(finding?.nextAction) &&
      !CLOSED_DISPOSITIONS.has(finding?.disposition ?? 'candidate'),
  );
  open.sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
  return open[0] ?? null;
}

export function passOutcome(candidate) {
  return candidate ? 'proposal-only' : 'no-fix-candidate';
}

export function buildPassManifest(input) {
  const outcome = passOutcome(input.candidate);
  return createImprovementRunManifest({
    id: input.id,
    gameId: 'farm',
    objective: 'Recursive self-improvement pass over the visual loop (proposal-only).',
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    stopReason: outcome,
    provider: input.provider ?? 'local-heuristic',
    artifacts: (input.artifacts ?? []).map((artifact) => ({ ...artifact })),
    tags: ['farm', 'recursive-pass'],
    data: {
      outcome,
      ...(input.candidate ? { candidateFindingId: input.candidate.id } : {}),
      ...(input.verification !== undefined && input.verification !== null
        ? { verification: input.verification }
        : {}),
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
    },
  });
}
