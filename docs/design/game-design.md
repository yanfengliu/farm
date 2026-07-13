# Farm Game Design

## Vision

`farm` is a desktop-first browser idle farming game about planning a small, readable, top-down pixel farm and watching tiny autonomous farmhands keep it alive. The player controls layout, crop mix, expansion, selling, and upgrades. Workers decide concrete tasks themselves.

The first screen is the playable farm, not a landing page. The tone is plain cozy farm: carrots, wheat, tomatoes, pumpkins, wells, bins, village basket notes, and tiny farmhands. No magic, no heavy story, and no industrial theme.

## Platform

The MVP is a desktop-first browser game. It runs in a browser tab/window and is optimized for mouse, keyboard, and desktop layout. Packaged desktop app or overlay mode can come later.

Idle progress runs only while the tab/window is open. There is no offline simulation in the MVP.

## Core Loop

1. The player owns a small grid farm with plots, wells, storage bins, seeds, coins, and one worker.
2. The player sets a percentage crop mix for unlocked crops. The mix is a 100% allocation budget: when one unlocked crop is adjusted, the remaining unlocked crops share the rest.
3. Workers autonomously plant, water, harvest, and haul according to the crop mix and farm needs.
4. Crops and seeds are tracked in inventory. Storage buildings increase shared capacity.
5. Workers must physically haul crops to storage drop-off points before those crops enter the shared inventory.
6. The player manually sells crops, and crop overflow auto-sells at normal price when crop storage is full.
7. From Tier 2 onward, the player may pin one of two deterministic Village Request baskets, retain its requested crop mix instead of selling immediately, and deliver the complete basket for a premium with no deadline or failure penalty.
8. Milestones make the next tier claimable, and the player manually unlocks that tier from the Goals panel to receive more crops, workers, buildings, and tool upgrades.
9. The player expands adjacent land tile by tile, tunes layout, adjusts crop mix, fulfills new village rotations, and watches the farm improve.

## Player Controls

Workers are priority-autonomous. The player does not assign individual worker tasks in the MVP. The only worker priority control is crop mix percentages across unlocked crops. Workers automatically balance watering, planting, harvesting, hauling seeds, hauling water, and hauling crops.

When multiple workers are available, they should reserve distinct active plot targets for planting, watering, and harvesting whenever enough work exists. Workers may still share sources such as one storage bin or well, so they can briefly walk similar routes before splitting toward different plot jobs.

The player can:

- Paint plots by click-drag on empty owned land. Plot painting does not replace wells, storage bins, or existing plots.
- Place wells and storage bins with single clicks on empty owned land.
- Buy adjacent land tiles.
- Bulldoze farm objects for free with no refund.
- Adjust crop mix percentages with sliders or direct numeric percentage fields.
- Claim the next milestone tier once its requirement is met.
- Sell a selected crop amount or sell all sellable crops.
- Pin one Village Request, abandon it without penalty, or deliver it once every requested crop is in storage.
- Pause and set 1x, 2x, or 4x speed.
- Undo and redo player-issued farm edits, upgrade purchases, and tier claims.
- Pan and zoom the camera with mouse and keyboard.
- Use visible keyboard shortcuts for all tools.

## Farming Rules

Crops use simple tiers. Early crops are fast and low value; later crops are slower and more valuable. The authored progression is carrot, wheat, tomato, then pumpkin.

Crop states are visible on plots:

- Empty
- Planted
- Needs water
- Growing
- Ready
- Blocked or no seeds

Unwatered or blocked crops pause or slow down. They do not die in the MVP. No spoilage, no soil types, no weather, and no seasons in the MVP.

Seeds are tracked per crop. Seeds can be bought with coins once a crop is unlocked, and harvests can sometimes return seeds. Starter crop seeds regenerate slowly so the game cannot brick if the player runs out of seeds and coins.

If workers are idle because empty plots have no desired unlocked seeds and the player can afford seed restocks, the HUD should explain the stall. The Goals panel should surface compact seed-buy actions in that state so the player can restart planting without hunting through panels.

Crop mix is a target ratio, not a hard queue. If carrot is 75% and wheat is 25%, but only carrot seeds are available, workers should still plant carrots rather than waiting for wheat seeds. If workers have seeds but no empty plots, the HUD should explain that more plots are needed.

When a new crop unlocks after the player has already seen the first Crop Mix guide, Farm Guide should briefly point back to Crop Mix for that crop. For example, Tomato Rows should nudge the player to inspect and adjust the Tomato percentage instead of assuming the earlier Wheat-era guide covered every future crop.

Tools are global upgrades. They improve worker speed, crop handling, or farm efficiency without creating physical tool items. The first playable upgrades are worker boots, which increase movement speed, and watering cans, which keep crops watered longer.

## Logistics

MVP logistics are full but cozy-soft. Workers physically move to sources and targets, but bottlenecks slow progress rather than causing collapse.

Water comes from wells. Workers fetch water from wells and carry it to plots that need water.

