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

Visual loop action kinds in the Farm provider schema are `click`, `hover`, `drag`, `adjust`, `wheel`, `press`, `wait`, `viewport`, and `stop`; the adapter maps them onto `civ-engine` visual actions such as `click`, `hover`, `drag`, `type`, `key`, `wheel`, `wait`, `viewport`, and `stop` for loop execution and trace redaction. Click and canvas drag actions may include `x`/`y` coordinates relative to the target element, which lets an LLM choose canvas locations from the screenshot. Hover actions move the pointer to a visible control without clicking, so icon-only tabs and other hover/focus affordances can be checked from the next screenshot. Drag actions move the mouse from that visible start point by a bounded pixel delta, wheel actions move the mouse over a visible canvas or scrollable panel target before scrolling, adjust actions click a visible range input or fill a visible numeric input at a bounded 0-100 target, and press actions may use only listed keyboard controls such as Arrow/WASD camera panning, Home farm recentering, Space pause, visible tool shortcuts, undo/redo, speed keys, range-input arrows, number-input up/down arrows, and side-panel resizer arrows/Home/End. Focus-required keyboard actions include a selector in the observation and must include that selector in the decision so the harness focuses the visible control before pressing. Tune local runs with `FARM_VISUAL_LOOP_STEPS`, `FARM_VISUAL_LOOP_WAIT_MS`, and `FARM_VISUAL_LOOP_SETTLE_MS`; ordinary visual loops default to 80 decisions, while `npm run playtest:recursive` supplies the 140-step Harvest Hearth curriculum unless `FARM_VISUAL_LOOP_STEPS` is explicitly set. The visual-loop boundary clamps larger budgets to the 160-decision safety ceiling. If a capped run ends while the final visible text still contains actionable guidance, the harness should report `visual-loop-ended-with-guidance` rather than treating the run as clean.

The visual loop writes:

- `output/playwright/llm-visual-loop/latest.md`
- `output/playwright/llm-visual-loop/latest.json`
- `output/playwright/llm-visual-loop/latest.html`
- `output/playwright/llm-visual-loop/latest.bundle.json` (the replayable recent 64-tick terminal window exported from the in-page dev recorder)
- `output/playwright/llm-visual-loop/steps/`

Runs are append-only: instead of destroying the previous run, the harness archives it under `output/playwright/llm-visual-loop-history/<timestamp>/` and appends each run's improvement manifest to `output/playwright/llm-visual-loop-history/ledger.jsonl`, so cross-run audits have more than one run of memory.

Use `latest.html` to watch the screenshot replay with each observation, decision, execution result, available action list, keyboard action list, and finding. The viewer should keep the screenshot pane fixed inside the viewport while metadata scrolls in the right rail, so every replay frame remains visible during review. The visual loop should remain a player-surface harness: it may clear localStorage before load for a fresh run, but decisions should be based on screenshots, complete normalized visible text, and available controls, not private simulation state or offscreen DOM text. The visible-text and available-control extractors should respect viewport clipping, scroll clipping, and browser hit testing so covered controls or occluded text are not treated as player-visible.

`latest.json` is also the canonical recursive-improvement packet. It includes:

- `improvementRun`: a `civ-engine` improvement run manifest for the Farm visual loop.
- `findings`: standardized `civ-engine` `ImprovementFinding` objects. Each finding must carry `schemaVersion` (minimal stamping: v1 vocabulary stamps 1), severity/category, evidence refs, `verificationStatus`, `nextAction`, and a candidate disposition so fixes and proposals are classified. Findings author as `unverified` claims; deterministic (artifact-computed) findings flip to `verified` with `verificationMethod: 'metric'` and a bundle evidence ref ONLY when the run exported a bundle and its replay self-check was strong (ok, at least one checked segment, zero skipped). LLM-authored engine findings are never auto-verified.
- `visualFindings`: the same findings bridged back into `civ-engine` visual-playtest finding payloads.
- `comparison`: a before/after summary against the previous `latest.json`, including added, resolved, and persistent finding ids plus action/step deltas.
- Coverage-gap findings (curriculum): `coverage-report.mjs` compares the controls the player could repeatedly see (selector-keyed `availableActions`, at least 3 sightings) against the controls any decision actually targeted; each never-exercised control becomes a low-severity `improveHarness` finding with `data.class: 'coverage-gap:<selector>'` and `promotionTarget: 'scenario'` (capped at 3 per run with the total in `data.gapsTotal`). These are fix-classified for candidate selection, so the loop grows its own coverage when no real bugs are open — the fix is teaching the local visual player (or a scenario) to reach the control, and prove-fixed is the candidate's id landing in the rerun's `comparison.resolved` (gap emission is deterministically ordered — sightings desc, then key — so a class cannot drop out of the capped emission by trajectory accident; when `gapsTotal` exceeds the cap, uncapped classes are still open work).

