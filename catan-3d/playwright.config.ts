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
  // polling (up to CONVERGENCE_TIMEOUT_MS, now 60s, see harness.ts) for
  // both pages to converge. base-game.spec.ts alone has 12 steps. This is
  // a generous ceiling, not the primary diagnostic signal — the
  // per-operation timeouts inside lobby.ts/harness.ts are what should
  // actually fire first and say which step failed; this exists so a
  // genuine hang still ends the test eventually instead of running forever.
  timeout: 600_000,
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
    // Playwright's headless Chromium falls back to SwiftShader (software
    // WebGL) by default, seen in this app's own dev tooling as repeated
    // "GPU stall due to ReadPixels" console warnings and a main thread
    // busy enough to delay ordinary JS execution for tens of seconds at a
    // time — this app renders a continuous, heavy react-three-fiber scene.
    // --use-angle=d3d11 requests real hardware rendering via ANGLE's
    // Direct3D 11 backend (broadly supported on Windows) instead of the
    // software fallback; --ignore-gpu-blocklist stops Chromium from
    // refusing GPU access based on its own (often overly conservative)
    // hardware allowlist in a headless/automated context.
    launchOptions: {
      args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
    },
  },
})
