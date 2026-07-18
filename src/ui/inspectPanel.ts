import { CROPS } from '../game/content/crops';
import { farmhandName } from '../game/content/farmhands';
import { SOUTHERN_MEADOW_VIGNETTES } from '../phaser/view/farmEnvironment';
import type { FarmState, FarmTile, FarmWorker } from '../game/simulation/farmGame';

export type InspectTarget = { x: number; y: number } | { kind: 'worker'; id: number };

export function inspectMarkup(state: FarmState, target: InspectTarget | null): string {
  // A farmhand shows here only through explicit selection - clicking the hand
  // or their roster row. A selected cell never morphs into a worker card just
  // because someone walked across it.
  const worker = target && 'kind' in target
    ? state.workers.find((item) => item.id === target.id)
    : undefined;
  const selectedCell = target && !('kind' in target) ? target : null;
  if (!selectedCell && !worker) {
    return `
      <h2>Inspect</h2>
      <p>Select a tile or worker.</p>
      ${inspectDetails([
        { label: 'Use', value: 'Click the farm while Inspect is active' },
        { label: 'Shows', value: 'Tile role, worker task, crop state, and logistics notes' },
      ])}
    `;
  }
  if (worker) {
    return `
      <div class="inspect-portrait-row">
        <canvas class="inspect-portrait" data-inspect-portrait="${worker.id}" aria-label="Pixel portrait of ${farmhandName(worker.id)}"></canvas>
        <div>
          <h2>${farmhandName(worker.id)}</h2>
          <p class="small">Farmhand ${worker.id} · Position: ${worker.x}, ${worker.y}</p>
        </div>
      </div>
      ${inspectDetails([
        { label: 'Task', value: workerTaskLabel(worker) },
        { label: 'Target', value: worker.task.target ? `${worker.task.target.x}, ${worker.task.target.y}` : 'None' },
        { label: 'Cargo', value: workerCargoLabel(worker) },
        { label: 'Route', value: worker.task.path.length > 0 ? `${worker.task.path.length} step(s) queued` : 'Standing by' },
      ])}
    `;
  }
  if (!selectedCell) {
    return `
      <h2>Inspect</h2>
      <p>Select a tile or worker.</p>
    `;
  }
  const tile = state.tiles[`${selectedCell.x},${selectedCell.y}`];
  if (!tile) {
    // Wild meadow stories introduce themselves; Inspect is the tool players
    // reach for when the world makes them curious. The cell stays buyable, so
    // purchase guidance remains, and buying the land clears the story.
    const vignette = SOUTHERN_MEADOW_VIGNETTES.find((entry) => (
      entry.cell.x === selectedCell.x && entry.cell.y === selectedCell.y
    ));
    if (vignette) {
      return `
        <h2>${vignette.label}</h2>
        <p class="small">Tile ${selectedCell.x}, ${selectedCell.y}</p>
        <p>${vignette.description}</p>
        ${inspectDetails([
          { label: 'Status', value: 'Wild meadow story' },
          { label: 'Land', value: 'Not owned yet · buying clears it' },
          { label: 'Action', value: 'Use Land on adjacent locked tiles' },
        ])}
      `;
    }
    return `
      <h2>Locked Land</h2>
      <p class="small">Tile ${selectedCell.x}, ${selectedCell.y}</p>
      ${inspectDetails([
        { label: 'Status', value: 'Not owned yet' },
        { label: 'Action', value: 'Use Land on adjacent locked tiles' },
      ])}
    `;
  }
  return `
    <h2>${tileInspectTitle(tile)}</h2>
    <p class="small">Tile ${selectedCell.x}, ${selectedCell.y}</p>
    ${inspectDetails(tileInspectRows(tile))}
  `;
}

function inspectDetails(rows: Array<{ label: string; value: string }>): string {
  return `
    <div class="inspect-details">
      ${rows.map((row) => `
        <div class="inspect-detail">
          <span>${row.label}</span>
          <strong>${row.value}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function tileInspectTitle(tile: FarmTile): string {
  if (tile.kind === 'empty') return 'Empty Land';
  if (tile.kind === 'plot') return tile.plot ? `${CROPS[tile.plot.cropId].label} Plot` : 'Empty Plot';
  if (tile.kind === 'well') return 'Well';
  return 'Storage Bin';
}

function tileInspectRows(tile: FarmTile): Array<{ label: string; value: string }> {
  if (tile.kind === 'well') {
    return [
      { label: 'Role', value: 'Water source' },
      { label: 'Worker use', value: 'Workers refill here' },
      { label: 'Movement', value: 'Blocks movement' },
    ];
  }
  if (tile.kind === 'storage') {
    return [
      { label: 'Role', value: 'Crop and seed drop-off' },
      { label: 'Capacity', value: 'Adds shared crop storage' },
      { label: 'Movement', value: 'Blocks movement' },
    ];
  }
  if (tile.kind === 'empty') {
    return [
      { label: 'Role', value: 'Buildable owned land' },
      { label: 'Worker use', value: 'Workers can cross this tile' },
      { label: 'Action', value: 'Paint plots or place farm buildings' },
    ];
  }
  if (!tile.plot) {
    return [
      { label: 'Role', value: 'Ready planting space' },
      { label: 'Worker use', value: 'Workers plant desired seeds here' },
      { label: 'Status', value: 'Waiting for seeds' },
    ];
  }

  const crop = CROPS[tile.plot.cropId];
  const growthPercent = Math.min(100, Math.round((tile.plot.growth / crop.growTicks) * 100));
  const status = tile.plot.growth >= crop.growTicks
    ? 'Ready to harvest'
    : tile.plot.water <= 0
      ? 'Needs water'
      : 'Growing';
  return [
    { label: 'Crop', value: crop.label },
    { label: 'Status', value: status },
    { label: 'Growth', value: `${growthPercent}%` },
    { label: 'Water', value: tile.plot.water > 0 ? `${tile.plot.water} tick(s) left` : 'Dry' },
  ];
}

export function workerTaskLabel(worker: FarmWorker): string {
  const task = worker.task;
  const crop = task.cropId ? ` ${CROPS[task.cropId].label}` : '';
  const phase = task.phase ? ` (${task.phase.replaceAll('-', ' ')})` : '';
  return `${capitalize(task.kind)}${crop}${phase}`;
}

export function workerCargoLabel(worker: FarmWorker): string {
  if (!worker.cargo) return 'None';
  if (worker.cargo.kind === 'water') return 'Water';
  if (worker.cargo.cropId) return `${capitalize(worker.cargo.kind)} ${CROPS[worker.cargo.cropId].label}`;
  return capitalize(worker.cargo.kind);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
