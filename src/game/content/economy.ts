import { CROPS, type CropId } from './crops';

export const MAX_SEEDS_PER_PURCHASE = 5;

export interface SeedPurchaseQuote {
  amount: number;
  cost: number;
  unitPrice: number;
}

export function seedPurchaseQuote(coins: number, cropId: CropId): SeedPurchaseQuote {
  const unitPrice = CROPS[cropId].seedPrice;
  const affordable = Math.max(0, Math.floor(coins / unitPrice));
  const amount = Math.min(MAX_SEEDS_PER_PURCHASE, affordable);
  return { amount, cost: amount * unitPrice, unitPrice };
}
