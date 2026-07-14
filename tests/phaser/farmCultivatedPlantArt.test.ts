import { describe, expect, test, vi } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { FarmRenderer } from '../../src/phaser/view/farmRenderer';
import {
  drawCarrotCrop,
  drawCloverPatch,
  drawPumpkinCrop,
  drawTomatoCrop,
  drawWheatCrop,
} from '../../src/phaser/view/farmCultivatedPlantArt';
import { drawCottageGarden } from '../../src/phaser/view/farmEnvironment';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
      Distance: { Between: () => 0 },
      Linear: (start: number, end: number, amount: number) => start + (end - start) * amount,
    },
  },
}));

interface RecordedFill {
  color: number;
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const CULTIVATED_FOLIAGE_COLORS = new Set([
  0x315f3c, 0x4b8c45, 0x4c9449, 0x598548, 0x5f673c, 0x78b45a, 0x79824a,
  0x79b85b, 0x7d884b, 0x86b966, 0xa5a45e, 0xa6a75e,
]);
const TOMATO_FRUIT_COLORS = new Set([0x823b32, 0xa85839, 0xd94b3f, 0xff7b64]);
const PUMPKIN_FRUIT_COLORS = new Set([0x8d3b25, 0xa94424, 0xc45d28, 0xe8752d, 0xf5a447]);
const WHEAT_STEM_COLORS = new Set([0x7d8e3c, 0x8b7741]);
const WHEAT_GRAIN_COLORS = new Set([0x849343, 0xaab153, 0xb88638, 0xe5b94f, 0xffdf79]);
const WHEAT_COLORS = new Set([...WHEAT_STEM_COLORS, ...WHEAT_GRAIN_COLORS]);

function recordDrawing(draw: (graphics: Parameters<typeof drawCottageGarden>[0]) => void): RecordedFill[] {
  const fills: RecordedFill[] = [];
  let color = 0;
  let alpha = 1;
  const graphics = {
    fillStyle(nextColor: number, nextAlpha = 1) {
      color = nextColor;
      alpha = nextAlpha;
      return graphics;
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ color, alpha, x, y, width, height });
      return graphics;
    },
  };
  draw(graphics as unknown as Parameters<typeof drawCottageGarden>[0]);
  return fills;
}

function recordMatureWheatFromRenderer(): RecordedFill[] {
  const layers: RecordedFill[][] = [];
  const scene = {
    add: {
      graphics: () => {
        const fills: RecordedFill[] = [];
        layers.push(fills);
        let color = 0;
        let alpha = 1;
        const graphics = new Proxy({}, {
          get: (_target, property) => {
            if (property === 'fillStyle') {
              return (nextColor: number, nextAlpha = 1) => {
                color = nextColor;
                alpha = nextAlpha;
                return graphics;
              };
            }
            if (property === 'fillRect') {
              return (x: number, y: number, width: number, height: number) => {
                fills.push({ color, alpha, x, y, width, height });
                return graphics;
              };
            }
            return () => graphics;
          },
        });
        return graphics;
      },
    },
  };
  const state = getFarmSnapshot(createFarmGame({ seed: 'production-wheat-art' }));
  state.width = 1;
  state.height = 1;
  state.tiles = {
    '0,0': { x: 0, y: 0, kind: 'plot', plot: { cropId: 'wheat', growth: 220, water: 1 } },
  };
  state.workers = [];
  const renderer = new FarmRenderer(scene as never);
  renderer.draw(state, null, 'inspect');
  return (layers[4] ?? []).filter((fill) => WHEAT_COLORS.has(fill.color));
}

function isFoliageGreen(fill: RecordedFill): boolean {
  const red = (fill.color >> 16) & 0xff;
  const green = (fill.color >> 8) & 0xff;
  const blue = fill.color & 0xff;
  return fill.alpha >= 0.8 && (CULTIVATED_FOLIAGE_COLORS.has(fill.color) || (green >= red + 7 && green >= blue + 14));
}

function containsSolidBlock(fills: RecordedFill[], width: number, height: number): boolean {
  const occupied = occupiedPixels(fills);
  if (occupied.size === 0) return false;
  const points = [...occupied].map((point) => point.split(',').map(Number));
  const xs = points.map(([x = 0]) => x);
  const ys = points.map(([, y = 0]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys) - height + 1; y += 1) {
    for (let x = Math.min(...xs); x <= Math.max(...xs) - width + 1; x += 1) {
      let solid = true;
      for (let dy = 0; dy < height && solid; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          if (!occupied.has(`${x + dx},${y + dy}`)) {
            solid = false;
            break;
          }
        }
      }
      if (solid) return true;
    }
  }
  return false;
}

