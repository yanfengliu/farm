export interface FarmhandProfile {
  id: number;
  name: string;
}

/**
 * Stable identities for the hireable farmhands, matched by worker id to the
 * outfit palettes the renderer already assigns. Names are projection-only:
 * they never enter FarmState or the save, so existing saves gain them with
 * no migration, the same way duck names read from authored content.
 */
export const FARMHAND_PROFILES: readonly FarmhandProfile[] = [
  { id: 1, name: 'Fern' },
  { id: 2, name: 'Alder' },
  { id: 3, name: 'Poppy' },
  { id: 4, name: 'Rowan' },
];

export function farmhandName(id: number): string {
  return FARMHAND_PROFILES.find((profile) => profile.id === id)?.name ?? `Farmhand ${id}`;
}
