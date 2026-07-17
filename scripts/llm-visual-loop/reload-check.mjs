// Save/reload restore oracle for the visual loop.
//
// The loop clears localStorage once at context creation and then plays one long
// browser session, so it exercises the write half of persistence and never the
// read half. This check closes that lane: after all other evidence is exported,
// it reads the autosave the game itself wrote, reloads the page like a returning
// player, and requires the restored farm to be the same farm. The baseline is
// deliberately the stored save rather than live state - what the save says is
// exactly what a returning player gets.
//
// It must run AFTER bundle export and replay self-check: reloading destroys the
// in-page SessionRecorder, so any evidence not already exported is gone.

const SAVE_KEY = 'farm.autosave.v1';

export function farmStateIdentity(state) {
  const sum = (record) => Object.values(record ?? {}).reduce((total, value) => total + value, 0);
  return {
    tick: state.tick,
    tierLevel: state.tier.level,
    ownedTiles: Object.keys(state.tiles).length,
    workers: state.workers.length,
    coins: state.coins,
    watered: state.stats.lifetimeWatered,
    planted: sum(state.stats.lifetimePlanted),
    harvested: sum(state.stats.lifetimeHarvested),
  };
}

// Identity rules must hold exactly; monotonic rules may only move forward,
// because the restored farm keeps simulating between reload and read.
export function compareSaveReload(saved, restored) {
  const violations = [];
  const identity = (rule, savedValue, restoredValue) => {
    if (restoredValue !== savedValue) violations.push({ rule, saved: savedValue, restored: restoredValue });
  };
  const monotonic = (rule, savedValue, restoredValue) => {
    if (restoredValue < savedValue) violations.push({ rule, saved: savedValue, restored: restoredValue });
  };
  monotonic('tick-regressed', saved.tick, restored.tick);
  identity('tier-changed', saved.tierLevel, restored.tierLevel);
  identity('owned-tiles-changed', saved.ownedTiles, restored.ownedTiles);
  identity('workers-changed', saved.workers, restored.workers);
  monotonic('coins-regressed', saved.coins, restored.coins);
  if (restored.watered < saved.watered || restored.planted < saved.planted || restored.harvested < saved.harvested) {
    violations.push({
      rule: 'progress-regressed',
      saved: { watered: saved.watered, planted: saved.planted, harvested: saved.harvested },
      restored: { watered: restored.watered, planted: restored.planted, harvested: restored.harvested },
    });
  }
  return violations;
}

export async function runSaveReloadCheck(page) {
  try {
    const savedRaw = await page.evaluate((key) => globalThis.localStorage.getItem(key), SAVE_KEY);
    if (savedRaw === null) return { status: 'skipped', reason: 'no-autosave' };

    let saved = null;
    const violations = [];
    try {
      saved = farmStateIdentity(JSON.parse(savedRaw));
    } catch {
      violations.push({ rule: 'save-unparseable', saved: `${savedRaw.slice(0, 64)}...`, restored: null });
    }

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof globalThis.__farmDebug?.getState === 'function');

    const alert = await page.evaluate(() => (
      globalThis.document.querySelector('.hud-alert')?.textContent?.trim() ?? ''
    ));
    if (/unreadable|could not be read/i.test(alert)) {
      violations.push({ rule: 'save-refused', saved: 'a save this session wrote', restored: alert });
    }

    const restored = farmStateIdentity(await page.evaluate(() => globalThis.__farmDebug.getState()));
    if (saved) violations.push(...compareSaveReload(saved, restored));
    return { status: 'checked', saved, restored, alert, violations };
  } catch (error) {
    return { status: 'error', error: String(error?.message ?? error) };
  }
}
