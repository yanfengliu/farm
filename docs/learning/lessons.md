# Engineering Lessons

## 2026-07-13 - Randomized art must be measured at the authored seed

- Surfaced by: the first player-exported Farm Notes Box bundle asked what the long object east of the farm was and called it unnatural; its PNG evidence and world rectangle isolated the seed-19 mixed hedgerow.
- Failure mode: the drawing code contained hash-based width, spacing, height, highlight, and flower branches, but the actual seed/count sequence collapsed those modulo operations to five equal 21-pixel rectangles with equal 35-pixel steps and the same flower condition. Algorithmic randomness existed in source while the authored composition remained a repeated stamp.
- Fix commit: the exported-note hedgerow follow-up mixes independent hash coordinates, lays shrubs along a deterministic crooked rise, builds every crown from compact rounded pixel lobes, and varies highlight, blossom, shoot, shadow, and ground-sprout grammar. It also centralizes placements so rendering and annotation picking share the same bounds.
- Regression anchors: `tests/phaser/farmHedgerow.test.ts` evaluates the real east placement, requires width, top, base, spacing, lobe-aspect, highlight-count, actual fill-width, footprint, and default-recenter containment invariants, and was mutation-proven red by injecting one shrub-width renderer rectangle; `tests/phaser/farmAnnotationTarget.test.ts` replays the original note center and requires `hedgerow:east` / `Wild Hedgerow` instead of meadow. Headless evidence replays the captured camera after the renderer settles and checks the complete thicket with four pixels of world-space breathing room at the supported 1280x800 and 1024x720 framings.
- Behavior delta: the border now reads as an irregular living thicket, and a future comment on it names the graphic rather than only the ground tile underneath.

## 2026-07-13 - Fix scenery clipping at the placement before changing the shared camera frame

- Surfaced by: independent visual review of the first rounded east-hedgerow screenshot found its outer shrubs clipped at both supported desktop sizes.
- Failure mode: enlarging the shared scenery frame made the hedge fit, but also rescaled and shifted the whole world. Six existing browser contracts then failed across annotation clicks, landmark palette sampling, and crop-coordinate mapping even though the hedge itself looked correct.
- Fix commit: the final east placement overlaps its five unequal shrub masses into one dense thicket while retaining the established frame and camera composition.
- Regression anchors: `tests/phaser/farmHedgerow.test.ts` derives the padded recenter viewport from production scenery geometry and requires every authored hedge to keep four pixels of breathing room; the four directly affected browser suites pass 46 tests, and 1280x800 plus 1024x720 captures show the complete silhouette.
- Behavior delta: the east hedge is fully visible without moving the farm, changing click mapping, or shrinking established landmarks.

## 2026-07-13 - Terminal gates must include promised coverage obligations

- Surfaced by: recursive pass `farm-recursive-2026-07-14T03-39-50-565Z` stopped at decision 150 with a low-severity `coverage-gap-data-sell-tomato` finding after the Tomato control was visible 25 times but never exercised.
- Failure mode: the deterministic player required Pumpkin mix, Pumpkin sale, terminal watches, and no actionable guide before stopping, but did not require its documented single-crop sale tour. A timing path protected Tomato for an active request and later bulk-sold full storage, so the remaining Tomato first became available after every listed stop predicate was already true.
- Fix commit: the recursive-coverage follow-up makes terminal completion depend on successful Carrot, Wheat, Tomato, and Pumpkin single-sale actions while retaining normal late-game sale triggers instead of selling tiny inventory merely for coverage.
- Regression anchors: `tests/browser/llmVisualLoopLocalPlayerCompletion.test.mjs` proves low-pressure Tier 4 waits rather than stopping or needlessly selling, then selects Tomato at the existing 12/15 pressure threshold; `tests/browser/llmVisualLoopContract.test.mjs` pins the full terminal predicate. Final run `farm-visual-loop-2026-07-14T04-37-22-653Z` has zero findings and records `coverage-gap-data-sell-tomato` in `comparison.resolved` with strong replay.
- Behavior delta: the local player now completes its promised unlocked-crop control tour before declaring the bounded scenario done, without changing the game or its economical late-game selling policy.

