import '../setup'
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
