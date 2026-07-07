import Phaser from 'phaser';
import './styles.css';
import { CROP_IDS, CROPS, type CropId } from './game/content/crops';
import { FARM_TIERS, FARM_TIER_LIST, type TierLevel } from './game/content/tiers';
import { UPGRADE_IDS, UPGRADES, type UpgradeId } from './game/content/upgrades';
import {
  advanceFarm,
  advanceFarmByMs,
  claimableTierLevel,
  createFarmGame,
  getFarmSnapshot,
  renderFarmToText,
  submitFarmCommand,
  type FarmCommand,
  type FarmGame,
  type FarmState,
  type FarmTile,
  type FarmWorker,
  type TileKind,
} from './game/simulation/farmGame';
import { clearFarmSave, loadSavedFarmState, saveFarmState } from './persistence/localSave';

type Tool = 'inspect' | 'plot' | 'well' | 'storage' | 'land' | 'bulldoze';
type Panel = 'inventory' | 'goals' | 'mix' | 'inspect';
type CropMixStatus = 'locked' | 'off' | 'no-seeds' | 'needs-plots' | 'ready';
type IconName =
  | 'backpack'
  | 'bulldoze'
  | 'carrot'
  | 'claim'
  | 'coins'
  | 'flag'
  | 'gauge'
  | 'inspect'
  | 'land'
  | 'package'
  | 'pause'
  | 'play'
  | 'plot'
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
type TutorialTip = {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  action: string;
  why: string;
  targetSelector: string;
};

type TutorialTipPlacement = 'above' | 'below' | 'side-left';

const TILE_SIZE = 32;
const PAN_SPEED = 420;
const PANEL_RENDER_INTERVAL_MS = 250;
const TUTORIAL_STORAGE_KEY = 'farm-tutorial-seen-v1';
const PANEL_WIDTH_STORAGE_KEY = 'farm-side-panel-width-v1';
const SPEED_STORAGE_KEY = 'farm-speed-v1';
const PANEL_WIDTH_DEFAULT = 320;
const PANEL_WIDTH_MIN = 300;
const PANEL_WIDTH_MAX = 560;
const PANEL_PLAYFIELD_MIN = 360;
const TUTORIAL_TIP_WIDTH = 320;
const TUTORIAL_MIN_VISIBLE_MS = 4500;
const TUTORIAL_VIEWPORT_PADDING = 8;
const TUTORIAL_TARGET_GAP = 12;

let farmGame: FarmGame = createFarmGame({ state: loadSavedFarmState() ?? undefined });
let selectedTool: Tool = 'inspect';
let activePanel: Panel = 'inventory';
let selectedCell: { x: number; y: number } | null = null;
let paused = false;
let speed = loadSpeed();
let lastSavedAt = 0;
let lastPaintKey = '';
let simulationRemainderMs = 0;
let panelCollapsed = false;
let lastHudMarkup = '';
let lastToolbarMarkup = '';
let lastPanelMarkup = '';
let lastRenderedPanel: Panel | null = null;
let lastRenderedCollapsed = false;
let lastPanelRenderedAt = 0;
let lastPanelStateSignature = '';
let lastTutorialMarkup = '';
let activeTutorialTip: TutorialTip | null = null;
let activeTutorialTipShownAt = 0;
let panelWidth = loadPanelWidth();
let panelResizeDrag: { pointerId: number; startX: number; startWidth: number } | null = null;
const seenTutorialTips = loadTutorialSeen();

