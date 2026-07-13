import Phaser from 'phaser';
import { CROPS, type CropId } from '../../game/content/crops';
import type { FarmState, FarmTile, FarmWorker } from '../../game/simulation/farmGame';
import { drawCreekShimmer, drawFarmEnvironment, drawFlowerClump, drawGrassTuft, drawWildMeadowCell } from './farmEnvironment';

export const TILE_SIZE = 32;

type Cell = { x: number; y: number };
type WorkerVisual = { x: number; y: number };

const FARMHAND_PALETTES = [
  { shirt: 0x4f86a6, shirtLight: 0x78acc1, trousers: 0x31566f, hat: 0xc58a43, band: 0x7d4329 },
  { shirt: 0xb65d52, shirtLight: 0xdc8671, trousers: 0x633f4a, hat: 0xd8a34e, band: 0x754137 },
  { shirt: 0x668c55, shirtLight: 0x8fb76f, trousers: 0x3f6245, hat: 0xc99452, band: 0x6b4930 },
  { shirt: 0x8b68a0, shirtLight: 0xb18dc1, trousers: 0x584568, hat: 0xd1a45a, band: 0x71465a },
];

export class FarmRenderer {
  readonly #meadow: Phaser.GameObjects.Graphics;
  readonly #ground: Phaser.GameObjects.Graphics;
  readonly #objects: Phaser.GameObjects.Graphics;
  readonly #actors: Phaser.GameObjects.Graphics;
  readonly #effects: Phaser.GameObjects.Graphics;
  readonly #workerVisuals = new Map<number, WorkerVisual>();
  #meadowSignature = '';
  #groundSignature = '';

  constructor(scene: Phaser.Scene) {
    this.#meadow = scene.add.graphics().setDepth(0);
    this.#ground = scene.add.graphics().setDepth(10);
    this.#objects = scene.add.graphics().setDepth(20);
    this.#actors = scene.add.graphics().setDepth(30);
    this.#effects = scene.add.graphics().setDepth(40);
  }

