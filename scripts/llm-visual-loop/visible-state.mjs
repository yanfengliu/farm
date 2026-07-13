export function hasVisibleSellableCrops(visibleText) {
  const text = String(visibleText ?? '');
  if (/\bSTORAGE\s+(?!0\/)\d+\/\d+\b/i.test(text)) return true;
  return /\b(?:Carrot|Wheat|Tomato):\s*(?!0\b)\d+\b/i.test(text);
}

const CROP_LABELS = {
  carrot: 'Carrot',
  wheat: 'Wheat',
  tomato: 'Tomato',
  pumpkin: 'Pumpkin',
};

const ZERO_SEED_PRIORITY = ['pumpkin', 'tomato', 'wheat', 'carrot'];

export function visibleSeedStock(visibleText, cropId) {
  const label = CROP_LABELS[cropId];
  if (!label) return null;
  const match = String(visibleText ?? '').match(new RegExp(`${label} seeds:\\s*(\\d+)`, 'i'));
  return match ? Number(match[1]) : null;
}

export function preferredVisibleZeroSeedCrop(visibleText) {
  return ZERO_SEED_PRIORITY.find((cropId) => visibleSeedStock(visibleText, cropId) === 0) ?? null;
}
