import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { resolveFarmAnnotationTarget } from '../../src/phaser/view/farmAnnotationTarget';
import { buildFarmBotanyLayout } from '../../src/phaser/view/farmBotany';
import { SOUTHERN_MEADOW_VIGNETTES } from '../../src/phaser/view/farmEnvironment';
import { buildCreekLilyLayout } from '../../src/phaser/view/farmWaterside';
import { duckWorldPosition } from '../../src/phaser/view/farmWildlifeArt';

const TILE_SIZE = 32;

describe('annotation target picking', () => {
  test('prefers living and decorative subjects over the tile beneath them', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'annotation-targets' }));
    const duck = state.wildlife.ducks[0];
    const lily = buildCreekLilyLayout(state, TILE_SIZE)[0];
    const tree = buildFarmBotanyLayout(state.width, state.height, TILE_SIZE).trees[0];
    expect(duck).toBeDefined();
    expect(lily).toBeDefined();
    expect(tree).toBeDefined();

    expect(resolveFarmAnnotationTarget(state, duckWorldPosition(state, TILE_SIZE, duck), TILE_SIZE)).toMatchObject({
      kind: 'duck',
      entityId: `duck:${duck.id}`,
      label: duck.name,
    });
    expect(resolveFarmAnnotationTarget(state, { x: lily.x, y: lily.y }, TILE_SIZE)).toMatchObject({
      kind: 'lily-pad',
      label: 'Creek Lily Pad',
    });
    expect(resolveFarmAnnotationTarget(state, { x: tree.x, y: tree.y }, TILE_SIZE)).toMatchObject({
      kind: 'tree',
      label: expect.stringContaining('Tree'),
    });
  });

  test('falls back to an exact farm tile target', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'annotation-tile' }));
    state.tiles['3,2'] = { x: 3, y: 2, kind: 'well' };

    expect(resolveFarmAnnotationTarget(state, { x: 3.5 * TILE_SIZE, y: 2.5 * TILE_SIZE }, TILE_SIZE)).toMatchObject({
      kind: 'well',
      semanticId: 'tile:3,2',
      label: 'Well / 3,2',
      cell: { x: 3, y: 2 },
    });
  });

  test('identifies the east wild hedgerow instead of the meadow beneath it', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'annotation-hedgerow' }));

    expect(resolveFarmAnnotationTarget(state, { x: 494.5, y: 163.25 }, TILE_SIZE)).toMatchObject({
      kind: 'hedgerow',
      semanticId: 'hedgerow:east',
      label: 'Wild Hedgerow',
    });
  });
});

describe('southern vignette and farmhand naming', () => {
  test('names the authored wild-cell vignettes instead of anonymous wild land', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'vignette-targets' }));
    for (const vignette of SOUTHERN_MEADOW_VIGNETTES) {
      const worldPx = {
        x: vignette.cell.x * TILE_SIZE + TILE_SIZE / 2,
        y: vignette.cell.y * TILE_SIZE + TILE_SIZE / 2,
      };
      expect(state.tiles[`${vignette.cell.x},${vignette.cell.y}`]).toBeUndefined();
      expect(resolveFarmAnnotationTarget(state, worldPx, TILE_SIZE)).toMatchObject({
        kind: 'vignette',
        semanticId: `vignette:${vignette.id}`,
        label: vignette.label,
        cell: vignette.cell,
      });
    }
  });

  test('a purchased vignette cell falls back to the real tile because the story yields to land', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'vignette-owned' }));
    const hay = SOUTHERN_MEADOW_VIGNETTES[0];
    state.tiles[`${hay.cell.x},${hay.cell.y}`] = { x: hay.cell.x, y: hay.cell.y, kind: 'empty' };

    const worldPx = { x: hay.cell.x * TILE_SIZE + TILE_SIZE / 2, y: hay.cell.y * TILE_SIZE + TILE_SIZE / 2 };
    expect(resolveFarmAnnotationTarget(state, worldPx, TILE_SIZE)).toMatchObject({
      kind: 'empty',
      label: `Empty Land / ${hay.cell.x},${hay.cell.y}`,
    });
  });

  test('a note pinned on a farmhand uses their authored name', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'named-worker-target' }));
    const worker = state.workers[0];
    const worldPx = { x: worker.x * TILE_SIZE + TILE_SIZE / 2 - 9, y: worker.y * TILE_SIZE + TILE_SIZE / 2 - 10 };
    expect(resolveFarmAnnotationTarget(state, worldPx, TILE_SIZE)).toMatchObject({
      kind: 'worker',
      label: 'Fern',
    });
  });
});
