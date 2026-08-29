import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // A full scenario is a real end-to-end run — lobby setup over real
  // Realtime, then N scripted steps each polling for the acting page's own
  // state to settle (up to 5s) and then for the other page to converge (up
  // to 15s). base-game.spec.ts alone has 12 steps; 60s (the original
  // estimate) measured too tight against a real run in this environment.
  timeout: 180_000,
  fullyParallel: false,
  webServer: {
    command: 'npx vite --mode test',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
})