const iconPixels: Record<IconName, string[]> = {
  backpack: ['...####...', '..#....#..', '.########.', '.#.####.#.', '.#......#.', '.#.####.#.', '.#.#..#.#.', '.########.', '..#....#..', '..........'],
  bulldoze: ['......##..', '.....##...', '....##....', '...##.....', '..#######.', '.#########', '.##..###..', '##....##..', '..........', '..........'],
  carrot: ['...#.#....', '..#####...', '...###....', '...###....', '...##.....', '..###.....', '..##......', '.##.......', '..........', '..........'],
  claim: ['...#..#...', '..######..', '.########.', '.##.##.##.', '.########.', '.##.##.##.', '.##.##.##.', '.########.', '..........', '..........'],
  coins: ['..####....', '.######...', '.##..##...', '.######...', '..####....', '...####...', '..######..', '..##..##..', '..######..', '..........'],
  flag: ['.##.......', '.######...', '.#######..', '.##...##..', '.######...', '.##.......', '.##.......', '.##.......', '.##.......', '..........'],
  gauge: ['..........', '..######..', '.##....##.', '##..##..##', '##....####', '##..#...##', '.########.', '...####...', '..........', '..........'],
  inspect: ['..####....', '.##..##...', '##.##.##..', '##.##.##..', '.##..##...', '..####....', '....##....', '.....##...', '......##..', '..........'],
  land: ['..........', '..........', '.....#....', '...#####..', '..#######.', '.#########', '##########', '##..##..##', '..........', '..........'],
  package: ['..######..', '.########.', '##......##', '##########', '##..##..##', '##..##..##', '##########', '.##....##.', '..........', '..........'],
  pause: ['..........', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..........', '..........', '..........'],
  play: ['..........', '..##......', '..####....', '..######..', '..########', '..######..', '..####....', '..##......', '..........', '..........'],
  plot: ['..........', '.########.', '##......##', '##.##.##.#', '##......##', '##.##.##.#', '##......##', '.########.', '..#....#..', '..........'],
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
  bulldoze: { primary: '#d9a441', highlight: '#ffe08a', shadow: '#7a5524' },
  carrot: { primary: '#f07f2f', highlight: '#6fc36a', shadow: '#9a4722' },
  claim: { primary: '#b993ff', highlight: '#ffe785', shadow: '#6d4ecf' },
  coins: { primary: '#e4a92f', highlight: '#ffe178', shadow: '#9b6721' },
  flag: { primary: '#ff6f61', highlight: '#ffd2a6', shadow: '#8c3d42' },
  gauge: { primary: '#67b7dc', highlight: '#b8efff', shadow: '#315d7a' },
  inspect: { primary: '#8fd6ff', highlight: '#f1fbff', shadow: '#38627b' },
  land: { primary: '#6fb45c', highlight: '#b7e37a', shadow: '#3f6d37' },
  package: { primary: '#c5874e', highlight: '#f2c27d', shadow: '#6f472c' },
  pause: { primary: '#d8d8d8', highlight: '#ffffff', shadow: '#8c8c8c' },
  play: { primary: '#83d778', highlight: '#c8ff9b', shadow: '#438f43' },
  plot: { primary: '#8b6036', highlight: '#7ccf6d', shadow: '#4f3422' },
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

function iconSvg(name: IconName): string {
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
  if (name === 'wheat') return (x + y) % 3 === 0 ? palette.highlight : y >= 5 ? palette.shadow : palette.primary;
  if (name === 'seed') return y <= 2 ? palette.highlight : y >= 5 ? palette.shadow : palette.primary;
  if (name === 'well') return y === 3 || y === 4 ? palette.highlight : y >= 5 ? palette.shadow : palette.primary;
  if (name === 'storage' || name === 'package' || name === 'backpack') {
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

function buttonContent(icon: IconName, label: string): string {
  return `${iconSvg(icon)}<span class="button-text">${label}</span>`;
}

function toolbarButtonContent(icon: IconName, key: string, label: string): string {
  return `${iconSvg(icon)}<span class="key">${key}</span><span class="label">${label}</span>`;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root');
}

app.innerHTML = `
  <div class="farm-shell">
    <header class="hud" id="hud"></header>
    <main class="play-area" id="play-area">
      <div id="game-canvas"></div>
      <aside class="side-panel" id="side-panel">
        <div
          class="panel-resizer"
          data-panel-resizer
          role="separator"
          tabindex="0"
          title="Drag to resize panel"
          aria-label="Resize side panel"
          aria-orientation="vertical"
          aria-valuemin="${PANEL_WIDTH_MIN}"
          aria-valuemax="${PANEL_WIDTH_MAX}"
          aria-valuenow="${panelWidth}"
        ></div>
        <div class="panel-tabs">
          <button data-panel="inventory" title="Inventory" aria-label="Inventory">${buttonContent('backpack', 'Inventory')}</button>
          <button data-panel="goals" title="Goals" aria-label="Goals">${buttonContent('flag', 'Goals')}</button>
          <button data-panel="mix" title="Crop Mix" aria-label="Crop Mix">${buttonContent('sliders', 'Mix')}</button>
          <button data-panel="inspect" title="Inspect" aria-label="Inspect">${buttonContent('inspect', 'Inspect')}</button>
          <button class="panel-toggle" data-command="toggle-panel" title="Collapse panel" aria-label="Collapse panel">${iconSvg('redo')}</button>
        </div>
        <div class="panel-content" id="panel-content"></div>
      </aside>
    </main>
    <footer class="toolbar" id="toolbar"></footer>
    <div class="tutorial-layer" id="tutorial-layer"></div>
  </div>
`;

const hud = requireElement<HTMLDivElement>('#hud');
const toolbar = requireElement<HTMLDivElement>('#toolbar');
const panelContent = requireElement<HTMLDivElement>('#panel-content');
const canvasHost = requireElement<HTMLDivElement>('#game-canvas');
const playArea = requireElement<HTMLElement>('#play-area');
const sidePanel = requireElement<HTMLElement>('#side-panel');
const panelResizer = requireElement<HTMLElement>('[data-panel-resizer]');
const tutorialLayer = requireElement<HTMLDivElement>('#tutorial-layer');

applyPanelWidth();

const tools: Array<{ id: Tool; key: string; label: string; icon: IconName }> = [
  { id: 'inspect', key: 'I', label: 'Inspect', icon: 'inspect' },
  { id: 'plot', key: '1', label: 'Plot', icon: 'plot' },
  { id: 'well', key: '2', label: 'Well', icon: 'well' },
  { id: 'storage', key: '3', label: 'Storage', icon: 'storage' },
  { id: 'land', key: '4', label: 'Land', icon: 'land' },
  { id: 'bulldoze', key: 'B', label: 'Bulldoze', icon: 'bulldoze' },
  { id: 'inspect', key: 'Z', label: 'Undo', icon: 'undo' },
  { id: 'inspect', key: 'Y', label: 'Redo', icon: 'redo' },
];

class FarmScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private readonly workerVisuals = new Map<number, { x: number; y: number }>();

  constructor() {
    super('FarmScene');
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor('#17130f');
    this.cameras.main.setZoom(1.45);
    this.cameras.main.centerOn(160, 120);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) return;
      lastPaintKey = '';
      this.applyPointerTool(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || selectedTool === 'inspect' || selectedTool === 'well' || selectedTool === 'storage') return;
      this.applyPointerTool(pointer);
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom + (dy > 0 ? -0.08 : 0.08), 0.65, 2.8));
    });
  }

  update(_time: number, delta: number): void {
    this.updateCamera(delta);
    if (!paused) {
      advanceRealtime(delta * speed);
    }
    this.autosave();
    this.drawFarm();
    renderHud();
    renderToolbar();
    renderPanel();
    renderTutorialTip();
  }

  private autosave(): void {
    const now = performance.now();
    if (now - lastSavedAt < 1000) return;
    saveFarmState(getFarmSnapshot(farmGame));
    lastSavedAt = now;
  }

  private updateCamera(delta: number): void {
    const camera = this.cameras.main;
    const distance = (PAN_SPEED * delta) / 1000 / camera.zoom;
    if (this.cursors.left.isDown || this.wasd.A.isDown) camera.scrollX -= distance;
    if (this.cursors.right.isDown || this.wasd.D.isDown) camera.scrollX += distance;
    if (this.cursors.up.isDown || this.wasd.W.isDown) camera.scrollY -= distance;
    if (this.cursors.down.isDown || this.wasd.S.isDown) camera.scrollY += distance;
  }

  private applyPointerTool(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(world.x / TILE_SIZE);
    const y = Math.floor(world.y / TILE_SIZE);
    const key = `${selectedTool}:${x},${y}`;
    if (key === lastPaintKey) return;
    lastPaintKey = key;
    selectedCell = { x, y };

    const command = commandForTool(selectedTool, x, y);
    if (command) {
      submitFarmCommand(farmGame, command);
    }
  }

  private drawFarm(): void {
    const state = getFarmSnapshot(farmGame);
    const g = this.graphics;
    g.clear();

    g.fillStyle(0x17130f, 1);
    g.fillRect(0, 0, state.width * TILE_SIZE, state.height * TILE_SIZE);

    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const tile = state.tiles[`${x},${y}`];
        this.drawTile(g, x, y, tile);
      }
    }

    const activeWorkerIds = new Set<number>();
    for (const worker of state.workers) {
      activeWorkerIds.add(worker.id);
      const position = this.workerVisualPosition(worker);
      this.drawWorker(g, state, worker, position.x, position.y);
    }
    for (const workerId of this.workerVisuals.keys()) {
      if (!activeWorkerIds.has(workerId)) {
        this.workerVisuals.delete(workerId);
      }
    }

    if (selectedCell) {
      g.lineStyle(3, 0xfff0a8, 1);
      g.strokeRect(selectedCell.x * TILE_SIZE + 2, selectedCell.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
  }

  private drawTile(g: Phaser.GameObjects.Graphics, x: number, y: number, tile: FarmTile | undefined): void {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    if (!tile) {
      this.drawLockedLand(g, px, py, x, y);
      return;
    }

    g.fillStyle(colorForTile(tile, x, y), 1);
    g.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
    this.drawGroundTexture(g, px, py, x, y, tile);
    g.fillStyle(0xffffff, tile.kind === 'empty' ? 0.045 : 0.035);
    g.fillRect(px + 1, py + 1, TILE_SIZE - 3, 1);
    g.fillStyle(0x000000, tile.kind === 'empty' ? 0.16 : 0.22);
    g.fillRect(px + 1, py + TILE_SIZE - 3, TILE_SIZE - 3, 2);
    g.fillRect(px + TILE_SIZE - 3, py + 1, 2, TILE_SIZE - 4);
    g.lineStyle(1, 0x26301f, 0.86);
    g.strokeRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);

    if (tile.kind === 'plot') {
      this.drawPlot(g, px, py, tile);
    } else if (tile.kind === 'well') {
      this.drawWell(g, px, py);
    } else if (tile.kind === 'storage') {
      this.drawStorage(g, px, py);
    }
  }

  private drawLockedLand(g: Phaser.GameObjects.Graphics, px: number, py: number, x: number, y: number): void {
    g.fillStyle(tileVariant(x, y, [0x171512, 0x1c1915, 0x120f0d]), 1);
    g.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
    g.lineStyle(1, 0x28231d, 0.72);
    g.strokeRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
    g.fillStyle(tileVariant(x, y, [0x26221c, 0x2d2922, 0x201c17]), 1);
    if ((x + y) % 3 === 0) g.fillRect(px + 13, py + 13, 5, 5);
    if ((x * 5 + y) % 4 === 0) {
      g.fillRect(px + 6, py + 21, 2, 5);
      g.fillRect(px + 9, py + 23, 4, 2);
    }
    if ((x * 7 + y) % 5 === 0) {
      g.fillStyle(0x3b352c, 1);
      g.fillRect(px + 22, py + 8, 5, 3);
      g.fillStyle(0x5b5144, 1);
      g.fillRect(px + 23, py + 8, 2, 1);
    }
  }

  private drawPlot(g: Phaser.GameObjects.Graphics, px: number, py: number, tile: FarmTile): void {
    g.fillStyle(0x72482d, 1);
    g.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    g.fillStyle(0x53321f, 1);
    g.fillRect(px + 4, py + 4, TILE_SIZE - 8, 2);
    g.fillRect(px + 4, py + 26, TILE_SIZE - 8, 2);
    g.fillRect(px + 4, py + 4, 2, TILE_SIZE - 8);
    g.fillRect(px + 26, py + 4, 2, TILE_SIZE - 8);
    g.fillStyle(0x8a5c35, 1);
    g.fillRect(px + 6, py + 7, TILE_SIZE - 12, 3);
    g.fillRect(px + 6, py + 14, TILE_SIZE - 12, 3);
    g.fillRect(px + 6, py + 21, TILE_SIZE - 12, 3);
    g.fillStyle(0x9d7044, 1);
    g.fillRect(px + 8, py + 8, 7, 1);
    g.fillRect(px + 17, py + 15, 8, 1);
    g.fillRect(px + 9, py + 22, 6, 1);
    if (!tile.plot) {
      g.fillStyle(0x4d2f1e, 1);
      g.fillRect(px + 10, py + 10, 12, 3);
      g.fillRect(px + 9, py + 18, 14, 3);
      g.fillStyle(0xc09255, 1);
      g.fillRect(px + 12, py + 11, 2, 1);
      g.fillRect(px + 19, py + 19, 2, 1);
      return;
    }

    const crop = CROPS[tile.plot.cropId];
    const ready = tile.plot.growth >= crop.growTicks;
    const needsWater = tile.plot.water <= 0;
    const growthRatio = Math.min(1, tile.plot.growth / crop.growTicks);
    this.drawCrop(g, px, py, tile.plot.cropId, growthRatio, ready, needsWater);
    if (needsWater && !ready) {
      g.fillStyle(0x5fa8d3, 1);
      g.fillRect(px + 24, py + 6, 3, 7);
      g.fillStyle(0x9bc8de, 1);
      g.fillRect(px + 23, py + 11, 5, 3);
    }
  }

  private drawGroundTexture(
    g: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    x: number,
    y: number,
    tile: FarmTile,
  ): void {
    if (tile.kind !== 'empty') return;
    const tuftColor = tileVariant(x, y, [0x7fb06a, 0x93bd74, 0x5d8a4e]);
    g.fillStyle(tuftColor, 0.85);
    if ((x * 3 + y) % 2 === 0) {
      g.fillRect(px + 7, py + 9, 2, 7);
      g.fillRect(px + 9, py + 12, 3, 2);
      g.fillRect(px + 5, py + 14, 3, 2);
    }
    if ((x + y * 5) % 3 === 0) {
      g.fillRect(px + 21, py + 20, 5, 2);
      g.fillRect(px + 23, py + 17, 2, 4);
    }
    if ((x * 7 + y) % 4 === 0) {
      g.fillStyle(0xdac16c, 1);
      g.fillRect(px + 15, py + 6, 2, 2);
      g.fillStyle(0x6b9955, 1);
      g.fillRect(px + 14, py + 8, 4, 1);
    }
    if ((x * 11 + y) % 5 === 0) {
      g.fillStyle(0x4f6f4c, 1);
      g.fillRect(px + 24, py + 7, 4, 3);
      g.fillStyle(0x89a374, 1);
      g.fillRect(px + 25, py + 7, 2, 1);
    }
  }

  private drawWell(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
    g.fillStyle(0x2f3f49, 1);
    g.fillRect(px + 6, py + 13, 20, 13);
    g.fillStyle(0x758895, 1);
    g.fillRect(px + 8, py + 10, 16, 16);
    g.fillStyle(0xa5b8bd, 1);
    g.fillRect(px + 10, py + 12, 12, 2);
    g.fillRect(px + 8, py + 15, 3, 5);
    g.fillRect(px + 21, py + 15, 3, 5);
    g.fillStyle(0x4c6471, 1);
    g.fillRect(px + 11, py + 21, 10, 4);
    g.fillStyle(0x1f638d, 1);
    g.fillRect(px + 12, py + 15, 8, 7);
    g.fillStyle(0x79c7df, 1);
    g.fillRect(px + 14, py + 16, 4, 2);
    g.fillStyle(0x6f442c, 1);
    g.fillRect(px + 6, py + 6, 3, 8);
    g.fillRect(px + 23, py + 6, 3, 8);
    g.fillRect(px + 7, py + 5, 18, 3);
    g.fillStyle(0xa96e3f, 1);
    g.fillRect(px + 9, py + 3, 14, 3);
    g.fillStyle(0x3c2a1e, 1);
    g.fillRect(px + 15, py + 7, 2, 7);
    g.fillStyle(0x9a7552, 1);
    g.fillRect(px + 14, py + 13, 4, 3);
  }

  private drawStorage(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
    g.fillStyle(0x5d3420, 1);
    g.fillRect(px + 5, py + 9, 22, 18);
    g.fillStyle(0xbb7c44, 1);
    g.fillRect(px + 7, py + 11, 18, 14);
    g.fillStyle(0x7a4428, 1);
    g.fillRect(px + 7, py + 15, 18, 3);
    g.fillRect(px + 7, py + 22, 18, 2);
    g.fillRect(px + 14, py + 11, 3, 14);
    g.fillStyle(0xd8a45f, 1);
    g.fillRect(px + 9, py + 12, 4, 2);
    g.fillRect(px + 19, py + 19, 4, 2);
    g.fillStyle(0x3d261a, 1);
    g.fillRect(px + 5, py + 8, 22, 3);
    g.fillRect(px + 9, py + 17, 14, 2);
    g.fillStyle(0xc4aa77, 1);
    g.fillRect(px + 4, py + 19, 5, 7);
    g.fillStyle(0x8f7650, 1);
    g.fillRect(px + 5, py + 23, 3, 1);
  }

  private drawCrop(
    g: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    cropId: CropId,
    growthRatio: number,
    ready: boolean,
    needsWater: boolean,
  ): void {
    const leaf = needsWater ? 0x8b9b57 : ready ? 0x4f9d4f : 0x65b85e;
    const crop = cropColor(cropId, ready, needsWater);
    const stemHeight = Math.max(4, Math.floor(5 + growthRatio * 9));
    if (cropId === 'carrot') {
      for (const xOffset of [10, 16, 22]) {
        const top = py + 22 - Math.floor(growthRatio * 8);
        g.fillStyle(leaf, 1);
        g.fillRect(px + xOffset - 1, top, 2, 6);
        g.fillRect(px + xOffset - 4, top + 2, 4, 2);
        g.fillRect(px + xOffset + 1, top + 1, 4, 2);
        g.fillStyle(0x3f7f3e, 1);
        g.fillRect(px + xOffset, top + 3, 1, 3);
        if (ready || growthRatio > 0.62) {
          g.fillStyle(crop, 1);
          g.fillRect(px + xOffset - 2, py + 21, 4, ready ? 7 : 4);
          g.fillStyle(0xf4ad62, 1);
          g.fillRect(px + xOffset - 1, py + 22, 2, 2);
        }
      }
    } else if (cropId === 'wheat') {
      g.fillStyle(0x896a2f, 1);
      for (const xOffset of [9, 13, 17, 21]) {
        const height = Math.floor(6 + growthRatio * 10);
        const top = py + 25 - height;
        g.fillRect(px + xOffset, top, 2, height);
        g.fillStyle(crop, 1);
        g.fillRect(px + xOffset - 2, top, 6, ready ? 4 : 2);
        g.fillStyle(0xf2d87a, 1);
        if (ready) g.fillRect(px + xOffset - 1, top + 1, 2, 1);
        g.fillStyle(0x896a2f, 1);
      }
    } else {
      g.fillStyle(0x5d4b2d, 1);
      g.fillRect(px + 10, py + 9, 2, 16);
      g.fillRect(px + 21, py + 9, 2, 16);
      g.fillRect(px + 10, py + 10, 13, 2);
      g.fillStyle(leaf, 1);
      g.fillRect(px + 12, py + 16 - Math.floor(stemHeight / 3), 9, 3);
      g.fillRect(px + 15, py + 13 - Math.floor(stemHeight / 4), 5, 6);
      g.fillStyle(crop, 1);
      if (growthRatio > 0.35) g.fillRect(px + 12, py + 17, ready ? 5 : 3, ready ? 5 : 3);
      if (growthRatio > 0.55) g.fillRect(px + 19, py + 15, ready ? 5 : 3, ready ? 5 : 3);
      if (ready) {
        g.fillStyle(0xff7767, 1);
        g.fillRect(px + 13, py + 18, 2, 1);
        g.fillRect(px + 20, py + 16, 2, 1);
      }
    }
  }

  private drawWorker(
    g: Phaser.GameObjects.Graphics,
    state: FarmState,
    worker: FarmWorker,
    px: number,
    py: number,
  ): void {
    const task = worker.task.kind;
    const cargo = worker.cargo?.kind;
    const bob = task === 'idle' ? 0 : state.tick % 8 < 4 ? -1 : 0;
    const drawY = py + bob;
    g.fillStyle(0x2a1d16, 0.25);
    g.fillRect(px - 8, drawY + 8, 16, 3);
    g.fillStyle(0x5f8fb0, 1);
    g.fillRect(px - 5, drawY - 2, 10, 12);
    g.fillStyle(task === 'idle' ? 0xf5d58f : 0xf0b85d, 1);
    g.fillRect(px - 4, drawY - 3, 8, 5);
    g.fillStyle(0x3d5f7b, 1);
    g.fillRect(px - 4, drawY + 4, 3, 6);
    g.fillRect(px + 1, drawY + 4, 3, 6);
    g.fillStyle(0xffdfb0, 1);
    g.fillRect(px - 4, drawY - 10, 8, 8);
    g.fillStyle(0x2f2119, 1);
    g.fillRect(px - 2, drawY - 7, 1, 1);
    g.fillRect(px + 2, drawY - 7, 1, 1);
    g.fillRect(px - 1, drawY - 4, 3, 1);
    g.fillStyle(0x5c351e, 1);
    g.fillRect(px - 6, drawY - 12, 12, 4);
    g.fillRect(px - 3, drawY - 14, 6, 3);
    g.fillStyle(0x3a2820, 1);
    g.fillRect(px - 5, drawY + 10, 4, 4);
    g.fillRect(px + 1, drawY + 10, 4, 4);
    g.fillStyle(0xffdfb0, 1);
    g.fillRect(px - 8, drawY, 3, 6);
    g.fillRect(px + 5, drawY, 3, 6);
    if (cargo) {
      g.fillStyle(cargo === 'water' ? 0x62a9c8 : cargo === 'seed' ? 0xb98648 : 0xe08a3a, 1);
      if (cargo === 'water') {
        g.fillRect(px + 6, drawY + 2, 5, 6);
        g.fillStyle(0xa7d8e5, 1);
        g.fillRect(px + 7, drawY + 3, 3, 1);
      } else if (cargo === 'seed') {
        g.fillRect(px + 6, drawY + 2, 5, 6);
        g.fillStyle(0xf0ca74, 1);
        g.fillRect(px + 7, drawY + 3, 1, 1);
        g.fillRect(px + 9, drawY + 5, 1, 1);
      } else {
        g.fillRect(px + 6, drawY + 1, 6, 7);
        g.fillStyle(0x7a4a28, 1);
        g.fillRect(px + 6, drawY, 6, 2);
      }
    } else if (task === 'harvesting') {
      g.fillStyle(0x8c6a3d, 1);
      g.fillRect(px + 7, drawY - 2, 2, 10);
      g.fillStyle(0xd8c07c, 1);
      g.fillRect(px + 8, drawY - 3, 5, 2);
    }
  }

  private workerVisualPosition(worker: FarmWorker): { x: number; y: number } {
    const target = workerTargetPosition(worker);
    const current = this.workerVisuals.get(worker.id);
    if (!current || Phaser.Math.Distance.Between(current.x, current.y, target.x, target.y) > TILE_SIZE * 1.5) {
      const next = { ...target };
      this.workerVisuals.set(worker.id, next);
      return next;
    }

    current.x = Phaser.Math.Linear(current.x, target.x, 0.35);
    current.y = Phaser.Math.Linear(current.y, target.y, 0.35);
    return current;
  }
}

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: canvasHost,
  width: canvasHost.clientWidth,
  height: canvasHost.clientHeight,
  backgroundColor: '#17130f',
  pixelArt: true,
  audio: {
    noAudio: true,
  },
  scene: FarmScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: canvasHost,
  },
});

