import type Phaser from 'phaser';
import type { FarmPlantPlacement, FarmTreePlacement } from './farmBotany';
import { drawPixelLeafSpray } from './farmFoliagePrimitives';

type Graphics = Phaser.GameObjects.Graphics;

function drawPixelPath(g: Graphics, fromX: number, fromY: number, toX: number, toY: number): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let step = 0; step <= steps; step += 1) {
    const progress = steps === 0 ? 0 : step / steps;
    g.fillRect(Math.round(fromX + (toX - fromX) * progress), Math.round(fromY + (toY - fromY) * progress), 1, 1);
  }
}

function drawTreeShadow(g: Graphics, x: number, y: number, width: number): void {
  g.fillStyle(0x294a34, 0.34);
  const left = x - Math.floor(width / 2);
  for (const [row, inset] of [
    [0, 7],
    [1, 3],
    [2, 0],
    [3, 1],
    [4, 4],
    [5, 9],
  ] as const) {
    g.fillRect(left + inset, y + 20 + row, width - inset * 2, 1);
  }
}

function drawTaperedTrunk(
  g: Graphics,
  x: number,
  top: number,
  height: number,
  baseWidth: number,
  variant: number,
  bark: number,
  light: number,
): void {
  const mirrored = Math.abs(variant) % 2 === 1;
  for (let row = 0; row < height; row += 1) {
    const progress = row / Math.max(1, height - 1);
    const width = Math.max(2, baseWidth - (progress < 0.42 ? 4 : progress < 0.8 ? 3 : 0));
    const crownBend = row < height * 0.28 ? (mirrored ? -1 : 1) : row > height * 0.7 ? (mirrored ? 1 : -1) : 0;
    const ripple = ([-1, 1, 0][Math.floor(row / 3) % 3] ?? 0) * (mirrored ? -1 : 1);
    const bend = crownBend + ripple;
    const left = x + bend - Math.floor(width / 2);
    g.fillStyle(bark, 1);
    g.fillRect(left, top + row, width, 1);
    if (width >= 3 && row % 3 !== 1) {
      g.fillStyle(light, 0.92);
      g.fillRect(left + (mirrored ? 1 : width - 2), top + row, 1, 1);
    }
  }
  g.fillStyle(bark, 1);
  g.fillRect(x - Math.floor(baseWidth / 2) - 2, top + height, 4, 1);
  g.fillRect(x + 1, top + height - 1, Math.max(3, baseWidth - 1), 1);
}

function drawBranchForks(g: Graphics, x: number, y: number, variant: number, bark: number): void {
  const lean = Math.abs(variant) % 2 === 0 ? 1 : -1;
  g.fillStyle(bark, 1);
  drawPixelPath(g, x, y + 8, x - 10, y - 4 + lean);
  drawPixelPath(g, x + 1, y + 5, x + 11, y - 6 - lean);
  drawPixelPath(g, x - 1, y + 1, x - 4 * lean, y - 9);
}

export function drawTreeBase(g: Graphics, tree: FarmTreePlacement): void {
  const { x, y, species, variant } = tree;
  drawTreeShadow(g, x, y, species === 'willow' ? 40 : species === 'birch' ? 22 : 31);

  if (species === 'hazel') {
    g.fillStyle(0x674126, 1);
    drawPixelPath(g, x - 5, y + 25, x - 7, y + 2);
    drawPixelPath(g, x, y + 25, x + 2, y - 1);
    drawPixelPath(g, x + 5, y + 25, x + 10, y + 4);
    g.fillStyle(0xa06c3d, 0.9);
    drawPixelPath(g, x - 4, y + 24, x - 5, y + 7);
    drawPixelPath(g, x + 1, y + 23, x + 3, y + 5);
    return;
  }

  if (species === 'birch') {
    drawTaperedTrunk(g, x, y - 2, 27, 5, variant, 0xd8d1ad, 0xf0e6c4);
    drawBranchForks(g, x, y, variant, 0x756f58);
    g.fillStyle(0x5c5746, 1);
    for (const [markX, markY] of [[1, 6], [-2, 13], [0, 19]] as const) g.fillRect(x + markX, y + markY, 2, 1);
    return;
  }

  const bark = species === 'willow' ? 0x55432c : 0x674126;
  drawTaperedTrunk(g, x + 4, y + 1, 24, species === 'willow' ? 7 : 6, variant, bark, 0xa06c3d);
  drawBranchForks(g, x + 4, y + 1, variant, bark);
}

interface CanopySprayOffset {
  x: number;
  y: number;
}

