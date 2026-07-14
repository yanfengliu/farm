import type Phaser from 'phaser';

export interface PixelStonePalette {
  shade: number;
  main: number;
  light: number;
  lichen: number;
  shadow: number;
}

const DEFAULT_STONE_PALETTE: PixelStonePalette = {
  shade: 0x59645a,
  main: 0x858b79,
  light: 0xb5b79a,
  lichen: 0x71834f,
  shadow: 0x40583d,
};

type StoneMask = readonly string[];

const STONE_MASKS = {
  '7x5': [
    ['..hh...', '.hmmm..', 'mmmlm..', 'dmmmmmd', '.ddcdd.'],
    ['...hh..', '..hmmmm', 'mmmlmmm', '.dmcmd.', '..ddd..'],
    ['.hh....', '.hmmmm.', 'mmmmlm.', '.dmmcmd', '..dddd.'],
  ],
  '11x6': [
    ['...hhm.....', '.hmmmmmm...', 'mmmmmlmmmm.', 'dmmmmmmmcdd', '.ddmmmmmdd.', '..dddddd...'],
    ['.......hh..', '....hmmmmm.', '..mmmmlmmmd', 'dmmmmmcmmmd', '..ddmmmddd.', '.....ddddd.'],
    ['.hhmm......', 'hmmmmmmm...', 'mmmmmmmlmmd', '.dmmmmcmmmd', '.ddmmmmmddd', '...ddddddd.'],
  ],
  '15x7': [
    [
      '....hhm........',
      '..hmmmmmm......',
      '.mmmmmlmmmmm...',
      'dmmmmmmcmmmmmd.',
      'ddmmmmmclmmmmdd',
      '..dddmmmmmddd..',
      '....ddddddd....',
    ],
    [
      '.........hh....',
      '......hmmmmm...',
      '....mmmmlmmmmd.',
      '..dmmmmmcmmmmmd',
      'ddmmmmmmmmdddd.',
      '....dddmmmddd..',
      '.......ddddd...',
    ],
    [
      '.hhmm..........',
      'hmmmmmmm.......',
      'mmmmmmmlmmmd...',
      'dmmmmmmcmmmmmmd',
      '.ddmmmmmmmdd...',
      '..dddmmmmddd...',
      '...dddddddd....',
    ],
  ],
} as const satisfies Record<string, readonly StoneMask[]>;

type StoneMaskSize = keyof typeof STONE_MASKS;
type StoneRole = 'c' | 'd' | 'h' | 'l' | 'm';

function stoneMask(width: number, height: number, variant: number): StoneMask {
  const key = `${width}x${height}` as StoneMaskSize;
  const masks = STONE_MASKS[key];
  if (!masks) throw new RangeError(`No pixel-stone masks authored for ${width}x${height}.`);

  const normalizedVariant = Math.abs(Math.trunc(variant));
  const source = masks[normalizedVariant % masks.length] ?? masks[0];
  if (!source || source.length !== height || source.some((row) => row.length !== width)) {
    throw new Error(`Invalid ${key} pixel-stone mask.`);
  }
  const mirrored = Math.floor(normalizedVariant / masks.length) % 2 === 1;
  return mirrored ? source.map((row) => [...row].reverse().join('')) : source;
}

function occupiedRange(row: string): { left: number; right: number } {
  const left = row.search(/[^.]/);
  let right = row.length - 1;
  while (right >= 0 && row[right] === '.') right -= 1;
  return { left: Math.max(0, left), right: Math.max(0, right) };
}

export function drawPixelStone(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  variant: number,
  palette: PixelStonePalette = DEFAULT_STONE_PALETTE,
): void {
  const mask = stoneMask(width, height, variant);
  const footprint = occupiedRange(mask.at(-1) ?? '');
  const footprintWidth = footprint.right - footprint.left + 1;
  const shadowDrift = Math.floor(Math.abs(variant) / 3) % 2;

  g.fillStyle(palette.shadow, 0.3);
  g.fillRect(x + footprint.left + shadowDrift, y + height, Math.max(1, footprintWidth - 1), 1);
  g.fillRect(x + footprint.left + 2 + shadowDrift, y + height + 1, Math.max(1, footprintWidth - 5), 1);

  const roles: ReadonlyArray<{ role: StoneRole; color: number; alpha: number }> = [
    { role: 'd', color: palette.shade, alpha: 1 },
    { role: 'c', color: palette.shade, alpha: 1 },
    { role: 'm', color: palette.main, alpha: 1 },
    { role: 'l', color: palette.lichen, alpha: 1 },
    { role: 'h', color: palette.light, alpha: 0.85 },
  ];

  for (const { role, color, alpha } of roles) {
    g.fillStyle(color, alpha);
    for (const [row, pixels] of mask.entries()) {
      for (let column = 0; column < pixels.length; column += 1) {
        if (pixels[column] === role) g.fillRect(x + column, y + row, 1, 1);
      }
    }
  }
}
