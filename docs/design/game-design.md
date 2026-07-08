# Farm Game Design

## Vision

`farm` is a desktop-first browser idle farming game about planning a small, readable, top-down pixel farm and watching tiny autonomous farmhands keep it alive. The player controls layout, crop mix, expansion, selling, and upgrades. Workers decide concrete tasks themselves.

The first screen is the playable farm, not a landing page. The tone is plain cozy farm: carrots, wheat, tomatoes, wells, bins, and tiny farmhands. No magic, no heavy story, no industrial theme, and no decorative-only build items in the MVP.

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
7. Milestones make the next tier claimable, and the player manually unlocks that tier from the Goals panel to receive more crops, workers, buildings, and tool upgrades.
8. The player expands adjacent land tile by tile, tunes layout, adjusts crop mix, and watches the farm improve.

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
- Pause and set 1x, 2x, or 4x speed.
- Undo and redo player-issued farm edits, upgrade purchases, and tier claims.
- Pan and zoom the camera with mouse and keyboard.
- Use visible keyboard shortcuts for all tools.

## Farming Rules

Crops use simple tiers. Early crops are fast and low value; later crops are slower and more valuable. Exact crop list and tier thresholds are implementation-tuned, but the first authored examples should resemble carrots, wheat, and tomatoes.

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

Progression uses linear milestone tiers. Completing a milestone makes the next tier available, but the player must claim the tier manually from the Goals panel before rewards apply. Tier claims are part of the same undo/redo history as other direct player commands. The game has no win condition; content can run out, but the farm should feel open-ended.

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
- Terminal-tier HUD and Goals copy should clearly switch from "claim the next tier" language to open-ended tuning actions such as crop mix, land expansion, and worker upgrades.
- Contextual seed-restock guidance when workers are waiting for buyable seeds. If one buyable seed crop matches the active milestone, that restock action should appear first and identify itself as the goal crop.
- Upgrades and unlocks.
- Inspect details for the selected tile, worker, plot, well, or storage bin.

Worker task state is visible only on hover or inspect, not as permanent icons over every worker.

The side panel can be collapsed for more playfield space or resized from its inner edge when text-heavy inventory, goals, crop-mix, or inspect content needs more room. The chosen side-panel width is a UI preference and is separate from the deterministic farm save.

Long side-panel content should visibly advertise its scroll state with a lightweight rail or edge fade, and bottom content should remain comfortably readable above the toolbar when scrolled to the end.

The UI chrome should feel elegant and desktop-first: black and white, semi-transparent, glassy, icon-led, and compact but readable. The farm itself can stay colorful and cozy, but the surrounding HUD, panels, toolbar, and non-playfield backdrop should avoid a green theme. A warm-charcoal stage is acceptable for depth as long as it stays clearly outside the green farm palette.

UI icons should use colorful, crisp pixel-art glyphs rather than generic line icons so the chrome still belongs to the top-down pixel farm without turning the surrounding panels green.

HUD stats should read as compact chips, repeated inventory/upgrade rows should have subtle item surfaces, and side-panel tabs may use icon-only faces at the default width when accessible labels, titles, and compact hover/focus labels remain available. At smaller desktop-like widths, toolbar controls may hide text labels and keep icon-plus-key faces to avoid truncated labels, but they should expose compact hover/focus labels above the toolbar.

The current icon direction is informed by the generated concept sheet at `docs/design/assets/generated-ui-icon-concept.png`: icons should read as familiar objects such as a magnifier, fenced plot, bucket well, wooden crate, hill, shovel, backpack, flag, coins, crop, seed pouch, gift, and sliders.

## Art

The MVP uses top-down pixel art. The grid should be readable, farm objects should be visually distinct, and tiny workers should be charming but simple.

The MVP is silent for now.

## Persistence

The MVP auto-saves to browser `localStorage`. Multiple save slots, manual export/import, and offline progress are later features.

## Debug And Test Surface

The game must expose these browser APIs:

- `window.render_game_to_text()` returns a compact human-readable summary of the farm.
- `window.advanceTime(ms)` advances deterministic simulation time for tests.
- `window.__farmDebug.getState()` returns structured state for tests and debugging.

`civ-engine` replay bundles are used for deeper bugs when needed.
