# Review 1: implementation

## Target

Exact tree 867fab87de453bac18dfd37a4df971689337e5cc against base 87c70e96dc12d2a6e67d055fe538609b404a4b0e; bounded follow-up for A1, CLI invocation through filesystem aliases.

## Reviewers and coverage

Independent in-session gpt-6-astra/xhigh. Exact source and fixture review, plus retained RED/GREEN evidence. External CLI source export was rejected earlier in the parent task and was not retried; no external CLI report is claimed.

## Reports

### gpt-6-astra / xhigh

Reviewed frozen tree `867fab87de453bac18dfd37a4df971689337e5cc` against base `87c70e96dc12d2a6e67d055fe538609b404a4b0e`. The index and tracked worktree matched the frozen tree. All five changed files were inspected.

**No material findings. A1 is resolved within the reviewed scope.** The invocation guard at `scripts/check-engine.mjs:50` resolves both filesystem paths, normalizes case only on Windows, and requires a nonempty invoked path. Missing or unresolvable `argv[1]` cannot accidentally authorize execution. The existing CLI still prints verification only after successful validation and sets exit code1 on rejection.

The subprocess tests at `tests/testing/engineInstall.test.mjs:92` copy the actual guard into physical fixtures and invoke it through direct, real junction, and Windows case-variant paths. Success requires the verification message and installed-package path; rejection requires exit1, the specific diagnostic, and empty stdout. Import tests deliberately use invalid installations and require inert imports with normal, absent, and nonexistent arguments. Fixture aliases are detached before temporary roots are removed.

Outside the changed hunk, I verified that manifest/lock identity validation at `scripts/check-engine.mjs:22` and private Node/browser runtime checks remain unchanged. The retained RED log shows both junction regressions—empty success output and invalid-pin exit0—with20 other passes. GREEN reports22 passes.

Bounds: static source, exact Git comparisons, and retained-log inspection only. I ran no tests, gates, installs, network operations, or writes. Full gates and integration remain root-owned; this is not a full application or cross-platform execution review.

## Findings and disposition

No material findings. Root accepts the correction; existing installation identity checks and dependency pins remain unchanged.

## Verification

Implementer evidence: two junction failures and20 passes before the fix, then22 focused passes, targeted lint/content checks and actual private2.8.1 runtime verification. Full gates and delivery remain pending in this review record and are tracked by the work plan.

## Round outcome

Independent review accepted, subject to full required gates and normal delivery.