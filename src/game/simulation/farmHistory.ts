import type { FarmHistory } from './farmTypes';

export const FARM_HISTORY_LIMIT = 100;

export function pushHistorySnapshot(stack: string[], snapshot: string): void {
  stack.push(snapshot);
  if (stack.length > FARM_HISTORY_LIMIT) {
    stack.splice(0, stack.length - FARM_HISTORY_LIMIT);
  }
}

export function trimFarmHistory(history: FarmHistory): void {
  if (history.undo.length > FARM_HISTORY_LIMIT) {
    history.undo = history.undo.slice(-FARM_HISTORY_LIMIT);
  }
  if (history.redo.length > FARM_HISTORY_LIMIT) {
    history.redo = history.redo.slice(-FARM_HISTORY_LIMIT);
  }
}