## 2026-07-13 - A mode control must activate the input route it promises

- Surfaced by: direct player feedback reported that Box annotation behaved like one farm-grid cell. The existing freeform test stayed green because it always pressed `N` before clicking Box, while the actual idle-panel path clicked Box and dragged immediately.
- Failure mode: the Box button changed `AnnotationGesture.mode` but left aiming false. Phaser then correctly rejected annotation ownership and forwarded the drag to the active grid tool; the panel also labeled a real rectangle by its center cell, reinforcing the false impression that box geometry was snapped.
- Fix commit: the freeform-box follow-up makes Point and Box controls arm aiming when idle, reserves Box creation for a real pointer drag, reports live and saved pixel dimensions, and keeps center-cell target text secondary.
- Regression anchors: `tests/browser/annotationBoundingBox.test.mjs` starts from an idle Notes panel, clicks Box once, reverse-drags between deliberately non-grid-aligned coordinates, requires the exact normalized rectangle plus live/draft/list dimension labels, and proves farm identity, tile kinds, and command history remain unchanged. Its red phase observed `aria-pressed=false` on the annotation toggle after clicking Box.
- Behavior delta: one click on Box now means the very next mouse drag draws the requested arbitrary rectangle instead of editing one farm cell.

## 2026-07-13 - Rectangular evidence needs one coherent transform chain

- Surfaced by: adversarial persistence review shifted a saved box's point and world bounds together while leaving the camera unchanged, and visual review compared an edge-clamped wide selection with its evidence preview. Local range checks accepted the coordinated forgery, while filling the fixed preview rectangle distorted the selected region.
- Failure mode: validating each rectangle independently does not prove that client, canvas, normalized, world, camera-scroll, viewport, and zoom coordinates describe the same gesture. Similarly, correct source bounds do not preserve evidence when the destination silently changes aspect ratio.
- Fix commit: the Farm Notes bounding-box change validates the complete camera transform, rejects overflow and nonfinite geometry, expands crops without leaving the canvas, and letterboxes the remaining destination when an edge prevents an aspect-preserving expansion.
- Regression anchors: `tests/persistence/localAnnotations.test.ts` rejects coordinated world/camera shifts, incoherent scroll and world views, and overflow; `tests/annotations/farmAnnotationCapture.test.ts` pins wide, edge-clamped, and 2x backing-buffer crops; `tests/browser/annotationBoundingBox.test.mjs` decodes the real PNG and proves its outline, world projection, reload, and camera restore.
- Behavior delta: a persisted box cannot claim a different world region by shifting mutually consistent-looking fields, and its preview remains a faithful pixel window rather than a stretched thumbnail.

## 2026-07-13 - Modal pointer gestures need native capture and explicit pause ownership

- Surfaced by: independent UI review dragged a Box annotation beyond the canvas and released, then pressed `Enter` during another active drag. Phaser alone did not guarantee the native release reached the scene, and the keyboard interleave could replace the gesture while preserving the wrong pre-draft pause value.
- Failure mode: a multi-event gesture owns more state than its current pointer coordinates. Without native pointer capture, release outside the hit area can strand dragging state; without an explicit interleave rule, a second capture path can overwrite the pause restoration boundary established by the first.
- Fix commit: the bounding-box change captures the real DOM pointer id, releases it in a `finally` path on pointer up, handles pointer cancellation, capture loss, blur, and scene shutdown, clamps out-of-canvas endpoints, ignores ordinary `Enter` until the active drag ends, and restores only the pause state owned by the completed or cancelled draft.
- Regression anchors: `tests/browser/annotationBoundingBox.test.mjs` releases beyond the canvas, forces capture loss, cancels active and tiny drags, interleaves `Enter`, verifies the retained draft outline, and proves a previously paused farm stays paused after both gesture cancellation and save.
- Behavior delta: box selection always reaches a terminal state and cannot leak a stuck modal input lock or resume a farm that the player had already paused.

