import type { FarmAnnotationBoxSelection, FarmAnnotationBundleV1 } from '../annotations/farmAnnotations';
import type { FarmAnnotationMode } from './annotationGesture';

export interface AnnotationProjection { x: number; y: number; visible: boolean; }
export type AnnotationProjector = (worldPx: { x: number; y: number }) => AnnotationProjection | null;

interface AnnotationOverlayState {
  aiming: boolean;
  mode: FarmAnnotationMode;
  draftBox: FarmAnnotationBoxSelection | null;
}

interface MarkerParts {
  element: HTMLElement;
  badge: HTMLButtonElement;
  selection: FarmAnnotationBoxSelection | null;
}

export class AnnotationMarkerLayer {
  readonly #root: HTMLDivElement;
  readonly #markers = new Map<string, MarkerParts>();
  readonly #onSelect: (id: string) => void;
  #aim!: HTMLDivElement;
  #draftBox!: HTMLDivElement;
  #signature = '__unrendered__';
  #pulseTimer: number | null = null;

  constructor(host: HTMLElement, onSelect: (id: string) => void) {
    this.#onSelect = onSelect;
    this.#root = document.createElement('div');
    this.#root.className = 'annotation-overlay';
    this.#root.setAttribute('aria-label', 'Farm annotation markers');
    host.append(this.#root);
  }

  render(records: FarmAnnotationBundleV1[], state: AnnotationOverlayState, projector: AnnotationProjector): void {
    const current = records.filter((record) => record.context === 'current-farm');
    const signature = current.map(markerSignature).join('|');
    if (signature !== this.#signature) this.rebuild(current);
    this.#root.classList.toggle('aiming', state.aiming);
    this.#root.classList.toggle('box-aiming', state.aiming && state.mode === 'box');
    this.#root.parentElement?.classList.toggle('annotation-aiming', state.aiming);
    this.#aim.querySelector('strong')!.textContent = state.mode === 'box'
      ? state.draftBox ? 'Release to capture area' : 'Drag to frame an area'
      : 'Click to pin a note';
    this.placeDraftBox(state.draftBox, projector);

    for (const record of current) {
      const marker = this.#markers.get(record.id);
      if (!marker) continue;
      if (marker.selection) this.placeBox(marker.element, marker.selection, projector, marker.badge);
      else this.placePoint(marker.element, record.target.worldPx, projector);
    }
  }

  pulse(id: string): void {
    if (this.#pulseTimer !== null) window.clearTimeout(this.#pulseTimer);
    for (const marker of this.#markers.values()) marker.element.classList.remove('pulse');
    const marker = this.#markers.get(id);
    if (!marker) return;
    marker.element.classList.add('pulse');
    this.#pulseTimer = window.setTimeout(() => marker.element.classList.remove('pulse'), 1400);
  }

  clearDraftBox(): void {
    this.#draftBox?.remove();
  }

  private rebuild(records: FarmAnnotationBundleV1[]): void {
    this.#root.replaceChildren();
    this.#markers.clear();
    this.#aim = document.createElement('div');
    this.#aim.className = 'annotation-aim';
    this.#aim.setAttribute('aria-hidden', 'true');
    this.#aim.innerHTML = '<span></span><strong>Click to pin a note</strong>';
    this.#root.append(this.#aim);
    this.#draftBox = document.createElement('div');
    this.#draftBox.className = 'annotation-box annotation-box-live';
    this.#draftBox.dataset.annotationBoxDraft = '';
    for (const record of records) this.addRecord(record);
    this.#signature = records.map(markerSignature).join('|');
  }

  private addRecord(record: FarmAnnotationBundleV1): void {
    const selection = record.capture.pick.selection ?? null;
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.dataset.annotationId = record.id;
    badge.dataset.annotationIndex = String(record.index);
    badge.setAttribute('aria-label', `${selection ? 'Box note' : 'Note'} ${record.index}: ${record.target.label}`);
    badge.title = `#${record.index} · ${record.target.label}`;
    badge.textContent = String(record.index);
    badge.addEventListener('click', () => this.#onSelect(record.id));
    if (selection) {
      const box = document.createElement('div');
      box.className = 'annotation-box';
      box.dataset.annotationIndex = String(record.index);
      badge.className = 'annotation-box-pin';
      box.append(badge);
      this.#root.append(box);
      this.#markers.set(record.id, { element: box, badge, selection });
    } else {
      badge.className = 'annotation-pin';
      this.#root.append(badge);
      this.#markers.set(record.id, { element: badge, badge, selection: null });
    }
  }

  private placePoint(element: HTMLElement, worldPx: { x: number; y: number }, projector: AnnotationProjector): void {
    const projected = projector(worldPx);
    if (!projected?.visible) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    element.style.transform = `translate(${Math.round(projected.x)}px, ${Math.round(projected.y)}px)`;
  }

  private placeDraftBox(selection: FarmAnnotationBoxSelection | null, projector: AnnotationProjector): void {
    if (!selection) {
      this.#draftBox.remove();
      return;
    }
    if (!this.#draftBox.isConnected) this.#root.append(this.#draftBox);
    this.placeBox(this.#draftBox, selection, projector);
  }

  private placeBox(
    element: HTMLElement,
    selection: FarmAnnotationBoxSelection,
    projector: AnnotationProjector,
    badge?: HTMLButtonElement,
  ): void {
    const start = projector({ x: selection.worldRect.x, y: selection.worldRect.y });
    const end = projector({
      x: selection.worldRect.x + selection.worldRect.width,
      y: selection.worldRect.y + selection.worldRect.height,
    });
    if (!start || !end) {
      element.hidden = true;
      return;
    }
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    if (right < 0 || bottom < 0 || left > this.#root.clientWidth || top > this.#root.clientHeight) {
      element.hidden = true;
      return;
    }
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    element.hidden = false;
    element.style.width = `${Math.round(width)}px`;
    element.style.height = `${Math.round(height)}px`;
    element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    if (badge) {
      badge.style.left = `${Math.round(clamp(Math.max(0, -left) + 4, 4, Math.max(4, width - 28)))}px`;
      badge.style.top = `${Math.round(clamp(Math.max(0, -top) + 4, 4, Math.max(4, height - 28)))}px`;
    }
  }
}

function markerSignature(record: FarmAnnotationBundleV1): string {
  return `${record.id}:${record.index}:${record.target.label}:${record.capture.pick.selection?.kind ?? 'point'}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
