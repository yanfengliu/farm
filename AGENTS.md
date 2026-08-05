# AGENTS.md — farm

## What this is

A desktop-first browser idle farming game: the player plans and expands a small top-down pixel farm while tiny autonomous farmhands plant, water, harvest, haul, and sell crops. Inspired by cozy idle farm toys, but with its own implementation and visual identity.

Stack: Vite + TypeScript + civ-engine + Phaser + Vitest. The simulation is deterministic and testable; Phaser renders sprites and camera movement; DOM overlays render the HUD, toolbars, side panels, and settings surfaces.

Desktop-first: do not add mobile-specific scope unless the user asks.

<!-- FLEET-CANON:BEGIN sha=2d7b45473798 generated from fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

- Work headlessly by default. If only a browser or GUI can finish or verify the task, say why, and close what you opened.
- Concurrent sessions share one worktree and one index: commit by explicit pathspec (`git commit -- <files>`), never `git commit -a`, `git add -A`, or `git add .` — a sweeping commit captures whatever another session has staged. (voxel c024b33.)
- Commit early and often: the moment a minimal, coherent unit of change is verified, commit it to `main` without being asked, and push. Never batch several units into one commit, and never commit failing or partial work as a checkpoint. Gates pass before any commit that touches code; a dependency change re-runs the audit gate.
- Toolchain baseline is Node 24, pinned per repo in `.nvmrc`. A repo that must keep an older major says so in its Gates section and keeps a CI job proving it.
- Runtime model calls are authorized and already paid for — this fleet has one user, with Claude Code and Codex subscriptions — so a program here may call a model at runtime, vision included, wherever that beats a hand-written heuristic. Model output proposes; a deterministic check disposes.
- A fix is done when the failing case has been rerun and a regression test or fixture fails if the fix reverts. A diff is not evidence.
- High-risk work — persistence/migrations, security/auth, concurrency, money, supply chain, edits that reach sibling repos — escalates to the multi-cli-review skill.
- Error messages are a product surface: audit them as a class, including paths the task did not touch. Every path that rejects or throws names what happened, which input caused it, and what would satisfy it — never a bare `Validation failed`.
- Docs are part of the change: update every affected surface in the same commit, and write prose one line per paragraph (no hard wrapping).
- Task-run evidence — raw traces, per-sample results, screenshots, recordings, generated reports, archives — lives only under ignored paths and is deleted once nothing active needs it; never commit, push, or move it to LFS. Tracked docs keep conclusions and provenance only. Such output enters Git only when review promotes it into a genuine repository input — a fixture, golden, snapshot, or contract.
- Git blob ceilings: a new or changed blob over 256 KiB needs an explicit repository-input reason; over 512 KiB binary, or 1 MiB anything, never enters ordinary Git. An external asset store or LFS requires explicit user approval, and an existing oversized blob is never precedent for another.
- Steering compounds: when the user gives a direction that outlives the immediate task, land it that same session — `../fleet/FLEET.md` if fleet-wide, else this repo's `docs/policies/local-rules.md` — and say where it went.
- Citations are part of the deliverable: anything with a public answer — a numerical method, a library's behaviour, an engine parameter, a format, a protocol — carries the source it was read from, and so does any mechanism offered to explain a measured result. A dependency's source is one call away (`gh api repos/<owner>/<repo>/contents/<path>`).
- Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`; a model a product itself calls is pinned in the repo that calls it. Never hardcode a model ID anywhere else.
<!-- FLEET-CANON:END -->

## Gates

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` — all four before every code commit; smallest meaningful check while iterating. Dependency audit gate: `npm audit --audit-level=high` (full tree and `--omit=dev`).

## Session start

Read `docs/devlog/summary.md` and `docs/architecture/architecture.md` before starting work. Read `docs/learning/lessons.md` too — it records what has already been tried and what it cost, and a lessons file nothing tells anyone to open is write-only.

## Invariants & boundaries

- Layout: `src/game/simulation` (civ-engine world, commands, systems, state projection) · `src/game/content` (crops, tiers, prices, starting map, tuning constants) · `src/phaser/scenes` (scene orchestration only) + `src/phaser/view` (sprite, camera, tile rendering helpers) · `src/ui` (DOM HUD, toolbar, panels) · `src/persistence` (localStorage save/load boundary) · `src/debug` (render_game_to_text and structured debug helpers) · `src/annotations` (annotation selection/capture model) · `tests/` (headless simulation contracts plus browser, phaser, persistence, and annotation suites).
- `game/simulation/` owns game rules, entities, inventory, crops, workers, milestones, and saveable state. Phaser scenes contain no gameplay rules — they read projected snapshots and submit typed commands. DOM UI never mutates simulation state directly — it submits commands through the same bridge as hotkeys and canvas input. Save files contain serializable simulation state, not renderer objects.
- TDD for deterministic simulation and user-facing contracts: write or update the failing test first, watch it fail, then implement the smallest passing change.
- Gameplay numbers live in `src/game/content/` — no magic numbers scattered through systems.
- Files under 500 LOC (hard ceiling 1000) — split god-objects by lifecycle/role before they become hard to scan.
- Expose `window.render_game_to_text()`, `window.advanceTime(ms)`, and `window.__farmDebug.getState()` for automated playtesting.
- Do not ship a visual feature without browser evidence (screenshot or Playwright verification); check that text fits and UI elements do not overlap at desktop and smaller desktop-like viewport sizes.
- If an external CLI reviewer is unavailable for high-risk work, proceed with the in-process adversarial pass and record the limitation in the devlog.

## Conventions

- `docs/design/game-design.md` — gameplay rules and product direction; `docs/design/roadmap.md` — milestone ordering. Read before changing the relevant system.
- `docs/architecture/architecture.md` — boundaries and data flow; `docs/architecture/decisions.md` — durable architectural decisions; `docs/architecture/drift-log.md` — architecture drift log.
- Devlog: `docs/devlog/summary.md` (current project history) plus dated per-day files under `docs/devlog/detailed/`.
- `docs/changelog.md` — user-visible changes get an entry.
- `docs/debug.md` — browser debug API guide; `docs/testing-playtest.md` — testing and playtest guide.
- `docs/learning/lessons.md` — per the fleet evidence-anchor rule.
