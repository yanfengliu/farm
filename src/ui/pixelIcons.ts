import type { CropId } from '../game/content/crops';

export type IconName =
  | 'backpack'
  | 'basket'
  | 'bulldoze'
  | 'carrot'
  | 'claim'
  | 'coins'
  | 'farmhand' | 'flag'
  | 'gauge'
  | 'inspect'
  | 'land'
  | 'note'
  | 'package'
  | 'pause'
  | 'play'
  | 'plot'
  | 'pumpkin'
  | 'redo'
  | 'seed'
  | 'sliders'
  | 'storage'
  | 'tomato'
  | 'undo'
  | 'upgrade'
  | 'well'
  | 'wheat'
  | 'zap';
const iconPixels: Record<IconName, string[]> = {
  backpack: ['...####...', '..#....#..', '.########.', '.#.####.#.', '.#......#.', '.#.####.#.', '.#.#..#.#.', '.########.', '..#....#..', '..........'],
  basket: ['..........', '..#....#..', '.#......#.', '.########.', '##.#..#.##', '##########', '##.#..#.##', '.########.', '..........', '..........'],
  bulldoze: ['......##..', '.....##...', '....##....', '...##.....', '..#######.', '.#########', '.##..###..', '##....##..', '..........', '..........'],
  carrot: ['...#.#....', '..#####...', '...###....', '...###....', '...##.....', '..###.....', '..##......', '.##.......', '..........', '..........'],
  claim: ['...#..#...', '..######..', '.########.', '.##.##.##.', '.########.', '.##.##.##.', '.##.##.##.', '.########.', '..........', '..........'],
  coins: ['..####....', '.######...', '.##..##...', '.######...', '..####....', '...####...', '..######..', '..##..##..', '..######..', '..........'],
  farmhand: ['...####...', '..######..', '.########.', '...####...', '...####...', '....##....', '..######..', '.########.', '.##.##.##.', '..........'],
  flag: ['.##.......', '.######...', '.#######..', '.##...##..', '.######...', '.##.......', '.##.......', '.##.......', '.##.......', '..........'],
  gauge: ['..........', '..######..', '.##....##.', '##..##..##', '##....####', '##..#...##', '.########.', '...####...', '..........', '..........'],
  inspect: ['..####....', '.##..##...', '##.##.##..', '##.##.##..', '.##..##...', '..####....', '....##....', '.....##...', '......##..', '..........'],
  land: ['..........', '..........', '.....#....', '...#####..', '..#######.', '.#########', '##########', '##..##..##', '..........', '..........'],
  note: ['.########.', '.#......#.', '.#.####.#.', '.#......#.', '.#.###..#.', '.#......#.', '.#.##...#.', '.#....###.', '.######...', '..........'],
  package: ['..######..', '.########.', '##......##', '##########', '##..##..##', '##..##..##', '##########', '.##....##.', '..........', '..........'],
  pause: ['..........', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..........', '..........', '..........'],
  play: ['..........', '..##......', '..####....', '..######..', '..########', '..######..', '..####....', '..##......', '..........', '..........'],
  plot: ['..........', '.########.', '##......##', '##.##.##.#', '##......##', '##.##.##.#', '##......##', '.########.', '..#....#..', '..........'],
  pumpkin: ['..........', '....##....', '..######..', '.########.', '##########', '##########', '.########.', '..######..', '..........', '..........'],
  redo: ['..........', '....####..', '......##..', '..######..', '.##...##..', '..#####...', '..........', '..........', '..........', '..........'],
  seed: ['..........', '....##....', '...####...', '..######..', '..######..', '...####...', '....##....', '....##....', '..........', '..........'],
  sliders: ['##..######', '##..#.....', '##########', '....##....', '######..##', '....#...##', '##########', '..........', '..........', '..........'],
  storage: ['.########.', '##########', '##.####.##', '##########', '##..##..##', '##.####.##', '##########', '.########.', '..........', '..........'],
  tomato: ['....##....', '...####...', '..######..', '.########.', '##########', '##########', '.########.', '..######..', '..........', '..........'],
  undo: ['..........', '..####....', '..##......', '..######..', '..##...##.', '...#####..', '..........', '..........', '..........', '..........'],
  upgrade: ['....##....', '...####...', '..######..', '.########.', '....##....', '....##....', '..######..', '.########.', '..........', '..........'],
  well: ['..######..', '.##....##.', '##########', '##.####.##', '##.####.##', '.########.', '.##....##.', '..######..', '..........', '..........'],
  wheat: ['....##....', '...###....', '....###...', '...###....', '....###...', '...###....', '..####....', '....##....', '....##....', '..........'],
  zap: ['.....##...', '....##....', '...######.', '..#####...', '.....##...', '....##....', '...##.....', '..##......', '..........', '..........'],
};

const iconPalettes: Record<IconName, { primary: string; highlight: string; shadow: string }> = {
  backpack: { primary: '#9b6a43', highlight: '#d6a166', shadow: '#5b3826' },
  basket: { primary: '#b8793f', highlight: '#f0c06d', shadow: '#684323' },
  bulldoze: { primary: '#d9a441', highlight: '#ffe08a', shadow: '#7a5524' },
  carrot: { primary: '#f07f2f', highlight: '#6fc36a', shadow: '#9a4722' },
  claim: { primary: '#b993ff', highlight: '#ffe785', shadow: '#6d4ecf' },
  coins: { primary: '#e4a92f', highlight: '#ffe178', shadow: '#9b6721' },
  farmhand: { primary: '#4f86a6', highlight: '#f2c99c', shadow: '#c58a43' },
  flag: { primary: '#ff6f61', highlight: '#ffd2a6', shadow: '#8c3d42' },
  gauge: { primary: '#67b7dc', highlight: '#b8efff', shadow: '#315d7a' },
  inspect: { primary: '#8fd6ff', highlight: '#f1fbff', shadow: '#38627b' },
  land: { primary: '#6fb45c', highlight: '#b7e37a', shadow: '#3f6d37' },
  note: { primary: '#e7be7a', highlight: '#fff0ba', shadow: '#8c5c38' },
  package: { primary: '#c5874e', highlight: '#f2c27d', shadow: '#6f472c' },
  pause: { primary: '#d8d8d8', highlight: '#ffffff', shadow: '#8c8c8c' },
  play: { primary: '#83d778', highlight: '#c8ff9b', shadow: '#438f43' },
  plot: { primary: '#8b6036', highlight: '#7ccf6d', shadow: '#4f3422' },
  pumpkin: { primary: '#e8752d', highlight: '#82b84d', shadow: '#9b3f22' },
  redo: { primary: '#78b7ff', highlight: '#d5ecff', shadow: '#3f6bb2' },
  seed: { primary: '#d4a35b', highlight: '#86d66b', shadow: '#7a5932' },
  sliders: { primary: '#d6d6d6', highlight: '#8fd6ff', shadow: '#777777' },
  storage: { primary: '#b96f38', highlight: '#f3b96f', shadow: '#683c24' },
  tomato: { primary: '#df4b42', highlight: '#6fc36a', shadow: '#8a2d2d' },
  undo: { primary: '#78b7ff', highlight: '#d5ecff', shadow: '#3f6bb2' },
  upgrade: { primary: '#a989ff', highlight: '#ffe785', shadow: '#6247b8' },
  well: { primary: '#7f8793', highlight: '#79c9e8', shadow: '#4b5560' },
  wheat: { primary: '#d8a944', highlight: '#ffe28a', shadow: '#8a6428' },
  zap: { primary: '#f0c73b', highlight: '#fff08a', shadow: '#ad7620' },
};

export function iconSvg(name: IconName): string {
  const rows = iconPixels[name];
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  const rects = rows.flatMap((row, y) => (
    Array.from(row).map((cell, x) => (
      cell === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" fill="${iconPixelFill(name, x, y, width, height)}" />`
    ))
  )).join('');
  return `<svg class="button-icon pixel-icon" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">${rects}</svg>`;
}

function iconPixelFill(name: IconName, x: number, y: number, width: number, height: number): string {
  const palette = iconPalettes[name];
  if (name === 'carrot') return y <= 1 ? palette.highlight : y >= 5 ? palette.shadow : palette.primary;
  if (name === 'tomato') return y <= 1 ? palette.highlight : y >= 6 ? palette.shadow : palette.primary;
  if (name === 'pumpkin') return y <= 1 ? palette.highlight : y >= 6 || x <= 1 ? palette.shadow : palette.primary;
  if (name === 'wheat') return (x + y) % 3 === 0 ? palette.highlight : y >= 5 ? palette.shadow : palette.primary;
  if (name === 'seed') return y <= 2 ? palette.highlight : y >= 5 ? palette.shadow : palette.primary;
  if (name === 'well') return y === 3 || y === 4 ? palette.highlight : y >= 5 ? palette.shadow : palette.primary;
  if (name === 'storage' || name === 'package' || name === 'backpack' || name === 'basket') {
    if (y <= 1 || (x + y) % 5 === 0) return palette.highlight;
    if (y >= height - 3 || x === 0 || x === width - 1) return palette.shadow;
    return palette.primary;
  }
  if (name === 'plot' || name === 'land') return y <= 3 ? palette.highlight : y >= height - 2 ? palette.shadow : palette.primary;
  if (name === 'coins' || name === 'claim' || name === 'upgrade' || name === 'zap') {
    return y <= 2 ? palette.highlight : y >= height - 3 ? palette.shadow : palette.primary;
  }
  if (name === 'sliders') return x === 2 || x === 4 || y === 3 ? palette.highlight : palette.primary;
  if (name === 'pause' || name === 'play' || name === 'redo' || name === 'undo' || name === 'gauge' || name === 'inspect') {
    return y <= 1 ? palette.highlight : y >= height - 3 ? palette.shadow : palette.primary;
  }
  return y <= 2 ? palette.highlight : y >= height - 3 ? palette.shadow : palette.primary;
}

export function buttonContent(icon: IconName, label: string): string {
  return `${iconSvg(icon)}<span class="button-text">${label}</span>`;
}

export function toolbarButtonContent(icon: IconName, key: string, label: string): string {
  return `${iconSvg(icon)}<span class="key">${key}</span><span class="label">${label}</span>`;
}

export function cropIcon(cropId: CropId): IconName {
  if (cropId === 'carrot') return 'carrot';
  if (cropId === 'wheat') return 'wheat';
  if (cropId === 'tomato') return 'tomato';
  return 'pumpkin';
}
