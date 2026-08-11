import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { PhysicsDice3D, type PhysicsRollTarget } from './components/PhysicsDice3D'
import { PlayerHand3D, TableSeatHands } from './components/PlayerHand3D'
import { GameHud } from './components/hud/GameHud'
import { StartScreen, type GameStartInfo } from './components/hud/StartScreen'
import type { PendingTrade } from './components/hud/TradeOfferPrompt'
import { useRoomChannel, type RoomPlayer } from './multiplayer/useRoomChannel'
import { saveMatchSnapshot, type MatchSnapshot } from './multiplayer/matchSnapshot'
import { normalizePlayerName } from './multiplayer/roomCode'
import { buildHexBoard } from './data/hexBoard'
import { playSfx } from './audio/sfx'
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

export type GamePhase = 'setup' | 'playing' | 'discard' | 'moveRobber'
export type SetupStage = 'settlement' | 'road'
export type DevCardPickerMode = 'yearOfPlenty' | 'monopoly'
export interface BannerMessage {
  text: string
  variant: 'info' | 'warning'
}

// Matches a (re)joining player's typed name back to their original seat by
// index. A plain `Array.indexOf` requires an exact character-for-character
// match — trailing whitespace from a mobile keyboard, or a different case,
// silently fails it, resolving to index -1 and therefore localPlayerId 0 (no
// such player), which permanently locks that player out of their own turn
// with no error shown.
function findPlayerIndexByName(names: string[], name: string): number {
  const normalized = normalizePlayerName(name)
  return names.findIndex((candidate) => normalizePlayerName(candidate) === normalized)
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
    // Re-derived from the snapshot on every reconnect (localPlayerName ===
    // snapshot.hostName), not assumed from whether this browser used the
    // Host or Join UI flow THIS time — a reloaded host rejoins through
    // Join like anyone else, and still needs to be recognized as host so
    // autosaving doesn't silently stop the moment they refresh the page.
    isHost: boolean
  } | null>(null)

  const [tiles, setTiles] = useState(() => buildHexBoard())
  const tileById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])
  const graph = useMemo(() => buildBoardGraph(tiles), [tiles])
  const vertexAdjacency = useMemo(() => buildVertexAdjacency(graph.edges), [graph.edges])
  const edgeById = useMemo(() => new Map(graph.edges.map((edge) => [edge.id, edge])), [graph.edges])
  const ports = useMemo(() => assignPorts(graph), [graph])
  const setupOrder = useMemo(() => buildSetupOrder(playerCount), [playerCount])

  const [players, setPlayers] = useState(() => createInitialPlayers(3))
  // O(1) lookup map for players to avoid O(N) array finds in frequent game loops/callbacks.
  // Expected performance impact: ~5x faster lookup vs Array.find for typical 3-4 player sizes.
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [lastRoll, setLastRoll] = useState<number | null>(null)
  const [settlements, setSettlements] = useState<Record<string, Building>>({})
  const [roads, setRoads] = useState<Record<string, number>>({})
  const [banner, setBanner] = useState<BannerMessage | null>(null)
  const [diceRoll, setDiceRoll] = useState<DiceRollTarget | null>(null)
  const [physicsRoll, setPhysicsRoll] = useState<PhysicsRollTarget | null>(null)
  // Which dice component is mounted: 'physics' for the player who's actually
  // rolling (real Rapier simulation, outcome not known until it settles) and
  // 'remote' for everyone else, watching another player's already-decided
  // result play out via Dice3D's closed-form tumble. Defaults to 'physics'
  // since that's correct for local Pass & Play (always the roller's own
  // screen) and for an online player who hasn't seen anyone roll yet.
  const [diceDisplayMode, setDiceDisplayMode] = useState<'physics' | 'remote'>('physics')
  const [isRolling, setIsRolling] = useState(false)
  const [devDeck, setDevDeck] = useState<DevCardType[]>(() => shuffle(buildDevCardDeck()))
  const [winner, setWinner] = useState<Player | null>(null)
  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null)
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
  // Whether the CURRENT player has already rolled this turn. Drives the
  // Roll Dice button's morph into an End Turn button — turn advancement is
  // now ONLY ever triggered by that explicit button click, never by dice
  // physics settling or a robber move resolving. Reset by applyTurnAdvance.
  const [hasRolledThisTurn, setHasRolledThisTurn] = useState(false)
  // Player IDs still owing a discard after a 7-roll (holding more than 7
  // cards). Non-empty while gamePhase is 'discard'; moveRobber only opens
  // once every over-limit player has confirmed. Fully derivable from
  // `players`' resource counts, so it's never persisted in a match snapshot
  // — restoreFromSnapshot just recomputes it if a reconnect lands mid-discard.
  const [discardPlayerIds, setDiscardPlayerIds] = useState<number[]>([])
  // Card-instance ids (see PlayerHand3D's buildCardSlots) the CURRENTLY
  // discarding player has flagged in their 3D hand. Local UI state, reset
  // whenever the active discarder changes.
  const [discardSelection, setDiscardSelection] = useState<string[]>([])
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

  const canPerformAction = (): boolean => {
    if (winner) return false
    if (pendingTrade) {
      warn('Resolve the pending trade first.')
      return false
    }
    if (devCardPicker) {
      warn('Resolve the development card first.')
      return false
    }
    return true
  }

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
    setHasRolledThisTurn(false)
    setPlayers((prev) => prev.map((p, index) => (index === nextIndex ? { ...p, devCardsBoughtThisTurn: [] } : p)))
    setCurrentPlayerIndex(nextIndex)
    // Personal cue, like turnEnd — this function runs on EVERY client (the
    // local actor's own endTurn() and every receiver's onTurnPassed), so an
    // unconditional playSfx here meant the player who just clicked End Turn
    // heard their own turnEnd immediately followed by this turnStart (their
    // own call chain), and in online play every OTHER player also heard a
    // turnStart for a turn that wasn't becoming theirs. Only the player
    // whose turn this new index actually belongs to should hear it; local
    // Pass & Play has no "whose screen" distinction, so it always plays.
    if (!onlineInfo || players[nextIndex]?.id === onlineInfo.localPlayerId) {
      playSfx('turnStart')
    }
  }

  // Shared by a local Roll Dice click AND by mirroring another player's
  // DICE_ROLLED broadcast — both just need the 3D dice to animate toward
  // the same (d1, d2), after which handleDiceSettled/applyRollResult below
  // runs identically regardless of which client actually rolled.
  const beginDiceAnimation = (d1: number, d2: number) => {
    setIsRolling(true)
    playSfx('diceRoll')
    setDiceRoll((prev) => ({ d1, d2, rollId: (prev?.rollId ?? 0) + 1 }))
  }

  // --- Structural placement mutations --------------------------------
  // Trusted state mutations, no validation — shared by the local guarded
  // handlers further down (buildSettlement, buildRoad, moveRobber, called
  // only after their own guards pass) AND by the on*Built/onRobberMoved
  // network handlers right below, which apply an already-validated remote
  // action directly and must never re-run local validation against it.
  //
  // These reference grantResourcesForVertex, hasPlayerRoadAt, etc. before
  // those functions' own declarations further down the file — safe, since
  // none of these run until called from an event handler, by which point
  // the whole component body (and every const in it) has finished
  // initializing. Order of declaration among sibling function expressions
  // in the same scope doesn't affect when they're safe to CALL.
  const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean) => {
    setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: playerId, type: 'settlement' } }))
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
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
      if (isSecondRound) grantResourcesForVertex(vertexId, playerId)
      setSetupSettlementVertexId(vertexId)
      setSetupStage('road')
    }
    playSfx('placement')
  }

  const applyCityPlacement = (vertexId: string, playerId: number) => {
    setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: playerId, type: 'city' } }))
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              resources: deductCost(p.resources, CITY_COST),
              settlementsRemaining: p.settlementsRemaining + 1,
              citiesRemaining: p.citiesRemaining - 1,
            }
          : p,
      ),
    )
    playSfx('placement')
  }

  const applyRoadPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeRoad: boolean) => {
    setRoads((prev) => ({ ...prev, [edgeId]: playerId }))
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              resources: isSetup || isFreeRoad ? p.resources : deductCost(p.resources, ROAD_COST),
              roadsRemaining: p.roadsRemaining - 1,
            }
          : p,
      ),
    )
    if (isFreeRoad) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))

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
    playSfx('roadPlacement')
  }

  const applyRobberMove = (
    tileId: string,
    thiefId: number,
    victimId: number | null,
    stolenResource: ResourceType | null,
  ) => {
    setRobberTileId(tileId)
    playSfx('robber')

    let stealNote = ''
    if (victimId != null && stolenResource != null) {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id === victimId) {
            return { ...p, resources: { ...p.resources, [stolenResource]: p.resources[stolenResource] - 1 } }
          }
          if (p.id === thiefId) {
            return { ...p, resources: { ...p.resources, [stolenResource]: p.resources[stolenResource] + 1 } }
          }
          return p
        }),
      )
      const thief = playerById.get(thiefId)
      const victim = playerById.get(victimId)
      if (thief && victim) {
        stealNote = ` ${thief.name} stole 1 ${RESOURCE_LABELS[stolenResource]} from ${victim.name}!`
      }
    } else if (victimId != null) {
      const victim = playerById.get(victimId)
      if (victim) stealNote = ` ${victim.name} had nothing to steal.`
    }

    const tile = tileById.get(tileId)
    if (tile) inform(`The Robber moves to ${BIOME_LABELS[tile.biome]}.${stealNote}`)
    // Never ends the turn here, whether this came from a natural 7 or a
    // Knight card — turn advancement only ever happens via the explicit
    // End Turn button. Control simply returns to the mover's active turn.
    setGamePhase('playing')
  }

  // Knight and Road Building are single-step plays — spend-plus-effect
  // happens atomically, so the same function safely serves both the local
  // actor (via playKnight/playRoadBuilding, after their own guards pass)
  // and every receiving client (via onKnightPlayed/onRoadBuildingPlayed)
  // with no risk of double-spending the card. spendDevCard is declared
  // further down; see the note above applySettlementPlacement for why
  // referencing it here, before its own declaration, is safe.
  const applyKnightPlay = (playerId: number) => {
    spendDevCard(playerId, 'knight')
    const player = playerById.get(playerId)
    if (player) inform(`${player.name} played a Knight! Move the Robber.`)
    setGamePhase('moveRobber')
  }

  const applyRoadBuildingPlay = (playerId: number) => {
    spendDevCard(playerId, 'roadBuilding')
    setFreeRoadsRemaining(2)
    const player = playerById.get(playerId)
    if (player) inform(`${player.name} played Road Building — place 2 free roads.`)
  }

  // Year of Plenty and Monopoly are two-step: playYearOfPlenty/playMonopoly
  // spend the card and open a picker; the actual resource choice — and the
  // broadcast, since that choice is the whole payload — only exists once
  // resolveDevCardPicker runs. These two apply functions are therefore the
  // EFFECT only, not the spend: the local actor already spent the card back
  // at play-time, so resolveDevCardPicker must not spend it again, while a
  // receiving client (which never ran playYearOfPlenty/playMonopoly at all)
  // spends it explicitly right before calling these — see the network
  // handlers below.
  const applyYearOfPlentyEffect = (playerId: number, picks: ResourceType[]) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p
        const resources = { ...p.resources }
        for (const resource of picks) resources[resource] += 1
        return { ...p, resources }
      }),
    )
    const player = playerById.get(playerId)
    const summary = picks.map((resource) => RESOURCE_LABELS[resource]).join(' and ')
    if (player) inform(`${player.name} took ${summary} from the bank via Year of Plenty.`)
  }

  const applyMonopolyEffect = (playerId: number, resource: ResourceType) => {
    let seized = 0
    const victimNotes: string[] = []
    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p, resources: { ...p.resources } }))
      const byId = new Map(next.map((p) => [p.id, p]))
      const currentEntry = byId.get(playerId)
      if (!currentEntry) return prev
      for (const p of next) {
        if (p.id === playerId) continue
        const amount = p.resources[resource]
        if (amount <= 0) continue
        victimNotes.push(`${amount} from ${p.name}`)
        seized += amount
        p.resources[resource] = 0
        currentEntry.resources[resource] += amount
      }
      return next
    })
    const player = playerById.get(playerId)
    if (player) {
      inform(
        seized > 0
          ? `${player.name} monopolized ${RESOURCE_LABELS[resource]} — seized ${seized} card${seized === 1 ? '' : 's'} (${victimNotes.join(', ')})!`
          : `${player.name} played Monopoly on ${RESOURCE_LABELS[resource]}, but no one had any.`,
      )
    }
  }

  // Trusted state mutation for a resolved player-to-player trade — shared by
  // the local (Pass & Play) accept path and the online host-arbiter path
  // (resolveTradeAsHost, below), neither of which re-validates: by the time
  // this runs, whoever called it has already decided the trade is legal.
  const applyTradeResolution = (trade: PendingTrade) => {
    const { fromPlayerId, toPlayerId, offerResource, wantResource } = trade
    const fromPlayer = playerById.get(fromPlayerId)
    const toPlayer = playerById.get(toPlayerId)
    if (!fromPlayer || !toPlayer) return

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

  // Trusted state mutation for one player's confirmed discard — shared by
  // the local actor (confirmDiscard, below, which also broadcasts) and
  // receiving clients (onDiscardConfirmed), same trusted-apply split as
  // every other structural mutation in this file. counts is a resource ->
  // quantity tally (derived from the discarder's flagged card ids), not a
  // full resources object, so it composes with whatever that player's
  // resources happen to be on THIS client — no risk of clobbering a
  // concurrent change from something else.
  const applyDiscard = (playerId: number, counts: Partial<Record<ResourceType, number>>) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p
        const resources = { ...p.resources }
        for (const [type, count] of Object.entries(counts)) {
          resources[type as ResourceType] -= count as number
        }
        return { ...p, resources }
      }),
    )
    const remaining = discardPlayerIds.filter((id) => id !== playerId)
    setDiscardPlayerIds(remaining)
    if (remaining.length === 0) setGamePhase('moveRobber')
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
  // where the lobby left off.
  const {
    broadcastDiceRolled,
    broadcastTurnPassed,
    broadcastSettlementBuilt,
    broadcastCityBuilt,
    broadcastRoadBuilt,
    broadcastRobberMoved,
    broadcastKnightPlayed,
    broadcastRoadBuildingPlayed,
    broadcastPlentyPlayed,
    broadcastMonopolyPlayed,
    broadcastTradeOffered,
    broadcastTradeAcceptRequest,
    broadcastTradeResolved,
    broadcastTradeCancelled,
    broadcastDiscardConfirmed,
    broadcastNewGame,
    broadcastDevCardBought,
    broadcastBankTrade,
  } = useRoomChannel(onlineInfo?.roomCode ?? null, roomSelf, {
    // Mirrors the animation and runs local resource generation only — never
    // touches whose turn it is. Turn advancement is decoupled entirely from
    // this event; it only ever happens via TURN_PASSED, sent when the
    // roller clicks their own End Turn button.
    onDiceRolled: (payload) => {
      setDiceDisplayMode('remote')
      beginDiceAnimation(payload.dice[0], payload.dice[1])
    },
    onTurnPassed: (payload) => applyTurnAdvance(payload.nextPlayerIndex),
    onSettlementBuilt: (payload) => applySettlementPlacement(payload.vertexId, payload.playerId, gamePhase === 'setup'),
    onCityBuilt: (payload) => applyCityPlacement(payload.vertexId, payload.playerId),
    onRoadBuilt: (payload) =>
      applyRoadPlacement(payload.edgeId, payload.playerId, gamePhase === 'setup', payload.isFreeRoad),
    onRobberMoved: (payload) =>
      applyRobberMove(payload.tileId, payload.thiefId, payload.victimId, payload.stolenResource),
    onKnightPlayed: (payload) => applyKnightPlay(payload.playerId),
    onRoadBuildingPlayed: (payload) => applyRoadBuildingPlay(payload.playerId),
    // These two receivers spend the card themselves — unlike the acting
    // client, they never ran playYearOfPlenty/playMonopoly locally, so
    // nothing has deducted it from their copy of the hand yet.
    onPlentyPlayed: (payload) => {
      spendDevCard(payload.playerId, 'yearOfPlenty')
      applyYearOfPlentyEffect(payload.playerId, payload.picks)
    },
    onMonopolyPlayed: (payload) => {
      spendDevCard(payload.playerId, 'monopoly')
      applyMonopolyEffect(payload.playerId, payload.resource)
    },
    onTradeOffered: (payload) => {
      setPendingTrade(payload)
      playSfx('tradeRequest')
    },
    // Every client hears this, but only the host acts on it — see
    // resolveTradeAsHost, below, which validates against the host's own
    // (authoritative) copy of both players' resources before applying.
    onTradeAcceptRequest: (payload) => {
      if (onlineInfo?.isHost) resolveTradeAsHost(payload)
    },
    onTradeResolved: (payload) => {
      applyTradeResolution(payload)
      setPendingTrade(null)
    },
    onTradeCancelled: (payload) => {
      setPendingTrade(null)
      inform(payload.reason)
    },
    onDiscardConfirmed: (payload) => applyDiscard(payload.playerId, payload.counts),
    // Host-only action (see restartGame), but every client applies it the
    // same way it applies any other trusted broadcast — no re-validation.
    onNewGame: (payload) => {
      if (!onlineInfo) return
      resetGame(playerCount, undefined, onlineInfo, payload.boardSeed)
    },
    // buyDevCard and bankTrade only ever touch the acting player's OWN
    // resources — easy to miss broadcasting since neither one visibly
    // affects the board or another player, but every other client still
    // needs to see the change or its own resource count for that player
    // silently drifts, permanently, until it happens to cross the 7-card
    // discard threshold on some screens and not others.
    onDevCardBought: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === payload.playerId
            ? {
                ...p,
                resources: deductCost(p.resources, DEV_CARD_COST),
                devCards: [...p.devCards, payload.card],
                devCardsBoughtThisTurn: [...p.devCardsBoughtThisTurn, payload.card],
              }
            : p,
        ),
      )
      setDevDeck((prev) => prev.slice(1))
    },
    onBankTrade: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === payload.playerId
            ? {
                ...p,
                resources: {
                  ...p.resources,
                  [payload.give]: p.resources[payload.give] - payload.rate,
                  [payload.receive]: p.resources[payload.receive] + 1,
                },
              }
            : p,
        ),
      )
    },
  })

  // Local (non-online) games are always "your turn" — whoever is at the
  // keyboard controls whichever player is active, same as it always has.
  const isMyTurn = !onlineInfo || players[currentPlayerIndex]?.id === onlineInfo.localPlayerId

  // Self-healing view of the discard queue: a player only belongs in it
  // while they CURRENTLY hold more than 7 cards, but discardPlayerIds
  // itself is only ever checked against that rule once, at the instant the
  // 7 lands. If a client's view of a player's resources is ever wrong at
  // that moment (a reconnect racing a snapshot restore, some future
  // desync source), the STORED queue can end up holding a player who
  // isn't actually over the limit — surfacing as "asked to discard with a
  // legal hand," or every client's queue disagreeing and the whole table
  // stuck on "waiting for everyone." Re-deriving fresh every render (never
  // trusting the stored list directly) means that can't stay broken: it's
  // filtered back to correct the instant `players` says so, same render,
  // no extra round trip through an effect.
  const validDiscardPlayerIds = useMemo(
    () =>
      discardPlayerIds.filter((id) => {
        const player = playerById.get(id)
        return player != null && totalResourceCount(player.resources) > 7
      }),
    [discardPlayerIds, playerById],
  )

  // Who's actively discarding on THIS screen right now. Local Pass & Play
  // is sequential — everyone shares one device, so only the first player
  // still in the queue is ever "up." Online is parallel — every affected
  // player discards on their own screen at the same time, so this is just
  // "am I one of the people who still owes a discard."
  const activeDiscarderId = onlineInfo
    ? validDiscardPlayerIds.includes(onlineInfo.localPlayerId)
      ? onlineInfo.localPlayerId
      : null
    : (validDiscardPlayerIds[0] ?? null)
  const isMyDiscardTurn = activeDiscarderId != null
  const discardingPlayer = activeDiscarderId != null ? playerById.get(activeDiscarderId) : null
  const discardRequiredCount = discardingPlayer ? Math.floor(totalResourceCount(discardingPlayer.resources) / 2) : 0

  // The personal camera-anchored hand shows YOUR OWN cards in an online
  // match — not whoever's turn it currently is, which is what
  // currentPlayerIndex means and is correct only for local Pass & Play,
  // where everyone shares one screen and hands off the device each turn.
  // During a local discard, it hands off again to whichever over-limit
  // player is next in the queue, same idea as the setup phase already does.
  const localPlayer = onlineInfo
    ? (playerById.get(onlineInfo.localPlayerId) ?? players[currentPlayerIndex])
    : gamePhase === 'discard' && activeDiscarderId != null
      ? (playerById.get(activeDiscarderId) ?? players[currentPlayerIndex])
      : players[currentPlayerIndex]

  // Mirrors GameHud's own canPlayDevCards derivation — needed here too since
  // the 3D hand (click-to-play) lives outside GameHud, in the Canvas.
  const canPlayDevCards =
    gamePhase === 'playing' && !isRolling && !winner && !pendingTrade && !devCardPicker && !devCardPlayedThisTurn && isMyTurn

  // The single place a turn passes to the next player: clears any unused
  // free roads (a Road Building card's free placements don't carry over) and
  // resets the incoming player's "bought this turn" dev card tracking. Only
  // ever called from the explicit End Turn button click (handleEndTurn,
  // below) — never from dice-settle or robber-move callbacks — so there is
  // no race to guard against here; the click itself already only fires on
  // the client whose turn it actually is.
  const endTurn = () => {
    playSfx('turnEnd')
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

  // The one piece of the discard self-healing (below, near
  // activeDiscarderId) that DOES need a real effect: gamePhase is
  // persisted state, not something derivable in render, so releasing the
  // phase once the (self-healed) queue empties out still has to happen
  // here — same shape as the winner-detection effect just above.
  useEffect(() => {
    if (gamePhase === 'discard' && validDiscardPlayerIds.length === 0) {
      setGamePhase('moveRobber')
    }
  }, [gamePhase, validDiscardPlayerIds])

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

  // Superset of canPerformAction() for the two placement handlers, which
  // additionally can't proceed mid-animation, mid-robber-move, or out of turn.
  const canInteract = (): boolean => {
    if (!canPerformAction()) return false
    if (isRolling) {
      warn('Wait for the dice to finish rolling.')
      return false
    }
    if (gamePhase === 'moveRobber') {
      warn('Move the Robber before building.')
      return false
    }
    if (!isMyTurn) {
      warn("It's not your turn.")
      return false
    }
    return true
  }

  const buildSettlementRaw = (vertexId: string) => {
    if (!canInteract()) return

    const player = players[currentPlayerIndex]
    const isSetup = gamePhase === 'setup'
    const existing = settlements[vertexId]

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

      applyCityPlacement(vertexId, player.id)
      if (onlineInfo) broadcastCityBuilt({ vertexId, playerId: player.id })
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

    applySettlementPlacement(vertexId, player.id, isSetup)
    if (onlineInfo) broadcastSettlementBuilt({ vertexId, playerId: player.id })
  }

  const buildRoadRaw = (edgeId: string) => {
    if (!canInteract()) return

    const player = players[currentPlayerIndex]
    const isSetup = gamePhase === 'setup'
    const isFreeRoad = !isSetup && freeRoadsRemaining > 0

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

    applyRoadPlacement(edgeId, player.id, isSetup, isFreeRoad)
    if (onlineInfo) broadcastRoadBuilt({ edgeId, playerId: player.id, isFreeRoad })
  }

  // Stable callbacks for board interactions — buildSettlement/buildRoad
  // never change identity across renders (empty deps), so BoardInteractions
  // (memoized) doesn't re-render on every keystroke elsewhere in the tree.
  // The refs always point at the LATEST buildSettlementRaw/buildRoadRaw
  // (kept current every render via the layout effect below), so the stable
  // wrapper still calls fresh logic despite never itself changing identity.
  const buildSettlementRef = useRef((id: string) => {
    void id
  })
  const buildRoadRef = useRef((id: string) => {
    void id
  })
  useLayoutEffect(() => {
    buildSettlementRef.current = buildSettlementRaw
    buildRoadRef.current = buildRoadRaw
  })
  const buildSettlement = useCallback((id: string) => buildSettlementRef.current(id), [])
  const buildRoad = useCallback((id: string) => buildRoadRef.current(id), [])

  // Triggered by the Roll Dice button: this is always the LOCAL player's own
  // roll (their own turn, local Pass & Play or online), so it runs a real
  // physics throw rather than pre-deciding a total — the outcome isn't known
  // until PhysicsDice3D's simulation actually settles. Broadcasting (for
  // online play) happens afterward, in handlePhysicsSettled, once there's a
  // real result to broadcast.
  const rollDice = () => {
    if (!canPerformAction()) return
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't roll right now.")
      return
    }
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (hasRolledThisTurn) {
      warn("You've already rolled this turn.")
      return
    }

    setIsRolling(true)
    playSfx('diceRoll')
    setDiceDisplayMode('physics')
    setPhysicsRoll((prev) => ({ rollId: (prev?.rollId ?? 0) + 1 }))
  }

  // PhysicsDice3D's settle callback — the physics simulation has just
  // decided the real result. Broadcast it (so every other online client can
  // mirror it via their own closed-form Dice3D) and apply it exactly like a
  // predetermined roll used to be applied.
  const handlePhysicsSettled = (d1: number, d2: number) => {
    if (onlineInfo) {
      broadcastDiceRolled({ dice: [d1, d2], total: d1 + d2, playerId: players[currentPlayerIndex].id })
    }
    applyRollResult(d1 + d2)
  }

  const applyRollResult = (total: number) => {
    setIsRolling(false)
    setLastRoll(total)
    // Marks the roll as done for whoever's turn this is — every client sets
    // this, active or not, since it's a fact about the active player's turn,
    // not this browser's own state. Distributes resources (and, on a 7,
    // opens the moveRobber phase) but never touches currentPlayerIndex or
    // fires TURN_PASSED; only the End Turn button does that.
    setHasRolledThisTurn(true)

    if (total === 7) {
      const overLimitIds = players.filter((p) => totalResourceCount(p.resources) > 7).map((p) => p.id)
      if (overLimitIds.length > 0) {
        setDiscardPlayerIds(overLimitIds)
        setDiscardSelection([])
        setGamePhase('discard')
        inform('Rolled 7 — players over 7 cards must discard half.')
      } else {
        inform('Rolled 7 — move the Robber.')
        setGamePhase('moveRobber')
      }
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
  }

  const handleDiceSettled = () => {
    if (!diceRoll) return
    applyRollResult(diceRoll.d1 + diceRoll.d2)
  }

  // Flags or unflags one card (by its 3D hand instance id, e.g. "lumber-2")
  // for discard. Capped at the required count rather than allowing
  // over-selection — once you're at the cap, clicking a NEW card is a
  // no-op until you deselect one, so Confirm Discard's "exactly half"
  // requirement is satisfied automatically the moment the cap is reached.
  const toggleDiscardSelection = (cardId: string) => {
    if (activeDiscarderId == null) return
    const player = playerById.get(activeDiscarderId)
    if (!player) return
    const required = Math.floor(totalResourceCount(player.resources) / 2)
    setDiscardSelection((prev) => {
      if (prev.includes(cardId)) return prev.filter((id) => id !== cardId)
      if (prev.length >= required) return prev
      return [...prev, cardId]
    })
  }

  const confirmDiscard = () => {
    if (activeDiscarderId == null) return
    const player = playerById.get(activeDiscarderId)
    if (!player) return
    const required = Math.floor(totalResourceCount(player.resources) / 2)
    if (discardSelection.length !== required) return

    // Card ids are "<resourceType>-<index>" (buildCardSlots in
    // PlayerHand3D) — the index is purely a 3D-picking detail, only the
    // type prefix matters for the actual resource mutation.
    const counts: Partial<Record<ResourceType, number>> = {}
    for (const id of discardSelection) {
      const type = id.slice(0, id.lastIndexOf('-')) as ResourceType
      counts[type] = (counts[type] ?? 0) + 1
    }

    applyDiscard(activeDiscarderId, counts)
    setDiscardSelection([])
    inform(`${player.name} discarded ${required} card${required === 1 ? '' : 's'}.`)
    if (onlineInfo) broadcastDiscardConfirmed({ playerId: activeDiscarderId, counts })
  }

  const moveRobber = (tileId: string) => {
    if (winner) return
    if (gamePhase !== 'moveRobber') return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (tileId === robberTileId) {
      warn('The Robber must move to a new hex!')
      return
    }

    // The steal target and stolen resource are both random, decided ONCE
    // here and carried verbatim to applyRobberMove (and, when online, to
    // every other client) — a receiver re-rolling these independently would
    // almost certainly pick a different victim/resource than actually
    // happened, corrupting resource state instead of mirroring it.
    const thief = players[currentPlayerIndex]
    const vertexIds = graph.tileVertexIds.get(tileId) ?? []
    const victimIds: number[] = []
    for (const vertexId of vertexIds) {
      const building = settlements[vertexId]
      if (building && building.ownerId !== thief.id && !victimIds.includes(building.ownerId)) {
        victimIds.push(building.ownerId)
      }
    }

    let victimId: number | null = null
    let stolenResource: ResourceType | null = null
    if (victimIds.length > 0) {
      const candidates = victimIds
      victimId = candidates[Math.floor(Math.random() * candidates.length)]
      const victim = playerById.get(victimId)
      if (victim) {
        const heldResources: ResourceType[] = []
        for (const resource of RESOURCE_ORDER) {
          for (let i = 0; i < victim.resources[resource]; i++) heldResources.push(resource)
        }
        if (heldResources.length > 0) {
          stolenResource = heldResources[Math.floor(Math.random() * heldResources.length)]
        }
      }
    }

    applyRobberMove(tileId, thief.id, victimId, stolenResource)
    if (onlineInfo) broadcastRobberMoved({ tileId, thiefId: thief.id, victimId, stolenResource })
  }

  // The ONLY place currentPlayerIndex ever advances or TURN_PASSED fires —
  // an explicit user click, never an automatic side effect of dice physics
  // settling or a robber move resolving. Requires a roll to have actually
  // happened first, and (implicitly, via gamePhase !== 'playing' below) that
  // any pending robber move from a natural 7 has already been resolved.
  const handleEndTurn = () => {
    if (winner) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (gamePhase !== 'playing' || !hasRolledThisTurn) {
      warn('Roll the dice before ending your turn.')
      return
    }
    endTurn()
  }

  const bankTrade = (give: ResourceType, receive: ResourceType) => {
    if (!canPerformAction()) return
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
    if (onlineInfo) broadcastBankTrade({ playerId: player.id, give, receive, rate })
  }

  const proposePlayerTrade = (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => {
    if (!canPerformAction()) return
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

    const trade: PendingTrade = { fromPlayerId: fromPlayer.id, toPlayerId, offerResource, wantResource }
    setPendingTrade(trade)
    playSfx('tradeRequest')
    if (onlineInfo) {
      broadcastTradeOffered(trade)
      const toPlayer = playerById.get(toPlayerId)
      if (toPlayer) inform(`Trade offer sent to ${toPlayer.name} — waiting for a response…`)
    }
  }

  // Validates and applies an accepted trade using the HOST's own copy of
  // both players' resources — the authoritative check. Used both when the
  // host itself is the one clicking Accept (resolvePlayerTrade, below) and
  // when the host's onTradeAcceptRequest listener fires for someone else's
  // accept. Re-checking here (rather than trusting the accepting client's
  // own resource counts) is what the host-arbiter pattern is for: the
  // offerer's resources could have changed — e.g. spent on a road — in the
  // gap between the offer being sent and the target accepting it.
  const resolveTradeAsHost = (trade: PendingTrade) => {
    const fromPlayer = playerById.get(trade.fromPlayerId)
    const toPlayer = playerById.get(trade.toPlayerId)
    if (!fromPlayer || !toPlayer) {
      setPendingTrade(null)
      return
    }
    if (toPlayer.resources[trade.wantResource] < 1 || fromPlayer.resources[trade.offerResource] < 1) {
      const reason = `The trade between ${fromPlayer.name} and ${toPlayer.name} fell through — resources changed.`
      setPendingTrade(null)
      inform(reason)
      broadcastTradeCancelled({ reason })
      return
    }
    applyTradeResolution(trade)
    setPendingTrade(null)
    broadcastTradeResolved(trade)
  }

  const resolvePlayerTrade = (accept: boolean) => {
    if (winner) return
    if (!pendingTrade) return

    if (!accept) {
      const toPlayer = playerById.get(pendingTrade.toPlayerId)
      const reason = `${toPlayer?.name ?? 'The player'} declined the trade.`
      setPendingTrade(null)
      inform(reason)
      if (onlineInfo) broadcastTradeCancelled({ reason })
      return
    }

    if (!onlineInfo) {
      // Local Pass & Play: everyone shares one screen and one authoritative
      // state, so there's nothing to arbitrate — resolve immediately.
      applyTradeResolution(pendingTrade)
      setPendingTrade(null)
      return
    }

    if (onlineInfo.isHost) {
      // The host accepting their own incoming offer: resolve directly
      // rather than broadcasting a request to itself — Realtime broadcasts
      // don't echo back to the sender, so nothing would ever receive it.
      resolveTradeAsHost(pendingTrade)
    } else {
      // Non-host accepting: don't apply locally. Ask the host to validate
      // against its own authoritative resource counts first (pendingTrade
      // stays set — still awaiting TRADE_RESOLVED/TRADE_CANCELLED).
      broadcastTradeAcceptRequest(pendingTrade)
    }
  }

  const buyDevCard = () => {
    if (!canPerformAction()) return
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
    if (onlineInfo) broadcastDevCardBought({ playerId: player.id, card })
  }

  // Every "play a dev card" action shares the same preconditions, so they
  // live in one place — this is what let the one-card-per-turn rule go
  // missing from four separate handlers. Warns and returns false when the
  // play isn't legal right now.
  const canPlayDevCardNow = (type: DevCardType): boolean => {
    if (!canPerformAction()) return false
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't play a development card right now.")
      return false
    }
    if (!isMyTurn) {
      warn("It's not your turn.")
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

  // Spends one card of the given type from the named player's hand and
  // marks the turn's single play as used. Takes an explicit playerId
  // (rather than assuming players[currentPlayerIndex]) so the same function
  // works identically for the local actor and for a receiving client
  // applying a remote play.
  const spendDevCard = (playerId: number, type: DevCardType) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
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
    applyKnightPlay(player.id)
    if (onlineInfo) broadcastKnightPlayed({ playerId: player.id })
  }


  const playRoadBuilding = () => {
    if (!canPlayDevCardNow('roadBuilding')) return
    const player = players[currentPlayerIndex]
    applyRoadBuildingPlay(player.id)
    if (onlineInfo) broadcastRoadBuildingPlayed({ playerId: player.id })
  }

  const playYearOfPlenty = () => {
    if (!canPlayDevCardNow('yearOfPlenty')) return
    const player = players[currentPlayerIndex]
    // Spent here, at play-time, not in resolveDevCardPicker — the card
    // commits the instant you choose to play it, before you've even picked
    // resources. Nothing to broadcast yet: the payload IS the choice, and
    // that doesn't exist until the picker is submitted below.
    spendDevCard(player.id, 'yearOfPlenty')
    setDevCardPicker('yearOfPlenty')
  }

  const playMonopoly = () => {
    if (!canPlayDevCardNow('monopoly')) return
    const player = players[currentPlayerIndex]
    spendDevCard(player.id, 'monopoly')
    setDevCardPicker('monopoly')
  }

  const playDevCard = (type: DevCardType) => {
    if (type === 'knight') return playKnight()
    if (type === 'roadBuilding') return playRoadBuilding()
    if (type === 'yearOfPlenty') return playYearOfPlenty()
    if (type === 'monopoly') return playMonopoly()
  }

  // Resolves whichever picker is currently open (Year of Plenty or
  // Monopoly) with the resource(s) the player picked in the modal. Only
  // ever reachable by the local actor — devCardPicker is pure local UI
  // state, never broadcast, so this modal never opens on another client.
  const resolveDevCardPicker = (picks: ResourceType[]) => {
    const mode = devCardPicker
    setDevCardPicker(null)
    if (!mode) return

    const player = players[currentPlayerIndex]

    if (mode === 'yearOfPlenty') {
      applyYearOfPlentyEffect(player.id, picks)
      if (onlineInfo) broadcastPlentyPlayed({ playerId: player.id, picks })
      return
    }

    const resource = picks[0]
    applyMonopolyEffect(player.id, resource)
    if (onlineInfo) broadcastMonopolyPlayed({ playerId: player.id, resource })
  }

  const currentPlayerPortRates = Object.fromEntries(
    RESOURCE_ORDER.map((resource) => [resource, getPortRate(players[currentPlayerIndex].id, resource)]),
  ) as Record<ResourceType, number>

  // Shared reset: reshuffles the board and dev deck once, deriving the new
  // Robber position from that exact same board shuffle so they can't desync.
  const resetGame = (
    count: number,
    names?: string[],
    online?: { roomCode: string; localPlayerName: string; isHost: boolean },
    // A restart needs a NEW layout, not the same one every time — the room
    // code alone is a constant seed, so reusing it here would reshuffle to
    // the exact same board on every "New Game". restartGame generates a
    // fresh seed and broadcasts it; every other caller (a fresh Start Game
    // submission) omits this and falls back to the room-code seed below, so
    // every client's first buildHexBoard() call still lands on the
    // IDENTICAL tile layout without any of them needing to coordinate one.
    boardSeed?: string,
  ) => {
    // Local Pass & Play omits the seed entirely and keeps its original
    // random board.
    const freshTiles = buildHexBoard(online ? (boardSeed ?? online.roomCode) : undefined)
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
            localPlayerId: findPlayerIndexByName(resolvedNames, online.localPlayerName) + 1,
            localPlayerName: online.localPlayerName,
            isHost: online.isHost,
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
    setFreeRoadsRemaining(0)
    setDevCardPicker(null)
    setDevCardPlayedThisTurn(false)
    setHasRolledThisTurn(false)
    setDiscardPlayerIds([])
    setDiscardSelection([])
    setBoardInstance((n) => n + 1)
    setLongestRoadHolderId(null)
    setLargestArmyHolderId(null)
    setGamePhase('setup')
    setSetupStepIndex(0)
    setSetupStage('settlement')
    setSetupSettlementVertexId(null)
  }

  // Rejoining a match already in progress: hydrate every piece of state
  // directly from the saved snapshot instead of building a fresh game.
  // tiles are the one exception — deliberately recomputed, not read from
  // the snapshot, since buildHexBoard(roomCode) is already guaranteed to
  // reproduce the identical board (see resetGame's comment on why this
  // matters), and trusting a live derivation over a stored copy is safer.
  const restoreFromSnapshot = (
    snapshot: MatchSnapshot,
    online: { roomCode: string; localPlayerName: string; isHost: boolean },
  ) => {
    const freshTiles = buildHexBoard(online.roomCode)
    setTiles(freshTiles)
    setPlayerCount(snapshot.playerNames.length)
    setPlayerNames(snapshot.playerNames)
    setPlayers(snapshot.players)
    setOnlineInfo({
      roomCode: online.roomCode,
      localPlayerId: findPlayerIndexByName(snapshot.playerNames, online.localPlayerName) + 1,
      localPlayerName: online.localPlayerName,
      isHost: online.isHost,
    })
    setSettlements(snapshot.settlements)
    setRoads(snapshot.roads)
    setCurrentPlayerIndex(snapshot.currentPlayerIndex)
    setRobberTileId(snapshot.robberTileId)
    setGamePhase(snapshot.gamePhase)
    setSetupStepIndex(snapshot.setupStepIndex)
    setSetupStage(snapshot.setupStage)
    setSetupSettlementVertexId(snapshot.setupSettlementVertexId)
    setLastRoll(snapshot.lastRoll)
    setDevDeck(snapshot.devDeck)
    setWinner(snapshot.winner)
    setLongestRoadHolderId(snapshot.longestRoadHolderId)
    setLargestArmyHolderId(snapshot.largestArmyHolderId)
    setDevCardPlayedThisTurn(snapshot.devCardPlayedThisTurn)
    setFreeRoadsRemaining(snapshot.freeRoadsRemaining)
    setHasRolledThisTurn(snapshot.hasRolledThisTurn)
    setBanner(null)
    setPendingTrade(null)
    setDevCardPicker(null)
    setDiceRoll(null)
    setIsRolling(false)
    setDiscardSelection([])
    // discardPlayerIds isn't persisted (fully derivable from resource
    // counts) — if the snapshot was saved mid-discard, recompute who still
    // owes one from the restored players rather than trusting a stale list.
    setDiscardPlayerIds(
      snapshot.gamePhase === 'discard'
        ? snapshot.players.filter((p) => totalResourceCount(p.resources) > 7).map((p) => p.id)
        : [],
    )
    setBoardInstance((n) => n + 1)
  }

  const startGame = (info: GameStartInfo) => {
    if (info.snapshot && info.online) {
      restoreFromSnapshot(info.snapshot, info.online)
    } else {
      resetGame(info.playerCount, info.names, info.online)
    }
    setGameStarted(true)
  }

  const restartGame = () => {
    if (onlineInfo) {
      // Host-only: mirrors the TopBar button being disabled for everyone
      // else, but re-checked here too since this fires other players'
      // whole board straight from local state — never trust the click
      // alone for an action with this much blast radius.
      if (!onlineInfo.isHost) return
      const boardSeed = Math.random().toString(36).slice(2)
      broadcastNewGame({ boardSeed })
      resetGame(playerCount, undefined, onlineInfo, boardSeed)
      return
    }
    resetGame(playerCount)
  }

  // Distinct from restartGame: fully exits the current match back to the
  // pre-game player-count picker, rather than reshuffling in place.
  const returnToMenu = () => {
    resetGame(playerCount)
    setGameStarted(false)
  }

  // Host-only, online-only: after any state-settling change, persist a full
  // snapshot so a reload — this browser's own, or the match resuming after
  // everyone had disconnected — has something to restore from. Broad
  // dependency list is deliberate: this is meant to fire on essentially
  // every meaningful game event (dice, builds, robber, dev cards, turns),
  // and React's own change-detection is a more reliable way to guarantee
  // that than manually instrumenting every mutation site individually.
  useEffect(() => {
    if (!onlineInfo?.isHost || !gameStarted) return
    const snapshot: MatchSnapshot = {
      hostName: onlineInfo.localPlayerName,
      playerNames,
      players,
      settlements,
      roads,
      currentPlayerIndex,
      robberTileId,
      gamePhase,
      setupStepIndex,
      setupStage,
      setupSettlementVertexId,
      lastRoll,
      devDeck,
      winner,
      longestRoadHolderId,
      largestArmyHolderId,
      devCardPlayedThisTurn,
      freeRoadsRemaining,
      hasRolledThisTurn,
    }
    saveMatchSnapshot(onlineInfo.roomCode, snapshot)
  }, [
    onlineInfo,
    gameStarted,
    playerNames,
    players,
    settlements,
    roads,
    currentPlayerIndex,
    robberTileId,
    gamePhase,
    setupStepIndex,
    setupStage,
    setupSettlementVertexId,
    lastRoll,
    devDeck,
    winner,
    longestRoadHolderId,
    largestArmyHolderId,
    devCardPlayedThisTurn,
    freeRoadsRemaining,
    hasRolledThisTurn,
  ])

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
          {diceDisplayMode === 'physics' ? (
            <PhysicsDice3D roll={physicsRoll} onSettled={handlePhysicsSettled} />
          ) : (
            <Dice3D roll={diceRoll} onSettled={handleDiceSettled} />
          )}
          {/* Your own hand, held at the bottom of the viewport — localPlayer
              is you in an online match, or whoever's turn it is locally. */}
          <PlayerHand3D
            resources={localPlayer.resources}
            devCards={localPlayer.devCards}
            devCardsBoughtThisTurn={localPlayer.devCardsBoughtThisTurn}
            canPlayDevCards={canPlayDevCards}
            onPlayDevCard={playDevCard}
            discardActive={gamePhase === 'discard' && isMyDiscardTurn}
            discardSelection={discardSelection}
            onToggleDiscard={toggleDiscardSelection}
          />
          {/* Every player's hand floating at their table seat — no-ops
              entirely for local Pass & Play (see TableSeatHands). */}
          <TableSeatHands players={players} localPlayerId={onlineInfo?.localPlayerId ?? null} />
          {/* Constrained so the camera can never drop below the horizon (which
            exposed the underside of the board and the backfaces of every
            token), fly past the island, or dolly through geometry. Damping
            is what makes the orbit feel weighted rather than twitchy. Fully
            manual — nothing in the app ever drives this camera; it is
            exclusively under the player's own mouse/OrbitControls input,
            on every screen, on every turn, with no exceptions. */}
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
        hasRolledThisTurn={hasRolledThisTurn}
        onEndTurn={handleEndTurn}
        gamePhase={gamePhase}
        setupStage={setupStage}
        banner={banner}
        onRestart={restartGame}
        canRestart={onlineInfo == null || onlineInfo.isHost}
        portRates={currentPlayerPortRates}
        onTrade={bankTrade}
        isRolling={isRolling}
        devDeckCount={devDeck.length}
        onBuyDevCard={buyDevCard}
        winner={winner}
        settlements={settlements}
        onReturnToMenu={returnToMenu}
        pendingTrade={pendingTrade}
        localPlayerId={onlineInfo?.localPlayerId ?? null}
        onProposeTrade={proposePlayerTrade}
        onResolveTrade={resolvePlayerTrade}
        onPlayDevCard={playDevCard}
        devCardPicker={devCardPicker}
        onResolveDevCardPicker={resolveDevCardPicker}
        devCardPlayedThisTurn={devCardPlayedThisTurn}
        longestRoadHolderId={longestRoadHolderId}
        longestRoadLengths={longestRoadLengths}
        largestArmyHolderId={largestArmyHolderId}
        isMyDiscardTurn={isMyDiscardTurn}
        discardingPlayerName={discardingPlayer?.name ?? ''}
        discardRequiredCount={discardRequiredCount}
        discardSelectedCount={discardSelection.length}
        onConfirmDiscard={confirmDiscard}
        roomCode={onlineInfo?.roomCode ?? null}
        viewerPlayerId={localPlayer.id}
      />
    </div>
  )
}

export default App
