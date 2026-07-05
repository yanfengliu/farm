export function hasVisibleSellableCrops(visibleText) {
  const text = String(visibleText ?? '');
  if (/\bSTORAGE\s+(?!0\/)\d+\/\d+\b/i.test(text)) return true;
  return /\b(?:Carrot|Wheat|Tomato):\s*(?!0\b)\d+\b/i.test(text);
}
