# Multiplayer Sync Testing Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bot that drives two real, independently-mounted app instances through a scripted Catan game over real Supabase Realtime, and asserts their `GameState` stays converged after every action — catching actor/receiver broadcast divergence bugs, and doubling as an automated playtest.

**Architecture:** A permanent, mode-gated test hook (`window.__catanTestHarness`) exposes App.tsx's existing raw-action functions plus state/status reads. A Playwright scenario runner drives two separate browser contexts — real UI clicks for the one-time pre-game lobby setup, the test hook for the repeated in-game action stream — and polls for convergence with a field-aware assertion (deck *contents* are allowed to differ by design; everything else must match exactly).

**Tech Stack:** Playwright (`@playwright/test`, new devDependency), Vite's `--mode` env system, existing Supabase Realtime infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-29-multiplayer-sync-testing-harness-design.md`

## Prerequisite (manual, before Task 1)

This plan assumes `catan-3d/.env.test.local` already exists with real credentials for a dedicated test Supabase project. That setup is the spec's own "Test-project setup" section (new free-tier project, run `catan-3d/supabase/match_snapshots.sql` against it unchanged, enable Realtime, add the env file) — a one-time manual step only the user can do (creating a Supabase project isn't something this plan's tasks can automate). Task 2 verifies its own config without needing this; Task 5's live scenario run is the first task that actually requires it.

## Global Constraints

- Test hook gated by `import.meta.env.MODE === 'test'` — statically eliminated from production builds, not just runtime-inert.
- Test hook assigned via a `useEffect` placed *before* `App()`'s `if (!gameStarted) return` early return (App.tsx:7165) — placing it after breaks the hook once `gameStarted` flips true ("Rendered more hooks than during the previous render").
- Pre-game lobby setup (room creation, room code, joining, house rules) is driven by real UI interaction, not the test hook — the hook cannot reach `RoomLobby`/`GameSetupMenu`, which render before `gameStarted` is true.
- Convergence assertion is field-aware: full deep-equal on `GameState` except `decks.devDeck`/`decks.progressCardDecks[track]`, which compare by length only (their contents are allowed to differ between clients by design).
- Every scenario includes actions from both actors — a host-only scenario only tests one direction of broadcast sync.
- Playwright test files live under `catan-3d/tests/`, never under `catan-3d/src/` — Vitest's own config (`vite.config.ts`) already scopes to `src/**/*.test.ts`, and mixing frameworks in one directory risks Vitest trying to run `.spec.ts` Playwright files with the wrong test runner.

---

### Task 1: Test hook in App.tsx

**Files:**
- Create: `catan-3d/src/testHarness.ts`
- Modify: `catan-3d/src/App.tsx` (add `lastWarningRef`, extend `warn`, add the hook `useEffect`)

**Interfaces:**
- Produces: `CatanTestHarness` interface (exported from `testHarness.ts`), and a global `window.__catanTestHarness?: CatanTestHarness` — every later task reads from this.

- [ ] **Step 1: Create the shared type file**

```ts
// catan-3d/src/testHarness.ts
import type { GameState } from './game/gameState'
import type { DevCardType } from './game/types'

// Plain, JSON-safe shape for the board graph — BoardGraph itself
// (data/boardGraph.ts) carries several fields as native Map objects,
// which silently serialize to `{}` across Playwright's page.evaluate()
// boundary. getGraph() converts them before returning.
export interface TestHarnessGraph {
  vertices: { id: string; x: number; z: number }[]
  edges: { id: string; a: string; b: string }[]
  vertexEdgeIds: Record<string, string[]>
}

export interface CatanTestHarness {
  actions: {
    buildSettlement: (vertexId: string) => void
    buildRoad: (edgeId: string) => void
    buildShip: (edgeId: string) => void
    rollDice: () => void
    buyDevCard: () => void
    playDevCard: (card: DevCardType) => void
    endTurn: () => void
  }
  getState: () => GameState
  getGraph: () => TestHarnessGraph
  getStatus: () => { gameStarted: boolean; isMyTurn: boolean; connectionStatus: string }
  getLastWarning: () => string | null
}

declare global {
  interface Window {
    __catanTestHarness?: CatanTestHarness
  }
}
```

- [ ] **Step 2: Track the last warning in App.tsx**

