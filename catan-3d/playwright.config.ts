import { defineConfig } from '@playwright/test'

// A dedicated port (not 5173, npm run dev's default) for the test-mode
// server — required, not cosmetic: reuseExistingServer means a dev server
// the user already has running would otherwise get REUSED for this suite,
// silently pointing every scenario at the real production Supabase project
// (npm run dev's default mode reads .env.local, not .env.test.local) while
// assertConnected passes happily, since production Realtime is reachable
// too. A dedicated port makes that impossible: the two servers can never
// collide.
const TEST_SERVER_PORT = 5174

export default defineConfig({
  testDir: './tests',
  // A full scenario is a real end-to-end run — lobby setup over real
  // Realtime, then N scripted steps each polling (up to CONVERGENCE_TIMEOUT_MS,
  // see harness.ts) for both pages to converge. base-game.spec.ts alone has
  // 12 steps; 60s (the original estimate) measured too tight against a real
  // run in this environment.
  timeout: 180_000,
  fullyParallel: false,
  webServer: {
    command: `npx vite --mode test --port ${TEST_SERVER_PORT} --strictPort`,
    url: `http://localhost:${TEST_SERVER_PORT}`,
    // Always false, even locally: reuseExistingServer would trust
    // WHATEVER responds on this port without checking it's actually this
    // suite's own vite --mode test process — a leftover process from an
    // earlier crashed run, or anything else squatting on the port, would
    // get silently reused instead of caught. The dedicated port above
    // already rules out the worst case (colliding with a real dev
    // server), but "don't trust an unverified existing server" is worth
    // the few extra seconds of a guaranteed-fresh start every run.
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: `http://localhost:${TEST_SERVER_PORT}`,
  },
})
