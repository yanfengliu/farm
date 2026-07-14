import type { FarmAnnotationBoxSelection, FarmAnnotationPick } from '../annotations/farmAnnotations';
import {
  createFarmAnnotationBoxSelection,
  farmAnnotationBoxCenter,
  farmAnnotationBoxMeetsMinimumSize,
} from '../annotations/farmAnnotationSelection';

export type FarmAnnotationMode = 'point' | 'box';

export interface FarmAnnotationBoxResult {
  pick: FarmAnnotationPick;
  meetsMinimum: boolean;
}

export class AnnotationGesture {
  #mode: FarmAnnotationMode = 'point';
  #start: FarmAnnotationPick | null = null;
  #current: FarmAnnotationPick | null = null;

  get mode(): FarmAnnotationMode { return this.#mode; }
  get isDragging(): boolean { return this.#start !== null; }

  get selection(): FarmAnnotationBoxSelection | null {
    return this.#start && this.#current ? selectionBetween(this.#start, this.#current) : null;
  }

  setMode(mode: FarmAnnotationMode): boolean {
    const cancelled = this.cancel();
    this.#mode = mode;
    return cancelled;
  }

  begin(pick: FarmAnnotationPick): boolean {
    if (this.#mode !== 'box') return false;
    this.#start = structuredClone(pick);
    this.#current = structuredClone(pick);
    return true;
  }

  move(pick: FarmAnnotationPick): boolean {
    if (!this.#start) return false;
    this.#current = structuredClone(pick);
    return true;
  }

  finish(pick: FarmAnnotationPick, tileSize: number, minimumSize = 12): FarmAnnotationBoxResult | null {
    if (!this.#start) return null;
    const start = this.#start;
    this.#start = null;
    this.#current = null;
    const capture = createBoxPick(start, pick, tileSize);
    return {
      pick: capture,
      meetsMinimum: farmAnnotationBoxMeetsMinimumSize(capture.selection!, minimumSize),
    };
  }

  cancel(): boolean {
    if (!this.#start) return false;
    this.#start = null;
    this.#current = null;
    return true;
  }
}

export function createBoxPick(
  start: FarmAnnotationPick,
  end: FarmAnnotationPick,
  tileSize: number,
): FarmAnnotationPick {
  const selection = selectionBetween(start, end);
  const center = farmAnnotationBoxCenter(selection);
  return {
    ...structuredClone(end),
    ...center,
    gridCell: {
      x: Math.floor(center.worldPx.x / tileSize),
      y: Math.floor(center.worldPx.y / tileSize),
    },
    previewDataUrl: null,
    selection,
  };
}

function selectionBetween(start: FarmAnnotationPick, end: FarmAnnotationPick): FarmAnnotationBoxSelection {
  return createFarmAnnotationBoxSelection({
    clientStart: start.clientPx,
    clientEnd: end.clientPx,
    canvasStart: start.canvasPx,
    canvasEnd: end.canvasPx,
    worldStart: start.worldPx,
    worldEnd: end.worldPx,
    canvasSize: {
      width: end.viewport.canvasRect.width,
      height: end.viewport.canvasRect.height,
    },
  });
}