Find the `warn` function (around App.tsx:753):

```ts
  const warn = (text: string) => {
    console.warn(`[Catan] ${text}`)

    setBanner({ text, variant: 'warning' })
    logEvent(text, 'warning')
  }
```

Add a ref just above it, and write to that ref inside `warn`:

```ts
  // Read by the test harness's getLastWarning() (testHarness.ts) — cleared
  // by the harness itself before each action it dispatches, so a read
  // right after an action is unambiguous. Not used by any real player-
  // facing code; a plain assignment here costs nothing for real players.
  const lastWarningRef = useRef<string | null>(null)

  const warn = (text: string) => {
    console.warn(`[Catan] ${text}`)

    setBanner({ text, variant: 'warning' })
    logEvent(text, 'warning')
    lastWarningRef.current = text
  }
```

- [ ] **Step 3: Add the hook's own import**

At the top of App.tsx, alongside the other local imports:

```ts
import type { CatanTestHarness } from './testHarness'
```

- [ ] **Step 4: Assign the hook, before the early return**

Find the end of the last `useEffect` before `if (!gameStarted)` (App.tsx:7163-7165):

```ts
    progressCardDecks,
  ])

  if (!gameStarted) {
```

Insert a new `useEffect` between them:

```ts
    progressCardDecks,
  ])

  // Test-only surface for the multiplayer sync harness (see
  // docs/superpowers/specs/2026-08-29-multiplayer-sync-testing-harness-design.md).
  // MODE is statically known at build time, so Vite/Rolldown dead-code-
  // eliminates this whole branch from a real production build — not just
  // runtime-inert, actually absent from the shipped bundle. Must run on
  // every render (no dependency array) and must be BEFORE the early
  // return below, or the hook count changes once gameStarted flips true
  // ("Rendered more hooks than during the previous render").
  useEffect(() => {
    if (import.meta.env.MODE !== 'test') return
    const wrap =
      <A extends unknown[]>(fn: (...a: A) => void) =>
      (...a: A) => {
        lastWarningRef.current = null
        fn(...a)
      }
    window.__catanTestHarness = {
      actions: {
        buildSettlement: wrap(buildSettlementRaw),
        buildRoad: wrap(buildRoadRaw),
        buildShip: wrap(buildShipRaw),
        rollDice: wrap(rollDice),
        buyDevCard: wrap(buyDevCard),
        playDevCard: wrap(playDevCard),
        endTurn: wrap(endTurn),
      },
      getState: () => gameState,
      // graph.vertexEdgeIds is a native Map — converted to a plain object
      // here since Map doesn't survive Playwright's page.evaluate()
      // serialization (silently becomes {}).
      getGraph: () => ({
        vertices: graph.vertices,
        edges: graph.edges,
        vertexEdgeIds: Object.fromEntries(graph.vertexEdgeIds),
      }),
      getStatus: () => ({ gameStarted, isMyTurn, connectionStatus }),
      getLastWarning: () => lastWarningRef.current,
    }
  })

  if (!gameStarted) {
```

- [ ] **Step 5: Typecheck**

Run: `cd catan-3d && npx tsc -b --force`
Expected: no output (clean). This project's plain `tsc --noEmit` silently checks nothing (root `tsconfig.json` is a solution file with `"files": []`) — always use `tsc -b`, matching what `npm run build` actually runs.

- [ ] **Step 6: Manually verify the hook is mode-gated**

Run: `cd catan-3d && npm run dev` (default mode), open the app in a browser, start a local game, open devtools console, run `window.__catanTestHarness`.
Expected: `undefined`.

