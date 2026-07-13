import {
  advanceFarm,
  farmTicksForMs,
  type FarmGame,
} from '../game/simulation/farmGame';
import { SessionRecorder, type SessionBundle } from '../game/simulation/civEngine';

// The browser recorder stores one deterministic diff per simulation tick. A
// full 120-decision visual shift can span many thousands of accelerated ticks,
// so replay evidence deliberately covers a recent, strongly checkable window
// instead of trying to move an unbounded bundle through Playwright's protocol.
export const FARM_REPLAY_WINDOW_TICKS = 64;

export class FarmReplayWindow {
  #game: FarmGame;
  #recorder: SessionRecorder | null = null;
  #lastCompleteBundle: SessionBundle | null = null;
  #coverageInvalidated = false;
  readonly #coverageOriginTick: number;
  readonly #enabled: boolean;

  constructor(game: FarmGame, enabled: boolean) {
    this.#game = game;
    this.#coverageOriginTick = game.tick;
    this.#enabled = enabled;
    this.#attach();
  }

  advance(ticks: number): void {
    let remaining = Math.max(0, Math.floor(ticks));
    if (!this.#enabled) {
      advanceFarm(this.#game, remaining);
      return;
    }

    while (remaining > 0) {
      if (!this.#recorder) this.#attach();
      const room = FARM_REPLAY_WINDOW_TICKS - (this.#recorder?.tickCount ?? 0);
      const chunk = Math.min(remaining, room);
      advanceFarm(this.#game, chunk);
      remaining -= chunk;
      if (this.#recorder?.tickCount === FARM_REPLAY_WINDOW_TICKS) this.#rotate();
    }
  }

  advanceByMs(ms: number): void {
    this.advance(farmTicksForMs(ms));
  }

  replaceGame(game: FarmGame): void {
    this.dispose();
    this.#lastCompleteBundle = null;
    this.#coverageInvalidated = true;
    this.#game = game;
    this.#attach();
  }

  exportBundle(): SessionBundle | null {
    if (!this.#recorder) return null;
    const recorder = this.#recorder;
    recorder.disconnect();
    const currentBundle = recorder.toBundle();
    const bundle = recorder.tickCount > 0 ? currentBundle : this.#lastCompleteBundle;
    if (bundle) {
      const coversWholeRecording = !this.#coverageInvalidated
        && bundle.metadata.startTick === this.#coverageOriginTick;
      bundle.metadata.sourceLabel = `farm-terminal-replay-window:${coversWholeRecording ? 'full' : 'partial'}`;
    }
    this.#recorder = null;
    this.#lastCompleteBundle = null;
    this.#attach();
    return bundle;
  }

  dispose(): void {
    if (!this.#recorder) return;
    this.#recorder.disconnect();
    this.#recorder = null;
  }

  #rotate(): void {
    if (this.#recorder) {
      this.#recorder.disconnect();
      this.#lastCompleteBundle = this.#recorder.toBundle();
      this.#recorder = null;
    }
    this.#attach();
  }

  #attach(): void {
    if (!this.#enabled) return;
    this.#recorder = new SessionRecorder({
      world: this.#game,
      snapshotInterval: null,
      sourceLabel: 'farm-terminal-replay-window',
    });
    this.#recorder.connect();
  }
}
