import type { TierLevel } from '../content/tiers';
import type { FarmState } from './farmTypes';

export function claimableTierLevel(state: FarmState): TierLevel | null {
  if (state.tier.level === 1 && state.stats.lifetimeHarvested.carrot >= 10) return 2;
  if (state.tier.level === 2 && state.stats.lifetimeHarvested.wheat >= 20) return 3;
  if (
    state.tier.level === 3 &&
    state.community.completedCount >= 3 &&
    state.stats.lifetimeHarvested.tomato >= 10
  ) return 4;
  return null;
}
