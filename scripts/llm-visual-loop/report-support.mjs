// Pure helpers shared by the improvement report: identity, evidence shaping,
// action tallies, and JSON hygiene. Nothing here reads a run's findings or
// compares runs, so this module stays free of the report's own imports.

export function stableRunId(run) {
  const startedAt = run.generatedAt ?? 'unknown-start';
  return `farm-visual-loop-${startedAt.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '') || 'unknown'}`;
}

export function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }

export function actionCounts(steps) {
  const counts = {};
  for (const step of steps) {
    const kind = step.decision?.action?.kind;
    if (!kind) continue;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export function actionCountDelta(previous, current) {
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
  return Object.fromEntries(keys.map((key) => [key, Number(current[key] ?? 0) - Number(previous[key] ?? 0)]));
}

export function hasActionableGuidance(visibleText) {
  return /FARM GUIDE (Open Goals|Buy Seeds|Claim|Tune Crop Mix|Add (?:Tomatoes|Pumpkins) To Mix|Open Inventory|Sell Crops|Select Plot|Paint Empty Land|Meet The Village|Pin A Neighbor Basket)|Restock seeds|Paint plots on empty land|Tier \d+ ready|Active basket|Harvest the missing crops/i.test(visibleText);
}

export function stepEvidence(step, extra = []) {
  return [
    { kind: 'step', step: Number(step.index ?? 0) },
    ...(step.observation?.screenshot ? [{ kind: 'screenshot', step: Number(step.index ?? 0), screenshotPath: step.observation.screenshot }] : []),
    ...(step.observation?.visibleText ? [textEvidence('visible text', step.observation.visibleText)] : []),
    ...extra,
  ];
}

export function finalObservationEvidence(run) {
  return [
    ...(run.finalObservation?.screenshot ? [{ kind: 'screenshot', screenshotPath: run.finalObservation.screenshot }] : []),
    ...(run.finalObservation?.visibleText ? [textEvidence('final visible text', run.finalObservation.visibleText)] : []),
  ];
}

export function textEvidence(label, value) {
  return { kind: 'text', label, value: String(value).slice(0, 4000) };
}

export function metricEvidence(label, value) {
  return [{ kind: 'metric', label, value: String(value) }];
}

export function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function formatEvidence(evidence) {
  if (evidence.kind === 'screenshot') return `screenshot:${evidence.screenshotPath}`;
  if (evidence.kind === 'step') return `step:${evidence.step}`;
  if (evidence.kind === 'metric') return `${evidence.label}=${evidence.value}`;
  if (evidence.kind === 'text') return `${evidence.label}=${JSON.stringify(evidence.value)}`;
  return `${evidence.kind}:${evidence.label ?? evidence.value ?? ''}`;
}

export function jsonSafe(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .map(([key, entryValue]) => [key, withoutUndefined(entryValue)]));
}
