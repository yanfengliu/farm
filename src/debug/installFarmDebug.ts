import type { SessionBundle } from '../game/simulation/civEngine';
import type { FarmState } from '../game/simulation/farmGame';
import type { FarmAnnotationStore } from '../annotations/farmAnnotations';

export interface FarmDebugBridge {
  renderText(): string;
  advanceTime(ms: number): void;
  getState(): FarmState;
  reset(): void;
  exportBundle(): SessionBundle | null;
  getAnnotations(): FarmAnnotationStore;
  getAnnotationContext(): string;
  exportAnnotation(id: string): string | null;
  exportAnnotations(): string;
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __farmDebug: {
      getState: () => FarmState;
      reset: () => void;
      exportBundle: () => SessionBundle | null;
      getAnnotations: () => FarmAnnotationStore;
      getAnnotationContext: () => string;
      exportAnnotation: (id: string) => string | null;
      exportAnnotations: () => string;
    };
  }
}

export function installFarmDebug(bridge: FarmDebugBridge): void {
  window.render_game_to_text = () => bridge.renderText();
  window.advanceTime = (ms: number) => bridge.advanceTime(ms);
  window.__farmDebug = {
    getState: () => bridge.getState(),
    reset: () => bridge.reset(),
    exportBundle: () => bridge.exportBundle(),
    getAnnotations: () => bridge.getAnnotations(),
    getAnnotationContext: () => bridge.getAnnotationContext(),
    exportAnnotation: (id) => bridge.exportAnnotation(id),
    exportAnnotations: () => bridge.exportAnnotations(),
  };
}
