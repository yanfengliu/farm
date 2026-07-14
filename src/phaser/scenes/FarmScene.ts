import Phaser from 'phaser';
import type { FarmAnnotationPick } from '../../annotations/farmAnnotations';
import type { FarmState } from '../../game/simulation/farmGame';
import { FarmRenderer, TILE_SIZE } from '../view/farmRenderer';
import { buildFarmSceneryLayout, FARM_ENVIRONMENT_MARGIN_TILES } from '../view/farmSceneryLayout';

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
  annotationPointerDown(pick: FarmAnnotationPick): boolean;
  annotationPointerMove(pick: FarmAnnotationPick): boolean;
  annotationPointerUp(pick: FarmAnnotationPick): boolean;
  cancelAnnotationPointer(): void;
  annotationOwnsGameplayInput(): boolean;
}

const PAN_SPEED = 420;

export class FarmScene extends Phaser.Scene {
  readonly #bridge: FarmSceneBridge;
  #renderer!: FarmRenderer;
  #cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  #wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  #lastPaintKey = '';
  #cameraMoved = false;
  #pointerCapturedAnnotation = false;
  #annotationPointerId: number | null = null;
  #latestNativePointerId: number | null = null;

  constructor(bridge: FarmSceneBridge) {
    super('FarmScene');
    this.#bridge = bridge;
  }

