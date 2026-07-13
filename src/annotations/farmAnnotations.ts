import type { FarmState, FarmTile } from '../game/simulation/farmGame';

export const FARM_ANNOTATION_BUNDLE_SCHEMA = 'farm.annotation-bundle' as const;
export const FARM_ANNOTATION_COLLECTION_SCHEMA = 'farm.annotation-bundle-collection' as const;
export const FARM_ANNOTATION_STORE_SCHEMA = 'farm.annotation-store' as const;
export const FARM_ANNOTATION_VERSION = 1 as const;
export const FARM_ANNOTATION_LIMIT = 50;
export const FARM_ANNOTATION_MESSAGE_LIMIT = 2_000;

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface FarmAnnotationTarget {
  kind: string;
  semanticId: string;
  label: string;
  entityId: string | null;
  cell: { x: number; y: number } | null;
  worldPx: AnnotationPoint;
  snapshot: unknown;
}

export interface FarmAnnotationPick {
  clientPx: AnnotationPoint;
  canvasPx: AnnotationPoint & { normalizedX: number; normalizedY: number };
  worldPx: AnnotationPoint;
  gridCell: { x: number; y: number };
  camera: {
    scrollX: number;
    scrollY: number;
    zoom: number;
    width: number;
    height: number;
    worldView: { x: number; y: number; width: number; height: number };
  };
  viewport: {
    windowWidth: number;
    windowHeight: number;
    devicePixelRatio: number;
    canvasRect: { left: number; top: number; width: number; height: number };
    drawingBuffer: { width: number; height: number };
  };
  presentationTimeMs: number;
  previewDataUrl: string | null;
  target?: FarmAnnotationTarget;
}

export interface FarmAnnotationInteraction {
  selectedTool: string;
  activePanel: string;
  paused: boolean;
  speed: 1 | 2 | 4;
}

export interface FarmAnnotationCapture {
  pick: Omit<FarmAnnotationPick, 'previewDataUrl' | 'target'>;
  interaction: FarmAnnotationInteraction;
  previewDataUrl: string | null;
  stateText: string;
  farmState: FarmState;
  historyDepth: { undo: number; redo: number };
}

export interface FarmAnnotationDraft {
  target: FarmAnnotationTarget;
  capture: FarmAnnotationCapture;
}

export interface FarmAnnotationBundleV1 {
  schema: typeof FARM_ANNOTATION_BUNDLE_SCHEMA;
  version: typeof FARM_ANNOTATION_VERSION;
  id: string;
  index: number;
  createdAt: string;
  updatedAt: string | null;
  context: 'current-farm' | 'past-farm';
  message: string;
  target: FarmAnnotationTarget;
  capture: FarmAnnotationCapture;
}

export interface FarmAnnotationStore {
  schema: typeof FARM_ANNOTATION_STORE_SCHEMA;
  version: typeof FARM_ANNOTATION_VERSION;
  nextIndex: number;
  records: FarmAnnotationBundleV1[];
}

export function createFarmAnnotationStore(): FarmAnnotationStore {
  return {
    schema: FARM_ANNOTATION_STORE_SCHEMA,
    version: FARM_ANNOTATION_VERSION,
    nextIndex: 1,
    records: [],
  };
}

export function createFarmAnnotationDraft(input: {
  state: FarmState;
  pick: FarmAnnotationPick;
  interaction: FarmAnnotationInteraction;
  stateText: string;
}): FarmAnnotationDraft {
  const state = structuredClone(input.state);
  const historyDepth = { undo: state.history.undo.length, redo: state.history.redo.length };
  state.history = { undo: [], redo: [] };
  const { previewDataUrl, target, ...pick } = structuredClone(input.pick);

  return {
    target: target ? structuredClone(target) : defaultAnnotationTarget(input.state, input.pick),
    capture: {
      pick,
      interaction: structuredClone(input.interaction),
      previewDataUrl,
      stateText: input.stateText,
      farmState: state,
      historyDepth,
    },
  };
}

export function queueFarmAnnotation(
  store: FarmAnnotationStore,
  draft: FarmAnnotationDraft,
  message: string,
  identity: { id?: string; createdAt?: string } = {},
): { store: FarmAnnotationStore; record: FarmAnnotationBundleV1 } {
  const normalizedMessage = normalizeMessage(message);
  if (store.records.length >= FARM_ANNOTATION_LIMIT) {
    throw new Error(`Annotation queue is limited to ${FARM_ANNOTATION_LIMIT} notes.`);
  }
  const index = store.nextIndex;
  const createdAt = identity.createdAt ?? new Date().toISOString();
  const record: FarmAnnotationBundleV1 = {
    schema: FARM_ANNOTATION_BUNDLE_SCHEMA,
    version: FARM_ANNOTATION_VERSION,
    id: identity.id ?? `farm-note-${Date.now().toString(36)}-${index.toString(36)}`,
    index,
    createdAt,
    updatedAt: null,
    context: 'current-farm',
    message: normalizedMessage,
    target: structuredClone(draft.target),
    capture: structuredClone(draft.capture),
  };
  return {
    record,
    store: {
      ...structuredClone(store),
      nextIndex: index + 1,
      records: [...structuredClone(store.records), record],
    },
  };
}