function drawCanopySprays(
  g: Graphics,
  x: number,
  y: number,
  variant: number,
  offsets: readonly CanopySprayOffset[],
  foliage: readonly number[],
  accent: number,
  shade: number,
): void {
  g.fillStyle(shade, 1);
  for (const [index, offset] of offsets.entries()) {
    if (index % 3 === 1) drawPixelPath(g, x + 4, y + 5, x + offset.x + 3, y + offset.y + 3);
  }
  for (const [index, offset] of offsets.entries()) {
    drawPixelLeafSpray(
      g,
      x + offset.x,
      y + offset.y,
      foliage[(variant + index) % foliage.length] ?? foliage[0] ?? 0x477a45,
      accent,
      variant * 5 + index,
      shade,
    );
  }
}

function drawElderCanopy(g: Graphics, x: number, y: number, variant: number): void {
  drawCanopySprays(g, x, y, variant, [
    { x: -15, y: -7 }, { x: -11, y: -14 }, { x: -3, y: -20 }, { x: 6, y: -18 },
    { x: 15, y: -14 }, { x: 24, y: -7 }, { x: -13, y: 1 }, { x: -5, y: -5 },
    { x: 4, y: -7 }, { x: 13, y: -4 }, { x: 21, y: 1 }, { x: -1, y: -12 },
    { x: 8, y: -11 }, { x: 17, y: -8 },
  ], [0x28543d, variant % 2 ? 0x3d7048 : 0x356944, 0x477a45], 0x8fba67, 0x1d4133);
  if (variant % 3 === 0) {
    g.fillStyle(0x7e668b, 1);
    for (const [berryX, berryY] of [[2, -6], [3, -5], [19, 0], [20, -1]] as const) g.fillRect(x + berryX, y + berryY, 1, 1);
  }
}

function drawHazelCanopy(g: Graphics, x: number, y: number, variant: number): void {
  drawCanopySprays(g, x, y, variant, [
    { x: -13, y: -6 }, { x: -10, y: -14 }, { x: -4, y: -20 }, { x: 4, y: -18 },
    { x: 12, y: -13 }, { x: 19, y: -7 }, { x: -8, y: -4 }, { x: 1, y: -7 },
    { x: 10, y: -2 }, { x: 0, y: -13 }, { x: 8, y: -10 }, { x: 15, y: -5 },
  ], [0x244a36, variant % 2 ? 0x4b7b4c : 0x427447, 0x568749], 0x9bc26e, 0x244a36);
}

function drawBirchCanopy(g: Graphics, x: number, y: number, variant: number): void {
  drawCanopySprays(g, x, y, variant, [
    { x: -6, y: -26 }, { x: 1, y: -23 }, { x: -13, y: -18 }, { x: 7, y: -16 },
    { x: -18, y: -10 }, { x: -7, y: -11 }, { x: 3, y: -8 }, { x: 14, y: -8 },
    { x: -4, y: -3 }, { x: -2, y: -17 }, { x: 6, y: -13 }, { x: -11, y: -6 },
  ], [0x2e5b3e, variant % 2 ? 0x72a557 : 0x689c50, 0x5b8c4d], 0xb4d57d, 0x2e5b3e);
}

function drawAppleCanopy(g: Graphics, x: number, y: number, variant: number): void {
  drawCanopySprays(g, x, y, variant, [
    { x: -17, y: -7 }, { x: -13, y: -14 }, { x: -5, y: -18 }, { x: 4, y: -18 },
    { x: 13, y: -14 }, { x: 20, y: -8 }, { x: -15, y: 0 }, { x: -7, y: -5 },
    { x: 2, y: -7 }, { x: 11, y: -4 }, { x: 18, y: 0 }, { x: -5, y: -11 },
    { x: 4, y: -12 }, { x: 13, y: -9 },
  ], [0x244a34, 0x3f7043, 0x477a45], 0x83ad5e, 0x244a34);
  g.fillStyle(variant % 2 ? 0xe19a54 : 0xd76752, 1);
  for (const [fruitX, fruitY] of [[-5, -4], [12, -2], [3, 4]] as const) {
    g.fillRect(x + fruitX, y + fruitY, 2, 1);
    g.fillRect(x + fruitX + (variant % 2), y + fruitY + 1, 1, 1);
  }
}

function drawWillowCanopy(g: Graphics, x: number, y: number, variant: number): void {
  const willow = variant % 2 ? 0x4f7e49 : 0x477746;
  drawCanopySprays(g, x, y, variant, [
    { x: -21, y: -10 }, { x: -17, y: -17 }, { x: -9, y: -22 }, { x: 0, y: -21 },
    { x: 9, y: -19 }, { x: 17, y: -14 }, { x: 21, y: -7 }, { x: -19, y: -3 },
    { x: -10, y: -7 }, { x: -1, y: -9 }, { x: 8, y: -6 }, { x: 16, y: -2 },
    { x: -12, y: -12 }, { x: -3, y: -15 }, { x: 6, y: -13 }, { x: 15, y: -9 },
  ], [0x1f4635, willow, 0x568749], 0x79a85a, 0x1f4635);
  for (const [index, offset] of [-18, -9, 7, 17].entries()) {
    g.fillStyle(index % 2 === 0 ? willow : 0x79a85a, 1);
    const top = y + 2 + Math.abs(offset % 4);
    for (let step = 0; step < 12; step += 2) {
      const drift = Math.floor(step / 4) * (index % 2 === 0 ? -1 : 1);
      g.fillRect(x + offset + drift, top + step, 1, 2);
      if (step % 4 === 0) g.fillRect(x + offset + drift + (index % 2 === 0 ? 1 : -1), top + step + 1, 1, 1);
    }
  }
}

