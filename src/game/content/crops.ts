export type CropId = 'carrot' | 'wheat' | 'tomato';

export interface CropDefinition {
  id: CropId;
  label: string;
  growTicks: number;
  waterTicks: number;
  sellPrice: number;
  seedPrice: number;
  seedReturnChance: number;
}

export const CROPS: Record<CropId, CropDefinition> = {
  carrot: {
    id: 'carrot',
    label: 'Carrot',
    growTicks: 120,
    waterTicks: 160,
    sellPrice: 2,
    seedPrice: 1,
    seedReturnChance: 0.35,
  },
  wheat: {
    id: 'wheat',
    label: 'Wheat',
    growTicks: 220,
    waterTicks: 210,
    sellPrice: 4,
    seedPrice: 2,
    seedReturnChance: 0.3,
  },
  tomato: {
    id: 'tomato',
    label: 'Tomato',
    growTicks: 360,
    waterTicks: 260,
    sellPrice: 7,
    seedPrice: 3,
    seedReturnChance: 0.25,
  },
};

export const CROP_IDS: CropId[] = ['carrot', 'wheat', 'tomato'];
