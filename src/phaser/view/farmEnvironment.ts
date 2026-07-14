import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { drawFarmBotanyGround, drawFarmBotanyOverstory, drawWildMeadowBotany } from './farmBotany';
import { drawCottagePlants } from './farmCottagePlantArt';
import { drawPixelLeafSpray } from './farmFoliagePrimitives';
import { buildFarmSceneryLayout } from './farmSceneryLayout';
import { coordinateHash, drawFlowerClump, drawGrassTuft, tileVariant } from './farmPixelPrimitives';
import { drawPixelStone } from './farmStonePrimitives';
import { drawCreekBed, drawCreekBridge } from './farmWaterside';

export function drawFarmEnvironment(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  g.fillStyle(0x496f3d, 1);
  g.fillRect(
    layout.environment.left,
    layout.environment.top,
    layout.environment.right - layout.environment.left,
    layout.environment.bottom - layout.environment.top,
  );
  drawMeadowQuilt(g, state, tileSize);

  const marginTiles = Math.round(Math.abs(layout.environment.left) / tileSize);
  for (let y = -marginTiles; y < state.height + marginTiles; y += 1) {
    for (let x = -marginTiles; x < state.width + marginTiles; x += 1) {
      const px = x * tileSize;
      const py = y * tileSize;
      g.fillStyle(tileVariant(x, y, [0x527b43, 0x4b733e, 0x577f46]), 0.3);
      g.fillRect(px, py, tileSize, tileSize);
      const hash = coordinateHash(x, y);
      if (hash % 11 === 0) drawFlowerClump(g, px + 7 + (hash % 15), py + 9 + (hash % 11), hash);
      if (hash % 17 === 0) drawMeadowRock(g, px + 6 + (hash % 17), py + 8 + (hash % 12));
      if (hash % 6 === 0) drawGrassTuft(g, px + 5 + (hash % 19), py + 7 + (hash % 16), 0x79a75a);
    }
  }

  drawCreekBed(g, state, tileSize);
  drawSteppingPath(g, state, tileSize);
  drawCottage(g, layout.cottage.x, layout.cottage.y);
  drawCottageGarden(g, state, tileSize);
  drawTierFlourishes(g, state, tileSize);
  drawFarmBotanyGround(g, state, tileSize);
  drawFarmSign(g, layout.sign.x, layout.sign.y);
}

export function drawFarmScenery(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  drawCreekBridge(g, state, tileSize);
}

export function drawFarmOverstory(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  drawFarmBotanyOverstory(g, state, tileSize);
}

export function drawWildMeadowCell(g: Phaser.GameObjects.Graphics, x: number, y: number, tileSize: number): void {
  const px = x * tileSize;
  const py = y * tileSize;
  g.fillStyle(tileVariant(x, y, [0x4e7640, 0x557d45, 0x496f3d]), 0.62);
  g.fillRect(px, py, tileSize, tileSize);
  if (coordinateHash(x, y) % 4 === 0) drawGrassTuft(g, px + 10, py + 13, 0x7fac5c);
  drawWildMeadowBotany(g, x, y, tileSize);
  drawSouthernMeadowStory(g, x, y, tileSize);
}

function drawSouthernMeadowStory(g: Phaser.GameObjects.Graphics, x: number, y: number, tileSize: number): void {
  const px = x * tileSize;
  const py = y * tileSize;

  if (y >= 6 && y <= 9 && x === 6 + (y % 2)) drawSouthPathStone(g, px + 9, py + 12, y);
  if ((x + y * 2) % 5 === 0 && y >= 6) {
    drawFlowerClump(g, px + 7, py + 23, x + y);
    drawFlowerClump(g, px + 23, py + 11, x + y + 1);
  }
  if (x === 7 && y === 7) drawHayBales(g, px, py);
  if (x === 9 && y === 7) drawScarecrow(g, px, py);
  if (x === 1 && y === 8) drawBeeSkeps(g, px, py);
}

export function drawSouthPathStone(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  drawPixelStone(g, x, y + 1, 15, 7, seed, {
    shade: 0x707460,
    main: seed % 2 ? 0x9b987b : 0x8b9075,
    light: 0xc3ba91,
    lichen: seed % 2 ? 0x77894d : 0x82945a,
    shadow: 0x3c5c39,
  });
}

