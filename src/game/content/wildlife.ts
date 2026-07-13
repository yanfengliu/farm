export const CREEK_HABITAT_IDS = [
  'creek-north',
  'creek-mid-north',
  'creek-mid-south',
  'creek-south',
] as const;

export const TREE_SHELTER_IDS = [
  'tree-shelter-elder',
  'tree-shelter-hazel',
] as const;

export type CreekHabitatId = (typeof CREEK_HABITAT_IDS)[number];
export type TreeShelterId = (typeof TREE_SHELTER_IDS)[number];
export type WildlifeNodeId = CreekHabitatId | TreeShelterId;

export const DUCK_ACTIVITY_IDS = [
  'roaming',
  'foraging',
  'eating',
  'seeking-shelter',
  'sleeping',
] as const;

export type DuckActivity = (typeof DUCK_ACTIVITY_IDS)[number];

export const WILDLIFE_TUNING = {
  maxNeed: 100,
  forageHunger: 62,
  seekShelterEnergy: 24,
  wakeEnergy: 94,
  hungerIntervalTicks: 4,
  sleepingHungerIntervalTicks: 10,
  energyIntervalTicks: 5,
  sleepEnergyPerTick: 1,
  travelProgressPerTick: 2,
  eatingTicks: 20,
  roamRestTicks: 18,
  fishRespawnTicks: 180,
} as const;

export const DUCK_PROFILES = [
  { id: 1, name: 'Pip', node: 'creek-north', hunger: 54, energy: 78 },
  { id: 2, name: 'Mallow', node: 'creek-south', hunger: 28, energy: 40 },
] as const satisfies ReadonlyArray<{
  id: number;
  name: string;
  node: CreekHabitatId;
  hunger: number;
  energy: number;
}>;

export function isWildlifeNodeId(value: unknown): value is WildlifeNodeId {
  return typeof value === 'string' && (
    CREEK_HABITAT_IDS.includes(value as CreekHabitatId) ||
    TREE_SHELTER_IDS.includes(value as TreeShelterId)
  );
}

export function isCreekHabitatId(value: unknown): value is CreekHabitatId {
  return typeof value === 'string' && CREEK_HABITAT_IDS.includes(value as CreekHabitatId);
}

export function isTreeShelterId(value: unknown): value is TreeShelterId {
  return typeof value === 'string' && TREE_SHELTER_IDS.includes(value as TreeShelterId);
}

export function wildlifeNodeDistance(from: WildlifeNodeId, to: WildlifeNodeId): number {
  return Math.abs(wildlifeNodeOrder(from) - wildlifeNodeOrder(to));
}

export function wildlifeTravelProgressPerTick(from: WildlifeNodeId, to: WildlifeNodeId): number {
  const habitatDistance = Math.max(1, wildlifeNodeDistance(from, to));
  return Math.max(1, Math.floor(WILDLIFE_TUNING.travelProgressPerTick / habitatDistance));
}

function wildlifeNodeOrder(node: WildlifeNodeId): number {
  if (node === 'tree-shelter-elder' || node === 'tree-shelter-hazel') return -1;
  return CREEK_HABITAT_IDS.indexOf(node);
}
