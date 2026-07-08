# Debug Guide

## Browser Debug API

The game exposes:

- `window.render_game_to_text()` for compact state summaries.
- `window.advanceTime(ms)` for deterministic simulation advancement.
- `window.__farmDebug.getState()` for structured snapshots.

These are public test/debug surfaces. Keep them stable or update this document and tests in the same change.

## civ-engine Debugging

Use `civ-engine` snapshots, session recording, replay, and structured debug tools when a headless simulation issue cannot be explained from a normal test failure.

The browser bundle imports `civ-engine` through `src/game/simulation/civEngine.ts`. Keep this adapter narrow. Importing from the root package in browser-facing code can pull in Node-only replay/file modules and break Vite builds.

## Deprecated LLM Playtest Entrypoint

`npm run playtest:llm` is a deprecated compatibility alias for `npm run playtest:llm:visual-loop`. It prints a deprecation warning, defaults `FARM_VISUAL_LOOP_STEPS` to a deeper 120-step audit when the environment does not override it, and writes the canonical visual-loop artifacts under `output/playwright/llm-visual-loop/`.

Older `output/playwright/llm-playtest/*.bundle.json` files were produced by the retired scripted surface-tour harness:

- `output/playwright/llm-playtest/latest.bundle.json`
- `output/playwright/llm-playtest/latest.replay.md`
- `output/playwright/llm-playtest/latest.annotations.json`

Use `npm run playtest:llm:replay` only to reopen one of those legacy bundles with `SessionReplayer`, run `selfCheck()`, and sample marker ticks without rerunning a browser harness.

## LLM Visual Loop Debugging

`npm run playtest:llm:visual-loop` writes a player-surface decision replay:

- `output/playwright/llm-visual-loop/latest.md`
- `output/playwright/llm-visual-loop/latest.json`
- `output/playwright/llm-visual-loop/latest.html`
- `output/playwright/llm-visual-loop/steps/`

The visual loop does not rely on browser debug APIs for decisions. Each decision step stores the screenshot path, visible text, available controls, player-visible control state, the decision rationale, the player action executed, and any execution error. It captures one screenshot per decision step or intentional wait rather than every animation frame. Use `latest.html` when debugging why an LLM or heuristic chose an action; use `latest.json` when comparing selectors, bounds, canvas coordinates, current input values, active controls, or prompt payloads.

If `FARM_LLM_VISUAL_LOOP_COMMAND` is set, the command receives the same observation packet over stdin and must return a decision JSON object. This makes external model-driven playtests debuggable with the same replay artifacts as local heuristic runs.

Use `FARM_PLAYTEST_URL=http://127.0.0.1:5175/` to run the visual loop against the same local Farm server you are inspecting manually.

The visual loop report uses the shared `civ-engine` recursive-improvement contract. `latest.json` records an `improvementRun` manifest, standardized `findings` as `ImprovementFinding` objects, `visualFindings` bridged for visual-playtest consumers, and a `comparison` against the previous run. Treat `verificationStatus` and `nextAction` as required triage fields: `autoFix` findings are implementation bugs or harness faults, `manualFix` findings need product judgment or focused implementation, and `proposalOnly` findings should stay as candidate recommendations until reviewed. Rerun the loop after a change and inspect `comparison.findings.resolved`, `added`, and `persistent` before claiming the loop improved.

## Debugging Discipline

Reproduce the behavior first, identify the failing invariant, add a failing test or playtest check, then fix the smallest cause.
