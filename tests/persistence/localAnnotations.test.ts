import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot, renderFarmToText } from '../../src/game/simulation/farmGame';
import {
  FARM_ANNOTATION_BUNDLE_SCHEMA,
  FARM_ANNOTATION_COLLECTION_SCHEMA,
  FARM_ANNOTATION_LIMIT,
  createFarmAnnotationDraft,
  createFarmAnnotationStore,
  deleteFarmAnnotation,
  editFarmAnnotation,
  formatFarmAnnotationBundleJson,
  formatFarmAnnotationCollectionJson,
  formatFarmAnnotationContext,
  queueFarmAnnotation,
  type FarmAnnotationPick,
} from '../../src/annotations/farmAnnotations';
import {
  createFarmAnnotationBoxSelection,
  farmAnnotationBoxCenter,
  type FarmAnnotationBoxSelection,
} from '../../src/annotations/farmAnnotationSelection';
import {
  FARM_ANNOTATIONS_STORAGE_KEY,
  loadFarmAnnotations,
  saveFarmAnnotations,
  type AnnotationStorage,
} from '../../src/persistence/localAnnotations';

function annotationPick(overrides: Partial<FarmAnnotationPick> = {}): FarmAnnotationPick {
  return {
    clientPx: { x: 240.25, y: 180.75 },
    canvasPx: { x: 240.25, y: 132.75, normalizedX: 0.25, normalizedY: 0.2 },
    worldPx: { x: 144.5, y: 80.25 },
    gridCell: { x: 4, y: 2 },
    camera: {
      scrollX: -204.791_666_666_7,
      scrollY: -139.166_666_666_7,
      zoom: 1.5,
      width: 940,
      height: 688,
      worldView: { x: -48.125, y: -24.5, width: 626.666_666_666_7, height: 458.666_666_666_7 },
    },
    viewport: {
      windowWidth: 1280,
      windowHeight: 800,
      devicePixelRatio: 1,
      canvasRect: { left: 0, top: 48, width: 940, height: 688 },
      drawingBuffer: { width: 940, height: 688 },
    },
    presentationTimeMs: 12_345.678,
    previewDataUrl: 'data:image/png;base64,cGl4ZWxz',
    ...overrides,
  };
}

function boxAnnotationPick(): FarmAnnotationPick {
  const zoom = 1.5;
  const canvasSize = { width: 940, height: 688 };
  const canvasStart = { x: 200, y: 100 };
  const canvasEnd = { x: 320, y: 180 };
  const worldStart = { x: -48.125 + canvasStart.x / zoom, y: -24.5 + canvasStart.y / zoom };
  const worldEnd = { x: -48.125 + canvasEnd.x / zoom, y: -24.5 + canvasEnd.y / zoom };
  const selection = createFarmAnnotationBoxSelection({
    clientStart: { x: canvasStart.x, y: canvasStart.y + 48 },
    clientEnd: { x: canvasEnd.x, y: canvasEnd.y + 48 },
    canvasStart,
    canvasEnd,
    worldStart,
    worldEnd,
    canvasSize,
  });
  const center = farmAnnotationBoxCenter(selection);
  return annotationPick({
    ...center,
    gridCell: { x: Math.floor(center.worldPx.x / 32), y: Math.floor(center.worldPx.y / 32) },
    selection,
  });
}

function annotationDraft(pick: FarmAnnotationPick = annotationPick()) {
  const state = getFarmSnapshot(createFarmGame({ seed: 'annotation-contract' }));
  state.history.undo = ['large undo payload'];
  state.history.redo = ['large redo payload'];

  return createFarmAnnotationDraft({
    state,
    pick,
    interaction: {
      selectedTool: 'note',
      activePanel: 'comments',
      paused: true,
      speed: 1,
    },
    stateText: renderFarmToText(createFarmGame({ seed: 'annotation-contract', state })),
  });
}

