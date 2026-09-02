# Gate proofs

The standing answer to "did the gates actually do their job". Every lesson this repo retired on 2026-09-02 was retired because the gate named here was made to go RED by reintroducing the defect in product code, then green again after the revert. A lesson deleted on the strength of an unproved gate is knowledge silently lost, which is the one outcome this file exists to prevent.

Every gate below is run by `npm test` (`vitest run`). Where a gate turned out to be green with the defect live, the entry says so and names the case that was added to close it — those are the most valuable rows here.

Mutations were applied to product code only, never to a test, and reverted byte-for-byte (`git status --porcelain` clean) before the next one.

## Calibrate a detector against its measured baseline, and fail at the right altitude

- **Gate:** `tests/browser/llmVisualLoopScreenshot.test.mjs` :: `compositor corruption detection > flags an isolated black tile on coverage alone`, `screenshot pixel inspection > measures the longest unbroken run, not the total per column`, `stable capture selection > reports the least-corrupt frame as degraded rather than throwing the run away` — run by `npm test`
- **Mutation:** four, each independently: (1) `scripts/llm-visual-loop/browser-observation.mjs` `COMPOSITOR_COVERAGE_TRIP` 0.002 → 0.005, raising the floor back above the measured baseline of zero; (2) the row run-length trip re-ANDed behind that floor (`|| metrics.longestBlackRowRatio >=` → `&&`); (3) exhaustion throws instead of returning `degraded: true`; (4) the `columnRuns[x] = 0;` reset deleted, so the column metric becomes a per-column total rather than the longest unbroken run.
- **Red:** (1) and (2) `expected false to be true` on "flags an isolated black tile on coverage alone"; (3) `Error: Screenshot compositor never settled.` surfacing through "reports the least-corrupt frame as degraded rather than throwing the run away"; (4) `expected 0.2 to be close to 0.1` on "measures the longest unbroken run, not the total per column".
- **Green after revert:** yes

## A gate that is not scheduled cannot be trusted

- **Gate:** `tests/browser/testRunnerConcurrency.test.mjs` :: `vitest caps fork concurrency instead of scaling with core count`, `the fork cap stays below the number of suites that launch their own Chromium` — run by `npm test`
- **Mutation:** `vitest.config.ts` `maxForks` back to `Math.max(2, os.cpus().length - 1)`.
- **Red:** `expected 31 to be less than or equal to 8` and `expected 31 to be less than 26`.
- **Green after revert:** yes
- **Also landed for this claim:** the repo's own pairing check was itself unscheduled — `npm run lessons:check` was a command someone had to remember. It is now `tests/testing/lessonsPairing.test.mjs`, picked up by plain `npm test`.

## Tiny pixel calls can still composite into a large rectangle

- **Gate:** `tests/phaser/farmAmbienceArt.test.ts` :: `breaks chimney smoke into drifting pixel puffs instead of grey rectangles`; `tests/phaser/farmCultivatedPlantArt.test.ts` :: `routes mature wheat through the cultivated crop renderer` — run by `npm test`
- **Mutation:** (1) `src/phaser/view/farmAmbience.ts` smoke segment `g.fillRect(puffX + offsetX, puffY + offsetY, width, 1)` → `g.fillRect(puffX, puffY, 5, 3)`, a solid puff built from a legal-looking call; (2) `src/phaser/view/farmCultivatedPlantArt.ts` `drawWheatCrop` gains `if (stage >= 2) { g.fillStyle(stem, 1); g.fillRect(px + 6, py + 10, 20, 12); }`.
- **Red:** (1) `expected false to be true` on the smoke contract; (2) `mature wheat grain rectangle: expected true to be false`, with two further art suites failing alongside it.
- **Green after revert:** yes

## Randomized art must be measured at the authored seed

- **Gate:** `tests/phaser/farmHedgerow.test.ts` :: `builds a deterministic, irregular chain of overlapping shrub silhouettes`, `varies the organic layout by seed without moving its anchor`, `renders every authored canopy from narrow leaf pixels without green rectangular masses` — run by `npm test`
- **Mutation:** `src/phaser/view/farmHedgerow.ts` `mixedHash(seed, count, index)` → `coordinateHash(seed * 17 + 5, count * 31 + 11)`, dropping `index` so the per-shrub sequence collapses to one repeated stamp — the exact shape of the shipped defect.
- **Red:** 3 of 12 tests in the file, including the production-placement case.
- **Green after revert:** yes
- **Seed check:** the gate reads its inputs from `buildFarmHedgerowPlacements(12, 10, 32)` and selects the `east` placement, so it measures at the authored seed 19 / count 5 that ships, not at a fixture seed. The canopy case iterates every authored placement, so all four seeds are covered.