function commandForTool(tool: Tool, x: number, y: number): FarmCommand | null {
  switch (tool) {
    case 'inspect':
      activePanel = 'inspect';
      return null;
    case 'plot':
      return { type: 'paintTile', x, y, tile: 'plot' };
    case 'well':
      return { type: 'placeBuilding', x, y, building: 'well' };
    case 'storage':
      return { type: 'placeBuilding', x, y, building: 'storage' };
    case 'land':
      return { type: 'buyLand', x, y };
    case 'bulldoze':
      return { type: 'bulldoze', x, y };
  }
}

function renderHud(): void {
  const state = getFarmSnapshot(farmGame);
  const storage = `${storedCropCount(state)}/${state.inventory.cropCapacity}`;
  const markup = `
    <div><strong>Coins</strong><span>${state.coins}</span></div>
    <div><strong>Storage</strong><span>${storage}</span></div>
    <div><strong>Workers</strong><span>${state.workers.length}</span></div>
    <div><strong>Tier</strong><span>${state.tier.level} ${state.tier.label}</span></div>
    <div><strong>Tool</strong><span>${labelForTool(selectedTool)}</span></div>
    <div><strong>Speed</strong><span>${paused ? 'Paused' : `${speed}x`}</span></div>
    <div class="hud-alert">${state.alerts[0] ?? state.tier.nextMilestone}</div>
  `;
  if (markup !== lastHudMarkup) {
    hud.innerHTML = markup;
    lastHudMarkup = markup;
  }
}

