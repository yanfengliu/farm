import {
  CREEK_HABITAT_IDS,
  DUCK_PROFILES,
  TREE_SHELTER_IDS,
  WILDLIFE_TUNING,
  wildlifeNodeDistance,
  wildlifeTravelProgressPerTick,
  type CreekHabitatId,
  type WildlifeNodeId,
} from '../content/wildlife';
import type { FarmDuck, FarmState, FarmWildlife } from './farmTypes';

export function createInitialWildlifeState(): FarmWildlife {
  return {
    ducks: DUCK_PROFILES.map((profile) => ({
      ...profile,
      targetNode: null,
      targetFishId: null,
      travelProgress: 0,
      activity: 'roaming',
      activityTicks: profile.id * 5,
      meals: 0,
    })),
    fish: CREEK_HABITAT_IDS.map((node, index) => ({
      id: index + 1,
      node,
      available: true,
      reservedByDuckId: null,
      respawnTick: 0,
    })),
  };
}

export function updateWildlife(state: FarmState): void {
  if (!state.wildlife) return;
  respawnFish(state);
  for (const duck of [...state.wildlife.ducks].sort((left, right) => left.id - right.id)) {
    updateDuck(state, duck);
  }
}

function respawnFish(state: FarmState): void {
  for (const fish of state.wildlife.fish) {
    if (fish.available || fish.respawnTick > state.tick) continue;
    fish.available = true;
    fish.respawnTick = 0;
    fish.reservedByDuckId = null;
  }
}

function updateDuck(state: FarmState, duck: FarmDuck): void {
  updateNeeds(state, duck);

  if (duck.activity === 'sleeping') {
    updateSleepingDuck(duck);
    return;
  }

  if (duck.activity === 'foraging' && duck.energy <= WILDLIFE_TUNING.seekShelterEnergy) {
    releaseFishReservation(state, duck);
    duck.targetNode = null;
    duck.travelProgress = 0;
  }

  if (duck.targetNode) {
    advanceDuckTravel(state, duck);
    return;
  }

  if (duck.activity === 'eating') {
    duck.activityTicks = Math.max(0, duck.activityTicks - 1);
    if (duck.activityTicks > 0) return;
    duck.activity = 'roaming';
  }

  if (duck.energy <= WILDLIFE_TUNING.seekShelterEnergy) {
    seekShelter(state, duck);
    return;
  }

  if (duck.hunger >= WILDLIFE_TUNING.forageHunger && seekFish(state, duck)) return;

  if (duck.activityTicks > 0) {
    duck.activityTicks -= 1;
    return;
  }

  startRoaming(state, duck);
}

function updateNeeds(state: FarmState, duck: FarmDuck): void {
  const hungerInterval = duck.activity === 'sleeping'
    ? WILDLIFE_TUNING.sleepingHungerIntervalTicks
    : WILDLIFE_TUNING.hungerIntervalTicks;
  if (duck.activity !== 'eating' && (state.tick + duck.id) % hungerInterval === 0) {
    duck.hunger = Math.min(WILDLIFE_TUNING.maxNeed, duck.hunger + 1);
  }
  if (duck.activity !== 'sleeping' && (state.tick + duck.id) % WILDLIFE_TUNING.energyIntervalTicks === 0) {
    duck.energy = Math.max(0, duck.energy - 1);
  }
}

function updateSleepingDuck(duck: FarmDuck): void {
  duck.energy = Math.min(WILDLIFE_TUNING.maxNeed, duck.energy + WILDLIFE_TUNING.sleepEnergyPerTick);
  if (duck.energy < WILDLIFE_TUNING.wakeEnergy) return;
  duck.activity = 'roaming';
  duck.activityTicks = 0;
}

