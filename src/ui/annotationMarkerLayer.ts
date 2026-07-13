import type { FarmAnnotationBundleV1 } from '../annotations/farmAnnotations';

export interface AnnotationProjection {
  x: number;
  y: number;
  visible: boolean;
}

export type AnnotationProjector = (worldPx: { x: number; y: number }) => AnnotationProjection | null;

export class AnnotationMarkerLayer {
  readonly #root: HTMLDivElement;
  readonly #pins = new Map<string, HTMLButtonElement>();
  readonly #onSelect: (id: string) => void;
  #signature = '__unrendered__';
  #pulseTimer: number | null = null;

  constructor(host: HTMLElement, onSelect: (id: string) => void) {
    this.#onSelect = onSelect;
    this.#root = document.createElement('div');
    this.#root.className = 'annotation-overlay';
    this.#root.setAttribute('aria-label', 'Farm annotation pins');
    host.append(this.#root);
  }

  render(records: FarmAnnotationBundleV1[], aiming: boolean, projector: AnnotationProjector): void {
    const current = records.filter((record) => record.context === 'current-farm');
    const signature = current.map((record) => `${record.id}:${record.index}:${record.target.label}`).join('|');
    if (signature !== this.#signature) this.rebuild(current);
    this.#root.classList.toggle('aiming', aiming);
    this.#root.parentElement?.classList.toggle('annotation-aiming', aiming);
    for (const record of current) {
      const pin = this.#pins.get(record.id);
      const projected = projector(record.target.worldPx);
      if (!pin || !projected || !projected.visible) {
        if (pin) pin.hidden = true;
        continue;
      }
      pin.hidden = false;
      pin.style.transform = `translate(${Math.round(projected.x)}px, ${Math.round(projected.y)}px)`;
    }
  }

  pulse(id: string): void {
    if (this.#pulseTimer !== null) window.clearTimeout(this.#pulseTimer);
    for (const pin of this.#pins.values()) pin.classList.remove('pulse');
    const pin = this.#pins.get(id);
    if (!pin) return;
    pin.classList.add('pulse');
    this.#pulseTimer = window.setTimeout(() => pin.classList.remove('pulse'), 1400);
  }

  private rebuild(records: FarmAnnotationBundleV1[]): void {
    this.#root.replaceChildren();
    this.#pins.clear();
    const aim = document.createElement('div');
    aim.className = 'annotation-aim';
    aim.setAttribute('aria-hidden', 'true');
    aim.innerHTML = '<span></span><strong>Click to pin a note</strong>';
    this.#root.append(aim);
    for (const record of records) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'annotation-pin';
      pin.dataset.annotationId = record.id;
      pin.dataset.annotationIndex = String(record.index);
      pin.setAttribute('aria-label', `Note ${record.index}: ${record.target.label}`);
      pin.title = `#${record.index} · ${record.target.label}`;
      pin.textContent = String(record.index);
      pin.addEventListener('click', () => this.#onSelect(record.id));
      this.#root.append(pin);
      this.#pins.set(record.id, pin);
    }
    this.#signature = records.map((record) => `${record.id}:${record.index}:${record.target.label}`).join('|');
  }
}
