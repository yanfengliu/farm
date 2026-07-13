import Phaser from 'phaser';
import './styles.css';
import { installFarmDebug } from './debug/installFarmDebug';
import {
  advanceFarm,
  advanceFarmByMs,
  createFarmGame,
  getFarmSnapshot,
  renderFarmToText,
  submitFarmCommand,
  type FarmGame,
} from './game/simulation/farmGame';
import { SessionRecorder, type SessionBundle } from './game/simulation/civEngine';
import { FarmScene } from './phaser/scenes/FarmScene';
import { clearFarmSave, loadSavedFarmState, saveFarmState } from './persistence/localSave';
import { FarmUiController } from './ui/farmUiController';

let farmGame: FarmGame = createFarmGame({ state: loadSavedFarmState() ?? undefined });
let farmRecorder: SessionRecorder | null = null;
let simulationRemainderMs = 0;
let lastSavedAt = 0;

function attachFarmRecorder(): void {
  if (!import.meta.env.DEV) return;
  try {
    farmRecorder?.disconnect();
  } catch {
    // The previous recorder may already be disconnected or its world gone.
  }
  farmRecorder = new SessionRecorder({ world: farmGame });
  farmRecorder.connect();
}

attachFarmRecorder();

const ui = new FarmUiController({
  getState: () => getFarmSnapshot(farmGame),
  submit: (command) => submitFarmCommand(farmGame, command),
  resetFarm,
});

const farmScene = new FarmScene({
  getState: () => getFarmSnapshot(farmGame),
  advance: (delta) => {
    if (!ui.paused) advanceRealtime(delta * ui.speed);
  },
  autosave,
  renderUi: () => ui.render(),
  getSelectedTool: () => ui.selectedTool,
  getSelectedCell: () => ui.selectedCell,
  applyTool: (x, y) => ui.applyTool(x, y),
  canDragTool: () => ui.canDragTool(),
});

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: ui.shell.canvasHost,
  width: ui.shell.canvasHost.clientWidth,
  height: ui.shell.canvasHost.clientHeight,
  backgroundColor: '#3f5f32',
  pixelArt: true,
  audio: { noAudio: true },
  scene: farmScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: ui.shell.canvasHost,
  },
});

installFarmDebug({
  renderText: () => renderFarmToText(farmGame),
  advanceTime: (ms) => {
    advanceFarmByMs(farmGame, ms);
    persistFarm();
  },
  getState: () => getFarmSnapshot(farmGame),
  reset: resetFarm,
  exportBundle: exportFarmBundle,
});

function autosave(): void {
  const now = performance.now();
  if (now - lastSavedAt < 1000) return;
  persistFarm();
  lastSavedAt = now;
}

function persistFarm(): void {
  const saved = saveFarmState(getFarmSnapshot(farmGame));
  ui.setPersistenceWarning(saved
    ? null
    : 'Autosave unavailable - progress remains in this tab. Free browser storage, then keep playing to retry.');
}

function advanceRealtime(ms: number): void {
  simulationRemainderMs += ms;
  const ticks = Math.floor(simulationRemainderMs / 100);
  if (ticks <= 0) return;
  advanceFarm(farmGame, ticks);
  simulationRemainderMs -= ticks * 100;
}

function resetFarm(): void {
  const saveCleared = clearFarmSave();
  farmGame = createFarmGame({ seed: 'farm' });
  attachFarmRecorder();
  simulationRemainderMs = 0;
  farmScene.recenter();
  ui.setPersistenceWarning(saveCleared
    ? null
    : 'Stored save could not be cleared - this tab was reset and autosave will keep retrying.');
  ui.invalidateAfterReset();
}

function exportFarmBundle(): SessionBundle | null {
  if (!farmRecorder) return null;
  // Disconnect first so the bundle includes its terminal snapshot, then
  // attach a fresh recorder so playtest recording continues after export.
  const recorder = farmRecorder;
  recorder.disconnect();
  const bundle = recorder.toBundle();
  attachFarmRecorder();
  return bundle;
}