## Terminal gates must include promised coverage obligations

- **Gate:** `tests/browser/llmVisualLoopLocalPlayerCompletion.test.mjs` :: `waits for a sell trigger, then sells Tomato before the Tier 4 clean stop`; `tests/browser/llmVisualLoopContract.test.mjs` :: `the terminal stop condition names a sale obligation for every authored crop` — run by `npm test`
- **Mutation:** `scripts/llm-visual-loop/local-player.mjs` terminal predicate drops `tomatoSold &&`.
- **Red:** `expected 'stop' to be 'wait'` — the player declares itself done with a promised control never exercised; 3 tests across 2 files.
- **Green after revert:** yes
- **Horizon closed:** the two existing pins were literal source strings naming four crops, so a fifth crop would have shipped with no sale obligation and both pins would still have matched word for word. The new contract test derives the obligation from `CROP_IDS`. Proved by adding a fifth id to `src/game/content/crops.ts`: `terminal stop condition omits the squash sale obligation`.

## A mode control must activate the input route it promises

- **Gate:** `tests/browser/annotationBoundingBox.test.mjs` :: `drags, persists, reprojects, and restores a world-space bounding-box note` — run by `npm test`
- **Mutation:** `src/ui/farmAnnotationController.ts` `setMode` no longer arms aiming (`if (!this.#aiming) this.toggleAiming(); else …invalidatePanel();` → `…invalidatePanel();`).
- **Red:** `expected 'false' to be 'true'` on the annotation toggle's `aria-pressed` after one click on Box, then a 30s timeout on the drag that never became a box; 2 tests.
- **Green after revert:** yes

## Rectangular evidence needs one coherent transform chain

- **Gate:** `tests/persistence/localAnnotations.test.ts` :: `drops box records with malformed or incoherent geometry without losing valid neighbors`; `tests/annotations/farmAnnotationCapture.test.ts` :: `letterboxes an edge-limited crop instead of stretching it` — run by `npm test`
- **Mutation:** (1) `src/annotations/farmAnnotations.ts` `approximatelyEqualWithin(worldRect.x, expectedWorldRect.x, 1)` → `true`, dropping the re-derivation of the world rect from the camera; (2) `src/annotations/farmAnnotationCapture.ts` `destinationWidth`/`destinationHeight` → `PREVIEW_WIDTH`/`PREVIEW_HEIGHT`, stretching the crop to fill the preview.
- **Red:** (1) `expected [ 'farm-note-valid-box', …(1) ] to deeply equal [ 'farm-note-valid-box' ]` — the forged record survives; (2) `expected 176 to be less than 176`.
- **Green after revert:** yes
- **Gate strengthened:** mutation (1) was GREEN before this session. The fixture's `camera-origin-drift` case moved the camera as well as the world rect, so it was caught by the camera's own `worldView` ↔ `scrollX` coherence rule rather than by the world-vs-camera check the lesson is about. A `world-origin-drift` case was added — world rect, world point and target all shifted together with the camera untouched — which is the coordinated forgery the lesson describes and which only that check rejects.

## Modal pointer gestures need native capture and explicit pause ownership

- **Gate:** `tests/browser/annotationBoundingBox.test.mjs` :: `captures off-canvas releases and ignores Enter until the active drag ends` — run by `npm test`
- **Mutation:** `src/phaser/scenes/FarmScene.ts` `canvas.setPointerCapture(pointerId);` → `void pointerId;`.
- **Red:** `TimeoutError: locator.waitFor: Timeout 3000ms exceeded` — the gesture released outside the canvas never reaches a terminal state, which is the stranded-drag defect itself.
- **Green after revert:** yes
- **Known limit of its reach:** this red is a timeout on the expected terminal state rather than a value assertion. It is the defect (the gesture never terminates), but a future reader should not read a timeout here as a flake.

## Visual-agent progress needs observed UI evidence as well as execution history

- **Gate:** `tests/browser/llmVisualLoopAnnotations.test.mjs` :: `retries failed box actions and keeps annotation drags separate from gameplay drag coverage` — run by `npm test`
- **Mutation:** (1) `scripts/llm-visual-loop/local-player.mjs` `annotationBoxModeConfirmed` drops the observed `state.pressed === 'true'` term and trusts history alone; (2) `capturedBoxAnnotation` no longer accepts an observed draft (`annotationBoxDraftVisible ||` → `false &&`).
- **Red:** (1) `expected { kind: 'drag', …} to match object { kind: 'click', …}` — the player drags after a no-op mode click; (2) `expected { kind: 'wait', ms: 4000 } to match object { kind: 'click', …}` — the player cannot recover from a failed drag whose effect is already on screen.
- **Green after revert:** yes

