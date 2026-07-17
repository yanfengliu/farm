import { describe, expect, test } from 'vitest';
import { createFarmGame, getFarmSnapshot } from '../../src/game/simulation/farmGame';
import { SOUTHERN_MEADOW_VIGNETTES } from '../../src/phaser/view/farmEnvironment';
import { inspectMarkup } from '../../src/ui/inspectPanel';

describe('inspecting wild meadow stories', () => {
  test('a wild vignette cell introduces the object instead of anonymous locked land', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'inspect-vignettes' }));
    for (const vignette of SOUTHERN_MEADOW_VIGNETTES) {
      expect(state.tiles[`${vignette.cell.x},${vignette.cell.y}`]).toBeUndefined();
      const markup = inspectMarkup(state, vignette.cell);
      expect(markup).toContain(vignette.label);
      expect(markup).toContain(vignette.description);
      expect(markup).toContain('Wild meadow story');
      // Purchase guidance must survive: the cell is still buyable land.
      expect(markup).toContain('Use Land on adjacent locked tiles');
      expect(markup).not.toContain('<h2>Locked Land</h2>');
    }
  });

  test('plain locked land keeps its original inspection', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'inspect-plain-locked' }));
    expect(state.tiles['10,3']).toBeUndefined();
    const markup = inspectMarkup(state, { x: 10, y: 3 });
    expect(markup).toContain('<h2>Locked Land</h2>');
    expect(markup).toContain('Not owned yet');
  });

  test('the beehive label uses plain language rather than jargon', () => {
    // A player note captured "Bee Skeps" and the player still asked what it was:
    // knowing the word "skep" cannot be a prerequisite for the label helping.
    const beehives = SOUTHERN_MEADOW_VIGNETTES.find((entry) => entry.id === 'bee-skeps');
    expect(beehives?.label).toBe('Straw Beehives');
    expect(SOUTHERN_MEADOW_VIGNETTES.every((entry) => entry.description.length > 0)).toBe(true);
  });
});