export function editFarmAnnotation(
  store: FarmAnnotationStore,
  id: string,
  message: string,
  updatedAt = new Date().toISOString(),
): FarmAnnotationStore {
  const normalizedMessage = normalizeMessage(message);
  return {
    ...structuredClone(store),
    records: store.records.map((record) => record.id === id
      ? { ...structuredClone(record), message: normalizedMessage, updatedAt }
      : structuredClone(record)),
  };
}

export function deleteFarmAnnotation(store: FarmAnnotationStore, id: string): FarmAnnotationStore {
  return {
    ...structuredClone(store),
    records: store.records.filter((record) => record.id !== id).map((record) => structuredClone(record)),
  };
}

export function markFarmAnnotationsPast(store: FarmAnnotationStore): FarmAnnotationStore {
  return {
    ...structuredClone(store),
    records: store.records.map((record) => record.context === 'current-farm'
      ? { ...structuredClone(record), context: 'past-farm' }
      : structuredClone(record)),
  };
}

export function formatFarmAnnotationBundleJson(record: FarmAnnotationBundleV1): string {
  return JSON.stringify(record);
}

export function formatFarmAnnotationCollectionJson(
  store: FarmAnnotationStore,
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify({
    schema: FARM_ANNOTATION_COLLECTION_SCHEMA,
    version: FARM_ANNOTATION_VERSION,
    exportedAt,
    bundles: structuredClone(store.records),
  });
}

export function formatFarmAnnotationContext(
  store: FarmAnnotationStore,
  ui: { aiming: boolean; draft: boolean } = { aiming: false, draft: false },
): string {
  const lines = [
    `annotationAiming=${ui.aiming}`,
    `annotationDraft=${ui.draft}`,
    `annotationCount=${store.records.length}`,
  ];
  for (const record of store.records) {
    lines.push(
      `annotation#${record.index} context=${record.context} tick=${record.capture.farmState.tick}` +
      ` target=${JSON.stringify(record.target.label)} message=${JSON.stringify(record.message)}`,
    );
  }
  return lines.join('\n');
}

export function isFarmAnnotationBundle(input: unknown): input is FarmAnnotationBundleV1 {
  if (!isRecord(input)) return false;
  if (input.schema !== FARM_ANNOTATION_BUNDLE_SCHEMA || input.version !== FARM_ANNOTATION_VERSION) return false;
  if (typeof input.id !== 'string' || !isPositiveInteger(input.index)) return false;
  if (typeof input.createdAt !== 'string' || (input.updatedAt !== null && typeof input.updatedAt !== 'string')) return false;
  if (input.context !== 'current-farm' && input.context !== 'past-farm') return false;
  if (typeof input.message !== 'string' || input.message.trim().length === 0 || input.message.length > FARM_ANNOTATION_MESSAGE_LIMIT) return false;
  return isAnnotationTarget(input.target) && isAnnotationCapture(input.capture);
}

function isAnnotationCapture(input: unknown): input is FarmAnnotationCapture {
  if (!isRecord(input) || !isAnnotationPick(input.pick) || !isAnnotationInteraction(input.interaction)) return false;
  if (typeof input.stateText !== 'string' || input.stateText.length > 250_000 || !isRecord(input.farmState)) return false;
  if (!isRecord(input.historyDepth) || !isNonNegativeInteger(input.historyDepth.undo) || !isNonNegativeInteger(input.historyDepth.redo)) return false;
  return input.previewDataUrl === null || (
    typeof input.previewDataUrl === 'string' &&
    input.previewDataUrl.length <= 250_000 &&
    /^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.previewDataUrl)
  );
}

function isAnnotationPick(input: unknown): input is FarmAnnotationCapture['pick'] {
  if (!isRecord(input) || !isPoint(input.clientPx) || !isCanvasPoint(input.canvasPx) || !isPoint(input.worldPx)) return false;
  if (!isRecord(input.gridCell) || !isInteger(input.gridCell.x) || !isInteger(input.gridCell.y)) return false;
  if (!isCamera(input.camera) || !isViewport(input.viewport)) return false;
  return isNonNegativeNumber(input.presentationTimeMs);
}

function isCanvasPoint(input: unknown): boolean {
  return isPoint(input) && isRecord(input) &&
    isBoundedNumber(input.normalizedX, 0, 1) && isBoundedNumber(input.normalizedY, 0, 1);
}