Rotating `[data-accept-request="..."]` selectors count as one semantic `[data-accept-request]` coverage family. The request lifecycle curriculum still accepts and completes several authored baskets, while the ledger avoids treating every deterministic content variant as a new interaction contract. Offered and exercised totals include every semantic control seen at least once; a missing control becomes a gap finding only after three sightings, so reports distinguish surface accounting from stable reachability failures.

If `FARM_LLM_VISUAL_LOOP_COMMAND` fails, returns unusable output, or returns `civ-engine` visual findings, the shared runner result should become standardized improvement findings instead of loose local report objects or dropped counts. After implementing a fix or harness change, rerun `npm run playtest:llm:visual-loop` so the latest comparison shows whether the finding was resolved, persisted, or replaced by a new issue.

`npm run playtest:recursive` is the one-command proposal-only pass over that packet: it runs the visual loop, selects the highest-severity open fix-classified finding (`nextAction` autoFix/manualFix, non-rejected), and writes `latest.pass-manifest.json` plus a row in `output/playwright/llm-visual-loop-history/passes.jsonl` with the fleet-wide outcome vocabulary (`no-fix-candidate | proposal-only | run-failed`). Farm has no auto-apply arm by design — the driving agent is the fix arm: fix the candidate, rerun the pass, and use `comparison` to show the finding resolved before claiming it fixed. `proposal-only` is a handoff to that agent, not an end state: the loop's intended behavior is discover AND fix, so a pass is complete only when the candidate's bug class is proven resolved in a rerun and promoted to a regression test (fixed-proven), the fix demonstrably failed the rerun (fix-unproven), or the fix is blocked on a decision only the user can make — reporting the proposal alone is an incomplete pass. The pass manifest carries `gitCommit`, `sourceTreeDirty`, `sourceRevision`, declared discovery scope, `scopeConclusion`, `broaderGoalStatus`, and `nextAction`. A `no-fix-candidate` result therefore means only that the declared scope was quiet; the deterministic local-player scope records `broaderGoalStatus: not-evaluated` and `nextAction: broaden-discovery` rather than implying overall completion.

The default local visual-loop heuristic should keep exercising both the whole player surface and the progression path: it sets 4x speed, pans the camera with held keyboard presses, zooms over the canvas with the mouse wheel, hovers the icon-only Inventory tab to reveal its label, drags and keyboard-resizes the side panel, collapses and expands the panel, pauses and resumes, cycles through 1x/2x/4x speed, checks a compact desktop viewport, opens Inspect, selects a visible tile, browses Well/Storage/Land/Bulldoze tools, and uses Undo/Redo after a visible plot placement. It should then open Goals, buy the first visible Worker Boots upgrade when affordable, wheel the side panel down and back up when dense content is scrollable, and continue watching, selling, claiming tiers, opening Crop Mix, painting plots, restocking seeds, and fulfilling Village Requests through visible controls. Paint clicks should target visible open owned land bands rather than stale center coordinates that can become occupied by buildings or plots after zoom/camera changes. The loop should not stop only because a tier was claimed or several waits elapsed while visible Farm Guide or HUD copy still gives an actionable next step such as claiming, restocking seeds, tuning Crop Mix, expanding land, upgrading workers, adding Tomatoes or Pumpkins to Crop Mix, pinning or delivering a request, selling crops, selecting Plot, or painting empty land. Count wheel coverage by target: canvas wheel actions cover camera zoom, while side-panel wheel actions cover scrollable content. Visible tier-ready HUD prompts should reopen Goals even if the loop already visited Goals earlier. After Tier 3 unlocks Tomato Rows, the local visual player should follow the tomato Crop Mix guide, edit both Tomato inputs, and complete enough request-board work to audit the three-request plus ten-tomato Harvest Hearth milestone. After Tier 4 unlocks, it should stock and visibly grow Pumpkins, edit both Pumpkin inputs, and sell Pumpkin before treating the farm as open-ended. Once the farm is in open-ended Tier 4 play, the heuristic should not keep selling tiny amounts forever just because crops trickle into storage; it should sell only under explicit sell guidance, storage pressure, low coins, or pre-endgame progression. Seed-buy decisions should follow explicit seed-restock guidance, not incidental words inside another Farm Guide explanation; after higher-priority guides, selling, and plot-painting are handled, visible Inventory rows with zero buyable seed stock are also actionable restock controls. Locked future-crop rows are not actionable and must not trigger fallback seed purchases. When the visible milestone names a crop and that crop's visible seed row is empty, the local heuristic should prefer that crop's enabled seed button before lower-priority seed rows; otherwise, it should prefer the latest unlocked zero-stock row. If Crop Mix itself shows `No seeds stocked`, the loop should open Inventory rather than stop on the planning panel. Keep dead-end controls disabled, such as empty sell actions and unaffordable seed or upgrade buys, so the extracted action list matches what a player can meaningfully do.