function renderToolbar(): void {
  const toolButtons = tools.map((tool) => {
    if (tool.key === 'Z' || tool.key === 'Y') {
      const command = tool.key === 'Z' ? 'undo' : 'redo';
      return `<button class="tool-button" data-command="${command}" title="${tool.label} (${tool.key})" aria-label="${tool.label}">${toolbarButtonContent(tool.icon, tool.key, tool.label)}</button>`;
    }
    return `<button class="tool-button ${selectedTool === tool.id ? 'active' : ''}" data-tool="${tool.id}" title="${tool.label} (${tool.key})" aria-label="${tool.label}">${toolbarButtonContent(tool.icon, tool.key, tool.label)}</button>`;
  }).join('');
  const speedButtons = [
    `<button class="tool-button ${paused ? 'active' : ''}" data-command="pause" title="${paused ? 'Resume' : 'Pause'} (Space)" aria-label="${paused ? 'Resume' : 'Pause'}">${toolbarButtonContent(paused ? 'play' : 'pause', 'Space', paused ? 'Resume' : 'Pause')}</button>`,
    `<button class="tool-button ${!paused && speed === 1 ? 'active' : ''}" data-speed="1" title="1x speed (0)" aria-label="1x speed">${toolbarButtonContent('gauge', '0', '1x')}</button>`,
    `<button class="tool-button ${!paused && speed === 2 ? 'active' : ''}" data-speed="2" title="2x speed (-)" aria-label="2x speed">${toolbarButtonContent('zap', '-', '2x')}</button>`,
    `<button class="tool-button ${!paused && speed === 4 ? 'active' : ''}" data-speed="4" title="4x speed (=)" aria-label="4x speed">${toolbarButtonContent('zap', '=', '4x')}</button>`,
  ].join('');
  const markup = toolButtons + speedButtons;
  if (markup !== lastToolbarMarkup) {
    toolbar.innerHTML = markup;
    lastToolbarMarkup = markup;
  }
}