function isCamera(input: unknown): boolean {
  return isRecord(input) && isFiniteNumber(input.scrollX) && isFiniteNumber(input.scrollY) &&
    isPositiveNumber(input.zoom) && isPositiveNumber(input.width) && isPositiveNumber(input.height) &&
    isRecord(input.worldView) && isFiniteNumber(input.worldView.x) && isFiniteNumber(input.worldView.y) &&
    isPositiveNumber(input.worldView.width) && isPositiveNumber(input.worldView.height);
}

function isViewport(input: unknown): boolean {
  return isRecord(input) && isPositiveInteger(input.windowWidth) && isPositiveInteger(input.windowHeight) &&
    isPositiveNumber(input.devicePixelRatio) && isRecord(input.canvasRect) &&
    isFiniteNumber(input.canvasRect.left) && isFiniteNumber(input.canvasRect.top) &&
    isPositiveNumber(input.canvasRect.width) && isPositiveNumber(input.canvasRect.height) &&
    isRecord(input.drawingBuffer) && isPositiveInteger(input.drawingBuffer.width) &&
    isPositiveInteger(input.drawingBuffer.height);
}

function isAnnotationInteraction(input: unknown): input is FarmAnnotationInteraction {
  return isRecord(input) && typeof input.selectedTool === 'string' && typeof input.activePanel === 'string' &&
    typeof input.paused === 'boolean' && (input.speed === 1 || input.speed === 2 || input.speed === 4);
}

function defaultAnnotationTarget(state: FarmState, pick: FarmAnnotationPick): FarmAnnotationTarget {
  const { x, y } = pick.gridCell;
  const inBounds = x >= 0 && y >= 0 && x < state.width && y < state.height;
  const tile = inBounds ? state.tiles[`${x},${y}`] ?? null : null;
  const kind = tile?.kind ?? (inBounds ? 'wild-land' : 'meadow');
  return {
    kind,
    semanticId: tile || inBounds ? `tile:${x},${y}` : `world:${pick.worldPx.x},${pick.worldPx.y}`,
    label: targetLabel(tile, inBounds, x, y),
    entityId: null,
    cell: inBounds ? { x, y } : null,
    worldPx: structuredClone(pick.worldPx),
    snapshot: tile ? structuredClone(tile) : null,
  };
}

function targetLabel(tile: FarmTile | null, inBounds: boolean, x: number, y: number): string {
  if (!inBounds) return `Meadow / ${Math.round(x)},${Math.round(y)}`;
  if (!tile) return `Wild Land / ${x},${y}`;
  if (tile.kind === 'well') return `Well / ${x},${y}`;
  if (tile.kind === 'storage') return `Storage / ${x},${y}`;
  if (tile.kind === 'plot' && tile.plot) return `${capitalize(tile.plot.cropId)} Plot / ${x},${y}`;
  if (tile.kind === 'plot') return `Empty Plot / ${x},${y}`;
  return `Empty Land / ${x},${y}`;
}

function normalizeMessage(message: string): string {
  const normalized = message.trim();
  if (normalized.length === 0) throw new Error('Annotation comment cannot be empty.');
  if (normalized.length > FARM_ANNOTATION_MESSAGE_LIMIT) {
    throw new Error(`Annotation comments are limited to ${FARM_ANNOTATION_MESSAGE_LIMIT} characters.`);
  }
  return normalized;
}

function isAnnotationTarget(input: unknown): input is FarmAnnotationTarget {
  if (!isRecord(input) || typeof input.kind !== 'string' || typeof input.semanticId !== 'string') return false;
  if (typeof input.label !== 'string' || (input.entityId !== null && typeof input.entityId !== 'string')) return false;
  return isPoint(input.worldPx) && (input.cell === null || (isRecord(input.cell) && isInteger(input.cell.x) && isInteger(input.cell.y)));
}

function isPoint(input: unknown): input is AnnotationPoint {
  return isRecord(input) && isFiniteNumber(input.x) && isFiniteNumber(input.y);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

function isFiniteNumber(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input);
}

function isNonNegativeNumber(input: unknown): input is number {
  return isFiniteNumber(input) && input >= 0;
}

function isPositiveNumber(input: unknown): input is number {
  return isFiniteNumber(input) && input > 0;
}

function isBoundedNumber(input: unknown, minimum: number, maximum: number): input is number {
  return isFiniteNumber(input) && input >= minimum && input <= maximum;
}

function isInteger(input: unknown): input is number {
  return typeof input === 'number' && Number.isInteger(input);
}

function isPositiveInteger(input: unknown): input is number {
  return isInteger(input) && input > 0;
}

function isNonNegativeInteger(input: unknown): input is number {
  return isInteger(input) && input >= 0;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
