// catan-3d/tests/multiplayer/scenarios/disconnect-reconnect.spec.ts
import { expect, test, type WebSocketRoute } from '@playwright/test'
import { deepStrictEqual } from 'node:assert'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runAction } from '../harness'

// Regression guard for the hasEverConnectedRef resync effect (App.tsx) --
// a dropped-then-restored Realtime connection used to leave whatever was
// broadcast during the outage gone for good, with the reconnected client's
// local state silently diverging from everyone else's for the rest of the
// match. The fix re-fetches the last saved snapshot and fully re-hydrates
// from it once connectionStatus returns to 'connected' (but only for a
// GENUINE reconnect, not the very first connect -- see hasEverConnectedRef's
// own comment for why that distinction matters). This was previously
// relying on flaking back into view organically rather than being directly
// tested -- this scenario simulates the drop deliberately instead.
//
// context().setOffline() does NOT work for this: confirmed live (a
// throwaway spike) that it leaves an already-open WebSocket connection
// completely undisturbed -- connectionStatus stayed 'connected' for a full
// 30s under it, since CDP-level offline emulation blocks new requests, not
// an established socket's existing traffic. routeWebSocket (Playwright
// 1.48+) is the real mechanism: it hands back a live handle to the actual
// connection, which can be force-closed with .close() on demand while
// transparently proxying the rest of the time -- confirmed live that this
// triggers the app's real CHANNEL_ERROR path within the same render, and
// that Supabase's own client auto-reconnects a few seconds later (hitting
// this same route handler again for the fresh connection).
const DISCONNECT_TIMEOUT_MS = 20_000
const SAVE_TIMEOUT_MS = 20_000
const SAVE_POLL_ATTEMPT_TIMEOUT_MS = 5_000
const RECONNECT_TIMEOUT_MS = 30_000
const RESYNC_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 500

// Order-independent value equality -- state read via getState() and a
// snapshot read via getSavedSnapshot() are built by two different code
// paths (live reducer state vs. a persisted/restored copy) and can have
// the SAME values in different key insertion order, which a naive
// JSON.stringify() comparison treats as a mismatch. Caught live: a
// snapshot poll kept "failing" against byte-identical data (confirmed by
// logging both sides) purely because of this.
function isDeepEqual(a: unknown, b: unknown): boolean {
  try {
    deepStrictEqual(a, b)
    return true
  } catch {
    return false
  }
}

async function waitForConnectionStatus(
  page: Parameters<typeof waitForGameStarted>[0],
  status: 'connecting' | 'connected' | 'error',
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => window.__catanTestHarness!.getStatus().connectionStatus)
    if (current === status) return
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`connectionStatus never reached '${status}' within ${timeoutMs}ms`)
}

async function getPlayers(page: Parameters<typeof waitForGameStarted>[0]) {
  return (await page.evaluate(() => window.__catanTestHarness!.getState())).players
}

// A dispatch inside page.evaluate() isn't necessarily visible via getState()
// the instant that evaluate() call resolves (same batching lag documented
// at length in harness.ts/scenarioHelpers.ts) -- a single immediate read
// right after runAction caught this exact race live: players came back
// identical to playersBefore, as if the grant never happened.
//
// Throws on timeout (CodeRabbit review, PR #111) rather than silently
// returning the unchanged value -- matches every sibling wait helper in
// this file, and means a real regression here fails with a specific,
// actionable message instead of relying on a separate assertion at the
// call site to catch it secondhand.
async function waitForPlayersChange(
  page: Parameters<typeof waitForGameStarted>[0],
  awayFrom: unknown,
  timeoutMs = 8_000,
) {
  const deadline = Date.now() + timeoutMs
  let players = await getPlayers(page)
  while (isDeepEqual(players, awayFrom) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    players = await getPlayers(page)
  }
  if (isDeepEqual(players, awayFrom)) {
    throw new Error(`players never changed within ${timeoutMs}ms`)
  }
  return players
}