Seeds are physical task inputs. Workers collect crop-specific seeds from shared inventory at a storage drop-off point and carry them to empty plots.

Harvested crops must be carried to storage. The UI presents one global inventory, and storage buildings increase shared capacity, but placement matters because workers need drop-off routes.

Storage capacity is recalculated from placed storage bins. If storage is removed and existing crops exceed the new capacity, excess crops auto-sell at normal price.

Workers can walk across open owned land and plots. Storage bins and wells block movement.

Workers do not collide with each other in MVP. Multiple workers can occupy or pass through the same tile.

Blocking buildings cannot be placed on a tile currently occupied by a worker. Legacy saves that already contain a worker inside a storage bin or well are repaired on load by clearing the blocking tile back to empty owned land.

Placement tools are non-overwriting. A plot, well, or storage bin remains in that cell until the player explicitly bulldozes it, then places something else on the empty land.

## Economy And Progression

The economy uses coins, crops, seeds, and milestone stats. Processing and crafting buildings are not in MVP.

Progression uses four linear milestone tiers. Completing a milestone makes the next tier available, but the player must claim the tier manually from the Goals panel before rewards apply. Tier claims and Village Request actions are part of the same undo/redo history as other direct player commands. Tier 4, Harvest Hearth, unlocks pumpkins and a fourth farmhand before switching the farm to an open-ended festival harvest.

The Village Request Board unlocks with Tier 2. Each tier has four authored neighbor notes and exposes a deterministic rotating pair; pinning one hides the alternative until the active basket is delivered or abandoned. A completed request consumes exactly its listed crops, pays its authored premium, advances the rotation, and increments lifetime request stats. Requests never expire and never punish the player, so the decision is about short-term cash versus a better planned return. Harvest Hearth requires three completed requests plus ten harvested tomatoes, which prevents diligent Tier 2 request play from skipping the tomato chapter.

Milestones should teach and pace the game through goals like:

- Harvest a number of starter crops.
- Sell crops for the first time.
- Own more plots.
- Maintain multiple crops.
- Reach worker and land thresholds.

Additional stats are tracked beyond milestones, including lifetime planted, harvested, sold, bought seeds, manual sales, overflow sales, worker distance, and land purchased.

## Starting Farm

The starting farm is a tiny starter kit:

- Small owned grid region inside a larger locked map.
- A few plots.
- One worker.
- One well.
- One storage bin on a separate utility tile outside the starter plot row, so workers can begin seed and crop logistics without the player building storage first. Older starter saves that had the old storage position or no storage recover that utility bin when safe.
- Starter crop seeds.
- A small coin balance.
- Minimal contextual hints.

The player should see the first worker begin meaningful work immediately.

## UI

The layout uses a canvas playfield with a bottom toolbar and collapsible side panels. The always-on HUD shows:

- Coins
- Storage usage
- Worker count
- Current tier or next milestone
- Milestone progress counts for harvest goals
- Selected tool
- Speed and pause state
- Alerts
- Contextual Farm Guide cards that point at the next relevant click when a process becomes needed. Each card uses the same readable format with a short summary, a "Do" step, and a "Why" explanation. Once a card is visible, it should stay on that card until the player follows its target action or dismisses it; simulation progress, time passing, and unrelated clicks should not swap the card out from under the player. Most cards are first-time teaching moments, but pressure states such as nearly full crop storage may recur so the player is not left without an obvious next action. Urgent seed-restock and storage-pressure states should be selected before optional planning guidance can appear. When seed-restock guidance appears in Inventory and the active milestone crop has a buyable zero-stock seed row, the guide should name and point at that crop first.

Side panels provide:

- Inventory and manual selling, with locked seed purchases labeled clearly until their crop tier is unlocked.
- Crop mix percentages, with per-crop seed stock and planting readiness so players understand when a target crop is blocked by locked tiers, missing seeds, or lack of empty plots.
- Tier/milestone details and manual tier claiming.
- Village Request offers, active basket progress, delivery reward, completed count, and a clear Tier 1 lock explanation.
- Terminal-tier HUD and Goals copy should clearly switch from "claim the next tier" language to open-ended tuning actions such as crop mix, land expansion, and worker upgrades.
- Contextual seed-restock guidance when workers are waiting for buyable seeds. If one buyable seed crop matches the active milestone, that restock action should appear first and identify itself as the goal crop.
- Upgrades and unlocks.
- Inspect details for the selected tile, worker, plot, well, or storage bin.

Worker task state is visible only on hover or inspect, not as permanent icons over every worker.

The side panel can be collapsed for more playfield space or resized from its inner edge when text-heavy inventory, goals, crop-mix, or inspect content needs more room. The chosen side-panel width is a UI preference and is separate from the deterministic farm save.

Long side-panel content should visibly advertise its scroll state with a lightweight rail or edge fade, and bottom content should remain comfortably readable above the toolbar when scrolled to the end.

