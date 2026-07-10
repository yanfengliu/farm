---
name: multi-cli-review
description: Use when running the multi-CLI (Codex + Claude) adversarial code review on high-risk changes or full-codebase audits — routes to the fleet-canonical runbook (pins, commands, output extraction, failure modes) plus farm-specific notes.
---

# Multi-CLI review — farm stub

**Read the fleet-canonical runbook now:** `../loop-ops/docs/skills/multi-cli-review.md` — current review model pins (the fleet's single bump site), exact CLI commands, `-o` output extraction, Windows gotchas, and failure modes. Do not act from memory of an older per-repo copy of this skill.

farm-specific notes:

- Reviewer pin sites in scripts: NONE (verified 2026-07-10 — grep of `scripts/`, including `llm-playtest/` and `llm-visual-loop/`, found no hard-coded reviewer models; replace this note if a future grep finds one).
- Capture convention: the canonical default (`tmp/review-runs/<objective>/<date>/<iteration_number>/`, never staged, cleaned up after synthesis) — no repo override.