  draw(state: FarmState, selectedCell: Cell | null, selectedTool: string, presentationTimeMs = 0): void {
    const presentationTick = Math.floor(presentationTimeMs / 100);
    const meadowSignature = `${state.width}x${state.height}`;
    if (meadowSignature !== this.#meadowSignature) {
      this.#meadow.clear();
      drawFarmEnvironment(this.#meadow, state, TILE_SIZE);
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

    for (const layer of [this.#objects, this.#actors, this.#effects]) layer.clear();
    this.drawFarmBoundary(state);

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const tile = state.tiles[`${x},${y}`];
        if (tile) this.drawFarmObject(tile, presentationTick);
      }
    }

    const activeIds = new Set<number>();
    for (const worker of state.workers) {
      activeIds.add(worker.id);
      const position = this.workerVisualPosition(worker);
      this.drawWorker(state, worker, position.x, position.y);
    }
    for (const id of this.#workerVisuals.keys()) if (!activeIds.has(id)) this.#workerVisuals.delete(id);

    this.drawAmbientEffects(state, presentationTick);
    drawCreekShimmer(this.#effects, presentationTick);
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
    if (cropId === 'carrot') this.drawCarrots(px, py, stage, dry);
    else if (cropId === 'wheat') this.drawWheat(px, py, stage, dry);
    else if (cropId === 'tomato') this.drawTomatoes(px, py, stage, dry);
    else this.drawPumpkins(px, py, stage, dry);
  }

  private drawCarrots(px: number, py: number, stage: number, dry: boolean): void {
    const g = this.#objects;
    for (const x of [10, 16, 22]) {
      const leafY = py + 21 - stage * 2;
      g.fillStyle(dry ? 0x87904e : 0x4f9849, 1);
      g.fillRect(px + x - 1, leafY, 2, 5 + stage);
      if (stage > 0) {
        g.fillRect(px + x - 4, leafY + 2, 4, 2);
        g.fillRect(px + x + 1, leafY + 1, 4, 2);
      }
      if (stage >= 2) {
        g.fillStyle(stage === 3 ? 0xe8752d : 0xb95d2b, 1);
        g.fillRect(px + x - 2, py + 21, 4, stage === 3 ? 7 : 4);
        g.fillStyle(0xffb45c, 1);
        g.fillRect(px + x - 1, py + 22, 2, 1);
      }
    }
  }

  private drawWheat(px: number, py: number, stage: number, dry: boolean): void {
    const g = this.#objects;
    const stem = dry ? 0x8b7741 : 0x7d8e3c;
    const grain = stage === 3 ? 0xe5b94f : 0xaab153;
    for (const x of [9, 13, 17, 21, 24]) {
      const height = 5 + stage * 3 + ((x + stage) % 2);
      const top = py + 26 - height;
      g.fillStyle(stem, 1);
      g.fillRect(px + x, top, 1, height);
      if (stage > 0) {
        g.fillStyle(grain, 1);
        g.fillRect(px + x - 2, top, 5, 2 + (stage === 3 ? 2 : 0));
        g.fillStyle(0xffdf79, 0.8);
        if (stage === 3) g.fillRect(px + x - 1, top, 1, 2);
      }
    }
  }

  private drawTomatoes(px: number, py: number, stage: number, dry: boolean): void {
    const g = this.#objects;
    if (stage > 0) {
      g.fillStyle(0x6a4930, 1);
      g.fillRect(px + 9, py + 9, 2, 17);
      g.fillRect(px + 21, py + 9, 2, 17);
      g.fillRect(px + 9, py + 10, 14, 2);
    }
    g.fillStyle(dry ? 0x7d884b : 0x4c9449, 1);
    g.fillRect(px + 12, py + 20 - stage * 2, 9, 4 + stage);
    if (stage >= 2) {
      const fruit = stage === 3 ? 0xd94b3f : 0xa85839;
      g.fillStyle(fruit, 1);
      g.fillRect(px + 11, py + 18, stage === 3 ? 6 : 4, stage === 3 ? 6 : 4);
      g.fillRect(px + 19, py + 15, stage === 3 ? 6 : 4, stage === 3 ? 6 : 4);
      g.fillStyle(0xff7b64, 1);
      g.fillRect(px + 12, py + 19, 2, 1);
      if (stage === 3) g.fillRect(px + 20, py + 16, 2, 1);
    }
  }

  private drawPumpkins(px: number, py: number, stage: number, dry: boolean): void {
    const g = this.#objects;
    const vine = dry ? 0x79824a : 0x4b8c45;
    g.fillStyle(vine, 1);
    g.fillRect(px + 7, py + 20, 18, 2);
    g.fillRect(px + 10, py + 16, 2, 6);
    g.fillRect(px + 21, py + 19, 2, 5);
    if (stage > 0) {
      g.fillRect(px + 7, py + 17, 5, 3);
      g.fillRect(px + 20, py + 20, 6, 3);
    }
    if (stage < 2) return;
    for (const [x, y, delayed] of [[9, 18, false], [18, 14, true]] as const) {
      if (delayed && stage < 3) continue;
      const width = stage === 3 ? 9 : 6;
      const height = stage === 3 ? 7 : 5;
      g.fillStyle(0xa94424, 1);
      g.fillRect(px + x - 1, py + y + 1, width + 2, height - 1);
      g.fillStyle(stage === 3 ? 0xe8752d : 0xc45d28, 1);
      g.fillRect(px + x, py + y, width, height);
      g.fillStyle(0xf5a447, 1);
      g.fillRect(px + x + 2, py + y + 1, 2, height - 2);
      g.fillStyle(0x8d3b25, 1);
      g.fillRect(px + x + width - 2, py + y + 1, 1, height - 1);
      g.fillStyle(0x4f7137, 1);
      g.fillRect(px + x + Math.floor(width / 2), py + y - 2, 2, 3);
    }
  }

  private drawWorker(state: FarmState, worker: FarmWorker, px: number, py: number): void {
    const g = this.#actors;
    const palette = FARMHAND_PALETTES[(worker.id - 1) % FARMHAND_PALETTES.length];
    const walking = worker.task.path.length > 0;
    const step = walking && state.tick % 8 < 4 ? 1 : 0;
    const bob = walking && state.tick % 8 < 4 ? -1 : 0;
    const facing = (worker.task.path[0]?.x ?? worker.x) < worker.x ? -1 : 1;
    const y = py + bob;
    g.fillStyle(0x2e3d2c, 0.35);
    g.fillRect(px - 8, y + 9, 16, 3);
    g.fillStyle(palette.trousers, 1);
    g.fillRect(px - 4, y + 3, 3, 8 + step);
    g.fillRect(px + 1, y + 3 + step, 3, 8 - step);
    g.fillStyle(palette.shirt, 1);
    g.fillRect(px - 5, y - 3, 10, 9);
    g.fillStyle(palette.shirtLight, 1);
    g.fillRect(px - 4, y - 2, 3, 6);
    g.fillStyle(0xf2c99c, 1);
    g.fillRect(px - 4, y - 10, 8, 8);
    g.fillStyle(0x4a3024, 1);
    g.fillRect(px + facing, y - 7, 1, 1);
    g.fillRect(px + facing, y - 4, 2, 1);
    g.fillStyle(palette.hat, 1);
    g.fillRect(px - 7, y - 12, 14, 3);
    g.fillRect(px - 3, y - 15, 7, 4);
    g.fillStyle(palette.band, 1);
    g.fillRect(px - 3, y - 12, 7, 1);
    g.fillStyle(0x3a2921, 1);
    g.fillRect(px - 5, y + 10 + step, 4, 3);
    g.fillRect(px + 1, y + 11 - step, 4, 3);
    this.drawWorkerProp(g, worker, px, y, facing);
  }

  private drawWorkerProp(g: Phaser.GameObjects.Graphics, worker: FarmWorker, px: number, py: number, facing: number): void {
    const propX = px + facing * 7;
    g.fillStyle(0xf2c99c, 1);
    g.fillRect(propX - 1, py - 1, 3, 6);
    if (worker.cargo?.kind === 'water') {
      g.fillStyle(0x4d8ca6, 1);
      g.fillRect(propX - 2, py + 2, 7, 7);
      g.fillStyle(0x9bd3df, 1);
      g.fillRect(propX, py + 3, 3, 1);
    } else if (worker.cargo?.kind === 'seed') {
      g.fillStyle(0xa9703e, 1);
      g.fillRect(propX - 2, py + 1, 7, 8);
      g.fillStyle(0xeac66e, 1);
      g.fillRect(propX, py + 3, 1, 1);
    } else if (worker.cargo?.kind === 'crop') {
      g.fillStyle(0x8a542e, 1);
      g.fillRect(propX - 3, py, 8, 8);
      g.fillStyle(0xd99843, 1);
      g.fillRect(propX - 1, py - 1, 5, 3);
    } else if (worker.task.kind === 'harvesting') {
      g.fillStyle(0x8c6a3d, 1);
      g.fillRect(propX, py - 3, 2, 11);
      g.fillStyle(0xe0c77b, 1);
      g.fillRect(propX + facing, py - 4, 5, 2);
    }
  }

  private drawAmbientEffects(state: FarmState, presentationTick: number): void {
    const g = this.#effects;
    for (let index = 0; index < 8; index += 1) {
      const x = ((index * 67 + presentationTick) % (state.width * TILE_SIZE + 120)) - 60;
      const y = ((index * 43 + Math.floor(presentationTick / 2)) % (state.height * TILE_SIZE + 80)) - 40;
      g.fillStyle(index % 3 === 0 ? 0xffe28a : 0xd8efaa, index % 2 === 0 ? 0.65 : 0.4);
      g.fillRect(x, y, index % 3 === 0 ? 2 : 1, 1);
    }
  }

  private drawSelection(state: FarmState, cell: Cell, tool: string): void {
    const g = this.#effects;
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

  private workerVisualPosition(worker: FarmWorker): WorkerVisual {
    const target = workerTargetPosition(worker);
    const current = this.#workerVisuals.get(worker.id);
    if (!current || Phaser.Math.Distance.Between(current.x, current.y, target.x, target.y) > TILE_SIZE * 1.5) {
      const next = { ...target };
      this.#workerVisuals.set(worker.id, next);
      return next;
    }
    current.x = Phaser.Math.Linear(current.x, target.x, 0.35);
    current.y = Phaser.Math.Linear(current.y, target.y, 0.35);
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
  const offsets = [{ x: -4, y: -3 }, { x: 4, y: 3 }, { x: 4, y: -3 }, { x: -4, y: 3 }];
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
