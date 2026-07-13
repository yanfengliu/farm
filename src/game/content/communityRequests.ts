import type { CropId } from './crops';
import type { TierLevel } from './tiers';

export type VillageRequestId =
  | 'maes-soup-pot'
  | 'rowans-bakery'
  | 'junipers-picnic'
  | 'ferns-feed-sack'
  | 'poppys-pasta-night'
  | 'bramble-market-sauce'
  | 'red-porch-supper'
  | 'garden-club-basket'
  | 'harvest-lanterns'
  | 'hearth-stew'
  | 'festival-pies'
  | 'porch-feast';

export interface VillageRequestDefinition {
  id: VillageRequestId;
  neighbor: string;
  title: string;
  note: string;
  unlockTier: Exclude<TierLevel, 1>;
  needs: Partial<Record<CropId, number>>;
  rewardCoins: number;
}

export const VILLAGE_REQUESTS: VillageRequestDefinition[] = [
  { id: 'maes-soup-pot', neighbor: 'Mae', title: 'Soup Pot', note: 'A warm pot for the lane after sundown.', unlockTier: 2, needs: { carrot: 5, wheat: 2 }, rewardCoins: 28 },
  { id: 'rowans-bakery', neighbor: 'Rowan', title: 'Bakery Basket', note: 'Fresh loaves and a little carrot jam.', unlockTier: 2, needs: { carrot: 2, wheat: 5 }, rewardCoins: 37 },
  { id: 'junipers-picnic', neighbor: 'Juniper', title: 'Creek Picnic', note: 'A checkered blanket is waiting by the creek.', unlockTier: 2, needs: { carrot: 4, wheat: 3 }, rewardCoins: 31 },
  { id: 'ferns-feed-sack', neighbor: 'Fern', title: 'Mill Morning', note: 'The miller needs a golden sack before noon.', unlockTier: 2, needs: { wheat: 6 }, rewardCoins: 36 },
  { id: 'poppys-pasta-night', neighbor: 'Poppy', title: 'Pasta Night', note: 'Bright sauce for a long table of friends.', unlockTier: 3, needs: { carrot: 3, wheat: 2, tomato: 2 }, rewardCoins: 44 },
  { id: 'bramble-market-sauce', neighbor: 'Bramble', title: 'Market Sauce', note: 'The red jars always disappear first.', unlockTier: 3, needs: { carrot: 2, wheat: 1, tomato: 4 }, rewardCoins: 56 },
  { id: 'red-porch-supper', neighbor: 'Clover', title: 'Red Porch Supper', note: 'Supper tastes better under the porch lights.', unlockTier: 3, needs: { wheat: 3, tomato: 3 }, rewardCoins: 51 },
  { id: 'garden-club-basket', neighbor: 'Moss', title: 'Garden Club Basket', note: 'A little of everything for the judging table.', unlockTier: 3, needs: { carrot: 4, wheat: 2, tomato: 2 }, rewardCoins: 47 },
  { id: 'harvest-lanterns', neighbor: 'Lark', title: 'Harvest Lanterns', note: 'Round pumpkins for the lantern walk.', unlockTier: 4, needs: { wheat: 2, pumpkin: 3 }, rewardCoins: 68 },
  { id: 'hearth-stew', neighbor: 'Mae', title: 'Hearth Stew', note: 'A deep orange stew for the first cold evening.', unlockTier: 4, needs: { carrot: 3, tomato: 2, pumpkin: 2 }, rewardCoins: 68 },
  { id: 'festival-pies', neighbor: 'Rowan', title: 'Festival Pies', note: 'The bakery windows need a proper autumn stack.', unlockTier: 4, needs: { wheat: 4, pumpkin: 3 }, rewardCoins: 80 },
  { id: 'porch-feast', neighbor: 'Juniper', title: 'Porch Feast', note: 'The whole lane is bringing a chair.', unlockTier: 4, needs: { tomato: 3, pumpkin: 3 }, rewardCoins: 88 },
];

export function villageRequestOffers(level: TierLevel, rotationIndex: number): VillageRequestDefinition[] {
  if (level === 1) return [];
  const deck = VILLAGE_REQUESTS.filter((request) => request.unlockTier === level);
  if (deck.length === 0) return [];
  const start = ((Math.floor(rotationIndex) % deck.length) + deck.length) % deck.length;
  return [deck[start], deck[(start + 1) % deck.length]];
}

export function villageRequestById(requestId: VillageRequestId): VillageRequestDefinition | undefined {
  return VILLAGE_REQUESTS.find((request) => request.id === requestId);
}
