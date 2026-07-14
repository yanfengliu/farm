import type Phaser from 'phaser';
import { drawPixelLeafSpray } from './farmFoliagePrimitives';

export function drawCarrotCrop(
  g: Phaser.GameObjects.Graphics,
  px: number,
  py: number,
  stage: number,
  dry: boolean,
): void {
  const main = dry ? 0x87904e : 0x4f9849;
  const accent = dry ? 0xa5a45e : 0x78b45a;
  const shade = dry ? 0x6f783f : 0x315f3c;

  for (const [index, offsetX] of [10, 16, 22].entries()) {
    const x = px + offsetX;
    const rootY = py + 21;
    const bladeHeight = 4 + stage + (index % 2);
    g.fillStyle(shade, 1);
    drawPixelPath(g, x, rootY, x + (index % 2 === 0 ? -1 : 1), rootY - bladeHeight);
    g.fillStyle(main, 1);
    drawPixelPath(g, x - 1, rootY - 1, x - 3, rootY - bladeHeight + 1);
    drawPixelPath(g, x + 1, rootY - 1, x + 3, rootY - bladeHeight + 2);
    g.fillStyle(accent, 1);
    g.fillRect(x - 2, rootY - bladeHeight, 1, 1);
    g.fillRect(x + 2, rootY - bladeHeight + (index % 2), 1, 1);

    if (stage >= 2) drawCarrotRoot(g, x, rootY, stage);
  }
}

export function drawWheatCrop(
  g: Phaser.GameObjects.Graphics,
  px: number,
  py: number,
  stage: number,
  dry: boolean,
): void {
  const stem = dry ? 0x8b7741 : 0x7d8e3c;
  const stalks = [
    { x: 6, sway: 0, lift: 0, variant: 0 },
    { x: 11, sway: 1, lift: 1, variant: 1 },
    { x: 16, sway: 0, lift: 0, variant: 2 },
    { x: 21, sway: -1, lift: 2, variant: 3 },
    { x: 26, sway: 0, lift: 1, variant: 4 },
  ] as const;

  for (const stalk of stalks) {
    const baseX = px + stalk.x;
    const headX = baseX + stalk.sway;
    const bottomY = py + 25;
    const stalkHeight = 5 + stage * 2 + stalk.lift;
    const headBottomY = bottomY - stalkHeight + 1;
    const bendY = Math.min(bottomY, headBottomY + 3);
    g.fillStyle(stem, 1);
    drawPixelPath(g, baseX, bottomY, baseX, bendY);
    drawPixelPath(g, baseX, bendY, headX, headBottomY);
    if (stage > 0) drawWheatHead(g, headX, headBottomY, stage, stalk.variant);
  }
}

export function drawTomatoCrop(
  g: Phaser.GameObjects.Graphics,
  px: number,
  py: number,
  stage: number,
  dry: boolean,
): void {
  if (stage > 0) {
    g.fillStyle(0x6a4930, 1);
    g.fillRect(px + 9, py + 9, 2, 17);
    g.fillRect(px + 21, py + 9, 2, 17);
    g.fillRect(px + 9, py + 10, 14, 2);
  }

  const main = dry ? 0x7d884b : 0x4c9449;
  const accent = dry ? 0xa6a75e : 0x79b85b;
  const shade = dry ? 0x5f673c : 0x315f3c;
  const leafTop = py + 20 - stage * 2;
  g.fillStyle(shade, 1);
  g.fillRect(px + 14, leafTop + 2, 1, py + 26 - leafTop);
  drawPixelLeafSpray(g, px + 9, leafTop, main, accent, stage + (dry ? 6 : 0), shade);
  if (stage > 0) {
    g.fillStyle(shade, 1);
    g.fillRect(px + 20, leafTop, 1, py + 24 - leafTop);
    drawPixelLeafSpray(g, px + 16, leafTop - 2, main, accent, stage + 3 + (dry ? 6 : 0), shade);
  }

  if (stage >= 2) {
    const fruit = stage === 3 ? 0xd94b3f : 0xa85839;
    const size = stage === 3 ? 6 : 4;
    const palette = { main: fruit, shade: 0x823b32, light: 0xff7b64 };
    drawSteppedFruit(g, px + 11, py + 18, size, size, 0, palette);
    drawSteppedFruit(g, px + 19, py + 15, size, size, 1, palette);
    g.fillStyle(shade, 1);
    for (const [fruitX, fruitY] of [[px + 11, py + 18], [px + 19, py + 15]] as const) {
      g.fillRect(fruitX + Math.floor(size / 2), fruitY - 1, 1, 2);
      g.fillRect(fruitX + Math.floor(size / 2) - 1, fruitY, 3, 1);
    }
  }
}