The completed Harvest Hearth curriculum exercises range and number inputs for every Crop Mix row, one single-crop sale per unlocked crop, one Tomato and Pumpkin seed purchase after their tiers unlock, Worker Boots followed by Watering Cans, and safe dismissal of a Paint Empty Land card before a framed-farm canvas click. The single clean-stop guard requires all three tier claims, both Pumpkin inputs, a Pumpkin sale, and two watch intervals after the latest claim, so cumulative waits cannot terminate the shift at Wheat Rows or Tomato Rows. After the Tier 4 claim, leaving Goals for Crop Mix records that the upgrade surface was inspected even when Watering Cans was disabled, preventing panel oscillation while the farm earns more coins. Home recenter behavior is verified independently in `tests/browser/cozyArtDirection.test.mjs`; the deterministic local player's camera tour pans and zooms.

When visible paint guidance appears while Land or another tool is active, the local visual player must reselect Plot before clicking the canvas.

The worker-care scenario checks that seed-shortage stalls are explained and actionable: when workers are idle with empty plots, no desired unlocked seeds, and enough coins to buy seeds, the UI should show guidance and at least one visible seed-buy action.

The same scenario records duplicate active worker plot targets. Multiple workers can share a storage bin or well, but they should not reserve the same planting, watering, or harvesting plot target when other eligible plot work exists.

To inspect the recorded replay without rerunning the browser harness:

```bash
npm run playtest:llm:replay
```

Pass a bundle path and optional ticks when needed:

```bash
npm run playtest:llm:replay -- output/playwright/llm-visual-loop/latest.bundle.json --ticks 0,657,662
```

The replay inspector opens the saved civ-engine `SessionBundle` (defaulting to the live visual loop's `latest.bundle.json`), runs `SessionReplayer.selfCheck()`, reports both the raw `ok` and a `selfCheckStrongOk` that refuses vacuous zero-segment passes, samples marker ticks, and writes `latest.replay-inspect.md` beside the bundle.

The replay bundle is a deterministic debugging aid. It can use the simulation directly because it is not the player-facing browser control path.

The bundle intentionally covers only the most recent non-empty 64-tick recording window. The screenshots, observations, and action trace cover the complete visual playtest; bounding the deterministic bundle prevents a long 4x-speed shift from exceeding Playwright's protocol string limit as per-tick state diffs accumulate. `replayCoverage` records the window's start/end ticks and `partial` status. A proof still requires `selfCheckStrongOk`: at least one checked segment, zero skipped segments, and no divergence, but a partial terminal window cannot globally verify deterministic findings whose screenshot evidence may precede it. `tests/simulation/farmReplayWindow.test.ts` pins both long-session size and exact-rotation-boundary behavior, while the improvement contract pins the partial-evidence honesty rule.

## Manual Smoke Checklist

- Start a new farm.
- Watch a worker plant, fetch water, water, harvest, and deliver crops.
- Paint plots.
- Place wells and storage bins.
- Buy adjacent land.
- Adjust crop mix with both sliders and typed numeric percentages, confirming unlocked crops remain allocated to 100%.
- Pan and zoom the camera without leaving the illustrated meadow, then press Home and confirm the scenic farm framing returns.
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
- From Tier 2 onward, pin, abandon, and fulfill Village Requests; confirm delivery consumes the exact basket, pays the quoted premium, rotates the offers, and remains undoable.
- Complete three Village Requests and harvest ten tomatoes, claim Harvest Hearth, and confirm the fourth farmhand and Pumpkin crop become available.
- Grow a ripe Pumpkin and confirm its vine, leaves, and orange fruit remain readable at both supported desktop viewports.
- Confirm locked seed purchase controls say Locked instead of showing normal prices.
- Confirm Crop Mix rows show seed stock, planted counts, and readiness states without overflowing the side panel.
- Reload and confirm localStorage autosave restores the farm; simulate a rejected storage write and confirm play continues with a visible warning.