## 2026-07-13 - Visual-agent progress needs observed UI evidence as well as execution history

- Surfaced by: adversarial loop review supplied a drag execution marked failed while the browser already displayed the resulting Box draft. The first repair retried because it trusted the failure row; the opposite history-only approach could also advance after a no-op mode click or failed drag.
- Failure mode: automation history reports what the adapter returned, while the current UI reports what state survived. Either source can be incomplete at an event boundary, so a stateful curriculum must require compatible observed mode/draft evidence and tolerate a partial-success action whose effect is already visible.
- Fix commit: the bounding-box change recognizes Box mode only from observed pressed state, advances a drag only when a Box draft is observed or a later type/save proves capture, treats an observed draft as authoritative after adapter failure, releases the mouse in a `finally` path, and excludes annotation drags from plot-paint coverage.
- Regression anchors: `tests/browser/llmVisualLoopAnnotations.test.mjs` pins no-op mode clicks, failed drag retries, observed-draft recovery after a failed history row, pointer-up cleanup, and annotation-versus-gameplay drag separation; recursive run `farm-visual-loop-2026-07-14T02-42-51-437Z` visibly completed Point -> Box -> drag -> cancel -> drag -> type -> save with zero failed actions.
- Behavior delta: the player neither skips a missing annotation nor overwrites one that already exists, and annotation coverage cannot manufacture gameplay-paint proof.

## 2026-07-13 - Focus ownership and browser-default capture are separate keyboard contracts

- Surfaced by: the player reported that `W`, `A`, `S`, and `D` could not be typed into a Farm Note. A real-keyboard browser regression reproduced `wasd WASD` as one surviving space even though `.fill()`-based tests had passed. The subsequent all-shortcut audit found a second hidden leak: `createCursorKeys()` registered Shift, whose `keyup` still arrived with `defaultPrevented` after WASD was repaired.
- Failure mode: checking `document.activeElement` was sufficient to stop camera movement but not text suppression. Phaser's `addKeys` and cursor convenience helper also capture browser defaults for registered keys, so their global listeners can call `preventDefault` before or after a textarea handles the event. Testing only printable `keydown` misses modifier `keyup` capture.
- Fix commits: `70c20df` removes browser-default capture for W, A, S, and D; the bounding-box annotation change extends that removal to arrows, Home, Space, and the cursor helper's implicit Shift key while retaining Phaser key-state tracking.
- Regression anchors: `tests/browser/annotationKeyboard.test.mjs` real-types every gameplay shortcut in mixed case through both editors; exercises Space, arrows, Home, Enter, Shift+Enter, Delete, Backspace, selection, Undo/Redo, and held movement keys; audits both event phases for unexpected `defaultPrevented`; verifies exact saved text through debug export, local storage, DOM, and reload; and proves those same movement keys still pan when the canvas owns focus. Restoring Shift capture makes the contract fail on the exact `keyup` audit row.
- Behavior delta: focused note editors retain native prose, navigation, and editing behavior for every game-registered key, while an unfocused farm canvas keeps the same controls; only explicit note cancel and save chords are consumed.

## 2026-07-13 - Modal debug tools must own the gameplay input boundary

