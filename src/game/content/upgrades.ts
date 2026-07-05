export type UpgradeId = 'boots' | 'wateringCan';

export interface UpgradeDefinition {
  id: UpgradeId;
  label: string;
  description: string;
  maxLevel: number;
  costs: number[];
}

export const UPGRADES: Record<UpgradeId, UpgradeDefinition> = {
  boots: {
    id: 'boots',
    label: 'Worker Boots',
    description: 'Workers move faster everywhere.',
    maxLevel: 3,
    costs: [20, 45, 90],
  },
  wateringCan: {
    id: 'wateringCan',
    label: 'Watering Cans',
    description: 'Water lasts longer on planted crops.',
    maxLevel: 2,
    costs: [30, 75],
  },
};

export const UPGRADE_IDS: UpgradeId[] = ['boots', 'wateringCan'];
