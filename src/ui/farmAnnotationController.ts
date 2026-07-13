import { captureFarmAnnotationPreview } from '../annotations/farmAnnotationCapture';
import {
  createFarmAnnotationDraft,
  deleteFarmAnnotation,
  editFarmAnnotation,
  formatFarmAnnotationBundleJson,
  formatFarmAnnotationCollectionJson,
  formatFarmAnnotationContext,
  markFarmAnnotationsPast,
  queueFarmAnnotation,
  type FarmAnnotationBundleV1,
  type FarmAnnotationDraft,
  type FarmAnnotationInteraction,
  type FarmAnnotationPick,
  type FarmAnnotationStore,
} from '../annotations/farmAnnotations';
import type { FarmState } from '../game/simulation/farmGame';
import { loadFarmAnnotations, saveFarmAnnotations } from '../persistence/localAnnotations';
import { resolveFarmAnnotationTarget } from '../phaser/view/farmAnnotationTarget';
import { TILE_SIZE } from '../phaser/view/farmRenderer';
import { annotationPanelMarkup } from './annotationPanel';
import { AnnotationMarkerLayer, type AnnotationProjector } from './annotationMarkerLayer';
import type { FarmShellElements } from './appShell';
import type { FarmAnnotationUi } from './farmAnnotationUi';

interface FarmAnnotationControllerOptions {
  shell: FarmShellElements;
  getState(): FarmState;
  renderStateText(): string;
  getInteraction(): FarmAnnotationInteraction;
  getPaused(): boolean;
  setPaused(paused: boolean): void;
  openPanel(): void;
  invalidatePanel(): void;
  projectWorld: AnnotationProjector;
  restoreCamera(camera: FarmAnnotationPick['camera']): void;
  captureKeyboardPick(): FarmAnnotationPick | null;
}

export class FarmAnnotationController implements FarmAnnotationUi {
  readonly #options: FarmAnnotationControllerOptions;
  readonly #markers: AnnotationMarkerLayer;
  #store: FarmAnnotationStore;
  #draft: FarmAnnotationDraft | null = null;
  #editingId: string | null = null;
  #selectedId: string | null = null;
  #aiming = false;
  #pausedBeforeDraft = false;
  #storageWarning: string | null = null;
  #editorError: string | null = null;
  #status: string | null = null;
  #pendingDeleteId: string | null = null;
  #draftMessage = '';
  #editingMessage = '';

  constructor(options: FarmAnnotationControllerOptions) {
    this.#options = options;
    this.#store = loadFarmAnnotations();
    this.#markers = new AnnotationMarkerLayer(options.shell.canvasHost, (id) => this.viewAnnotation(id));
  }

  get isAiming(): boolean {
    return this.#aiming;
  }

  get isDrafting(): boolean {
    return this.#draft !== null;
  }

  get count(): number {
    return this.#store.records.length;
  }

  panelMarkup(): string {
    return annotationPanelMarkup({
      store: this.#store,
      draft: this.#draft,
      editingId: this.#editingId,
      aiming: this.#aiming,
      selectedId: this.#selectedId,
      storageWarning: this.#storageWarning,
      editorError: this.#editorError,
      status: this.#status,
      pendingDeleteId: this.#pendingDeleteId,
      draftMessage: this.#draftMessage,
      editingMessage: this.#editingMessage,
    });
  }

