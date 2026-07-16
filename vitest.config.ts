import os from 'node:os';
import { defineConfig } from 'vitest/config';

// Sixteen suites under tests/browser each launch their own Chromium and Vite dev
// server, so this suite is bound by browser memory and CPU rather than by core
// count. Vitest's default of one fork per core oversubscribes a large machine
// badly enough that browser tests miss the 15s budgets they set for themselves,
// which surfaces as widespread timeouts rather than as real assertion failures.
const BROWSER_SAFE_MAX_FORKS = 6;

export default defineConfig({
  test: {
    poolOptions: {
      forks: {
        maxForks: Math.max(2, Math.min(BROWSER_SAFE_MAX_FORKS, os.cpus().length - 1)),
      },
    },
  },
});