The UI chrome should feel elegant and desktop-first: warm espresso glass, cream text, harvest-gold highlights, colorful pixel icons, and compact but readable controls. The chrome should frame the colorful farm without competing with it or becoming a green-on-green theme.

UI icons should use colorful, crisp pixel-art glyphs rather than generic line icons so the chrome still belongs to the top-down pixel farm without turning the surrounding panels green.

HUD stats should read as compact chips, repeated inventory/upgrade rows should have subtle item surfaces, and side-panel tabs may use icon-only faces at the default width when accessible labels, titles, and compact hover/focus labels remain available. At smaller desktop-like widths, toolbar controls may hide text labels and keep icon-plus-key faces to avoid truncated labels, but they should expose compact hover/focus labels above the toolbar.

The current icon direction is informed by the generated concept sheet at `docs/design/assets/generated-ui-icon-concept.png`: icons should read as familiar objects such as a magnifier, fenced plot, bucket well, wooden crate, hill, shovel, backpack, flag, coins, crop, seed pouch, gift, and sliders.

## Art

The visual identity is a warm storybook patchwork farm rendered as crisp code-native pixel art. The farm sits inside a living meadow rather than a dark void: a full-height creek and timber bridge, two named ducks with their own habitat routines, cottage garden and laundry, irregular flowering hedgerows, distinct elder, hazel, birch, apple, and willow silhouettes, fern and flower understory, creek-bank sedge/cattail/iris communities, stones, lily pads and blossoms, flower lanes, hay bales, bee skeps, a mounted patchwork scarecrow with a perched crow, fencing, butterflies, chimney smoke, and small deterministic glints make the world feel inhabited while keeping the playable grid readable. Decorative stories inside the expansion grid belong to wild ground and disappear cleanly when that land becomes playable; permanent botany remains outside the expansion footprint, and low clover may grow on owned empty cells until a functional tile replaces it.

Rendering uses distinct meadow, water, ground, low-scenery, object, actor, overstory, effect, and interaction layers. Raised soil beds have timber edges, furrows, and dry/moist variants. Crops show recognizable growth stages, with pumpkin vines and orange fruit reading distinctly from carrot tops, wheat heads, and tomato stakes. Workers have stable outfit palettes, hats, scarves, directional walk poses, crop-colored cargo, readable planting, watering, harvesting, and hauling props, and presentation-only quadrant slots when several workers share a cell. Selection uses topmost pixel corner brackets and placement previews rather than a generic outline.

Scenery variation comes from authored layouts plus coordinate or entity hashes so screenshots remain stable. Named shelter anchors are independent of decorative tree ordering, and permanent tree and plant visual bounds remain clear of the farm, cottage garden, bridge, and default recenter crop. Presentation-only ambience such as butterflies, smoke, water shimmer, and glints never enters deterministic simulation or save state. Worker and duck actor poses follow simulation time and freeze when paused. A shared scenery layout frames the farm, creek, cottage, garden, and tree shelters on load and resize while preserving explicit player pan and zoom, and the illustrated creek spans the entire legal camera world. Purely decorative homestead flourishes make progress visible without changing rules: produce crates appear at Tier 2, bunting at Tier 3, and a small harvest stall at Tier 4.

The MVP is silent for now.

## Wildlife

Pip and Mallow are autonomous residents rather than a decorative looping pair. Each duck has deterministic hunger, energy, activity, location, destination, travel progress, and meal count. Hungry ducks reserve distinct available fish, swim to the corresponding creek habitat, eat, and release the fish into a renewable respawn cycle. Tired ducks abandon foraging, walk to a compatible grove shelter, tuck beneath the tree canopy, sleep until rested, and then return to the creek without player direction. Creek roaming reverses at the north and south habitat ends, and longer habitat trips advance more slowly so a duck never snaps across a large part of the scene in one simulation tick.

Wildlife advances with the same deterministic clock as the farm, freezes when paused, survives save/load and Undo/Redo, and is represented in replay/debug state. Fish reservations are reciprocal so two ducks cannot consume the same meal, and malformed or truncated authored ecology payloads fail save validation rather than leaking incoherent state into the simulation. Older saves with no ecology field gain the complete authored starter ecology during additive migration, while older replay snapshots remain exactly replayable without invented state.

The round shapes that appear in the creek are lily pads, sometimes carrying small cream, pink, or lavender blossoms. Their sizes, notches, companion leaves, blossom colors, and positions use stable coordinate hashes and irregular channel spacing, so the creek reads as a natural habitat instead of a repeated decoration while remaining deterministic for screenshots and replays.

## Persistence

The MVP auto-saves to browser `localStorage`. Multiple save slots, manual export/import, and offline progress are later features.

## Debug And Test Surface

The game must expose these browser APIs:

- `window.render_game_to_text()` returns a compact human-readable summary of the farm.
- `window.advanceTime(ms)` advances deterministic simulation time for tests.
- `window.__farmDebug.getState()` returns structured state for tests and debugging.

`civ-engine` replay bundles are used for deeper bugs when needed.
