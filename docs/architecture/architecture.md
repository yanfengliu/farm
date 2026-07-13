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

src/annotations/
  Versioned Farm Notes records, exact click-time captures, validation, and export contracts. These are debugging artifacts, not simulation entities.

src/game/content/
  Crops, prices, tiers, authored village requests, wildlife habitats and tuning, starting farm config, and keybinding data.

src/game/simulation/
  Farm state types, world factory, command handlers, systems, selectors, and text/debug projection.

src/game/input/
  Action identifiers, keyboard shortcuts, mouse tool mapping, and command conversion.

src/phaser/
  Thin Phaser scene orchestration plus layered farm rendering, environment drawing, camera handling, and sprite/texture helpers.

src/ui/
  DOM HUD, toolbar, panels, Farm Notes composer/list, world-pin overlay, and UI state binding.

src/persistence/
  Independent localStorage boundaries for deterministic farm saves and Farm Notes.

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
- Duck needs, activities, distance-scaled habitat travel, fish reservations, and fish respawn.
- Crop growth and water state.
- Inventory, storage capacity, coins, crop mix, global upgrades, milestones, Village Request state, and stats.
- Saveable state.

Simulation code must not import Phaser, touch the DOM, or depend on animation state.

## Renderer Boundary

Phaser owns:

- Deterministic decorative backdrop drawing and explicit meadow, water, ground, scenery, object, actor, overstory, effect, and interaction layers.
- Tile, crop, building, and worker pixel-art drawing.
- Duck and fish pixel-art projection from semantic wildlife habitat nodes; rendering does not choose wildlife behavior.
- Shared scenery geometry for the camera frame, environment bounds, creek, bridge, cottage, garden, tree shelters, and permanent landmark placement.
- Bounded camera pan/zoom, scenic farm framing, and Home-key recentering.
- Pointer hit-testing and screen-to-grid conversion.
- Animation playback and simple effects driven by presentation time rather than deterministic simulation ticks.

Phaser scenes submit commands and consume projected farm snapshots. They do not mutate farm rules directly.

Static dimension- and tier-dependent scenery is cached separately from tile ground, and claiming a tier invalidates that presentation cache so earned homestead flourishes appear immediately. `farmBotany.ts` owns pure permanent-tree/plant descriptors, named duck-shelter anchors, and their pixel drawing; its permanent visual bounds stay outside the buyable grid and required landmark clearances. Wild-cell vignettes are drawn in the ground lane so purchased land replaces them naturally, while low empty-cell clover shares the owned-ground cache and disappears under functional tiles. Presentation-only motion uses Phaser time and never enters a save or replay; looping routes turn around continuously instead of teleporting at modulo boundaries. Worker position easing uses a composable exponential frame-delta step. Worker poses, task props, duck translation, and duck poses use simulation time so actor pixels freeze with the farm, while water shimmer and other ambience may continue.

## UI Boundary

DOM UI owns:

- HUD text and controls.
- Bottom toolbar.
- Collapsible panels.
- Inspect panel.
- Village Request offer and active-basket panel.
- Visible hotkey labels.
- Farm Notes aiming, drafting, list management, and camera-restoring world pins.

UI actions submit commands through the same bridge used by Phaser and tests.

## Save Boundary

The localStorage save contains serializable farm state, including farm simulation tick, inventory, crop mix, global upgrades, milestones, Village Request rotation and progress, wildlife needs and habitat state, stats, and history snapshots. It does not contain the engine replay snapshot's RNG state, Phaser sprites, DOM state, camera animations, ambient effects, or transient hover state.

Load validation rejects disconnected or out-of-bounds owned land, duplicate tile or actor identities, invalid worker positions and task paths, incoherent duck activities, truncated authored duck/fish rosters, crossed fish reservations, fractional item counts, and incomplete nested state before it reaches simulation normalization. Additive migrations normalize both the active snapshot and every Undo/Redo snapshot, reconcile duplicated community progression counters conservatively, add the complete starter wildlife roster to old local saves whose ecology field is absent, and cap command history at 100 entries. Replay application preserves the exact absence of wildlife in pre-ecology bundles rather than silently changing historical state. Autosave and reset-storage failures are non-fatal: the simulation continues and the HUD tells the player that persistence needs attention.

DOM-only UI preferences, such as side-panel width, selected speed, and first-time tutorial dismissal state, may use their own localStorage keys. They must not be mixed into the deterministic farm autosave payload.

Farm Notes use the separate versioned `farm.annotations.v1` key. A note freezes the exact click-time farm snapshot with empty Undo/Redo arrays, state text, camera, viewport, normalized/canvas/world coordinates, semantic target, and a small PNG evidence crop. Creating, editing, deleting, resetting, or reloading notes never enters `FarmState`, the farm autosave, command history, or replay commands. Reset retains records as past-farm context and hides their stale world pins.

## Debug Boundary

The debug surface provides text and structured snapshots that tests can inspect without reading private module internals.

`window.__farmDebug.getAnnotations()`, `getAnnotationContext()`, `exportAnnotation(id)`, and `exportAnnotations()` expose cloned or serialized canonical note bundles. Browser-level `render_game_to_text()` appends aiming/draft/count state and the saved comments so an LLM can understand the same context the player sees without mutating it.

Development replay recording uses rolling 64-tick windows. Every completed window has an initial and terminal snapshot; export prefers the most recent command-bearing window and falls back to the terminal or most recent complete window when no command was recorded. Long accelerated browser sessions therefore keep a non-vacuous deterministic check when possible without serializing their entire lifetime through Playwright. A retained earlier window is always labeled partial, and no partial window claims that the complete visual trajectory is encoded in one bundle; screenshots and the decision log remain the full player-journey record.
