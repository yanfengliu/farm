# Living Farmhands & Storybook Chrome

Design for the next graphics/UI enrichment increment. Brainstormed autonomously per the session's standing directive; alternatives and rejections recorded below. Implementation follows the repo's normal TDD/gates/review workflow rather than a separate plan document, because the increment is one session's work executed by the same agent.

## Goal

Deepen the game's storybook identity where the player's eye already rests — the farmhands doing their work and the panels that describe them — without touching simulation rules, save schema, or any deterministic screenshot contract.

## What ships

### 1. Named farmhands (content + projection)

The four farmhands gain stable botanical names — Fern, Alder, Poppy, Rowan — matching their existing outfit palettes by worker id. Names live in `src/game/content/farmhands.ts` as `FARMHAND_PROFILES`; a `farmhandName(id)` helper projects id to name at render time. Nothing enters `FarmState` or the save: a returning player's save gains names with no migration, exactly as duck names would read if projected. The Inspect panel heading becomes "Fern the farmhand" style; the HUD Workers chip and hover labels are unchanged this increment.

### 2. Inspect pixel portraits (reuse, not duplication)

Every art module's Phaser import is type-only; draw functions call only `fillStyle(color, alpha)` and `fillRect(x, y, w, h)`. A minimal `PixelPainter` interface in `src/phaser/view/pixelPainter.ts` names that contract, `drawFarmhand` is retyped against it (Phaser Graphics remains structurally compatible; zero behavior change), and a new `drawFarmhandPortrait(painter, workerId)` wrapper in the same art module renders the standing pose from a synthetic frozen state so pose knowledge stays local to the art file.

`src/ui/inspectPortrait.ts` adapts a DOM `<canvas>` 2D context to `PixelPainter` (hex+alpha to rgba fillStyle) and draws the portrait at 4x scale with `image-rendering: pixelated`. The Inspect worker view gains the portrait above the detail rows. Buildings and crop close-ups are deliberately deferred until the tile art is painter-typed the same way.

Boundary note for the architecture doc: `src/ui` importing pure draw functions from `src/phaser/view` pulls no Phaser runtime (type-only imports); the dependency is one-way and presentation-only.

### 3. Work effects (presentation-only)

`src/phaser/view/farmWorkEffects.ts` adds a small effect system in the existing effects lane:

- Planting: two or three soil-toned dust pixels puff outward.
- Watering: three falling droplet pixels in the water palette.
- Harvesting: four harvest-gold sparkle pixels rising with fade.

Spawning is a pure decision function `workEffectSpawns(previousTotals, nextTotals, workers)`: when a lifetime stat (planted/watered/harvested) increases between snapshots, spawn at each worker whose current task kind matches that verb, at the worker's tile. Particles animate on presentation time with a hard cap (48 live particles; oldest evicted) and never enter saves, replay, or simulation state. While paused, stats cannot change, so no new spawns; in-flight particles finish, consistent with the documented "ambience may continue" rule. Positions derive from worker tiles plus the existing coordinate hash so screenshots of a paused farm stay deterministic.

### 4. Storybook chrome (CSS-only layout-stable)

- Panels, HUD chips, and Farm Guide cards gain pixel-corner frames rendered with layered inset box-shadows inside existing padding — no element grows, so text-fit contracts at 1280x800 and 1024x720 must pass unchanged.
- The HUD Coins chip flashes a brief harvest-gold pulse when the coin total changes, via a one-shot CSS animation class toggled by the HUD renderer's existing markup-diff path.

## Alternatives considered and rejected

- Global dawn/dusk light cycle: highest atmosphere, but a global tint intersects every palette-sampling browser contract and risks grid readability; wrong increment to absorb that blast radius.
- New wildlife (heron visitor): simulation-domain expansion with save/replay/migration surface, not a graphics pass.
- Building/crop portraits now: deferred until tile art shares the painter type; workers prove the mechanism.

## Testing

- Unit: `FARMHAND_PROFILES` completeness and stable id mapping; `workEffectSpawns` pure decisions (planted diff with a planting worker spawns dust at that tile; no diff spawns nothing; multiple matching workers each spawn; cap respected).
- Browser: Inspect on a worker shows the name and a non-blank portrait canvas (pixel data has >1 distinct color); effects never mutate the save (state bytes equal across an effect-heavy interval with simulation paused via debug advance); coins flash class appears on purchase and clears; existing text-fit and layout suites stay green at both supported viewports.
- Evidence: fresh screenshots at 1280x800 and 1024x720 with the Inspect worker view open; a bounded visual-loop run to confirm no console/page errors and no new findings.

## Non-goals

No save-schema change, no simulation-rule change, no new player controls, no sound, no mobile scope.
