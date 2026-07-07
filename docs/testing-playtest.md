# Testing And Playtest Guide

## Headless Simulation

Use Vitest for deterministic simulation contracts:

```bash
npm test
```

Simulation tests should verify user-visible mechanics: worker autonomy, crop growth, seed recovery, storage capacity, auto-sell overflow, milestones, undo/redo, and save/load.

## Browser Playtest

Use `npm run dev` for the user-facing local server. Farm reserves `http://127.0.0.1:5175/` so it does not collide with other local games.

Browser tests should start the dev server, open the playable first screen, and inspect:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`
- `window.__farmDebug.getState()`

Every gameplay-facing browser change should verify that the canvas is nonblank and that HUD text does not overlap at desktop and smaller desktop-like viewports.

For idle-loop changes, also let real browser time pass without calling `window.advanceTime(ms)` and confirm `window.__farmDebug.getState().tick` increases. Debug advancement can hide frame-delta bugs.

## LLM Playtest Harness

Run the LLM-oriented browser harness with:

```bash
npm run playtest:llm
```

The harness starts Vite on Farm's preferred local port, drives browser scenarios through visible player controls, captures screenshots and structured debug state, records a civ-engine replay bundle, and writes:

- `output/playwright/llm-playtest/latest.md`
- `output/playwright/llm-playtest/latest.json`
- `output/playwright/llm-playtest/latest.annotations.json`
- `output/playwright/llm-playtest/latest.bundle.json`
- `output/playwright/llm-playtest/latest.replay.html`
- `output/playwright/llm-playtest/latest.replay.md`
- `output/playwright/llm-playtest/screenshots/`

Use the Markdown report as the review packet for an LLM-player loop: inspect the screenshots, visible text, available actions, keyboard actions, player action log, structured findings, and annotations, choose the highest-impact player-facing improvement, implement it, then rerun the harness. Available actions should include the same player-facing surface a person can use in that screenshot: canvas clicks, buttons, range sliders, numeric inputs, role buttons, resize handles, scrollable panel regions, and keyboard-only camera controls. Action entries should carry hints and visible control state such as active toolbar buttons, keyboard shortcuts, input values, and scroll position.

Browser scenario control should stay player-like. The harness may read debug APIs after screenshots for metrics, but browser scenario actions should use visible inputs such as button clicks, keyboard shortcuts, pointer moves, waits, and viewport changes rather than `window.advanceTime()` or direct simulation commands. To point the harness at an already-running Farm server, set `FARM_PLAYTEST_URL` to `http://127.0.0.1:5175/`.

The default scripted scenario should exercise the full player surface before declaring the game healthy: panel tabs, toolbar tools, canvas tile clicks, Inspect panel details after selecting a visible tile, side-panel drag/collapse/wheel scroll, pause and speed controls, undo/redo, crop-mix range and numeric inputs, selling, viewport resize, and a normal page reload that proves localStorage autosave restores the progressed farm. The harness should clear localStorage only for the initial clean boot; reload checks must preserve the saved state.

For step-by-step visual playtesting, run:

```bash
npm run playtest:llm:visual-loop
```

This starts the browser, captures a screenshot, extracts viewport- and scroll-clipped visible text plus visible controls and keyboard controls, asks a decision provider for one player action, executes only that player-facing action, and repeats. It samples one screenshot per decision step or intentional wait rather than every animation frame; use waits when the farm needs time to change and keep the frame budget for new information. The default provider is a deterministic local heuristic so the command works without API keys. To reuse the visible 5175 server instead of starting a temporary Vite server, set `FARM_PLAYTEST_URL`. To plug in a real LLM or another agent, set `FARM_LLM_VISUAL_LOOP_COMMAND` to a command that reads the observation JSON from stdin and returns a decision JSON object with `rationale`, `action`, and `expectedResult`.

