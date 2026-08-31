// catan-3d/tests/multiplayer/scenarios/invention-play.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, callHarnessAction } from '../scenarioHelpers'
import type { TestHarnessGraph } from '../../../src/testHarness'

// No progress-card scenario has ever PLAYED a card before this one — only
// drawn one (progress-card-draw.spec.ts). Invention is the highest-priority
// card to cover first: its effect (2 tile numbers swapped) lives in App.tsx's
// `tiles`, a plain useState array entirely OUTSIDE the GameState reducer
// tree, synced only by its own broadcast (broadcastInventionSwapped /
// onInventionSwapped) — the same "independently recomputed per client"
// shape that caused the two real desync bugs this harness already caught
// (dev-card and progress-card deck desyncs), and the one card whose sync
// this test suite's normal getState()-based convergence check structurally
// cannot see at all.
//
// grantProgressCard (merged separately, PR #80) skips the random draw
// entirely — no catch-up loop needed here, this scenario just needs the
// game past setup and into 'playing' phase before playing the card.
test('host plays Invention and swaps two tile numbers', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const roomCode = await hostRoom(pageA, { citiesAndKnights: true })
    await joinRoom(pageB, 'Joiner', roomCode)
    await startWhenFull(pageA)
    await waitForGameStarted(pageA)
    await waitForGameStarted(pageB)
    await assertConnected(pageA, 'host')
    await assertConnected(pageB, 'joiner')

    // Only need progress cards enabled — not knights/barbarians, same
    // reasoning as progress-card-draw.spec.ts's identical setGameRules call.
    // The real lobby only exposes one combined C&K toggle; this scenario
    // has no use for knights or barbarian attacks, and a stray attack could
    // only ever add irrelevant noise here (no city is ever built).
    await pageA.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false, citiesAndKnightsBarbarians: false }),
    )
    await pageB.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false, citiesAndKnightsBarbarians: false }),
    )

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())
    // No resource target to fund (grantProgressCard bypasses the economy
    // entirely) — an arbitrary spread is enough, same as base-game.spec.ts.
    const [v1, v2, v3, v4] = pickSpreadVertices(graph, 4)
    const [e1, e2, e3, e4] = [v1, v2, v3, v4].map((v) => firstEdgeAt(graph, v))

    // Starting seat is randomized per room (App.tsx:326-328) — read it
    // rather than assuming the host always goes first.
    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'

    const setupSteps: ScenarioStep[] = [
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'buildRoad', args: [e1] },
      { actor: other, action: 'buildSettlement', args: [v2] },
      { actor: other, action: 'buildRoad', args: [e2] },
      { actor: other, action: 'buildSettlement', args: [v3] },
      { actor: other, action: 'buildRoad', args: [e3] },
      { actor: starter, action: 'buildSettlement', args: [v4] },
      { actor: starter, action: 'buildRoad', args: [e4] },
    ]
    await runScenario(pageA, pageB, setupSteps)

    // Playing a progress card needs no prior dice roll (canPlayProgressCardNow
    // only checks gamePhase === 'playing', confirmed by reading App.tsx) — the
    // setup-completing road placement already lands the game there, on
    // starter's own first real turn.
    //
    // grantProgressCard (progressCards[]) and playInvention (dispatches
    // PROGRESS_CARD_SPENT) both mutate real GameState, so runScenario's
    // normal getState()-based convergence check applies to both.
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantProgressCard', args: ['invention'] },
      { actor: starter, action: 'playInvention' },
    ])

    // Two distinct, swappable tiles — same constraint handleInventionTileSelect
    // itself enforces (a number tile, not 2/6/8/12). Standard Catan boards
    // have DUPLICATE number tokens (two 5s, two 6s, etc.) — picking the
    // first two swappable tiles in array order without checking their
    // numbers actually differ could silently pick two same-numbered tiles,
    // making the swap a no-op and this assertion pass even if the sync were
    // completely broken (CodeRabbit review, PR #81).
    const swappable = graph.tiles.filter((t) => t.number != null && ![2, 6, 8, 12].includes(t.number))
    if (swappable.length < 2) throw new Error('Board has fewer than 2 swappable number tiles — cannot run this scenario')
    const tileA = swappable[0]
    const tileB = swappable.find((t) => t.id !== tileA.id && t.number !== tileA.number)
    if (!tileB) throw new Error('No second swappable tile with a different number than tileA — cannot verify a real swap')

    const starterPage = starter === 'A' ? pageA : pageB
    const otherPage = starter === 'A' ? pageB : pageA

    // Bypasses runScenario deliberately — see BypassAction's own comment in
    // scenarioHelpers.ts for why: the swap itself never touches GameState,
    // only App.tsx's local `tiles` array and its own broadcast, so the
    // normal convergence check would wait the full timeout for a GameState
    // change that can never come, then throw a false "no observable change."
    await callHarnessAction(starterPage, 'selectInventionTile', [tileA.id])
    await callHarnessAction(starterPage, 'selectInventionTile', [tileB.id])

    // This IS the actual point of this scenario: getGraph().tiles is the one
    // place a desync here would ever be observable, invisible to every other
    // convergence check in this suite. Polls the RECEIVING page (starter's
    // own page applies the swap locally and synchronously; `other` only
    // gets it via the broadcast, real network time away).
    const numberOf = (tiles: TestHarnessGraph['tiles'], id: string) => tiles.find((t) => t.id === id)?.number
    const deadline = Date.now() + 8_000
    let otherGraph = await otherPage.evaluate(() => window.__catanTestHarness!.getGraph())
    while (
      (numberOf(otherGraph.tiles, tileA.id) !== tileB.number || numberOf(otherGraph.tiles, tileB.id) !== tileA.number) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      otherGraph = await otherPage.evaluate(() => window.__catanTestHarness!.getGraph())
    }

    const starterGraph = await starterPage.evaluate(() => window.__catanTestHarness!.getGraph())
    expect(numberOf(starterGraph.tiles, tileA.id), 'starter page: tile A should now show tile B\'s original number').toBe(
      tileB.number,
    )
    expect(numberOf(starterGraph.tiles, tileB.id), 'starter page: tile B should now show tile A\'s original number').toBe(
      tileA.number,
    )
    expect(numberOf(otherGraph.tiles, tileA.id), 'other page did not converge on tile A\'s swapped number').toBe(
      tileB.number,
    )
    expect(numberOf(otherGraph.tiles, tileB.id), 'other page did not converge on tile B\'s swapped number').toBe(
      tileA.number,
    )
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
