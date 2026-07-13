import { CROPS } from '../game/content/crops';
import type { FarmState, FarmTile, FarmWorker } from '../game/simulation/farmGame';

export function inspectMarkup(state: FarmState, selectedCell: { x: number; y: number } | null): string {
  if (!selectedCell) {
    return `
      <h2>Inspect</h2>
      <p>Select a tile or worker.</p>
      ${inspectDetails([
        { label: 'Use', value: 'Click the farm while Inspect is active' },
        { label: 'Shows', value: 'Tile role, worker task, crop state, and logistics notes' },
      ])}
    `;
  }
  const tile = state.tiles[`${selectedCell.x},${selectedCell.y}`];
  const worker = state.workers.find((item) => item.x === selectedCell?.x && item.y === selectedCell.y);
  if (worker) {
    return `
      <h2>Worker ${worker.id}</h2>
      <p class="small">Position: ${worker.x}, ${worker.y}</p>
      ${inspectDetails([
        { label: 'Task', value: workerTaskLabel(worker) },
        { label: 'Target', value: worker.task.target ? `${worker.task.target.x}, ${worker.task.target.y}` : 'None' },
        { label: 'Cargo', value: workerCargoLabel(worker) },
        { label: 'Route', value: worker.task.path.length > 0 ? `${worker.task.path.length} step(s) queued` : 'Standing by' },
      ])}
    `;
  }
  if (!tile) {
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

function workerTaskLabel(worker: FarmWorker): string {
  const task = worker.task;
  const crop = task.cropId ? ` ${CROPS[task.cropId].label}` : '';
  const phase = task.phase ? ` (${task.phase.replaceAll('-', ' ')})` : '';
  return `${capitalize(task.kind)}${crop}${phase}`;
}

function workerCargoLabel(worker: FarmWorker): string {
  if (!worker.cargo) return 'None';
  if (worker.cargo.kind === 'water') return 'Water';
  if (worker.cargo.cropId) return `${capitalize(worker.cargo.kind)} ${CROPS[worker.cargo.cropId].label}`;
  return capitalize(worker.cargo.kind);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