## Focus ownership and browser-default capture are separate keyboard contracts

- **Gate:** `tests/browser/annotationKeyboard.test.mjs` :: `every gameplay shortcut stays native inside draft and edit textareas` — run by `npm test`
- **Mutation:** `src/phaser/scenes/FarmScene.ts` removes `Phaser.Input.Keyboard.KeyCodes.SHIFT` from the `removeCapture` list, restoring the cursor helper's implicit Shift capture.
- **Red:** `expected [ { type: 'keyup', …(6) } ] to deeply equal []` — the leak shows up on the keyup audit row only, which is exactly why a printable-keydown-only test missed it originally.
- **Green after revert:** yes

## Modal debug tools must own the gameplay input boundary

- **Gate:** `tests/browser/annotations.test.mjs` :: `an active draft consumes farm clicks and keeps the simulation pause locked` — run by `npm test`
- **Mutation:** (1) `src/ui/farmUiController.ts` `this.#annotations?.ownsGameplayInput &&` → `false &&`, so a draft stops blocking gameplay keys; (2) `event.stopImmediatePropagation();` deleted from that block, so the draft declines the event without ending it.
- **Red:** (1) `TimeoutError: locator.fill: Timeout 30000ms exceeded` — gameplay keys reach the farm and tear down the draft; (2) `expected [ ' ', 'z', 'y', 'shift', 'r', …(2) ] to deeply equal [ 'shift' ]`.
- **Green after revert:** yes
- **Gate strengthened:** mutation (2) was GREEN before this session — no other document listener happens to act on those keys today, so `stopImmediatePropagation` was defence against a listener that does not exist yet, and nothing measured it. The test now registers a second document-level `keydown` listener after the app's and asserts it never sees a key the draft claims to have consumed.

## Automation state must come from successful executions

- **Gate:** `tests/browser/coverageReport.test.mjs` :: `coverageLedger > does not count a failed action as exercising its visible control` — run by `npm test`
- **Mutation:** `scripts/llm-visual-loop/coverage-report.mjs` `step.execution?.ok === true && acted` → `acted`, so intent is counted as evidence.
- **Red:** `expected [] to deeply equal [ '#farm-note' ]`.
- **Green after revert:** yes

## Dynamic selectors need semantic coverage identities

- **Gate:** `tests/browser/coverageReport.test.mjs` :: `keeps generated annotation pin gaps persistent across reruns` — run by `npm test`
- **Mutation:** `scripts/llm-visual-loop/coverage-report.mjs` deletes the `[data-annotation-id=` normalization from `coverageKey`.
- **Red:** `expected { …(3) } to deeply equal { added: [], …(2) }` — the same control family reports as one resolved gap and one added gap across two runs.
- **Green after revert:** yes

## Immutable evidence must close its own reference graph

- **Gate:** `tests/browser/recursivePass.test.mjs` :: `keeps pass artifacts and its immutable manifest stable after latest files are replaced`, `rejects missing visual evidence without leaving a pass artifact directory` — run by `npm test`
- **Mutation:** three, each independently, in `scripts/llm-visual-loop/pass-artifacts.mjs`: (1) `rewriteEmbeddedScreenshotReferences` returns its input unchanged, so paths embedded in generated prompts still escape to the mutable canonical directory; (2) the `bundlePath` rewrite is skipped; (3) the `fs.rm(snapshotDir, …)` cleanup on failure is removed.
- **Red:** (1) `expected 'Screenshot file to inspect: C:\Users\…' to contain 'C:\Users\38909\AppData\Local\Temp\far…'`; (2) `expected 'C:\…' to be 'C:\…'` on the archived bundle path; (3) `promise resolved "undefined" instead of rejecting` — a partial pass directory survives missing evidence.
- **Green after revert:** yes

## Persisted numeric identifiers need safe-integer exhaustion behavior

