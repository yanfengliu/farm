# AGENTS.md — farm

## What this is

A desktop-first browser idle farming game: the player plans and expands a small top-down pixel farm while tiny autonomous farmhands plant, water, harvest, haul, and sell crops. Inspired by cozy idle farm toys, but with its own implementation and visual identity.

Stack: Vite + TypeScript + civ-engine + Phaser + Vitest. The simulation is deterministic and testable; Phaser renders sprites and camera movement; DOM overlays render the HUD, toolbars, side panels, and settings surfaces.

Desktop-first: do not add mobile-specific scope unless the user asks.

<!-- FLEET-CANON:BEGIN sha=973eb18eaf96 generated from ../fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

Reasons and evidence per `[Rn]`: `../fleet/docs/canon-rationale.md`.

### Fleet Orchestration Policy

Deliver the requested outcome with verified correctness, coherent architecture and minimal necessary complexity; optimize for useful progress, not agent count, code volume or maximum reasoning. Adapt rigor to risk. This policy grants no new permissions or capabilities. [R1]

**Roles.** Only an explicitly designated agent is coordinator; each scope has one accountable integration owner. The coordinator owns planning, dependencies, shared interfaces, architectural consistency, integration and acceptance. It reads only what an assignment, an acceptance, or its own trivial change needs, inspects handoffs to accept or reject them, and delegates every change except a trivial one, which it may make itself when delegating would cost more than the change (owner directive, 2026-09-23, superseding that of 2026-09-05). Trivial means at most about 20 changed lines of docs, config or an integration fix, nothing R10 calls high-risk, and no product logic, migration, security or trust-boundary code; the same gates, review and worktree rules apply. [R2]

Workers own bounded outcomes and local implementation decisions. Each worker, a reviewer included, decides how many subagents its task needs and dispatches them, within its budget (owner directive, 2026-09-23). For a small task that is none. It remains accountable for what they return. Threads follow deliverables, not permanent departments; no recursive manager hierarchies. [R3]

**Plan and delegate.** First inspect instructions, code, docs, working-tree state and active tasks; establish the outcome, non-goals, acceptance criteria, dependencies and verification method; settle routine ambiguity with evidence and reversible defaults. Choose the simplest effective delegation: subagents for bounded investigation, independent judgment or a localized change, separate threads for substantial independent changes; agree shared contracts before parallel work; no duplicate or blocked work. An assignment names owner, outcome, context, dependencies and contracts, base revision, workspace, allowed and excluded changes, verification, resource limits, expected handoff, and read-only or implementation. Change configured model and reasoning defaults only through supported controls, on evidence. [R4]

Size the team to the work continuously (owner directive, 2026-09-15): widen when one worker holds the critical path and independent work waits, narrow when workers contend for a file, port or CPU. Account for shared services, databases, ports and compute: no worker runs while another edits the same file in the same tree, runs the same gate or holds an unshareable resource. An expensive gate is one: exactly one runs at a time, and other work is chosen around it. [R5]

**Session size** (owner directive, 2026-09-23). One task per session; a new request becomes its own assignment. A task expected to need more than about 200k tokens of context is split into milestones within that budget, each committed and merged to main once green; the next may start a fresh session from main. Milestones are the boundary: the harness compacts context mid-task, and a compaction is never a task boundary or a reason to wrap up or hand off. No unattended "don't stop until done" loop runs without milestone commits. Mechanical subagents (lookups, gate runs, mechanical edits) use lower effort or a smaller model; reviews and their subagents keep the review runbook's pins. Per-item model calls, such as per-image classification, are one-shot calls, never full agent sessions. [R6]

**Coordinate safely.** Use only capabilities actually available; assume no visibility into other chats, shared memory, automatic messaging, workspace isolation or persistent monitoring. Unable to spawn a worker, work directly or hand off explicitly. Isolate concurrent edits in a worktree: beyond a trivial read, a session or agent works in its own worktree by default, serializing overlapping writes only when none is available, and saying why. It finishes the worktree in the same session (merge to main, push, `git worktree remove`), and reports one left after its work landed, and where, as a defect. Never overwrite or discard another participant's work. Track delegated work to completion, cancellation or handoff; release only your own resources, losing no work. Resuming interrupted work, first inspect surviving worktrees, artifacts and task status; recover what exists and preserve unfinished work, assuming no worktree, transcript or shared memory survived until checked. [R7]

