import type Phaser from 'phaser';
import type { CreekHabitatId, WildlifeNodeId } from '../../game/content/wildlife';
import type { FarmDuck, FarmState } from '../../game/simulation/farmGame';
import { buildFarmSceneryLayout } from './farmSceneryLayout';
import { farmGroveAnchors } from './farmEnvironment';
import { creekCenterX } from './farmWaterside';

interface PixelPoint {
  x: number;
  y: number;
}

export function drawFarmWildlife(
  water: Phaser.GameObjects.Graphics,
  actors: Phaser.GameObjects.Graphics,
  effects: Phaser.GameObjects.Graphics,
  state: FarmState,
  tileSize: number,
): void {
  if (!state.wildlife) return;
  drawFishHabitat(water, state, tileSize);
  for (const duck of state.wildlife.ducks) {
    const position = duckWorldPosition(state, tileSize, duck);
    const destination = duck.targetNode
      ? wildlifeNodeWorldPosition(state, tileSize, duck.targetNode, duck.id)
      : position;
    const facing = destination.x === position.x ? (duck.id % 2 === 0 ? -1 : 1) : Math.sign(destination.x - position.x);
    const layer = duckUsesLandLayer(duck) ? actors : water;
    drawDuck(layer, effects, duck, position, facing < 0 ? -1 : 1, state.tick);
  }
}

export function wildlifeNodeWorldPosition(
  state: FarmState,
  tileSize: number,
  node: WildlifeNodeId,
  inhabitantId = 0,
): PixelPoint {
  const layout = buildFarmSceneryLayout(state.width, state.height, tileSize);
  if (node === 'tree-shelter-elder' || node === 'tree-shelter-hazel') {
    const grove = farmGroveAnchors(state, tileSize)[0];
    const treeIndex = node === 'tree-shelter-elder' ? 0 : 1;
    const [dx = 0, dy = 0] = grove?.trees[treeIndex] ?? [0, 0];
    return { x: (grove?.x ?? layout.frame.left) + dx + 7, y: (grove?.y ?? layout.frame.top) + dy + 26 };
  }

  const nodeY: Record<CreekHabitatId, number> = {
    'creek-north': layout.frame.top + 62,
    'creek-mid-north': layout.creek.bridgeY - 68,
    'creek-mid-south': layout.creek.bridgeY + 68,
    'creek-south': layout.frame.bottom - 42,
  };
  const y = nodeY[node];
  const lane = [9, 22, 15, 25][positiveModulo(inhabitantId, 4)] ?? 15;
  return { x: creekCenterX(layout.creek.centerX, y) + lane, y };
}

export function duckWorldPosition(state: FarmState, tileSize: number, duck: FarmDuck): PixelPoint {
  const from = wildlifeNodeWorldPosition(state, tileSize, duck.node, duck.id);
  if (!duck.targetNode) return from;
  const to = wildlifeNodeWorldPosition(state, tileSize, duck.targetNode, duck.id);
  const progress = duck.travelProgress / 100;
  const eased = progress * progress * (3 - 2 * progress);
  return {
    x: Math.round(from.x + (to.x - from.x) * eased),
    y: Math.round(from.y + (to.y - from.y) * eased),
  };
}

function drawFishHabitat(g: Phaser.GameObjects.Graphics, state: FarmState, tileSize: number): void {
  for (const fish of state.wildlife.fish) {
    if (!fish.available) continue;
    const anchor = wildlifeNodeWorldPosition(state, tileSize, fish.node, fish.id + 4);
    const swim = ((state.tick + fish.id * 5) % 7) - 3;
    const x = anchor.x + swim;
    const y = anchor.y + 9 + (fish.id % 2);
    g.fillStyle(0x184f5a, 0.72);
    g.fillRect(x - 3, y, 6, 2);
    g.fillRect(x + (fish.id % 2 ? -5 : 3), y + 1, 3, 1);
    if ((state.tick + fish.id * 11) % 24 < 8) {
      g.fillStyle(0xb9e0d3, 0.8);
      g.fillRect(x - 1, y - 1, 3, 1);
    }
  }
}

