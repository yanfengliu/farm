import Phaser from 'phaser';
import './styles.css';
import { CROP_IDS, CROPS, type CropId } from './game/content/crops';
import { FARM_TIER_LIST } from './game/content/tiers';
import { UPGRADE_IDS, UPGRADES, type UpgradeId } from './game/content/upgrades';
import {
  advanceFarm,
  advanceFarmByMs,
  createFarmGame,
  getFarmSnapshot,
  renderFarmToText,
  submitFarmCommand,
  type FarmCommand,
  type FarmGame,
  type FarmState,
  type FarmTile,
  type TileKind,
} from './game/simulation/farmGame';
import { clearFarmSave, loadSavedFarmState, saveFarmState } from './persistence/localSave';

type Tool = 'inspect' | 'plot' | 'path' | 'well' | 'storage' | 'land' | 'bulldoze';
type Panel = 'inventory' | 'goals' | 'mix' | 'inspect';

const TILE_SIZE = 32;
const PAN_SPEED = 420;
const PANEL_RENDER_INTERVAL_MS = 250;

let farmGame: FarmGame = createFarmGame({ state: loadSavedFarmState() ?? undefined });
let selectedTool: Tool = 'inspect';
let activePanel: Panel = 'inventory';
let selectedCell: { x: number; y: number } | null = null;
let paused = false;
let speed = 1;
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

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root');
}

app.innerHTML = `
  <div class="farm-shell">
    <header class="hud" id="hud"></header>
    <main class="play-area" id="play-area">
      <div id="game-canvas"></div>
      <aside class="side-panel">
        <div class="panel-tabs">
          <button data-panel="inventory">Inventory</button>
          <button data-panel="goals">Goals</button>
          <button data-panel="mix">Crop Mix</button>
          <button data-panel="inspect">Inspect</button>
          <button class="panel-toggle" data-command="toggle-panel" title="Collapse panel">></button>
        </div>
        <div class="panel-content" id="panel-content"></div>
      </aside>
    </main>
    <footer class="toolbar" id="toolbar"></footer>
  </div>
`;

const hud = requireElement<HTMLDivElement>('#hud');
const toolbar = requireElement<HTMLDivElement>('#toolbar');
const panelContent = requireElement<HTMLDivElement>('#panel-content');
const canvasHost = requireElement<HTMLDivElement>('#game-canvas');
const playArea = requireElement<HTMLElement>('#play-area');

const tools: Array<{ id: Tool; key: string; label: string }> = [
  { id: 'inspect', key: 'I', label: 'Inspect' },
  { id: 'plot', key: '1', label: 'Plot' },
  { id: 'path', key: '2', label: 'Path' },
  { id: 'well', key: '3', label: 'Well' },
  { id: 'storage', key: '4', label: 'Storage' },
  { id: 'land', key: '5', label: 'Land' },
  { id: 'bulldoze', key: 'B', label: 'Bulldoze' },
  { id: 'inspect', key: 'Z', label: 'Undo' },
  { id: 'inspect', key: 'Y', label: 'Redo' },
];

let audioContext: AudioContext | null = null;
let lastHarvestSoundCount = 0;

class FarmScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('FarmScene');
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor('#293525');
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
    playPassiveFarmSounds();
    this.autosave();
    this.drawFarm();
    renderHud();
    renderToolbar();
    renderPanel();
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

    g.fillStyle(0x142019, 1);
    g.fillRect(0, 0, state.width * TILE_SIZE, state.height * TILE_SIZE);

    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const tile = state.tiles[`${x},${y}`];
        this.drawTile(g, x, y, tile);
      }
    }

    for (const worker of state.workers) {
      this.drawWorker(g, state, worker.id, worker.x, worker.y, worker.task.kind, worker.cargo?.kind);
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
      g.fillStyle(tileVariant(x, y, [0x101711, 0x111b12, 0x0e150f]), 1);
      g.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
      g.fillStyle(0x172018, 1);
      if ((x + y) % 3 === 0) g.fillRect(px + 13, py + 13, 5, 5);
      return;
    }

    g.fillStyle(colorForTile(tile, x, y), 1);
    g.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
    this.drawGroundTexture(g, px, py, x, y, tile);
    g.lineStyle(1, 0x203123, 0.9);
    g.strokeRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);

    if (tile.kind === 'plot') {
      this.drawPlot(g, px, py, tile);
    } else if (tile.kind === 'path') {
      this.drawPath(g, px, py, x, y);
    } else if (tile.kind === 'well') {
      this.drawWell(g, px, py);
    } else if (tile.kind === 'storage') {
      this.drawStorage(g, px, py);
    }
  }

  private drawPlot(g: Phaser.GameObjects.Graphics, px: number, py: number, tile: FarmTile): void {
    g.fillStyle(0x72482d, 1);
    g.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    g.fillStyle(0x8a5c35, 1);
    g.fillRect(px + 6, py + 7, TILE_SIZE - 12, 3);
    g.fillRect(px + 6, py + 14, TILE_SIZE - 12, 3);
    g.fillRect(px + 6, py + 21, TILE_SIZE - 12, 3);
    if (!tile.plot) {
      g.fillStyle(0x4d2f1e, 1);
      g.fillRect(px + 10, py + 10, 12, 3);
      g.fillRect(px + 9, py + 18, 14, 3);
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
    const tuftColor = tileVariant(x, y, [0x79a765, 0x83ad6c, 0x557f48]);
    g.fillStyle(tuftColor, 0.85);
    if ((x * 3 + y) % 2 === 0) g.fillRect(px + 7, py + 9, 3, 7);
    if ((x + y * 5) % 3 === 0) g.fillRect(px + 21, py + 20, 5, 2);
    if ((x * 7 + y) % 4 === 0) g.fillRect(px + 15, py + 6, 2, 4);
  }

  private drawPath(g: Phaser.GameObjects.Graphics, px: number, py: number, x: number, y: number): void {
    g.fillStyle(0xd2bd7d, 1);
    g.fillRect(px + 2, py + 12, TILE_SIZE - 4, 8);
    g.fillStyle(tileVariant(x, y, [0x947749, 0x7e613d, 0xb39458]), 1);
    g.fillRect(px + 6, py + 8, 5, 4);
    g.fillRect(px + 18, py + 20, 6, 3);
  }

  private drawWell(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
    g.fillStyle(0x415262, 1);
    g.fillRect(px + 6, py + 12, 20, 14);
    g.fillStyle(0x6f8594, 1);
    g.fillRect(px + 8, py + 9, 16, 16);
    g.fillStyle(0x9bb3bd, 1);
    g.fillRect(px + 11, py + 12, 10, 10);
    g.fillStyle(0x3e8cb5, 1);
    g.fillRect(px + 12, py + 13, 8, 8);
    g.fillStyle(0x29404b, 1);
    g.fillRect(px + 5, py + 7, 22, 4);
    g.fillStyle(0x7c4d35, 1);
    g.fillRect(px + 8, py + 5, 16, 3);
  }

  private drawStorage(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
    g.fillStyle(0x7b4928, 1);
    g.fillRect(px + 5, py + 10, 22, 17);
    g.fillStyle(0xbb7c44, 1);
    g.fillRect(px + 7, py + 12, 18, 13);
    g.fillStyle(0x63351e, 1);
    g.fillRect(px + 5, py + 8, 22, 4);
    g.fillRect(px + 9, py + 17, 14, 3);
    g.fillStyle(0xd49a59, 1);
    g.fillRect(px + 9, py + 13, 4, 3);
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
    g.fillStyle(leaf, 1);
    g.fillRect(px + 14, py + 19 - stemHeight, 4, stemHeight);
    g.fillRect(px + 10, py + 17 - Math.floor(stemHeight / 2), 7, 3);
    g.fillRect(px + 16, py + 14 - Math.floor(stemHeight / 2), 7, 3);
    if (cropId === 'carrot') {
      g.fillStyle(crop, 1);
      g.fillRect(px + 13, py + 19, 6, ready ? 8 : 4);
      if (ready) g.fillRect(px + 14, py + 27, 4, 2);
    } else if (cropId === 'wheat') {
      g.fillStyle(crop, 1);
      for (let i = 0; i < 3; i++) {
        g.fillRect(px + 10 + i * 5, py + 12, 3, ready ? 11 : 6);
      }
    } else {
      g.fillStyle(crop, 1);
      const fruit = ready ? 5 : 3;
      g.fillRect(px + 10, py + 16, fruit, fruit);
      g.fillRect(px + 18, py + 14, fruit, fruit);
    }
  }

  private drawWorker(
    g: Phaser.GameObjects.Graphics,
    state: FarmState,
    id: number,
    x: number,
    y: number,
    task: string,
    cargo?: string,
  ): void {
    const bob = task === 'idle' ? 0 : state.tick % 8 < 4 ? -1 : 0;
    const offset = workerOffset(id);
    const px = x * TILE_SIZE + TILE_SIZE / 2 + offset.x;
    const py = y * TILE_SIZE + TILE_SIZE / 2 + offset.y + bob;
    g.fillStyle(0x2a1d16, 0.25);
    g.fillRect(px - 8, py + 8, 16, 3);
    g.fillStyle(task === 'idle' ? 0xf5d58f : 0xf0b85d, 1);
    g.fillRect(px - 5, py - 2, 10, 12);
    g.fillStyle(0xffdfb0, 1);
    g.fillRect(px - 4, py - 10, 8, 8);
    g.fillStyle(0x5c351e, 1);
    g.fillRect(px - 6, py - 12, 12, 4);
    g.fillRect(px - 3, py - 14, 6, 3);
    g.fillStyle(0x3a2820, 1);
    g.fillRect(px - 5, py + 10, 4, 4);
    g.fillRect(px + 1, py + 10, 4, 4);
    if (cargo) {
      g.fillStyle(cargo === 'water' ? 0x62a9c8 : cargo === 'seed' ? 0xb98648 : 0xe08a3a, 1);
      g.fillRect(px + 6, py - 1, 5, 6);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: canvasHost,
  width: canvasHost.clientWidth,
  height: canvasHost.clientHeight,
  backgroundColor: '#293525',
  pixelArt: true,
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
    case 'path':
      return { type: 'paintTile', x, y, tile: 'path' };
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
      return `<button class="tool-button" data-command="${command}"><span class="key">${tool.key}</span><span class="label">${tool.label}</span></button>`;
    }
    return `<button class="tool-button ${selectedTool === tool.id ? 'active' : ''}" data-tool="${tool.id}"><span class="key">${tool.key}</span><span class="label">${tool.label}</span></button>`;
  }).join('');
  const speedButtons = [
    `<button class="tool-button ${paused ? 'active' : ''}" data-command="pause"><span class="key">Space</span><span class="label">${paused ? 'Resume' : 'Pause'}</span></button>`,
    `<button class="tool-button ${!paused && speed === 1 ? 'active' : ''}" data-speed="1"><span class="key">0</span><span class="label">1x</span></button>`,
    `<button class="tool-button ${!paused && speed === 2 ? 'active' : ''}" data-speed="2"><span class="key">-</span><span class="label">2x</span></button>`,
    `<button class="tool-button ${!paused && speed === 4 ? 'active' : ''}" data-speed="4"><span class="key">=</span><span class="label">4x</span></button>`,
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
    toggle.textContent = panelCollapsed ? '<' : '>';
    toggle.title = panelCollapsed ? 'Expand panel' : 'Collapse panel';
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-panel]')) {
    button.classList.toggle('active', button.dataset.panel === activePanel);
  }

  const now = performance.now();
  const forceRender = activePanel !== lastRenderedPanel || panelCollapsed !== lastRenderedCollapsed;
  if (!forceRender && now - lastPanelRenderedAt < PANEL_RENDER_INTERVAL_MS) return;

  const state = getFarmSnapshot(farmGame);
  let markup = '';
  if (activePanel === 'inventory') {
    markup = `
      <h2>Inventory</h2>
      ${CROP_IDS.map((id) => inventoryRow(state, id)).join('')}
      <h3>Seeds</h3>
      ${CROP_IDS.map((id) => seedRow(state, id)).join('')}
      <button data-command="sell-all">Sell All Crops</button>
      <p class="small">Crop overflow auto-sells at normal price. Seeds never auto-sell.</p>
    `;
  } else if (activePanel === 'goals') {
    markup = `
      <h2>Tier ${state.tier.level}</h2>
      <p>${state.tier.label}</p>
      <h3>Next milestone</h3>
      <p>${state.tier.nextMilestone}</p>
      <h3>Tool Upgrades</h3>
      ${UPGRADE_IDS.map((id) => upgradeRow(state, id)).join('')}
      <h3>Tier Path</h3>
      <div class="tier-path">
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
}

function inventoryRow(state: FarmState, cropId: CropId): string {
  return `
    <div class="row">
      <span>${CROPS[cropId].label}: ${state.inventory.crops[cropId]}</span>
      <span>
        <button data-sell="${cropId}" data-amount="1">Sell 1</button>
        <button data-sell="${cropId}" data-amount="5">Sell 5</button>
      </span>
    </div>
  `;
}

function seedRow(state: FarmState, cropId: CropId): string {
  const locked = !state.tier.unlockedCrops.includes(cropId);
  return `
    <div class="row">
      <span>${CROPS[cropId].label} seeds: ${state.inventory.seeds[cropId]}</span>
      <button data-buy-seeds="${cropId}" ${locked ? 'disabled' : ''}>Buy ${CROPS[cropId].seedPrice}c</button>
    </div>
  `;
}

function upgradeRow(state: FarmState, upgradeId: UpgradeId): string {
  const upgrade = UPGRADES[upgradeId];
  const level = state.upgrades[upgradeId];
  const maxed = level >= upgrade.maxLevel;
  const cost = upgrade.costs[level];
  return `
    <div class="upgrade-row">
      <div>
        <strong>${upgrade.label} ${level}/${upgrade.maxLevel}</strong>
        <p class="small">${upgrade.description}</p>
      </div>
      <button data-buy-upgrade="${upgradeId}" ${maxed ? 'disabled' : ''}>${maxed ? 'Max' : `${cost}c`}</button>
    </div>
  `;
}

function cropMixRow(state: FarmState, cropId: CropId): string {
  const locked = !state.tier.unlockedCrops.includes(cropId);
  const value = Math.round(state.cropMix[cropId] * 100);
  return `
    <label class="crop-mix">
      <span>${CROPS[cropId].label}</span>
      <input type="range" min="0" max="100" value="${value}" data-mix="${cropId}" ${locked ? 'disabled' : ''} />
      <span>${value}%</span>
    </label>
  `;
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
    path: [0xbba76e, 0xc6af76, 0xac925e],
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

function storedCropCount(state: FarmState): number {
  return Object.values(state.inventory.crops).reduce((sum, count) => sum + count, 0);
}

function tileVariant(x: number, y: number, colors: number[]): number {
  return colors[Math.abs((x * 17 + y * 31) % colors.length)] ?? colors[0];
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

function setSpeed(next: number): void {
  speed = next;
  paused = false;
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
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tool = target.closest<HTMLElement>('[data-tool]')?.dataset.tool as Tool | undefined;
  if (tool) selectedTool = tool;

  const panel = target.closest<HTMLElement>('[data-panel]')?.dataset.panel as Panel | undefined;
  if (panel) activePanel = panel;

  const command = target.closest<HTMLElement>('[data-command]')?.dataset.command;
  if (target.closest('button')) playClickSound();
  if (command === 'undo') submitFarmCommand(farmGame, { type: 'undo' });
  if (command === 'redo') submitFarmCommand(farmGame, { type: 'redo' });
  if (command === 'pause') paused = !paused;
  if (command === 'toggle-panel') panelCollapsed = !panelCollapsed;
  if (command === 'sell-all') {
    submitFarmCommand(farmGame, { type: 'sellAllCrops' });
    playTone(440, 0.05, 0.05);
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
    playTone(440, 0.05, 0.05);
  }

  const buySeeds = target.closest<HTMLElement>('[data-buy-seeds]');
  if (buySeeds?.dataset.buySeeds) {
    submitFarmCommand(farmGame, { type: 'buySeeds', cropId: buySeeds.dataset.buySeeds as CropId, amount: 5 });
  }

  const buyUpgrade = target.closest<HTMLElement>('[data-buy-upgrade]');
  if (buyUpgrade?.dataset.buyUpgrade) {
    submitFarmCommand(farmGame, { type: 'buyUpgrade', upgradeId: buyUpgrade.dataset.buyUpgrade as UpgradeId });
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
  else if (key === '2') selectedTool = 'path';
  else if (key === '3') selectedTool = 'well';
  else if (key === '4') selectedTool = 'storage';
  else if (key === '5') selectedTool = 'land';
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

function playClickSound(): void {
  playTone(260, 0.03, 0.025);
}

function playPassiveFarmSounds(): void {
  const state = getFarmSnapshot(farmGame);
  const harvests = Object.values(state.stats.lifetimeHarvested).reduce((sum, count) => sum + count, 0);
  if (harvests > lastHarvestSoundCount) {
    lastHarvestSoundCount = harvests;
    playTone(620, 0.04, 0.035);
  }
}

function playTone(frequency: number, durationSeconds: number, gainValue: number): void {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'square';
  gain.gain.value = gainValue;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + durationSeconds);
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing app shell element: ${selector}`);
  }
  return element;
}
