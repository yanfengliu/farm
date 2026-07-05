## Agentic Working Style

Treat this file as the operating contract for this repository. Optimize for a correct, verified, readable, fun-to-play game. When a rule would make the work worse, deviate only with a short note explaining why.

## Continuing Through Plans

- No stopping points within an approved multi-task plan. Work through all tasks continuously unless a genuinely non-obvious product decision requires user judgment.
- For routine implementation choices, make the call and proceed.
- Keep durable documentation current in the same change that alters gameplay rules, architecture, testing, save format, public debug API, or workflow.

## Project Intent

This repository builds a desktop-first browser idle farming game. The player plans and expands a small top-down pixel farm while tiny autonomous farmhands plant, water, harvest, haul, and sell crops. The game is inspired by cozy idle farm toys, but it must have its own implementation and visual identity.

## Stack And Boundaries

The intended stack is Vite + TypeScript + `civ-engine` + Phaser + Vitest. The simulation is deterministic and testable. Phaser renders sprites and camera movement. DOM overlays render the HUD, toolbars, side panels, and settings surfaces.

```text
src/
  main.ts
  game/
    simulation/       # civ-engine world, commands, systems, state projection
    content/          # crops, tiers, prices, starting map, tuning constants
    input/            # action ids and key bindings
    assets/           # stable asset manifest keys
  phaser/
    scenes/           # Phaser scene orchestration only
    view/             # sprite, camera, and tile rendering helpers
  ui/                 # DOM HUD, toolbar, panels
  persistence/        # localStorage save/load boundary
  debug/              # render_game_to_text and structured debug helpers
tests/
  simulation/         # headless contract tests
  browser/            # browser smoke/playtest coverage when added
docs/
```

Boundary rules:

- `game/simulation/` owns game rules, entities, inventory, crops, workers, milestones, and saveable state.
- Phaser scenes do not contain gameplay rules. They read projected snapshots and submit typed commands.
- DOM UI does not mutate simulation state directly. It submits commands through the same bridge as hotkeys and canvas input.
- Save files contain serializable simulation state, not renderer objects.

## Core Rules

- Use test-driven development for deterministic simulation and user-facing contracts. Write or update the failing test first, watch it fail, then implement the smallest passing change.
- Keep gameplay numbers in `src/game/content/` rather than scattering magic numbers through systems.
- Keep files focused. Split files before they become difficult to scan.
- Expose `window.render_game_to_text()`, `window.advanceTime(ms)`, and `window.__farmDebug.getState()` for automated playtesting.
- Do not ship a visual feature without browser evidence: screenshot or equivalent Playwright/browser verification.
- For visual changes, verify that text fits and UI elements do not overlap at desktop and smaller desktop-like viewport sizes.
- Do not add mobile-specific scope unless the user asks; the game is desktop-first.

## Commands

Use these commands once dependencies are installed:

```bash
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

Run the smallest meaningful check during iteration. Before declaring a task done, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Dependency-Change Protocol

Whenever `package.json` dependency surface changes:

1. Run `npm install` and commit `package-lock.json`.
2. Run `npm audit --audit-level=high --omit=dev`.
3. Run `npm audit --audit-level=high`.
4. A new HIGH or CRITICAL CVE blocks the change unless documented in the devlog with a reason and expiry.

## Documentation

Read before changing relevant systems:

- `docs/design/game-design.md` for gameplay rules and product direction.
- `docs/design/roadmap.md` for milestone ordering.
- `docs/architecture/architecture.md` for boundaries and data flow.
- `docs/architecture/decisions.md` for durable architectural decisions.
- `docs/devlog/summary.md` for current project history.

Update documentation in the same task when gameplay rules, architecture, save behavior, debug APIs, command contracts, testing expectations, or workflow rules change.

## Review Policy

Run adversarial review before declaring non-trivial behavior, architecture, workflow, persistence, or public debug API changes complete. Reviewers must verify claims against the live codebase. If an external reviewer is unavailable, use an in-process review pass and record the limitation in the devlog.

## Git Hygiene

- Work directly on `main` unless the user asks for a branch.
- Commit early and often: as soon as a self-contained coherent unit of change is implemented and verified, stage and commit that unit rather than batching unrelated work.
- Stage only the coherent unit of work.
- Never revert unrelated user changes.
- Before committing, inspect `git diff --cached --stat` and `git diff --cached`.
- Commit durable docs that guide future work.