Run: `cd catan-3d && npm run dev -- --mode test`, repeat the same steps.
Expected: an object with `actions`, `getState`, `getGraph`, `getStatus`, `getLastWarning` keys. Call `window.__catanTestHarness.getState()` — expect a real `GameState` object (has `board`, `players`, `turn`, `progress`, `decks`, `trophies`, `pendingQueues`, `trade` keys). Call `window.__catanTestHarness.getGraph()` — expect `{ vertices: [...], edges: [...], vertexEdgeIds: {...} }` where `vertexEdgeIds` is a **plain object**, not `{}` (confirms the Map conversion worked).

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/testHarness.ts catan-3d/src/App.tsx
git commit -m "feat: add mode-gated test hook for the multiplayer sync harness"
```

---

### Task 2: Playwright, test-mode env, and the npm script

**Files:**
- Create: `catan-3d/playwright.config.ts`
- Create: `catan-3d/.env.test.local.example`
- Modify: `catan-3d/package.json` (devDependency + script)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `npm run test:multiplayer` (runs `playwright test`), a `playwright.config.ts` whose `webServer` starts `vite --mode test` and whose `testDir` is `./tests`.

- [ ] **Step 1: Install Playwright**

Run: `cd catan-3d && npm install --save-dev @playwright/test && npx playwright install chromium`

- [ ] **Step 2: Add the env template**

```bash
# catan-3d/.env.test.local.example
# Copy to .env.test.local (gitignored via catan-3d/.gitignore's *.local
# pattern) and fill in a DEDICATED test Supabase project's real values —
# see the "Test-project setup" section of
# docs/superpowers/specs/2026-08-29-multiplayer-sync-testing-harness-design.md.
# Never point this at your real/production project.
VITE_SUPABASE_URL=https://your-test-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-test-project-publishable-key
```

- [ ] **Step 3: Write the Playwright config**

```ts
// catan-3d/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
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
```

- [ ] **Step 4: Add the npm script**

In `catan-3d/package.json`, add to `"scripts"`:

```json
    "test:multiplayer": "playwright test",
