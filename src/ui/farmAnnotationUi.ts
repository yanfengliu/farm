import type { FarmState } from '../game/simulation/farmGame';

export interface FarmAnnotationUi {
  readonly isAiming: boolean;
  readonly isDrafting: boolean;
  readonly count: number;
  panelMarkup(state: FarmState): string;
  handleClick(target: Element): boolean;
  handleInput(target: Element): boolean;
  handleKeydown(event: KeyboardEvent): boolean;
  renderOverlay(): void;
  toggleAiming(): void;
  stopAiming(): void;
  onFarmReset(): void;
}
