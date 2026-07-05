import { describe, expect, test } from 'vitest';
import { hasVisibleSellableCrops } from '../../scripts/llm-visual-loop/visible-state.mjs';

describe('LLM visual loop visible-state helpers', () => {
  test('does not mistake sell button quantities for crop inventory', () => {
    const visibleText = 'STORAGE 0/15 Inventory Carrot: 0 1 5 Wheat: 0 1 5 Tomato: 0 1 5 Sell All';

    expect(hasVisibleSellableCrops(visibleText)).toBe(false);
  });

  test('detects stored crops from storage and crop rows', () => {
    expect(hasVisibleSellableCrops('STORAGE 1/15 Inventory Carrot: 0 1 5')).toBe(true);
    expect(hasVisibleSellableCrops('STORAGE 0/15 Inventory Carrot: 2 1 5')).toBe(true);
  });
});