export function drawPumpkinCrop(
  g: Phaser.GameObjects.Graphics,
  px: number,
  py: number,
  stage: number,
  dry: boolean,
): void {
  const vine = dry ? 0x79824a : 0x4b8c45;
  const accent = dry ? 0xa5a45e : 0x78b45a;
  const shade = dry ? 0x5f673c : 0x315f3c;
  g.fillStyle(vine, 1);
  g.fillRect(px + 7, py + 21, 7, 1);
  g.fillRect(px + 13, py + 20, 6, 1);
  g.fillRect(px + 18, py + 21, 7, 1);
  g.fillRect(px + 10, py + 17, 1, 5);
  g.fillRect(px + 22, py + 19, 1, 5);
  drawPixelLeafSpray(g, px + 6, py + 15, vine, accent, stage + (dry ? 6 : 0), shade);
  if (stage > 0) drawPixelLeafSpray(g, px + 19, py + 17, vine, accent, stage + 3 + (dry ? 6 : 0), shade);

  if (stage < 2) return;
  for (const [x, y, delayed] of [[9, 18, false], [18, 14, true]] as const) {
    if (delayed && stage < 3) continue;
    const width = stage === 3 ? 9 : 6;
    const height = stage === 3 ? 7 : 5;
    drawSteppedFruit(
      g,
      px + x,
      py + y,
      width,
      height,
      delayed ? 1 : 0,
      { main: stage === 3 ? 0xe8752d : 0xc45d28, shade: 0xa94424, light: 0xf5a447, furrow: 0x8d3b25 },
      width >= 9 ? [-2, 1] : [-1, 1],
    );
    g.fillStyle(vine, 1);
    g.fillRect(px + x + Math.floor(width / 2), py + y - 2, 2, 3);
  }
}

export function drawCloverPatch(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
  g.fillStyle(0x598548, 1);
  g.fillRect(x, y - 5, 1, 6);
  g.fillStyle(0x86b966, 1);
  drawCloverLeaf(g, x - 3, y - 6, -1);
  drawCloverLeaf(g, x + 3, y - 7, 1);
  drawCloverLeaf(g, x, y - 9, variant % 2 === 0 ? -1 : 1);
  if (variant % 3 === 0) {
    g.fillStyle(0xf0d6df, 1);
    g.fillRect(x, y - 11, 2, 2);
  }
}

function drawCloverLeaf(g: Phaser.GameObjects.Graphics, x: number, y: number, direction: -1 | 1): void {
  g.fillRect(x - 1, y, 3, 1);
  g.fillRect(x, y - 1, 2, 1);
  g.fillRect(x + direction, y + 1, 1, 1);
}

function drawCarrotRoot(g: Phaser.GameObjects.Graphics, x: number, y: number, stage: number): void {
  const widths = stage === 3 ? [4, 4, 3, 3, 2, 1, 1] : [4, 3, 2, 1];
  for (const [row, width] of widths.entries()) {
    g.fillStyle(row === widths.length - 1 ? 0xb95d2b : stage === 3 ? 0xe8752d : 0xb95d2b, 1);
    g.fillRect(x - Math.floor(width / 2), y + row, width, 1);
  }
  g.fillStyle(0xffb45c, 1);
  g.fillRect(x - 1, y + 1, 1, 1);
}

const WHEAT_KERNEL_ROWS = [
  [0],
  [-1, 0],
  [0, 1],
  [-1, 0, 1],
  [-1, 0],
  [0, 1],
  [0],
] as const;

function drawWheatHead(
  g: Phaser.GameObjects.Graphics,
  x: number,
  bottomY: number,
  stage: number,
  variant: number,
): void {
  const rowCount = Math.min(WHEAT_KERNEL_ROWS.length, stage * 2 + (variant % 2));
  const topY = bottomY - rowCount + 1;
  const mature = stage === 3;
  const main = mature ? 0xe5b94f : 0xaab153;
  const shade = mature ? 0xb88638 : 0x849343;
  const light = 0xffdf79;

  for (let row = 0; row < rowCount; row += 1) {
    const offsets = WHEAT_KERNEL_ROWS[row] ?? [0];
    for (const offset of offsets) {
      const isHighlight = mature && row === 1 && offset === (variant % 2 === 0 ? -1 : 0);
      g.fillStyle(isHighlight ? light : row >= rowCount - 2 ? shade : main, 1);
      g.fillRect(x + offset, topY + row, 1, 1);
    }
  }
}

function drawPixelPath(
  g: Phaser.GameObjects.Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let step = 0; step <= steps; step += 1) {
    const progress = steps === 0 ? 0 : step / steps;
    g.fillRect(Math.round(fromX + (toX - fromX) * progress), Math.round(fromY + (toY - fromY) * progress), 1, 1);
  }
}

interface PixelFruitPalette {
  main: number;
  shade: number;
  light: number;
  furrow?: number;
}

const FRUIT_ROW_INSETS: Record<number, readonly number[]> = {
  4: [1, 0, 0, 1],
  5: [2, 1, 0, 1, 2],
  6: [2, 1, 0, 0, 1, 2],
  7: [3, 1, 0, 0, 0, 1, 3],
};

function drawSteppedFruit(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  variant: number,
  palette: PixelFruitPalette,
  furrowOffsets: readonly number[] = [],
): void {
  const insets = FRUIT_ROW_INSETS[height] ?? [];
  for (let row = 0; row < height; row += 1) {
    const inset = insets[row] ?? Math.max(0, Math.floor(Math.abs(row - (height - 1) / 2)));
    g.fillStyle(row === height - 1 ? palette.shade : palette.main, 1);
    g.fillRect(x + inset, y + row, Math.max(1, width - inset * 2), 1);
  }

  const highlightInset = insets[1] ?? 1;
  const highlightWidth = Math.max(1, Math.min(2, width - highlightInset * 2));
  g.fillStyle(palette.light, 1);
  g.fillRect(x + highlightInset + (variant % 2), y + 1, highlightWidth, 1);

  if (furrowOffsets.length === 0) return;
  g.fillStyle(palette.furrow ?? palette.shade, 1);
  const center = x + Math.floor(width / 2);
  for (const offset of furrowOffsets) {
    for (let row = 1; row < height - 1; row += 1) g.fillRect(center + offset, y + row, 1, 1);
  }
}