**Preserve state and decision boundaries.** Essential memory (owners, dependencies, revisions, status, blockers, consequential decisions) lives in the repo or tracker, not the conversation; reuse conventions; keep only useful docs. The coordinator owns canonical status from workers' scoped updates. Propagate changed contracts; revalidate stale information. Keep apart intended requirements and actual behavior, prepared and dispatched work, observed status and assumptions, and implemented, verified, reviewed, integrated and blocked work. A handoff or interruption keeps outcomes, revisions, checks and results, evidence, risks, blockers, unresolved issues, next steps and integration requirements, never secrets or unnecessary private data. Workers act autonomously in scope, escalating cross-task interfaces, persistent formats, security boundaries, major dependencies and scope changes for the coordinator to resolve within the approved mandate; unapproved major architecture or product changes and consequential external actions need human authorization. [R8]

**Implement and verify.** Inspect, implement a coherent increment, check, diagnose, fix, recheck. Preserve established architecture: no unrelated rewrites, speculative abstractions or unnecessary dependencies. Go past planning when implementation is requested. Use task-appropriate evidence and baselines; inspect real user flows in interactive products; in games and simulations check invariants, save compatibility and realistic-scale performance; prototype uncertain ideas before generalizing; in research cite evidence and separate hypotheses, measurements and conclusions. Never weaken tests or conceal failures to claim success. [R9]

Obtain independent, preferably read-only review for substantial or high-risk changes when available. Review the exact revision against acceptance criteria. If no review is available, say so rather than imply one ran; fix justified findings, rerun affected checks, and get a focused re-review where a fix invalidates earlier review. [R10]

**Integrate, report, and stop.** After two failures for one reason, reassess rather than repeat. Unless another budget is set or the user authorizes more, cap automatic repair at five substantive attempts, then report; an explicit user override holds for its stated scope, without asking again. Keep updates brief and decision-relevant. Stop once acceptance criteria and material findings are resolved; invent no follow-up work. [R11]

**Final acceptance gate.** The integration owner integrates in dependency order and, on the final integrated revision's actual changes and evidence, not worker summaries: checks every acceptance criterion, runs relevant automated checks, exercises affected end-to-end behavior and cross-task interactions, and for substantial or high-risk work gets an independent read-only review of the integrated changes, integration fixes included. It confirms the merge to main and reports that revision, review status and every failed, skipped or unavailable check and unmet criterion. Nothing is fully verified while a material finding or required check is open. [R12]

### Fleet conventions

