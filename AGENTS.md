# AGENTS.md — farm

## What this is

A desktop-first browser idle farming game: the player plans and expands a small top-down pixel farm while tiny autonomous farmhands plant, water, harvest, haul, and sell crops. Inspired by cozy idle farm toys, but with its own implementation and visual identity.

Stack: Vite + TypeScript + civ-engine + Phaser + Vitest. The simulation is deterministic and testable; Phaser renders sprites and camera movement; DOM overlays render the HUD, toolbars, side panels, and settings surfaces.

Desktop-first: do not add mobile-specific scope unless the user asks.

## Fleet constitution

- Work headlessly by default; go non-headless only when nothing else can complete or verify the task, and say why.
- These rules are strong defaults, not law: when one would make the work worse, deviate and say why.
- Scale the approach to the task: trivial changes directly; substantial work as explore → plan → implement → verify, with subagents when work is genuinely parallel.
- When two attempts at the same problem have failed, stop iterating alone: build the fixed benchmark or reproduction that settles the question, fan out independent subagents on deliberately different approaches against it, then switch role to evaluator — score their output yourself rather than trusting their reports, and take the best. A third pass at the approach that already failed twice is the expensive mistake. (Established 2026-07-31.)
- A model call is a legitimate component of a program here, not only an authoring aid: this fleet has one user, with Claude Code and Codex subscriptions, so a pipeline may call a model at runtime — vision included — wherever that beats a hand-written heuristic. The repo's trust boundaries are unchanged and are what make it safe: model output proposes, a deterministic check disposes, and it never self-certifies. Reaching for a brittle heuristic to avoid a model call is the mistake, not the other way round. (Established 2026-07-31, after a geometric stud-pitch reader answered 4 of 50 booklet regions and a headless vision call answered 6 of 6.)
- Toolchain baseline: develop and run gates on Node 24, which every Node repo pins in its own `.nvmrc`. A repo that must keep supporting an older major says so in its Gates section and keeps a CI job proving it, because otherwise an agent on the wrong version reads a version failure as a code failure and starts debugging the repo. (Established 2026-07-31, after `node:check` failed on Node 22 and looked like a broken checkout.)
- Delivery boundary: each minimal coherent verified unit is reviewed, staged (scoped files only), and committed promptly — never commit failing or partial work as a checkpoint. Commit to `main`; push at the end of every task.
- Concurrent sessions share one worktree and one index: commit by explicit pathspec (`git commit -- <files>`), never `git commit -a`, `git add -A`, or `git add .` — a sweeping commit captures whatever another session has staged. (Evidence: voxel c024b33, 2026-07-17.)
- The repo's gates must pass before every commit that touches code; doc-only changes need a self-reviewed diff.
- Review: self-review trivial changes; adversarially review non-trivial ones — independent agents that try to refute the change against the live code. High-risk work (persistence/migrations, security/auth, concurrency, money, supply chain, edits that reach sibling repos) escalates to the multi-cli-review skill. Reviewers must read the live code; verify reviewer claims against the codebase before acting on them; substantive findings outweigh approval votes.
- Dependency changes: re-resolve the lockfile, run the repo's audit gate (a new HIGH/CRITICAL is a blocker), and note the audit result in the commit message.
- Docs are part of the change: update every affected surface in the same commit; write prose one line per paragraph (no hard wrapping); never reference or mandate files that don't exist.
- Bias to continue: work through the whole accepted plan without mid-plan check-ins; context management is the harness's job, never a reason to stop. Stop only for a genuine blocker, a direction-changing decision, or an explicit stop. (Established 2026-05-01; reinforced 2026-07-05.)
- Error messages are a product surface, and coverage of them is a standing requirement rather than something done when a message happens to be touched: every path that rejects, fails, or throws says what happened, which specific input caused it, and what would satisfy it — never a bare `Validation failed`, `invalid input`, or a silent boolean false. A diagnostic that forces a human or an agent to read the source to learn why is itself a defect; fix the message in the same change as the bug. Where a failure has known causes and known non-fixes, the message says which — an agent that reads "increase coverage" will raise a number that has already been measured not to work, so name the lever and name the dead end. Treat a repo's error paths as a surface to audit, not a place to react. Applies equally to validators, CLI output, and assertion text. (Established 2026-07-18, after city's `placeService` answered five rejected placements with only "Validation failed"; widened to coverage 2026-08-01, after voxel's Riverfall surface told three sessions in a row to "increase particle coverage" when particle count was the one thing measured not to fix it.)
- Steering compounds: when the user gives a direction that generalizes past the immediate task, land it in the canon in that same session — here if it is fleet-wide, else the repo's AGENTS.md or lessons file — so the next run inherits it instead of relearning it, and say what was captured and where. (Established 2026-07-18.)
- Reviewer model pins live only in `../loop-ops/docs/skills/multi-cli-review.md`, and loop-work model directives in `../loop-ops/DIRECTIVES.md` — never hardcode model IDs anywhere else.
- Lessons files (`docs/learning/lessons.md` where present) require evidence anchors — source, fix commit, test id, behavior delta; unanchored lessons are folklore.
- Recursive loop: before running or driving a pass, read `../loop-ops/docs/skills/recursive-playtest.md`; before building loop machinery, read `../loop-ops/docs/skills/building-recursive-loop.md`.

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
- `.claude/skills/multi-cli-review/SKILL.md` — this repo's thin stub of repo-specific notes for the fleet multi-cli-review runbook.
