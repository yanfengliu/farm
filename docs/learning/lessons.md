# Engineering Lessons

## 2026-07-10 - Guided canvas actions must bind the intended tool

- Surfaced by: `npm run playtest:recursive` repeatedly emitted the verified `visual-loop-ended-with-guidance` candidate; the controlled failing baseline is archived at `output/playwright/llm-visual-loop-history/2026-07-10T17-29-33-569Z/latest.json`.
- Failure mode: after the terminal audit selected Land, the local visual player interpreted `Paint plots on empty land` correctly but clicked the canvas without reselecting Plot. Playwright reported a successful click even though the active tool made it the wrong game action, so the guidance persisted until the step cap.
- Fix commit: `6e8c467` raises the ordinary decision allowance, gives recursive passes the 120-step ceiling, and routes guided paint through a pure decision that selects Plot before canvas whenever Plot is inactive.
- Regression anchors: `tests/browser/guidedPaintDecision.test.mjs` executes inactive-Plot, active-Plot, and missing-control cases; `tests/browser/recursivePass.test.mjs` pins the recursive default and explicit override behavior.
- Behavior delta: the proof run `farm-visual-loop-2026-07-10T17-29-34-591Z` selected Land at step 84, reselected Plot at 85, painted at 86, and agent-stopped at 108/120 instead of capping. Its `comparison.findings.resolved` contains `visual-loop-ended-with-guidance`, and replay checked 6 segments with zero skips or divergences.
