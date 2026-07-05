import type { FarmState } from '../game/simulation/farmGame';

const SAVE_KEY = 'farm.autosave.v1';

export function loadSavedFarmState(): FarmState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FarmState;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveFarmState(state: FarmState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearFarmSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
