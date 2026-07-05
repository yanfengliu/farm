import type { CropId } from './crops';

export type TierLevel = 1 | 2 | 3;

export interface FarmTierDefinition {
  level: TierLevel;
  label: string;
  unlockedCrops: CropId[];
  nextMilestone: string;
  reward: string;
}

export const FARM_TIERS: Record<TierLevel, FarmTierDefinition> = {
  1: {
    level: 1,
    label: 'Starter Rows',
    unlockedCrops: ['carrot'],
    nextMilestone: 'Harvest 10 carrots',
    reward: 'Unlock wheat and a second worker.',
  },
  2: {
    level: 2,
    label: 'Wheat Rows',
    unlockedCrops: ['carrot', 'wheat'],
    nextMilestone: 'Harvest 20 wheat',
    reward: 'Unlock tomatoes and a third worker.',
  },
  3: {
    level: 3,
    label: 'Tomato Rows',
    unlockedCrops: ['carrot', 'wheat', 'tomato'],
    nextMilestone: 'Keep expanding the farm',
    reward: 'Open-ended farm tuning.',
  },
};

export const FARM_TIER_LIST = [FARM_TIERS[1], FARM_TIERS[2], FARM_TIERS[3]];
