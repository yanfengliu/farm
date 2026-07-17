/**
 * The two calls every farm art function actually makes. Phaser's Graphics
 * object satisfies this structurally, and a DOM canvas 2D context can be
 * adapted to it in a few lines, so the same deterministic pixel art can render
 * into the scene and into DOM surfaces such as Inspect portraits without
 * duplicating a single sprite.
 */
export interface PixelPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
}
