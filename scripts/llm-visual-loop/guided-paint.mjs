export function selectGuidedPaintAction({
  plotToolAction,
  canvasAction,
  explicitPaintGuidanceVisible,
  selectedPlotGuideVisible,
  recentlyUsedCanvas,
}) {
  if (!explicitPaintGuidanceVisible || !plotToolAction) return null;
  if (!plotToolAction.state?.active) {
    return { kind: 'select-plot', action: plotToolAction };
  }
  if (canvasAction && !selectedPlotGuideVisible && !recentlyUsedCanvas) {
    return { kind: 'paint', action: canvasAction };
  }
  return null;
}