function drawHayBales(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
  g.fillStyle(0x304a31, 0.38);
  g.fillRect(px + 3, py + 23, 27, 5);
  g.fillStyle(0x9a6b32, 1);
  g.fillRect(px + 4, py + 11, 26, 15);
  g.fillStyle(0xdaab48, 1);
  g.fillRect(px + 6, py + 9, 21, 15);
  g.fillRect(px + 9, py + 6, 15, 5);
  g.fillStyle(0xf0cd68, 1);
  g.fillRect(px + 8, py + 10, 17, 2);
  g.fillRect(px + 11, py + 7, 9, 1);
  g.fillStyle(0x8a5b2d, 1);
  g.fillRect(px + 13, py + 9, 2, 15);
  g.fillRect(px + 22, py + 10, 2, 14);
}

function drawScarecrow(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
  g.fillStyle(0x304a31, 0.35);
  g.fillRect(px + 3, py + 27, 27, 3);
  g.fillStyle(0x6b4329, 1);
  g.fillRect(px + 15, py + 5, 3, 25);
  g.fillRect(px + 2, py + 12, 29, 3);

  g.fillStyle(0xd7a65f, 1);
  g.fillRect(px, py + 10, 5, 2);
  g.fillRect(px + 1, py + 14, 5, 2);
  g.fillRect(px + 28, py + 10, 4, 2);
  g.fillRect(px + 27, py + 14, 5, 2);

  g.fillStyle(0xa36f43, 1);
  g.fillRect(px + 6, py + 12, 21, 6);
  g.fillRect(px + 10, py + 16, 13, 9);
  g.fillRect(px + 8, py + 18, 17, 5);
  g.fillStyle(0x70472f, 1);
  g.fillRect(px + 8, py + 17, 3, 6);
  g.fillRect(px + 22, py + 15, 3, 8);
  g.fillStyle(0x7f9d8d, 1);
  g.fillRect(px + 17, py + 18, 4, 4);
  g.fillStyle(0xd8a34e, 1);
  g.fillRect(px + 11, py + 22, 5, 3);
  g.fillRect(px + 19, py + 23, 4, 3);
  g.fillStyle(0x6b4329, 1);
  g.fillRect(px + 2, py + 13, 29, 2);
  g.fillRect(px + 15, py + 23, 3, 7);

  g.fillStyle(0xe2bb70, 1);
  g.fillRect(px + 11, py + 3, 11, 9);
  g.fillStyle(0x5a3828, 1);
  g.fillRect(px + 13, py + 6, 1, 1);
  g.fillRect(px + 14, py + 7, 1, 1);
  g.fillRect(px + 15, py + 6, 1, 1);
  g.fillRect(px + 19, py + 6, 1, 1);
  g.fillRect(px + 18, py + 7, 1, 1);
  g.fillRect(px + 17, py + 6, 1, 1);
  g.fillRect(px + 14, py + 10, 5, 1);
  g.fillStyle(0x775038, 1);
  g.fillRect(px + 6, py + 2, 22, 3);
  g.fillRect(px + 12, py, 11, 3);
  g.fillRect(px + 24, py + 4, 6, 2);
  drawPerchedCrow(g, px + 28, py + 9);
}

function drawPerchedCrow(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x202b2b, 1);
  g.fillRect(x - 3, y - 2, 6, 5);
  g.fillRect(x, y - 5, 4, 4);
  g.fillRect(x - 5, y, 3, 4);
  g.fillStyle(0x496066, 1);
  g.fillRect(x - 1, y - 1, 3, 2);
  g.fillStyle(0xd99c58, 1);
  g.fillRect(x + 4, y - 4, 2, 1);
  g.fillStyle(0x5a3828, 1);
  g.fillRect(x - 1, y + 3, 1, 2);
  g.fillRect(x + 2, y + 3, 1, 2);
}

function drawBeeSkeps(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
  g.fillStyle(0x2f4b32, 0.36);
  g.fillRect(px + 2, py + 24, 28, 4);
  for (const offset of [4, 17]) {
    g.fillStyle(0x8a5b2d, 1);
    g.fillRect(px + offset, py + 12, 11, 14);
    g.fillStyle(0xdaab48, 1);
    g.fillRect(px + offset + 2, py + 9, 7, 17);
    g.fillRect(px + offset + 1, py + 12, 9, 10);
    g.fillStyle(0x5b4328, 1);
    g.fillRect(px + offset + 4, py + 20, 3, 3);
    g.fillStyle(0xf0cd68, 1);
    g.fillRect(px + offset + 3, py + 11, 5, 1);
    g.fillRect(px + offset + 2, py + 15, 7, 1);
  }
}