function renderPanel(): void {
  playArea.classList.toggle('panel-collapsed', panelCollapsed);
  const toggle = document.querySelector<HTMLButtonElement>('.panel-toggle');
  if (toggle) {
    toggle.innerHTML = iconSvg(panelCollapsed ? 'undo' : 'redo');
    toggle.title = panelCollapsed ? 'Expand panel' : 'Collapse panel';
    toggle.setAttribute('aria-label', toggle.title);
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-panel]')) {
    button.classList.toggle('active', button.dataset.panel === activePanel);
  }

  const now = performance.now();
  const state = getFarmSnapshot(farmGame);
  const panelSignature = panelStateSignature(state);
  const forceRender = (
    activePanel !== lastRenderedPanel ||
    panelCollapsed !== lastRenderedCollapsed ||
    panelSignature !== lastPanelStateSignature
  );
  if (!forceRender && now - lastPanelRenderedAt < PANEL_RENDER_INTERVAL_MS) return;

  let markup = '';
  if (activePanel === 'inventory') {
    const hasSellableCrops = storedCropCount(state) > 0;
    markup = `
      <h2>Inventory</h2>
      ${CROP_IDS.map((id) => inventoryRow(state, id)).join('')}
      <h3>Seeds</h3>
      ${CROP_IDS.map((id) => seedRow(state, id)).join('')}
      <button data-command="sell-all" ${hasSellableCrops ? '' : 'disabled'} title="Sell all crops" aria-label="Sell all crops">${buttonContent('coins', 'Sell All')}</button>
      <p class="small">Crop overflow auto-sells at normal price. Seeds never auto-sell.</p>
    `;
  } else if (activePanel === 'goals') {
    markup = `
      <h2>Tier ${state.tier.level}</h2>
      <p>${state.tier.label}</p>
      <h3>Next milestone</h3>
      <p>${state.tier.nextMilestone}</p>
      ${tierUnlockRow(state)}
      ${seedGuidanceRow(state)}
      <h3>Tool Upgrades</h3>
      ${UPGRADE_IDS.map((id) => upgradeRow(state, id)).join('')}
      <h3>Progression</h3>
      <div class="tier-list">
        ${FARM_TIER_LIST.map((tier) => `
          <div class="${tier.level === state.tier.level ? 'current' : ''}">
            <strong>Tier ${tier.level}: ${tier.label}</strong>
            <span>${tier.nextMilestone}</span>
            <span>${tier.reward}</span>
          </div>
        `).join('')}
      </div>
      <h3>Stats</h3>
      <p class="small">Planted carrots: ${state.stats.lifetimePlanted.carrot}</p>
      <p class="small">Harvested carrots: ${state.stats.lifetimeHarvested.carrot}</p>
      <p class="small">Worker distance: ${state.stats.lifetimeWorkerDistance}</p>
      <p class="small">Land purchased: ${state.stats.lifetimeLandPurchased}</p>
    `;
  } else if (activePanel === 'mix') {
    markup = `
      <h2>Crop Mix</h2>
      ${CROP_IDS.map((id) => cropMixRow(state, id)).join('')}
      <p class="small">Workers plant toward these percentages when seeds and plots are available.</p>
    `;
  } else {
    markup = inspectMarkup(state);
  }

  if (markup !== lastPanelMarkup) {
    panelContent.innerHTML = markup;
    lastPanelMarkup = markup;
  }
  lastRenderedPanel = activePanel;
  lastRenderedCollapsed = panelCollapsed;
  lastPanelRenderedAt = now;
  lastPanelStateSignature = panelSignature;
}

function renderTutorialTip(): void {
  const state = getFarmSnapshot(farmGame);
  const candidate = currentTutorialTip(state);
  const now = performance.now();
  const shouldHoldCurrent = Boolean(
    activeTutorialTip &&
    activeTutorialTip.id !== candidate?.id &&
    now - activeTutorialTipShownAt < TUTORIAL_MIN_VISIBLE_MS,
  );
  const tip = shouldHoldCurrent ? activeTutorialTip : candidate;

  if (!tip) {
    clearTutorialTip();
    return;
  }

  const target = visibleTutorialTarget(tip.targetSelector);
  if (!target) {
    if (shouldHoldCurrent && lastTutorialMarkup) return;
    clearTutorialTip();
    return;
  }

  if (!activeTutorialTip || activeTutorialTip.id !== tip.id || activeTutorialTip.targetSelector !== tip.targetSelector) {
    activeTutorialTip = tip;
    activeTutorialTipShownAt = now;
  }

  const { left, top, placement } = tutorialTipPosition(target);
  const markup = `
    <aside class="tutorial-tip ${placement}" style="left: ${left}px; top: ${top}px;" data-tutorial-tip="${tip.id}">
      <div class="tutorial-callout-icon">${iconSvg(tip.icon)}</div>
      <div class="tutorial-copy">
        <span class="tutorial-kicker">Farm Guide</span>
        <strong class="tutorial-title">${tip.title}</strong>
        <p class="tutorial-summary">${tip.body}</p>
        <div class="tutorial-details">
          <section class="tutorial-detail">
            <span class="tutorial-detail-label">Do</span>
            <p>${tip.action}</p>
          </section>
          <section class="tutorial-detail">
            <span class="tutorial-detail-label">Why</span>
            <p>${tip.why}</p>
          </section>
        </div>
      </div>
      <button class="tutorial-close" data-command="dismiss-tutorial" title="Dismiss tip" aria-label="Dismiss tip">x</button>
    </aside>
  `;
  if (markup !== lastTutorialMarkup) {
    tutorialLayer.innerHTML = markup;
    lastTutorialMarkup = markup;
  }
  keepTutorialTipInView();
}

function tutorialTipPosition(target: HTMLElement): { left: number; top: number; placement: TutorialTipPlacement } {
  const rect = target.getBoundingClientRect();
  const panelRect = sidePanel.getBoundingClientRect();
  const sidePanelTarget = sidePanel.contains(target);

  if (sidePanelTarget && panelRect.left - TUTORIAL_TIP_WIDTH - TUTORIAL_TARGET_GAP >= TUTORIAL_VIEWPORT_PADDING) {
    return {
      placement: 'side-left',
      left: Math.round(panelRect.left - TUTORIAL_TIP_WIDTH - TUTORIAL_TARGET_GAP),
      top: Math.round(rect.top + rect.height / 2),
    };
  }

  const left = clamp(
    rect.left + rect.width / 2 - TUTORIAL_TIP_WIDTH / 2,
    TUTORIAL_VIEWPORT_PADDING,
    window.innerWidth - TUTORIAL_TIP_WIDTH - TUTORIAL_VIEWPORT_PADDING,
  );
  const above = rect.top > window.innerHeight * 0.55;
  const top = above ? rect.top - TUTORIAL_TARGET_GAP : rect.bottom + TUTORIAL_TARGET_GAP;
  return {
    placement: above ? 'above' : 'below',
    left: Math.round(left),
    top: Math.round(top),
  };
}

