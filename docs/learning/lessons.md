# Lessons

A queue, not an archive. A lesson lands here the session it is learned, one line, anchored to a measurement, commit, or test id, and **naming the gate it is waiting for** — a test, a lint rule, a schema check, a fixed command. It is deleted in the commit that lands that gate, and a gate counts only once it has been made to go red by reintroducing the defect.

Until an entry is deleted, every session in this repo pays to carry it, so the gate comes as early as it can be written. An entry that can name no gate is not a lesson: fleet-wide knowledge is staged in [canon-candidates.md](canon-candidates.md) for the constitution, repo-only knowledge goes to [../policies/local-rules.md](../policies/local-rules.md), and the rest is folklore and is dropped.

Each rule links into [lessons-evidence.md](lessons-evidence.md), which holds the war story and the anchor. `npm test` runs the pairing check (`tests/testing/lessonsPairing.test.mjs`, also available as `npm run lessons:check`): the two halves must empty together, so a rule always has an entry and an entry always has a rule.

An empty queue is the resting state and passes. Retired lessons are not lost — [gate-proofs.md](gate-proofs.md) records, for each one, the gate that replaced it and the mutation that was made to prove it goes red.

## Rules
