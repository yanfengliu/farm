import type { FarmShellElements } from './appShell';

export const PANEL_WIDTH_DEFAULT = 340;
export const PANEL_WIDTH_MIN = 300;
export const PANEL_WIDTH_MAX = 560;
const PANEL_PLAYFIELD_MIN = 360;
const PANEL_WIDTH_STORAGE_KEY = 'farm-side-panel-width-v1';

export interface PanelResizeOptions {
  shell: FarmShellElements;
  isCollapsed(): boolean;
  onLayout(): void;
}

export class PanelResizeController {
  readonly #shell: FarmShellElements;
  readonly #isCollapsed: () => boolean;
  readonly #onLayout: () => void;
  #width = loadPanelWidth();
  #drag: { pointerId: number; startX: number; startWidth: number } | null = null;

  constructor(options: PanelResizeOptions) {
    this.#shell = options.shell;
    this.#isCollapsed = options.isCollapsed;
    this.#onLayout = options.onLayout;
    this.applyWidth();
    this.attachEvents();
  }

  private attachEvents(): void {
    this.#shell.panelResizer.addEventListener('pointerdown', (event) => {
      if (this.#isCollapsed()) return;
      this.#drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: this.#shell.sidePanel.getBoundingClientRect().width,
      };
      this.#shell.panelResizer.setPointerCapture(event.pointerId);
      document.body.classList.add('panel-resizing');
      event.preventDefault();
    });

    document.addEventListener('pointermove', (event) => {
      if (!this.#drag || this.#drag.pointerId !== event.pointerId) return;
      const draggedLeft = this.#drag.startX - event.clientX;
      this.setWidth(this.#drag.startWidth + draggedLeft, false);
      event.preventDefault();
    });

    const stopResize = (event: PointerEvent): void => {
      if (!this.#drag || this.#drag.pointerId !== event.pointerId) return;
      this.#drag = null;
      document.body.classList.remove('panel-resizing');
      this.saveWidth();
    };
    document.addEventListener('pointerup', stopResize);
    document.addEventListener('pointercancel', stopResize);

    this.#shell.panelResizer.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 48 : 24;
      if (event.key === 'ArrowLeft') this.setWidth(this.#width + step, true);
      else if (event.key === 'ArrowRight') this.setWidth(this.#width - step, true);
      else if (event.key === 'Home') this.setWidth(PANEL_WIDTH_MIN, true);
      else if (event.key === 'End') this.setWidth(this.maxWidth(), true);
      else return;
      event.preventDefault();
      event.stopPropagation();
    });

    window.addEventListener('resize', () => {
      this.setWidth(this.#width, false);
      this.#onLayout();
    });
  }

  private maxWidth(): number {
    return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, window.innerWidth - PANEL_PLAYFIELD_MIN));
  }

  private setWidth(nextWidth: number, persist: boolean): void {
    this.#width = Math.round(clamp(nextWidth, PANEL_WIDTH_MIN, this.maxWidth()));
    this.applyWidth();
    if (persist) this.saveWidth();
  }

  private applyWidth(): void {
    const maxWidth = this.maxWidth();
    this.#width = Math.round(clamp(this.#width, PANEL_WIDTH_MIN, maxWidth));
    this.#shell.playArea.style.setProperty('--side-panel-width', `${this.#width}px`);
    this.#shell.panelResizer.setAttribute('aria-valuemin', String(PANEL_WIDTH_MIN));
    this.#shell.panelResizer.setAttribute('aria-valuemax', String(maxWidth));
    this.#shell.panelResizer.setAttribute('aria-valuenow', String(this.#width));
  }

  private saveWidth(): void {
    try {
      localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(this.#width));
    } catch {
      // UI preferences are nice-to-have and should not block play.
    }
  }
}

function loadPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    if (raw === null) return PANEL_WIDTH_DEFAULT;
    const stored = Number(raw);
    return Number.isFinite(stored) ? clamp(stored, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX) : PANEL_WIDTH_DEFAULT;
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