  toggleAiming(): void {
    if (this.#draft) {
      this.cancelDraft(false);
      return;
    }
    this.#editingId = null;
    this.#editingMessage = '';
    this.#pendingDeleteId = null;
    this.#aiming = !this.#aiming;
    if (this.#aiming) this.#options.openPanel();
    this.#options.invalidatePanel();
  }

  stopAiming(): void {
    if (!this.#aiming) return;
    this.#aiming = false;
    this.#options.invalidatePanel();
  }

  capturePick(pick: FarmAnnotationPick): boolean {
    if (!this.#aiming || this.#draft) return false;
    const state = this.#options.getState();
    const canvas = this.#options.shell.canvasHost.querySelector<HTMLCanvasElement>('canvas');
    const enrichedPick: FarmAnnotationPick = {
      ...structuredClone(pick),
      previewDataUrl: canvas ? captureFarmAnnotationPreview(canvas, pick.canvasPx) : null,
      target: resolveFarmAnnotationTarget(state, pick.worldPx, TILE_SIZE),
    };
    this.#pausedBeforeDraft = this.#options.getPaused();
    this.#draft = createFarmAnnotationDraft({
      state,
      pick: enrichedPick,
      interaction: { ...this.#options.getInteraction(), selectedTool: 'note' },
      stateText: this.#options.renderStateText(),
    });
    this.#draftMessage = '';
    this.#editorError = null;
    this.#status = null;
    this.#pendingDeleteId = null;
    this.#aiming = false;
    this.#options.setPaused(true);
    this.#options.openPanel();
    this.#options.invalidatePanel();
    focusOnNextFrame('[data-annotation-draft]');
    return true;
  }

  handleClick(target: Element): boolean {
    const control = target.closest<HTMLElement>('[data-command]');
    const command = control?.dataset.command;
    if (!command || !ANNOTATION_COMMANDS.has(command)) return false;
    const id = control?.dataset.annotationId;
    if (command === 'start-annotation') this.toggleAiming();
    else if (command === 'save-annotation') this.saveDraft();
    else if (command === 'cancel-annotation') this.cancelDraft(true);
    else if (command === 'edit-annotation' && id) this.startEditing(id);
    else if (command === 'save-edit-annotation' && id) this.saveEdit(id);
    else if (command === 'cancel-edit-annotation') this.cancelEdit();
    else if (command === 'view-annotation' && id) this.viewAnnotation(id);
    else if (command === 'delete-annotation' && id) this.deleteAnnotation(id);
    else if (command === 'copy-annotation' && id) void this.copyAnnotation(id);
    else if (command === 'export-annotation' && id) this.downloadAnnotation(id);
    else if (command === 'copy-annotations') void this.copyAll();
    else if (command === 'export-annotations') this.downloadAll();
    return true;
  }

  handleInput(target: Element): boolean {
    if (!(target instanceof HTMLTextAreaElement)) return false;
    if (target.matches('[data-annotation-draft]')) this.#draftMessage = target.value;
    else if (target.matches('[data-annotation-edit]')) this.#editingMessage = target.value;
    else return false;
    this.#editorError = null;
    const warning = this.#options.shell.panelContent.querySelector<HTMLElement>('.annotation-editor-warning');
    if (warning) {
      warning.textContent = '';
      warning.hidden = true;
    }
    return true;
  }

  handleKeydown(event: KeyboardEvent): boolean {
    const targetIsControl = event.target instanceof Element && Boolean(event.target.closest(
      'button, input, select, textarea, [contenteditable="true"], [role="button"]',
    ));
    if (event.key === 'Escape') {
      if (this.#draft) this.cancelDraft(true);
      else if (this.#editingId) this.cancelEdit();
      else if (this.#aiming) this.stopAiming();
      else return false;
      event.preventDefault();
      return true;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      if (this.#draft) this.saveDraft();
      else if (this.#editingId) this.saveEdit(this.#editingId);
      else return false;
      event.preventDefault();
      return true;
    }
    if (event.key === 'Enter' && this.#aiming && !targetIsControl) {
      const pick = this.#options.captureKeyboardPick();
      if (pick) this.capturePick(pick);
      event.preventDefault();
      return true;
    }
    if (!targetIsControl && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.toggleAiming();
      return true;
    }
    return false;
  }

  renderOverlay(): void {
    this.#markers.render(this.#store.records, this.#aiming, this.#options.projectWorld);
  }

  onFarmReset(): void {
    if (this.#draft) this.#options.setPaused(this.#pausedBeforeDraft);
    blurAnnotationEditor();
    this.#draft = null;
    this.#draftMessage = '';
    this.#editingId = null;
    this.#editingMessage = '';
    this.#editorError = null;
    this.#status = null;
    this.#pendingDeleteId = null;
    this.#selectedId = null;
    this.#aiming = false;
    this.#store = markFarmAnnotationsPast(this.#store);
    this.persist();
    this.#options.invalidatePanel();
  }

  getStore(): FarmAnnotationStore {
    return structuredClone(this.#store);
  }

  getContext(): string {
    return formatFarmAnnotationContext(this.#store, { aiming: this.#aiming, draft: Boolean(this.#draft) });
  }

  exportAnnotation(id: string): string | null {
    const record = this.find(id);
    return record ? formatFarmAnnotationBundleJson(record) : null;
  }

  exportAnnotations(): string {
    return formatFarmAnnotationCollectionJson(this.#store);
  }

  private saveDraft(): void {
    if (!this.#draft) return;
    const textarea = this.#options.shell.panelContent.querySelector<HTMLTextAreaElement>('[data-annotation-draft]');
    try {
      const queued = queueFarmAnnotation(this.#store, this.#draft, textarea?.value ?? this.#draftMessage);
      this.#store = queued.store;
      this.#selectedId = queued.record.id;
      blurAnnotationEditor();
      this.#draft = null;
      this.#draftMessage = '';
      this.#editorError = null;
      this.#status = `Pinned note #${queued.record.index}.`;
      this.#pendingDeleteId = null;
      this.#options.setPaused(this.#pausedBeforeDraft);
      this.persist();
      this.#options.invalidatePanel();
      this.#markers.pulse(queued.record.id);
      focusOnNextFrame(annotationRecordSelector(queued.record.id));
    } catch (error) {
      this.showEditorError(error instanceof Error ? error.message : 'Could not save this note.');
    }
  }

  private cancelDraft(returnToAiming: boolean): void {
    if (!this.#draft) return;
    blurAnnotationEditor();
    this.#draft = null;
    this.#draftMessage = '';
    this.#editorError = null;
    this.#aiming = returnToAiming;
    this.#options.setPaused(this.#pausedBeforeDraft);
    this.#options.invalidatePanel();
    focusOnNextFrame(returnToAiming ? '#game-canvas canvas' : '[data-command="start-annotation"]');
  }

  private startEditing(id: string): void {
    if (!this.find(id)) return;
    this.#editingId = id;
    this.#editingMessage = this.find(id)?.message ?? '';
    this.#editorError = null;
    this.#selectedId = id;
    this.#pendingDeleteId = null;
    this.#aiming = false;
    this.#options.openPanel();
    this.#options.invalidatePanel();
    focusOnNextFrame('[data-annotation-edit]');
  }

  private saveEdit(id: string): void {
    const textarea = this.#options.shell.panelContent.querySelector<HTMLTextAreaElement>('[data-annotation-edit]');
    try {
      this.#store = editFarmAnnotation(this.#store, id, textarea?.value ?? this.#editingMessage);
      blurAnnotationEditor();
      this.#editingId = null;
      this.#editingMessage = '';
      this.#editorError = null;
      this.#status = `Updated note #${this.find(id)?.index ?? ''}.`;
      this.persist();
      this.#options.invalidatePanel();
      focusOnNextFrame(annotationRecordSelector(id));
    } catch (error) {
      this.showEditorError(error instanceof Error ? error.message : 'Could not edit this note.');
    }
  }

  private cancelEdit(): void {
    blurAnnotationEditor();
    this.#editingId = null;
    this.#editingMessage = '';
    this.#editorError = null;
    this.#options.invalidatePanel();
    if (this.#selectedId) focusOnNextFrame(annotationRecordSelector(this.#selectedId));
  }

  private viewAnnotation(id: string): void {
    const record = this.find(id);
    if (!record) return;
    this.#selectedId = id;
    this.#pendingDeleteId = null;
    this.#aiming = false;
    this.#options.restoreCamera(record.capture.pick.camera);
    this.#options.openPanel();
    this.#options.invalidatePanel();
    this.#markers.pulse(id);
    focusOnNextFrame(annotationRecordSelector(id));
    window.requestAnimationFrame(() => {
      this.#options.shell.panelContent.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  private deleteAnnotation(id: string): void {
    const index = this.find(id)?.index;
    if (!index) return;
    if (this.#pendingDeleteId !== id) {
      this.#pendingDeleteId = id;
      this.#status = `Press Confirm delete to remove note #${index}.`;
      this.#options.invalidatePanel();
      focusOnNextFrame(annotationCommandSelector('delete-annotation', id));
      return;
    }
    this.#store = deleteFarmAnnotation(this.#store, id);
    this.#pendingDeleteId = null;
    if (this.#selectedId === id) this.#selectedId = null;
    if (this.#editingId === id) {
      this.#editingId = null;
      this.#editingMessage = '';
    }
    this.persist();
    this.#status = index ? `Deleted note #${index}.` : 'Deleted note.';
    this.#options.invalidatePanel();
    focusOnNextFrame('[data-command="start-annotation"]');
  }

  private async copyAnnotation(id: string): Promise<void> {
    const json = this.exportAnnotation(id);
    if (!json) return;
    const index = this.find(id)?.index ?? 'unknown';
    const copied = await copyText(json);
    if (!copied) this.downloadJson(`farm-note-${index}.json`, json);
    this.setStatus(copied ? `Copied note #${index}.` : `Clipboard unavailable; downloaded note #${index}.`);
  }

  private downloadAnnotation(id: string): void {
    const json = this.exportAnnotation(id);
    if (!json) return;
    const index = this.find(id)?.index ?? 'unknown';
    this.downloadJson(`farm-note-${index}.json`, json);
    this.setStatus(`Downloaded note #${index}.`);
  }

  private async copyAll(): Promise<void> {
    const json = this.exportAnnotations();
    const copied = await copyText(json);
    if (!copied) this.downloadJson('farm-notes.json', json);
    this.setStatus(copied ? 'Copied all Farm Notes.' : 'Clipboard unavailable; downloaded all Farm Notes.');
  }

  private downloadAll(): void {
    this.downloadJson('farm-notes.json', this.exportAnnotations());
    this.setStatus('Downloaded all Farm Notes.');
  }

  private downloadJson(filename: string, json: string): void {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private find(id: string): FarmAnnotationBundleV1 | undefined {
    return this.#store.records.find((record) => record.id === id);
  }

  private persist(): void {
    const saved = saveFarmAnnotations(this.#store);
    this.#storageWarning = saved
      ? null
      : 'Note storage is full or unavailable. Copy or export your notes before closing this tab.';
  }

  private showEditorError(message: string): void {
    this.#editorError = message;
    const warning = this.#options.shell.panelContent.querySelector<HTMLElement>('.annotation-editor-warning');
    if (!warning) return;
    warning.textContent = message;
    warning.hidden = false;
  }

  private setStatus(message: string): void {
    this.#status = message;
    const status = this.#options.shell.panelContent.querySelector<HTMLElement>('.annotation-status');
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
  }
}

const ANNOTATION_COMMANDS = new Set([
  'start-annotation', 'save-annotation', 'cancel-annotation', 'edit-annotation',
  'save-edit-annotation', 'cancel-edit-annotation', 'view-annotation', 'delete-annotation',
  'copy-annotation', 'export-annotation', 'copy-annotations', 'export-annotations',
]);

function focusOnNextFrame(selector: string): void {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

function annotationRecordSelector(id: string): string {
  return `[data-command="view-annotation"][data-annotation-id="${CSS.escape(id)}"]`;
}

function annotationCommandSelector(command: string, id: string): string {
  return `[data-command="${command}"][data-annotation-id="${CSS.escape(id)}"]`;
}

function blurAnnotationEditor(): void {
  if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
