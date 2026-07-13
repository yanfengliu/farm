import {
  FARM_ANNOTATION_STORE_SCHEMA,
  FARM_ANNOTATION_LIMIT,
  FARM_ANNOTATION_VERSION,
  createFarmAnnotationStore,
  isFarmAnnotationBundle,
  type FarmAnnotationStore,
} from '../annotations/farmAnnotations';
import { isFarmState } from './localSave';

export const FARM_ANNOTATIONS_STORAGE_KEY = 'farm.annotations.v1';

export interface AnnotationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadFarmAnnotations(storage: AnnotationStorage = localStorage): FarmAnnotationStore {
  try {
    const raw = storage.getItem(FARM_ANNOTATIONS_STORAGE_KEY);
    if (!raw) return createFarmAnnotationStore();
    const input = JSON.parse(raw) as unknown;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return createFarmAnnotationStore();
    const payload = input as Record<string, unknown>;
    if (payload.schema !== FARM_ANNOTATION_STORE_SCHEMA || payload.version !== FARM_ANNOTATION_VERSION) {
      return createFarmAnnotationStore();
    }
    const seenIds = new Set<string>();
    const seenIndexes = new Set<number>();
    const records = Array.isArray(payload.records)
      ? payload.records.filter(isFarmAnnotationBundle).filter((record) => isFarmState(record.capture.farmState)).filter((record) => {
          if (seenIds.has(record.id) || seenIndexes.has(record.index)) return false;
          seenIds.add(record.id);
          seenIndexes.add(record.index);
          return true;
        }).slice(0, FARM_ANNOTATION_LIMIT).map((record) => structuredClone(record))
      : [];
    const minimumNextIndex = records.reduce((maximum, record) => Math.max(maximum, record.index + 1), 1);
    const nextIndex = typeof payload.nextIndex === 'number' && Number.isInteger(payload.nextIndex)
      ? Math.max(minimumNextIndex, payload.nextIndex)
      : minimumNextIndex;
    return {
      schema: FARM_ANNOTATION_STORE_SCHEMA,
      version: FARM_ANNOTATION_VERSION,
      nextIndex,
      records,
    };
  } catch {
    return createFarmAnnotationStore();
  }
}

export function saveFarmAnnotations(
  store: FarmAnnotationStore,
  storage: AnnotationStorage = localStorage,
): boolean {
  try {
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
