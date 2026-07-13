import type { FarmState } from '../game/simulation/farmGame';
import { FARM_TOOLS, type Panel, type Tool, type FarmShellElements } from './appShell';
import { iconSvg } from './pixelIcons';
import { selectTutorialTip, type TutorialTip } from './tutorialGuide';

type TutorialTipPlacement = 'above' | 'below' | 'side-left';

const TUTORIAL_STORAGE_KEY = 'farm-tutorial-seen-v1';
const TUTORIAL_TIP_WIDTH = 348;
const TUTORIAL_VIEWPORT_PADDING = 8;
const TUTORIAL_TARGET_GAP = 12;

export class TutorialOverlay {
  readonly #shell: FarmShellElements;
  readonly #seen = loadTutorialSeen();
  #lastMarkup = '';
  #activeTip: TutorialTip | null = null;

  constructor(shell: FarmShellElements) {
    this.#shell = shell;
  }

  render(state: FarmState, activePanel: Panel, selectedTool: Tool): void {
    const candidate = selectTutorialTip(state, {
      activePanel,
      selectedTool,
      isSeen: (id) => this.isSeen(id),
    });
    const stickyTip = this.#activeTip && !this.isSeen(this.#activeTip.id) ? this.#activeTip : null;
    const tip = stickyTip ?? candidate;

    if (!tip) {
      this.clear();
      return;
    }

    const target = this.visibleTarget(tip.targetSelector);
    if (!target) {
      if (stickyTip && this.#lastMarkup) return;
      this.clear();
      return;
    }

    if (!this.#activeTip || this.#activeTip.id !== tip.id || this.#activeTip.targetSelector !== tip.targetSelector) {
      this.#activeTip = tip;
    }

    const { left, top, placement } = this.tipPosition(target);
    const markup = `
      <aside class="tutorial-tip ${placement}" style="left: ${left}px; top: ${top}px;" data-tutorial-tip="${tip.id}">
        <div class="tutorial-callout-icon">${iconSvg(tip.icon)}</div>
        <div class="tutorial-copy">
          <span class="tutorial-kicker">Farm Guide</span>
          <strong class="tutorial-title">${tip.title}</strong>
          <p class="tutorial-summary">${tip.body}</p>
          <div class="tutorial-details">
            <section class="tutorial-detail">
              <span class="tutorial-detail-label">Do</span>
              <p>${tip.action}</p>
            </section>
            <section class="tutorial-detail">
              <span class="tutorial-detail-label">Why</span>
              <p>${tip.why}</p>
            </section>
          </div>
        </div>
        <button class="tutorial-close" data-command="dismiss-tutorial" title="Dismiss tip" aria-label="Dismiss tip">x</button>
      </aside>
    `;
    if (markup !== this.#lastMarkup) {
      this.#shell.tutorialLayer.innerHTML = markup;
      this.#lastMarkup = markup;
    }
    this.keepInView();
  }

  isSeen(id: string): boolean {
    return this.#seen[id] === true;
  }

  markSeen(id: string): void {
    this.#seen[id] = true;
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(this.#seen));
    } catch {
      // Local storage can fail in private or restricted browser contexts.
    }
    this.clear();
  }

  activeTargetContains(target: Element): boolean {
    return this.#activeTip ? Boolean(target.closest(this.#activeTip.targetSelector)) : false;
  }

  markActiveTargetSeen(): void {
    if (this.#activeTip) this.markSeen(this.#activeTip.id);
  }

  markShortcutSeen(key: string): void {
    if (!this.#activeTip) return;
    const normalizedKey = key.toLowerCase();
    const tool = FARM_TOOLS.find((item) => item.key.toLowerCase() === normalizedKey);
    if (tool && this.#activeTip.targetSelector === `[data-tool="${tool.id}"]`) {
      this.markSeen(this.#activeTip.id);
    }
  }

  invalidate(): void {
    this.#activeTip = null;
    this.#lastMarkup = '';
  }

  private tipPosition(target: HTMLElement): { left: number; top: number; placement: TutorialTipPlacement } {
    const rect = target.getBoundingClientRect();
    const panelRect = this.#shell.sidePanel.getBoundingClientRect();
    const sidePanelTarget = this.#shell.sidePanel.contains(target);

    if (sidePanelTarget && panelRect.left - TUTORIAL_TIP_WIDTH - TUTORIAL_TARGET_GAP >= TUTORIAL_VIEWPORT_PADDING) {
      return {
        placement: 'side-left',
        left: Math.round(panelRect.left - TUTORIAL_TIP_WIDTH - TUTORIAL_TARGET_GAP),
        top: Math.round(rect.top + rect.height / 2),
      };
    }

    const left = clamp(
      rect.left + rect.width / 2 - TUTORIAL_TIP_WIDTH / 2,
      TUTORIAL_VIEWPORT_PADDING,
      window.innerWidth - TUTORIAL_TIP_WIDTH - TUTORIAL_VIEWPORT_PADDING,
    );
    const above = rect.top > window.innerHeight * 0.55;
    const top = above ? rect.top - TUTORIAL_TARGET_GAP : rect.bottom + TUTORIAL_TARGET_GAP;
    return { placement: above ? 'above' : 'below', left: Math.round(left), top: Math.round(top) };
  }

  private keepInView(): void {
    const tip = this.#shell.tutorialLayer.querySelector<HTMLElement>('.tutorial-tip');
    if (!tip) return;

    const minTop = this.#shell.playArea.getBoundingClientRect().top + TUTORIAL_VIEWPORT_PADDING;
    const maxBottom = this.#shell.toolbar.getBoundingClientRect().top - TUTORIAL_VIEWPORT_PADDING;
    let left = Number.parseFloat(tip.style.left || '0');
    let top = Number.parseFloat(tip.style.top || '0');
    const rect = tip.getBoundingClientRect();

    if (rect.left < TUTORIAL_VIEWPORT_PADDING) left += TUTORIAL_VIEWPORT_PADDING - rect.left;
    if (rect.right > window.innerWidth - TUTORIAL_VIEWPORT_PADDING) {
      left -= rect.right - (window.innerWidth - TUTORIAL_VIEWPORT_PADDING);
    }
    if (rect.top < minTop) top += minTop - rect.top;
    if (rect.bottom > maxBottom) top -= rect.bottom - maxBottom;

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${top}px`;
  }

  private visibleTarget(selector: string): HTMLElement | null {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? target : null;
  }

  private clear(): void {
    this.#activeTip = null;
    if (!this.#lastMarkup) return;
    this.#shell.tutorialLayer.innerHTML = '';
    this.#lastMarkup = '';
  }
}

function loadTutorialSeen(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
