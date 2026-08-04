import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CatanBoard } from './components/CatanBoard'
import { SceneRig } from './components/SceneRig'
import { BoardFrame } from './components/BoardFrame'
import { CanvasErrorBoundary } from './components/CanvasErrorBoundary'
import { Ocean } from './components/Ocean'
import { BoardInteractions } from './components/BoardInteractions'
import { RobberLayer } from './components/RobberLayer'
import { PortMarkers } from './components/PortMarkers'
import { Dice3D, type DiceRollTarget } from './components/Dice3D'
import { PlayerHand3D } from './components/PlayerHand3D'
import { GameHud } from './components/hud/GameHud'
import { StartScreen, type GameStartInfo } from './components/hud/StartScreen'
import type { PendingTrade } from './components/hud/TradeOfferPrompt'
import { useRoomChannel, type RoomPlayer } from './multiplayer/useRoomChannel'
import { buildHexBoard } from './data/hexBoard'
import { assignPorts, buildBoardGraph, buildVertexAdjacency } from './data/boardGraph'
import {
  BIOME_LABELS,
  BIOME_TO_RESOURCE,
  CITY_COST,
  DEV_CARD_COST,
  DEV_CARD_SINGULAR,
  LARGEST_ARMY_MIN_KNIGHTS,
  LONGEST_ROAD_MIN_LENGTH,
  RESOURCE_LABELS,
  RESOURCE_ORDER,
  ROAD_COST,
  SETTLEMENT_COST,
  WINNING_SCORE,
  buildDevCardDeck,
  buildSetupOrder,
  canAfford,
  createInitialPlayers,
  deductCost,
  discardRandomHalf,
  getPlayerScore,
  removeOne,
  shuffle,
  totalResourceCount,
  type Building,
  type DevCardType,
  type Player,
  type ResourceType,
} from './game/types'
import { calculateLongestRoad, pickTrophyHolder } from './game/trophies'

export type GamePhase = 'setup' | 'playing' | 'moveRobber'
export type SetupStage = 'settlement' | 'road'
export type DevCardPickerMode = 'yearOfPlenty' | 'monopoly'
export interface BannerMessage {
  text: string
  variant: 'info' | 'warning'
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1
}