- Surfaced by: independent code review placed a plot, opened a paused Farm Notes draft, focused the canvas, pressed `Z`, and cancelled the draft; the queued Undo then removed the plot even though the farm appeared locked while the editor was open. Toolbar Undo/Redo, tool/speed keys, and `Shift+R` shared the same leak.
- Failure mode: pausing simulation time and consuming canvas picks are separate from isolating document-level controls. A modal editor that returns early only for its own keys can still let the same bubbled event reach global UI and Phaser listeners, while command buttons can mutate history behind the editor.
- Fix commit: `fix: harden recursive Farm Notes proof` routes annotation commands first, blocks non-annotation farm commands while drafting, and prevents the remaining document event from reaching later gameplay listeners.
- Regression anchors: `tests/browser/annotations.test.mjs` creates a real plot, opens a draft, attempts another canvas paint, toolbar Undo, Space, Z, Y, reset, tool, and speed inputs, then cancels and proves the tile, farm identity, history, tick, tool, and speed are unchanged.
- Behavior delta: writing a Farm Note is now an actual modal pause rather than a visual pause with deferred gameplay side effects.

## 2026-07-13 - Automation state must come from successful executions

- Surfaced by: independent review injected failed accept-request, canvas-paint, and Undo executions into the local player's history. The next decisions incorrectly abandoned a basket, attempted Undo, and advanced to Redo because the curriculum summarized intended decisions rather than browser outcomes.
- Failure mode: a decision log records intent, not evidence. Treating a failed action as completed poisons every derived state machine and can turn a clean coverage report into a sequence of controls that the browser never exercised. Similarly, limiting the three displayed coverage findings must not remove undisplayed gap classes from the open set used for cross-run resolution.
- Fix commit: `fix: harden recursive Farm Notes proof` filters only explicit `execution.ok === false` steps from curriculum state while retaining older success-by-default fixtures, and compares runs with the union of emitted findings plus every uncapped coverage-gap id.
- Regression anchors: `tests/browser/llmVisualLoopLocalPlayerCompletion.test.mjs` pins retry behavior after all three failed action classes; `tests/browser/coverageReport.test.mjs` proves a high-ranked replacement cannot falsely resolve a gap displaced below the display cap.
- Behavior delta: the local player retries work that did not happen, and rerun comparisons describe all open proof work even when reports remain concise.

## 2026-07-13 - Dynamic selectors need semantic coverage identities

- Surfaced by: final adversarial review compared two otherwise identical runs whose unexercised Farm Note pin selectors differed only by generated annotation id. The old pin appeared under `resolved` and the new pin under `added` instead of one persistent control family.
- Failure mode: a selector can be stable within one browser run but still carry generated content identity. Cross-run coverage keyed to that literal value measures instance churn rather than whether the shared interaction contract was exercised.
- Fix commit: `23f03ae` normalizes every `[data-annotation-id=...]` pin to the semantic `[data-annotation-id]` coverage family, matching the existing rotating-request treatment.
- Regression anchors: `tests/browser/coverageReport.test.mjs` builds two runs with different generated note ids and requires the comparison to report one persistent `coverage-gap-data-annotation-id` with no added or resolved ids.
- Behavior delta: changing a generated Farm Note id between recursive runs can no longer manufacture false coverage progress.

## 2026-07-13 - Immutable evidence must close its own reference graph

- Surfaced by: independent artifact audit opened older pass snapshots and found their JSON `bundlePath` still resolved to the newest canonical bundle, their `screenshotFile` values pointed to mutable canonical steps, and their pass directories contained no screenshots. A byte comparison showed 161 of 161 old visual references had silently become the newer run. Final diff review then found the same absolute path duplicated inside observation prompts even after the explicit screenshot fields were rewritten.
- Failure mode: copying a report file does not make the evidence immutable when paths inside that report escape to a mutable directory, and rewriting named fields is insufficient when generated prompts embed the same references in native, normalized, or JSON-escaped form. A durable proof packet must archive every referenced leaf, close every embedded reference, and fail atomically on missing evidence.
- Fix commits: `e8a018a` snapshots the replay bundle and every referenced step image, rewrites bundle and explicit screenshot paths, regenerates stable Markdown/HTML, exposes all artifact kinds, and removes partial directories on failure; `7f261c9` also rewrites embedded native, forward-slash, and JSON-escaped screenshot references.
- Regression anchors: `tests/browser/recursivePass.test.mjs` replaces canonical JSON, report, bundle, and screenshot bytes after snapshotting and proves the immutable run still resolves only the original bundle/session and image, including every prompt path spelling; a missing referenced image rejects the snapshot and leaves no pass directory. Final wrapper `farm-recursive-2026-07-14T00-05-08-979Z` archived 147 resolving screenshot references with zero canonical-path strings or byte mismatches.
- Behavior delta: each recursive pass can be reviewed later without trusting whatever files happen to be named `latest` at that time.