```

- [ ] **Step 5: Add a tsconfig covering `tests/`**

Neither existing tsconfig fits: `tsconfig.app.json` is scoped to `include: ["src"]` only, and `tsconfig.node.json` has no DOM lib — but Playwright test files need DOM types too, since the callback bodies passed to `page.evaluate(() => window.__catanTestHarness...)` reference `window` and are typechecked even though they execute in the browser. Create a third config:

```json
// catan-3d/tests/tsconfig.json
{
  "compilerOptions": {
    "tsBuildInfoFile": "../node_modules/.tmp/tsconfig.tests.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "types": ["node"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

Add it as a third reference in the root solution config:

```json
// catan-3d/tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tests" }
  ]
}
```

- [ ] **Step 6: Verify the config loads without a live backend**

Run: `cd catan-3d && npx playwright test --list`
Expected: exits cleanly reporting 0 tests found (no scenario files yet — that's Task 5). This proves the config itself is valid; it does not need `.env.test.local` to exist yet, since no test actually runs.

Run: `cd catan-3d && npx tsc -b --force`
Expected: clean (proves the new tests tsconfig is wired into the build correctly, even with only the config files present so far).

- [ ] **Step 7: Commit**

```bash
git add catan-3d/playwright.config.ts catan-3d/.env.test.local.example catan-3d/tests/tsconfig.json catan-3d/tsconfig.json catan-3d/package.json catan-3d/package-lock.json
git commit -m "chore: add Playwright for the multiplayer sync harness"
```

---

### Task 3: Lobby-driving helper

**Files:**
- Create: `catan-3d/tests/multiplayer/lobby.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure Playwright UI automation).
- Produces: `hostRoom(page): Promise<string>` (returns the room code), `joinRoom(page, joinerName, roomCode): Promise<void>`, `startWhenFull(page): Promise<void>`, `waitForGameStarted(page): Promise<void>`, `assertConnected(page, label): Promise<void>` — Task 5 calls all five.

- [ ] **Step 1: Write the helper**

```ts
// catan-3d/tests/multiplayer/lobby.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

// Drives the pre-game screens by real UI interaction — this happens once
// per scenario run, not per in-game action, so it doesn't carry the
// maintenance cost the test hook exists to avoid for the repeated action
// stream. Selectors match GameSetupMenu.tsx/RegionSelectMenu.tsx/
// RoomLobby.tsx/JoinRoomModal.tsx's real aria-labels/roles.

// Doesn't customize the host's display name — RoomLobby.tsx defaults it
// to a constant (DEFAULT_HOST_NAME), and this scenario has no reason to
// override it. Whether the host-side name field even shares
// JoinRoomModal's exact "Your name" aria-label was never verified this
// session (only the joiner's was) — not worth guessing at, since nothing
// here actually needs a custom host name.
export async function hostRoom(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Host Online' }).click()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.getByRole('button', { name: "Select Orion's Keep" }).click()
  await page.getByRole('button', { name: 'Show room code' }).click()
  const roomCode = (await page.locator('.room-code-font').first().textContent())?.trim()
  if (!roomCode) throw new Error('hostRoom: could not read room code from the lobby')
  return roomCode
}

export async function joinRoom(page: Page, joinerName: string, roomCode: string): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Join Existing Game' }).click()
  await page.getByLabel('Your name', { exact: true }).fill(joinerName)
  await page.getByLabel('Room code', { exact: true }).fill(roomCode)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
}

// Host-only: waits for the joiner to actually appear in presence (not a
// fixed sleep — presence sync is debounced, see useRoomChannel.ts's
// TRACK_DEBOUNCE_MS), then starts the match.
export async function startWhenFull(page: Page): Promise<void> {
  const startButton = page.getByRole('button', { name: 'Start game', exact: true })
  await expect(startButton).toBeEnabled({ timeout: 20_000 })
  await startButton.click()
}

export async function waitForGameStarted(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__catanTestHarness?.getStatus().gameStarted === true,
    { timeout: 20_000 },
  )
}

// Fails fast with a clear, specific message if the test Supabase project
// isn't actually reachable — e.g. .env.test.local missing or wrong —
// rather than letting the first scenario step time out after 15s in a
// way that looks like a convergence bug but is actually a setup problem.
export async function assertConnected(page: Page, label: string): Promise<void> {
  try {
    await page.waitForFunction(
      () => window.__catanTestHarness?.getStatus().connectionStatus === 'connected',
      { timeout: 15_000 },
    )
  } catch {
    const status = await page
      .evaluate(() => window.__catanTestHarness?.getStatus().connectionStatus ?? 'unknown')
      .catch(() => 'unknown')
    throw new Error(
      `${label}: never reached a connected Realtime state (status: "${status}"). ` +
        `Check catan-3d/.env.test.local has real credentials for a dedicated test Supabase project ` +
        `with Realtime enabled — see the "Test-project setup" section of ` +
        `docs/superpowers/specs/2026-08-29-multiplayer-sync-testing-harness-design.md.`,
    )
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd catan-3d && npx tsc -b --force`
Expected: clean — covered by `catan-3d/tests/tsconfig.json` (added in Task 2, Step 5).

- [ ] **Step 3: Lint**

Run: `cd catan-3d && npx eslint tests`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/tests/multiplayer/lobby.ts
git commit -m "feat: add Playwright lobby-driving helpers for the multiplayer harness"
```

---

### Task 4: Scenario format and convergence runner

**Files:**
- Create: `catan-3d/tests/multiplayer/harness.ts`

**Interfaces:**
- Consumes: `CatanTestHarness` type from `catan-3d/src/testHarness.ts` (Task 1).
- Produces: `ScenarioStep`, `runScenario(pageA, pageB, steps): Promise<void>` — Task 5 calls this.

- [ ] **Step 1: Write the runner**

```ts
// catan-3d/tests/multiplayer/harness.ts
import { expect, type Page } from '@playwright/test'
import type { CatanTestHarness } from '../../src/testHarness'

export type Actor = 'A' | 'B'

// Steps carry the action NAME plus plain, JSON-serializable args — not a
// closure over CatanTestHarness. page.evaluate() can only cross the
// Node/browser boundary with explicit serializable data in its second
// argument; Function.prototype.toString() (the alternative — stringify
// a closure, reconstruct it in-browser) captures only SOURCE TEXT, never
// values closed over from Node's own scope. A step like
// `(h) => h.actions.buildSettlement(v1)`, where v1 is a vertex id read
// earlier in the test, would reconstruct in-browser with v1 undefined —
// this isn't an implementation choice, it's a hard constraint of the
// boundary itself.
export interface ScenarioStep {
  actor: Actor
  action: keyof CatanTestHarness['actions']
  args?: unknown[]
}

const CONVERGENCE_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 200

async function runAction(page: Page, action: ScenarioStep['action'], args: unknown[] = []): Promise<void> {
  await page.evaluate(
    ({ action, args }) => {
      const fn = window.__catanTestHarness!.actions[action] as (...a: unknown[]) => void
      fn(...args)
    },
    { action, args },
  )
}

async function getLastWarning(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__catanTestHarness!.getLastWarning())
}

// decks.devDeck / decks.progressCardDecks[track] are compared by LENGTH
// only, never contents — their exact remaining order is never shown to
// any player and is allowed to differ between clients by design (see the
// harness design spec's "Convergence & assertions" section). Every other
// GameState field is included as-is for a full deep-equal.
async function getComparableState(page: Page) {
  return page.evaluate(() => {
    const state = window.__catanTestHarness!.getState()
    return {
      ...state,
      decks: {
        devDeckLength: state.decks.devDeck.length,
        progressCardDeckLengths: {
          science: state.decks.progressCardDecks.science.length,
          trade: state.decks.progressCardDecks.trade.length,
          politics: state.decks.progressCardDecks.politics.length,
        },
      },
    }
  })
}

export async function runScenario(pageA: Page, pageB: Page, steps: ScenarioStep[]): Promise<void> {
  for (const [index, step] of steps.entries()) {
    const actingPage = step.actor === 'A' ? pageA : pageB
    const otherPage = step.actor === 'A' ? pageB : pageA

    await runAction(actingPage, step.action, step.args)

    const warning = await getLastWarning(actingPage)
    if (warning) {
      throw new Error(`Step ${index} (actor ${step.actor}, action ${step.action}) was rejected: "${warning}"`)
    }

    const expected = await getComparableState(actingPage)
    await expect
      .poll(() => getComparableState(otherPage), {
        message: `Step ${index} (actor ${step.actor}, action ${step.action}) did not converge`,
        timeout: CONVERGENCE_TIMEOUT_MS,
        intervals: [POLL_INTERVAL_MS],
      })
      .toEqual(expected)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd catan-3d && npx tsc -b --force`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `cd catan-3d && npx eslint tests`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/tests/multiplayer/harness.ts
git commit -m "feat: add scenario runner with field-aware convergence assertion"
```

---

### Task 5: First scenario — setup phase + rolls — and a live run

**Files:**
- Create: `catan-3d/tests/multiplayer/scenarios/base-game.spec.ts`

**Interfaces:**
- Consumes: `hostRoom`/`joinRoom`/`startWhenFull`/`waitForGameStarted` (Task 3), `runScenario`/`ScenarioStep` (Task 4), `getGraph`/`TestHarnessGraph` (Task 1).

**Scope for this task, and why it stops here.** A fresh game starts in the setup phase: `rollDice`/`buyDevCard` are illegal (rejected with a warning) until both players have placed 2 settlements + 2 roads each, in snake order. `buildSetupOrder(2)` (already covered by an existing test in `game/types.test.ts`) confirms that order is `[0, 1, 1, 0]` — player 0 (host, "actor A" here, since `RoomLobby.tsx` always lists the host first in `names`) goes, then player 1 (joiner, "actor B"), then B again, then A again. This task's scenario completes that sequence, then has each actor roll once — a real, deterministic exercise of the highest-volume broadcast paths (settlement, road, dice roll, turn advance) with no dependency on which specific resources the board happens to grant.

`buyDevCard`/`bankTrade` (the actions that specifically motivated this harness, per the dev-card deck composition bug) are **not** in this task. `buyDevCard` needs 1 ore + 1 grain + 1 wool, which setup's "second-settlement resource kickstart" only grants if that settlement happens to be adjacent to those specific tiles — not guaranteed on an arbitrary seeded board. Reaching it deterministically needs the scenario to deliberately pick each player's second settlement by adjacent tile biome, not just by graph position. That's real, scoped work — tracked as a named follow-up below, not a placeholder in this task.

- [ ] **Step 1: Write the scenario**

```ts
// catan-3d/tests/multiplayer/scenarios/base-game.spec.ts
import { test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type ScenarioStep } from '../harness'
import type { TestHarnessGraph } from '../../../src/testHarness'

// Picks `count` vertex ids spread evenly across the board (sorted by
// diagonal position), for setup-phase settlement placement. The
// distance rule only requires 2+ edges of separation between
// settlements; spreading picks across the whole board's coordinate
// range gives far more separation than that on a board this size, so
// this doesn't need to reason about the graph's actual edge distances.
function pickSpreadVertices(graph: TestHarnessGraph, count: number): string[] {
  const sorted = [...graph.vertices].sort((a, b) => a.x + a.z - (b.x + b.z))
  const picks: string[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i * (sorted.length - 1)) / (count - 1))
    picks.push(sorted[index].id)
  }
  return picks
}

function firstEdgeAt(graph: TestHarnessGraph, vertexId: string): string {
  const edgeId = graph.vertexEdgeIds[vertexId]?.[0]
  if (!edgeId) throw new Error(`No edge found touching vertex ${vertexId}`)
  return edgeId
}

test('setup phase (4 settlements + roads) then a roll from each player', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const roomCode = await hostRoom(pageA)
    await joinRoom(pageB, 'Joiner', roomCode)
    await startWhenFull(pageA)
    await waitForGameStarted(pageA)
    await waitForGameStarted(pageB)
    await assertConnected(pageA, 'host')
    await assertConnected(pageB, 'joiner')

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())
    const [v1, v2, v3, v4] = pickSpreadVertices(graph, 4)
    const [e1, e2, e3, e4] = [v1, v2, v3, v4].map((v) => firstEdgeAt(graph, v))

    // Setup order for 2 players is [0, 1, 1, 0] — A, B, B, A — each a
    // settlement immediately followed by a road at the same vertex.
    const steps: ScenarioStep[] = [
      { actor: 'A', action: 'buildSettlement', args: [v1] },
      { actor: 'A', action: 'buildRoad', args: [e1] },
      { actor: 'B', action: 'buildSettlement', args: [v2] },
      { actor: 'B', action: 'buildRoad', args: [e2] },
      { actor: 'B', action: 'buildSettlement', args: [v3] },
      { actor: 'B', action: 'buildRoad', args: [e3] },
      { actor: 'A', action: 'buildSettlement', args: [v4] },
      { actor: 'A', action: 'buildRoad', args: [e4] },
      { actor: 'A', action: 'rollDice' },
      { actor: 'A', action: 'endTurn' },
      { actor: 'B', action: 'rollDice' },
      { actor: 'B', action: 'endTurn' },
    ]

    await runScenario(pageA, pageB, steps)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
```

- [ ] **Step 2: Confirm `.env.test.local` exists**

Verify: `cat catan-3d/.env.test.local` shows real (non-placeholder) `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` values, per this plan's Prerequisite section. If missing, stop here and complete the spec's "Test-project setup" steps first — the rest of this task cannot run without it.

- [ ] **Step 3: Run it**

Run: `cd catan-3d && npm run test:multiplayer`
Expected: 1 passed. If it fails on the startup connection check (Global Constraints), re-verify `.env.test.local`. If it fails on a convergence timeout or a rejected-action error, that's the harness doing its job — read the reported diff/warning and treat it as a real bug report, per the spec's "default assumption is real bug, not assertion too strict."

- [ ] **Step 4: Commit**

```bash
git add catan-3d/tests/multiplayer/scenarios/base-game.spec.ts catan-3d/src/testHarness.ts catan-3d/src/App.tsx
git commit -m "test: add setup-phase multiplayer sync scenario"
```

---

### Follow-up (not in this plan): dev-card purchase scenario

Once Task 5 is passing reliably, the highest-value next scenario is specifically the one that would have caught the dev-card deck composition bug: both players buying a dev card in the same game. That needs `pickSpreadVertices` (above) replaced with biome-aware selection — extend `getGraph()` (or add a sibling `getTiles: () => { id: string; biome: string }[]`, mirroring `HexTileData`) so the scenario can pick each player's *second* setup settlement adjacent to ore/grain/wool tiles specifically, guaranteeing `buyDevCard` is affordable immediately after setup rather than depending on lucky dice rolls across many turns. This is real, scoped work for a follow-up plan — not folded into this one to keep Task 5 achievable and deterministic.

---

## Explicitly not in this plan

Matches the spec's own scope boundary. Natural follow-up plans, once Task 5 is passing reliably, in roughly this order:

1. **The dev-card purchase scenario** (see the follow-up note under Task 5) — biome-aware settlement placement so `buyDevCard` is deterministically affordable, directly exercising the sync path the original bug lived in.
2. The Cities & Knights progress-card scenario, the Seafarers ship scenario, and the barbarian-attack scenario (spec's "First scenarios to ship," item 2).

Randomized fuzzing and CI integration are explicitly out of scope per the spec.
