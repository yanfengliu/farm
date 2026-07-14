import type Phaser from 'phaser';

export const PIXEL_LEAF_SPRAY_WIDTH = 7;
export const PIXEL_LEAF_SPRAY_HEIGHT = 5;

const LEAF_SPRAY_MASKS = [
  ['..mm...', '.dmmad.', 'dmm.mmd', '.dmmma.', '..dd...'],
  ['...md..', '.dmmd..', 'dmmammd', '.dmmm..', '..dda..'],
  ['..dm...', '.dmmmad', 'dmmma..', '.dm.mmd', '..dd...'],
  ['...dm..', '.dmmmd.', 'dmm.mma', '.dammmd', '...dd..'],
  ['..mmd..', 'dmmma..', '.dm.mmd', 'dmmmad.', '..dd...'],
  ['...md..', '.dmmmad', 'dmmm...', '.dmmmad', '..dd...'],
] as const;

export function drawPixelLeafSpray(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  main: number,
  accent: number,
  variant: number,
  shade = 0x284d38,
): void {
  const normalizedVariant = Math.abs(variant);
  const mask = LEAF_SPRAY_MASKS[normalizedVariant % LEAF_SPRAY_MASKS.length] ?? LEAF_SPRAY_MASKS[0];
  const mirrored = Math.floor(normalizedVariant / LEAF_SPRAY_MASKS.length) % 2 === 1;
  const colors = { d: shade, m: main, a: accent } as const;

  for (const role of ['d', 'm', 'a'] as const) {
    g.fillStyle(colors[role], 1);
    for (const [row, pixels] of mask.entries()) {
      for (let column = 0; column < pixels.length; column += 1) {
        const sourceColumn = mirrored ? pixels.length - 1 - column : column;
        if (pixels[sourceColumn] === role) g.fillRect(x + column, y + row, 1, 1);
      }
    }
  }
}
