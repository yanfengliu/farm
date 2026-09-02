# Canon candidates — staged from farm, 2026-09-02

Fleet-wide knowledge this repo has paid for that no single repo gate can enforce across the fleet. The parent promotes these into `../../../fleet/FLEET.md` and then deletes this file. Until then this is the only copy.

## Every gate is bounded by something — a tick window, a seed set, a resolution, a fixture that ends early, an include list — and it proves nothing past that bound: name the bound in the gate's own header, and prove the defect cannot live beyond it

**From:** farm / the horizons found while mutation-proving 2026-07-12 through 2026-07-15's lessons.
**Why it has no gate:** the failure is a property of how a gate was written, not of any product code, so nothing red-flags it — three separate gates in this repo were green because their bound stopped in front of the defect, each in a different way, and only a deliberate widening found them.
**Anchor:** measured in farm on 2026-09-02, three instances in one pass. `tests/simulation/farmReplayWindow.test.ts` asserted `durationTicks <= FARM_REPLAY_WINDOW_TICKS` — a bound that moves with the constant it is meant to pin, so widening the window from 64 to 100000 kept that assertion green. `tests/browser/llmVisualLoopContract.test.mjs` pinned the terminal stop condition as a literal string naming four crops, so a fifth crop would ship with no sale obligation and the pin would still match word for word. `tests/browser/storybookArtDirection.test.mjs` proved the exponential-easing composition law at 200 ms against a 42 ms constant — where a clamped linear ramp saturates and satisfies the same law, so the assertion held for the very implementation it existed to reject; it only distinguishes them below about 50 ms. All three now carry an absolute bound and a header saying what it is.

## Measure randomized output at the seed the product actually ships, never at a convenient one

**From:** farm / 2026-07-13 - Randomized art must be measured at the authored seed.
**Why it has no gate:** it is a rule about which input a gate feeds itself; a gate that measures at the wrong seed is indistinguishable from a correct one until someone looks at the shipped artifact.
**Anchor:** farm's mixed hedgerow contained hash-based width, spacing, height, highlight and flower branches while the authored seed-19 / count-5 sequence collapsed every one of those modulo operations to five equal 21-pixel rectangles at equal 35-pixel steps with the same flower condition. Algorithmic randomness existed in the source and a repeated stamp existed on screen, and the first player-exported note asked what the unnatural long object east of the farm was. `tests/phaser/farmHedgerow.test.ts` now reads its inputs from `buildFarmHedgerowPlacements()` so every case measures the composition that ships.
