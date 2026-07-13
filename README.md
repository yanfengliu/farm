# farm

Why play another farming desktop idle game when you can build one.

`farm` is a desktop-first browser idle farming game. Tiny autonomous farmhands plant, fetch water, harvest, haul crops to storage, sell overflow, and unlock new tiers while the player plans the farm layout.

## Run

`farm` currently consumes the sibling `../civ-engine` package. Build that package before installing Farm dependencies:

```bash
cd ../civ-engine
npm install
npm run build
cd ../farm
```

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5175/`.

## Verify

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Controls

| Key | Action |
|---|---|
| `I` | Inspect |
| `1` | Paint plots |
| `2` | Place well |
| `3` | Place storage |
| `4` | Buy adjacent land |
| `B` | Bulldoze |
| `Z` | Undo |
| `Y` | Redo |
| `Space` | Pause/resume |
| `0` | 1x speed |
| `-` | 2x speed |
| `=` | 4x speed |
| Arrow keys / `WASD` | Pan camera |
| Mouse wheel | Zoom |

## Debug API

The browser exposes:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`
- `window.__farmDebug.getState()`
- `window.__farmDebug.reset()`
- `window.__farmDebug.exportBundle()` in development builds
