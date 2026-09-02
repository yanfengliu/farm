# Lessons — evidence

The entry behind each queued rule in [lessons.md](lessons.md), in the same order: what surfaced it, the failure mode, the fix unit, the regression anchor, and the behaviour delta. Not session-start reading — come here from a rule.

An entry is deleted in the same commit as its rule, when the gate that retires it lands. The two halves empty together; `npm test` fails on a half-emptied queue.

The evidence for lessons that have already been retired is not here. It is in the gates themselves — every one carries its lesson's claim in its own header, so a reader who hits one red learns the lesson without opening a doc — and in [gate-proofs.md](gate-proofs.md), which records the mutation that proved each gate goes red.
