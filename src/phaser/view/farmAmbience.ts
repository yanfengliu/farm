import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { buildFarmSceneryLayout } from './farmSceneryLayout';
import { pingPong } from './farmMotionMath';
import { coordinateHash } from './farmPixelPrimitives';
import { drawCreekShimmer } from './farmWaterside';
import { drawFarmWildlife } from './farmWildlifeArt';

export function drawFarmAmbience(
  water: Phaser.GameObjects.Graphics,
  actors: Phaser.GameObjects.Graphics,
  effects: Phaser.GameObjects.Graphics,
  state: FarmState,
  tileSize: number,
  tick: number,
): void {
  drawCreekShimmer(water, state, tileSize, tick);
  drawFarmWildlife(water, actors, effects, state, tileSize);
  drawSunMotes(effects, state, tileSize, tick);
  drawButterflies(effects, state, tileSize, tick);
  drawChimneySmoke(effects, state, tileSize, tick);
}

function drawButterflies(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number, tick: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const colors = [0xf2b6a0, 0xffdf79, 0xb9d8e7, 0xd8b6e7];
  for (let index = 0; index < 6; index += 1) {
    const seed = coordinateHash(index + 3, state.width + state.height);
    const rangeX = layout.frame.right - layout.frame.left - 100;
    const rangeY = layout.frame.bottom - layout.frame.top - 80;
    const x = layout.frame.left + 50 + pingPong(seed + tick * (index % 2 ? 2 : 1), rangeX);
    const yAnchor = positiveModulo(Math.floor(seed / 7), Math.max(1, rangeY - 18));
    const y = layout.frame.top + 54 + yAnchor + Math.round(Math.sin((tick + index * 5) / 4) * 8);
    const open = (tick + index) % 4 < 2;
    g.fillStyle(colors[index % colors.length] ?? 0xffdf79, 0.9);
    g.fillRect(x - (open ? 3 : 2), y, 2, 2);
    g.fillRect(x + 1, y, 2, 2);
    g.fillStyle(0x4c4a35, 0.9);
    g.fillRect(x, y, 1, 3);
  }
}

function drawSunMotes(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number, tick: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  for (let index = 0; index < 12; index += 1) {
    const x = layout.frame.left + 30 + positiveModulo(index * 71 + tick, layout.frame.right - layout.frame.left - 60);
    const y = layout.frame.top + 28 + positiveModulo(index * 43 + Math.floor(tick / 2), layout.frame.bottom - layout.frame.top - 56);
    g.fillStyle(index % 3 === 0 ? 0xffe28a : 0xd8efaa, index % 2 === 0 ? 0.62 : 0.38);
    g.fillRect(x, y, index % 3 === 0 ? 2 : 1, 1);
  }
}

export function drawChimneySmoke(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number, tick: number): void {
  const { cottage } = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const drift = positiveModulo(tick, 18);
  for (let index = 0; index < 4; index += 1) {
    const age = positiveModulo(drift + index * 5, 20);
    const mask = SMOKE_PUFF_MASKS[(Math.floor(age / 5) + index) % SMOKE_PUFF_MASKS.length] ?? SMOKE_PUFF_MASKS[0];
    const puffX = cottage.x + 47 + Math.floor(age / 5) + (positiveModulo(age + index, 4) === 0 ? -1 : 0);
    const puffY = cottage.y - 5 - age * 2;
    const alpha = Math.max(0.12, 0.48 - age * 0.015);
    for (const [segmentIndex, [offsetX, offsetY, width]] of mask.entries()) {
      g.fillStyle(segmentIndex === 0 ? 0xf5eedb : 0xe7dfc8, segmentIndex === 0 ? alpha * 0.8 : alpha);
      g.fillRect(puffX + offsetX, puffY + offsetY, width, 1);
    }
  }
}

const SMOKE_PUFF_MASKS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[1, 0, 1], [0, 1, 2], [3, 1, 1], [1, 2, 1], [3, 2, 2]],
  [[2, 0, 1], [0, 1, 2], [3, 1, 2], [1, 2, 2], [4, 2, 1], [2, 3, 1]],
  [[1, 0, 2], [0, 1, 1], [2, 1, 2], [5, 1, 1], [1, 2, 1], [4, 2, 2], [2, 3, 2]],
];

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
