import type { FarmAnnotationTarget } from '../../annotations/farmAnnotations';
import { farmhandName } from '../../game/content/farmhands';
import type { FarmState, FarmWorker } from '../../game/simulation/farmGame';
import {
  buildFarmBotanyLayout,
  decorativePlantVisualBounds,
  farmTreeVisualBounds,
} from './farmBotany';
import { SOUTHERN_MEADOW_VIGNETTES } from './farmEnvironment';
import { buildFarmHedgerowPlacements, farmHedgerowVisualBounds } from './farmHedgerow';
import { buildFarmSceneryLayout, type PixelBounds } from './farmSceneryLayout';
import { buildCreekLilyLayout, creekCenterX } from './farmWaterside';
import { duckWorldPosition } from './farmWildlifeArt';

interface PixelPoint {
  x: number;
  y: number;
}

export function resolveFarmAnnotationTarget(
  state: FarmState,
  worldPx: PixelPoint,
  tileSize: number,
): FarmAnnotationTarget {
  const cell = worldCell(state, worldPx, tileSize);

  for (const duck of state.wildlife?.ducks ?? []) {
    const position = duckWorldPosition(state, tileSize, duck);
    if (distanceSquared(position, worldPx) <= 18 * 18) {
      return target('duck', `duck:${duck.id}`, duck.name, `duck:${duck.id}`, cell, worldPx, duck);
    }
  }

  for (const worker of state.workers) {
    const position = workerWorldPosition(worker, tileSize);
    if (distanceSquared(position, worldPx) <= 18 * 18) {
      return target('worker', `worker:${worker.id}`, farmhandName(worker.id), `worker:${worker.id}`, cell, worldPx, worker);
    }
  }

  const lilies = buildCreekLilyLayout(state, tileSize);
  for (const [index, lily] of lilies.entries()) {
    if (Math.abs(worldPx.x - lily.x) <= lily.size && Math.abs(worldPx.y - lily.y) <= lily.size) {
      return target('lily-pad', `creek-lily:${index}`, 'Creek Lily Pad', null, cell, worldPx, lily);
    }
  }

  const botany = buildFarmBotanyLayout(state.width, state.height, tileSize);
  for (const [index, tree] of botany.trees.entries()) {
    if (inside(worldPx, farmTreeVisualBounds(tree))) {
      return target('tree', `tree:${index}`, `${capitalize(tree.species)} Tree`, null, cell, worldPx, tree);
    }
  }

  for (const hedge of buildFarmHedgerowPlacements(state.width, state.height, tileSize)) {
    const bounds = farmHedgerowVisualBounds(hedge);
    if (inside(worldPx, bounds)) {
      return target('hedgerow', `hedgerow:${hedge.id}`, hedge.label, null, cell, worldPx, { ...hedge, bounds });
    }
  }

  const scenery = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const bridgeX = creekCenterX(scenery.creek.centerX, scenery.creek.bridgeY) - 11;
  const bridgeBounds = {
    left: bridgeX,
    right: bridgeX + scenery.creek.width + 25,
    top: scenery.creek.bridgeY - 4,
    bottom: scenery.creek.bridgeY + 16,
  };
  if (inside(worldPx, bridgeBounds)) {
    return target('bridge', 'creek-bridge', 'Creek Footbridge', null, cell, worldPx, bridgeBounds);
  }
  const cottageBounds = {
    left: scenery.cottage.x,
    top: scenery.cottage.y,
    right: scenery.cottage.x + scenery.cottage.width,
    bottom: scenery.cottage.y + scenery.cottage.height,
  };
  if (inside(worldPx, cottageBounds)) {
    return target('cottage', 'farm-cottage', 'Farm Cottage', null, cell, worldPx, cottageBounds);
  }

  for (const [index, plant] of botany.plants.entries()) {
    if (inside(worldPx, decorativePlantVisualBounds(plant))) {
      return target('plant', `plant:${index}`, `${capitalize(plant.kind)} Plant`, null, cell, worldPx, plant);
    }
  }

  if (inside(worldPx, scenery.garden)) {
    return target('garden', 'cottage-garden', 'Cottage Garden', null, cell, worldPx, scenery.garden);
  }
  const creekX = creekCenterX(scenery.creek.centerX, worldPx.y);
  if (worldPx.x >= creekX && worldPx.x <= creekX + scenery.creek.width) {
    return target('creek', 'creek', 'Creek', null, cell, worldPx, { centerX: creekX, width: scenery.creek.width });
  }

  const x = Math.floor(worldPx.x / tileSize);
  const y = Math.floor(worldPx.y / tileSize);
  const tile = cell ? state.tiles[`${x},${y}`] ?? null : null;
  if (cell && !tile) {
    // Authored wild-cell stories deserve their names; they yield to purchased
    // land, so the name applies only while the cell is unowned.
    const vignette = SOUTHERN_MEADOW_VIGNETTES.find((entry) => entry.cell.x === x && entry.cell.y === y);
    if (vignette) {
      return target('vignette', `vignette:${vignette.id}`, vignette.label, null, cell, worldPx, vignette);
    }
  }
  const kind = tile?.kind ?? (cell ? 'wild-land' : 'meadow');
  const semanticId = cell ? `tile:${x},${y}` : `world:${Math.round(worldPx.x)},${Math.round(worldPx.y)}`;
  return target(kind, semanticId, tileLabel(tile?.kind, cell, x, y), null, cell, worldPx, tile);
}

function target(
  kind: string,
  semanticId: string,
  label: string,
  entityId: string | null,
  cell: { x: number; y: number } | null,
  worldPx: PixelPoint,
  snapshot: unknown,
): FarmAnnotationTarget {
  return {
    kind,
    semanticId,
    label,
    entityId,
    cell: cell ? { ...cell } : null,
    worldPx: { ...worldPx },
    snapshot: structuredClone(snapshot),
  };
}

function worldCell(state: FarmState, point: PixelPoint, tileSize: number): { x: number; y: number } | null {
  const x = Math.floor(point.x / tileSize);
  const y = Math.floor(point.y / tileSize);
  return x >= 0 && y >= 0 && x < state.width && y < state.height ? { x, y } : null;
}

function workerWorldPosition(worker: FarmWorker, tileSize: number): PixelPoint {
  const offsets = [{ x: -9, y: -10 }, { x: 9, y: 10 }, { x: 9, y: -10 }, { x: -9, y: 10 }];
  const offset = offsets[(worker.id - 1) % offsets.length] ?? { x: 0, y: 0 };
  const next = worker.task.path[0];
  const progress = next ? Math.max(0, Math.min(1, worker.task.progress / 4)) : 0;
  const tileX = next ? worker.x + (next.x - worker.x) * progress : worker.x;
  const tileY = next ? worker.y + (next.y - worker.y) * progress : worker.y;
  return { x: tileX * tileSize + tileSize / 2 + offset.x, y: tileY * tileSize + tileSize / 2 + offset.y };
}

function inside(point: PixelPoint, bounds: PixelBounds): boolean {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

function distanceSquared(left: PixelPoint, right: PixelPoint): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function tileLabel(kind: string | undefined, cell: PixelPoint | null, x: number, y: number): string {
  if (!cell) return `Meadow / ${Math.round(x)},${Math.round(y)}`;
  if (kind === 'well') return `Well / ${x},${y}`;
  if (kind === 'storage') return `Storage / ${x},${y}`;
  if (kind === 'plot') return `Crop Plot / ${x},${y}`;
  if (kind === 'empty') return `Empty Land / ${x},${y}`;
  return `Wild Land / ${x},${y}`;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