export function drawTreeCanopy(g: Graphics, tree: FarmTreePlacement): void {
  if (tree.species === 'birch') drawBirchCanopy(g, tree.x, tree.y, tree.variant);
  else if (tree.species === 'willow') drawWillowCanopy(g, tree.x, tree.y, tree.variant);
  else if (tree.species === 'apple') drawAppleCanopy(g, tree.x, tree.y, tree.variant);
  else if (tree.species === 'hazel') drawHazelCanopy(g, tree.x, tree.y, tree.variant);
  else drawElderCanopy(g, tree.x, tree.y, tree.variant);
}

function drawFoxglove(g: Graphics, x: number, y: number, variant: number): void {
  g.fillStyle(0x557d43, 1);
  g.fillRect(x, y - 14, 1, 15);
  g.fillRect(x - 2, y - 3, 2, 1);
  const bloom = variant % 2 ? 0xd597b4 : 0xc5a1d6;
  g.fillStyle(bloom, 1);
  for (const [bellX, bellY, lean] of [[-2, -13, -1], [1, -10, 1], [-1, -7, -1]] as const) {
    g.fillRect(x + bellX, y + bellY, 2, 1);
    g.fillRect(x + bellX + lean, y + bellY + 1, 1, 1);
  }
}

function drawLavender(g: Graphics, x: number, y: number, variant: number): void {
  const bloom = variant % 2 ? 0x9b87c6 : 0xb09bd2;
  for (const [index, offset] of [-3, 0, 3].entries()) {
    const top = y - 13 - Math.abs(offset);
    g.fillStyle(0x527a42, 1);
    drawPixelPath(g, x + offset, y, x + offset + (index - 1), top + 2);
    g.fillStyle(bloom, 1);
    for (let bud = 0; bud < 4; bud += 1) {
      g.fillRect(x + offset + ((bud + index) % 2), top + bud, 1, 1);
      if (bud % 2 === 0) g.fillRect(x + offset - 1, top + bud + 1, 1, 1);
    }
  }
}

export function drawDecorativePlant(g: Graphics, plant: FarmPlantPlacement): void {
  const { x, y, kind, variant } = plant;
  if (kind === 'fern') {
    g.fillStyle(0x315f3c, 1);
    g.fillRect(x, y - 10, 1, 11);
    g.fillStyle(variant % 2 ? 0x6e9c50 : 0x79a85a, 1);
    for (let row = 0; row < 4; row += 1) {
      for (let step = 1; step <= 5 - row; step += 1) {
        const frondY = y - 9 + row * 2 + Math.floor(step / 3);
        g.fillRect(x - step, frondY, 1, 1);
        g.fillRect(x + step, frondY, 1, 1);
      }
    }
  } else if (kind === 'foxglove') drawFoxglove(g, x, y, variant);
  else if (kind === 'lavender') drawLavender(g, x, y, variant);
  else if (kind === 'berry') {
    g.fillStyle(0x775a3d, 1);
    g.fillRect(x, y - 8, 1, 9);
    g.fillRect(x + 3, y - 6, 1, 7);
    drawPixelLeafSpray(g, x - 6, y - 8, 0x2a5339, 0x7ca85a, variant, 0x244a34);
    drawPixelLeafSpray(g, x - 3, y - 12, 0x5f8f4f, 0x91b966, variant + 3, 0x2a5339);
    drawPixelLeafSpray(g, x + 1, y - 7, 0x477a45, 0x86ad60, variant + 6, 0x2a5339);
    g.fillStyle(variant % 2 ? 0xc95968 : 0x73567c, 1);
    g.fillRect(x - 2, y - 5, 2, 2);
    g.fillRect(x + 4, y - 9, 2, 2);
  } else {
    g.fillStyle(0xe8d2ad, 1);
    g.fillRect(x - 1, y - 3, 2, 4);
    g.fillRect(x + 5, y - 2, 1, 3);
    g.fillStyle(variant % 2 ? 0xc97859 : 0xd9a45f, 1);
    g.fillRect(x - 1, y - 6, 3, 1);
    g.fillRect(x - 3, y - 5, 7, 1);
    g.fillRect(x - 2, y - 4, 5, 1);
    g.fillRect(x + 4, y - 4, 4, 1);
    g.fillRect(x + 3, y - 3, 6, 1);
  }
}
