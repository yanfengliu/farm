# AGENTS.md — farm

## What this is

A desktop-first browser idle farming game: the player plans and expands a small top-down pixel farm while tiny autonomous farmhands plant, water, harvest, haul, and sell crops. Inspired by cozy idle farm toys, but with its own implementation and visual identity.

Stack: Vite + TypeScript + civ-engine + Phaser + Vitest. The simulation is deterministic and testable; Phaser renders sprites and camera movement; DOM overlays render the HUD, toolbars, side panels, and settings surfaces.

Desktop-first: do not add mobile-specific scope unless the user asks.

<!-- FLEET-CANON:BEGIN sha=5364da321722 generated from ../fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

- Verify visual work visually: capture the rendered result — screenshot, frame, recording — and look at it, because a passing test says nothing about what the pixels do. Work with no visual surface runs headlessly. One framing is not a check: sweep several camera angles and zoom levels, since a defect the chosen view happens to hide is the normal case. Confirming the change you made is only half of it: every task ends with a sweep of the whole rendered result, looking for what is wrong rather than for what you touched. Defects hide in the parts nobody was working on, and the ones a user finds first are almost always there.
- A defect the user reports is recorded and gated, never only fixed: an entry in `docs/learning/defect-register.md` — symptom as they saw it, investigation, root cause, and how it is checked from now on — plus a check that covers the defect's whole class rather than the one instance. Unlike a lesson, the entry stays after it becomes a gate: the register is the standing list of what the gates could not see, which is where the next defect comes from.
- Commit each verified unit of change to `main` without being asked, and push. Gates pass before any commit that touches code; a dependency change re-runs the audit gate.
- A repo chooses its own language and toolchain — Node, Python, and Rust all run here. Each pins its version where its own tooling reads it (`.nvmrc`, `requires-python`, `rust-toolchain.toml`) and names it in Gates, so a version mismatch is not read as a code failure. Node repos baseline at 24; an older major keeps a CI job proving it.
- Runtime model calls are authorized and already paid for — this fleet has one user, with Claude Code and Codex subscriptions — so a program here may call a model at runtime, vision included.
- The top reasoning tier is rationed: spend it only on the hardest problem, or on directing the workhorse tier that does the work — and only at maximum effort or orchestration.
- Two failed attempts at one problem escalate to the hard-problem skill: a search across deliberately different approaches, run to a result rather than to a report. Spending real budget there is authorized — a third pass at the approach that already failed is the expensive mistake. Return the working result, or the strongest proved part with its exact remaining gap.
- High-risk work — persistence/migrations, security/auth, concurrency, money, supply chain, edits that reach sibling repos — escalates to the multi-cli-review skill. That is a review you run yourself, not permission you ask the user for; nothing in this canon requires asking.
- Error messages are a product surface: audit them as a class, including paths the task did not touch. Each names what happened, which input caused it, and what would satisfy it — never a bare `Validation failed`.
- When blocked, hand over the raw artifact — screenshot, rendered page, log line, data row — as soon as the blocker is named rather than after the analysis: your description of it is filtered through the misunderstanding that caused the block, so it cannot contain what you failed to notice.
- Task-run evidence lives only under ignored paths and is deleted once nothing active needs it; it enters Git only when review promotes it into a repository input — a fixture, golden, snapshot, or contract. Tracked docs keep conclusions and provenance only. Blob ceilings for anything promoted: over 256 KiB needs a stated reason, over 512 KiB binary or 1 MiB of anything never enters ordinary Git, and an asset store or LFS needs the user's approval.
- Write prose one line per paragraph (no hard wrapping).
- Keep a devlog: one short dated line per behaviour-changing session in `docs/devlog/summary.md`, newest first, and a section in `docs/devlog/detailed/` for anything a later session could trip over — what was believed and proved false, what a reviewer caught that the author missed, what number moved and from what. It is history, not status. Both shapes are in `../fleet/docs/devlog-template.md`.
- Read `docs/learning/lessons.md` at session start: the one-line index of what this repo has already paid to learn, with each entry's war story and anchor in `lessons-evidence.md`. A lesson lands the session it is learned, anchored to a measurement, commit, or test id; unanchored, it is folklore. When a lesson becomes a gate — a test, a lint rule, a fixed command — delete both halves. Shape: `../fleet/docs/lessons-template.md`.
- Every unit of work gets an independent harsh critic before it is called done — a subagent that did not do the work, given the diff, the claim, and the measurement, and asked to find why the measurement does not support the claim. Hard problems get several with deliberately different lenses. This is not a courtesy pass: every multi-lane review run so far has found a defect the author missed, including three in a cache its author had already gated and mutation-tested.
- Verify the instrument before trusting the measurement, because a critic is a backstop and not the first line. Confirm the flag took effect, the denominator is the population you meant, the control reproduces, and the claim you are relying on is still true rather than remembered. A whole session's conclusions were built on labels chosen with knowledge of the future, agreement quoted over a population that was 99.8% forced no-ops, a `--eval-episodes` flag silently ignored so every checkpoint was picked by a five-sample lottery, and a review lane declared unavailable from a three-week-old memory that was wrong. Each was one command away from being caught.

- Steering compounds: a direction that outlives the immediate task lands that same session — `../fleet/FLEET.md` if fleet-wide, else this repo's `docs/policies/local-rules.md` — and you say where it went.
- Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`; a model a product itself calls is pinned in the repo that calls it. Never hardcode a model ID anywhere else.
<!-- FLEET-CANON:END -->

## Gates

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` — all four before every code commit; smallest meaningful check while iterating. Dependency audit gate: `npm audit --audit-level=high` (full tree and `--omit=dev`).

## Session start

Read `docs/devlog/summary.md` and `docs/architecture/architecture.md` before starting work.

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