## 2026-07-13 - Persisted numeric identifiers need safe-integer exhaustion behavior

- Surfaced by: persistence hardening review set the Farm Notes counter near JavaScript's exact-integer boundary and supplied forged records with unsafe indices. Incrementing a merely finite integer could repeat rounded values, collide with an existing id, or make delete/edit target a different note.
- Failure mode: `Number.isInteger` permits values beyond `Number.MAX_SAFE_INTEGER`, where adding one is not guaranteed to produce a distinct number. Persisted allocators also need collision checks because storage is untrusted and older versions may leave sparse or duplicate-looking sequences.
- Fix commit: `fix: harden recursive Farm Notes proof` accepts only safe positive indices, sanitizes the persisted next counter, skips occupied ids, and wraps to the first available safe slot at exhaustion.
- Regression anchors: `tests/persistence/localAnnotations.test.ts` rejects unsafe record indices and proves allocation remains unique at the safe-integer ceiling and in collision-filled stores.
- Behavior delta: forged or exhausted local counters cannot create ambiguous Farm Note identities.

## 2026-07-13 - Debug artifacts are persisted untrusted input

- Surfaced by: independent correctness review forged an otherwise plausible `farm.annotations.v1` record with markup in `capture.farmState.tick`, then removed `capture.pick.camera`; the shallow bundle check admitted both, allowing raw panel interpolation in one path and a View crash in the other.
- Failure mode: a debugging bundle can feel internal because the app created it, but localStorage, copied JSON, devtools, extensions, and older versions can all change it. Validating only the outer record leaves every nested field that rendering, camera restore, or export assumes as an untrusted crash or injection surface. Output escaping is still required even after validation because display strings are intentionally user-authored.
- Fix commit: `51228fa` reuses the canonical `FarmState` validator, validates every nested coordinate/camera/viewport/interaction/history field and a bounded real PNG data URL, filters invalid records before cloning, and escapes capture metadata at the panel boundary.
- Regression anchors: `tests/persistence/localAnnotations.test.ts` rejects forged tick, missing camera, script-like preview, duplicate, over-limit, and malformed JSON records; `tests/browser/annotations.test.mjs` corrupts a valid saved record, reloads the real app, and proves no record, page error, or injected global survives.
- Behavior delta: malformed notes now fail closed to the remaining valid queue, while valid user comments stay visibly literal and copyable instead of being treated as markup.

## 2026-07-13 - Evidence markers must follow the transformed sample, not its nominal center

- Surfaced by: independent visual review clicked near a canvas edge and compared the resulting evidence crop with the world target. The crop window clamped against the source boundary, but the crosshair stayed at the preview center, pointing at a different pixel than the recorded click.
- Failure mode: centering a marker is correct only while the sample window can remain centered. Once cropping, camera bounds, or viewport clipping shifts that window, the marker must transform the original point through the final clamped source rectangle or the debugging evidence contradicts its own coordinates.
- Fix commit: `51228fa` computes one explicit crop geometry, clamps its source rectangle first, and maps the selected drawing-buffer point into preview coordinates before drawing the crosshair.
- Regression anchors: `tests/annotations/farmAnnotationCapture.test.ts` pins both top-left and bottom-right clamped cases, while `tests/browser/annotations.test.mjs` proves exact normalized pointer and keyboard-center coordinates in live captures.
- Behavior delta: evidence previews now mark the selected detail even at every canvas edge instead of silently drifting toward the preview center.

