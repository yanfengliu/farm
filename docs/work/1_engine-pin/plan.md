# Install a verified retained engine build

Status: complete
Owner: Codex adoption worker; root owns integration and acceptance
Created: 2026-11-07
Updated: 2026-11-07

## Problem and outcome

Farm currently links the sibling civ-engine checkout, allowing its manifest, compiled runtime, and source to drift independently. Install the published 2.8.1 archive retained under producer commit 6a8ae8fa4e65c8d49c933956592e1a088c32a78b so a clean npm ci recreates the same package without building or changing a sibling checkout.

## Scope

Change the dependency and lockfile, developer installation instructions, and a small installation guard with negative controls. The required audit exposed inherited development-tool failures; root separately authorized a bounded existing-tool upgrade and nonmajor transitive repairs. Gameplay, rendering, save formats, new direct dependencies, shared node_modules, and shared engine dist are outside this change.

## Approach

Use the public retained GitHub release asset directly as the npm dependency; npm's lock integrity verifies archive bytes. Record the verified version, URL, and integrity in scripts/civ-engine-pin.json. A local guard checks manifests and lock agreement, rejects linked package/dependency directories and escaping runtime entries, and verifies both compiled Node and browser ENGINE_VERSION exports. It runs before test, build, and dev; no custom installer or downloader is added.

## Acceptance criteria

- [x] Producer hosted CI and the exact retained archive are verified before installation.
- [x] Guard tests first fail, then pass, including old sibling links, wrong integrity, and stale runtime versions.
- [x] A clean private npm ci installs a physical 2.8.1 package from the exact archive and passes the guard.
- [x] Test, typecheck, lint, build, and both high-severity audits pass, or inherited failures are reproduced and resolved within agreed scope.
- [x] Headless browser processes and localhost servers created by the gates are closed.
- [x] Exact candidate receives independent in-session review; root accepts the implementation and execution evidence.
- [x] Root merged and pushed c719bd4, confirmed no hosted workflows are configured, and accepted process cleanup. Final worktree cleanup follows this documentation closure.

## Implementation steps

- [x] Read local rules, prior lessons, architecture boundaries, and current gate/browser ownership.
- [x] Prepare isolated worktree codex/engine-pin-1107 from a0d6aba; no shared dependencies.
- [x] Complete red/green installation contracts and archive adoption.
- [x] Run required gates under the root's single heavy-gate slot.
- [x] Record exact evidence and independent review, retained in review 0 against 8295833.
- [x] Record integration result: implementation8295833 plus reviewc719bd4 are on main/origin; no hosted workflows exist (GitHub reports total_count0).

## Outcome

Producer readiness accepted from root: CI 42425758281 passed Node 20/22/24 and publication at 6a8ae8fa4e65c8d49c933956592e1a088c32a78b. Retained asset 722286624 is 663627 bytes; SHA256 b6f766fff065941c221497d4623cd8b2d8d2e7d1c4849076a62e63df213d2878 matches GitHub and package/runtime are 2.8.1. No archive was fetched or dependency installed before readiness. Consumer local verification, independent review and main delivery passed at c719bd481fa05f0b639deaa99b76abafb58efbfc. No hosted workflows are configured. Shared primary node_modules and engine dist were preserved; the new guard requires npm ci before the next dev/test/build in a checkout still holding the old linked installation.

## Verification and audit prerequisite

Clean npm ci on Node 24.12.0/npm 11.7.0 first populated the previously absent private node_modules (161 packages), then reproduced the final repaired lock (154 packages). The guard and root's independent inspection both confirmed a physical package, exact retained URL and supplied SHA512 integrity, and Node/browser runtime 2.8.1. Thirteen installation contracts passed. The initial missing-guard run failed; deliberately disabling the runtime-version comparison then failed both stale-runtime controls (Node and browser), with the guard restored in finally.

The initial full audit failed with 8 moderate, 6 high, and 2 critical findings; the engine-only lock diff changed no development packages. An isolated audit of copied a0d6aba manifests reproduced all 16 findings without installing the old sibling dependency. Production audit had zero findings. Vitest 3.2.7 still requires tinypool 1.1.1, and the public 1.x line has no patched release. Root authorized the existing fleet-proven Vitest 4.1.12, which removes tinypool, plus npm audit fix without --force. The final high-severity audits pass: seven moderate minimatch-related development findings remain, production zero. No new direct dependency was introduced.

Vitest 4 removes poolOptions; the [official migration guide](https://v4.vitest.dev/guide/migration.html#pool-rework) maps maxForks to maxWorkers. Farm now explicitly retains the forks pool and the identical Math.max(2, Math.min(6, os.cpus().length - 1)) bound. The two concurrency contracts were updated to inspect the supported setting, failed on the old configuration, and passed on the migrated one. No timeout or behavioral assertion was relaxed. The 13 guard plus two concurrency tests passed together on Vitest 4.1.12.

Typecheck, lint, and build pass on the repaired tree. Vite 7.3.7 retains the existing large-chunk warning (1.46 MB uncompressed application bundle). Full npm test passed 66/66 files and 500/500 tests in 43.21 seconds, headlessly under the root-reserved heavy-gate slot. Hidden root PID 14420 and 210 descendants were tracked; finally cleanup found zero surviving owned processes, so none needed termination. The gate receipt reports actual exit 0. Raw gate and baseline-audit evidence stays under ignored tmp/engine-pin-1107/. Integration and independent review are root-owned and pending; no manual visual review is claimed.
