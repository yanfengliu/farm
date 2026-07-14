import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { resolveFarmAnnotationTarget } from '../../src/phaser/view/farmAnnotationTarget';
import { buildFarmBotanyLayout } from '../../src/phaser/view/farmBotany';
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
