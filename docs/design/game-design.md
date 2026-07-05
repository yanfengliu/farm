# Farm Game Design

## Vision

`farm` is a desktop-first browser idle farming game about planning a small, readable, top-down pixel farm and watching tiny autonomous farmhands keep it alive. The player controls layout, crop mix, expansion, selling, and upgrades. Workers decide concrete tasks themselves.

The first screen is the playable farm, not a landing page. The tone is plain cozy farm: carrots, wheat, tomatoes, wells, bins, and tiny farmhands. No magic, no heavy story, no industrial theme, and no decorative-only build items in the MVP.

## Platform

The MVP is a desktop-first browser game. It runs in a browser tab/window and is optimized for mouse, keyboard, and desktop layout. Packaged desktop app or overlay mode can come later.

Idle progress runs only while the tab/window is open. There is no offline simulation in the MVP.

## Core Loop

1. The player owns a small grid farm with plots, wells, storage bins, seeds, coins, and one worker.
2. The player sets a percentage crop mix for unlocked crops.
3. Workers autonomously plant, water, harvest, and haul according to the crop mix and farm needs.
4. Crops and seeds are tracked in inventory. Storage buildings increase shared capacity.
5. Workers must physically haul crops to storage drop-off points before those crops enter the shared inventory.
6. The player manually sells crops, and crop overflow auto-sells at normal price when crop storage is full.
7. Milestones unlock more crops, land capacity, workers, buildings, and tool upgrades.
8. The player expands adjacent land tile by tile, tunes layout, adjusts crop mix, and watches the farm improve.

## Player Controls

Workers are priority-autonomous. The player does not assign individual worker tasks in the MVP. The only worker priority control is crop mix percentages across unlocked crops. Workers automatically balance watering, planting, harvesting, hauling seeds, hauling water, and hauling crops.

The player can:

- Paint plots by click-drag.
- Place wells and storage bins with single clicks.
- Buy adjacent land tiles.
- Bulldoze farm objects for free with no refund.
- Adjust crop mix percentages.
- Sell a selected crop amount or sell all sellable crops.
- Pause and set 1x, 2x, or 4x speed.
- Undo and redo build, bulldoze, and crop-priority changes.
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

Tools are global upgrades. They improve worker speed, crop handling, or farm efficiency without creating physical tool items. The first playable upgrades are worker boots, which increase movement speed, and watering cans, which keep crops watered longer.

## Logistics

MVP logistics are full but cozy-soft. Workers physically move to sources and targets, but bottlenecks slow progress rather than causing collapse.

Water comes from wells. Workers fetch water from wells and carry it to plots that need water.

Seeds are physical task inputs. Workers collect crop-specific seeds from shared inventory at a storage drop-off point and carry them to empty plots.

Harvested crops must be carried to storage. The UI presents one global inventory, and storage buildings increase shared capacity, but placement matters because workers need drop-off routes.

Storage capacity is recalculated from placed storage bins. If storage is removed and existing crops exceed the new capacity, excess crops auto-sell at normal price.

Workers can walk across open owned land and plots. Storage bins and wells block movement.

Workers do not collide with each other in MVP. Multiple workers can occupy or pass through the same tile.

## Economy And Progression

The economy uses coins, crops, seeds, and milestone stats. Processing and crafting buildings are not in MVP.

Progression uses linear milestone tiers. Milestones unlock availability rather than acting as a final endpoint. The game has no win condition; content can run out, but the farm should feel open-ended.

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
- One storage bin.
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
- Selected tool
- Speed and pause state
- Alerts

Side panels provide:

- Inventory and manual selling.
- Crop mix percentages.
- Tier/milestone details.
- Upgrades and unlocks.
- Inspect details for the selected tile, worker, plot, well, or storage bin.

Worker task state is visible only on hover or inspect, not as permanent icons over every worker.

The UI chrome should feel elegant and desktop-first: black and white, semi-transparent, glassy, and compact. The farm itself can stay colorful and cozy, but the surrounding HUD, panels, toolbar, and non-playfield backdrop should avoid a green theme.

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
