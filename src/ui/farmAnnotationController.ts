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
import { AnnotationGesture, createBoxPick, type FarmAnnotationMode } from './annotationGesture';
import { copyAnnotationJsonOrDownload, downloadAnnotationJson } from './annotationSharing';
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
  captureKeyboardBox(): { start: FarmAnnotationPick; end: FarmAnnotationPick } | null;
}

export class FarmAnnotationController implements FarmAnnotationUi {
  readonly #options: FarmAnnotationControllerOptions;
  readonly #markers: AnnotationMarkerLayer;
  readonly #gesture = new AnnotationGesture();
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
  #pausedBeforePointer: boolean | null = null;

  constructor(options: FarmAnnotationControllerOptions) {
    this.#options = options;
    this.#store = loadFarmAnnotations();
    this.#markers = new AnnotationMarkerLayer(options.shell.canvasHost, (id) => this.viewAnnotation(id));
  }

  get isAiming(): boolean { return this.#aiming; }
  get isDrafting(): boolean { return this.#draft !== null; }
  get ownsGameplayInput(): boolean { return this.isDrafting || this.#gesture.isDragging; }
  get count(): number { return this.#store.records.length; }

  panelMarkup(): string {
    return annotationPanelMarkup({
      store: this.#store,
      draft: this.#draft,
      editingId: this.#editingId,
      aiming: this.#aiming,
      mode: this.#gesture.mode,
      isBoxDragging: this.#gesture.isDragging,
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
    if (this.#aiming) {
      this.stopAiming();
      return;
    }
    this.#editingId = null;
    this.#editingMessage = '';
    this.#pendingDeleteId = null;
    this.#aiming = true;
    this.#options.openPanel();
    this.#options.invalidatePanel();
  }

  stopAiming(): void {
    if (!this.#aiming) return;
    this.cancelPointerSelection();
    this.#aiming = false;
    this.#options.invalidatePanel();
  }

  private capturePick(pick: FarmAnnotationPick, pausedBefore = this.#options.getPaused()): boolean {
    if (this.#draft) return true;
    if (!this.#aiming) return false;
    const state = this.#options.getState();
    const canvas = this.#options.shell.canvasHost.querySelector<HTMLCanvasElement>('canvas');
    const enrichedPick: FarmAnnotationPick = {
      ...structuredClone(pick),
      previewDataUrl: canvas ? captureFarmAnnotationPreview(canvas, pick.canvasPx, pick.selection) : null,
      target: resolveFarmAnnotationTarget(state, pick.worldPx, TILE_SIZE),
    };
    this.#pausedBeforeDraft = pausedBefore;
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

  handlePointerDown(pick: FarmAnnotationPick): boolean {
    if (this.#draft) return true;
    if (!this.#aiming) return false;
    if (this.#gesture.mode === 'point') return this.capturePick(pick);
    if (!this.#gesture.begin(pick)) return false;
    this.#pausedBeforePointer = this.#options.getPaused();
    this.#options.setPaused(true);
    this.#status = null;
    this.#options.invalidatePanel();
    return true;
  }

  handlePointerMove(pick: FarmAnnotationPick): boolean { return this.#gesture.move(pick); }

  handlePointerUp(pick: FarmAnnotationPick): boolean {
    const result = this.#gesture.finish(pick, TILE_SIZE);
    if (!result) return false;
    this.#markers.clearDraftBox();
    const pausedBefore = this.#pausedBeforePointer ?? this.#options.getPaused();
    this.#pausedBeforePointer = null;
    if (!result.meetsMinimum) {
      this.#options.setPaused(pausedBefore);
      this.#status = 'Drag a larger box (at least 12 by 12 pixels).';
      this.#options.invalidatePanel();
      return true;
    }
    return this.capturePick(result.pick, pausedBefore);
  }

  cancelPointerSelection(): void {
    if (!this.#gesture.cancel()) return;
    this.#markers.clearDraftBox();
    if (this.#pausedBeforePointer !== null) this.#options.setPaused(this.#pausedBeforePointer);
    this.#pausedBeforePointer = null;
    this.#options.invalidatePanel();
  }

  handleClick(target: Element): boolean {
    const control = target.closest<HTMLElement>('[data-command]');
    const command = control?.dataset.command;
    if (!command || !ANNOTATION_COMMANDS.has(command)) return false;
    const id = control?.dataset.annotationId;
    if (command === 'set-annotation-point') this.setMode('point');
    else if (command === 'set-annotation-box') this.setMode('box');
    else if (command === 'start-annotation') this.toggleAiming();
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
      if (this.#gesture.isDragging) this.cancelPointerSelection();
      else if (this.#draft) this.cancelDraft(true);
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
    if (event.key === 'Enter' && this.#gesture.isDragging && !targetIsControl) { event.preventDefault(); return true; }
    if (event.key === 'Enter' && this.#aiming && !targetIsControl) {
      if (this.#gesture.mode === 'box') {
        const box = this.#options.captureKeyboardBox();
        if (box) this.capturePick(createBoxPick(box.start, box.end, TILE_SIZE));
      } else {
        const pick = this.#options.captureKeyboardPick();
        if (pick) this.capturePick(pick);
      }
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
    this.#markers.render(this.#store.records, {
      aiming: this.#aiming,
      mode: this.#gesture.mode,
      draftBox: this.#gesture.selection ?? this.#draft?.capture.pick.selection ?? null,
    }, this.#options.projectWorld);
  }

  onFarmReset(): void {
    if (this.#draft) this.#options.setPaused(this.#pausedBeforeDraft);
    else this.cancelPointerSelection();
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
    return formatFarmAnnotationContext(this.#store, {
      aiming: this.#aiming, draft: Boolean(this.#draft), mode: this.#gesture.mode, dragging: this.#gesture.isDragging,
    });
  }

  exportAnnotation(id: string): string | null {
    const record = this.find(id);
    return record ? formatFarmAnnotationBundleJson(record) : null;
  }

  exportAnnotations(): string {
    return formatFarmAnnotationCollectionJson(this.#store);
  }

  private setMode(mode: FarmAnnotationMode): void {
    if (this.#draft) return;
    this.cancelPointerSelection();
    this.#gesture.setMode(mode);
    this.#status = null;
    this.#options.invalidatePanel();
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
      this.#status = `Pinned ${queued.record.capture.pick.selection ? 'box note' : 'note'} #${queued.record.index}.`;
      this.#pendingDeleteId = null;
      this.#options.setPaused(this.#pausedBeforeDraft);
      this.persist();
      this.#options.invalidatePanel();
      this.renderOverlay();
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
    const copied = await copyAnnotationJsonOrDownload(`farm-note-${index}.json`, json);
    this.setStatus(copied ? `Copied note #${index}.` : `Clipboard unavailable; downloaded note #${index}.`);
  }

  private downloadAnnotation(id: string): void {
    const json = this.exportAnnotation(id);
    if (!json) return;
    const index = this.find(id)?.index ?? 'unknown';
    downloadAnnotationJson(`farm-note-${index}.json`, json);
    this.setStatus(`Downloaded note #${index}.`);
  }

  private async copyAll(): Promise<void> {
    const json = this.exportAnnotations();
    const copied = await copyAnnotationJsonOrDownload('farm-notes.json', json);
    this.setStatus(copied ? 'Copied all Farm Notes.' : 'Clipboard unavailable; downloaded all Farm Notes.');
  }

  private downloadAll(): void {
    downloadAnnotationJson('farm-notes.json', this.exportAnnotations());
    this.setStatus('Downloaded all Farm Notes.');
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
  'set-annotation-point', 'set-annotation-box',
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
