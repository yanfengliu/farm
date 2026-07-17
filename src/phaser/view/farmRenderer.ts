import Phaser from 'phaser';
import { CROPS, type CropId } from '../../game/content/crops';
import type { FarmState, FarmTile, FarmWorker } from '../../game/simulation/farmGame';
import { drawFarmAmbience } from './farmAmbience';
import { FarmWorkEffects } from './farmWorkEffects';
import { drawCarrotCrop, drawCloverPatch, drawPumpkinCrop, drawTomatoCrop, drawWheatCrop } from './farmCultivatedPlantArt';
import { drawFarmEnvironment, drawFarmOverstory, drawFarmScenery, drawWildMeadowCell } from './farmEnvironment';
import { exponentialApproach } from './farmMotionMath';
import { coordinateHash, drawFlowerClump, drawGrassTuft } from './farmPixelPrimitives';
import { drawFarmhand } from './farmWorkerArt';

export const TILE_SIZE = 32;

type Cell = { x: number; y: number };
type WorkerVisual = { x: number; y: number };

export class FarmRenderer {
  readonly #meadow: Phaser.GameObjects.Graphics;
  readonly #water: Phaser.GameObjects.Graphics;
  readonly #ground: Phaser.GameObjects.Graphics;
  readonly #scenery: Phaser.GameObjects.Graphics;
  readonly #objects: Phaser.GameObjects.Graphics;
  readonly #actors: Phaser.GameObjects.Graphics;
  readonly #overstory: Phaser.GameObjects.Graphics;
  readonly #effects: Phaser.GameObjects.Graphics;
  readonly #workEffects = new FarmWorkEffects();
  readonly #interaction: Phaser.GameObjects.Graphics;
  readonly #workerVisuals = new Map<number, WorkerVisual>();
  #meadowSignature = '';
  #groundSignature = '';

  constructor(scene: Phaser.Scene) {
    this.#meadow = scene.add.graphics().setDepth(0);
    this.#water = scene.add.graphics().setDepth(5);
    this.#ground = scene.add.graphics().setDepth(10);
    this.#scenery = scene.add.graphics().setDepth(15);
    this.#objects = scene.add.graphics().setDepth(20);
    this.#actors = scene.add.graphics().setDepth(30);
    this.#overstory = scene.add.graphics().setDepth(35);
    this.#effects = scene.add.graphics().setDepth(40);
    this.#interaction = scene.add.graphics().setDepth(50);
  }

