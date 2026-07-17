import { describe, expect, test } from 'vitest';
import { FARMHAND_PROFILES, farmhandName } from '../../src/game/content/farmhands';

describe('farmhand identity content', () => {
  test('every hireable farmhand slot has a stable named profile', () => {
    expect(FARMHAND_PROFILES).toHaveLength(4);
    expect(FARMHAND_PROFILES.map((profile) => profile.id)).toEqual([1, 2, 3, 4]);
    const names = FARMHAND_PROFILES.map((profile) => profile.name);
    expect(names).toEqual(['Fern', 'Alder', 'Poppy', 'Rowan']);
    expect(new Set(names).size).toBe(names.length);
  });

  test('farmhandName projects ids to names without touching farm state', () => {
    expect(farmhandName(1)).toBe('Fern');
    expect(farmhandName(4)).toBe('Rowan');
    // Ids beyond the authored roster stay readable instead of throwing: a future
    // fifth farmhand renders as a plain numbered hand until authored.
    expect(farmhandName(5)).toBe('Farmhand 5');
    expect(farmhandName(0)).toBe('Farmhand 0');
  });
});
