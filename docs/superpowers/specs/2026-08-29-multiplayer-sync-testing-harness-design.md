# Multiplayer Sync Testing Harness

## Summary

A bot that drives two real, independently-mounted instances of the app through a scripted Catan game over a real Supabase Realtime connection, and asserts their `GameState` stays converged after every action. Built to catch actor/receiver broadcast divergence bugs before real players do, and to double as an automated playtesting tool. Queued since early in this project's multiplayer work; never built until now.

**In scope:** the harness itself (test hook, scenario runner, convergence/rejection assertions), a dedicated test Supabase project, and a first scenario set covering base game + one scenario each for Cities & Knights and Seafarers.

**Explicitly out of scope:** randomized fuzzing (a possible follow-up once the scripted-scenario runner is proven; the core "apply action → assert converged" primitive is designed so a fuzzer could reuse it later without a rewrite), CI integration (this ships as a local `npm run` script first — CI wiring is a separate, later task), and reconnect/disconnect mid-game scenarios (not excluded on principle, just not in the first scenario set).

## Why not reimplement the sync logic instead

The real dispatch → broadcast wiring (`dispatchGameAction`, `App.tsx`) is a closure inside the mounted `App` component, not an exported function. A harness that reimplements this logic in a standalone Node script (mirroring `testNetworkSync.ts`'s existing raw-protocol approach) would carry real drift risk: if `App.tsx`'s actual dispatch/broadcast logic changes and the harness's copy isn't updated to match, the harness would keep passing while the real game silently breaks — the worst failure mode for a correctness tool, since it produces false confidence instead of no confidence.

Chosen instead: two real, separately-mounted app instances (real browser tabs, real Supabase broadcast), driven through a thin test-only hook that calls the *same* functions the real UI already calls. Zero duplicated logic — a real bug fix in the source just makes the harness pass, with no harness-side change needed.

## Architecture

Both browser tabs run against `vite --mode test`, reading a new `catan-3d/.env.test.local` (gitignored, same treatment as `.env.local`) pointing at a dedicated test Supabase project — no code changes needed in `App.tsx`/`supabaseClient.ts`, since `import.meta.env.VITE_SUPABASE_*` already resolves however Vite's mode system says it should.

Two separate Playwright **browser contexts** (not two tabs sharing one context) — each gets its own page, matching how two genuinely different real users would connect. `clientId` is already `crypto.randomUUID()`-generated per mount (not derived from any shared storage), so this isn't strictly required for correctness today, but it removes any future footgun if that ever changes.

**Two distinct driving mechanisms, for two distinct phases:**

- **Pre-game lobby setup (one-time per run): real UI navigation.** Room creation, reading the room code, joining, and the House Rules/Seafarers toggles all happen in `GameSetupMenu.tsx`/`RoomLobby.tsx` — components that render *instead of* `App`'s main tree while `gameStarted` is still false. The test hook (below) is mounted inside `App()`, so it structurally cannot see any of this; there's no way to hook it without adding a second, earlier hook to a different component tree. Simplest fix: drive this part the same way it was already exercised manually via Playwright earlier in this project — fill the name/room-code fields, click Host/Join/Start, read the room code via the existing "Show room code" reveal + `.room-code-font` selector. This is a *one-time* sequence per scenario run, not the repeated per-action stream the test hook (below) exists to avoid clicking through — using real UI here doesn't undercut that reasoning.
- **In-game actions (dozens per scenario): the test hook**, once both tabs report `gameStarted`.

**What's actually been proven vs. what hasn't.** The UI navigation above (buttons found, forms filled, room code read) was confirmed working manually earlier in this project. What was *not* confirmed: the underlying Realtime connection completing end-to-end — it failed at `CHANNEL_ERROR`/DNS resolution (this dev environment's placeholder Supabase credentials) before presence could ever sync between the two tabs. That both tabs actually converge once pointed at a real backend is this design's hypothesis, not something already proven — it's exactly what the dedicated test project is for.

**Startup sanity check:** before running any scenario, the runner confirms both tabs' `connectionStatus` (already tracked in `App.tsx` today, reused here — not new detection logic) reads `'connected'`. If `.env.test.local` is missing or wrong, this fails immediately with a clear "can't connect to test Supabase project" message — not a mysterious timeout on the first scenario that looks like a convergence bug but is actually a setup problem.

## Test hook

A small, permanent, test-only object exposed as `window.__catanTestHarness`, gated by `import.meta.env.MODE === 'test'`. Since `MODE` is statically known at build time, Vite/Rolldown dead-code-eliminates this whole branch from a real production build — not just runtime-inert, actually absent from the shipped bundle.

```ts
window.__catanTestHarness = {
  actions: {
    buildSettlement: (vertexId: string) => void,
    buildRoad: (edgeId: string) => void,
    buildShip: (edgeId: string) => void,
    rollDice: () => void,
    buyDevCard: () => void,
    playDevCard: (card: DevCardType, ...args) => void,
    // ...one entry per real player-facing action, each a thin pass-through
    // to the existing raw-action function already defined in App.tsx
  },
  getState: () => GameState,
  getStatus: () => { gameStarted: boolean; isMyTurn: boolean; connectionStatus: string },
  getLastWarning: () => string | null,
}
```

Each `actions.*` entry calls the function App.tsx already defines for that action (`buildSettlementRaw`, `buildRoadRaw`, etc.) — no new game logic, only exposure of what already exists.

**Implementation note:** the object must be assigned via a `useEffect` placed *before* `App()`'s `if (!gameStarted) return` early return. Placing it after silently breaks the hook once `gameStarted` flips true ("Rendered more hooks than during the previous render") — this exact mistake was made and fixed twice earlier in this project's own debug-hook usage; worth not re-learning here.

**Rejection detection:** `getLastWarning()` is cleared immediately before the hook dispatches any action, then set if that action calls `warn(...)` instead of applying (wrong turn, insufficient resources, etc.). The runner checks it after every scripted step — a non-null warning fails that step immediately with the warning text, rather than silently treating a no-op as a pass (both tabs would still "converge" on unchanged state, which a naive convergence check alone would call success).

## Scenario format

A scenario is a name plus an ordered list of steps, each naming which tab acts and what it does:

```ts
scenario('base game: settlement, road, roll, trade, dev card', [
  { actor: 'A', action: (h) => h.actions.buildSettlement('V1') },
  { actor: 'A', action: (h) => h.actions.buildRoad('E1') },
  { actor: 'B', action: (h) => h.actions.rollDice() },
  // ...
])
```

Every scenario must include actions from **both** actors, not just one — broadcast bugs can be asymmetric (a handler wired correctly for one role and not the other), and a host-only scenario would only ever test one direction of sync.

## Convergence & assertions

After each step: poll both tabs' state (not a fixed sleep — this project already learned that lesson the hard way from headless-Chromium GPU stalls) at ~200ms intervals, up to a 15s bound, until they match or time out. A timeout fails the step with a diff of exactly which fields still disagree.

**Not a blind full-`GameState` deep-equal.** `decks.devDeck` and each `decks.progressCardDecks[track]` are compared by length only, never contents — their exact remaining order is never shown to any player and is allowed to differ by design (this is what the accompanying bug fix, see below, made *safe* to rely on: composition is now correct even though order isn't guaranteed to match). Every other field (`board`, `players`, `turn`, `progress`, `trophies`, `pendingQueues`, `trade`) is a full deep-equal.

**Principle for any new divergence found later:** default assumption is *real bug*, not *assertion too strict*. `decks` only earned the length-only treatment after tracing through why its contents are genuinely allowed to differ (see the dev-card deck composition fix committed alongside this harness's early design work). Loosening the assertion for a newly-discovered diverging field should come with that same kind of reasoning each time, never just "make the red go away."

## Test-project setup (one-time, manual)

1. New free-tier Supabase project, dedicated to this harness.
2. Run the existing `catan-3d/supabase/match_snapshots.sql` against it unchanged — identical schema to production, so there's nothing test-specific to drift out of sync.
3. Enable Realtime (broadcast + presence) on the project.
4. Add `catan-3d/.env.test.local` with that project's `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.

Not addressed in this pass, worth revisiting if it becomes a problem: the test project's `match_snapshots` table will accumulate rows over repeated runs. Manual or scripted cleanup can be added later without affecting anything else in this design.

## Running it

Playwright is added as a real `catan-3d` devDependency (it has only been available this session as an incidental side effect of an unrelated global npm package — fine for one-off scripts, not something to build permanent infrastructure on). A new `playwright.config.ts` auto-starts `vite --mode test` as its `webServer`. Invoked via a new `npm run test:multiplayer` script.

Output: pass/fail per scenario. On failure, either a field-by-field state diff (convergence timeout) or the exact warning text (rejected action) — enough to know which step broke and how, without needing to re-run with extra logging.

## First scenarios to ship

Deliberately small, to prove the whole pipeline end-to-end before expanding:

1. **Base game only** — settlement, road, roll, bank trade, buy dev card, end turn, with actions from both actors. This alone would have caught the dev-card deck composition bug.
2. Once (1) is solid: a Cities & Knights progress-card draw + play, a Seafarers ship build, and a barbarian attack resolution — the highest-interaction-risk areas, matching the original reasoning for prioritizing this harness over other production-readiness work.
