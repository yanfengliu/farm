import { buttonContent, iconSvg, type IconName } from './pixelIcons';
import { PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN } from './panelResize';

export type Tool = 'inspect' | 'plot' | 'well' | 'storage' | 'land' | 'bulldoze';
export type Panel = 'inventory' | 'requests' | 'goals' | 'mix' | 'inspect' | 'annotations';

export interface ToolDefinition {
  id: Tool;
  key: string;
  label: string;
  icon: IconName;
}

export interface FarmShellElements {
  hud: HTMLDivElement;
  toolbar: HTMLDivElement;
  panelContent: HTMLDivElement;
  canvasHost: HTMLDivElement;
  playArea: HTMLElement;
  sidePanel: HTMLElement;
  panelResizer: HTMLElement;
  tutorialLayer: HTMLDivElement;
}

export const FARM_TOOLS: ToolDefinition[] = [
  { id: 'inspect', key: 'I', label: 'Inspect', icon: 'inspect' },
  { id: 'plot', key: '1', label: 'Plot', icon: 'plot' },
  { id: 'well', key: '2', label: 'Well', icon: 'well' },
  { id: 'storage', key: '3', label: 'Storage', icon: 'storage' },
  { id: 'land', key: '4', label: 'Land', icon: 'land' },
  { id: 'bulldoze', key: 'B', label: 'Bulldoze', icon: 'bulldoze' },
  { id: 'inspect', key: 'Z', label: 'Undo', icon: 'undo' },
  { id: 'inspect', key: 'Y', label: 'Redo', icon: 'redo' },
];

export function toolLabel(tool: Tool): string {
  return FARM_TOOLS.find((item) => item.id === tool)?.label ?? tool;
}

export function mountFarmShell(): FarmShellElements {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root');

  app.innerHTML = `
    <div class="farm-shell">
      <header class="hud" id="hud"></header>
      <main class="play-area" id="play-area">
        <div id="game-canvas"></div>
        <div class="camera-hint" aria-label="Camera controls: Home to recenter, WASD or arrows to pan, mouse wheel to zoom"><kbd>Home</kbd> Recenter <span>&middot;</span> <kbd>WASD</kbd> Pan <span>&middot;</span> Wheel Zoom</div>
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
            aria-valuenow="${PANEL_WIDTH_DEFAULT}"
          ></div>
          <div class="panel-tabs">
            <button data-panel="inventory" title="Inventory" aria-label="Inventory">${buttonContent('backpack', 'Inventory')}</button>
            <button data-panel="requests" title="Village Requests" aria-label="Village Requests">${buttonContent('basket', 'Requests')}</button>
            <button data-panel="goals" title="Goals" aria-label="Goals">${buttonContent('flag', 'Goals')}</button>
            <button data-panel="mix" title="Crop Mix" aria-label="Crop Mix">${buttonContent('sliders', 'Mix')}</button>
            <button data-panel="inspect" title="Inspect" aria-label="Inspect">${buttonContent('inspect', 'Inspect')}</button>
            <button data-panel="annotations" title="Farm Notes" aria-label="Farm Notes">${buttonContent('note', 'Notes')}<span class="annotation-tab-count" hidden>0</span></button>
            <button class="panel-toggle" data-command="toggle-panel" title="Collapse panel" aria-label="Collapse panel">${iconSvg('redo')}</button>
          </div>
          <div
            class="panel-content"
            id="panel-content"
            data-player-scroll="side-panel"
            role="region"
            aria-label="Side panel content"
            tabindex="0"
          ></div>
        </aside>
      </main>
      <footer class="toolbar" id="toolbar"></footer>
      <div class="tutorial-layer" id="tutorial-layer"></div>
    </div>
  `;

  return {
    hud: requireElement<HTMLDivElement>('#hud'),
    toolbar: requireElement<HTMLDivElement>('#toolbar'),
    panelContent: requireElement<HTMLDivElement>('#panel-content'),
    canvasHost: requireElement<HTMLDivElement>('#game-canvas'),
    playArea: requireElement<HTMLElement>('#play-area'),
    sidePanel: requireElement<HTMLElement>('#side-panel'),
    panelResizer: requireElement<HTMLElement>('[data-panel-resizer]'),
    tutorialLayer: requireElement<HTMLDivElement>('#tutorial-layer'),
  };
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing app shell element: ${selector}`);
  return element;
}
