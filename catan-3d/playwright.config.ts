import { defineConfig } from '@playwright/test'

// A dedicated port, well clear of 5173 (npm run dev's default) AND its
// auto-increment range (Vite tries 5173, 5174, 5175... in sequence when a
// port's taken, so a nearby port can still collide with a dev server that
// got bumped up by an earlier stray process — this happened once with 5174).
// Required, not cosmetic: reuseExistingServer means a dev server the user
// already has running would otherwise get REUSED for this suite, silently
// pointing every scenario at the real production Supabase project (npm run
// dev's default mode reads .env.local, not .env.test.local) while
// assertConnected passes happily, since production Realtime is reachable
// too. A port this far away makes that collision effectively impossible.
const TEST_SERVER_PORT = 5299

export default defineConfig({
  testDir: './tests',
  // A full scenario is a real end-to-end run — lobby setup over real
  // Realtime (up to ~270s worst case: 2x waitForGameStarted at 90s +
  // 2x assertConnected at 45s, see lobby.ts), then N scripted steps each
  // polling (up to CONVERGENCE_TIMEOUT_MS, 60s, see harness.ts) for both
  // pages to converge. base-game.spec.ts alone has 12 steps: 270s +
  // 12 * 60s = 990s worst case. This must stay ABOVE that sum (CodeRabbit
  // review, PR #71) — a smaller outer timeout than the documented inner
  // budget can fire FIRST, replacing the per-step diagnostic error
  // (harness.ts's own "did not converge" / "was rejected" messages, with
  // a full state diff) with a generic, useless "Test timeout exceeded."
  // This is a generous ceiling, not the primary diagnostic signal — the
  // per-operation timeouts inside lobby.ts/harness.ts are what should
  // actually fire first and say which step failed; this exists so a
  // genuine hang still ends the test eventually instead of running forever.
  timeout: 1_050_000,
  fullyParallel: false,
  // Standard GitHub-hosted runners are 2 vCPU/7GB. Each scenario opens TWO
  // full browser contexts (host + joiner); with Playwright's default
  // worker count (2, matching the runner's own CPU count) that's up to 4
  // concurrent Chromium instances plus the shared Vite dev server on a
  // 2-core box. Suspected cause of CI's multiplayer job dying at a
  // consistent ~60-90s mark across 5 straight attempts, independent of
  // otherwise-unrelated fixes — GitHub's own infrastructure can tear down
  // a runner it decides has gone unresponsive under resource pressure,
  // which surfaces identically to an external cancellation. Serializing to
  // 1 worker in CI trades run time for peak resource use; unset locally
  // (undefined lets Playwright auto-detect, matching this sandbox's own
  // faster multi-core runs all session).
  workers: process.env.CI ? 1 : undefined,
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
