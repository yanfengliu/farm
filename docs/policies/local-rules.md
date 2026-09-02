# Local rules — farm

Rules that are true for this repo and are not fleet canon. The fleet constitution lives in `../../AGENTS.md` inside the `FLEET-CANON` block and is never edited here.

## Scenery clearance is fixed at the placement, not by moving the shared camera frame

The scenery frame and the default recenter viewport are shared by every browser contract in this repo: annotation click mapping, landmark palette sampling, and crop-coordinate mapping all read the same projection.

When a decorative object clips at a supported desktop size, the fix belongs to that object's placement — narrow it, reposition it, or overlap its masses into a denser silhouette. Enlarging the shared frame so the object fits also rescales and shifts the whole world; the object then looks correct while six existing browser contracts fail for reasons that have nothing to do with the object.

Measured on 2026-07-13: enlarging the frame for the east hedgerow broke four browser suites across annotation clicks, landmark palette sampling, and crop-coordinate mapping. The final placement overlaps five unequal shrub masses into one thicket and keeps the established frame and camera composition.

The outcome half of this rule is gated — `tests/phaser/farmHedgerow.test.ts` requires every authored hedge to keep four pixels of breathing room inside the default recenter viewport, and `tests/browser/farmBotanyLayout.test.mjs` checks every permanent plant's real painted bounds against the farm, bridge, garden, and recenter viewport. What is not gated, and is why this entry exists, is the *ordering*: both of those pass equally well if you widen the frame instead, and you will not find out what that cost until the unrelated suites go red.