- Repository rules add local constraints consistent with this policy; they never override its permissions, adaptive workflow or stopping limits. [R13]
- Gates pass before any commit touching code; a dependency change re-runs the audit gate. The user's standing grant covers committing, merging to main and pushing in every repo they own, and is what the policy's merge and push permissions resolve to; force-pushing, rewriting history, deploying and publishing still need their authorization. Work is done only once merged to main; a branch, worktree or uncommitted tree does not count, whatever its gates say. Say where unmerged work is. [R14]
- After a push, follow the remote gate to completion when available, reading job steps and runner assignment before blaming code; report unavailable remote verification, relying on the local gate within its bounds; fix blocking failures within the repair budget, and report unrelated ones without silently expanding scope. [R15]
- For substantial or high-risk changes, use independent review when available. High-risk includes persistence and migrations, security and auth, concurrency, money, supply chain, and edits that reach sibling repos; `../fleet/docs/skills/multi-cli-review.md` provides the review mechanics. [R10]
- Verify visual work visually: look at the rendered result; work with no visual surface runs headlessly. Cover 3D from several camera angles and zooms, 2D and artwork at relevant viewport sizes, scales and states, interactive work through real controls and representative flows over time, static assets from their viewpoints; headless when adequate, visible only when needed. An aggregate view (contact sheet, grid, proof sheet) shows one of each exists, not that each is right: inspect each item at native resolution and bind the review to the digest of the bytes inspected. Check affected flows and surroundings for material regressions. A harness that sets state directly does not exercise the controls and is blind to defects in the input path it skips. [R16]
- A defect the user reports is recorded and gated, never only fixed: a `docs/learning/defect-register.md` entry (symptom as they saw it, investigation, root cause, how it is now checked) plus a check for its whole class. The entry stays after its gate lands. [R17]
- A lesson is prose only until it is a gate: it lands in `docs/learning/lessons.md` (read at session start) the session it is learned; each entry names its retiring gate and is deleted in the commit landing it, and a gate counts only once it has gone red with the defect reintroduced, run as `../fleet/docs/lessons-template.md` says. [R18]
- A green gate proves less than it looks like: it proves nothing past its bound. Name the bound in its header; pin every input that reproduces the defect. A gate that cannot tell passed from did-not-run reports the second as the first; a check built from the symbol it checks proves only that the code agrees with itself. [R19]
- A command's exit status is a claim about the command, not about the work, so read the artifact that should have changed. A red exit, an inherited blocker (retest it before repeating it) and a return value (a search that misses returns a sentinel) are the same kind of claim. [R20]
- Verify the instrument before trusting the measurement: the flag took effect, the denominator is the intended population, the control reproduces, the claim you rely on is still true, not remembered. An A/B comparison needs the tree still between arms. Ask a repo's own debugging instrument (a replayer, a profiler) first; a task's first probe names which one answers, or why none does. A rule needed at the moment of writing a probe is enforced then, not read at session start. [R21]
- Anything slow on the critical path is a defect to identify and fix, not a cost to schedule around (owner directive, 2026-09-15). Keep only the slowness a verdict depends on: the expensive gate the team is sized around. [R22]
- Task-run evidence lives only under ignored paths and is deleted once no active task, unresolved issue or handoff needs it; it enters Git only when review promotes it into a repository input (fixture, golden, snapshot, contract). Tracked docs keep plans, authored reviews, conclusions and provenance. Promoted blobs over 256 KiB need a stated reason; over 512 KiB binary or 1 MiB of anything never enter ordinary Git; an asset store or LFS needs the user's approval. [R23]
- Plans and every authored review round go in a permanent `docs/work/<id>_<theme>/` folder (`../fleet/docs/work-docs.md`). Keep a devlog, history not status: a dated line per behaviour-changing session in `docs/devlog/summary.md` (`../fleet/docs/devlog-template.md`). [R24]
- Use the common word where it says the same as the rare one, in chat, docs, commit subjects, PR titles, comments and error messages. One idea per sentence unless a rule needs one line to carry more. Cut length, not facts: keep exact terms, numbers and the evidence a claim rests on. Quotes and pastes are exempt; do not copy this canon's style. One line per paragraph, no hard wrapping. [R25]
- Error messages are a product surface; check the affected class and adjacent paths. Each names what happened, which input caused it and what would satisfy it, never a bare `Validation failed`. [R26]
- When blocked, hand over the artifact itself, redacted, as soon as the blocker is named, not after the analysis, and continue safe independent work. [R27]
- A repo chooses its language and toolchain (Node, Python and Rust run here), pins the version where its tooling reads it (`.nvmrc`, `requires-python`, `rust-toolchain.toml`) and names it in Gates. Node repos baseline at 24; an older major keeps a CI job proving it. [R28]
- Runtime model calls, vision included, are authorized and paid for. Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`, and a model a product calls is pinned in the repo that calls it; no model ID is hardcoded elsewhere. [R29]
- A standing loop sources its next task by running the artifact as its user does (default entry point, real configuration), never by reading code for something to improve; a repo with no runnable entry point has none. [R30]
- Steering compounds: a direction that outlives its task lands that session, in `../fleet/FLEET.md` if fleet-wide, else in the repo's `docs/policies/local-rules.md`, and you say where. [R31]
- When a hard problem blocks progress, run the search in `../fleet/docs/skills/hard-problem.md`. [R32]
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
- `docs/learning/lessons.md` — per the fleet evidence-anchor rule; a queue, empty at rest. `docs/learning/gate-proofs.md` — for each retired lesson, the gate that replaced it and the mutation proving that gate goes red. `docs/learning/canon-candidates.md` — fleet-wide knowledge staged for the constitution.
- `docs/policies/local-rules.md` — rules true for this repo only, never fleet canon.
