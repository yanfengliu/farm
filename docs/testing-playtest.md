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

The canonical LLM/player browser harness is the visual loop:

```bash
npm run playtest:llm:visual-loop
```

The legacy scripted `npm run playtest:llm` command is deprecated. It remains as a compatibility alias that prints a deprecation warning and delegates to the visual loop with a deeper default step budget. Do not add new coverage to the old scripted surface-tour model; add it to the visual loop contracts and replay report instead.

Use the Markdown and HTML reports as the review packet for an LLM-player loop: inspect the screenshots, local `screenshotFile` paths, visible text, available actions, keyboard actions, player action log, structured findings, and annotations, choose the highest-impact player-facing improvement, implement it, then rerun the harness. Available actions should include the same player-facing surface a person can use in that screenshot: canvas clicks, buttons, range sliders, numeric inputs, role buttons, resize handles, scrollable panel regions, keyboard-only camera controls, selector-focused keyboard controls for focusable inputs and resize handles, and visible toolbar shortcuts such as tool, undo/redo, pause, and speed keys. Action entries should carry hints and visible control state such as active toolbar buttons, keyboard shortcuts, focus requirements, input values, and scroll position. Do not cap the extracted visible actions; if a control is visible and hit-test reachable in the browser viewport, the LLM-player should see it. Do not cap the extracted player-visible text before sending it to the decision provider; normalize whitespace only, and let downstream providers handle any prompt-budget summaries. Scenario capture should wait for a rendered browser frame, sample the DOM observation, then write the PNG so the review packet describes the same moment the screenshot shows.

Browser control should stay player-like. The harness may read debug APIs after screenshots for metrics, but decisions and browser actions should use visible inputs such as button clicks, keyboard shortcuts, pointer moves, waits, wheel scrolling, direct input edits, and viewport changes rather than `window.advanceTime()` or direct simulation commands. To point the harness at an already-running Farm server, set `FARM_PLAYTEST_URL` to `http://127.0.0.1:5175/`.

For step-by-step visual playtesting, run:

```bash
npm run playtest:llm:visual-loop
```

This starts the browser, captures a screenshot, extracts viewport- and scroll-clipped visible text plus visible controls and keyboard controls, asks a decision provider for one player action, executes only that player-facing action, and repeats. The loop itself uses `civ-engine`'s visual playtest runner and contracts (`VisualPlaytestHost`, `VisualPlaytestAgent`, and `runVisualPlaytestLoop`); Farm owns the Playwright screenshot/control adapter, the local heuristic/provider adapter, and the Farm-specific report shape. It samples one screenshot per decision step or intentional wait rather than every animation frame; use waits when the farm needs time to change and keep the frame budget for new information. Before each screenshot, the harness waits for a rendered browser frame and samples the DOM observation so the visible text/action packet stays aligned with the PNG frame. Stop decisions should come from an observation after a watch interval rather than immediately after a player action, so newly revealed guidance has a chance to appear. The default provider is a deterministic local heuristic so the command works without API keys. To reuse the visible 5175 server instead of starting a temporary Vite server, set `FARM_PLAYTEST_URL`. To plug in a real LLM or another agent, set `FARM_LLM_VISUAL_LOOP_COMMAND` to a command that reads the observation JSON from stdin and returns a decision JSON object with `rationale`, `action`, and `expectedResult`. Each observation keeps `screenshot` as a replay-relative path and also includes `screenshotFile`, an absolute local PNG path named plainly in the prompt so a visual provider can open the exact frame it is deciding from.

Visual loop action kinds in the Farm provider schema are `click`, `hover`, `drag`, `adjust`, `wheel`, `press`, `wait`, `viewport`, and `stop`; the adapter maps them onto `civ-engine` visual actions such as `click`, `hover`, `drag`, `type`, `key`, `wheel`, `wait`, `viewport`, and `stop` for loop execution and trace redaction. Click and canvas drag actions may include `x`/`y` coordinates relative to the target element, which lets an LLM choose canvas locations from the screenshot. Hover actions move the pointer to a visible control without clicking, so icon-only tabs and other hover/focus affordances can be checked from the next screenshot. Drag actions move the mouse from that visible start point by a bounded pixel delta, wheel actions move the mouse over a visible canvas or scrollable panel target before scrolling, adjust actions click a visible range input or fill a visible numeric input at a bounded 0-100 target, and press actions may use only listed keyboard controls such as Arrow/WASD camera panning, Space pause, visible tool shortcuts, undo/redo, speed keys, range-input arrows, number-input up/down arrows, and side-panel resizer arrows/Home/End. Focus-required keyboard actions include a selector in the observation and must include that selector in the decision so the harness focuses the visible control before pressing. Tune local runs with `FARM_VISUAL_LOOP_STEPS`, `FARM_VISUAL_LOOP_WAIT_MS`, and `FARM_VISUAL_LOOP_SETTLE_MS`; the default budget is sized to include side-panel scrolling, the first tier claim, and Crop Mix adjustment, and can be raised to as many as 120 decision steps for deeper progression audits. If a capped run ends while the final visible text still contains actionable guidance, the harness should report `visual-loop-ended-with-guidance` rather than treating the run as clean.

