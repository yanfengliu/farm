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

## Debugging Discipline

Reproduce the behavior first, identify the failing invariant, add a failing test or playtest check, then fix the smallest cause.
