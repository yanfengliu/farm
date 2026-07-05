# Roadmap

## Milestone 0: Project Foundation

- Establish workflow docs, architecture docs, and design docs.
- Scaffold Vite, TypeScript, Phaser, `civ-engine`, Vitest, ESLint.
- Add first headless simulation contract tests.

## Milestone 1: Headless Farm Loop

- Create deterministic `civ-engine` farm world.
- Model owned land, plots, wells, storage, crop inventory, seed inventory, crop mix, workers, and stats.
- Implement worker autonomy for planting, watering, harvesting, seed hauling, crop hauling, and idle recovery.
- Implement milestone tier progression and starter-seed trickle.
- Implement global tool upgrades as coin sinks for worker speed and watering efficiency.
- Add localStorage save/load helpers.

## Milestone 2: Playable Browser Slice

- Render the farm with top-down pixel-style Phaser primitives or generated pixel textures.
- Add pan/zoom camera, mouse placement, drag painting, and hotkeys.
- Add DOM HUD, bottom toolbar, and collapsible inventory/milestone/inspect panels.
- Add manual selling, speed controls, undo/redo, autosave, and debug APIs.

## Milestone 3: Verification And Polish

- Add browser playtest coverage for the core loop.
- Verify screenshots for desktop and smaller desktop-like viewport sizes.
- Tune early pacing so the first worker visibly plants, waters, harvests, and sells in a short session.
- Keep the MVP silent.

## Later

- Weather and seasons.
- Accessibility settings.
- Decorations.
- Processing and crafting chains.
- Offline progress.
- Desktop packaging or overlay mode.
