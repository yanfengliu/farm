import type Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { buildFarmSceneryLayout } from './farmSceneryLayout';
import { pingPong } from './farmMotionMath';
import { coordinateHash } from './farmPixelPrimitives';
import { creekCenterX, drawCreekShimmer } from './farmWaterside';

export function drawFarmAmbience(
  water: Phaser.GameObjects.Graphics,
  effects: Phaser.GameObjects.Graphics,
  state: FarmState,
  tileSize: number,
  tick: number,
): void {
  drawCreekShimmer(water, state, tileSize, tick);
  drawDuckPair(water, state, tileSize, tick);
  drawSunMotes(effects, state, tileSize, tick);
  drawButterflies(effects, state, tileSize, tick);
  drawChimneySmoke(effects, state, tileSize, tick);
}

function drawDuckPair(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number, tick: number): void {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const travel = Math.max(90, state.height * tileSize - 80);
  const leadY = 42 + pingPong(tick * 2, travel);
  drawDuck(g, creekCenterX(layout.creek.centerX, leadY) + 11, leadY, tick);
  const secondY = 27 + pingPong(tick * 2, travel);
  drawDuck(g, creekCenterX(layout.creek.centerX, secondY) + 23, secondY, tick + 2);
}

function drawDuck(g: Phaser.GameObjects.Graphics, x: number, y: number, tick: number): void {
  const bob = tick % 4 < 2 ? 0 : 1;
  g.fillStyle(0x245d65, 0.34);
  g.fillRect(x - 7, y + 6 + bob, 14, 2);
  g.fillStyle(0xf3cd67, 1);
  g.fillRect(x - 5, y + bob, 10, 6);
  g.fillRect(x + 3, y - 4 + bob, 5, 5);
  g.fillStyle(0xffe596, 1);
  g.fillRect(x - 3, y + 1 + bob, 4, 2);
  g.fillStyle(0x4b713f, 1);
  g.fillRect(x + 3, y - 5 + bob, 5, 2);
  g.fillStyle(0x2c3328, 1);
  g.fillRect(x + 6, y - 2 + bob, 1, 1);
  g.fillStyle(0xe47a3f, 1);
  g.fillRect(x + 8, y - 1 + bob, 3, 2);
  g.fillStyle(0xb9e0d3, 0.55);
  g.fillRect(x - 12 - (tick % 3), y + 5 + bob, 5, 1);
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

function drawChimneySmoke(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number, tick: number): void {
  const { cottage } = buildFarmSceneryLayout(state.width, state.height, tileSize);
  const drift = positiveModulo(tick, 18);
  for (let index = 0; index < 4; index += 1) {
    const age = positiveModulo(drift + index * 5, 20);
    const size = 3 + Math.floor(age / 7);
    g.fillStyle(0xe7dfc8, Math.max(0.12, 0.48 - age * 0.015));
    g.fillRect(cottage.x + 47 + Math.floor(age / 5), cottage.y - 4 - age * 2, size, size - 1);
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
