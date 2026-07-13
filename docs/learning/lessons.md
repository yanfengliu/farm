# Engineering Lessons

## 2026-07-12 - Recursive completion conditions must encode the terminal milestone

- Surfaced by: early recursive runs capped on stale paint guidance, hit a tutorial-overlay click interception, and stopped at Tier 2 or Tier 3. Later run `farm-visual-loop-2026-07-13T07-35-41-524Z` reported clean without selling Pumpkin, `farm-visual-loop-2026-07-13T07-42-42-435Z` capped with Watering Cans, Tomato range, and Pumpkin-seed gaps, and `farm-visual-loop-2026-07-13T07-48-37-268Z` narrowed the remaining work to the Pumpkin range. Independent review of the first clean run then reproduced dishonest explicit-budget scope labels and a Goals/Crop Mix bounce when Watering Cans was unaffordable; the final proof is `farm-visual-loop-2026-07-13T08-08-06-549Z`.
- Failure mode: screen-relative paint points landed on occupied bands and then under a tutorial close button; cumulative waits and the first tier-claim index could satisfy a nominal completion check before the latest milestone; numeric-only Crop Mix edits left parallel range controls uncovered; a visible but locked future-crop row triggered repeated fallback Carrot purchases; and Tier 4 panel navigation preempted the affordable upgrade action. Selector-level coverage treated authored request IDs as separate controls, raw explicit budgets were embedded in scope IDs before the runner clamped them, and an unaffordable Watering Cans control left no record that Goals had already been inspected.
- Fix commit: `fix: complete the Harvest Hearth recursive shift` dismisses the blocking paint card, targets visible empty field rows, replaces broad waits with one terminal guard tied to the latest Tier 4 claim and Pumpkin lifecycle, completes the late-game control curriculum, ignores locked seed rows, prioritizes upgrades before panel navigation, normalizes rotating request offers to one semantic coverage family, shares normalized decision bounds with scope labels, and records the post-claim Goals inspection before leaving for Crop Mix.
- Regression anchors: `tests/browser/llmVisualLoopHarvestHearth.test.mjs` pins latest-claim waits, Pumpkin lifecycle, locked future seed rows, late upgrades, unaffordable-upgrade navigation, and Tomato/Pumpkin number-plus-range coverage; `tests/browser/llmVisualLoopLocalPlayer.test.mjs` pins the blocking tutorial, framed paint points, crop sales, seeds, and camera tour; `tests/browser/coverageReport.test.mjs` pins semantic request-family coverage; `tests/browser/llmVisualLoopContract.test.mjs` pins the composed terminal, shared budget, and coordinate contracts; `tests/browser/recursivePass.test.mjs` pins default, malformed, and clamped budgets plus honest manifest scope.
- Behavior delta: the final player agent-stops at decision 134/140 only after all 45 offered semantic controls are exercised, four waits occur after the latest tier claim, Pumpkin is mixed through both inputs and sold, and the final replay segment verifies without skips or divergences. The pass remains explicitly bounded to its declared deterministic discovery scope.

## 2026-07-12 - Request-aware automation must distinguish reserves, deficits, and pressure

- Surfaced by: four recursive runs from `farm-visual-loop-2026-07-13T06-14-30-782Z` through `farm-visual-loop-2026-07-13T06-42-30-514Z` capped at different request lifecycle boundaries even as each repair advanced or narrowed the failure.
- Failure mode: treating every stored crop as reserved deadlocked a full bin, while continuously selling every surplus drained too much. Generic milestone seed priority ignored a carrot-deficit basket. Unconditional Pin actions then started extra baskets after the three-delivery milestone. Once that churn was removed, `Restock seeds` on the now-idle Requests panel had no generic navigation path to Inventory, producing 65 identical waits.
- Fix commits: `5124d86` introduced visible basket reserve accounting; `ec614d6` limited pressure sales, prioritized basket-deficit seeds, and closed Unpin lifecycle state; `d77ef0c` bounded the request curriculum; the seed-guidance bridge opens Inventory from any inactive panel, whether or not a basket is pending.
- Regression anchors: `tests/browser/llmVisualLoopLocalPlayer.test.mjs` pins full-bin surplus selection, reserve preservation, the two-free-slot stop condition, request-deficit seed priority, abandoned-basket cleanup, one-time Unpin coverage, replacement retention, the three-delivery acceptance ceiling, and post-request seed-guidance recovery; `tests/browser/llmVisualLoopContract.test.mjs` pins active-request-first with milestone fallback in the composed harness source.
- Behavior delta: the visual player makes space without consuming request deficits, plants the crop that completes the basket, demonstrates Unpin once, leaves the board after three deliveries, and can resume ordinary farming from seed guidance instead of waiting forever on the completed request curriculum.

## 2026-07-12 - Browser replay evidence needs a bounded time window