  draw(
    state: FarmState,
    selectedCell: Cell | null,
    selectedTool: string,
    presentationTimeMs = 0,
    deltaMs = 1000 / 60,
  ): void {
    const presentationTick = Math.floor(presentationTimeMs / 100);
    const meadowSignature = `${state.width}x${state.height}:tier${state.tier.level}`;
    if (meadowSignature !== this.#meadowSignature) {
      this.#meadow.clear();
      this.#scenery.clear();
      this.#overstory.clear();
      drawFarmEnvironment(this.#meadow, state, TILE_SIZE);
      drawFarmScenery(this.#scenery, state, TILE_SIZE);
      drawFarmOverstory(this.#overstory, state, TILE_SIZE);
      this.#meadowSignature = meadowSignature;
    }

    const groundSignature = farmGroundSignature(state);
    if (groundSignature !== this.#groundSignature) {
      this.#ground.clear();
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 0; x < state.width; x += 1) {
          const tile = state.tiles[`${x},${y}`];
          if (tile) this.drawOwnedGround(tile);
          else drawWildMeadowCell(this.#ground, x, y, TILE_SIZE);
        }
      }
      this.#groundSignature = groundSignature;
    }

    for (const layer of [this.#water, this.#objects, this.#actors, this.#effects, this.#interaction]) layer.clear();
    this.drawFarmBoundary(state);

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const tile = state.tiles[`${x},${y}`];
        if (tile) this.drawFarmObject(tile, presentationTick);
      }
    }

    const activeIds = new Set<number>();
    const workerDraws = state.workers.map((worker) => {
      activeIds.add(worker.id);
      const position = this.workerVisualPosition(worker, deltaMs);
      return { worker, position };
    });
    for (const id of this.#workerVisuals.keys()) if (!activeIds.has(id)) this.#workerVisuals.delete(id);
    workerDraws.sort((left, right) => left.position.y - right.position.y || left.worker.id - right.worker.id);
    for (const { worker, position } of workerDraws) {
      drawFarmhand(this.#actors, state, worker, position.x, position.y);
    }

    drawFarmAmbience(this.#water, this.#actors, this.#effects, state, TILE_SIZE, presentationTick);
    // Work celebrations spawn from simulation-stat diffs and animate on
    // presentation time; they never touch simulation state, saves, or replay.
    this.#workEffects.observe(state, presentationTimeMs);
    this.#workEffects.draw(this.#effects, TILE_SIZE, presentationTimeMs);
    if (selectedCell) this.drawSelection(state, selectedCell, selectedTool);
  }

  private drawOwnedGround(tile: FarmTile): void {
    const g = this.#ground;
    const px = tile.x * TILE_SIZE;
    const py = tile.y * TILE_SIZE;
    const grass = tileVariant(tile.x, tile.y, [0x6f9d52, 0x76a65a, 0x67944d]);
    g.fillStyle(grass, 1);
    g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x9abe72, 0.45);
    g.fillRect(px, py, TILE_SIZE, 2);
    g.fillStyle(0x476f3c, 0.5);
    g.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
    if ((tile.x * 3 + tile.y) % 4 === 0) drawGrassTuft(g, px + 7, py + 19, 0x91bb66);
    if ((tile.x + tile.y * 5) % 7 === 0 && tile.kind === 'empty') drawFlowerClump(g, px + 23, py + 8, tile.x + tile.y);
    if (tile.kind === 'empty' && coordinateHash(tile.x + 5, tile.y + 17) % 5 === 0) {
      drawCloverPatch(g, px + 12 + (tile.y % 7), py + 25, tile.x + tile.y);
    }
    if (tile.kind === 'plot') this.drawSoilBed(tile);
    if (tile.kind === 'well' || tile.kind === 'storage') {
      g.fillStyle(0x42633a, 0.36);
      g.fillRect(px + 4, py + 23, 25, 6);
    }
  }

  private drawSoilBed(tile: FarmTile): void {
    const g = this.#ground;
    const px = tile.x * TILE_SIZE;
    const py = tile.y * TILE_SIZE;
    const moist = Boolean(tile.plot && tile.plot.water > 0);
    g.fillStyle(0x5b351f, 1);
    g.fillRect(px + 3, py + 3, 26, 26);
    g.fillStyle(moist ? 0x71452a : 0x855735, 1);
    g.fillRect(px + 5, py + 5, 22, 22);
    g.fillStyle(moist ? 0x875538 : 0xa06e45, 0.9);
    for (const row of [8, 14, 20]) g.fillRect(px + 7, py + row, 18, 2);
    g.fillStyle(0x3f271a, 0.62);
    for (const row of [11, 17, 23]) g.fillRect(px + 8, py + row, 16, 1);
    if (moist) {
      g.fillStyle(0xb27c55, 0.55);
      g.fillRect(px + 9, py + 8, 6, 1);
      g.fillRect(px + 18, py + 15, 5, 1);
    } else {
      g.fillStyle(0x4b2d20, 0.7);
      g.fillRect(px + 13, py + 11, 1, 4);
      g.fillRect(px + 14, py + 14, 3, 1);
    }
    g.fillStyle(0x704326, 1);
    g.fillRect(px + 2, py + 2, 28, 3);
    g.fillRect(px + 2, py + 27, 28, 3);
    g.fillRect(px + 2, py + 4, 3, 23);
    g.fillRect(px + 27, py + 4, 3, 23);
    g.fillStyle(0xc08447, 0.9);
    g.fillRect(px + 4, py + 3, 23, 1);
  }

  private drawFarmBoundary(state: FarmState): void {
    const g = this.#objects;
    const owned = (x: number, y: number) => Boolean(state.tiles[`${x},${y}`]);
    for (const tile of Object.values(state.tiles)) {
      const px = tile.x * TILE_SIZE;
      const py = tile.y * TILE_SIZE;
      if (!owned(tile.x, tile.y - 1)) this.drawFenceHorizontal(g, px, py + 1);
      if (!owned(tile.x, tile.y + 1)) this.drawFenceHorizontal(g, px, py + TILE_SIZE - 2);
      if (!owned(tile.x - 1, tile.y)) this.drawFenceVertical(g, px + 1, py);
      if (!owned(tile.x + 1, tile.y)) this.drawFenceVertical(g, px + TILE_SIZE - 2, py);
    }
  }

  private drawFenceHorizontal(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
    g.fillStyle(0x684128, 1);
    g.fillRect(px + 1, py - 2, 4, 7);
    g.fillRect(px + 27, py - 2, 4, 7);
    g.fillRect(px + 3, py, 26, 3);
    g.fillStyle(0xc28b50, 1);
    g.fillRect(px + 3, py, 24, 1);
    g.fillRect(px + 2, py - 3, 2, 1);
  }

  private drawFenceVertical(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
    g.fillStyle(0x684128, 1);
    g.fillRect(px - 2, py + 1, 7, 4);
    g.fillRect(px - 2, py + 27, 7, 4);
    g.fillRect(px, py + 3, 3, 26);
    g.fillStyle(0xc28b50, 1);
    g.fillRect(px, py + 3, 1, 24);
  }

  private drawFarmObject(tile: FarmTile, tick: number): void {
    const px = tile.x * TILE_SIZE;
    const py = tile.y * TILE_SIZE;
    if (tile.kind === 'well') this.drawWell(px, py, tick);
    else if (tile.kind === 'storage') this.drawStorage(px, py);
    else if (tile.kind === 'plot' && tile.plot) this.drawCrop(px, py, tile.plot.cropId, tile.plot.growth, tile.plot.water);
  }

  private drawWell(px: number, py: number, tick: number): void {
    const g = this.#objects;
    g.fillStyle(0x304635, 0.38);
    g.fillRect(px + 4, py + 24, 25, 5);
    g.fillStyle(0x614027, 1);
    g.fillRect(px + 5, py + 2, 4, 15);
    g.fillRect(px + 23, py + 2, 4, 15);
    g.fillStyle(0xb7743b, 1);
    g.fillRect(px + 5, py, 22, 4);
    g.fillStyle(0xe0a15a, 1);
    g.fillRect(px + 8, py, 16, 1);
    g.fillStyle(0x52616a, 1);
    g.fillRect(px + 5, py + 14, 22, 12);
    g.fillStyle(0x89969b, 1);
    g.fillRect(px + 7, py + 12, 18, 4);
    g.fillRect(px + 7, py + 17, 4, 8);
    g.fillRect(px + 21, py + 17, 4, 8);
    g.fillStyle(0x234d67, 1);
    g.fillRect(px + 11, py + 16, 10, 8);
    g.fillStyle(0x67bdd5, 1);
    g.fillRect(px + 12 + (tick % 3), py + 17, 4, 2);
    g.fillStyle(0xc5d3d2, 1);
    g.fillRect(px + 9, py + 13, 7, 1);
    g.fillStyle(0x3f2b1e, 1);
    g.fillRect(px + 15, py + 4, 2, 10);
    g.fillStyle(0xb38b5e, 1);
    g.fillRect(px + 13, py + 12, 6, 3);
  }

  private drawStorage(px: number, py: number): void {
    const g = this.#objects;
    g.fillStyle(0x32462f, 0.4);
    g.fillRect(px + 3, py + 24, 27, 5);
    g.fillStyle(0x57311f, 1);
    g.fillRect(px + 3, py + 7, 26, 21);
    g.fillStyle(0xb66f37, 1);
    g.fillRect(px + 5, py + 5, 22, 20);
    g.fillStyle(0xe1a45d, 1);
    g.fillRect(px + 7, py + 7, 18, 3);
    g.fillStyle(0x754025, 1);
    g.fillRect(px + 5, py + 12, 22, 3);
    g.fillRect(px + 5, py + 21, 22, 3);
    g.fillRect(px + 14, py + 5, 3, 20);
    g.fillStyle(0xf0c57c, 0.8);
    g.fillRect(px + 8, py + 8, 4, 1);
    g.fillRect(px + 19, py + 17, 5, 1);
    g.fillStyle(0x8d7147, 1);
    g.fillRect(px + 2, py + 19, 5, 8);
    g.fillStyle(0xd8c281, 1);
    g.fillRect(px + 3, py + 20, 3, 2);
  }

  private drawCrop(px: number, py: number, cropId: CropId, growth: number, water: number): void {
    const definition = CROPS[cropId];
    const ratio = Phaser.Math.Clamp(growth / definition.growTicks, 0, 1);
    const stage = Math.min(3, Math.floor(ratio * 4));
    const dry = water <= 0;
    if (cropId === 'carrot') drawCarrotCrop(this.#objects, px, py, stage, dry);
    else if (cropId === 'wheat') drawWheatCrop(this.#objects, px, py, stage, dry);
    else if (cropId === 'tomato') drawTomatoCrop(this.#objects, px, py, stage, dry);
    else drawPumpkinCrop(this.#objects, px, py, stage, dry);
  }

  private drawSelection(state: FarmState, cell: Cell, tool: string): void {
    const g = this.#interaction;
    const px = cell.x * TILE_SIZE;
    const py = cell.y * TILE_SIZE;
    const owned = Boolean(state.tiles[`${cell.x},${cell.y}`]);
    const color = tool === 'bulldoze' ? 0xf07158 : owned ? 0xffe29a : 0xa9d7a0;
    g.fillStyle(color, 0.12);
    g.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    g.fillStyle(color, 1);
    for (const [x, y, w, h] of [[2, 2, 8, 2], [2, 2, 2, 8], [22, 2, 8, 2], [28, 2, 2, 8], [2, 28, 8, 2], [2, 22, 2, 8], [22, 28, 8, 2], [28, 22, 2, 8]] as const) {
      g.fillRect(px + x, py + y, w, h);
    }
  }

  private workerVisualPosition(worker: FarmWorker, deltaMs: number): WorkerVisual {
    const target = workerTargetPosition(worker);
    const current = this.#workerVisuals.get(worker.id);
    if (!current || Phaser.Math.Distance.Between(current.x, current.y, target.x, target.y) > TILE_SIZE * 1.5) {
      const next = { ...target };
      this.#workerVisuals.set(worker.id, next);
      return next;
    }
    const smoothing = exponentialApproach(deltaMs, 42);
    current.x = Phaser.Math.Linear(current.x, target.x, smoothing);
    current.y = Phaser.Math.Linear(current.y, target.y, smoothing);
    return current;
  }

}

function workerTargetPosition(worker: FarmWorker): WorkerVisual {
  const offset = workerOffset(worker.id);
  const next = worker.task.path[0];
  const progress = next ? Phaser.Math.Clamp(worker.task.progress / 4, 0, 1) : 0;
  const tileX = next ? Phaser.Math.Linear(worker.x, next.x, progress) : worker.x;
  const tileY = next ? Phaser.Math.Linear(worker.y, next.y, progress) : worker.y;
  return { x: tileX * TILE_SIZE + TILE_SIZE / 2 + offset.x, y: tileY * TILE_SIZE + TILE_SIZE / 2 + offset.y };
}

function workerOffset(id: number): Cell {
  const offsets = [{ x: -9, y: -10 }, { x: 9, y: 10 }, { x: 9, y: -10 }, { x: -9, y: 10 }];
  return offsets[(id - 1) % offsets.length];
}

function tileVariant(x: number, y: number, colors: number[]): number {
  return colors[Math.abs((x * 17 + y * 31) % colors.length)] ?? colors[0];
}

function farmGroundSignature(state: FarmState): string {
  const cells = [`${state.width}x${state.height}`];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tile = state.tiles[`${x},${y}`];
      cells.push(tile ? `${tile.kind}:${tile.plot?.water && tile.plot.water > 0 ? 'wet' : 'dry'}` : 'wild');
    }
  }
  return cells.join('|');
}