- **Gate:** `tests/persistence/localAnnotations.test.ts` :: `drops records whose positive index is outside the safe-integer boundary`, `wraps safely after the largest safe index instead of overflowing the next note` — run by `npm test`
- **Mutation:** (1) `src/annotations/farmAnnotations.ts` `isInteger` uses `Number.isInteger` instead of `Number.isSafeInteger`; (2) `nextAvailableFarmAnnotationIndex` drops its collision skip (`if (!used.has(candidate)) return candidate;` → `return candidate;`).
- **Red:** (1) `expected [] to deeply equal [ 'farm-note-safe-index' ]` — an unsafe index makes `candidate + 1` a fixed point, the allocator exhausts, and the whole store fails closed; (2) `expected [ 1, 9007199254740991, 1 ] to deeply equal [ 1, 9007199254740991, 2 ]`.
- **Green after revert:** yes
- **Not gated, and deliberately so:** the `candidate === Number.MAX_SAFE_INTEGER ? 1 : candidate + 1` wraps at both allocation sites survive removal with the suite green. They are unreachable: the scan is bounded by `used.size`, and an out-of-range preferred index already falls back to 1 through `isPositiveInteger`. They are defensive, not load-bearing.

## Debug artifacts are persisted untrusted input

- **Gate:** `tests/persistence/localAnnotations.test.ts` :: `round-trips separately from the farm save and drops malformed records safely`, `drops box records with malformed or incoherent geometry without losing valid neighbors` — run by `npm test`
- **Mutation:** (1) `src/persistence/localAnnotations.ts` drops `.filter((record) => isFarmState(record.capture.farmState))`, so the nested farm state is no longer re-validated by the canonical validator; (2) `src/annotations/farmAnnotations.ts` `isAnnotationPick` drops `!isCamera(input.camera) ||`.
- **Red:** (1) 1 test; (2) 2 tests — forged records are admitted into the queue.
- **Green after revert:** yes

## Evidence markers must follow the transformed sample, not its nominal center

- **Gate:** `tests/annotations/farmAnnotationCapture.test.ts` :: `keeps the evidence crosshair on edge clicks after clamping the crop` — run by `npm test`
- **Mutation:** `src/annotations/farmAnnotationCapture.ts` `crosshairX`/`crosshairY` → `PREVIEW_WIDTH / 2` and `PREVIEW_HEIGHT / 2`.
- **Red:** `expected 88 to be close to 2, received difference is 86`.
- **Green after revert:** yes

## Agent control contracts need kind compatibility and successful execution evidence

- **Gate:** `tests/browser/llmVisualLoopAnnotations.test.mjs` :: `rejects action kinds that do not match the observed control contract` — run by `npm test`
- **Mutation:** `scripts/llm-visual-loop/player-provider.mjs` `actionHintAllowsKind` for `type-text` returns `['type', 'click', 'adjust'].includes(kind)`; separately, the `if (!actionHintAllowsKind(…)) return fallback;` guard is removed entirely.
- **Red:** both give `expected { kind: 'adjust', …(3) } to deeply equal { kind: 'wait', ms: 4000 }` — the provider's `adjust` against a textarea is accepted instead of falling back.
- **Green after revert:** yes
- **Known limit of its reach:** `visualActionKindsFor` in `scripts/llm-visual-loop/action-adapter.mjs` advertises the same matrix to the model and is NOT gated — widening it there stays green. It is a prompt hint; the enforcement above is what binds, and the two can drift.

## Decorative anchors are not visual clearance contracts

- **Gate:** `tests/browser/farmBotanyLayout.test.mjs` :: `keeps permanent trees and plant clusters clear of expansion and landmarks`, `names both duck shelters independently of decorative tree ordering` — run by `npm test`
- **Mutation:** (1) `src/phaser/view/farmBotany.ts` elder extent `left: 15` → `left: 45`, giving the crown a silhouette its anchor does not describe; (2) `farmTreeShelterAnchor` returns `layout.trees[0]`/`[1]` by array index instead of the named `shelters` record.
- **Red:** (1) `elder pixels straddle the recenter crop edge: expected false to be true`; (2) `expected { x: -105, y: 31, …(2) } to deeply equal { x: -105, y: 31 }`.
- **Green after revert:** yes

## Additive simulation state has distinct save, history, and replay policies

- **Gate:** `tests/persistence/localSave.test.ts` :: `migrates saves and undo snapshots from before the duck ecology existed`, `rejects malformed duck ecology state before it reaches normalization` — run by `npm test`
- **Mutation:** (1) `src/game/simulation/farmState.ts` removes `state.wildlife ??= createInitialWildlifeState();`, so old saves stop gaining the starter ecology; (2) `src/game/simulation/farmGame.ts` `preserveLegacyWildlifeAbsence` forced to `false`, so pre-feature replay snapshots acquire state that did not exist when they were recorded; (3) `src/persistence/localSave.ts` drops the authored roster length check, so a truncated roster is admitted.
- **Red:** one test each, all in `localSave.test.ts`.
- **Green after revert:** yes

