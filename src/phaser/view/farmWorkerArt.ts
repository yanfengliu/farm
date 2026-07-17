import type { CropId } from '../../game/content/crops';
import type { PixelPainter } from './pixelPainter';
import type { FarmState, FarmWorker } from '../../game/simulation/farmGame';

const FARMHAND_PALETTES = [
  { shirt: 0x4f86a6, light: 0x78acc1, trousers: 0x31566f, hat: 0xc58a43, band: 0x7d4329, scarf: 0xf0c36a },
  { shirt: 0xb65d52, light: 0xdc8671, trousers: 0x633f4a, hat: 0xd8a34e, band: 0x754137, scarf: 0x88b9c4 },
  { shirt: 0x668c55, light: 0x8fb76f, trousers: 0x3f6245, hat: 0xc99452, band: 0x6b4930, scarf: 0xe6a98a },
  { shirt: 0x8b68a0, light: 0xb18dc1, trousers: 0x584568, hat: 0xd1a45a, band: 0x71465a, scarf: 0xa7cf82 },
];

const CROP_COLORS: Record<CropId, number> = {
  carrot: 0xe8752d,
  wheat: 0xe5b94f,
  tomato: 0xd94b3f,
  pumpkin: 0xc85c29,
};

export function drawFarmhand(
  g: PixelPainter,
  state: Pick<FarmState, 'tick'>,
  worker: FarmWorker,
  px: number,
  py: number,
): void {
  const palette = FARMHAND_PALETTES[(worker.id - 1) % FARMHAND_PALETTES.length] ?? FARMHAND_PALETTES[0];
  const walking = worker.task.path.length > 0;
  const strideTick = state.tick;
  const step = walking && strideTick % 8 < 4 ? 1 : 0;
  const bob = walking && strideTick % 8 < 4 ? -1 : 0;
  const facing = (worker.task.path[0]?.x ?? worker.x) < worker.x ? -1 : 1;
  const y = py + bob;

  g.fillStyle(0x233c2d, 0.35);
  g.fillRect(px - 8, y + 10, 17, 3);
  g.fillStyle(palette.trousers, 1);
  g.fillRect(px - 4, y + 3, 3, 8 + step);
  g.fillRect(px + 1, y + 3 + step, 3, 8 - step);
  g.fillStyle(palette.shirt, 1);
  g.fillRect(px - 5, y - 4, 10, 10);
  g.fillStyle(palette.light, 1);
  g.fillRect(px - 4, y - 3, 3, 6);
  g.fillStyle(palette.scarf, 1);
  g.fillRect(px - 5, y - 4, 10, 2);
  g.fillRect(px - facing * 5, y - 2, 2, 4);
  g.fillStyle(0xf2c99c, 1);
  g.fillRect(px - 4, y - 11, 8, 8);
  g.fillStyle(0x4a3024, 1);
  g.fillRect(px + facing, y - 8, 1, 1);
  g.fillRect(px + facing, y - 5, 2, 1);
  g.fillStyle(palette.hat, 1);
  g.fillRect(px - 7, y - 13, 14, 3);
  g.fillRect(px - 3, y - 16, 7, 4);
  g.fillStyle(palette.band, 1);
  g.fillRect(px - 3, y - 13, 7, 1);
  g.fillStyle(0x3a2921, 1);
  g.fillRect(px - 5, y + 10 + step, 4, 3);
  g.fillRect(px + 1, y + 11 - step, 4, 3);
  drawTaskProp(g, worker, px, y, facing, state.tick);
}

function drawTaskProp(
  g: PixelPainter,
  worker: FarmWorker,
  px: number,
  py: number,
  facing: number,
  tick: number,
): void {
  const propX = px + facing * 7;
  g.fillStyle(0xf2c99c, 1);
  g.fillRect(propX - 1, py - 1, 3, 6);

  if (worker.task.kind === 'watering' || worker.cargo?.kind === 'water') {
    drawWateringCan(g, propX, py, facing, tick);
  } else if (worker.task.kind === 'planting' || worker.cargo?.kind === 'seed') {
    drawSeedPouch(g, propX, py, tick);
  } else if (worker.cargo?.kind === 'crop') {
    drawHarvestBasket(g, propX, py, worker.cargo?.cropId);
  } else if (worker.task.kind === 'harvesting') {
    drawSickle(g, propX, py, facing);
  } else if (worker.task.kind === 'hauling') {
    drawEmptyBasket(g, propX, py);
  }
}

function drawWateringCan(g: PixelPainter, x: number, y: number, facing: number, tick: number): void {
  g.fillStyle(0x3f7890, 1);
  g.fillRect(x - 3, y + 1, 8, 8);
  g.fillRect(x + facing * 5, y + 2, 4, 2);
  g.fillStyle(0x8fc8d2, 1);
  g.fillRect(x - 1, y + 2, 4, 1);
  if (tick % 3 === 0) {
    g.fillStyle(0x72c8df, 0.9);
    g.fillRect(x + facing * 10, y + 5, 1, 2);
    g.fillRect(x + facing * 12, y + 8, 1, 2);
  }
}

function drawSeedPouch(g: PixelPainter, x: number, y: number, tick: number): void {
  g.fillStyle(0x9b6238, 1);
  g.fillRect(x - 3, y + 1, 8, 9);
  g.fillStyle(0xeac66e, 1);
  g.fillRect(x - 1, y + 3, 2, 2);
  if (tick % 4 === 0) g.fillRect(x + 4, y + 10, 1, 1);
}

function drawHarvestBasket(g: PixelPainter, x: number, y: number, cropId: CropId | undefined): void {
  drawEmptyBasket(g, x, y);
  const cropColor = cropId ? CROP_COLORS[cropId] : 0xe0a04d;
  g.fillStyle(cropColor, 1);
  g.fillRect(x - 2, y, 3, 3);
  g.fillRect(x + 2, y - 1, 3, 4);
  g.fillStyle(0x5d8b45, 1);
  g.fillRect(x, y - 2, 1, 2);
}

function drawEmptyBasket(g: PixelPainter, x: number, y: number): void {
  g.fillStyle(0x7c4b2b, 1);
  g.fillRect(x - 4, y + 2, 10, 8);
  g.fillStyle(0xc58a4b, 1);
  g.fillRect(x - 3, y + 3, 8, 2);
  g.fillRect(x - 2, y + 7, 6, 1);
}

function drawSickle(g: PixelPainter, x: number, y: number, facing: number): void {
  g.fillStyle(0x8c6a3d, 1);
  g.fillRect(x, y - 3, 2, 11);
  g.fillStyle(0xe6d6a7, 1);
  g.fillRect(x + facing, y - 5, 5, 2);
  g.fillRect(x + facing * 5, y - 3, 2, 3);
}

export const FARMHAND_PORTRAIT_SIZE = { width: 24, height: 32 } as const;

/**
 * Renders a farmhand's standing pose for DOM surfaces such as the Inspect
 * panel. The synthetic frozen state lives here so pose knowledge stays local
 * to the art module; callers only pick a worker id and a painter.
 */
export function drawFarmhandPortrait(g: PixelPainter, workerId: number): void {
  const standing: FarmWorker = {
    id: workerId,
    x: 0,
    y: 0,
    task: { kind: 'idle', path: [], progress: 0 },
  };
  drawFarmhand(g, { tick: 0 }, standing, 12, 16);
}
