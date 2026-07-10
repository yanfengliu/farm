import { describe, expect, test } from 'vitest';
import { selectGuidedPaintAction } from '../../scripts/llm-visual-loop/guided-paint.mjs';

const plotTool = (active) => ({
  selector: '[data-tool="plot"]',
  label: 'Plot',
  state: { active },
});
const canvas = { selector: 'canvas', label: 'canvas' };

describe('guided paint decisions', () => {
  test('selects Plot before canvas when paint guidance appears under another tool', () => {
    expect(selectGuidedPaintAction({
      plotToolAction: plotTool(false),
      canvasAction: canvas,
      explicitPaintGuidanceVisible: true,
      selectedPlotGuideVisible: false,
      recentlyUsedCanvas: false,
    })).toEqual({ kind: 'select-plot', action: plotTool(false) });
  });

  test('paints only while Plot is active and the canvas is ready for another action', () => {
    expect(selectGuidedPaintAction({
      plotToolAction: plotTool(true),
      canvasAction: canvas,
      explicitPaintGuidanceVisible: true,
      selectedPlotGuideVisible: false,
      recentlyUsedCanvas: false,
    })).toEqual({ kind: 'paint', action: canvas });
  });

  test('does not claim a guided paint action without a visible Plot control', () => {
    expect(selectGuidedPaintAction({
      plotToolAction: null,
      canvasAction: canvas,
      explicitPaintGuidanceVisible: true,
      selectedPlotGuideVisible: false,
      recentlyUsedCanvas: false,
    })).toBeNull();
  });
});
