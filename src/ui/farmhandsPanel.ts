import { farmhandName } from '../game/content/farmhands';
import type { FarmState } from '../game/simulation/farmGame';
import { workerCargoLabel, workerTaskLabel } from './inspectPanel';

/**
 * The dedicated farmhand roster: every hand with their portrait, name, and
 * live work, selectable by explicit click. This tab exists so the player never
 * has to chase a moving farmhand with the Inspect tool - and so a farmhand
 * crossing an inspected cell never has to hijack that panel.
 */
export function farmhandsMarkup(state: FarmState, selectedFarmhandId: number | null): string {
  return `
    <h2>Farmhands <span>${state.workers.length}</span></h2>
    <p class="small">Click a farmhand to highlight them on the farm.</p>
    ${state.workers.map((worker) => `
      <button
        class="farmhand-row ${selectedFarmhandId === worker.id ? 'selected' : ''}"
        data-select-farmhand="${worker.id}"
        aria-pressed="${selectedFarmhandId === worker.id}"
        aria-label="Highlight ${farmhandName(worker.id)}"
      >
        <canvas class="inspect-portrait farmhand-row-portrait" data-inspect-portrait="${worker.id}" aria-hidden="true"></canvas>
        <span class="farmhand-row-details">
          <strong>${farmhandName(worker.id)}</strong>
          <small>${workerTaskLabel(worker)}</small>
          <small>Carrying: ${workerCargoLabel(worker)} · At ${worker.x}, ${worker.y}</small>
        </span>
      </button>
    `).join('')}
    <p class="small">Farmhands choose their own tasks from the crop mix and farm needs.</p>
  `;
}
