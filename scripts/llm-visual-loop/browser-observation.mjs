import path from 'node:path';

export async function captureVisualObservation(page, stepIndex, label, options) {
  const { cwd, screenshotDir, playerActionSelector } = options;
  const screenshotName = `${String(stepIndex).padStart(2, '0')}-${label}.png`;
  const screenshotFile = path.join(screenshotDir, screenshotName);
  const absoluteScreenshotFile = path.resolve(cwd, screenshotFile);
  const screenshotPath = path.join('steps', screenshotName).replaceAll('\\', '/');

  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  const observation = await page.evaluate(({ observationIndex, observationLabel, screenshotPath, screenshotFile, playerActionSelector }) => {
    const visibleText = visibleTextForPlayer();
    const availableActions = Array.from(document.querySelectorAll(playerActionSelector))
      .filter((element) => isVisible(element) && isReachableToPlayer(element) && !element.disabled)
      .map((element) => ({
        label: actionLabelFor(element), selector: playerSelectorFor(element), tagName: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || undefined, role: element.getAttribute('role') || undefined,
        actionHint: actionHintFor(element), state: controlStateFor(element), bounds: roundedBounds(element.getBoundingClientRect()),
      }));
    const keyboardActions = playerKeyboardActions();
    return {
      index: observationIndex, label: observationLabel, screenshot: screenshotPath, screenshotFile,
      viewport: { width: window.innerWidth, height: window.innerHeight, deviceScaleFactor: window.devicePixelRatio },
      visibleText, availableActions, keyboardActions,
      prompt: buildDecisionPrompt({ screenshotPath, screenshotFile, visibleText, availableActions, keyboardActions }),
    };

    function buildDecisionPrompt(observation) {
      return [
        'You are playtesting a desktop idle farming game as a real player.',
        'Use the screenshot, visible controls, and listed keyboard controls only. Pick one action from the schema: click, hover, drag, adjust, type, wheel, press, wait, viewport, or stop. Click and canvas drag actions may include x/y coordinates relative to the chosen element. Type actions may target only a listed text-entry control. Press actions must use a listed keyboard control; include its selector when the control says it requires focus.',
        `Screenshot file to inspect: ${observation.screenshotFile}`,
        JSON.stringify(observation, null, 2),
      ].join('\n\n');
    }

    function playerKeyboardActions() {
      return [
        { label: 'Pan camera left', key: 'ArrowLeft', alternateKeys: ['A'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera right', key: 'ArrowRight', alternateKeys: ['D'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera up', key: 'ArrowUp', alternateKeys: ['W'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Pan camera down', key: 'ArrowDown', alternateKeys: ['S'], actionHint: 'press', state: { canHold: true, suggestedDurationMs: 260 } },
        { label: 'Recenter camera', key: 'Home', alternateKeys: [], actionHint: 'press', state: { canHold: false } },
        ...toolbarShortcutKeyboardActions(),
        ...focusedControlKeyboardActions(),
      ];
    }

    function toolbarShortcutKeyboardActions() {
      return Array.from(document.querySelectorAll('.toolbar .tool-button'))
        .filter((button) => isVisible(button) && isReachableToPlayer(button))
        .map((button) => {
          const shortcut = button.querySelector?.('.key')?.textContent?.trim();
          if (!shortcut) return null;
          const label = actionLabelFor(button);
          return {
            label: shortcutKeyboardLabelFor(button, label), key: shortcut, alternateKeys: [], actionHint: 'press',
            selector: playerSelectorFor(button), state: { ...controlStateFor(button), canHold: false },
          };
        })
        .filter(Boolean);
    }

    function shortcutKeyboardLabelFor(button, label) {
      if (button.matches('[data-tool]')) return `Select ${label} tool`;
      if (button.matches('[data-command="undo"]')) return 'Undo';
      if (button.matches('[data-command="redo"]')) return 'Redo';
      if (button.matches('[data-command="pause"]')) return label;
      if (button.matches('[data-speed]')) return `Set ${label}`;
      return label;
    }

    function focusedControlKeyboardActions() {
      const actions = [];
      const resizer = document.querySelector('[data-panel-resizer]');
      if (resizer && isVisible(resizer) && isReachableToPlayer(resizer)) {
        const selector = playerSelectorFor(resizer);
        const state = { ...controlStateFor(resizer), canHold: false, requiresFocus: true };
        actions.push(
          { label: 'Resize side panel wider', key: 'ArrowLeft', alternateKeys: [], actionHint: 'press', selector, state },
          { label: 'Resize side panel narrower', key: 'ArrowRight', alternateKeys: [], actionHint: 'press', selector, state },
          { label: 'Resize side panel to minimum', key: 'Home', alternateKeys: [], actionHint: 'press', selector, state },
          { label: 'Resize side panel to maximum', key: 'End', alternateKeys: [], actionHint: 'press', selector, state },
        );
      }
      for (const input of document.querySelectorAll('input[type="range"], input[type="number"]')) {
        if (!isVisible(input) || !isReachableToPlayer(input) || input.disabled) continue;
        const selector = playerSelectorFor(input);
        const label = actionLabelFor(input);
        const state = { ...controlStateFor(input), canHold: false, requiresFocus: true };
        if (input instanceof HTMLInputElement && input.type === 'number') {
          actions.push(
            { label: `Decrease number value: ${label}`, key: 'ArrowDown', alternateKeys: [], actionHint: 'press', selector, state },
            { label: `Increase number value: ${label}`, key: 'ArrowUp', alternateKeys: [], actionHint: 'press', selector, state },
          );
        } else {
          actions.push(
            { label: `Decrease range value: ${label}`, key: 'ArrowLeft', alternateKeys: [], actionHint: 'press', selector, state },
            { label: `Increase range value: ${label}`, key: 'ArrowRight', alternateKeys: [], actionHint: 'press', selector, state },
          );
        }
      }
      return actions;
    }

    function actionHintFor(element) {
      if (element.matches('[data-player-scroll]')) return 'scroll';
      if (element.matches('canvas')) return 'click-or-drag-canvas-coordinate';
      if (element.matches('[role="separator"]')) return 'drag-resize';
      if (element.matches('input[type="range"], input[type="number"]')) return 'adjust';
      if (element.matches('textarea')) return 'type-text';
      return 'click';
    }

    function controlStateFor(element) {
      const state = { active: element.classList.contains('active') };
      const shortcut = element.querySelector?.('.key')?.textContent?.trim();
      if (shortcut) state.shortcut = shortcut;
      const ariaPressed = element.getAttribute('aria-pressed');
      if (ariaPressed !== null) state.pressed = ariaPressed;
      const ariaExpanded = element.getAttribute('aria-expanded');
      if (ariaExpanded !== null) state.expanded = ariaExpanded;
      if (element instanceof HTMLInputElement) {
        state.value = element.value;
        if (element.min !== '') state.min = element.min;
        if (element.max !== '') state.max = element.max;
        if (element.step !== '') state.step = element.step;
      }
      if (element instanceof HTMLTextAreaElement) {
        state.value = element.value;
        state.maxLength = element.maxLength;
      }
      if (element instanceof HTMLElement && element.matches('[data-player-scroll]')) {
        const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
        state.scrollTop = Math.round(element.scrollTop);
        state.clientHeight = Math.round(element.clientHeight);
        state.scrollHeight = Math.round(element.scrollHeight);
        state.canScrollUp = element.scrollTop > 1;
        state.canScrollDown = element.scrollTop < maxScrollTop - 1;
      }
      return state;
    }

    function actionLabelFor(element) {
      const associatedLabel = element instanceof HTMLTextAreaElement ? element.labels?.[0]?.textContent : '';
      return compactLabel(element.getAttribute('aria-label') || associatedLabel || element.getAttribute('title') || element.textContent || element.tagName.toLowerCase());
    }
    function compactLabel(value) { return value.replace(/\s+/g, ' ').trim().slice(0, 2400); }
    function normalizeVisibleText(value) { return value.replace(/\s+/g, ' ').trim(); }

    function visibleTextForPlayer() {
      const fragments = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || !isTextContainerVisible(parent)) return NodeFilter.FILTER_REJECT;
          const range = document.createRange();
          range.selectNodeContents(node);
          const visible = Array.from(range.getClientRects()).some((rect) => isRectVisibleToPlayer(rect, parent) && isTextReachableToPlayer(rect, parent));
          return visible ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      while (true) {
        const node = walker.nextNode();
        if (!node) break;
        fragments.push(node.textContent ?? '');
      }
      return normalizeVisibleText(fragments.join(' '));
    }

    function isTextContainerVisible(element) {
      if (element.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }
    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0' && isRectVisibleToPlayer(rect, element);
    }
    function isRectVisibleToPlayer(rect, element) {
      const clip = visibleClipFor(element);
      return rect.width > 0 && rect.height > 0 && rect.right > clip.left && rect.left < clip.right && rect.bottom > clip.top && rect.top < clip.bottom;
    }
    function isReachableToPlayer(element) {
      const rect = element.getBoundingClientRect();
      return hitTestPoints(rect, element).some((point) => {
        const topElement = document.elementFromPoint(point.x, point.y);
        return Boolean(topElement && (topElement === element || element.contains(topElement)));
      });
    }
    function isTextReachableToPlayer(rect, parent) {
      return hitTestPoints(rect, parent).some((point) => {
        const topElement = document.elementFromPoint(point.x, point.y);
        return Boolean(topElement && (topElement === parent || parent.contains(topElement)));
      });
    }
    function hitTestPoints(rect, element) {
      const clip = visibleClipFor(element);
      const left = Math.max(rect.left, clip.left); const right = Math.min(rect.right, clip.right);
      const top = Math.max(rect.top, clip.top); const bottom = Math.min(rect.bottom, clip.bottom);
      if (right <= left || bottom <= top) return [];
      const insetX = Math.min(4, Math.max(0, (right - left) / 3));
      const insetY = Math.min(4, Math.max(0, (bottom - top) / 3));
      return [
        { x: (left + right) / 2, y: (top + bottom) / 2 }, { x: left + insetX, y: top + insetY },
        { x: right - insetX, y: top + insetY }, { x: left + insetX, y: bottom - insetY },
        { x: right - insetX, y: bottom - insetY },
      ].filter((point) => point.x >= 0 && point.x < window.innerWidth && point.y >= 0 && point.y < window.innerHeight);
    }
    function visibleClipFor(element) {
      let clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (/(auto|scroll|hidden|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) {
          const rect = ancestor.getBoundingClientRect();
          clip = { left: Math.max(clip.left, rect.left), top: Math.max(clip.top, rect.top), right: Math.min(clip.right, rect.right), bottom: Math.min(clip.bottom, rect.bottom) };
        }
      }
      return clip;
    }
    function roundedBounds(rect) { return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }; }
    function playerSelectorFor(element) {
      const dataAttribute = Array.from(element.attributes).find((attribute) => attribute.name.startsWith('data-') && attribute.name !== 'data-tutorial-tip');
      if (dataAttribute) return dataAttribute.value ? `[${dataAttribute.name}="${escapeAttributeValue(dataAttribute.value)}"]` : `[${dataAttribute.name}]`;
      if (element.id) return `#${CSS.escape(element.id)}`;
      if (element.matches('canvas')) return 'canvas';
      if (element.getAttribute('role')) return `[role="${CSS.escape(element.getAttribute('role'))}"]`;
      return element.tagName.toLowerCase();
    }
    function escapeAttributeValue(value) { return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
  }, {
    observationIndex: stepIndex, observationLabel: label, screenshotPath,
    screenshotFile: absoluteScreenshotFile, playerActionSelector,
  });
  await page.screenshot({ path: screenshotFile, fullPage: false });
  return observation;
}