## 2026-07-13 - Agent control contracts need kind compatibility and successful execution evidence

- Surfaced by: independent loop review showed an external provider could return `adjust` for a visible textarea and pass selector normalization; the coverage ledger then counted any attempted selector as exercised even when browser execution failed. UI review separately showed annotation text could be lost when the panel rerendered after switching tabs.
- Failure mode: a selector proves which element was named, not which operations it supports or whether an operation completed. Likewise, the live DOM is not durable editor state when a panel is rebuilt. Treating attempts as coverage turns failed automation into false proof, while treating a textarea node as the source of truth loses unsaved user intent on ordinary rerenders.
- Fix commit: `51228fa` enforces an observed action-hint/kind matrix, bounds nonblank textarea input, counts coverage only after `execution.ok`, labels textareas semantically, and keeps draft/edit buffers in the annotation controller while focused editors suppress replacement.
- Regression anchors: `tests/browser/llmVisualLoopAnnotations.test.mjs` rejects click/adjust/blank type actions against a textarea and bounds valid text; `tests/browser/coverageReport.test.mjs` keeps failed controls uncovered; `tests/browser/annotations.test.mjs` switches panels during draft and edit, exposes inline validation, and clears a focused draft safely on reset. Targeted run `farm-visual-loop-2026-07-13T21-05-26-586Z` then executed the six-action note curriculum with zero action failures.
- Behavior delta: the LLM can type only through a compatible observed text control, failed actions remain visible as coverage gaps, and a player's unfinished comment survives panel navigation until explicitly saved, cancelled, or reset.

## 2026-07-13 - Decorative anchors are not visual clearance contracts

- Surfaced by: independent hardening review of the living-hedgerow diff after the 1280x800 and 1024x720 browser captures. The review traced the western elder and willow crowns beyond their placement anchors and found three to five visible pixels could clip at the default recenter; it also found southern permanent plants crossing two to three pixels into buildable land while a later render layer happened to conceal the overlap.
- Failure mode: checking only an object's anchor proves where it starts, not where its full pixel silhouette ends. Renderer layer order can then hide an invalid placement without making the world geometry valid, and using a tree's array index as wildlife habitat identity lets an innocent art-direction reorder silently move a named shelter.
- Fix commit: `2ea068a` gives every permanent tree and plant an explicit visual-bounds contract, narrows or repositions the offending silhouettes, moves southern plants beyond the farm's actual visual boundary, and exposes named duck-shelter anchors independently of tree ordering.
- Regression anchors: `tests/browser/farmBotanyLayout.test.mjs` checks every permanent plant's real pixel bounds against the farm, bridge, garden, and default recenter viewport, and pins the named shelters exactly; `tests/browser/vegetationArtDirection.test.mjs` proves the intended vegetation palette at both desktop viewports; final screenshots live under `output/playwright/botany-review/`, and recursive run `farm-visual-loop-2026-07-13T19-17-25-242Z` completed its bounded 127-decision surface with no findings or replay divergence.
- Behavior delta: default recenter no longer clips the western crowns, permanent decorative pixels no longer intrude into buildable or bridge space, and Pip and Mallow keep their authored shelters even when the tree composition changes.

## 2026-07-13 - Additive simulation state has distinct save, history, and replay policies