function drawMeadowQuilt(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const patches = [
    { x: layout.frame.left - 30, y: -76, width: 210, height: 120, color: 0x688f4d },
    { x: 88, y: layout.farm.bottom + 6, width: 230, height: 96, color: 0x5b8546 },
    { x: layout.farm.right + 22, y: 142, width: 160, height: 170, color: 0x638849 },
    { x: -170, y: 210, width: 170, height: 190, color: 0x416d42 },
  ];
  for (const patch of patches) {
    g.fillStyle(patch.color, 0.34);
    g.fillRect(patch.x, patch.y, patch.width, patch.height);
    g.fillStyle(0x9dbb67, 0.13);
    g.fillRect(patch.x + 9, patch.y + 8, patch.width - 18, 3);
  }

  g.fillStyle(0xd8b85c, 0.45);
  for (let index = 0; index < 9; index += 1) {
    const x = layout.farm.right + 91 + (index % 3) * 9;
    const y = -8 + Math.floor(index / 3) * 10;
    g.fillRect(x, y, 2, 5);
  }
}

function drawCottage(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x30482f, 0.42);
  g.fillRect(x - 9, y + 49, 76, 12);
  g.fillStyle(0x855333, 1);
  g.fillRect(x, y + 20, 58, 37);
  g.fillStyle(0xd8a75f, 1);
  g.fillRect(x + 4, y + 23, 50, 31);
  g.fillStyle(0xf1c67b, 1);
  g.fillRect(x + 6, y + 24, 46, 3);
  g.fillStyle(0x6f3428, 1);
  g.fillRect(x - 7, y + 13, 72, 8);
  g.fillStyle(0xb94f3b, 1);
  for (let row = 0; row < 4; row += 1) g.fillRect(x - 4 + row * 2, y + 8 + row * 3, 64 - row * 4, 4);
  g.fillStyle(0xeb8862, 0.95);
  g.fillRect(x + 2, y + 11, 54, 2);
  g.fillStyle(0x694229, 1);
  g.fillRect(x + 23, y + 34, 14, 23);
  g.fillStyle(0x3a6170, 1);
  for (const windowX of [8, 43]) g.fillRect(x + windowX, y + 31, 10, 11);
  g.fillStyle(0x9bd1c5, 1);
  g.fillRect(x + 10, y + 33, 6, 6);
  g.fillRect(x + 45, y + 33, 6, 6);
  for (const windowX of [8, 43]) {
    g.fillStyle(0x704229, 1);
    g.fillRect(x + windowX - 1, y + 41, 12, 4);
  }
  drawCottagePlants(g, x, y);
  g.fillStyle(0xffd879, 1);
  g.fillRect(x + 33, y + 44, 2, 2);
  g.fillStyle(0x754130, 1);
  g.fillRect(x + 45, y - 1, 8, 16);
}

export function drawCottageGarden(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const { garden, cottage } = layout;
  g.fillStyle(0x3b6239, 0.5);
  g.fillRect(garden.left, garden.top, garden.right - garden.left, garden.bottom - garden.top);
  g.fillStyle(0x805035, 1);
  for (const rowY of [garden.top + 13, garden.top + 29]) {
    g.fillRect(garden.left + 7, rowY, 50, 7);
    g.fillStyle(0xb06e45, 1);
    g.fillRect(garden.left + 9, rowY + 1, 46, 2);
    g.fillStyle(0x805035, 1);
  }
  for (let index = 0; index < 6; index += 1) {
    const x = garden.left + 11 + index * 8;
    drawGrassTuft(g, x, garden.top + 20, index % 2 ? 0x6aa052 : 0x77ad58);
    g.fillStyle(index % 2 ? 0xeaa3a0 : 0xffd66e, 1);
    g.fillRect(x - 1, garden.top + 15 + (index % 2), 2, 2);

    const cabbageX = x + (index % 2 ? 1 : -1);
    drawPixelLeafSpray(
      g,
      cabbageX - 3,
      garden.top + 27,
      index % 2 ? 0x5f934c : 0x6aa052,
      0x9bc36d,
      index + 2,
      0x315f3c,
    );
  }

  const lineY = garden.top + 5;
  const lineLeft = cottage.x + 2;
  const lineRight = garden.right - 2;
  g.fillStyle(0x5d3b27, 1);
  g.fillRect(lineLeft, lineY, lineRight - lineLeft, 1);
  g.fillRect(lineLeft, lineY - 5, 2, 25);
  g.fillRect(lineRight - 2, lineY - 5, 2, 25);
  g.fillStyle(0xeed7c0, 1);
  g.fillRect(lineLeft + 8, lineY + 2, 11, 10);
  g.fillRect(lineLeft + 23, lineY + 2, 8, 13);
  g.fillStyle(0xa9c9b3, 1);
  g.fillRect(lineLeft + 34, lineY + 2, 12, 8);
  g.fillStyle(0x7d4329, 1);
  for (const pegX of [lineLeft + 9, lineLeft + 18, lineLeft + 24, lineLeft + 30, lineLeft + 35, lineLeft + 45]) {
    g.fillRect(pegX, lineY, 1, 3);
  }
}