function keepTutorialTipInView(): void {
  const tip = tutorialLayer.querySelector<HTMLElement>('.tutorial-tip');
  if (!tip) return;

  const playAreaTop = playArea.getBoundingClientRect().top;
  const toolbarTop = toolbar.getBoundingClientRect().top;
  const minTop = playAreaTop + TUTORIAL_VIEWPORT_PADDING;
  const maxBottom = toolbarTop - TUTORIAL_VIEWPORT_PADDING;
  let left = Number.parseFloat(tip.style.left || '0');
  let top = Number.parseFloat(tip.style.top || '0');
  const rect = tip.getBoundingClientRect();

  if (rect.left < TUTORIAL_VIEWPORT_PADDING) {
    left += TUTORIAL_VIEWPORT_PADDING - rect.left;
  }
  if (rect.right > window.innerWidth - TUTORIAL_VIEWPORT_PADDING) {
    left -= rect.right - (window.innerWidth - TUTORIAL_VIEWPORT_PADDING);
  }
  if (rect.top < minTop) {
    top += minTop - rect.top;
  }
  if (rect.bottom > maxBottom) {
    top -= rect.bottom - maxBottom;
  }

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${top}px`;
}

function currentTutorialTip(state: FarmState): TutorialTip | null {
  const claimable = claimableTierLevel(state);
  if (claimable) {
    if (activePanel === 'goals' && !isTutorialSeen('claim-tier')) {
      return {
        id: 'claim-tier',
        icon: 'claim',
        title: `Claim Tier ${claimable}`,
        body: 'Milestones make rewards ready, but you choose when to unlock them.',
        action: 'Click Claim Rewards in Goals.',
        why: 'Claiming adds the next crop, worker, and planning options without changing your layout.',
        targetSelector: '[data-command="claim-tier"]',
      };
    }
    if (activePanel !== 'goals' && !isTutorialSeen('open-goals-for-claim')) {
      return {
        id: 'open-goals-for-claim',
        icon: 'flag',
        title: 'Open Goals',
        body: `Tier ${claimable} is ready. Open Goals to claim the reward.`,
        action: 'Click the Goals tab on the right panel.',
        why: 'Tier rewards live in Goals so you can review the unlock before accepting it.',
        targetSelector: '[data-panel="goals"]',
      };
    }
  }

  const alerts = state.alerts.join(' ');
  if (alerts.includes('Buy seeds')) {
    if ((activePanel === 'inventory' || activePanel === 'goals') && !isTutorialSeen('buy-needed-seeds')) {
      return {
        id: 'buy-needed-seeds',
        icon: 'seed',
        title: 'Buy Seeds',
        body: 'Farmers plant seeds automatically once empty plots are available.',
        action: 'Buy a seed packet for any desired crop with zero seeds.',
        why: 'Workers cannot plant without seeds, even when plots and water are ready.',
        targetSelector: activePanel === 'inventory'
          ? '[data-buy-seeds]:not([disabled])'
          : '[data-seed-guidance-action]',
      };
    }
    if (activePanel !== 'inventory' && activePanel !== 'goals' && !isTutorialSeen('open-goals-for-seeds')) {
      return {
        id: 'open-goals-for-seeds',
        icon: 'flag',
        title: 'Open Goals',
        body: 'The farm needs seeds. Goals will show the direct restock button.',
        action: 'Click Goals, then use a seed restock button.',
        why: 'Goals highlights the exact crop that is blocking your workers.',
        targetSelector: '[data-panel="goals"]',
      };
    }
  }

  if (alerts.includes('Paint plots')) {
    if (selectedTool !== 'plot' && !isTutorialSeen('select-plot-tool')) {
      return {
        id: 'select-plot-tool',
        icon: 'plot',
        title: 'Select Plot',
        body: 'You have seeds, but no empty plots. Select Plot first.',
        action: 'Press 2 or click Plot in the toolbar.',
        why: 'Workers need empty plot tiles before they can carry seeds and plant crops.',
        targetSelector: '[data-tool="plot"]',
      };
    }
    if (selectedTool === 'plot' && !isTutorialSeen('paint-empty-land')) {
      return {
        id: 'paint-empty-land',
        icon: 'plot',
        title: 'Paint Empty Land',
        body: 'Click an empty green tile. Farmers will bring carrot seeds there.',
        action: 'Click a green owned tile that does not already contain a building or plot.',
        why: 'Painted plots become the planting targets workers use for the next crop cycle.',
        targetSelector: '#game-canvas',
      };
    }
  }

  const hasSellableCrops = Object.values(state.inventory.crops).some((count) => count > 0);
  if (hasSellableCrops) {
    if (activePanel === 'inventory' && !isTutorialSeen('sell-first-crop')) {
      return {
        id: 'sell-first-crop',
        icon: 'coins',
        title: 'Sell Crops',
        body: 'Turn stored crops into coins when you want more seeds or upgrades.',
        action: 'Click Sell All or a crop-specific sell button.',
        why: 'Coins buy seeds, land, storage, wells, and worker upgrades.',
        targetSelector: '[data-sell], [data-command="sell-all"]',
      };
    }
    if (activePanel !== 'inventory' && !isTutorialSeen('open-inventory-for-selling')) {
      return {
        id: 'open-inventory-for-selling',
        icon: 'backpack',
        title: 'Open Inventory',
        body: 'You have crops ready to sell.',
        action: 'Click Inventory to see crop counts and sell controls.',
        why: 'Selling harvested crops converts stored goods into spendable coins.',
        targetSelector: '[data-panel="inventory"]',
      };
    }
  }

  if (state.tier.unlockedCrops.length > 1 && !isTutorialSeen('open-mix-panel')) {
    return {
      id: 'open-mix-panel',
      icon: 'sliders',
      title: 'Tune Crop Mix',
      body: 'Mix is a target. Farmers still use carrot seeds if wheat seeds run out.',
      action: 'Open Crop Mix and adjust the crop sliders.',
      why: 'Crop mix tells workers which seeds to prefer as you unlock more crops.',
      targetSelector: '[data-panel="mix"]',
    };
  }

  return null;
}

function visibleTutorialTarget(selector: string): HTMLElement | null {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return target;
}

function clearTutorialTip(): void {
  activeTutorialTip = null;
  activeTutorialTipShownAt = 0;
  if (!lastTutorialMarkup) return;
  tutorialLayer.innerHTML = '';
  lastTutorialMarkup = '';
}

function inventoryRow(state: FarmState, cropId: CropId): string {
  const count = state.inventory.crops[cropId];
  const disabled = count > 0 ? '' : 'disabled';
  return `
    <div class="row">
      <span class="row-label">${iconSvg(cropIcon(cropId))}${CROPS[cropId].label}: ${count}</span>
      <span>
        <button data-sell="${cropId}" data-amount="1" ${disabled} title="Sell 1 ${CROPS[cropId].label}" aria-label="Sell 1 ${CROPS[cropId].label}">${buttonContent('coins', '1')}</button>
        <button data-sell="${cropId}" data-amount="5" ${disabled} title="Sell 5 ${CROPS[cropId].label}" aria-label="Sell 5 ${CROPS[cropId].label}">${buttonContent('coins', '5')}</button>
      </span>
    </div>
  `;
}

function seedRow(state: FarmState, cropId: CropId): string {
  const locked = !state.tier.unlockedCrops.includes(cropId);
  const unaffordable = state.coins < CROPS[cropId].seedPrice;
  const disabled = locked || unaffordable;
  return `
    <div class="row">
      <span class="row-label">${iconSvg(cropIcon(cropId))}${CROPS[cropId].label} seeds: ${state.inventory.seeds[cropId]}</span>
      <button data-buy-seeds="${cropId}" ${disabled ? 'disabled' : ''} title="Buy ${CROPS[cropId].label} seeds" aria-label="Buy ${CROPS[cropId].label} seeds">${buttonContent('seed', `${CROPS[cropId].seedPrice}c`)}</button>
    </div>
  `;
}

function tierUnlockRow(state: FarmState): string {
  const level = claimableTierLevel(state);
  if (!level) {
    return `
      <section class="tier-current-card">
        <span class="banner-kicker">Current Tier</span>
        <strong>${state.tier.label}</strong>
        <p class="small">Complete the milestone, then claim the next tier here.</p>
      </section>
    `;
  }
  const tier = FARM_TIERS[level];
  const currentTier = FARM_TIERS[state.tier.level as TierLevel];
  return `
    <section class="tier-unlock-banner" aria-label="Tier ${tier.level} ready">
      <div class="tier-banner-decoration" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="tier-banner-copy">
        <span class="banner-kicker">Tier Ready</span>
        <strong>Tier ${tier.level}: ${tier.label}</strong>
        <p>${currentTier.reward}</p>
      </div>
      <div class="reward-grid">
        ${currentTier.rewardDetails.map((detail) => `<span class="reward-chip">${iconSvg('claim')} ${detail}</span>`).join('')}
      </div>
      <button class="primary-action claim-button" data-command="claim-tier" title="Unlock Tier ${tier.level}" aria-label="Unlock Tier ${tier.level}">${buttonContent('claim', 'Claim Rewards')}</button>
    </section>
  `;
}

function seedGuidanceRow(state: FarmState): string {
  const hasSeedAlert = state.alerts.some((alert) => alert.includes('Buy seeds'));
  if (!hasSeedAlert) return '';

  const buyableCrops = state.tier.unlockedCrops.filter((cropId) => (
    state.cropMix[cropId] > 0 &&
    state.inventory.seeds[cropId] === 0 &&
    state.coins >= CROPS[cropId].seedPrice
  ));
  if (buyableCrops.length === 0) return '';

  return `
    <section class="seed-guidance" aria-label="Seed guidance">
      <div>
        <span class="banner-kicker">Farmers Waiting</span>
        <strong>Restock seeds</strong>
        <p class="small">Empty plots are ready, but farmers have no seeds to plant.</p>
      </div>
      <div class="seed-actions">
        ${buyableCrops.map((cropId) => `
          <button data-buy-seeds="${cropId}" data-seed-guidance-action="${cropId}" title="Buy ${CROPS[cropId].label} seeds" aria-label="Buy ${CROPS[cropId].label} seeds">
            ${buttonContent(cropIcon(cropId), `${CROPS[cropId].label} ${CROPS[cropId].seedPrice}c`)}
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function upgradeRow(state: FarmState, upgradeId: UpgradeId): string {
  const upgrade = UPGRADES[upgradeId];
  const level = state.upgrades[upgradeId];
  const maxed = level >= upgrade.maxLevel;
  const cost = upgrade.costs[level];
  const disabled = maxed || state.coins < cost;
  return `
    <div class="upgrade-row">
      <div>
        <strong>${upgrade.label} ${level}/${upgrade.maxLevel}</strong>
        <p class="small">${upgrade.description}</p>
      </div>
      <button data-buy-upgrade="${upgradeId}" ${disabled ? 'disabled' : ''} title="${maxed ? `${upgrade.label} maxed` : `Buy ${upgrade.label}`}" aria-label="${maxed ? `${upgrade.label} maxed` : `Buy ${upgrade.label}`}">${buttonContent('upgrade', maxed ? 'Max' : `${cost}c`)}</button>
    </div>
  `;
}

function cropMixRow(state: FarmState, cropId: CropId): string {
  const locked = !state.tier.unlockedCrops.includes(cropId);
  const value = Math.round(state.cropMix[cropId] * 100);
  const status = cropMixStatus(state, cropId, locked, value);
  const detail = cropMixDetail(state, cropId, status);
  const actionLabel = `Set ${CROPS[cropId].label} crop mix`;
  return `
    <label class="crop-mix" data-crop-id="${cropId}" data-crop-status="${status}">
      <span class="crop-mix-name">${iconSvg(cropIcon(cropId))}${CROPS[cropId].label}</span>
      <input type="range" min="0" max="100" value="${value}" data-mix="${cropId}" title="${actionLabel}" aria-label="${actionLabel}" ${locked ? 'disabled' : ''} />
      <span class="crop-mix-value">${value}%</span>
      <span class="crop-mix-detail">${detail}</span>
    </label>
  `;
}

function cropMixStatus(state: FarmState, cropId: CropId, locked: boolean, value: number): CropMixStatus {
  if (locked) return 'locked';
  if (value <= 0) return 'off';
  if (state.inventory.seeds[cropId] <= 0) return 'no-seeds';
  if (emptyPlotCount(state) <= 0) return 'needs-plots';
  return 'ready';
}

function cropMixDetail(state: FarmState, cropId: CropId, status: CropMixStatus): string {
  if (status === 'locked') return 'Locked until a later tier';

  const stock = `Seeds ${state.inventory.seeds[cropId]} - Planted ${plantedCropCount(state, cropId)}`;
  if (status === 'off') return `${stock} - Disabled in mix`;
  if (status === 'no-seeds') return `${stock} - No seeds stocked`;
  if (status === 'needs-plots') return `${stock} - Needs empty plots`;
  return `${stock} - Ready for workers`;
}

function inspectMarkup(state: FarmState): string {
  if (!selectedCell) return '<h2>Inspect</h2><p>Select a tile or worker.</p>';
  const tile = state.tiles[`${selectedCell.x},${selectedCell.y}`];
  const worker = state.workers.find((item) => item.x === selectedCell?.x && item.y === selectedCell.y);
  if (worker) {
    return `
      <h2>Worker ${worker.id}</h2>
      <p>Task: ${worker.task.kind}</p>
      <p class="small">Position: ${worker.x}, ${worker.y}</p>
      <p class="small">Cargo: ${worker.cargo ? `${worker.cargo.kind} ${worker.cargo.cropId ?? ''}` : 'none'}</p>
    `;
  }
  if (!tile) return '<h2>Locked Land</h2><p>Buy adjacent land to expand here.</p>';
  const plot = tile.plot ? `<p class="small">Crop: ${tile.plot.cropId}, growth ${tile.plot.growth}, water ${tile.plot.water}</p>` : '';
  return `
    <h2>Tile ${selectedCell.x}, ${selectedCell.y}</h2>
    <p>Kind: ${tile.kind}</p>
    ${plot}
  `;
}

function colorForTile(tile: FarmTile, x: number, y: number): number {
  const colors: Record<TileKind, number[]> = {
    empty: [0x5e914f, 0x669957, 0x56884b],
    plot: [0x82522f, 0x8d5b35, 0x74472b],
    well: [0x586a77, 0x647887, 0x4c5d69],
    storage: [0xa96e3f, 0xb77946, 0x975f38],
  };
  return tileVariant(x, y, colors[tile.kind]);
}

function cropColor(cropId: CropId, ready: boolean, needsWater: boolean): number {
  if (needsWater) return 0xa78955;
  if (cropId === 'carrot') return ready ? 0xf08a3e : 0x63b65d;
  if (cropId === 'wheat') return ready ? 0xe2c65d : 0x8fb85d;
  return ready ? 0xd84f3f : 0x5ca75d;
}

function cropIcon(cropId: CropId): IconName {
  if (cropId === 'carrot') return 'carrot';
  if (cropId === 'wheat') return 'wheat';
  return 'tomato';
}

function storedCropCount(state: FarmState): number {
  return Object.values(state.inventory.crops).reduce((sum, count) => sum + count, 0);
}

function plantedCropCount(state: FarmState, cropId: CropId): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && tile.plot?.cropId === cropId).length;
}

function emptyPlotCount(state: FarmState): number {
  return Object.values(state.tiles).filter((tile) => tile.kind === 'plot' && !tile.plot).length;
}

function panelStateSignature(state: FarmState): string {
  if (activePanel === 'mix') {
    return [
      activePanel,
      emptyPlotCount(state),
      ...CROP_IDS.map((cropId) => [
        cropId,
        Math.round(state.cropMix[cropId] * 100),
        state.inventory.seeds[cropId],
        plantedCropCount(state, cropId),
        state.tier.unlockedCrops.includes(cropId) ? 'unlocked' : 'locked',
      ].join(':')),
    ].join('|');
  }
  if (activePanel !== 'inventory') return activePanel;
  return [
    activePanel,
    state.coins,
    state.inventory.cropCapacity,
    ...CROP_IDS.map((cropId) => [
      cropId,
      state.inventory.crops[cropId],
      state.inventory.seeds[cropId],
      state.tier.unlockedCrops.includes(cropId) ? 'unlocked' : 'locked',
    ].join(':')),
  ].join('|');
}

function tileVariant(x: number, y: number, colors: number[]): number {
  return colors[Math.abs((x * 17 + y * 31) % colors.length)] ?? colors[0];
}

function workerTargetPosition(worker: FarmWorker): { x: number; y: number } {
  const offset = workerOffset(worker.id);
  const next = worker.task.path[0];
  const progress = next ? Phaser.Math.Clamp(worker.task.progress / 4, 0, 1) : 0;
  const tileX = next ? Phaser.Math.Linear(worker.x, next.x, progress) : worker.x;
  const tileY = next ? Phaser.Math.Linear(worker.y, next.y, progress) : worker.y;
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2 + offset.x,
    y: tileY * TILE_SIZE + TILE_SIZE / 2 + offset.y,
  };
}

function workerOffset(id: number): { x: number; y: number } {
  const offsets = [
    { x: -3, y: -2 },
    { x: 4, y: 2 },
    { x: -1, y: 5 },
    { x: 5, y: -4 },
  ];
  return offsets[(id - 1) % offsets.length] ?? offsets[0];
}

function labelForTool(tool: Tool): string {
  return tools.find((item) => item.id === tool)?.label ?? tool;
}

function loadPanelWidth(): number {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) ? clamp(stored, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX) : PANEL_WIDTH_DEFAULT;
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

function savePanelWidth(): void {
  try {
    localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
  } catch {
    // UI preferences are nice-to-have and should not block play.
  }
}

function maxPanelWidth(): number {
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, window.innerWidth - PANEL_PLAYFIELD_MIN));
}

function setPanelWidth(nextWidth: number, persist: boolean): void {
  panelWidth = Math.round(clamp(nextWidth, PANEL_WIDTH_MIN, maxPanelWidth()));
  applyPanelWidth();
  if (persist) savePanelWidth();
}

function applyPanelWidth(): void {
  const maxWidth = maxPanelWidth();
  panelWidth = Math.round(clamp(panelWidth, PANEL_WIDTH_MIN, maxWidth));
  playArea.style.setProperty('--side-panel-width', `${panelWidth}px`);
  panelResizer.setAttribute('aria-valuemin', String(PANEL_WIDTH_MIN));
  panelResizer.setAttribute('aria-valuemax', String(maxWidth));
  panelResizer.setAttribute('aria-valuenow', String(panelWidth));
}

function loadTutorialSeen(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function isTutorialSeen(id: string): boolean {
  return seenTutorialTips[id] === true;
}

function markTutorialSeen(id: string): void {
  seenTutorialTips[id] = true;
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(seenTutorialTips));
  } catch {
    // Local storage can fail in private or restricted browser contexts.
  }
  clearTutorialTip();
}

function loadSpeed(): 1 | 2 | 4 {
  try {
    const stored = Number(localStorage.getItem(SPEED_STORAGE_KEY));
    return stored === 2 || stored === 4 ? stored : 1;
  } catch {
    return 1;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function setSpeed(next: number): void {
  speed = next === 2 || next === 4 ? next : 1;
  paused = false;
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Local storage can fail in private or restricted browser contexts.
  }
}

function advanceRealtime(ms: number): void {
  simulationRemainderMs += ms;
  const ticks = Math.floor(simulationRemainderMs / 100);
  if (ticks <= 0) return;
  advanceFarm(farmGame, ticks);
  simulationRemainderMs -= ticks * 100;
}

function resetFarm(): void {
  clearFarmSave();
  farmGame = createFarmGame({ seed: 'farm' });
  simulationRemainderMs = 0;
  lastHudMarkup = '';
  lastToolbarMarkup = '';
  lastPanelMarkup = '';
  lastPanelStateSignature = '';
  lastTutorialMarkup = '';
  activeTutorialTip = null;
  activeTutorialTipShownAt = 0;
}

panelResizer.addEventListener('pointerdown', (event) => {
  if (panelCollapsed) return;
  panelResizeDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startWidth: sidePanel.getBoundingClientRect().width,
  };
  panelResizer.setPointerCapture(event.pointerId);
  document.body.classList.add('panel-resizing');
  event.preventDefault();
});

document.addEventListener('pointermove', (event) => {
  if (!panelResizeDrag || panelResizeDrag.pointerId !== event.pointerId) return;
  const draggedLeft = panelResizeDrag.startX - event.clientX;
  setPanelWidth(panelResizeDrag.startWidth + draggedLeft, false);
  event.preventDefault();
});

function stopPanelResize(event: PointerEvent): void {
  if (!panelResizeDrag || panelResizeDrag.pointerId !== event.pointerId) return;
  panelResizeDrag = null;
  document.body.classList.remove('panel-resizing');
  savePanelWidth();
}

document.addEventListener('pointerup', stopPanelResize);
document.addEventListener('pointercancel', stopPanelResize);

panelResizer.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 48 : 24;
  if (event.key === 'ArrowLeft') {
    setPanelWidth(panelWidth + step, true);
  } else if (event.key === 'ArrowRight') {
    setPanelWidth(panelWidth - step, true);
  } else if (event.key === 'Home') {
    setPanelWidth(PANEL_WIDTH_MIN, true);
  } else if (event.key === 'End') {
    setPanelWidth(maxPanelWidth(), true);
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
});

window.addEventListener('resize', () => {
  setPanelWidth(panelWidth, false);
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const clickedTutorialTarget = activeTutorialTip
    ? Boolean(target.closest(activeTutorialTip.targetSelector))
    : false;
  const tool = target.closest<HTMLElement>('[data-tool]')?.dataset.tool as Tool | undefined;
  if (tool) selectedTool = tool;

  const panel = target.closest<HTMLElement>('[data-panel]')?.dataset.panel as Panel | undefined;
  if (panel) activePanel = panel;

  const command = target.closest<HTMLElement>('[data-command]')?.dataset.command;
  if (command === 'dismiss-tutorial') {
    if (activeTutorialTip) markTutorialSeen(activeTutorialTip.id);
    return;
  }
  if (command === 'undo') submitFarmCommand(farmGame, { type: 'undo' });
  if (command === 'redo') submitFarmCommand(farmGame, { type: 'redo' });
  if (command === 'pause') paused = !paused;
  if (command === 'toggle-panel') panelCollapsed = !panelCollapsed;
  if (command === 'claim-tier') submitFarmCommand(farmGame, { type: 'claimNextTier' });
  if (command === 'sell-all') {
    submitFarmCommand(farmGame, { type: 'sellAllCrops' });
  }

  const nextSpeed = target.closest<HTMLElement>('[data-speed]')?.dataset.speed;
  if (nextSpeed) {
    setSpeed(Number(nextSpeed));
  }

  const sell = target.closest<HTMLElement>('[data-sell]');
  if (sell?.dataset.sell) {
    submitFarmCommand(farmGame, {
      type: 'sellCrop',
      cropId: sell.dataset.sell as CropId,
      amount: Number(sell.dataset.amount ?? 1),
    });
  }

  const buySeeds = target.closest<HTMLElement>('[data-buy-seeds]');
  if (buySeeds?.dataset.buySeeds) {
    submitFarmCommand(farmGame, { type: 'buySeeds', cropId: buySeeds.dataset.buySeeds as CropId, amount: 5 });
  }

  const buyUpgrade = target.closest<HTMLElement>('[data-buy-upgrade]');
  if (buyUpgrade?.dataset.buyUpgrade) {
    submitFarmCommand(farmGame, { type: 'buyUpgrade', upgradeId: buyUpgrade.dataset.buyUpgrade as UpgradeId });
  }

  if (clickedTutorialTarget && activeTutorialTip) {
    markTutorialSeen(activeTutorialTip.id);
  }
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const cropId = target.dataset.mix as CropId | undefined;
  if (!cropId) return;
  const state = getFarmSnapshot(farmGame);
  const mix: Partial<Record<CropId, number>> = {};
  for (const id of CROP_IDS) {
    const input = document.querySelector<HTMLInputElement>(`[data-mix="${id}"]`);
    mix[id] = input ? Number(input.value) : Math.round(state.cropMix[id] * 100);
  }
  submitFarmCommand(farmGame, { type: 'setCropMix', mix });
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  if (key === ' ') {
    event.preventDefault();
    paused = !paused;
  } else if (key === '1') selectedTool = 'plot';
  else if (key === '2') selectedTool = 'well';
  else if (key === '3') selectedTool = 'storage';
  else if (key === '4') selectedTool = 'land';
  else if (key === 'b') selectedTool = 'bulldoze';
  else if (key === 'i') selectedTool = 'inspect';
  else if (key === 'z') submitFarmCommand(farmGame, { type: 'undo' });
  else if (key === 'y') submitFarmCommand(farmGame, { type: 'redo' });
  else if (key === '0') setSpeed(1);
  else if (key === '-') setSpeed(2);
  else if (key === '=') setSpeed(4);
  else if (key === 'r' && event.shiftKey) resetFarm();
});

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __farmDebug: {
      getState: () => FarmState;
      reset: () => void;
    };
  }
}

window.render_game_to_text = () => renderFarmToText(farmGame);
window.advanceTime = (ms: number) => {
  advanceFarmByMs(farmGame, ms);
  saveFarmState(getFarmSnapshot(farmGame));
};
window.__farmDebug = {
  getState: () => getFarmSnapshot(farmGame),
  reset: resetFarm,
};

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing app shell element: ${selector}`);
  }
  return element;
}