function occupiedPixels(fills: RecordedFill[]): Set<string> {
  const occupied = new Set<string>();
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) occupied.add(`${x},${y}`);
    }
  }
  return occupied;
}

function coloredPixels(fills: RecordedFill[]): string[] {
  const pixels: string[] = [];
  for (const fill of fills) {
    for (let y = fill.y; y < fill.y + fill.height; y += 1) {
      for (let x = fill.x; x < fill.x + fill.width; x += 1) pixels.push(`${fill.color}:${fill.alpha}:${x},${y}`);
    }
  }
  return pixels.sort();
}

function connectedComponents(occupied: Set<string>): Set<string>[] {
  const unvisited = new Set(occupied);
  const components: Set<string>[] = [];
  while (unvisited.size > 0) {
    const first = unvisited.values().next().value as string;
    const component = new Set<string>();
    const pending = [first];
    unvisited.delete(first);
    while (pending.length > 0) {
      const point = pending.pop();
      if (!point) continue;
      component.add(point);
      const [x = 0, y = 0] = point.split(',').map(Number);
      for (const neighbor of [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`]) {
        if (!unvisited.delete(neighbor)) continue;
        pending.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function expectSteppedFruit(fills: RecordedFill[], colors: ReadonlySet<number>, label: string): void {
  const fruit = fills.filter((fill) => fill.alpha >= 0.8 && colors.has(fill.color));
  expect(fruit.length, `${label} fruit fills`).toBeGreaterThan(3);
  expect(fruit.every((fill) => fill.height <= 2), `${label} broad fruit fill`).toBe(true);
  const components = connectedComponents(occupiedPixels(fruit)).filter((component) => component.size >= 8);
  expect(components.length, `${label} fruit components`).toBeGreaterThan(0);
  for (const component of components) {
    const rows = new Map<number, number>();
    const xs: number[] = [];
    const ys: number[] = [];
    for (const point of component) {
      const [x = 0, y = 0] = point.split(',').map(Number);
      xs.push(x);
      ys.push(y);
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    const orderedRows = [...rows.entries()].sort(([left], [right]) => left - right);
    const widths = orderedRows.map(([, width]) => width);
    const widest = Math.max(...widths);
    const boundsArea = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    expect(widths[0] ?? 0, `${label} tapered top`).toBeLessThan(widest);
    expect(widths.at(-1) ?? 0, `${label} tapered bottom`).toBeLessThan(widest);
    expect(new Set(widths).size, `${label} row variation`).toBeGreaterThanOrEqual(2);
    expect(component.size / boundsArea, `${label} negative-space silhouette`).toBeLessThan(0.9);
  }
}

function expectLeafySilhouette(
  fills: RecordedFill[],
  label: string,
  predicate: (fill: RecordedFill) => boolean = isFoliageGreen,
): void {
  const foliage = fills.filter(predicate);
  expect(occupiedPixels(foliage).size, `${label} foliage pixels`).toBeGreaterThan(12);
  expect(
    foliage.every((fill) => fill.width <= 2 || fill.height <= 2 || fill.width * fill.height <= 8),
    `${label} broad green fill`,
  ).toBe(true);
  expect(containsSolidBlock(foliage, 6, 4), `${label} solid green mass`).toBe(false);
}

describe('cultivated plant pixel grammar', () => {
  test.each([0, 1, 2, 3])('renders wheat stage %i with staggered stems and separated kernels', (stage) => {
    for (const dry of [false, true]) {
      const fills = recordDrawing((graphics) => drawWheatCrop(graphics, 0, 0, stage, dry));
      const stemColor = dry ? 0x8b7741 : 0x7d8e3c;
      const stems = fills.filter((fill) => fill.color === stemColor);
      const grain = fills.filter((fill) => WHEAT_GRAIN_COLORS.has(fill.color));

      expect(occupiedPixels(stems).size, `wheat stems stage ${stage} dry=${dry}`).toBeGreaterThan(24);
      expect(stems.every((fill) => fill.width === 1 && fill.height === 1), 'one-pixel wheat stems').toBe(true);
      expect(containsSolidBlock(fills, 8, 3), `wheat stage ${stage} dry=${dry} solid mass`).toBe(false);
      if (stage === 0) expect(grain).toHaveLength(0);
      else expect(occupiedPixels(grain).size, `wheat kernels stage ${stage} dry=${dry}`).toBeGreaterThan(8);
    }
  });

  test.each([false, true])('renders mature wheat dry=%s with shaded, disconnected grain heads', (dry) => {
    const fills = recordDrawing((graphics) => drawWheatCrop(graphics, 0, 0, 3, dry));
    const grain = fills.filter((fill) => WHEAT_GRAIN_COLORS.has(fill.color));
    const grainColors = new Set(grain.map((fill) => fill.color));
    const heads = connectedComponents(occupiedPixels(grain)).filter((component) => component.size >= 6);

    expect(grainColors).toEqual(new Set([0xb88638, 0xe5b94f, 0xffdf79]));
    expect(grain.every((fill) => fill.width === 1 && fill.height === 1), 'one-pixel kernels').toBe(true);
    expect(heads, 'separated wheat heads').toHaveLength(5);
    expect(new Set(heads.map((head) => head.size)).size, 'head silhouette variation').toBeGreaterThan(1);
  });

  test('routes mature wheat through the cultivated crop renderer', () => {
    const productionWheat = recordMatureWheatFromRenderer();
    const directWheat = recordDrawing((graphics) => drawWheatCrop(graphics, 0, 0, 3, false));

    expect(productionWheat.length).toBeGreaterThan(12);
    expect(containsSolidBlock(productionWheat, 8, 3), 'mature wheat grain rectangle').toBe(false);
    expect(coloredPixels(productionWheat)).toEqual(coloredPixels(directWheat));
  });

  test.each([0, 1, 2, 3])('renders carrot stage %i with separated blades and a tapered root', (stage) => {
    for (const dry of [false, true]) {
      const fills = recordDrawing((graphics) => drawCarrotCrop(graphics, 0, 0, stage, dry));
      const foliage = fills.filter(isFoliageGreen);
      expectLeafySilhouette(fills, `carrot stage ${stage} dry=${dry}`);
      expect(
        foliage.every((fill) => fill.width === 1 || fill.height === 1),
        `carrot stage ${stage} dry=${dry} uses broad leaf posts`,
      ).toBe(true);

      if (stage >= 2) {
        const roots = fills.filter((fill) => [0xb95d2b, 0xe8752d, 0xffb45c].includes(fill.color));
        expect(roots.length).toBeGreaterThan(6);
        expect(roots.every((fill) => fill.height === 1)).toBe(true);
        expect(new Set(roots.map((fill) => fill.width)).size).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('renders the cottage cabbages as leafy rosettes', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'cottage-cabbage-art' }));
    const fills = recordDrawing((graphics) => drawCottageGarden(graphics, state, 32));
    const cabbageColors = new Set([0x315f3c, 0x5f934c, 0x6aa052, 0x77ad58, 0x9bc36d]);

    expectLeafySilhouette(fills, 'cottage garden', (fill) => fill.alpha >= 0.8 && cabbageColors.has(fill.color));
  });

  test.each([0, 1, 2, 3])('renders tomato stage %i with separated leaf clusters', (stage) => {
    for (const dry of [false, true]) {
      const fills = recordDrawing((graphics) => drawTomatoCrop(graphics, 0, 0, stage, dry));
      expectLeafySilhouette(fills, `tomato stage ${stage} dry=${dry}`);
      const shade = dry ? 0x5f673c : 0x315f3c;
      const stems = fills.filter((fill) => fill.width === 1 && fill.height >= 4);
      expect(stems.map((fill) => fill.color), `tomato stem colors stage ${stage} dry=${dry}`).toEqual(
        stage > 0 ? [shade, shade] : [shade],
      );
      if (stage >= 2) expectSteppedFruit(fills, TOMATO_FRUIT_COLORS, `tomato stage ${stage}`);
    }
  });

  test.each([0, 1, 2, 3])('renders pumpkin stage %i with a curling vine and cutout leaves', (stage) => {
    for (const dry of [false, true]) {
      const fills = recordDrawing((graphics) => drawPumpkinCrop(graphics, 0, 0, stage, dry));
      expectLeafySilhouette(fills, `pumpkin stage ${stage} dry=${dry}`);
      if (stage >= 2) expectSteppedFruit(fills, PUMPKIN_FRUIT_COLORS, `pumpkin stage ${stage}`);
    }
  });

  test.each([0, 1, 2])('renders clover variant %i as three separated heart leaves', (variant) => {
    const fills = recordDrawing((graphics) => drawCloverPatch(graphics, 10, 20, variant));
    expectLeafySilhouette(fills, `clover variant ${variant}`);
  });
});
