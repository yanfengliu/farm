export const ORDINARY_DEFAULT_VISUAL_LOOP_STEPS = 80;
export const RECURSIVE_DEFAULT_VISUAL_LOOP_STEPS = 160;
export const MIN_VISUAL_LOOP_STEPS = 1;
export const MAX_VISUAL_LOOP_STEPS = 160;

export function normalizeVisualLoopSteps(value, fallback = ORDINARY_DEFAULT_VISUAL_LOOP_STEPS) {
  const parsed = Number(value);
  if (value === undefined || value === null || String(value).trim() === '' || !Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(MAX_VISUAL_LOOP_STEPS, Math.max(MIN_VISUAL_LOOP_STEPS, Math.round(parsed)));
}
