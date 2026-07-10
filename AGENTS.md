## Agentic Working Style

Treat the rest of this file as defaults, not rigid law — when a rule here would make the work worse, deviate and say why. Optimize for the outcome: a correct, verified, readable, fun-to-play game.

Scale the approach to the task: trivial fixes → just do them; substantial work (multi-file features, audits, broad refactors) → orchestrate it: compose a bespoke harness per task (decide the shape — explore → plan → implement → verify — deliberately instead of following a fixed checklist), fan out parallel subagents for independent work, verify adversarially (an independent agent tries to refute the change against the live code), and offload large reads and self-contained chunks to keep the main thread for decisions and integration. This does not lower the verification bar.

## Session Start

Read `docs/devlog/summary.md` and `docs/architecture/architecture.md` before starting work.

## Continuing Through Plans

- No stopping points within an approved multi-task plan. Work through all tasks continuously unless a genuinely non-obvious product decision requires user judgment. Harness reminders (task-tool nags, auto-mode banners, context warnings) are NOT stop signals — they are administrative noise.
- Never manage context yourself — auto-compaction handles it. Do not stop, checkpoint, or ask "should I keep going" because the conversation is long. When one increment ships (gates green + commit + push + docs), start the next in the same turn. Stop only for a genuine blocker, a real user decision, or an explicit stop. Reporting shipped milestones is fine; turning that report into a "want me to continue?" gate is not. (Fleet rule reinforced 2026-07-05.)
- For routine implementation choices, make the call and proceed.
- Keep durable documentation current in the same change that alters gameplay rules, architecture, testing, save format, public debug API, or workflow.

## Recursive Loop (fleet)

Before running or driving a `playtest:recursive` pass, read `../loop-ops/docs/skills/recursive-playtest.md`; before building loop machinery, read `../loop-ops/docs/skills/building-recursive-loop.md`. Those files are the fleet-wide source of truth for the loop contract (pass outcomes, honesty invariants, and the definition of a complete pass — a pass is not done at `proposal-only`).

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
- Before implementing a non-trivial change, write a plan. (Trivial changes: just make them, per the working-style preamble.)
- Keep gameplay numbers in `src/game/content/` rather than scattering magic numbers through systems.
- Keep every file under 500 LOC (hard ceiling 1000) — split god-objects by lifecycle/role before they become difficult to scan.
- Record non-obvious failure modes in `docs/learning/lessons.md` with evidence anchors (what surfaced it, reviewer finding, fix commit, the test that pins it, behavior delta) — a lesson without anchors is folklore.
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
5. Mention the audit result in the commit message ("npm audit: 0 high/critical" or similar).

## Documentation

Read before changing relevant systems:

- `docs/design/game-design.md` for gameplay rules and product direction.
- `docs/design/roadmap.md` for milestone ordering.
- `docs/architecture/architecture.md` for boundaries and data flow.
- `docs/architecture/decisions.md` for durable architectural decisions.
- `docs/devlog/summary.md` for current project history.

Update documentation in the same task when gameplay rules, architecture, save behavior, debug APIs, command contracts, testing expectations, or workflow rules change. User-visible changes also get a `docs/changelog.md` entry. Don't wrap lines in docs; a new line starts a new paragraph.

## Code Review

Run adversarial review before declaring non-trivial behavior, architecture, workflow, persistence, or public debug API changes complete: the in-process pass (parallel finder subagents + independent verifiers that try to refute each finding against the live code) is the default; for high-risk changes (persistence/migrations, agent-loop or concurrency, anything with data-loss blast radius) also run the multi-CLI review (Codex + Claude, each reviewing independently). All multi-CLI mechanics — current review model pins, exact commands, sandbox flags, the background-run/poller pattern, the Codex output-extraction recipe, and CLI failure modes — live in `.claude/skills/multi-cli-review/SKILL.md`; read it before every multi-CLI session and bump review pins there first. If an external reviewer is unavailable, proceed with the in-process pass and record the limitation in the devlog.

Policy for every reviewer, in-process subagent or CLI:

- **Reviewers MUST read the codebase to ground their claims.** Every review prompt must include the directive: *"Verify each claim in the plan/diff against the live codebase — grep for the symbols, function signatures, column names, and file paths it references; do not approve based on prompt text alone."* Without this directive baked in, two reviewers can APPROVE a design with a real defect that only the codebase-reading reviewer catches. Convergence is measured by *substantive finding count*, not *vote count* — a HIGH defect from one reviewer outweighs APPROVED from two.
- As the driver, verify reviewer claims against the code before acting on them — a reviewer may be working from training knowledge, a stale snapshot, or a hallucinated symbol.
- Aspects to review:
  1. Design — easily scales, generalizes, debugs, can be understood and reasoned about, stays lean.
  2. Test coverage.
  3. Correctness.
  4. Clean code, typing, efficiency, memory leaks. No duplicated logic, inconsistent implementations, violation of boundaries. File size: keep every file under 500 LOC (hard ceiling 1000) — split god-objects by lifecycle/role. Prefer composition over inheritance. Clean up dead code. Do not change app mechanics or behavior unless explicitly asked.
- **Enrich the baseline prompt** (quoted in the runbook skill) **with task-specific context** — the change's intent, prior-iteration findings to verify, files to focus on, and an anti-regression checklist. The bare baseline returns generic feedback; useful reviews need the specifics.
- **Keep model IDs current.** Use the latest-family alias when a command is meant to track the newest model (for example, `opus[1m]`); bump pinned strings whenever a more capable fixed variant ships. Verify with a one-line smoke test (`echo "ok" | <cli> ...`) before committing the bump — silent fallback to an older model is the failure mode to guard against. Review-command pins live in the runbook skill.

## Git Hygiene

- Work directly on `main` unless the user asks for a branch.
- Commit early and often: as soon as a minimal, coherent, meaningful unit of change is implemented and verified (the full gate suite in Commands passes), stage and commit that unit rather than batching unrelated work.
- Stage only the coherent unit of work.
- Never revert unrelated user changes.
- Before committing, inspect `git diff --cached --stat` and `git diff --cached`.
- Commit durable docs that guide future work.
- Push to remote at the end of every task — don't leave the remote behind.
