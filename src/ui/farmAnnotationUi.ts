import type { FarmState } from '../game/simulation/farmGame';
import type { FarmAnnotationPick } from '../annotations/farmAnnotations';

export interface FarmAnnotationUi {
  readonly isAiming: boolean;
  readonly isDrafting: boolean;
  readonly ownsGameplayInput: boolean;
  readonly count: number;
  panelMarkup(state: FarmState): string;
  handleClick(target: Element): boolean;
  handleInput(target: Element): boolean;
  handleKeydown(event: KeyboardEvent): boolean;
  handlePointerDown(pick: FarmAnnotationPick): boolean;
  handlePointerMove(pick: FarmAnnotationPick): boolean;
  handlePointerUp(pick: FarmAnnotationPick): boolean;
  cancelPointerSelection(): void;
  renderOverlay(): void;
  toggleAiming(): void;
  stopAiming(): void;
  onFarmReset(): void;
}
