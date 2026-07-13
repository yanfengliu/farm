import Phaser from 'phaser';
import type { FarmState } from '../../game/simulation/farmGame';
import { FARM_ENVIRONMENT_MARGIN_TILES } from '../view/farmEnvironment';
import { FarmRenderer, TILE_SIZE } from '../view/farmRenderer';

type Cell = { x: number; y: number };

export interface FarmSceneBridge {
  getState(): FarmState;
  advance(deltaMs: number): void;
  autosave(): void;
  renderUi(): void;
  getSelectedTool(): string;
  getSelectedCell(): Cell | null;
  applyTool(x: number, y: number): void;
  canDragTool(): boolean;
}

const PAN_SPEED = 420;

export class FarmScene extends Phaser.Scene {
  readonly #bridge: FarmSceneBridge;
  #renderer!: FarmRenderer;
  #cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  #wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  #lastPaintKey = '';
  #cameraMoved = false;

  constructor(bridge: FarmSceneBridge) {
    super('FarmScene');
    this.#bridge = bridge;
  }

  create(): void {
    this.#renderer = new FarmRenderer(this);
    this.cameras.main.setBackgroundColor('#3f5f32');
    this.frameFarm();
    this.#cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.#wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.removeCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.HOME,
    ]);
    this.input.keyboard!.on('keydown-HOME', () => {
      if (!domControlOwnsKeyboard()) this.recenter();
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) return;
      this.#lastPaintKey = '';
      this.applyPointerTool(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.#bridge.canDragTool()) return;
      this.applyPointerTool(pointer);
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom + (dy > 0 ? -0.08 : 0.08), this.minimumCameraZoom(), 2.8));
      this.#cameraMoved = true;
    });
    this.scale.on('resize', () => {
      this.configureCameraBounds();
      if (!this.#cameraMoved) this.frameFarm();
      else this.cameras.main.setZoom(Math.max(this.cameras.main.zoom, this.minimumCameraZoom()));
    });
  }

  update(time: number, delta: number): void {
    this.updateCamera(delta);
    this.#bridge.advance(delta);
    this.#bridge.autosave();
    this.#renderer.draw(
      this.#bridge.getState(),
      this.#bridge.getSelectedCell(),
      this.#bridge.getSelectedTool(),
      time,
    );
    this.#bridge.renderUi();
  }

  private frameFarm(): void {
    const state = this.#bridge.getState();
    const camera = this.cameras.main;
    this.configureCameraBounds();
    const frameLeft = -TILE_SIZE * 3;
    const frameRight = state.width * TILE_SIZE + TILE_SIZE * 3;
    const frameTop = -TILE_SIZE;
    const frameBottom = state.height * TILE_SIZE + TILE_SIZE;
    const farmWidth = frameRight - frameLeft;
    const farmHeight = frameBottom - frameTop;
    const fitZoom = Math.min(
      2,
      camera.width / (farmWidth + TILE_SIZE),
      camera.height / (farmHeight + TILE_SIZE),
    );
    camera.setZoom(Math.max(this.minimumCameraZoom(), 1.05, fitZoom));
    camera.centerOn((frameLeft + frameRight) / 2, (frameTop + frameBottom) / 2);
  }

  recenter(): void {
    if (!this.cameras?.main) return;
    this.#cameraMoved = false;
    this.frameFarm();
  }

  private configureCameraBounds(): void {
    const state = this.#bridge.getState();
    const margin = FARM_ENVIRONMENT_MARGIN_TILES * TILE_SIZE;
    this.cameras.main.setBounds(
      -margin,
      -margin,
      state.width * TILE_SIZE + margin * 2,
      state.height * TILE_SIZE + margin * 2,
    );
  }

  private minimumCameraZoom(): number {
    const state = this.#bridge.getState();
    const margin = FARM_ENVIRONMENT_MARGIN_TILES * TILE_SIZE;
    const worldWidth = state.width * TILE_SIZE + margin * 2;
    const worldHeight = state.height * TILE_SIZE + margin * 2;
    return Math.max(0.72, this.cameras.main.width / worldWidth, this.cameras.main.height / worldHeight);
  }

  private updateCamera(delta: number): void {
    if (domControlOwnsKeyboard()) return;
    const camera = this.cameras.main;
    const distance = (PAN_SPEED * delta) / 1000 / camera.zoom;
    let moved = false;
    if (this.#cursors.left.isDown || this.#wasd.A.isDown) { camera.scrollX -= distance; moved = true; }
    if (this.#cursors.right.isDown || this.#wasd.D.isDown) { camera.scrollX += distance; moved = true; }
    if (this.#cursors.up.isDown || this.#wasd.W.isDown) { camera.scrollY -= distance; moved = true; }
    if (this.#cursors.down.isDown || this.#wasd.S.isDown) { camera.scrollY += distance; moved = true; }
    if (moved) this.#cameraMoved = true;
  }

  private applyPointerTool(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(world.x / TILE_SIZE);
    const y = Math.floor(world.y / TILE_SIZE);
    const key = `${this.#bridge.getSelectedTool()}:${x},${y}`;
    if (key === this.#lastPaintKey) return;
    this.#lastPaintKey = key;
    this.#bridge.applyTool(x, y);
  }
}

function domControlOwnsKeyboard(): boolean {
  const active = document.activeElement;
  return active instanceof Element && Boolean(active.closest(
    'button, input, select, textarea, [contenteditable="true"], [role="button"], [role="separator"]',
  ));
}
