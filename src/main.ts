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
import { clearFarmSave, loadFarmSave, saveFarmState } from './persistence/localSave';
import { FarmUiController } from './ui/farmUiController';
import { FarmAnnotationController } from './ui/farmAnnotationController';

const savedFarm = loadFarmSave();
let farmGame: FarmGame = createFarmGame({ state: savedFarm.status === 'loaded' ? savedFarm.state : undefined });
const farmReplayWindow = new FarmReplayWindow(farmGame, import.meta.env.DEV);
let simulationRemainderMs = 0;
let lastSavedAt = 0;
// A save we cannot read is still the player's farm. Autosaving over it would be
// unrecoverable loss they never agreed to, so persistence stops until Reset says otherwise.
let autosaveBlocked = savedFarm.status === 'unreadable';

const ui = new FarmUiController({
  getState: () => getFarmSnapshot(farmGame),
  submit: (command) => {
    submitFarmCommand(farmGame, command);
    // Commands queue into the engine world and apply on the next tick, and a
    // paused farm never ticks on its own - without this, every paused click
    // looks dead and then bursts on resume. One recorded tick per edit keeps
    // paused edits visible and deterministic while autonomous work stays halted.
    if (ui.paused) farmReplayWindow.advance(1);
  },
  resetFarm,
});

if (autosaveBlocked) {
  // Under ~55 characters: the HUD alert ellipsizes at 1024x720, and anything longer
  // loses the half naming the way out. `persistFarm` leaves this standing while blocked.
  ui.setPersistenceWarning('Saved farm unreadable - autosave off until Reset.');
}

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
  getSelectedFarmhandId: () => ui.selectedFarmhandId,
  applyTool: (x, y) => ui.applyTool(x, y),
  canDragTool: () => ui.canDragTool(),
  annotationPointerDown: (pick) => annotations?.handlePointerDown(pick) ?? false,
  annotationPointerMove: (pick) => annotations?.handlePointerMove(pick) ?? false,
  annotationPointerUp: (pick) => annotations?.handlePointerUp(pick) ?? false,
  cancelAnnotationPointer: () => annotations?.cancelPointerSelection(),
  annotationOwnsGameplayInput: () => annotations?.ownsGameplayInput ?? false,
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
  // Returning early is the whole guard: the unreadable save stays untouched, and the
  // standing warning stays on screen because nothing here clears it.
  if (autosaveBlocked) return;
  const saved = saveFarmState(getFarmSnapshot(farmGame));
  ui.setPersistenceWarning(saved
    ? null
    : 'Autosave unavailable - free browser storage to retry.');
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
  // Reset is the player consenting to drop the unreadable save, so persistence resumes.
  autosaveBlocked = false;
  farmScene.recenter();
  ui.setPersistenceWarning(saveCleared
    ? null
    : 'Stored save could not be cleared - this tab is reset.');
  ui.invalidateAfterReset();
}

function exportFarmBundle(): SessionBundle | null {
  return farmReplayWindow.exportBundle();
}