The visual loop writes:

- `output/playwright/llm-visual-loop/latest.md`
- `output/playwright/llm-visual-loop/latest.json`
- `output/playwright/llm-visual-loop/latest.html`
- `output/playwright/llm-visual-loop/steps/`

Use `latest.html` to watch the screenshot replay with each observation, decision, execution result, available action list, keyboard action list, and finding. The viewer should keep the screenshot pane fixed inside the viewport while metadata scrolls in the right rail, so every replay frame remains visible during review. The visual loop should remain a player-surface harness: it may clear localStorage before load for a fresh run, but decisions should be based on screenshots, complete normalized visible text, and available controls, not private simulation state or offscreen DOM text. The visible-text and available-control extractors should respect viewport clipping, scroll clipping, and browser hit testing so covered controls or occluded text are not treated as player-visible.

The default local visual-loop heuristic should keep exercising both the whole player surface and the early upgrade path: it sets 4x speed, pans the camera with a held keyboard press, zooms over the canvas with the mouse wheel, hovers the icon-only Inventory tab to reveal its label, drags and keyboard-resizes the side panel, collapses and expands the panel, pauses and resumes, cycles through 1x/2x/4x speed, checks a compact desktop viewport, opens Inspect, selects a visible tile, browses Well/Storage/Land/Bulldoze tools, and uses Undo/Redo after a visible plot placement. It should then open Goals, buy the first visible Worker Boots upgrade when affordable, wheel the side panel down and back up when dense content is scrollable, and continue watching, selling, claiming tiers, opening Crop Mix, painting plots, and restocking seeds through visible controls. Paint clicks should target visible open owned land bands rather than stale center coordinates that can become occupied by buildings or plots after zoom/camera changes. The loop should not stop only because a tier was claimed or several waits elapsed while visible Farm Guide or HUD copy still gives an actionable next step such as claiming, restocking seeds, tuning Crop Mix, expanding land, upgrading workers, adding Tomatoes to Crop Mix, selling crops, selecting Plot, or painting empty land. Count wheel coverage by target: canvas wheel actions cover camera zoom, while side-panel wheel actions cover scrollable content. Visible tier-ready HUD prompts should reopen Goals even if the loop already visited Goals earlier. After Tier 3 unlocks Tomato Rows, the local visual player should follow the tomato Crop Mix guide and type into the Tomato numeric percentage field so later-crop controls are visibly audited, not only listed. Once the farm is in open-ended Tier 3 play, the heuristic should not keep selling tiny amounts forever just because crops trickle into storage; it should sell only under explicit sell guidance, storage pressure, low coins, or pre-endgame progression. Seed-buy decisions should follow explicit seed-restock guidance, not incidental words inside another Farm Guide explanation; after higher-priority guides, selling, and plot-painting are handled, visible Inventory rows with zero buyable seed stock are also actionable restock controls. When the visible milestone names a crop and that crop's visible seed row is empty, the local heuristic should prefer that crop's enabled seed button before lower-priority seed rows; otherwise, it should prefer later unlocked zero-stock rows such as Tomato before stocked starter rows. If Crop Mix itself shows `No seeds stocked`, the loop should open Inventory rather than stop on the planning panel. Keep dead-end controls disabled, such as empty sell actions and unaffordable seed or upgrade buys, so the extracted action list matches what a player can meaningfully do.

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
- After Tomato Rows unlocks, confirm the Farm Guide nudges players back to Crop Mix and that Tomato can be edited through its numeric percentage input.
- Confirm locked seed purchase controls say Locked instead of showing normal prices.
- Confirm Crop Mix rows show seed stock, planted counts, and readiness states without overflowing the side panel.
- Reload and confirm localStorage autosave restores the farm.
