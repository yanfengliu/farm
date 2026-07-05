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
  Crops, prices, tiers, starting farm config, tuning constants, and keybinding data.

src/game/simulation/
  Farm state types, world factory, command handlers, systems, selectors, and text/debug projection.

src/game/input/
  Action identifiers, keyboard shortcuts, mouse tool mapping, and command conversion.

src/phaser/
  Phaser scene setup, camera handling, farm renderer, and sprite/texture helpers.

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
- Inventory, storage capacity, coins, crop mix, global upgrades, milestones, and stats.
- Saveable state.

Simulation code must not import Phaser, touch the DOM, or depend on animation state.

## Renderer Boundary

Phaser owns:

- Tile and sprite drawing.
- Camera pan/zoom.
- Pointer hit-testing and screen-to-grid conversion.
- Animation playback and simple effects.

Phaser scenes submit commands and consume projected farm snapshots. They do not mutate farm rules directly.

## UI Boundary

DOM UI owns:

- HUD text and controls.
- Bottom toolbar.
- Collapsible panels.
- Inspect panel.
- Visible hotkey labels.

UI actions submit commands through the same bridge used by Phaser and tests.

## Save Boundary

The localStorage save contains serializable simulation state, including world tick, farm state, inventory, crop mix, global upgrades, milestones, stats, and RNG state. It does not contain Phaser sprites, DOM state, camera animations, or transient hover state.

## Debug Boundary

The debug surface provides text and structured snapshots that tests can inspect without reading private module internals.
