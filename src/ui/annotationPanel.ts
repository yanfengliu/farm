import {
  FARM_ANNOTATION_MESSAGE_LIMIT,
  type FarmAnnotationBundleV1,
  type FarmAnnotationDraft,
  type FarmAnnotationStore,
} from '../annotations/farmAnnotations';

export interface AnnotationPanelView {
  store: FarmAnnotationStore;
  draft: FarmAnnotationDraft | null;
  editingId: string | null;
  aiming: boolean;
  selectedId: string | null;
  storageWarning: string | null;
  editorError: string | null;
  status: string | null;
  pendingDeleteId: string | null;
  draftMessage: string;
  editingMessage: string;
}

export function annotationPanelMarkup(view: AnnotationPanelView): string {
  const current = view.store.records.filter((record) => record.context === 'current-farm');
  const past = view.store.records.filter((record) => record.context === 'past-farm');
  return `
    <section class="annotation-panel" aria-labelledby="annotation-panel-title">
      <div class="annotation-heading">
        <div>
          <p class="annotation-kicker">Field notebook</p>
          <h2 id="annotation-panel-title">Farm Notes <span>${view.store.records.length}</span></h2>
        </div>
        <button data-command="start-annotation" class="annotation-new">${view.draft ? 'Cancel draft' : view.aiming ? 'Stop aiming' : 'New note'}</button>
      </div>
      ${view.storageWarning ? `<p class="annotation-warning" role="status">${escapeHtml(view.storageWarning)}</p>` : ''}
      <p class="annotation-editor-warning" role="alert"${view.editorError ? '' : ' hidden'}>${escapeHtml(view.editorError ?? '')}</p>
      <p class="annotation-status" role="status"${view.status ? '' : ' hidden'}>${escapeHtml(view.status ?? '')}</p>
      ${draftMarkup(view)}
      ${view.aiming && !view.draft ? `
        <div class="annotation-aim-card" role="status">
          <span class="annotation-aim-pixel" aria-hidden="true"></span>
          <strong>Choose something in the farm</strong>
          <p>Click a duck, plant, building, creek detail, or tile. <kbd>Enter</kbd> captures the center. <kbd>Esc</kbd> exits.</p>
        </div>
      ` : ''}
      ${recordSection('Current farm', current, view)}
      ${recordSection('Past farms', past, view)}
      ${view.store.records.length === 0 && !view.draft && !view.aiming ? `
        <div class="annotation-empty">
          <span aria-hidden="true">✦</span>
          <strong>No notes yet</strong>
          <p>Press <kbd>N</kbd>, then click anything on the farm.</p>
        </div>
      ` : ''}
      ${view.store.records.length > 0 ? `
        <div class="annotation-bulk-actions">
          <button data-command="copy-annotations">Copy all</button>
          <button data-command="export-annotations">Export all</button>
        </div>
      ` : ''}
      <p class="annotation-help small">Notes are kept separately from your farm save and include the exact camera, state text, and a tiny evidence image.</p>
    </section>
  `;
}

function draftMarkup(view: AnnotationPanelView): string {
  if (!view.draft) return '';
  return `
    <div class="annotation-draft-card">
      <div class="annotation-draft-target">
        <span>Pinning</span>
        <strong>${escapeHtml(view.draft.target.label)}</strong>
      </div>
      ${view.draft.capture.previewDataUrl ? `<img class="annotation-preview" src="${view.draft.capture.previewDataUrl}" alt="Pixel preview of the selected farm detail">` : ''}
      <label for="annotation-draft-message">What should I look at?</label>
      <textarea id="annotation-draft-message" data-annotation-draft aria-label="What should I look at?" maxlength="${FARM_ANNOTATION_MESSAGE_LIMIT}" rows="5" placeholder="Describe the visual or gameplay concern" autofocus>${escapeHtml(view.draftMessage)}</textarea>
      <div class="annotation-editor-actions">
        <button data-command="cancel-annotation">Cancel</button>
        <button data-command="save-annotation" class="primary">Pin note</button>
      </div>
      <p class="small"><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> pins · <kbd>Esc</kbd> cancels</p>
    </div>
  `;
}

function recordSection(title: string, records: FarmAnnotationBundleV1[], view: AnnotationPanelView): string {
  if (records.length === 0) return '';
  return `
    <div class="annotation-section">
      <h3>${title} <span>${records.length}</span></h3>
      <div class="annotation-list">
        ${records.map((record) => recordMarkup(record, view)).join('')}
      </div>
    </div>
  `;
}

function recordMarkup(record: FarmAnnotationBundleV1, view: AnnotationPanelView): string {
  const id = escapeHtml(record.id);
  const selected = view.selectedId === record.id ? ' selected' : '';
  const confirmingDelete = view.pendingDeleteId === record.id;
  if (view.editingId === record.id) {
    return `
      <article class="annotation-record${selected}" data-annotation-record="${record.index}" data-record-id="${id}">
        <label for="annotation-edit-${record.index}">Edit note #${record.index}</label>
        <textarea id="annotation-edit-${record.index}" data-annotation-edit aria-label="Edit note ${record.index}" maxlength="${FARM_ANNOTATION_MESSAGE_LIMIT}" rows="4">${escapeHtml(view.editingMessage)}</textarea>
        <div class="annotation-editor-actions">
          <button data-command="cancel-edit-annotation">Cancel</button>
          <button data-command="save-edit-annotation" data-annotation-id="${id}" class="primary">Save</button>
        </div>
      </article>
    `;
  }
  return `
    <article class="annotation-record${selected}" data-annotation-record="${record.index}" data-record-id="${id}">
      <button class="annotation-record-focus" data-command="view-annotation" data-annotation-id="${id}">
        <span class="annotation-index">#${record.index}</span>
        <span class="annotation-record-meta">
          <strong>${escapeHtml(record.target.label)}</strong>
          <small>Captured tick ${escapeHtml(String(record.capture.farmState.tick))}</small>
        </span>
      </button>
      <p class="annotation-message">${escapeHtml(record.message)}</p>
      <div class="annotation-record-actions">
        <button data-command="view-annotation" data-annotation-id="${id}">View</button>
        <button data-command="edit-annotation" data-annotation-id="${id}">Edit</button>
        <button data-command="copy-annotation" data-annotation-id="${id}">Copy</button>
        <button data-command="export-annotation" data-annotation-id="${id}">Export</button>
        <button data-command="delete-annotation" data-annotation-id="${id}" class="danger" aria-label="${confirmingDelete ? `Confirm delete note ${record.index}` : `Delete note ${record.index}`}">${confirmingDelete ? 'Confirm delete' : 'Delete'}</button>
      </div>
    </article>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}
