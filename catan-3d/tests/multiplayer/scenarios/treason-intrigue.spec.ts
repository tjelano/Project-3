// catan-3d/tests/multiplayer/scenarios/treason-intrigue.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, secondEdgeAt, neighborsOf, pickSpreadVertices, resolvePostRollObligations, callHarnessAction } from '../scenarioHelpers'
import { KNIGHT_RECRUIT_COST, ROAD_COST } from '../../../src/game/types'

// Tier 2a — the last two progress cards that needed Displace (PR #93) before
// they were reachable at all: both target/relocate an OPPONENT'S knight, the
// same reachableOpponentKnights BFS Displace itself uses. Reuses the exact
// close-topology construction knight-displace.spec.ts already proved out
// (v1 --e1-- knightVertexA --e2-- targetVertex --e3-- v2), rather than
// re-deriving a new board shape — Intrigue's own eligibility check
// (intrigueDisplaceTargets, App.tsx) is ownRoadAdjacency-based exactly like
// Displace's, just with NO strength filter and origins drawn from ANY of the
// acting player's own buildings/knights, not a single mover.
//
// Unlike Displace, `starter` never needs to recruit a knight of their own —
// Intrigue's origins are settlements too, so v1 (starter's own setup
// settlement) plus starter's own e1+e2 roads is enough reachability on its
// own. That leaves knightVertexA free for Treason's replacement placement
// later, no extra construction needed for it either.
test('Intrigue displaces a reachable knight and Treason removes+replaces one, both converging', async ({ browser }) => {
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

    await pageA.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: false }))
    await pageB.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: false }))

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())

    const [v1, v3, v4] = pickSpreadVertices(graph, 3)
    const e1 = firstEdgeAt(graph, v1)
    const e1Edge = graph.edges.find((e) => e.id === e1)!
    const knightVertexA = e1Edge.a === v1 ? e1Edge.b : e1Edge.a
    const e2 = secondEdgeAt(graph, knightVertexA, e1)
    const e2Edge = graph.edges.find((e) => e.id === e2)!
    const targetVertex = e2Edge.a === knightVertexA ? e2Edge.b : e2Edge.a
    const e3 = secondEdgeAt(graph, targetVertex, e2)
    const e3Edge = graph.edges.find((e) => e.id === e3)!
    const v2 = e3Edge.a === targetVertex ? e3Edge.b : e3Edge.a

    // Same board-topology edge case knight-displace.spec.ts already
    // accepted as a loud, documented failure rather than a silent wrong
    // result — v2 is the one vertex not chosen via pickSpreadVertices' own
    // wide-separation guarantee.
    if (neighborsOf(graph, v1).includes(v2)) {
      throw new Error('treason-intrigue.spec.ts: v2 landed adjacent to v1 on this board — cannot build a legal setup')
    }

    const e4 = firstEdgeAt(graph, v3)
    const e5 = firstEdgeAt(graph, v4)

    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'
    const otherPage = starter === 'A' ? pageB : pageA

    const setupSteps: ScenarioStep[] = [
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'buildRoad', args: [e1] },
      { actor: other, action: 'buildSettlement', args: [v2] },
      { actor: other, action: 'buildRoad', args: [e3] },
      { actor: other, action: 'buildSettlement', args: [v3] },
      { actor: other, action: 'buildRoad', args: [e4] },
      { actor: starter, action: 'buildSettlement', args: [v4] },
      { actor: starter, action: 'buildRoad', args: [e5] },
    ]
    await runScenario(pageA, pageB, setupSteps)

    const stateAfterSetup = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = stateAfterSetup.players[stateAfterSetup.turn.currentPlayerIndex].id
    const otherId = stateAfterSetup.players.find((p) => p.id !== starterId)!.id

    // --- Starter's turn: extend the road network past knightVertexA to
    // targetVertex, giving starter Intrigue-reachability without ever
    // recruiting a knight of their own.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [ROAD_COST] },
      { actor: starter, action: 'buildRoad', args: [e2] },
      { actor: starter, action: 'endTurn' },
    ])

    // --- Other's turn: recruit at targetVertex, using their own SETUP road
    // (e3) — same "no extra construction needed" property
    // knight-displace.spec.ts's identical topology already established.
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(otherPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: other, action: 'selectKnightVertex', args: [targetVertex] }])

    const afterFirstRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const otherKnight1Id = afterFirstRecruit.players.find((p) => p.id === otherId)!.knightPieces[0].id
    const otherSupplyAfterFirstRecruit = afterFirstRecruit.players.find((p) => p.id === otherId)!.knightSupply.basic
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])

    // --- Starter's turn: Intrigue. playIntrigue only spends the card and
    // arms local-only pendingIntrigueDisplace (not part of GameState), so
    // it needs no BypassAction treatment — GameState converges fully via
    // its own PROGRESS_CARD_SPENT broadcast. selectDisplaceTarget (already
    // exposed for ordinary Displace) resolves it: same handleKnightSelect
    // function, pendingIntrigueDisplace branch checked first. A real roll
    // is still needed before endTurn (hasRolledThisTurn), even though
    // canPlayProgressCardNow itself has no such requirement.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantProgressCard', args: ['intrigue'] }])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'playIntrigue' }])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectDisplaceTarget', args: [otherKnight1Id] }])

    const afterIntrigue = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const otherAfterIntrigue = afterIntrigue.players.find((p) => p.id === otherId)!
    expect(otherAfterIntrigue.knightPieces, 'Intrigue should remove the only reachable knight (nowhere on its own network to go)').toHaveLength(0)
    expect(otherAfterIntrigue.knightSupply.basic, "the displaced knight's strength should return to its owner's supply").toBe(
      otherSupplyAfterFirstRecruit + 1,
    )
    expect(
      afterIntrigue.players.find((p) => p.id === starterId)!.progressCards,
      'Intrigue should be spent off the announcer\'s hand',
    ).not.toContain('intrigue')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    // --- Other's turn: recruit a SECOND knight at the now-empty
    // targetVertex, for Treason to remove.
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(otherPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: other, action: 'selectKnightVertex', args: [targetVertex] }])
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])

    // --- Starter's turn: Treason. playTreason removes the target's
    // deterministically-weakest knight (App.tsx picks it, not the caller —
    // there's only one, so no ambiguity here) immediately, no arm/resolve
    // split for the removal itself; since starter can afford a same-or-
    // lower-strength replacement (full knightSupply, never spent), it arms
    // pendingTreasonPlacement, resolved via the already-exposed
    // selectKnightVertex (handleKnightVertexSelect's pendingTreasonPlacement
    // branch, checked before its ordinary recruit body) at knightVertexA —
    // left empty this whole scenario specifically so it's available now.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    const beforeTreason = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterSupplyBeforeTreason = beforeTreason.players.find((p) => p.id === starterId)!.knightSupply.basic

    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantProgressCard', args: ['treason'] }])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'playTreason', args: [otherId] }])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [knightVertexA] }])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    const finalOther = finalStateA.players.find((p) => p.id === otherId)!
    const finalStarter = finalStateA.players.find((p) => p.id === starterId)!

    expect(finalOther.knightPieces, "Treason should remove the target's only knight").toHaveLength(0)
    expect(finalOther.knightSupply.basic, "the removed knight's strength should return to the target's supply").toBe(
      otherSupplyAfterFirstRecruit + 1,
    )
    expect(finalStarter.progressCards, "Treason should be spent off the announcer's hand").not.toContain('treason')
    const replacement = finalStarter.knightPieces.find((k) => k.vertexId === knightVertexA)
    expect(replacement, "Treason's free replacement knight should exist at the acting player's chosen vertex").toBeDefined()
    expect(replacement!.strength, 'the replacement matches the removed knight\'s strength (basic)').toBe('basic')
    expect(replacement!.active, 'a fresh replacement knight starts inactive, same as an ordinary recruit').toBe(false)
    expect(finalStarter.knightSupply.basic, "the free replacement still spends from the announcer's OWN supply (isFree only skips resource cost)").toBe(
      starterSupplyBeforeTreason - 1,
    )
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