- Surfaced by: the first full 120-decision Village Harvest recursive shift reached `120-final.png` but ended `run-failed` with Node `ERR_STRING_TOO_LONG` in Playwright's pipe transport while exporting the in-page session bundle.
- Failure mode: the recorder captured a whole accelerated browser lifetime, and Farm's per-tick deterministic state diffs accumulated into one protocol response even though each PNG remained under 275 kB. Screenshot size was unrelated to the failure.
- Fix commits: `fix: bound browser replay evidence` introduced the rolling recorder; `fix: free request storage without selling reserves` retains the latest command-bearing window through a long idle tail while preserving partial-coverage labeling.
- Regression anchors: `tests/simulation/farmReplayWindow.test.ts` builds long command history, asserts the exported JSON stays below 32 MB, runs a strong `SessionReplayer.selfCheck()`, pins exact-boundary fallback behavior, and proves an earlier command window survives two idle rotations; `tests/browser/llmVisualLoopImprovementContract.test.mjs` keeps earlier findings unverified under a strong partial suffix.
- Behavior delta: the complete screenshots and action log still describe the whole player journey, while the deterministic bundle provides bounded replay proof with at least one checked command segment when the run contained one, instead of crashing after all actions finish, returning a vacuous idle suffix, or overclaiming which observations that partial window verifies.

## 2026-07-12 - Additive save migrations must normalize command history too

- Surfaced by: the Village Request and pumpkin implementation added current-state defaults, but a legacy undo snapshot could still restore a three-crop state with no `community` object.
- Failure mode: normalizing only the loaded top-level snapshot makes startup look healthy while Undo later replaces it with an unnormalized historical snapshot, erasing new fields or leaving crop-indexed records incomplete.
- Fix commit: `feat: add village harvest and sunlit farm`; `normalizeFarmSnapshot` now runs across restored undo and redo entries as well as the active state.
- Regression anchors: `tests/persistence/localSave.test.ts` loads a legacy three-crop save with old history and proves Undo restores pumpkin/community defaults; `tests/simulation/communityRequests.test.ts` pins request history behavior.
- Behavior delta: legacy saves and their command history now enter the same four-crop, request-aware schema before any player command can restore them.

## 2026-07-12 - Player-editable controls cannot be rebuilt every render frame

- Surfaced by: adversarial UI review followed by real-browser Crop Mix typing and pointer-drag tests.
- Failure mode: replacing the panel `innerHTML` on every snapshot detached the focused number or range input between input events, so multi-digit edits and continuous drags could commit partial values or lose focus.
- Fix commit: the Village Harvest feature commit; focused Crop Mix controls now render an in-place preview and dispatch one simulation command on `change`/blur before ordinary panel replacement resumes.
- Regression anchors: `tests/browser/visualPolish.test.mjs` enters a multi-digit value without losing focus; `tests/browser/visualPolishControlCases.mjs` drives a real 30-step pointer drag and proves a single committed command.
- Behavior delta: number edits and slider drags now behave like continuous native controls while Undo history records only the committed crop-mix change.

## 2026-07-12 - Save validation must protect graph and actor invariants

- Surfaced by: independent persistence review of values that passed the former field-presence checks but could not form a playable farm.
- Failure mode: disconnected owned tiles, duplicate coordinates, off-map worker paths, fractional inventory, or overlapping spawned workers could enter deterministic systems and cause unreachable jobs, invalid economy math, or invisible actors.
- Fix commit: the Village Harvest feature commit; the persistence boundary validates connected owned land, unique/bounded coordinates, worker and task occupancy, and integer item counts, while tier claims choose a free owned walkable spawn.
- Regression anchors: `tests/persistence/localSave.test.ts` rejects malformed graph, path, and quantity payloads; `tests/simulation/communityRequests.test.ts` pins safe fourth-worker spawning and deterministic replay through the Tier 4 claim.
- Behavior delta: impossible saves fail closed to a fresh valid farm, and a valid crowded farm never creates a new worker on an occupied or blocked tile.

## 2026-07-12 - Ambient pixels belong to presentation time

- Surfaced by: art-direction review of creek shimmer and well sparkle while the simulation was paused or running at different speed settings.
- Failure mode: deriving ambience from the deterministic farm tick froze the world when paused and made decorative motion change speed with the economy.
- Fix commit: the Village Harvest feature commit; environment effects consume Phaser presentation time while worker locomotion and crop state remain simulation-bound.
- Regression anchors: `tests/browser/cozyArtDirection.test.mjs` samples creek and well pixels across a real paused browser interval and proves that the scene changes while the simulation tick does not.
- Behavior delta: the farm remains gently alive at every simulation speed without contaminating saves, replays, or deterministic outcomes.

## 2026-07-10 - Guided canvas actions must bind the intended tool

- Surfaced by: `npm run playtest:recursive` repeatedly emitted the verified `visual-loop-ended-with-guidance` candidate; the controlled failing baseline is archived at `output/playwright/llm-visual-loop-history/2026-07-10T17-29-33-569Z/latest.json`.
- Failure mode: after the terminal audit selected Land, the local visual player interpreted `Paint plots on empty land` correctly but clicked the canvas without reselecting Plot. Playwright reported a successful click even though the active tool made it the wrong game action, so the guidance persisted until the step cap.
- Fix commit: `6e8c467` raises the ordinary decision allowance, gives recursive passes the 120-step ceiling, and routes guided paint through a pure decision that selects Plot before canvas whenever Plot is inactive.
- Regression anchors: `tests/browser/guidedPaintDecision.test.mjs` executes inactive-Plot, active-Plot, and missing-control cases; `tests/browser/recursivePass.test.mjs` pins the recursive default and explicit override behavior.
- Behavior delta: the proof run `farm-visual-loop-2026-07-10T17-29-34-591Z` selected Land at step 84, reselected Plot at 85, painted at 86, and agent-stopped at 108/120 instead of capping. Its `comparison.findings.resolved` contains `visual-loop-ended-with-guidance`, and replay checked 6 segments with zero skips or divergences.
