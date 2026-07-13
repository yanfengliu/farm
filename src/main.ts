import Phaser from 'phaser';
import './styles.css';
import { installFarmDebug } from './debug/installFarmDebug';
import { FarmReplayWindow } from './debug/farmReplayWindow';
import {
  createFarmGame,
  getFarmSnapshot,
  renderFarmToText,
  submitFarmCommand,
  type FarmGame,
} from './game/simulation/farmGame';
import type { SessionBundle } from './game/simulation/civEngine';
import { FarmScene } from './phaser/scenes/FarmScene';
import { clearFarmSave, loadSavedFarmState, saveFarmState } from './persistence/localSave';
import { FarmUiController } from './ui/farmUiController';
import { FarmAnnotationController } from './ui/farmAnnotationController';

let farmGame: FarmGame = createFarmGame({ state: loadSavedFarmState() ?? undefined });
const farmReplayWindow = new FarmReplayWindow(farmGame, import.meta.env.DEV);
let simulationRemainderMs = 0;
let lastSavedAt = 0;

const ui = new FarmUiController({
  getState: () => getFarmSnapshot(farmGame),
  submit: (command) => submitFarmCommand(farmGame, command),
  resetFarm,
});

let annotations: FarmAnnotationController | null = null;
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
  captureAnnotation: (pick) => annotations?.capturePick(pick) ?? false,
  isAnnotationDrafting: () => annotations?.isDrafting ?? false,
});

const annotationController = new FarmAnnotationController({
  shell: ui.shell,
  getState: () => getFarmSnapshot(farmGame),
  renderStateText: () => renderFarmToText(farmGame),
  getInteraction: () => ui.annotationInteraction(),
  getPaused: () => ui.paused,
  setPaused: (paused) => ui.setPaused(paused),
  openPanel: () => ui.openAnnotationPanel(),
  invalidatePanel: () => ui.invalidateAnnotationPanel(),
  projectWorld: (point) => farmScene.projectWorldPoint(point),
  restoreCamera: (camera) => farmScene.restoreAnnotationCamera(camera),
  captureKeyboardPick: () => farmScene.captureKeyboardAnnotationPick(),
});
annotations = annotationController;
ui.attachAnnotationUi(annotationController);

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
  renderText: () => `${renderFarmToText(farmGame)}\n${annotationController.getContext()}`,
  advanceTime: (ms) => {
    farmReplayWindow.advanceByMs(ms);
    persistFarm();
  },
  getState: () => getFarmSnapshot(farmGame),
  reset: resetFarm,
  exportBundle: exportFarmBundle,
  getAnnotations: () => annotationController.getStore(),
  getAnnotationContext: () => annotationController.getContext(),
  exportAnnotation: (id) => annotationController.exportAnnotation(id),
  exportAnnotations: () => annotationController.exportAnnotations(),
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
  farmReplayWindow.advance(ticks);
  simulationRemainderMs -= ticks * 100;
}

function resetFarm(): void {
  const saveCleared = clearFarmSave();
  annotationController.onFarmReset();
  farmGame = createFarmGame({ seed: 'farm' });
  farmReplayWindow.replaceGame(farmGame);
  simulationRemainderMs = 0;
  farmScene.recenter();
  ui.setPersistenceWarning(saveCleared
    ? null
    : 'Stored save could not be cleared - this tab was reset and autosave will keep retrying.');
  ui.invalidateAfterReset();
}

function exportFarmBundle(): SessionBundle | null {
  return farmReplayWindow.exportBundle();
}
