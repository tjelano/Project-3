// Bare side-effect import, no bindings: pulls testHarness.ts's `declare
// global` augmentation (for `window.__catanTestHarness`'s type) into this
// tsconfig's compilation. Load-bearing, not dead code — removing it makes
// every `window.__catanTestHarness` reference below fail to typecheck.
import '../../src/testHarness'
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
  // Without this, base-game.spec.ts's rollDice steps are ~1-in-6 flaky: a
  // 7 rolled with nobody over the card limit sends gamePhase to
  // 'chooseRobberOrPirate' (App.tsx), which the scenario's fixed step list
  // doesn't handle. The scenario only ever rolls twice, and this house
  // rule (DEFAULT_GAME_RULES.noSevensFirstTwoRolls is false) exists
  // specifically to suppress 7s on exactly the first two rolls of a game.
  // House Rules is its own tab (defaults to Expansions) — GameSetupMenu.tsx's
  // activeTab state — not always-visible content, so it must be selected
  // before the checkbox exists in the DOM.
  await page.getByRole('button', { name: 'House Rules' }).click()
  // force: true — HouseRules.tsx renders the real <input type="checkbox">
  // as sr-only (visually hidden; a separate ToggleSwitch component is the
  // visible affordance), so Playwright's default actionability check
  // (which requires visibility) would otherwise hang waiting for a
  // visibility change that's never coming, until the whole test times out.
  await page.getByLabel('No 7s on first 2 rolls').check({ force: true })
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
  // waitForFunction's real signature is (pageFunction, arg, options) — arg
  // is required (or explicitly undefined) for options to land in the right
  // slot. Omitting it, as an earlier version of this code did, silently
  // matches the (pageFunction, arg?: any, options?) overload instead: the
  // { timeout } object gets bound to `arg` (ignored, since this function
  // takes no parameters) and options stays undefined, so the intended
  // timeout was NEVER applied — Playwright fell back to its own default,
  // masking this as unpredictable slowness with no timeout error to show
  // for it. 90s (not the originally-guessed 20s): with the fix actually
  // applying, a live run measured this genuinely taking up to ~50s — every
  // browser context here is a fresh, uncached profile (Playwright starts
  // one per run) hitting a cold dev server for the first time, unlike a
  // real player's warm, cached browser.
  await page.waitForFunction(() => window.__catanTestHarness?.getStatus().gameStarted === true, undefined, {
    timeout: 90_000,
  })
}

// Fails fast with a clear, specific message if the test Supabase project
// isn't actually reachable — e.g. .env.test.local missing or wrong —
// rather than letting the first scenario step time out (CONVERGENCE_TIMEOUT_MS
// in harness.ts) in a way that looks like a convergence bug but is
// actually a setup problem.
export async function assertConnected(page: Page, label: string): Promise<void> {
  try {
    // See waitForGameStarted's comment — arg must be passed explicitly (or
    // this timeout silently never applies). 45s, sized the same way: a
    // live run measured this taking up to ~28s once the fix actually
    // applied its timeout.
    await page.waitForFunction(
      () => window.__catanTestHarness?.getStatus().connectionStatus === 'connected',
      undefined,
      { timeout: 45_000 },
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
