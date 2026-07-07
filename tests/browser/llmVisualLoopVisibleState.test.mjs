import { describe, expect, test } from 'vitest';
import {
  hasVisibleSellableCrops,
  preferredVisibleZeroSeedCrop,
  visibleSeedStock,
} from '../../scripts/llm-visual-loop/visible-state.mjs';

describe('LLM visual loop visible-state helpers', () => {
  test('does not mistake sell button quantities for crop inventory', () => {
    const visibleText = 'STORAGE 0/15 Inventory Carrot: 0 1 5 Wheat: 0 1 5 Tomato: 0 1 5 Sell All';

    expect(hasVisibleSellableCrops(visibleText)).toBe(false);
  });

  test('detects stored crops from storage and crop rows', () => {
    expect(hasVisibleSellableCrops('STORAGE 1/15 Inventory Carrot: 0 1 5')).toBe(true);
    expect(hasVisibleSellableCrops('STORAGE 0/15 Inventory Carrot: 2 1 5')).toBe(true);
  });

  test('reads visible seed stock for crop-specific Inventory rows', () => {
    const visibleText = 'Inventory Carrot seeds: 8 1c Wheat seeds: 0 2c Tomato seeds: 0 3c';

    expect(visibleSeedStock(visibleText, 'carrot')).toBe(8);
    expect(visibleSeedStock(visibleText, 'wheat')).toBe(0);
    expect(visibleSeedStock(visibleText, 'tomato')).toBe(0);
  });

  test('prefers later zero-stock seed rows over already stocked starter crops', () => {
    const visibleText = 'Inventory Carrot seeds: 8 1c Wheat seeds: 0 2c Tomato seeds: 0 3c';

    expect(preferredVisibleZeroSeedCrop(visibleText)).toBe('tomato');
  });
});
