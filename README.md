# farm

Why play another farming desktop idle game when you can build one.

`farm` is a desktop-first browser idle farming game. Tiny autonomous farmhands plant, fetch water, harvest, and haul crops while the player shapes a sunlit pixel farm, balances crop mix, fulfills cozy Village Requests, and grows from carrot rows to the pumpkin-filled Harvest Hearth.

## Run

Use Node 24. Farm installs the prebuilt civ-engine 2.8.1 archive retained under producer commit `6a8ae8fa4e65c8d49c933956592e1a088c32a78b`. No sibling engine checkout or build is needed. `package-lock.json` pins the archive's integrity; `scripts/civ-engine-pin.json` records the verified URL, version, and digest.

```bash
npm ci
npm run engine:check
npm run dev
```

Open `http://127.0.0.1:5175/`.

The engine check runs before dev, test, and build. It rejects linked dependency directories, a different archive or integrity, and installed package/compiled runtime version disagreement. To upgrade the engine, verify a retained producer archive, update the dependency and pin together, regenerate the lockfile, then run a clean `npm ci` and all checks below. Never substitute the rolling `civ-engine.tgz` URL for the retained archive.

## Verify

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
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
| `Home` | Recenter the farm |
| Mouse wheel | Zoom |

## Debug API

The browser exposes:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`
- `window.__farmDebug.getState()`
- `window.__farmDebug.reset()`
- `window.__farmDebug.exportBundle()` in development builds

## Part of a fleet

This repo is one of ~two dozen sibling repos kept side by side under a single `github/` working folder. Fleet-wide setup, the governance canon, and the recursive self-improvement loop live in **[fleet](https://github.com/yanfengliu/fleet)** — on a fresh machine, clone that repo and run `npm run clone-fleet` to rehydrate every repo (including this one) and the shared canon.