class MemoryStorage implements AnnotationStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('local annotation bundles', () => {
  test('captures an exact, history-bounded debugging snapshot at the picked moment', () => {
    const draft = annotationDraft();

    expect(draft.target).toMatchObject({
      kind: 'empty',
      semanticId: 'tile:4,2',
      label: 'Empty Land / 4,2',
      cell: { x: 4, y: 2 },
      worldPx: { x: 144.5, y: 80.25 },
    });
    expect(draft.capture.pick.canvasPx).toEqual({
      x: 240.25,
      y: 132.75,
      normalizedX: 0.25,
      normalizedY: 0.2,
    });
    expect(draft.capture.farmState.tick).toBe(0);
    expect(draft.capture.farmState.history).toEqual({ undo: [], redo: [] });
    expect(draft.capture.historyDepth).toEqual({ undo: 1, redo: 1 });
    expect(draft.capture.previewDataUrl).toBe('data:image/png;base64,cGl4ZWxz');
    expect(draft.capture.stateText).toContain('tick=0');
  });

  test('queues canonical self-contained bundles with stable pin numbers', () => {
    const first = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), '  Water looks too bright.  ', {
      id: 'farm-note-1',
      createdAt: '2026-07-13T20:00:00.000Z',
    });
    const second = queueFarmAnnotation(first.store, annotationDraft(), 'Duck overlaps the bank.', {
      id: 'farm-note-2',
      createdAt: '2026-07-13T20:01:00.000Z',
    });
    const afterDelete = deleteFarmAnnotation(second.store, first.record.id);

    expect(first.record.message).toBe('Water looks too bright.');
    expect(second.record.index).toBe(2);
    expect(afterDelete.records.map((record) => record.index)).toEqual([2]);
    expect(afterDelete.nextIndex).toBe(3);

    const bundle = JSON.parse(formatFarmAnnotationBundleJson(second.record));
    expect(bundle).toMatchObject({
      schema: FARM_ANNOTATION_BUNDLE_SCHEMA,
      version: 1,
      id: 'farm-note-2',
      index: 2,
      message: 'Duck overlaps the bank.',
    });
    expect(bundle.capture.farmState.history).toEqual({ undo: [], redo: [] });

    const collection = JSON.parse(formatFarmAnnotationCollectionJson(second.store, '2026-07-13T20:02:00.000Z'));
    expect(collection.schema).toBe(FARM_ANNOTATION_COLLECTION_SCHEMA);
    expect(collection.bundles).toHaveLength(2);
  });

  test('round-trips box selections while keeping selection-less V1 records as points', () => {
    const storage = new MemoryStorage();
    const point = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'Legacy point', {
      id: 'farm-note-point',
      createdAt: '2026-07-13T20:00:00.000Z',
    });
    const box = queueFarmAnnotation(point.store, annotationDraft(boxAnnotationPick()), 'Boxed concern', {
      id: 'farm-note-box',
      createdAt: '2026-07-13T20:01:00.000Z',
    });

    expect(saveFarmAnnotations(box.store, storage)).toBe(true);
    const loaded = loadFarmAnnotations(storage);
    expect(loaded).toEqual(box.store);
    expect(loaded.records[0]?.capture.pick).not.toHaveProperty('selection');
    expect(loaded.records[1]?.capture.pick.selection).toEqual(boxAnnotationPick().selection);

    const exported = JSON.parse(formatFarmAnnotationBundleJson(loaded.records[1]!));
    expect(exported.capture.pick.selection).toEqual(boxAnnotationPick().selection);
    const context = formatFarmAnnotationContext(loaded);
    expect(context).toContain('annotation#1 context=current-farm tick=0 shape=point');
    expect(context).toContain('annotation#2 context=current-farm tick=0 shape=box');
    expect(context).toContain(`worldBounds=${JSON.stringify(boxAnnotationPick().selection?.worldRect)}`);
  });

  test('drops box records with malformed or incoherent geometry without losing valid neighbors', () => {
    const storage = new MemoryStorage();
    const valid = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(boxAnnotationPick()), 'Valid box', {
      id: 'farm-note-valid-box',
      createdAt: '2026-07-13T20:00:00.000Z',
    }).record;
    const corrupt = (
      id: string,
      index: number,
      mutate: (selection: FarmAnnotationBoxSelection, pick: FarmAnnotationPick) => void,
    ) => {
      const record = structuredClone(valid);
      record.id = id;
      record.index = index;
      const selection = record.capture.pick.selection as FarmAnnotationBoxSelection;
      mutate(selection, record.capture.pick as FarmAnnotationPick);
      return record;
    };
    const negativeWidth = corrupt('negative-width', 2, (selection) => {
      selection.canvasRect.width = -1;
    });
    const normalizedDrift = corrupt('normalized-drift', 3, (selection) => {
      selection.canvasRect.normalizedWidth += 0.1;
    });
    const clientDrift = corrupt('client-drift', 4, (selection) => {
      selection.clientRect.x += 1;
    });
    const worldScaleDrift = corrupt('world-scale-drift', 5, (selection) => {
      selection.worldRect.width += 1;
    });
    const centerDrift = corrupt('center-drift', 6, (_selection, pick) => {
      pick.canvasPx.x += 1;
    });
    const cameraOriginDrift = corrupt('camera-origin-drift', 7, (selection, pick) => {
      pick.camera.worldView.x += 100;
      selection.worldRect.x += 100;
      pick.worldPx.x += 100;
    });
    cameraOriginDrift.target.worldPx.x += 100;
    const overflowingWorldRect = corrupt('overflowing-world-rect', 8, (selection, pick) => {
      selection.worldRect.x = 0;
      selection.worldRect.width = Number.MAX_VALUE;
      pick.worldPx.x = Number.MAX_VALUE / 2;
    });
    overflowingWorldRect.target.worldPx.x = Number.MAX_VALUE / 2;
    const scrollOriginDrift = corrupt('scroll-origin-drift', 9, (_selection, pick) => {
      pick.camera.scrollX += 100;
    });
    const viewportScaleDrift = corrupt('viewport-scale-drift', 10, (selection, pick) => {
      pick.viewport.canvasRect.width *= 2;
      selection.canvasRect.normalizedX /= 2;
      selection.canvasRect.normalizedWidth /= 2;
      pick.canvasPx.normalizedX /= 2;
    });
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify({
      schema: 'farm.annotation-store',
      version: 1,
      nextIndex: 11,
      records: [
        valid,
        negativeWidth,
        normalizedDrift,
        clientDrift,
        worldScaleDrift,
        centerDrift,
        cameraOriginDrift,
        overflowingWorldRect,
        scrollOriginDrift,
        viewportScaleDrift,
      ],
    }));

    expect(loadFarmAnnotations(storage).records.map((record) => record.id)).toEqual(['farm-note-valid-box']);
  });

  test('edits only the comment metadata while preserving its captured evidence', () => {
    const queued = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'Old wording', {
      id: 'farm-note-edit',
      createdAt: '2026-07-13T20:00:00.000Z',
    });
    const beforeCapture = structuredClone(queued.record.capture);
    const edited = editFarmAnnotation(
      queued.store,
      queued.record.id,
      'Clearer wording',
      '2026-07-13T20:05:00.000Z',
    );

    expect(edited.records[0]).toMatchObject({
      id: 'farm-note-edit',
      index: 1,
      message: 'Clearer wording',
      updatedAt: '2026-07-13T20:05:00.000Z',
    });
    expect(edited.records[0]?.capture).toEqual(beforeCapture);
  });

  test('round-trips separately from the farm save and drops malformed records safely', () => {
    const storage = new MemoryStorage();
    const queued = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'Persist me', {
      id: 'farm-note-persist',
      createdAt: '2026-07-13T20:00:00.000Z',
    });

    expect(saveFarmAnnotations(queued.store, storage)).toBe(true);
    expect([...storage.values.keys()]).toEqual([FARM_ANNOTATIONS_STORAGE_KEY]);
    expect(loadFarmAnnotations(storage)).toEqual(queued.store);

    const persisted = JSON.parse(storage.getItem(FARM_ANNOTATIONS_STORAGE_KEY) ?? '{}');
    persisted.records.push({ id: '<img onerror=alert(1)>' });
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify(persisted));
    expect(loadFarmAnnotations(storage).records).toEqual(queued.store.records);

    const badTick = structuredClone(queued.record);
    badTick.id = 'bad-tick';
    badTick.index = 2;
    (badTick.capture.farmState as { tick: unknown }).tick = '<img src=x onerror="globalThis.annotationXss=1">';
    const missingCamera = structuredClone(queued.record);
    missingCamera.id = 'missing-camera';
    missingCamera.index = 3;
    delete (missingCamera.capture.pick as Partial<FarmAnnotationPick>).camera;
    const injectedPreview = structuredClone(queued.record);
    injectedPreview.id = 'injected-preview';
    injectedPreview.index = 4;
    injectedPreview.capture.previewDataUrl = 'data:image/png;base64,"><img src=x onerror=alert(1)>';
    persisted.records = [queued.record, badTick, missingCamera, injectedPreview];
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify(persisted));
    expect(loadFarmAnnotations(storage).records).toEqual(queued.store.records);

    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, '{not json');
    expect(loadFarmAnnotations(storage)).toEqual(createFarmAnnotationStore());
  });

  test('reports storage failure without losing the copyable in-memory bundle', () => {
    const store = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'Still exportable', {
      id: 'farm-note-quota',
      createdAt: '2026-07-13T20:00:00.000Z',
    }).store;
    const brokenStorage: AnnotationStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
      removeItem: () => undefined,
    };

    expect(saveFarmAnnotations(store, brokenStorage)).toBe(false);
    expect(JSON.parse(formatFarmAnnotationCollectionJson(store)).bundles[0].message).toBe('Still exportable');
  });

  test('bounds and de-duplicates untrusted stored queues before rendering them', () => {
    const storage = new MemoryStorage();
    const template = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'Stored note', {
      id: 'farm-note-template',
      createdAt: '2026-07-13T20:00:00.000Z',
    }).record;
    const records = Array.from({ length: FARM_ANNOTATION_LIMIT + 5 }, (_, index) => ({
      ...structuredClone(template),
      id: `farm-note-${index + 1}`,
      index: index + 1,
    }));
    records.splice(3, 0, structuredClone(records[0]));
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify({
      schema: 'farm.annotation-store',
      version: 1,
      nextIndex: 999,
      records,
    }));

    const loaded = loadFarmAnnotations(storage);
    expect(loaded.records).toHaveLength(FARM_ANNOTATION_LIMIT);
    expect(new Set(loaded.records.map((record) => record.id)).size).toBe(FARM_ANNOTATION_LIMIT);
    expect(loaded.nextIndex).toBe(999);
  });

  test('drops records whose positive index is outside the safe-integer boundary', () => {
    const storage = new MemoryStorage();
    const template = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'Stored note', {
      id: 'farm-note-safe-index',
      createdAt: '2026-07-13T20:00:00.000Z',
    }).record;
    const unsafe = {
      ...structuredClone(template),
      id: 'farm-note-unsafe-index',
      index: Number.MAX_SAFE_INTEGER + 1,
    };
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify({
      schema: 'farm.annotation-store',
      version: 1,
      nextIndex: 3,
      records: [template, unsafe],
    }));

    const loaded = loadFarmAnnotations(storage);
    expect(loaded.records.map((record) => record.id)).toEqual(['farm-note-safe-index']);
    expect(loaded.nextIndex).toBe(3);
  });

  test('sanitizes an unsafe next index so queued notes remain unique after reload', () => {
    const storage = new MemoryStorage();
    const first = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'First note', {
      id: 'farm-note-first',
      createdAt: '2026-07-13T20:00:00.000Z',
    });
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify({
      ...first.store,
      nextIndex: Number.MAX_SAFE_INTEGER + 1,
    }));

    const loaded = loadFarmAnnotations(storage);
    expect(loaded.nextIndex).toBe(2);
    const second = queueFarmAnnotation(loaded, annotationDraft(), 'Second note', {
      id: 'farm-note-second',
      createdAt: '2026-07-13T20:01:00.000Z',
    });
    const third = queueFarmAnnotation(second.store, annotationDraft(), 'Third note', {
      id: 'farm-note-third',
      createdAt: '2026-07-13T20:02:00.000Z',
    });
    expect(third.store.records.map((record) => record.index)).toEqual([1, 2, 3]);

    expect(saveFarmAnnotations(third.store, storage)).toBe(true);
    expect(loadFarmAnnotations(storage).records.map((record) => record.id)).toEqual([
      'farm-note-first',
      'farm-note-second',
      'farm-note-third',
    ]);
  });

  test('wraps safely after the largest safe index instead of overflowing the next note', () => {
    const storage = new MemoryStorage();
    const first = queueFarmAnnotation(createFarmAnnotationStore(), annotationDraft(), 'First note', {
      id: 'farm-note-wrap-first',
      createdAt: '2026-07-13T20:00:00.000Z',
    });
    storage.setItem(FARM_ANNOTATIONS_STORAGE_KEY, JSON.stringify({
      ...first.store,
      nextIndex: Number.MAX_SAFE_INTEGER,
    }));

    const loaded = loadFarmAnnotations(storage);
    const second = queueFarmAnnotation(loaded, annotationDraft(), 'Largest safe note', {
      id: 'farm-note-wrap-second',
      createdAt: '2026-07-13T20:01:00.000Z',
    });
    const third = queueFarmAnnotation(second.store, annotationDraft(), 'Wrapped note', {
      id: 'farm-note-wrap-third',
      createdAt: '2026-07-13T20:02:00.000Z',
    });
    expect(third.store.records.map((record) => record.index)).toEqual([
      1,
      Number.MAX_SAFE_INTEGER,
      2,
    ]);

    expect(saveFarmAnnotations(third.store, storage)).toBe(true);
    expect(loadFarmAnnotations(storage).records.map((record) => record.id)).toEqual([
      'farm-note-wrap-first',
      'farm-note-wrap-second',
      'farm-note-wrap-third',
    ]);
  });
});