Visual loop action kinds are `click`, `drag`, `adjust`, `wheel`, `press`, `wait`, `viewport`, and `stop`. Click actions may include `x`/`y` coordinates relative to the clicked element, which lets an LLM choose canvas locations from the screenshot. Drag actions move the mouse from the center of a visible control by a bounded pixel delta, wheel actions move the mouse over a visible canvas or scrollable panel target before scrolling, adjust actions click a visible range input or fill a visible numeric input at a bounded 0-100 target, and press actions may use listed keyboard controls such as Arrow/WASD camera panning or Space pause. Tune local runs with `FARM_VISUAL_LOOP_STEPS`, `FARM_VISUAL_LOOP_WAIT_MS`, and `FARM_VISUAL_LOOP_SETTLE_MS`; the default budget is sized to include side-panel scrolling, the first tier claim, and Crop Mix adjustment.

The visual loop writes:

- `output/playwright/llm-visual-loop/latest.md`
- `output/playwright/llm-visual-loop/latest.json`
- `output/playwright/llm-visual-loop/latest.html`
- `output/playwright/llm-visual-loop/steps/`

Use `latest.html` to watch the screenshot replay with each observation, decision, execution result, available action list, keyboard action list, and finding. The viewer should keep the screenshot pane fixed inside the viewport while metadata scrolls in the right rail, so every replay frame remains visible during review. The visual loop should remain a player-surface harness: it may clear localStorage before load for a fresh run, but decisions should be based on screenshots, visible text, and available controls, not private simulation state or offscreen DOM text.

The default local visual-loop heuristic should keep exercising the early upgrade path: it sets 4x speed, pans the camera with a held keyboard press, zooms over the canvas with the mouse wheel, opens Goals, buys the first visible Worker Boots upgrade when affordable, wheels the side panel down and back up when dense content is scrollable, then continues watching, selling, claiming tiers, opening Crop Mix, painting plots, and restocking seeds through visible controls. Count wheel coverage by target: canvas wheel actions cover camera zoom, while side-panel wheel actions cover scrollable content. Seed-buy decisions should follow explicit seed-restock guidance, not incidental words inside another Farm Guide explanation. Keep dead-end controls disabled, such as empty sell actions and unaffordable seed or upgrade buys, so the extracted action list matches what a player can meaningfully do.

The worker-care scenario checks that seed-shortage stalls are explained and actionable: when workers are idle with empty plots, no desired unlocked seeds, and enough coins to buy seeds, the UI should show guidance and at least one visible seed-buy action.

The same scenario records duplicate active worker plot targets. Multiple workers can share a storage bin or well, but they should not reserve the same planting, watering, or harvesting plot target when other eligible plot work exists.

To inspect the recorded replay without rerunning the browser harness:

```bash
npm run playtest:llm:replay
```

Pass a bundle path and optional ticks when needed:

```bash
npm run playtest:llm:replay -- output/playwright/llm-playtest/latest.bundle.json --ticks 0,657,662
```

The replay inspector opens the saved civ-engine `SessionBundle`, runs `SessionReplayer.selfCheck()`, samples marker ticks, and writes `output/playwright/llm-playtest/latest.replay-inspect.md`.

The replay bundle is a deterministic debugging aid. It can use the simulation directly because it is not the player-facing browser control path.

## Manual Smoke Checklist

- Start a new farm.
- Watch a worker plant, fetch water, water, harvest, and deliver crops.
- Paint plots.
- Place wells and storage bins.
- Buy adjacent land.
- Adjust crop mix with both sliders and typed numeric percentages, confirming unlocked crops remain allocated to 100%.
- Pan and zoom the camera without losing access to farm controls.
- Sell a crop amount and sell all crops.
- Trigger crop overflow auto-sell.
- Pause and use 1x, 2x, 4x speeds.
- Undo and redo build/bulldoze/crop-mix changes.
- Collapse and expand the side panel.
- Drag the side-panel resize handle and reload to confirm the width preference restores.
- Select 2x or 4x speed and reload to confirm the speed preference restores.
- Confirm HUD and Goals milestone text includes current progress counts, such as `Harvest 3/20 wheat`.
- Confirm Farm Guide cards point at the next action, use a consistent Do/Why format, remain readable when guidance changes, prioritize visible tier claims over lower-priority sell guidance, and do not cover side-panel controls.
- Confirm locked seed purchase controls say Locked instead of showing normal prices.
- Confirm Crop Mix rows show seed stock, planted counts, and readiness states without overflowing the side panel.
- Reload and confirm localStorage autosave restores the farm.