## Visible presentation loops must be continuous at their boundaries

- **Gate:** `tests/browser/storybookArtDirection.test.mjs` :: `keeps looping ambience continuous and worker easing independent of frame partitioning` — run by `npm test`
- **Mutation:** (1) `src/phaser/view/farmMotionMath.ts` `pingPong` returns `phase % span` — a modulo wrap that teleports; (2) `exponentialApproach` returns `Math.min(1, deltaMs / timeConstantMs)` — a per-frame clamped ramp that does not compose.
- **Red:** (1) `expected 238 to be less than or equal to 2`; (2) `expected 0.9523809523809523 to be less than 0.75`.
- **Green after revert:** yes
- **Horizon closed:** mutation (2) was GREEN before this session. The composition law was measured at 200 ms against a 42 ms time constant — about 99% of the way to the target, which is also where a linear ramp saturates, so both implementations satisfied it exactly. The case now repeats the law at 40 ms / 20 ms, where the two curves disagree, with an explicit `< 0.75` assertion proving the sample is not in the saturated region.

## Pixel contracts must isolate the object and prove the fixture state they name

- **Gate:** `tests/browser/storybookArtDirection.test.mjs` :: `keeps a mature Tier 4 crop mix and all four converged farmhands readable at 1280 x 800` and the same at `1024 x 720` — run by `npm test`
- **Mutation:** `src/phaser/view/farmWorkerArt.ts` every farmhand resolves to `FARMHAND_PALETTES[0]`, collapsing four silhouettes into one.
- **Red:** `expected 0 to be greater than 10` at both viewports — the outfit-centroid separation the contract names, measured inside the projected world rectangle rather than over the whole canvas.
- **Green after revert:** yes
- **Fixture state:** the same test asserts all four saved crop IDs from `__farmDebug.getState()` before checking any mature silhouette, so it cannot pass by measuring a farm that never reached the state its title claims.

## Recursive completion conditions must encode the terminal milestone

- **Gate:** `tests/browser/llmVisualLoopHarvestHearth.test.mjs` and `tests/browser/llmVisualLoopLocalPlayerCompletion.test.mjs` :: the latest-claim wait cases — run by `npm test`
- **Mutation:** `scripts/llm-visual-loop/local-player.mjs` terminal predicate drops `tierClaims >= 3 &&`, so cumulative waits can satisfy completion before the latest milestone.
- **Red:** 2 tests across the completion suites.
- **Green after revert:** yes

## Request-aware automation must distinguish reserves, deficits, and pressure

- **Gate:** `tests/browser/llmVisualLoopLocalPlayer.test.mjs` :: `ranks a pressure sale by surplus above the basket reserve, not by raw stock`, `ranks zero-stock seed buying by basket deficit, not by authored crop order` — run by `npm test`
- **Mutation:** `scripts/llm-visual-loop/local-player-support.mjs` (1) `surplus = stock - (needs.get(cropId) ?? 0)` → `surplus = stock`; (2) `deficit = (needs.get(cropId) ?? 0) - stock` → `deficit = 1`.
- **Red:** one test each, on the selector the player chooses.
- **Green after revert:** yes
- **Gate strengthened:** BOTH mutations were green before this session — this lesson had no working gate at all. The existing fixtures happened to rank the same crop first either way: in the surplus case the reserved crop held the smaller raw pile as well as the smaller surplus, and in the seed case the correct crop was also first in the authored crop order. Two new cases were added whose fixtures make the two rankings disagree (carrot holds the larger pile and the smaller surplus; carrot is first in crop order but already over its need).

## Browser replay evidence needs a bounded time window

- **Gate:** `tests/simulation/farmReplayWindow.test.ts` :: `bounds the replay window by an absolute tick ceiling, not by its own constant`, `retains the most recent command-bearing window across a long idle tail` — run by `npm test`
- **Mutation:** (1) `src/debug/farmReplayWindow.ts` `FARM_REPLAY_WINDOW_TICKS` 64 → 100000; (2) `#rotate` drops `if (bundle.commands.length > 0) this.#lastCommandBundle = bundle;`.
- **Red:** (1) all 4 tests, including `expected 100000 to be less than or equal to 256` and `expected 'farm-terminal-replay-window:full' to be 'farm-terminal-replay-window:partial'`; (2) `expected [] to have a length of 1 but got +0`.
- **Green after revert:** yes
- **Horizon closed:** the file's bound assertions compared `durationTicks` against `FARM_REPLAY_WINDOW_TICKS` — a bound that moves with the constant it is meant to pin. The 32 MB size assertion cannot stand in for it either: a 560-tick unit-test session never approaches the string limit that produced the defect. An absolute `REPLAY_WINDOW_ABSOLUTE_CEILING_TICKS = 256` literal now holds the bound.