  create(): void {
    this.#renderer = new FarmRenderer(this);
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute('aria-label', 'Farm canvas. In Point note mode, press Enter to capture the center target; in Box mode, drag to select an area.');
    this.cameras.main.setBackgroundColor('#3f5f32');
    this.frameFarm();
    this.#cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.#wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.removeCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.HOME,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
    ]);
    this.input.keyboard!.on('keydown-HOME', () => {
      if (!this.#bridge.annotationOwnsGameplayInput() && !domControlOwnsKeyboard()) this.recenter();
    });
    const rememberNativePointer = (event: PointerEvent) => { this.#latestNativePointerId = event.pointerId; };
    this.game.canvas.addEventListener('pointerdown', rememberNativePointer, true);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) return;
      this.#lastPaintKey = '';
      this.#pointerCapturedAnnotation = this.#bridge.annotationPointerDown(this.annotationPick(pointer.x, pointer.y));
      if (this.#pointerCapturedAnnotation) {
        this.#annotationPointerId = captureNativePointer(this.game.canvas, pointer, this.#latestNativePointerId);
        return;
      }
      this.applyPointerTool(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.#pointerCapturedAnnotation) {
        this.#bridge.annotationPointerMove(this.annotationPick(pointer.x, pointer.y));
        return;
      }
      if (!pointer.isDown || !this.#bridge.canDragTool()) return;
      this.applyPointerTool(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      try {
        if (this.#pointerCapturedAnnotation) {
          this.#bridge.annotationPointerUp(this.annotationPick(pointer.x, pointer.y));
        }
      } finally {
        releaseNativePointer(this.game.canvas, this.#annotationPointerId);
        this.#annotationPointerId = null;
        this.#latestNativePointerId = null;
        this.#pointerCapturedAnnotation = false;
      }
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (this.#bridge.annotationOwnsGameplayInput()) return;
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom + (dy > 0 ? -0.08 : 0.08), this.minimumCameraZoom(), 2.8));
      this.#cameraMoved = true;
    });
    this.scale.on('resize', () => {
      this.cancelAnnotationPointer();
      this.configureCameraBounds();
      if (!this.#cameraMoved) this.frameFarm();
      else this.cameras.main.setZoom(Math.max(this.cameras.main.zoom, this.minimumCameraZoom()));
    });
    const cancelPointer = () => this.cancelAnnotationPointer();
    this.game.canvas.addEventListener('pointercancel', cancelPointer);
    this.game.canvas.addEventListener('lostpointercapture', cancelPointer);
    window.addEventListener('blur', cancelPointer);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cancelAnnotationPointer();
      this.game.canvas.removeEventListener('pointerdown', rememberNativePointer, true);
      this.game.canvas.removeEventListener('pointercancel', cancelPointer);
      this.game.canvas.removeEventListener('lostpointercapture', cancelPointer);
      window.removeEventListener('blur', cancelPointer);
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
      delta,
    );
    this.#bridge.renderUi();
  }

  private frameFarm(): void {
    const state = this.#bridge.getState();
    const camera = this.cameras.main;
    this.configureCameraBounds();
    const { frame } = buildFarmSceneryLayout(state.width, state.height, TILE_SIZE);
    const frameLeft = frame.left;
    const frameRight = frame.right;
    const frameTop = frame.top;
    const frameBottom = frame.bottom;
    const farmWidth = frameRight - frameLeft;
    const farmHeight = frameBottom - frameTop;
    const fitZoom = Math.min(
      2,
      camera.width / (farmWidth + TILE_SIZE),
      camera.height / (farmHeight + TILE_SIZE),
    );
    camera.setZoom(Math.max(this.minimumCameraZoom(), 0.78, fitZoom));
    camera.centerOn((frameLeft + frameRight) / 2, (frameTop + frameBottom) / 2);
  }

  recenter(): void {
    if (!this.cameras?.main) return;
    this.#cameraMoved = false;
    this.frameFarm();
  }

  projectWorldPoint(worldPx: { x: number; y: number }): { x: number; y: number; visible: boolean } | null {
    if (!this.cameras?.main) return null;
    const camera = this.cameras.main;
    const x = (worldPx.x - camera.worldView.x) * camera.zoom;
    const y = (worldPx.y - camera.worldView.y) * camera.zoom;
    return {
      x,
      y,
      visible: x >= -24 && y >= -24 && x <= camera.width + 24 && y <= camera.height + 24,
    };
  }

  restoreAnnotationCamera(snapshot: FarmAnnotationPick['camera']): void {
    if (!this.cameras?.main) return;
    const camera = this.cameras.main;
    camera.setZoom(Phaser.Math.Clamp(snapshot.zoom, this.minimumCameraZoom(), 2.8));
    camera.setScroll(snapshot.scrollX, snapshot.scrollY);
    this.#cameraMoved = true;
  }

  captureKeyboardAnnotationPick(): FarmAnnotationPick | null {
    if (!this.cameras?.main) return null;
    const camera = this.cameras.main;
    return this.annotationPick(camera.width / 2, camera.height / 2);
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
    if (this.#bridge.annotationOwnsGameplayInput() || domControlOwnsKeyboard()) return;
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

  private annotationPick(canvasX: number, canvasY: number): FarmAnnotationPick {
    const camera = this.cameras.main;
    canvasX = Phaser.Math.Clamp(canvasX, 0, camera.width);
    canvasY = Phaser.Math.Clamp(canvasY, 0, camera.height);
    const world = camera.getWorldPoint(canvasX, canvasY);
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    return {
      clientPx: { x: rect.left + canvasX, y: rect.top + canvasY },
      canvasPx: {
        x: canvasX,
        y: canvasY,
        normalizedX: rect.width > 0 ? canvasX / rect.width : 0,
        normalizedY: rect.height > 0 ? canvasY / rect.height : 0,
      },
      worldPx: { x: world.x, y: world.y },
      gridCell: { x: Math.floor(world.x / TILE_SIZE), y: Math.floor(world.y / TILE_SIZE) },
      camera: {
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        zoom: camera.zoom,
        width: camera.width,
        height: camera.height,
        worldView: {
          x: camera.worldView.x,
          y: camera.worldView.y,
          width: camera.worldView.width,
          height: camera.worldView.height,
        },
      },
      viewport: {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        drawingBuffer: { width: canvas.width, height: canvas.height },
      },
      presentationTimeMs: performance.now(),
      previewDataUrl: null,
    };
  }

  private cancelAnnotationPointer(): void {
    if (!this.#pointerCapturedAnnotation && !this.#bridge.annotationOwnsGameplayInput()) return;
    this.#pointerCapturedAnnotation = false;
    releaseNativePointer(this.game.canvas, this.#annotationPointerId);
    this.#annotationPointerId = null;
    this.#latestNativePointerId = null;
    this.#bridge.cancelAnnotationPointer();
  }
}

function captureNativePointer(
  canvas: HTMLCanvasElement,
  pointer: Phaser.Input.Pointer,
  nativePointerId: number | null,
): number | null {
  const eventPointerId = (pointer.event as { pointerId?: unknown } | undefined)?.pointerId;
  const pointerId = typeof eventPointerId === 'number' ? eventPointerId : nativePointerId;
  if (typeof pointerId === 'number' && Number.isInteger(pointerId) && !canvas.hasPointerCapture(pointerId)) {
    try {
      canvas.setPointerCapture(pointerId);
      return pointerId;
    } catch {
      return null;
    }
  }
  return null;
}

function releaseNativePointer(canvas: HTMLCanvasElement, pointerId: number | null): void {
  if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
}

function domControlOwnsKeyboard(): boolean {
  const active = document.activeElement;
  return active instanceof Element && Boolean(active.closest(
    'button, input, select, textarea, [contenteditable="true"], [role="button"], [role="separator"]',
  ));
}