// Deterministic replacement for a fixed wait (CodeRabbit review, PR #111):
// polls the ACTUAL persisted snapshot (getSavedSnapshot reads straight from
// Supabase, same path App.tsx's own resync effect uses) until it reflects
// the grant, instead of guessing how long A's autosave + upsert take. A
// fixed wait is exactly the class of assumption this suite has been burned
// by before under real network variance (see lobby.ts's waitForGameStarted
// timeout history) -- worse here, since too-short a guess wouldn't just be
// slow, it'd let B reconnect and resync from a STALE snapshot, silently
// proving nothing.
//
// Each poll attempt races against its own short timeout (CodeRabbit review)
// -- getSavedSnapshot triggers a real Supabase network request, unlike
// every other page.evaluate() in this file (plain synchronous property
// reads, which can't hang). Without this, one stalled request would block
// inside a single await past the outer deadline entirely, since the while
// loop only re-checks the deadline BETWEEN iterations.
async function waitForSavedSnapshot(
  page: Parameters<typeof waitForGameStarted>[0],
  roomCode: string,
  expectedPlayers: unknown,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await Promise.race([
      page.evaluate((code) => window.__catanTestHarness!.getSavedSnapshot(code), roomCode),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SAVE_POLL_ATTEMPT_TIMEOUT_MS)),
    ])
    if (snapshot && isDeepEqual(snapshot.players, expectedPlayers)) return
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`saved snapshot never reflected the grant within ${timeoutMs}ms`)
}

test('a dropped-then-restored connection resyncs from the last saved snapshot', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  // Must be registered before B ever navigates -- routeWebSocket only
  // intercepts connections established AFTER it's set up. An object wrapper,
  // not a bare `let` -- TS's control-flow narrowing gets confused by a `let`
  // reassigned only inside a closure (mis-narrows a later `currentRoute?.close()`
  // to `never`); a property read isn't subject to the same analysis.
  //
  // reconnectGate (CodeRabbit review, PR #111): Supabase's client retries
  // its OWN reconnect on a backoff schedule as soon as the socket closes,
  // independent of and concurrent with this test's own save-confirmation
  // poll below -- nothing previously stopped B from reconnecting (and its
  // hasEverConnectedRef resync effect firing) before A's snapshot save had
  // actually landed, which would make the test pass without having proven
  // anything. Blocking new connections here until the test explicitly
  // flips the gate makes that ordering structural instead of coincidental.
  const routeRef: { current: WebSocketRoute | null } = { current: null }
  const reconnectGate = { allowed: true }
  await pageB.routeWebSocket('**/realtime/v1/websocket**', async (ws) => {
    while (!reconnectGate.allowed) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    routeRef.current = ws
    ws.connectToServer()
  })

  try {
    const roomCode = await hostRoom(pageA)
    await joinRoom(pageB, 'Joiner', roomCode)
    await startWhenFull(pageA)
    await waitForGameStarted(pageA)
    await waitForGameStarted(pageB)
    await assertConnected(pageA, 'host')
    await assertConnected(pageB, 'joiner')

    // A is always the host here (hostRoom) -- App.tsx's autosave effect is
    // isEffectiveHost-only, so the state change below has to happen on A
    // for a snapshot to actually get persisted for B to resync from.
    const playersBefore = await getPlayers(pageA)

    reconnectGate.allowed = false
    routeRef.current?.close()
    await waitForConnectionStatus(pageB, 'error', DISCONNECT_TIMEOUT_MS)

    // While B is offline, A (host) makes a real, observable state change.
    // grantResources normally broadcasts and converges (runScenario), but
    // it's called directly here (runAction, no convergence wait) --  B
    // genuinely cannot receive this broadcast while offline, so waiting
    // for it would just time out.
    await runAction(pageA, 'grantResources', [{ lumber: 3 }])
    const playersAfterGrant = await waitForPlayersChange(pageA, playersBefore)

    // Confirm the save has ACTUALLY landed before letting B reconnect --
    // not a guessed wait (see waitForSavedSnapshot's own comment for why).
    await waitForSavedSnapshot(pageA, roomCode, playersAfterGrant, SAVE_TIMEOUT_MS)

    // Only NOW let B's client reconnect -- see reconnectGate's own comment.
    reconnectGate.allowed = true
    await waitForConnectionStatus(pageB, 'connected', RECONNECT_TIMEOUT_MS)

    // hasEverConnectedRef's resync effect (App.tsx) should now fire: B
    // fetches the last saved snapshot and fully re-hydrates from it,
    // healing the divergence created while it was offline.
    const deadline = Date.now() + RESYNC_TIMEOUT_MS
    let playersB = await getPlayers(pageB)
    while (Date.now() < deadline && !isDeepEqual(playersB, playersAfterGrant)) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      playersB = await getPlayers(pageB)
    }

    expect(playersB, "B should have resynced to A's state after reconnecting, not stayed stale").toEqual(
      playersAfterGrant,
    )
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