function drawTierFlourishes(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const { cottage, farm, garden } = buildFarmSceneryLayout(state.width, state.height, tileSize);
  if (state.tier.level >= 2) {
    drawProduceCrate(g, garden.left + 7, garden.bottom + 7);
    drawProduceCrate(g, garden.left + 25, garden.bottom + 10);
  }
  if (state.tier.level >= 3) drawHarvestBunting(g, cottage.x - 7, cottage.y + 4);
  if (state.tier.level >= 4) drawHarvestStall(g, farm.right + 16, farm.bottom - 61);
}

function drawProduceCrate(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x593b28, 0.32);
  g.fillRect(x - 2, y + 9, 18, 4);
  g.fillStyle(0x9b6238, 1);
  g.fillRect(x, y + 3, 15, 9);
  g.fillStyle(0xc88a4c, 1);
  g.fillRect(x + 2, y + 5, 11, 2);
  g.fillStyle(0xe8752d, 1);
  g.fillRect(x + 3, y, 4, 5);
  g.fillStyle(0xe5b94f, 1);
  g.fillRect(x + 9, y + 1, 4, 4);
}

function drawHarvestBunting(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x5d3b27, 1);
  g.fillRect(x, y, 77, 1);
  const colors = [0x6eb6ad, 0xd46b75, 0xf0c36a, 0x6eb6ad, 0xd46b75];
  for (let index = 0; index < colors.length; index += 1) {
    const flagX = x + 7 + index * 15;
    const flagY = y + 1 + (index % 2);
    g.fillStyle(colors[index] ?? colors[0], 1);
    g.fillRect(flagX, flagY, 7, 5);
    g.fillRect(flagX + 2, flagY + 5, 3, 3);
  }
}

function drawHarvestStall(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x314932, 0.38);
  g.fillRect(x - 5, y + 39, 70, 8);
  g.fillStyle(0x684128, 1);
  g.fillRect(x, y + 8, 4, 37);
  g.fillRect(x + 56, y + 8, 4, 37);
  g.fillRect(x + 2, y + 30, 56, 12);
  g.fillStyle(0xd8a34e, 1);
  g.fillRect(x - 4, y + 4, 68, 7);
  for (let stripe = 0; stripe < 5; stripe += 1) {
    g.fillStyle(stripe % 2 ? 0xf0c36a : 0xd46b75, 1);
    g.fillRect(x - 2 + stripe * 13, y + 5, 8, 6);
  }
  g.fillStyle(0xc85c29, 1);
  g.fillRect(x + 8, y + 25, 9, 7);
  g.fillRect(x + 20, y + 27, 8, 5);
  g.fillStyle(0xe5b94f, 1);
  g.fillRect(x + 34, y + 23, 4, 9);
  g.fillRect(x + 41, y + 25, 4, 7);
  g.fillStyle(0x6eb6ad, 1);
  g.fillRect(x + 48, y + 19, 6, 13);
}

function drawSteppingPath(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  const { cottage, farm } = buildFarmSceneryLayout(state.width, state.height, tileSize);
  for (let index = 0; index < 7; index += 1) {
    const x = cottage.x + 28 - index * 7;
    const y = cottage.y + 66 + index * 12;
    if (x < farm.right - 12) break;
    drawSteppingStone(g, x, y, index);
  }
}

export function drawSteppingStone(g: Phaser.GameObjects.Graphics, x: number, y: number, _seed: number): void {
  drawPixelStone(g, x, y, 11, 6, _seed, {
    shade: 0x626c61,
    main: 0x8d9277,
    light: 0xb9b48e,
    lichen: 0x71834f,
    shadow: 0x40583d,
  });
}

function drawFarmSign(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(0x5e3823, 1);
  g.fillRect(x + 7, y + 13, 4, 16);
  g.fillRect(x + 30, y + 13, 4, 16);
  g.fillStyle(0xa96835, 1);
  g.fillRect(x, y, 42, 18);
  g.fillStyle(0xd99c58, 1);
  g.fillRect(x + 3, y + 3, 36, 3);
  g.fillStyle(0x5f3c27, 1);
  g.fillRect(x + 8, y + 9, 4, 3);
  g.fillRect(x + 15, y + 7, 3, 7);
  g.fillRect(x + 22, y + 9, 11, 3);
}

export function drawMeadowRock(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  drawPixelStone(g, x, y, 7, 5, x + y, {
    shade: 0x536052,
    main: 0x7b8975,
    light: 0xa4ad91,
    lichen: 0x6d824c,
    shadow: 0x40583d,
  });
}