## Additive save migrations must normalize command history too

- **Gate:** `tests/persistence/localSave.test.ts` :: `migrates pre-pumpkin saves and their undo snapshots into the expanded state` — run by `npm test`
- **Mutation:** `src/game/simulation/farmGame.ts` `restoreHistory` no longer calls `normalizeFarmState(state)`.
- **Red:** `expected undefined to be +0` — Undo restores a snapshot with the new fields missing, while startup still looks healthy.
- **Green after revert:** yes

## Player-editable controls cannot be rebuilt every render frame

- **Gate:** `tests/browser/visualPolish.test.mjs` :: `crop mix number editing keeps focus until the full value is committed`, `crop mix slider stays connected through a real pointer drag and commits once` — run by `npm test`
- **Mutation:** `src/ui/farmUiController.ts`, all four together — the `focusedLiveControl` early return removed, `morphInto` replaced by `panelContent.innerHTML = markup`, the render-interval guard forced open, and the `markup !== this.#lastPanelMarkup` guard forced open. That is the shipped defect: the panel's innerHTML rewritten on every snapshot.
- **Red:** 3 tests, including `expected false to be true` on the focus check and `expected null not to be null` on the committed drag.
- **Green after revert:** yes
- **Known limit of its reach:** each of the four guards alone is redundant with the others, so no single-line mutation goes red. A future reader removing one of them will not be warned by this gate; only removing the last one is caught.

## Save validation must protect graph and actor invariants

- **Gate:** `tests/persistence/localSave.test.ts` :: `rejects maps that cannot support a reachable farm`, `rejects fractional crop quantities before simulation can spend them below zero`, `rejects unsafe worker paths and duplicate worker identities` — run by `npm test`
- **Mutation:** `src/persistence/localSave.ts`, each independently: (1) `isValidTileMap` drops `&& isConnectedTileMap(tiles)`; (2) `isCropIntegerRecord` returns `true`; (3) the duplicate worker-id check is removed; (4) `isWalkableOwnedPosition` drops the `well`/`storage` exclusion.
- **Red:** one test each.
- **Green after revert:** yes
- **Gate strengthened:** mutation (4) was GREEN before this session — no fixture placed a worker on a well or storage tile, so "owned and in bounds" was standing in for "standable". A case was added that parks a worker on the first utility tile it finds; it now fails with `expected { version: 1, … } to be null`.

## Ambient pixels belong to presentation time

- **Gate:** `tests/browser/cozyArtDirection.test.mjs` :: `ambient creek and well pixels keep moving while simulation is paused` — run by `npm test`
- **Mutation:** `src/phaser/view/farmRenderer.ts` `presentationTick` derived from `state.tick` instead of `presentationTimeMs`.
- **Red:** `expected 725558305 not to be 725558305` — the sampled pixels are byte-identical across a real paused browser interval.
- **Green after revert:** yes

## Guided canvas actions must bind the intended tool

- **Gate:** `tests/browser/guidedPaintDecision.test.mjs` :: `selects Plot before canvas when paint guidance appears under another tool` — run by `npm test`
- **Mutation:** `scripts/llm-visual-loop/guided-paint.mjs` `if (!plotToolAction.state?.active)` → `if (false)`, so guided paint clicks the canvas under whatever tool happens to be active.
- **Red:** `expected { kind: 'paint', … } to deeply equal { kind: 'select-plot', … }`.
- **Green after revert:** yes

## Fix scenery clipping at the placement before changing the shared camera frame

- **Not gated. Moved to `docs/policies/local-rules.md`.** The outcome half is already covered by `tests/phaser/farmHedgerow.test.ts` and `tests/browser/farmBotanyLayout.test.mjs`, which require every authored hedge and plant to keep its clearance inside the default recenter viewport. What has no mechanical trigger is the *ordering*: widening the shared frame satisfies those same gates, and the cost only shows up later in unrelated browser suites. That is a repo-local design decision about a shared projection, so it lives in this repo's policies rather than in a test.
