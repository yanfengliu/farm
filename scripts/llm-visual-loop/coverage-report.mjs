// coverage-report: the deterministic curriculum signal. Controls the player
// could repeatedly see but the run never exercised become
// 'coverage-gap:<selector>' findings whose FIX is teaching the local visual
// player (or adding a scenario) to reach them — the loop grows its own
// coverage through the normal candidate cycle instead of new machinery.
// Identity is the player selector: observations offer controls keyed by
// `selector`, and decisions that target a control carry `action.selector`
// (selectorless kinds — wait/stop/viewport/camera presses — target no
// offered control, which is why the guard below skips them).

// A control must be visible in this many OBSERVATIONS before its absence
// from the exercised set counts as a gap — transient controls are not
// curriculum. Sightings count once per observation even when several
// elements share a selector ("Sell 1"/"Sell 5" share [data-sell="carrot"]).
export const COVERAGE_MIN_SIGHTINGS = 3;

export function coverageLedger(steps) {
  const offered = new Map();
  const exercised = new Set();
  for (const step of steps ?? []) {
    const seenThisStep = new Set();
    for (const action of step.observation?.availableActions ?? []) {
      const key = typeof action?.selector === 'string' ? action.selector : null;
      if (!key || seenThisStep.has(key)) continue;
      seenThisStep.add(key);
      const entry = offered.get(key) ?? { label: action.label || key, sightings: 0 };
      entry.sightings += 1;
      offered.set(key, entry);
    }
    const acted = step.decision?.action;
    if (acted && typeof acted.selector === 'string' && acted.kind !== 'wait') {
      exercised.add(acted.selector);
    }
  }
  // Deterministic order (sightings desc, then key) so the emission cap in the
  // report never drops a class between reruns by trajectory accident — an
  // unstable top-N would let an unexercised class vanish from the next run's
  // findings and read as falsely resolved.
  const gaps = [...offered.entries()]
    .filter(([key, entry]) => !exercised.has(key) && entry.sightings >= COVERAGE_MIN_SIGHTINGS)
    .map(([key, entry]) => ({ key, label: entry.label, sightings: entry.sightings }))
    .sort((a, b) => b.sightings - a.sightings || (a.key < b.key ? -1 : 1));
  return { offered: offered.size, exercised: exercised.size, gaps };
}
