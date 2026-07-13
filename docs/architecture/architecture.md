# Architecture

## Overview

The game separates deterministic simulation from presentation. `civ-engine` owns the source of truth. Phaser renders the farm and handles canvas interaction. DOM UI renders text-heavy HUD and panels. Persistence saves serializable simulation snapshots.

```text
DOM UI and Phaser input
  -> action mapper
  -> simulation command bridge
  -> civ-engine world and farm systems
  -> projected farm snapshot
  -> Phaser scene and DOM stores
```

## Module Map

```text
src/main.ts
  Browser entry point.

src/game/content/
  Crops, prices, tiers, authored village requests, starting farm config, tuning constants, and keybinding data.

src/game/simulation/
  Farm state types, world factory, command handlers, systems, selectors, and text/debug projection.

src/game/input/
  Action identifiers, keyboard shortcuts, mouse tool mapping, and command conversion.

src/phaser/
  Thin Phaser scene orchestration plus layered farm rendering, environment drawing, camera handling, and sprite/texture helpers.

src/ui/
  DOM HUD, toolbar, panels, and UI state binding.

src/persistence/
  localStorage save/load boundary.

src/debug/
  Browser debug API installation.

tests/
  Headless simulation contracts and browser/playtest tests.
```

## Simulation Boundary

The simulation owns:

- Farm grid and owned land.
- Buildable objects.
- Workers and tasks.
- Crop growth and water state.
- Inventory, storage capacity, coins, crop mix, global upgrades, milestones, Village Request state, and stats.
- Saveable state.

Simulation code must not import Phaser, touch the DOM, or depend on animation state.

## Renderer Boundary

Phaser owns:

- Deterministic decorative backdrop drawing and explicit meadow, water, ground, scenery, object, actor, overstory, effect, and interaction layers.
- Tile, crop, building, and worker pixel-art drawing.
- Shared scenery geometry for the camera frame, environment bounds, creek, bridge, cottage, garden, and permanent landmark placement.
- Bounded camera pan/zoom, scenic farm framing, and Home-key recentering.
- Pointer hit-testing and screen-to-grid conversion.
- Animation playback and simple effects driven by presentation time rather than deterministic simulation ticks.

Phaser scenes submit commands and consume projected farm snapshots. They do not mutate farm rules directly.

Static dimension- and tier-dependent scenery is cached separately from tile ground, and claiming a tier invalidates that presentation cache so earned homestead flourishes appear immediately. Wild-cell vignettes are drawn in the ground lane so purchased land replaces them naturally, while permanent landmarks stay outside the buyable grid. Presentation-only motion uses Phaser time and never enters a save or replay; looping routes turn around continuously instead of teleporting at modulo boundaries. Worker position easing uses a composable exponential frame-delta step, while actor pose and task-prop animation use simulation time so they freeze with the farm.

## UI Boundary

DOM UI owns:

- HUD text and controls.
- Bottom toolbar.
- Collapsible panels.
- Inspect panel.
- Village Request offer and active-basket panel.
- Visible hotkey labels.

UI actions submit commands through the same bridge used by Phaser and tests.

## Save Boundary

The localStorage save contains serializable simulation state, including world tick, farm state, inventory, crop mix, global upgrades, milestones, Village Request rotation and progress, stats, history snapshots, and RNG state. It does not contain Phaser sprites, DOM state, camera animations, ambient effects, or transient hover state.

Load validation rejects disconnected or out-of-bounds owned land, duplicate tile or worker identities, invalid worker positions and task paths, fractional item counts, and incomplete nested state before it reaches simulation normalization. Additive migrations normalize both the active snapshot and every Undo/Redo snapshot, reconcile duplicated community progression counters conservatively, and cap command history at 100 entries. Autosave and reset-storage failures are non-fatal: the simulation continues and the HUD tells the player that persistence needs attention.

DOM-only UI preferences, such as side-panel width, selected speed, and first-time tutorial dismissal state, may use their own localStorage keys. They must not be mixed into the deterministic farm autosave payload.

## Debug Boundary

The debug surface provides text and structured snapshots that tests can inspect without reading private module internals.

Development replay recording uses rolling 64-tick windows. Every completed window has an initial and terminal snapshot; export prefers the most recent command-bearing window and falls back to the terminal or most recent complete window when no command was recorded. Long accelerated browser sessions therefore keep a non-vacuous deterministic check when possible without serializing their entire lifetime through Playwright. A retained earlier window is always labeled partial, and no partial window claims that the complete visual trajectory is encoded in one bundle; screenshots and the decision log remain the full player-journey record.
