# Architecture Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-07-04 | Use `civ-engine` as the deterministic simulation core. | Worker logistics, pathfinding, replay/debug tooling, and headless tests are central to the game. |
| 2026-07-04 | Use Phaser as the initial renderer. | Phaser is a low-risk fit for top-down pixel-art sprites, camera, and input while leaving rules outside the scene. |
| 2026-07-04 | Start same-thread while preserving a worker-ready boundary. | MVP iteration is faster without worker messaging, and the simulation/renderer split allows migration later. |
| 2026-07-04 | Use DOM for HUD and panels. | Dense text, tool labels, side panels, and controls are more maintainable and accessible in DOM than canvas. |
| 2026-07-04 | Import browser-safe `civ-engine` modules through a narrow local adapter. | The root package export included Node-only replay/file modules that Vite could not bundle for browsers. Superseded by the public browser-export decision below. |
| 2026-07-08 | Record visual-loop self-improvement findings with the shared `civ-engine` `ImprovementFinding` contract. | Farm owns the Playwright/browser adapter and local heuristic, but recursive improvement evidence should be portable across `civ-engine` consumers. Standard findings keep verification status, next-action classification, visual-playtest bridging, and before/after rerun comparison in one machine-readable report. |
| 2026-07-12 | Consume the public `civ-engine/browser` package export through Farm's narrow adapter. | `civ-engine` 2.2.0 and later provide a browser-safe barrel, so Farm no longer reaches into a sibling checkout's built `dist` files. The sibling package remains an explicit local development prerequisite until the engine has a published installable release. |
