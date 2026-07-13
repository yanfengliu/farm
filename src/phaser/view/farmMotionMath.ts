export function pingPong(position: number, distance: number): number {
  const span = Math.max(0, distance);
  if (span === 0) return 0;
  const cycle = span * 2;
  const phase = ((position % cycle) + cycle) % cycle;
  return phase <= span ? phase : cycle - phase;
}

export function exponentialApproach(deltaMs: number, timeConstantMs: number): number {
  if (timeConstantMs <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, deltaMs) / timeConstantMs);
}