- Surfaced by: duck-ecology implementation review against a committed pre-ecology replay bundle. A blanket default could make old replays diverge, while `Object.assign` during Undo/Redo could carry current ecology through a historical core that never stored it; the same audit showed a structurally valid but truncated current payload could permanently remove an authored duck or fish.
- Failure mode: local save migration, command-history restoration, and deterministic replay ingestion look like one JSON-normalization problem but promise different behavior. Local saves should gain additive current content, current history should restore a complete coherent snapshot, and historical replay snapshots must not acquire state that did not exist when recorded. Validating references alone also misses a fixed authored roster that has been silently shortened.
- Fix commit: `8335245` gives old local saves and old local history the full starter ecology, preserves ecology absence across pre-feature replay step/text/Undo, and requires exact authored duck ID/name plus fish ID/habitat membership whenever a current ecology payload exists.
- Regression anchors: `tests/persistence/localSave.test.ts` covers whole-field migration, historical Undo, truncated rosters, habitat substitution, and reservation/activity coherence; `tests/simulation/wildlife.test.ts` applies and steps an ecology-free world snapshot, renders its legacy text surface, and exercises Undo without inventing wildlife. The committed legacy `latest.bundle.json` still self-checks with one checked segment and no divergence.
- Behavior delta: ordinary returning players receive Pip, Mallow, and all four renewable fish exactly once, corrupt partial ecology fails closed, and previously recorded deterministic evidence remains historically exact instead of crashing or silently changing meaning.

## 2026-07-13 - Visible presentation loops must be continuous at their boundaries

- Surfaced by: adversarial hardening review followed by a 13-second paused-browser sample at 1024x720. The duck-color centroid jumped 320.30 pixels between adjacent 100 ms samples when its route wrapped, even though the existing 700 ms motion check stayed green; the same review found that clamping one 200 ms worker-easing frame differed from two 100 ms frames by 8.39 percentage points.
- Failure mode: modulo is suitable for cycling phases but teleports a visible object's position from the end of a route to its beginning. A short test that only proves pixels moved cannot observe the eventual discontinuity. Independently clamping frame delta also breaks the composition law expected from exponential smoothing, making interpolation depend on how the renderer partitions elapsed time.
- Historical fix commit: `4dea7d7` replaced the then-presentational duck and butterfly position wraps with continuous ping-pong routes and anchored oscillation, and routed worker easing through an unclamped exponential approach factor while keeping actor poses on simulation time.
- Current regression anchors: `tests/browser/storybookArtDirection.test.mjs` still pins presentation-only butterfly continuity and proves one 200 ms exponential worker approach equals two composed 100 ms approaches. Ducks have since become deterministic wildlife actors; commit `8335245` proves their state and actor pixels freeze while paused and enumerates every creek/tree node pair through the real pixel projection with a six-world-pixel per-tick ceiling.
- Behavior delta: the original 13-second browser recheck reduced the worst adjacent duck-centroid change from 320.30 pixels to 10.87 pixels. The self-directed ecology follow-up removes that decorative route, reverses endpoint roaming, and bounds every measured habitat hop to at most 5.10 world pixels per tick; worker interpolation remains invariant to equivalent frame partitions.

## 2026-07-13 - Pixel contracts must isolate the object and prove the fixture state they name

- Surfaced by: content-depth review of the late-game art fixture and a transient false failure after the scarecrow patch reused the harvest-vignette teal. The test title promised a mature four-crop farm but initially asserted only worker shirts, while its whole-canvas festival count could include an unrelated prop that shared the same exact color.
- Failure mode: whole-canvas palette counts can pass or fail for the wrong object as an art palette evolves, and a visually named fixture is not evidence unless the underlying debug state and the intended pixels are both asserted. This is especially risky when autonomous workers can change ripe plots before a screenshot is sampled.
- Fix commit: `4dea7d7` scopes canopy, mature crop, and clustered-worker palette measurements to projected world rectangles, gives the scarecrow patch a separate color, and asserts all four saved crop IDs before checking each mature silhouette at both desktop viewports.
- Regression anchors: `tests/browser/storybookArtDirection.test.mjs` proves permanent canopy stays out of a fully owned 12x10 farm, Tier 4 festival teal is absent at Tier 1 and present at Tier 4, carrot/wheat/tomato/pumpkin plots and mature palettes survive the pause boundary, and four outfit centroids remain separated by more than 14 screen pixels at 1280x800 and 1024x720.
- Behavior delta: art tests now fail on the intended semantic object instead of a coincidental shared color, and the late-game readability claim cannot stay green if crops disappear or farmhands collapse into one silhouette.

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
