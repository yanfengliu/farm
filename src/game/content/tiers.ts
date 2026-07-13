import type { CropId } from './crops';

export type TierLevel = 1 | 2 | 3 | 4;

export interface FarmTierDefinition {
  level: TierLevel;
  label: string;
  unlockedCrops: CropId[];
  nextMilestone: string;
  reward: string;
  rewardDetails: string[];
}

export const FARM_TIERS: Record<TierLevel, FarmTierDefinition> = {
  1: {
    level: 1,
    label: 'Starter Rows',
    unlockedCrops: ['carrot'],
    nextMilestone: 'Harvest 10 carrots',
    reward: 'Unlock wheat, village requests, and a second worker.',
    rewardDetails: ['New crop: Wheat', 'Village Request Board', '+1 farmhand', '+4 wheat seeds'],
  },
  2: {
    level: 2,
    label: 'Wheat Rows',
    unlockedCrops: ['carrot', 'wheat'],
    nextMilestone: 'Harvest 20 wheat',
    reward: 'Unlock tomatoes and a third worker.',
    rewardDetails: ['New crop: Tomatoes', '+1 farmhand', '+4 tomato seeds', 'Crop mix gains tomatoes'],
  },
  3: {
    level: 3,
    label: 'Tomato Rows',
    unlockedCrops: ['carrot', 'wheat', 'tomato'],
    nextMilestone: 'Complete 3 village requests and harvest 10 tomatoes',
    reward: 'Unlock pumpkins and a fourth worker.',
    rewardDetails: ['New crop: Pumpkins', '+1 farmhand', '+4 pumpkin seeds', 'Crop mix gains pumpkins'],
  },
  4: {
    level: 4,
    label: 'Harvest Hearth',
    unlockedCrops: ['carrot', 'wheat', 'tomato', 'pumpkin'],
    nextMilestone: 'Fill village baskets, tune the harvest, and keep expanding',
    reward: 'Open-ended harvest festival farming.',
    rewardDetails: ['All crops available', 'Rotating village requests', 'Tune crop mix freely', 'Grow the farm your way'],
  },
};

export const FARM_TIER_LIST = [FARM_TIERS[1], FARM_TIERS[2], FARM_TIERS[3], FARM_TIERS[4]];
