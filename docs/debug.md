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

## LLM Playtest Replay Debugging

`npm run playtest:llm` records a Node-side civ-engine `SessionBundle` alongside player-driven browser screenshots and findings:

- `output/playwright/llm-playtest/latest.bundle.json`
- `output/playwright/llm-playtest/latest.replay.md`
- `output/playwright/llm-playtest/latest.annotations.json`

The browser portion of the harness controls the game through visible player actions and records the visible text, available controls, and actions taken for each screenshot. Debug APIs are read afterward for metrics, and the Node-side replay bundle remains available for deterministic investigation.

Use `FARM_PLAYTEST_URL=http://127.0.0.1:5175/` when a Farm dev server is already running and the browser portion should attach to that visible local instance.

Use `npm run playtest:llm:replay` to reopen the saved bundle with `SessionReplayer`, run `selfCheck()`, and sample marker ticks without rerunning the browser harness.

## LLM Visual Loop Debugging

`npm run playtest:llm:visual-loop` writes a player-surface decision replay:

- `output/playwright/llm-visual-loop/latest.md`
- `output/playwright/llm-visual-loop/latest.json`
- `output/playwright/llm-visual-loop/latest.html`
- `output/playwright/llm-visual-loop/steps/`

The visual loop does not rely on browser debug APIs for decisions. Each step stores the screenshot path, visible text, available controls, the decision rationale, the player action executed, and any execution error. Use `latest.html` when debugging why an LLM or heuristic chose an action; use `latest.json` when comparing selectors, bounds, canvas coordinates, or prompt payloads.

If `FARM_LLM_VISUAL_LOOP_COMMAND` is set, the command receives the same observation packet over stdin and must return a decision JSON object. This makes external model-driven playtests debuggable with the same replay artifacts as local heuristic runs.

Use `FARM_PLAYTEST_URL=http://127.0.0.1:5175/` to run the visual loop against the same local Farm server you are inspecting manually.

## Debugging Discipline

Reproduce the behavior first, identify the failing invariant, add a failing test or playtest check, then fix the smallest cause.
