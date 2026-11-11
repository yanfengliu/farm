# AGENTS.md — farm

## What this is

A desktop-first browser idle farming game: the player plans and expands a small top-down pixel farm while tiny autonomous farmhands plant, water, harvest, haul, and sell crops. Inspired by cozy idle farm toys, but with its own implementation and visual identity.

Stack: Vite + TypeScript + civ-engine + Phaser + Vitest. The simulation is deterministic and testable; Phaser renders sprites and camera movement; DOM overlays render the HUD, toolbars, side panels, and settings surfaces.

Desktop-first: do not add mobile-specific scope unless the user asks.

<!-- FLEET-CANON:BEGIN sha=fa6416c07600 generated from ../fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

Shared rules for every repo under `github/`, kept in `../fleet/FLEET.md`; `../fleet/` is fleet's checkout beside this repo's primary checkout. Where a rule gives its reason, use the reason to judge cases the rule does not name; each `[Rn]`'s history is in `../fleet/docs/canon-rationale.md`. This repo's `docs/policies/local-rules.md` may add rules but cannot change these permissions or limits. [R13]

The main agent owns delivery and may implement directly. Use subagents when bounded, independent work or independent judgment materially improves speed or quality; keep small or tightly coupled work with one agent (owner directive, 2026-11-07). [R2, R3]

The designated coordinator reads `../fleet/docs/skills/coordinator.md` before planning and after each compaction, and any agent reads that file's "Delegate" section before delegating. Before these kinds of work, read the matching section of `../fleet/docs/work-rules.md`: standing loops and unattended runs; editing skills, agent instructions or rules; handing off or stopping mid-task.

### Permissions

- Commit, merge to main and push without asking. Force-pushing and rewriting history (they destroy history), and deploying and publishing (they reach other people), need the owner's OK. [R14]
- Ask before a major architecture or product change, a new major dependency, a change to a persistent format or a security boundary, or any other consequential action outside this machine, such as posting or sending something. [R8]
- Change fleet rules (FLEET.md, fleet skills and runbooks, agent memory) or add a rule to a repo's `docs/policies/local-rules.md` only when the owner asks, because the owner sets policy. You may add a proposal with its evidence to `../fleet/canon-candidates.md`, but not edit its entries. [R8]

### Sharing the machine

- Other Claude and Codex sessions may be working in this checkout, and you cannot see them. Do anything beyond a quick read in your own worktree, because two sessions in one tree spoil each other's gates and commits. Never revert, overwrite or delete changes you did not make. When resuming, check which worktrees, branches and files already exist. [R7]
- Done means merged to main and pushed: the owner archives sessions, and work left on a branch is lost. Merge on your branch, get the gates passing there, then move main, because other worktrees build on local main. Judge the merged result itself, not a worker's summary. Then remove your worktree and branch, and report where any unmerged work is. [R14]

### Doing the work

- The repo's gates must pass on the tree that is handed back or reaches main. Unless the repo's own rules ask more of a commit, commit on your own branch at every stopping point and say in the message what was not checked, because a session can end without warning. Docs-only changes need content checks and any gate the repo names for docs, not runtime tests or CI waits. [R14]
- Check the thing that should have changed (the file, the page, the number), not just the exit code or a tool's report: both can pass over a defect. Retest a blocker you inherit before repeating it. Never weaken a test or hide a failure to get green. [R9]
- Look at visual and interactive work rendered at full resolution, through the real controls, from fixed and random views, because passing tests say nothing about pixels. Run it headless unless a visible window is needed. [R16]
- Slowness on the critical path, such as a gate rendering on the CPU of a machine with a GPU, is a defect to fix. [R22]
- After pushing code, follow CI to the end; read a failed job's steps before blaming the code, since a billing limit fails jobs before any step runs. [R15]
- If a fix fails twice for one reason, rethink it. After five real repair attempts at one problem, whatever the approach and counting earlier sessions, stop and report, unless the owner set another limit; for a problem that keeps winning, run the search in `../fleet/docs/skills/hard-problem.md`. Stop when the task's criteria are met; do not invent follow-up work. [R11]
- For substantial or high-risk changes, use independent review when available. High-risk includes persistence and migrations, security and auth, concurrency, money, supply chain, and code changes in another repo. Review the exact revision against the task's criteria, and say so when review was unavailable. Fix the findings that matter and have those fixes checked; note minor ones instead of starting another round. `../fleet/docs/skills/multi-cli-review.md` provides the review mechanics. [R10]
- A defect the owner reports gets a test for its whole class and an entry in `docs/learning/defect-register.md`, because a fix without a check tends to come back. [R17]
- Sessions run long: take new requests in the same session, and never hand off to a new session to shed context. Split work expected to need more than about 200k tokens of context into milestones, each merged to main. [R6]

### Records, sized to the work

- Read `docs/learning/lessons.md` at session start; it lists this repo's known traps, and its header says how to add one. [R18]
- Every change that alters behaviour adds a dated line to `docs/devlog/summary.md` (`../fleet/docs/devlog-template.md`) when it lands, because later sessions orient from its newest entries. Work that spans sessions, has several agents writing, or gets an independent review also keeps its plan and review records in `docs/work/` (`../fleet/docs/work-docs.md`); other work needs none. [R24]
- Raw output (logs, captures, screenshots) stays in ignored folders. Never commit a binary over 512 KiB or any file over 1 MiB; LFS needs the owner's OK. [R23]

### Style and environment

- Plain words; one line per paragraph, no hard wrapping. A report says what changed, how it was checked (including any check skipped or failed) and what is not done. [R25]
- Node 24 is the baseline. Products pin the model IDs they call in their own repo, and nowhere else. Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`. Runtime model calls are allowed and paid for; make per-item calls one-shot, not agent sessions. [R28, R29]
<!-- FLEET-CANON:END -->

## Gates

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` — all four before every code commit; smallest meaningful check while iterating. Dependency audit gate: `npm audit --audit-level=high` (full tree and `--omit=dev`).

## Session start

Read `docs/devlog/summary.md` and `docs/architecture/architecture.md` before starting work. Of the summary, read the newest ten entries, which are at its top; of architecture.md, read its section map, then only the sections the work needs.

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
- `docs/learning/lessons.md` — per the fleet evidence-anchor rule; a queue, empty at rest. `docs/learning/gate-proofs.md` — for each retired lesson, the gate that replaced it and the mutation proving that gate goes red. `../fleet/canon-candidates.md` — fleet-wide knowledge staged for the constitution.
- `docs/policies/local-rules.md` — rules true for this repo only, never fleet canon.
