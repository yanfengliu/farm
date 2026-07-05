# Testing And Playtest Guide

## Headless Simulation

Use Vitest for deterministic simulation contracts:

```bash
npm test
```

Simulation tests should verify user-visible mechanics: worker autonomy, crop growth, seed recovery, storage capacity, auto-sell overflow, milestones, undo/redo, and save/load.

## Browser Playtest

Browser tests should start the dev server, open the playable first screen, and inspect:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`
- `window.__farmDebug.getState()`

Every gameplay-facing browser change should verify that the canvas is nonblank and that HUD text does not overlap at desktop and smaller desktop-like viewports.

For idle-loop changes, also let real browser time pass without calling `window.advanceTime(ms)` and confirm `window.__farmDebug.getState().tick` increases. Debug advancement can hide frame-delta bugs.

## Manual Smoke Checklist

- Start a new farm.
- Watch a worker plant, fetch water, water, harvest, and deliver crops.
- Paint plots and paths.
- Place wells and storage bins.
- Buy adjacent land.
- Adjust crop mix.
- Sell a crop amount and sell all crops.
- Trigger crop overflow auto-sell.
- Pause and use 1x, 2x, 4x speeds.
- Undo and redo build/bulldoze/crop-mix changes.
- Collapse and expand the side panel.
- Reload and confirm localStorage autosave restores the farm.
