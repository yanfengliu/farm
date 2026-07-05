# Architecture Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-07-04 | Use `civ-engine` as the deterministic simulation core. | Worker logistics, pathfinding, replay/debug tooling, and headless tests are central to the game. |
| 2026-07-04 | Use Phaser as the initial renderer. | Phaser is a low-risk fit for top-down pixel-art sprites, camera, and input while leaving rules outside the scene. |
| 2026-07-04 | Start same-thread while preserving a worker-ready boundary. | MVP iteration is faster without worker messaging, and the simulation/renderer split allows migration later. |
| 2026-07-04 | Use DOM for HUD and panels. | Dense text, tool labels, side panels, and controls are more maintainable and accessible in DOM than canvas. |
| 2026-07-04 | Import browser-safe `civ-engine` modules through a narrow local adapter. | The root package export includes Node-only replay/file modules that Vite cannot bundle for browsers. The farm only needs `World`, `findGridPath`, and `Position` at runtime. |