function advanceDuckTravel(state: FarmState, duck: FarmDuck): void {
  if (!duck.targetNode) return;
  const progressPerTick = wildlifeTravelProgressPerTick(duck.node, duck.targetNode);
  duck.travelProgress = Math.min(100, duck.travelProgress + progressPerTick);
  if (duck.travelProgress < 100 || !duck.targetNode) return;

  duck.node = duck.targetNode;
  duck.targetNode = null;
  duck.travelProgress = 0;

  if (duck.activity === 'foraging') finishForaging(state, duck);
  else if (duck.activity === 'seeking-shelter') {
    duck.activity = 'sleeping';
    duck.activityTicks = 0;
  } else {
    duck.activity = 'roaming';
    duck.activityTicks = WILDLIFE_TUNING.roamRestTicks + ((state.tick + duck.id * 7) % 13);
  }
}

function seekFish(state: FarmState, duck: FarmDuck): boolean {
  const fish = state.wildlife.fish
    .filter((candidate) => candidate.available && candidate.reservedByDuckId === null)
    .sort((left, right) => (
      wildlifeNodeDistance(duck.node, left.node) - wildlifeNodeDistance(duck.node, right.node) ||
      left.id - right.id
    ))[0];
  if (!fish) return false;

  fish.reservedByDuckId = duck.id;
  duck.activity = 'foraging';
  duck.activityTicks = 0;
  duck.targetFishId = fish.id;
  startTravel(duck, fish.node);
  return true;
}

function finishForaging(state: FarmState, duck: FarmDuck): void {
  const fish = state.wildlife.fish.find((candidate) => candidate.id === duck.targetFishId);
  if (!fish || !fish.available || fish.reservedByDuckId !== duck.id || fish.node !== duck.node) {
    releaseFishReservation(state, duck);
    duck.activity = 'roaming';
    duck.activityTicks = 0;
    return;
  }

  fish.available = false;
  fish.reservedByDuckId = null;
  fish.respawnTick = state.tick + WILDLIFE_TUNING.fishRespawnTicks;
  duck.targetFishId = null;
  duck.hunger = 0;
  duck.meals += 1;
  duck.activity = 'eating';
  duck.activityTicks = WILDLIFE_TUNING.eatingTicks;
}

function seekShelter(state: FarmState, duck: FarmDuck): void {
  releaseFishReservation(state, duck);
  const preferredShelter = TREE_SHELTER_IDS[(duck.id - 1) % TREE_SHELTER_IDS.length] ?? TREE_SHELTER_IDS[0];
  const shelter = [...TREE_SHELTER_IDS].sort((left, right) => (
    wildlifeNodeDistance(duck.node, left) - wildlifeNodeDistance(duck.node, right) ||
    Number(right === preferredShelter) - Number(left === preferredShelter)
  ))[0] ?? TREE_SHELTER_IDS[0];
  duck.activity = 'seeking-shelter';
  duck.activityTicks = 0;
  startTravel(duck, shelter);
}

function startRoaming(state: FarmState, duck: FarmDuck): void {
  const currentIndex = isCreekNode(duck.node) ? CREEK_HABITAT_IDS.indexOf(duck.node) : -1;
  const direction = (state.tick + duck.id + duck.meals) % 2 === 0 ? 1 : -1;
  const baseIndex = currentIndex < 0 ? duck.id % CREEK_HABITAT_IDS.length : currentIndex;
  const candidateIndex = baseIndex + direction;
  const nextIndex = candidateIndex < 0
    ? 1
    : candidateIndex >= CREEK_HABITAT_IDS.length
      ? CREEK_HABITAT_IDS.length - 2
      : candidateIndex;
  duck.activity = 'roaming';
  startTravel(duck, CREEK_HABITAT_IDS[nextIndex] ?? CREEK_HABITAT_IDS[0]);
}

function startTravel(duck: FarmDuck, targetNode: WildlifeNodeId): void {
  duck.targetNode = targetNode;
  duck.travelProgress = 0;
}

function releaseFishReservation(state: FarmState, duck: FarmDuck): void {
  if (duck.targetFishId !== null) {
    const fish = state.wildlife.fish.find((candidate) => candidate.id === duck.targetFishId);
    if (fish?.reservedByDuckId === duck.id) fish.reservedByDuckId = null;
  }
  duck.targetFishId = null;
}

function isCreekNode(node: WildlifeNodeId): node is CreekHabitatId {
  return CREEK_HABITAT_IDS.includes(node as CreekHabitatId);
}
