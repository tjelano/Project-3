// catan-3d/tests/multiplayer/scenarios/disconnect-reconnect.spec.ts
import { expect, test, type WebSocketRoute } from '@playwright/test'
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
const RECONNECT_TIMEOUT_MS = 30_000
const RESYNC_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 500

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
// byte-identical to playersBefore, as if the grant never happened.
async function waitForPlayersChange(page: Parameters<typeof waitForGameStarted>[0], awayFrom: unknown, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  let players = await getPlayers(page)
  while (JSON.stringify(players) === JSON.stringify(awayFrom) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    players = await getPlayers(page)
  }
  return players
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
  const routeRef: { current: WebSocketRoute | null } = { current: null }
  await pageB.routeWebSocket('**/realtime/v1/websocket**', (ws) => {
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

    routeRef.current?.close()
    await waitForConnectionStatus(pageB, 'error', DISCONNECT_TIMEOUT_MS)

    // While B is offline, A (host) makes a real, observable state change.
    // grantResources normally broadcasts and converges (runScenario), but
    // it's called directly here (runAction, no convergence wait) --  B
    // genuinely cannot receive this broadcast while offline, so waiting
    // for it would just time out.
    await runAction(pageA, 'grantResources', [{ lumber: 3 }])
    const playersAfterGrant = await waitForPlayersChange(pageA, playersBefore)
    expect(playersAfterGrant, 'the grant should have actually changed something on A').not.toEqual(playersBefore)

    // Give A's autosave effect + its network upsert time to actually land
    // before B reconnects and tries to pull it.
    await pageA.waitForTimeout(3_000)

    // B's own client retries on CHANNEL_ERROR on its own -- nothing to
    // trigger manually here, just wait for it to land.
    await waitForConnectionStatus(pageB, 'connected', RECONNECT_TIMEOUT_MS)

    // hasEverConnectedRef's resync effect (App.tsx) should now fire: B
    // fetches the last saved snapshot and fully re-hydrates from it,
    // healing the divergence created while it was offline.
    const deadline = Date.now() + RESYNC_TIMEOUT_MS
    let playersB = await getPlayers(pageB)
    while (Date.now() < deadline && JSON.stringify(playersB) !== JSON.stringify(playersAfterGrant)) {
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