function App() {
  const [gameStarted, setGameStarted] = useState(false)
  const [playerCount, setPlayerCount] = useState(3)
  // Kept at the App level (not just inside StartScreen's local state) so a
  // mid-session "Play Again" / "Return to Menu" reshuffles the board without
  // wiping the names players just typed in.
  const [playerNames, setPlayerNames] = useState<string[]>([])
  // Non-null only for Online Multiplayer matches. localPlayerId is a
  // Player.id (1-based), resolved once from the roster order at game start.
  // Restarting or returning to menu clears this — there's no mechanism here
  // to re-coordinate a rematch across separate browsers, so both flows drop
  // back to a local-style reset rather than silently half-syncing.
  const [onlineInfo, setOnlineInfo] = useState<{
    roomCode: string
    localPlayerId: number
    localPlayerName: string
  } | null>(null)

  const [tiles, setTiles] = useState(() => buildHexBoard())
  const tileById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])
  const graph = useMemo(() => buildBoardGraph(tiles), [tiles])
  const vertexAdjacency = useMemo(() => buildVertexAdjacency(graph.edges), [graph.edges])
  const edgeById = useMemo(() => new Map(graph.edges.map((edge) => [edge.id, edge])), [graph.edges])
  const ports = useMemo(() => assignPorts(graph), [graph])
  const setupOrder = useMemo(() => buildSetupOrder(playerCount), [playerCount])

  const [players, setPlayers] = useState(() => createInitialPlayers(3))
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [lastRoll, setLastRoll] = useState<number | null>(null)
  const [settlements, setSettlements] = useState<Record<string, Building>>({})
  const [roads, setRoads] = useState<Record<string, number>>({})
  const [banner, setBanner] = useState<BannerMessage | null>(null)
  const [diceRoll, setDiceRoll] = useState<DiceRollTarget | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [devDeck, setDevDeck] = useState<DevCardType[]>(() => shuffle(buildDevCardDeck()))
  const [winner, setWinner] = useState<Player | null>(null)
  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null)
  // True while the active moveRobber phase came from playing a Knight card
  // rather than a natural 7 roll — a Knight doesn't end the player's turn.
  const [robberMoveFromKnight, setRobberMoveFromKnight] = useState(false)
  const [freeRoadsRemaining, setFreeRoadsRemaining] = useState(0)
  const [devCardPicker, setDevCardPicker] = useState<DevCardPickerMode | null>(null)
  const [longestRoadHolderId, setLongestRoadHolderId] = useState<number | null>(null)
  const [largestArmyHolderId, setLargestArmyHolderId] = useState<number | null>(null)

  const [gamePhase, setGamePhase] = useState<GamePhase>('setup')
  const [setupStepIndex, setSetupStepIndex] = useState(0)
  const [setupStage, setSetupStage] = useState<SetupStage>('settlement')
  // The settlement placed during the current setup step. The free road that
  // follows it must touch this exact intersection — that pairing is what
  // makes the opening draft a real strategic choice.
  const [setupSettlementVertexId, setSetupSettlementVertexId] = useState<string | null>(null)
  // Official rule: at most one development card may be PLAYED per turn
  // (buying is unlimited). Cleared by endTurn.
  const [devCardPlayedThisTurn, setDevCardPlayedThisTurn] = useState(false)
  /**
   * Bumped by every reset. Used as a React key on the interaction layer.
   *
   * Board geometry is deterministic — tile ids are `col-row` and vertex ids
   * come from rounded coordinates — so a new game produces the IDENTICAL set
   * of keys. React therefore reconciles the existing slot components instead
   * of remounting them, and each slot's local `hovered` flag survives the
   * reset, leaving ghost buildings stranded on the board until the pointer
   * happens to cross them again. Changing this key forces a clean remount.
   */
  const [boardInstance, setBoardInstance] = useState(0)

  // A lost WebGL context (GPU driver reset, VRAM pressure, tab backgrounded
  // too long) does not throw — CanvasErrorBoundary can't catch it, and
  // three's default recovery doesn't reliably re-run onBeforeCompile shader
  // injections. Bumping this key forces a full Canvas remount, which is the
  // one recovery path guaranteed to reinitialize every custom shader and
  // GPU resource from scratch instead of leaving a permanently black canvas.
  const [canvasInstance, setCanvasInstance] = useState(0)

  const [robberTileId, setRobberTileId] = useState(() => tiles.find((tile) => tile.biome === 'desert')!.id)

  const warn = (text: string) => {
    console.warn(`[Catan] ${text}`)
    setBanner({ text, variant: 'warning' })
  }

  const inform = (text: string) => setBanner({ text, variant: 'info' })

  // How many of this card type the player can play right now — total held
  // minus however many of that type they bought this same turn.
  const playableDevCardCount = (player: Player, type: DevCardType): number => {
    const total = player.devCards.filter((card) => card === type).length
    const boughtThisTurn = player.devCardsBoughtThisTurn.filter((card) => card === type).length
    return total - boughtThisTurn
  }

  // State mutation for passing the turn, factored out of endTurn() so both
  // the acting client (endTurn, below, which also broadcasts) and receiving
  // clients (onTurnPassed, right after) apply the IDENTICAL effect — the
  // receiving side must never re-broadcast, or every client would echo
  // TURN_PASSED back out and the count would multiply per round-trip.
  const applyTurnAdvance = (nextIndex: number) => {
    setFreeRoadsRemaining(0)
    setDevCardPlayedThisTurn(false)
    setPlayers((prev) => prev.map((p, index) => (index === nextIndex ? { ...p, devCardsBoughtThisTurn: [] } : p)))
    setCurrentPlayerIndex(nextIndex)
  }

  // Shared by a local Roll Dice click AND by mirroring another player's
  // DICE_ROLLED broadcast — both just need the 3D dice to animate toward
  // the same (d1, d2), after which handleDiceSettled/applyRollResult below
  // runs identically regardless of which client actually rolled.
  const beginDiceAnimation = (d1: number, d2: number) => {
    setIsRolling(true)
    setDiceRoll((prev) => ({ d1, d2, rollId: (prev?.rollId ?? 0) + 1 }))
  }

  // Reference-stable across renders that don't change it — useRoomChannel
  // depends on this object directly (see OnlineSetup.tsx for why). Safe to
  // key on the onlineInfo object itself (rather than its individual fields,
  // as OnlineSetup.tsx must): onlineInfo already only gets a new reference
  // when resetGame() actually calls setOnlineInfo, not on every render.
  const roomSelf: RoomPlayer | null = useMemo(
    () => (onlineInfo ? { name: onlineInfo.localPlayerName, isHost: false } : null),
    [onlineInfo],
  )

  // A SEPARATE subscription from the lobby's (OnlineSetup unmounts, taking
  // its channel with it, the instant gameStarted flips true) — both bind to
  // the identical `room:<code>` topic, so this one picks up the match right
  // where the lobby left off. Presence/roster tracking is incidental here;
  // what this phase actually needs is the two broadcast listeners.
  const { broadcastDiceRolled, broadcastTurnPassed } = useRoomChannel(onlineInfo?.roomCode ?? null, roomSelf, {
    onDiceRolled: (payload) => beginDiceAnimation(payload.dice[0], payload.dice[1]),
    onTurnPassed: (payload) => applyTurnAdvance(payload.nextPlayerIndex),
  })

  // Local (non-online) games are always "your turn" — whoever is at the
  // keyboard controls whichever player is active, same as it always has.
  const isMyTurn = !onlineInfo || players[currentPlayerIndex]?.id === onlineInfo.localPlayerId

  // The single place a turn passes to the next player: clears any unused
  // free roads (a Road Building card's free placements don't carry over) and
  // resets the incoming player's "bought this turn" dev card tracking. Only
  // the player whose turn is actually ending broadcasts — every OTHER
  // client's own endTurn() call (triggered by mirroring the same dice roll
  // or robber move) fires too, but currentPlayerIndex won't match their own
  // seat at that moment, so the guard below naturally silences them.
  const endTurn = () => {
    const nextIndex = (currentPlayerIndex + 1) % players.length
    applyTurnAdvance(nextIndex)
    if (onlineInfo && players[currentPlayerIndex]?.id === onlineInfo.localPlayerId) {
      broadcastTurnPassed({ nextPlayerIndex: nextIndex })
    }
  }

  // Recomputed whenever roads/settlements change — cheap given how few
  // roads a player ever has (max 15), so a plain per-player DFS is fine.
  const longestRoadLengths = useMemo(() => {
    const lengths = new Map<number, number>()
    for (const player of players) {
      lengths.set(player.id, calculateLongestRoad(player.id, roads, graph, settlements))
    }
    return lengths
  }, [players, roads, graph, settlements])

  const knightCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const player of players) counts.set(player.id, player.knightsPlayed)
    return counts
  }, [players])

  // Longest Road and Largest Army transfer the instant another player
  // strictly exceeds the current holder — a tie leaves the incumbent in
  // place. See pickTrophyHolder for the exact rule.
  useEffect(() => {
    setLongestRoadHolderId((prev) => pickTrophyHolder(prev, longestRoadLengths, LONGEST_ROAD_MIN_LENGTH))
  }, [longestRoadLengths])

  useEffect(() => {
    setLargestArmyHolderId((prev) => pickTrophyHolder(prev, knightCounts, LARGEST_ARMY_MIN_KNIGHTS))
  }, [knightCounts])

  // The moment any player's score reaches the win threshold, halt the game.
  useEffect(() => {
    if (winner || !gameStarted) return
    const found = players.find(
      (p) => getPlayerScore(p, settlements, longestRoadHolderId, largestArmyHolderId) >= WINNING_SCORE,
    )
    if (found) setWinner(found)
  }, [players, settlements, winner, gameStarted, longestRoadHolderId, largestArmyHolderId])

  // Does this player have a road touching the given intersection? Used for
  // both road and settlement connectivity checks.
  const hasPlayerRoadAt = (vertexId: string, playerId: number): boolean => {
    const edgeIds = graph.vertexEdgeIds.get(vertexId) ?? []
    return edgeIds.some((edgeId) => roads[edgeId] === playerId)
  }

  const isRoadPlacementConnected = (edgeId: string, playerId: number): boolean => {
    const edge = edgeById.get(edgeId)
    if (!edge) return false
    if (settlements[edge.a]?.ownerId === playerId || settlements[edge.b]?.ownerId === playerId) return true
    return hasPlayerRoadAt(edge.a, playerId) || hasPlayerRoadAt(edge.b, playerId)
  }

  // Best available bank-trade rate for giving away this resource: 2:1 if the
  // player owns that resource's specific port, else 3:1 if they own any
  // generic port, else the standard 4:1.
  const getPortRate = (playerId: number, resource: ResourceType): number => {
    let hasGenericPort = false
    for (const port of ports) {
      const ownsPort = port.vertexIds.some((vertexId) => settlements[vertexId]?.ownerId === playerId)
      if (!ownsPort) continue
      if (port.type === resource) return 2
      if (port.type === '3:1') hasGenericPort = true
    }
    return hasGenericPort ? 3 : 4
  }

  // Awards 1 of each resource a vertex's touching hexes produce — used to
  // kickstart a player's hand when they place their second setup settlement.
  const grantResourcesForVertex = (vertexId: string, ownerId: number) => {
    const tileIds = graph.vertexTileIds.get(vertexId) ?? []
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== ownerId) return p
        const resources = { ...p.resources }
        for (const tileId of tileIds) {
          const tile = tileById.get(tileId)
          const resource = tile && BIOME_TO_RESOURCE[tile.biome]
          if (resource) resources[resource] += 1
        }
        return { ...p, resources }
      }),
    )
  }

  const buildSettlement = (vertexId: string) => {
    if (winner) return
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return
    }
    const player = players[currentPlayerIndex]
    const isSetup = gamePhase === 'setup'
    const existing = settlements[vertexId]

    if (isRolling) {
      warn('Wait for the dice to finish rolling.')
      return
    }
    if (gamePhase === 'moveRobber') {
      warn('Move the Robber before building.')
      return
    }
    if (isSetup && setupStage !== 'settlement') {
      warn('Place your road first.')
      return
    }

    if (existing) {
      // Occupied — either someone else's building, an already-upgraded city,
      // or (only outside setup) our own settlement ready to become a city.
      if (isSetup || existing.ownerId !== player.id) {
        warn('That intersection is already occupied.')
        return
      }
      if (existing.type === 'city') {
        warn('This is already a City.')
        return
      }
      if (player.citiesRemaining <= 0) {
        warn('You have no cities left to place.')
        return
      }
      if (!canAfford(player.resources, CITY_COST)) {
        warn('Not enough resources for a city.')
        return
      }

      setSettlements((prev) => ({
        ...prev,
        [vertexId]: { ownerId: player.id, type: 'city' },
      }))
      setPlayers((prev) =>
        prev.map((p, index) =>
          index === currentPlayerIndex
            ? {
                ...p,
                resources: deductCost(p.resources, CITY_COST),
                settlementsRemaining: p.settlementsRemaining + 1,
                citiesRemaining: p.citiesRemaining - 1,
              }
            : p,
        ),
      )
      return
    }

    if (!isSetup && !hasPlayerRoadAt(vertexId, player.id)) {
      warn('Settlements must be built on your road network!')
      return
    }
    const neighbors = vertexAdjacency.get(vertexId) ?? []
    if (neighbors.some((neighborId) => settlements[neighborId] != null)) {
      warn('Too close to another settlement.')
      return
    }
    if (player.settlementsRemaining <= 0) {
      warn('You have no settlements left to place.')
      return
    }
    if (!isSetup && !canAfford(player.resources, SETTLEMENT_COST)) {
      warn('Not enough resources for a settlement.')
      return
    }

    setSettlements((prev) => ({
      ...prev,
      [vertexId]: { ownerId: player.id, type: 'settlement' },
    }))
    setPlayers((prev) =>
      prev.map((p, index) =>
        index === currentPlayerIndex
          ? {
              ...p,
              resources: isSetup ? p.resources : deductCost(p.resources, SETTLEMENT_COST),
              settlementsRemaining: p.settlementsRemaining - 1,
            }
          : p,
      ),
    )

    if (isSetup) {
      const isSecondRound = setupStepIndex >= setupOrder.length / 2
      if (isSecondRound) {
        grantResourcesForVertex(vertexId, player.id)
      }
      setSetupSettlementVertexId(vertexId)
      setSetupStage('road')
    }
  }

  const buildRoad = (edgeId: string) => {
    if (winner) return
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return
    }
    const player = players[currentPlayerIndex]
    const isSetup = gamePhase === 'setup'
    const isFreeRoad = !isSetup && freeRoadsRemaining > 0

    if (isRolling) {
      warn('Wait for the dice to finish rolling.')
      return
    }
    if (gamePhase === 'moveRobber') {
      warn('Move the Robber before building.')
      return
    }
    if (isSetup && setupStage !== 'road') {
      warn('Place your settlement first.')
      return
    }
    if (roads[edgeId] != null) {
      warn('That road is already occupied.')
      return
    }
    if (isSetup) {
      // The free setup road is bound to the settlement placed a moment ago,
      // not to the player's network at large — otherwise the opening draft
      // loses its meaning and players could seed disconnected fragments to
      // farm Longest Road later.
      const edge = edgeById.get(edgeId)
      const touchesNewSettlement =
        edge != null &&
        setupSettlementVertexId != null &&
        (edge.a === setupSettlementVertexId || edge.b === setupSettlementVertexId)
      if (!touchesNewSettlement) {
        warn('Your road must connect to the settlement you just placed!')
        return
      }
    } else if (!isRoadPlacementConnected(edgeId, player.id)) {
      warn('Road must connect to your existing structures.')
      return
    }
    if (player.roadsRemaining <= 0) {
      warn('You have no roads left to place.')
      return
    }
    if (!isSetup && !isFreeRoad && !canAfford(player.resources, ROAD_COST)) {
      warn('Not enough resources for a road.')
      return
    }

    setRoads((prev) => ({ ...prev, [edgeId]: player.id }))
    setPlayers((prev) =>
      prev.map((p, index) =>
        index === currentPlayerIndex
          ? {
              ...p,
              resources: isSetup || isFreeRoad ? p.resources : deductCost(p.resources, ROAD_COST),
              roadsRemaining: p.roadsRemaining - 1,
            }
          : p,
      ),
    )
    if (isFreeRoad) {
      setFreeRoadsRemaining((prev) => prev - 1)
    }

    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      // This step's settlement/road pairing is complete — don't let the
      // vertex linger into the next step.
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        setGamePhase('playing')
        setCurrentPlayerIndex(0)
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        setCurrentPlayerIndex(setupOrder[nextStepIndex])
        setSetupStage('settlement')
      }
    }
  }

  // Triggered by the Roll Dice button: generates the total up front (it
  // stays authoritative) and hands it to the 3D dice to animate toward.
  // The actual game effects only run once the dice visually settle.
  const rollDice = () => {
    if (winner) return
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return
    }
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't roll right now.")
      return
    }
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }

    // Authoritative: this client's roll is what everyone else mirrors, so
    // it's generated and broadcast before this client's own animation even
    // starts — no round-trip wait to see your own dice move.
    const d1 = rollD6()
    const d2 = rollD6()
    if (onlineInfo) {
      broadcastDiceRolled({ dice: [d1, d2], total: d1 + d2, playerId: players[currentPlayerIndex].id })
    }
    beginDiceAnimation(d1, d2)
  }

  const applyRollResult = (total: number) => {
    setIsRolling(false)
    setLastRoll(total)

    if (total === 7) {
      const discardNotes: string[] = []
      setPlayers((prev) =>
        prev.map((p) => {
          if (totalResourceCount(p.resources) <= 7) return p
          const { resources, discarded } = discardRandomHalf(p.resources)
          discardNotes.push(`${p.name} discarded ${discarded}`)
          return { ...p, resources }
        }),
      )
      inform(
        discardNotes.length > 0
          ? `Rolled 7 — ${discardNotes.join(', ')}. Move the Robber.`
          : 'Rolled 7 — move the Robber.',
      )
      setGamePhase('moveRobber')
      return
    }

    const robberTile = tileById.get(robberTileId)
    const isBlocked = robberTile?.number === total
    const messages: string[] = []
    if (isBlocked && robberTile) {
      messages.push(`The Robber blocks ${BIOME_LABELS[robberTile.biome]} — no resources from that hex.`)
    }

    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p, resources: { ...p.resources } }))
      const byId = new Map(next.map((p) => [p.id, p]))

      for (const tile of tiles) {
        if (tile.number !== total) continue
        if (tile.id === robberTileId) continue // blocked by the Robber

        const resource = BIOME_TO_RESOURCE[tile.biome]
        if (!resource) continue

        const vertexIds = graph.tileVertexIds.get(tile.id) ?? []
        for (const vertexId of vertexIds) {
          const building = settlements[vertexId]
          if (!building) continue
          const owner = byId.get(building.ownerId)
          if (!owner) continue

          const amount = building.type === 'city' ? 2 : 1
          owner.resources[resource] += amount
          if (building.type === 'city') {
            messages.push(`${owner.name} city yields ${amount} ${RESOURCE_LABELS[resource]}!`)
          }
        }
      }

      return next
    })

    if (messages.length > 0) {
      inform(messages.join(' '))
    } else {
      setBanner(null)
    }

    endTurn()
  }

  const handleDiceSettled = () => {
    if (!diceRoll) return
    applyRollResult(diceRoll.d1 + diceRoll.d2)
  }

  const moveRobber = (tileId: string) => {
    if (winner) return
    if (gamePhase !== 'moveRobber') return
    if (tileId === robberTileId) {
      warn('The Robber must move to a new hex!')
      return
    }

    const tile = tileById.get(tileId)
    setRobberTileId(tileId)

    // Steal 1 random resource from a random opponent touching the new hex.
    const thief = players[currentPlayerIndex]
    const vertexIds = graph.tileVertexIds.get(tileId) ?? []
    const victimIds = new Set<number>()
    for (const vertexId of vertexIds) {
      const building = settlements[vertexId]
      if (building && building.ownerId !== thief.id) victimIds.add(building.ownerId)
    }

    let stealNote = ''
    if (victimIds.size > 0) {
      const candidates = [...victimIds]
      const victimId = candidates[Math.floor(Math.random() * candidates.length)]
      const victim = players.find((p) => p.id === victimId)

      if (victim) {
        const heldResources: ResourceType[] = []
        for (const resource of RESOURCE_ORDER) {
          for (let i = 0; i < victim.resources[resource]; i++) heldResources.push(resource)
        }

        if (heldResources.length > 0) {
          const stolen = heldResources[Math.floor(Math.random() * heldResources.length)]
          setPlayers((prev) =>
            prev.map((p) => {
              if (p.id === victim.id) {
                return {
                  ...p,
                  resources: {
                    ...p.resources,
                    [stolen]: p.resources[stolen] - 1,
                  },
                }
              }
              if (p.id === thief.id) {
                return {
                  ...p,
                  resources: {
                    ...p.resources,
                    [stolen]: p.resources[stolen] + 1,
                  },
                }
              }
              return p
            }),
          )
          stealNote = ` ${thief.name} stole 1 ${RESOURCE_LABELS[stolen]} from ${victim.name}!`
        } else {
          stealNote = ` ${victim.name} had nothing to steal.`
        }
      }
    }

    if (tile) inform(`The Robber moves to ${BIOME_LABELS[tile.biome]}.${stealNote}`)
    setGamePhase('playing')
    if (robberMoveFromKnight) {
      // A Knight card doesn't end the player's turn — they keep going.
      setRobberMoveFromKnight(false)
    } else {
      endTurn()
    }
  }

  const bankTrade = (give: ResourceType, receive: ResourceType) => {
    if (winner) return
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return
    }
    if (gamePhase !== 'playing') {
      warn("You can't trade right now.")
      return
    }
    if (give === receive) {
      warn('Pick two different resources to trade.')
      return
    }

    const player = players[currentPlayerIndex]
    const rate = getPortRate(player.id, give)
    if (player.resources[give] < rate) {
      warn(`Not enough ${RESOURCE_LABELS[give]} to trade.`)
      return
    }

    setPlayers((prev) =>
      prev.map((p, index) =>
        index === currentPlayerIndex
          ? {
              ...p,
              resources: {
                ...p.resources,
                [give]: p.resources[give] - rate,
                [receive]: p.resources[receive] + 1,
              },
            }
          : p,
      ),
    )
    inform(`${player.name} traded ${rate} ${RESOURCE_LABELS[give]} for 1 ${RESOURCE_LABELS[receive]}.`)
  }

  const proposePlayerTrade = (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => {
    if (winner) return
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return
    }
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't trade right now.")
      return
    }
    if (offerResource === wantResource) {
      warn('Pick two different resources to trade.')
      return
    }

    const fromPlayer = players[currentPlayerIndex]
    if (toPlayerId === fromPlayer.id) {
      warn('Pick a different player to trade with.')
      return
    }
    if (fromPlayer.resources[offerResource] < 1) {
      warn(`Not enough ${RESOURCE_LABELS[offerResource]} to offer.`)
      return
    }

    setPendingTrade({
      fromPlayerId: fromPlayer.id,
      toPlayerId,
      offerResource,
      wantResource,
    })
  }

  const resolvePlayerTrade = (accept: boolean) => {
    if (winner) return
    if (!pendingTrade) return
    const { fromPlayerId, toPlayerId, offerResource, wantResource } = pendingTrade
    const fromPlayer = players.find((p) => p.id === fromPlayerId)
    const toPlayer = players.find((p) => p.id === toPlayerId)
    setPendingTrade(null)
    if (!fromPlayer || !toPlayer) return

    if (!accept) {
      inform(`${toPlayer.name} declined the trade.`)
      return
    }
    if (toPlayer.resources[wantResource] < 1) {
      warn(`${toPlayer.name} can't afford that trade.`)
      return
    }
    if (fromPlayer.resources[offerResource] < 1) {
      warn(`${fromPlayer.name} no longer has enough ${RESOURCE_LABELS[offerResource]}.`)
      return
    }

    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === fromPlayerId) {
          return {
            ...p,
            resources: {
              ...p.resources,
              [offerResource]: p.resources[offerResource] - 1,
              [wantResource]: p.resources[wantResource] + 1,
            },
          }
        }
        if (p.id === toPlayerId) {
          return {
            ...p,
            resources: {
              ...p.resources,
              [wantResource]: p.resources[wantResource] - 1,
              [offerResource]: p.resources[offerResource] + 1,
            },
          }
        }
        return p
      }),
    )
    inform(
      `${fromPlayer.name} traded 1 ${RESOURCE_LABELS[offerResource]} for 1 ${RESOURCE_LABELS[wantResource]} with ${toPlayer.name}!`,
    )
  }

  const buyDevCard = () => {
    if (winner) return
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return
    }
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't buy a development card right now.")
      return
    }
    if (devDeck.length === 0) {
      warn('No development cards left.')
      return
    }

    const player = players[currentPlayerIndex]
    if (!canAfford(player.resources, DEV_CARD_COST)) {
      warn('Not enough resources for a development card.')
      return
    }

    const [card, ...remaining] = devDeck
    setDevDeck(remaining)
    setPlayers((prev) =>
      prev.map((p, index) =>
        index === currentPlayerIndex
          ? {
              ...p,
              resources: deductCost(p.resources, DEV_CARD_COST),
              devCards: [...p.devCards, card],
              devCardsBoughtThisTurn: [...p.devCardsBoughtThisTurn, card],
            }
          : p,
      ),
    )
    inform(`${player.name} bought a development card.`)
  }

  // Every "play a dev card" action shares the same preconditions, so they
  // live in one place — this is what let the one-card-per-turn rule go
  // missing from four separate handlers. Warns and returns false when the
  // play isn't legal right now.
  const canPlayDevCardNow = (type: DevCardType): boolean => {
    if (winner) return false
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return false
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return false
    }
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't play a development card right now.")
      return false
    }
    if (devCardPlayedThisTurn) {
      warn('You may only play one development card per turn.')
      return false
    }
    if (playableDevCardCount(players[currentPlayerIndex], type) <= 0) {
      warn(`No playable ${DEV_CARD_SINGULAR[type]} card.`)
      return false
    }
    return true
  }

  // Spends one card of the given type from the active player's hand and
  // marks the turn's single play as used.
  const spendDevCard = (type: DevCardType) => {
    setPlayers((prev) =>
      prev.map((p, index) =>
        index === currentPlayerIndex
          ? {
              ...p,
              devCards: removeOne(p.devCards, type),
              knightsPlayed: type === 'knight' ? p.knightsPlayed + 1 : p.knightsPlayed,
            }
          : p,
      ),
    )
    setDevCardPlayedThisTurn(true)
  }

  const playKnight = () => {
    if (!canPlayDevCardNow('knight')) return
    const player = players[currentPlayerIndex]

    spendDevCard('knight')
    setRobberMoveFromKnight(true)
    inform(`${player.name} played a Knight! Move the Robber.`)
    setGamePhase('moveRobber')
  }

  const playRoadBuilding = () => {
    if (!canPlayDevCardNow('roadBuilding')) return
    const player = players[currentPlayerIndex]

    spendDevCard('roadBuilding')
    setFreeRoadsRemaining(2)
    inform(`${player.name} played Road Building — place 2 free roads.`)
  }

  const playYearOfPlenty = () => {
    if (!canPlayDevCardNow('yearOfPlenty')) return

    spendDevCard('yearOfPlenty')
    setDevCardPicker('yearOfPlenty')
  }

  const playMonopoly = () => {
    if (!canPlayDevCardNow('monopoly')) return

    spendDevCard('monopoly')
    setDevCardPicker('monopoly')
  }

  const playDevCard = (type: DevCardType) => {
    if (type === 'knight') return playKnight()
    if (type === 'roadBuilding') return playRoadBuilding()
    if (type === 'yearOfPlenty') return playYearOfPlenty()
    if (type === 'monopoly') return playMonopoly()
  }

  // Resolves whichever picker is currently open (Year of Plenty or
  // Monopoly) with the resource(s) the player picked in the modal.
  const resolveDevCardPicker = (picks: ResourceType[]) => {
    const mode = devCardPicker
    setDevCardPicker(null)
    if (!mode) return

    const player = players[currentPlayerIndex]

    if (mode === 'yearOfPlenty') {
      setPlayers((prev) =>
        prev.map((p, index) => {
          if (index !== currentPlayerIndex) return p
          const resources = { ...p.resources }
          for (const resource of picks) resources[resource] += 1
          return { ...p, resources }
        }),
      )
      const summary = picks.map((resource) => RESOURCE_LABELS[resource]).join(' and ')
      inform(`${player.name} took ${summary} from the bank via Year of Plenty.`)
      return
    }

    const resource = picks[0]
    let seized = 0
    const victimNotes: string[] = []
    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p, resources: { ...p.resources } }))
      const byId = new Map(next.map((p) => [p.id, p]))
      const currentEntry = byId.get(player.id)!
      for (const p of next) {
        if (p.id === player.id) continue
        const amount = p.resources[resource]
        if (amount <= 0) continue
        victimNotes.push(`${amount} from ${p.name}`)
        seized += amount
        p.resources[resource] = 0
        currentEntry.resources[resource] += amount
      }
      return next
    })

    inform(
      seized > 0
        ? `${player.name} monopolized ${RESOURCE_LABELS[resource]} — seized ${seized} card${seized === 1 ? '' : 's'} (${victimNotes.join(', ')})!`
        : `${player.name} played Monopoly on ${RESOURCE_LABELS[resource]}, but no one had any.`,
    )
  }

  const currentPlayerPortRates = Object.fromEntries(
    RESOURCE_ORDER.map((resource) => [resource, getPortRate(players[currentPlayerIndex].id, resource)]),
  ) as Record<ResourceType, number>

  // Shared reset: reshuffles the board and dev deck once, deriving the new
  // Robber position from that exact same board shuffle so they can't desync.
  const resetGame = (count: number, names?: string[], online?: { roomCode: string; localPlayerName: string }) => {
    // Seeded by the room code for online matches, so every client's
    // independent buildHexBoard() call lands on the IDENTICAL tile layout —
    // without this, dice-roll totals could match perfectly while each
    // screen distributed resources from a completely different board. Local
    // Pass & Play omits the seed and keeps its original random board.
    const freshTiles = buildHexBoard(online?.roomCode)
    setTiles(freshTiles)
    setRobberTileId(freshTiles.find((tile) => tile.biome === 'desert')!.id)
    setPlayerCount(count)
    // Explicit names (a fresh Start Game submission) replace what's
    // remembered; omitting the argument (restart / return-to-menu) reuses
    // whatever was last entered, so those flows don't reset names to defaults.
    const resolvedNames = names ?? playerNames
    if (names) setPlayerNames(names)
    setPlayers(createInitialPlayers(count, resolvedNames))
    // createInitialPlayers assigns ids in `resolvedNames` order (1-based),
    // so this is the one place a client learns "which seat am I" — every
    // client built its players array from the identical names array, so the
    // mapping is guaranteed consistent without any further coordination.
    // Restart / return-to-menu (no `online` arg) intentionally drops any
    // online session rather than half-syncing a rematch nothing here
    // actually coordinates across the other browsers.
    setOnlineInfo(
      online
        ? {
            roomCode: online.roomCode,
            localPlayerId: resolvedNames.indexOf(online.localPlayerName) + 1,
            localPlayerName: online.localPlayerName,
          }
        : null,
    )
    setCurrentPlayerIndex(0)
    setLastRoll(null)
    setSettlements({})
    setRoads({})
    setBanner(null)
    setDevDeck(shuffle(buildDevCardDeck()))
    setWinner(null)
    setPendingTrade(null)
    setRobberMoveFromKnight(false)
    setFreeRoadsRemaining(0)
    setDevCardPicker(null)
    setDevCardPlayedThisTurn(false)
    setBoardInstance((n) => n + 1)
    setLongestRoadHolderId(null)
    setLargestArmyHolderId(null)
    setGamePhase('setup')
    setSetupStepIndex(0)
    setSetupStage('settlement')
    setSetupSettlementVertexId(null)
  }

  const startGame = (info: GameStartInfo) => {
    resetGame(info.playerCount, info.names, info.online)
    setGameStarted(true)
  }

  const restartGame = () => {
    resetGame(playerCount)
  }

  // Distinct from restartGame: fully exits the current match back to the
  // pre-game player-count picker, rather than reshuffling in place.
  const returnToMenu = () => {
    resetGame(playerCount)
    setGameStarted(false)
  }

  if (!gameStarted) {
    return (
      <div className="relative h-screen w-screen bg-board-navy">
        <StartScreen onStart={startGame} />
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen bg-board-navy">
      <CanvasErrorBoundary>
        <Canvas
          key={canvasInstance}
          shadows={{ type: THREE.VSMShadowMap }}
          camera={{ position: [0, 9, 7], fov: 50 }}
          // high-performance + failIfMajorPerformanceCaveat: false stop
          // Chromium-family browsers (Brave in particular runs a stricter
          // GPU-process budget than stock Chrome) from silently refusing a
          // hardware-accelerated context — or handing back a software one —
          // when they judge this scene "too heavy". antialias is explicit
          // rather than left to the default so the choice is visible here.
          gl={{ powerPreference: 'high-performance', antialias: true, failIfMajorPerformanceCaveat: false }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement
            // A lost context does not throw — it fires this DOM event.
            // preventDefault() is required, or Chromium abandons the
            // context permanently instead of allowing the restore below.
            canvas.addEventListener('webglcontextlost', (event) => {
              event.preventDefault()
              console.error('[Catan] WebGL context lost — attempting recovery.')
            })
            canvas.addEventListener('webglcontextrestored', () => {
              console.warn('[Catan] WebGL context restored — remounting the scene.')
              setCanvasInstance((n) => n + 1)
            })
          }}
        >
          <color attach="background" args={['#070c16']} />
          <SceneRig />
          <BoardFrame />
          <Ocean />
          <CatanBoard tiles={tiles} />
          <BoardInteractions
            key={boardInstance}
            graph={graph}
            settlements={settlements}
            roads={roads}
            players={players}
            onBuildSettlement={buildSettlement}
            onBuildRoad={buildRoad}
            // Building/road placement isn't broadcast to other clients in
            // this phase — locking it for whoever doesn't hold the turn
            // stops a non-active online player from placing something only
            // their own screen would ever see, not real network sync.
            locked={!!winner || !isMyTurn}
          />
          <RobberLayer
            tiles={tiles}
            robberTileId={robberTileId}
            isMovingRobber={gamePhase === 'moveRobber' && !winner && isMyTurn}
            onMoveRobber={moveRobber}
          />
          <PortMarkers ports={ports} />
          <Dice3D roll={diceRoll} onSettled={handleDiceSettled} />
          {/* The active player's hand, held at the bottom of the viewport. */}
          <PlayerHand3D
            resources={players[currentPlayerIndex].resources}
            devCards={players[currentPlayerIndex].devCards}
          />
          {/* Constrained so the camera can never drop below the horizon (which
            exposed the underside of the board and the backfaces of every
            token), fly past the island, or dolly through geometry. Damping
            is what makes the orbit feel weighted rather than twitchy. */}
          <OrbitControls
            target={[0, 0, 0]}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.35}
            minDistance={6}
            maxDistance={18}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
          />
        </Canvas>
      </CanvasErrorBoundary>

      <GameHud
        players={players}
        currentPlayerIndex={currentPlayerIndex}
        isMyTurn={isMyTurn}
        lastRoll={lastRoll}
        onRollDice={rollDice}
        gamePhase={gamePhase}
        setupStage={setupStage}
        banner={banner}
        onRestart={restartGame}
        portRates={currentPlayerPortRates}
        onTrade={bankTrade}
        isRolling={isRolling}
        devDeckCount={devDeck.length}
        onBuyDevCard={buyDevCard}
        winner={winner}
        settlements={settlements}
        onReturnToMenu={returnToMenu}
        pendingTrade={pendingTrade}
        onProposeTrade={proposePlayerTrade}
        onResolveTrade={resolvePlayerTrade}
        onPlayDevCard={playDevCard}
        devCardPicker={devCardPicker}
        onResolveDevCardPicker={resolveDevCardPicker}
        devCardPlayedThisTurn={devCardPlayedThisTurn}
        longestRoadHolderId={longestRoadHolderId}
        longestRoadLengths={longestRoadLengths}
        largestArmyHolderId={largestArmyHolderId}
      />
    </div>
  )
}

export default App