function drawDuck(
  g: Phaser.GameObjects.Graphics,
  effects: Phaser.GameObjects.Graphics,
  duck: FarmDuck,
  position: PixelPoint,
  facing: -1 | 1,
  simulationTick: number,
): void {
  const x = position.x;
  const y = position.y;
  const body = duck.id % 2 === 0 ? 0xf0e1b7 : 0xf3cd67;
  const wing = duck.id % 2 === 0 ? 0xd6b77e : 0xffe596;
  const head = duck.id % 2 === 0 ? 0xb87955 : 0x4b713f;

  if (duck.activity === 'sleeping') {
    drawSleepingDuck(g, effects, x, y, body, wing, head, duck.id, simulationTick);
    return;
  }

  const bob = simulationTick % 6 < 3 ? 0 : 1;
  g.fillStyle(0x245d65, duck.activity === 'seeking-shelter' ? 0.18 : 0.34);
  g.fillRect(x - 7, y + 6 + bob, 14, 2);
  g.fillStyle(body, 1);
  g.fillRect(x - 5, y + bob, 10, 6);
  g.fillRect(x - 3, y - 2 + bob, 6, 4);
  g.fillStyle(wing, 1);
  g.fillRect(x - 3, y + 1 + bob, 5, 2);

  if (duck.activity === 'foraging' || duck.activity === 'eating') {
    const headX = x + facing * 5;
    g.fillStyle(head, 1);
    g.fillRect(headX - 2, y + 3 + bob, 5, 5);
    g.fillStyle(0xe47a3f, 1);
    g.fillRect(headX + (facing > 0 ? 2 : -4), y + 7 + bob, 4, 2);
    g.fillStyle(0xb9e0d3, 0.68);
    g.fillRect(headX - 7, y + 10 + bob, 14, 1);
    g.fillRect(headX - 4, y + 12 + bob, 8, 1);
    return;
  }

  const headX = x + facing * 5;
  g.fillStyle(head, 1);
  g.fillRect(headX - 2, y - 4 + bob, 5, 6);
  g.fillStyle(0x2c3328, 1);
  g.fillRect(headX + (facing > 0 ? 1 : -1), y - 2 + bob, 1, 1);
  g.fillStyle(0xe47a3f, 1);
  g.fillRect(headX + (facing > 0 ? 3 : -5), y - 1 + bob, 3, 2);
  if (duck.activity === 'roaming') {
    g.fillStyle(0xb9e0d3, 0.55);
    const wakeX = x - facing * (10 + (simulationTick % 3));
    g.fillRect(wakeX - (facing < 0 ? 5 : 0), y + 5 + bob, 5, 1);
  } else {
    g.fillStyle(0x755d37, 0.7);
    g.fillRect(x - 5, y + 7, 3, 1);
    g.fillRect(x + 2, y + 7, 3, 1);
  }
}

function drawSleepingDuck(
  g: Phaser.GameObjects.Graphics,
  effects: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  body: number,
  wing: number,
  head: number,
  id: number,
  simulationTick: number,
): void {
  g.fillStyle(0x35583b, 0.78);
  g.fillRect(x - 8, y + 5, 17, 4);
  g.fillStyle(0x8f7a46, 1);
  g.fillRect(x - 6, y + 3, 4, 2);
  g.fillRect(x + 4, y + 4, 4, 2);
  g.fillStyle(body, 1);
  g.fillRect(x - 6, y - 1, 12, 7);
  g.fillRect(x - 3, y - 3, 7, 4);
  g.fillStyle(wing, 1);
  g.fillRect(x - 3, y + 1, 6, 3);
  g.fillStyle(head, 1);
  g.fillRect(x + 1, y - 3, 5, 5);
  g.fillStyle(0x2c3328, 1);
  g.fillRect(x + 3, y - 1, 2, 1);
  if ((simulationTick + id * 2) % 20 < 12) {
    effects.fillStyle(0xffe9b0, 0.85);
    effects.fillRect(x + 8, y - 8, 2, 2);
    effects.fillRect(x + 11, y - 12, 3, 2);
  }
}

function duckUsesLandLayer(duck: FarmDuck): boolean {
  return duck.activity === 'sleeping' ||
    duck.activity === 'seeking-shelter' ||
    duck.node.startsWith('tree-shelter-') ||
    Boolean(duck.targetNode?.startsWith('tree-shelter-'));
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
