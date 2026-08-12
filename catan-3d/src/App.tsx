import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CatanBoard } from './components/CatanBoard'
import { SceneRig } from './components/SceneRig'
import { BoardFrame } from './components/BoardFrame'
import { CanvasErrorBoundary } from './components/CanvasErrorBoundary'
import { Ocean } from './components/Ocean'
import { computeFrameInnerSize, computeFrameOuterSize } from './three/layout'
import { BoardInteractions } from './components/BoardInteractions'
import { RobberLayer } from './components/RobberLayer'
import { PortMarkers } from './components/PortMarkers'
import { Dice3D, type DiceRollTarget } from './components/Dice3D'
import { PhysicsDice3D, type PhysicsRollTarget } from './components/PhysicsDice3D'
import { PlayerHand3D } from './components/PlayerHand3D'
import { GameHud } from './components/hud/GameHud'
import { StartScreen, type GameStartInfo } from './components/hud/StartScreen'
import type { PendingTrade } from './components/hud/TradeOfferPrompt'
import {
  useRoomChannel,
  type RoomPlayer,
  type HoverChangedPayload,
  type ChatMessagePayload,
} from './multiplayer/useRoomChannel'
import { saveMatchSnapshot, type MatchSnapshot } from './multiplayer/matchSnapshot'
import { normalizePlayerName } from './multiplayer/roomCode'
import { buildHexBoard, type BoardCell, type BoardShapeId } from './data/hexBoard'
import { playSfx } from './audio/sfx'
import { assignPorts, buildBoardGraph, buildVertexAdjacency } from './data/boardGraph'
import {
  BIOME_LABELS,
  BIOME_TO_RESOURCE,
  CITY_COST,
  DEFAULT_GAME_RULES,
  DEV_CARD_COST,
  DEV_CARD_SINGULAR,
  LARGEST_ARMY_MIN_KNIGHTS,
  LONGEST_ROAD_MIN_LENGTH,
  RESOURCE_LABELS,
  RESOURCE_ORDER,
  ROAD_COST,
  SETTLEMENT_COST,
  buildDevCardDeck,
  buildSetupOrder,
  canAfford,
  createInitialPlayers,
  deductCost,
  getPlayerScore,
  emptyResources,
  getPublicScore,
  removeOne,
  shuffle,
  totalResourceCount,
  type Building,
  type DevCardType,
  type GameRules,
  type Player,
  type PlayerColorToken,
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
export interface EventLogEntry {
  id: number
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
  // Persists across restarts within a session (resetGame's own optional
  // shapeId argument overrides it only on a fresh Start Game submission) —
  // "New Game" reshuffles the board but keeps whatever shape was chosen.
  const [boardShapeId, setBoardShapeId] = useState<BoardShapeId>('standard')
  // Same persistence pattern as boardShapeId — chosen once at Start Game,
  // survives a same-session restart, only changes on a fresh submission.
  const [gameRules, setGameRules] = useState<GameRules>(DEFAULT_GAME_RULES)
  // Counts ACCEPTED rolls only (incremented inside applyRollResult, which
  // every client — roller and spectators alike — runs identically), never
  // a rerolled 7 — that's what lets noSevensFirstTwoRolls check "is this
  // one of the first two" consistently across every client without any of
  // them needing to separately coordinate it. Reset on every resetGame.
  const [totalRollsThisGame, setTotalRollsThisGame] = useState(0)
  // Consecutive doubles rolled by the CURRENT player, THIS turn — for the
  // doublesRerollRule (extra roll on a double, hand wiped on the third in a
  // row). Reset on every turn advance (applyTurnAdvance), not just a new
  // game, since it only ever describes an in-progress streak within the
  // active player's current turn.
  const [consecutiveDoublesThisTurn, setConsecutiveDoublesThisTurn] = useState(0)
  // Set together with boardShapeId, only when a player-drawn shape is
  // active — takes priority over boardShapeId in buildHexBoard whenever
  // non-empty (see resetGame/restoreFromSnapshot below).
  const [customBoardCells, setCustomBoardCells] = useState<BoardCell[] | undefined>(undefined)
  const tileById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])
  const graph = useMemo(() => buildBoardGraph(tiles), [tiles])
  // Newfoundland/Peanut/any custom BoardShapeEditor.tsx shape can be wider
  // than standard — the tray, water and shadow frustum all derive their
  // size from the board's OWN real extent instead of a fixed constant, so
  // a bigger island always has a big-enough table under it.
  const frameInnerSize = useMemo(() => computeFrameInnerSize(tiles), [tiles])
  const frameOuterSize = useMemo(() => computeFrameOuterSize(frameInnerSize), [frameInnerSize])
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
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])
  // Online-only — chat has no meaning in local Pass & Play (one shared
  // screen already shows everything to everyone). Capped the same way
  // eventLog is, for the same unbounded-growth reason.
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([])
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
  // The active player's live build-hover, mirrored from another online
  // client (see onHoverChanged above) so everyone can see what they're
  // considering. Always null in local Pass & Play — there's only one
  // shared screen, which already shows the hover directly.
  const [remoteHover, setRemoteHover] = useState<HoverChangedPayload>({ playerId: -1, vertexId: null, edgeId: null })
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

  // Historical log behind the single-active EventBanner — every inform()/
  // warn() call appends here too, capped to the last 20 so the panel never
  // grows unbounded over a long match. id is a plain incrementing counter
  // (not the array index) so React keys stay stable as old entries fall
  // off the front.
  const eventLogIdRef = useRef(0)
  const logEvent = (text: string, variant: BannerMessage['variant']) => {
    eventLogIdRef.current += 1
    setEventLog((prev) => [...prev.slice(-19), { id: eventLogIdRef.current, text, variant }])
  }

  const warn = (text: string) => {
    console.warn(`[Catan] ${text}`)

    setBanner({ text, variant: 'warning' })
    logEvent(text, 'warning')
  }

  const inform = (text: string) => {
    setBanner({ text, variant: 'info' })
    logEvent(text, 'info')
  }

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
    setConsecutiveDoublesThisTurn(0)
    setPlayers((prev) => prev.map((p, index) => (index === nextIndex ? { ...p, devCardsBoughtThisTurn: [] } : p)))
    setCurrentPlayerIndex(nextIndex)
    // Otherwise the outgoing player's last hovered spot lingers highlighted
    // on every spectator's screen until the new active player happens to
    // hover something themselves.
    setRemoteHover({ playerId: -1, vertexId: null, edgeId: null })
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

  // A player's own color never changes once the match starts, so this is
  // kept as its own value (not read inline from `players` below) — `players`
  // itself churns on nearly every game action (resources, dice, builds),
  // and folding that whole array into roomSelf's deps would re-track
  // presence far more often than the one field that can actually change.
  const localColorToken = players.find((p) => p.id === onlineInfo?.localPlayerId)?.colorToken
  // Carries the SAME identity/color info the lobby's own presence entry had
  // (see OnlineSetup.tsx's `self`) — this channel re-tracks onto the
  // identical `room:<code>` presence topic, so leaving isHost hardcoded
  // false and colorToken unset here would silently overwrite this player's
  // real lobby data with wrong/missing values for the rest of the match.
  const roomSelf: RoomPlayer | null = useMemo(
    () =>
      onlineInfo
        ? { name: onlineInfo.localPlayerName, isHost: onlineInfo.isHost, colorToken: localColorToken }
        : null,
    [onlineInfo, localColorToken],
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
    broadcastHoverChanged,
    broadcastChatMessage,
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
    // The active player's live vertex/edge hover, mirrored so spectators
    // can see what they're considering — Supabase broadcasts don't echo
    // back to their own sender by default, so this only ever fires on
    // OTHER clients, never the active player's own.
    onHoverChanged: (payload) => setRemoteHover(payload),
    // Broadcasts never echo back to their own sender, so this only ever
    // fires for messages OTHER players sent — sendChatMessage below
    // appends the local player's own message directly.
    onChatMessage: (payload) => setChatMessages((prev) => [...prev.slice(-49), payload]),
  })

  // Broadcasts the LOCAL player's own message and appends it to their own
  // chat history in the same call — Supabase doesn't echo a broadcast back
  // to its own sender, so without this the sender would never see their
  // own message appear. Online-only: onlineInfo is required, not just
  // checked, since a message needs a real localPlayerId/Name to attribute.
  const sendChatMessage = (text: string) => {
    if (!onlineInfo) return
    const trimmed = text.trim()
    if (!trimmed) return
    const payload: ChatMessagePayload = {
      senderId: onlineInfo.localPlayerId,
      senderName: onlineInfo.localPlayerName,
      text: trimmed,
      timestamp: Date.now(),
    }
    broadcastChatMessage(payload)
    setChatMessages((prev) => [...prev.slice(-49), payload])
  }

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
  // place. See pickTrophyHolder for the exact rule. Applied directly during
  // render rather than in a useEffect: pickTrophyHolder is pure and cheap,
  // and the !== guard is what makes this self-terminating (the condition
  // goes false the instant state catches up) rather than an infinite render
  // loop — the same "adjust state during render" pattern React's own docs
  // recommend for state fully derived from other state.
  const nextLongestRoadHolderId = pickTrophyHolder(longestRoadHolderId, longestRoadLengths, LONGEST_ROAD_MIN_LENGTH)
  if (nextLongestRoadHolderId !== longestRoadHolderId) {
    setLongestRoadHolderId(nextLongestRoadHolderId)
  }

  const nextLargestArmyHolderId = pickTrophyHolder(largestArmyHolderId, knightCounts, LARGEST_ARMY_MIN_KNIGHTS)
  if (nextLargestArmyHolderId !== largestArmyHolderId) {
    setLargestArmyHolderId(nextLargestArmyHolderId)
  }

  // The moment any player's score reaches the win threshold, halt the game.
  // Same render-time pattern — !winner is the self-terminating guard.
  if (!winner && gameStarted) {
    const found = players.find(
      (p) => getPlayerScore(p, settlements, longestRoadHolderId, largestArmyHolderId) >= gameRules.victoryPointTarget,
    )
    if (found) setWinner(found)
  }

  // The one piece of the discard self-healing (below, near
  // activeDiscarderId): releases gamePhase once the (self-healed) queue
  // empties out. Same render-time pattern as the winner check above —
  // gamePhase !== 'discard' is what makes it self-terminating.
  if (gamePhase === 'discard' && validDiscardPlayerIds.length === 0) {
    setGamePhase('moveRobber')
  }

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
    if (!gameRules.allowAdjacentSettlements && neighbors.some((neighborId) => settlements[neighborId] != null)) {
      warn('Too close to another settlement.')
      return
    }
    if (isSetup && gameRules.coastalOnlySetupPlacement) {
      // Interior vertices always touch exactly 3 land tiles in this hex
      // grid (tiles has no ocean entries) — anything touching fewer is on
      // the board's outer edge, i.e. coastal.
      const touchingTiles = graph.vertexTileIds.get(vertexId) ?? []
      if (touchingTiles.length >= 3) {
        warn('Setup settlements must touch the coast.')
        return
      }
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
    const total = d1 + d2
    const isDouble = d1 === d2
    // House rule: a 7 rolled within the first two rolls of the game is
    // voided and rerolled instead of applied. Only the roller's own client
    // runs real physics, so this decision — unlike everything else a roll
    // triggers — can only be made here, before the result is ever
    // broadcast or handed to applyRollResult (which every client, roller
    // and spectators alike, runs identically and which increments the
    // counter this check reads). total===7 can never be a double (no pair
    // of dice sums to an odd number), so this never conflicts with the
    // doubles handling below.
    if (gameRules.noSevensFirstTwoRolls && totalRollsThisGame < 2 && total === 7) {
      inform('Rolled a 7 on an early roll — rerolling (No 7s house rule).')
      playSfx('diceRoll')
      setPhysicsRoll((prev) => ({ rollId: (prev?.rollId ?? 0) + 1 }))
      return
    }
    if (onlineInfo) {
      broadcastDiceRolled({ dice: [d1, d2], total, playerId: players[currentPlayerIndex].id })
    }
    const doublesCount = applyRollResult(total, isDouble)

    // House rule: a double grants the SAME player an immediate bonus roll,
    // same turn. Only the roller's own client can trigger it (only this
    // client runs real physics) — applyRollResult above already ran the
    // shared bookkeeping (counting the double, wiping the hand on a third
    // in a row) identically on every client, roller and spectators alike.
    if (gameRules.doublesRerollRule && isDouble && doublesCount < 3) {
      inform('Doubles! Rolling again.')
      playSfx('diceRoll')
      setIsRolling(true)
      setDiceDisplayMode('physics')
      setPhysicsRoll((prev) => ({ rollId: (prev?.rollId ?? 0) + 1 }))
    }
  }

  // Returns the resulting consecutive-doubles count, so handlePhysicsSettled
  // (the only caller that ever needs it) can decide whether to trigger a
  // bonus roll without re-deriving it from state that may not have
  // committed yet.
  const applyRollResult = (total: number, isDouble: boolean): number => {
    setIsRolling(false)
    setLastRoll(total)
    // Marks the roll as done for whoever's turn this is — every client sets
    // this, active or not, since it's a fact about the active player's turn,
    // not this browser's own state. Distributes resources (and, on a 7,
    // opens the moveRobber phase) but never touches currentPlayerIndex or
    // fires TURN_PASSED; only the End Turn button does that.
    setHasRolledThisTurn(true)
    // Only reachable with an ACCEPTED roll (a rerolled 7 returns early in
    // handlePhysicsSettled above and never reaches here), so this stays a
    // reliable "how many rolls has the game had" count for noSevensFirstTwoRolls.
    setTotalRollsThisGame((n) => n + 1)
    const doublesCount = isDouble ? consecutiveDoublesThisTurn + 1 : 0
    setConsecutiveDoublesThisTurn(doublesCount)
    // Every roll gets its own log entry — the branches below (7, resource
    // yields) may call inform() again right after this, which overwrites
    // the single active EventBanner (last write wins, same synchronous
    // batch), but logEvent inside inform() APPENDS rather than replacing,
    // so this line still shows up in EventLogPanel's history even when the
    // banner itself never visibly displays it.
    inform(`${players[currentPlayerIndex].name} rolled a ${total}.`)

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
      return doublesCount
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

    // House rule: a third consecutive double empties the roller's hand —
    // unconditionally, overriding whatever this same roll's own resource
    // yield above just granted. total===7 can never be a double, so this
    // never races the discard/moveRobber branch further up.
    if (gameRules.doublesRerollRule && doublesCount >= 3) {
      const loser = players[currentPlayerIndex]
      setPlayers((prev) => prev.map((p) => (p.id === loser.id ? { ...p, resources: emptyResources() } : p)))
      inform(`${loser.name} rolled doubles three times in a row — hand emptied!`)
    }

    return doublesCount
  }

  const handleDiceSettled = () => {
    if (!diceRoll) return
    // Spectator-side mirror of a broadcast roll — never triggers its own
    // bonus reroll (only the roller's handlePhysicsSettled does that), so
    // the returned doublesCount has no caller here.
    applyRollResult(diceRoll.d1 + diceRoll.d2, diceRoll.d1 === diceRoll.d2)
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
        // Friendly Robber: skip anyone at 2 or fewer PUBLIC victory points
        // (matches what everyone at the table can already see — a hidden
        // VP card shouldn't spare or expose a player this check wouldn't
        // otherwise apply to).
        if (gameRules.friendlyRobber) {
          const owner = playerById.get(building.ownerId)
          if (owner && getPublicScore(owner, settlements, longestRoadHolderId, largestArmyHolderId) <= 2) continue
        }
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
    // Now that the trade window can stay open across a turn change (see
    // GameHud.tsx), this can no longer rely on the UI simply hiding the
    // button while it's not your turn — bankTrade always acts on
    // players[currentPlayerIndex], so without this check a window left
    // open from a past turn could mutate whoever's turn it currently is.
    if (!isMyTurn) {
      warn("It's not your turn.")
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
    // Same reasoning as bankTrade's guard just above — this always reads
    // players[currentPlayerIndex] as the offerer, so a trade window left
    // open from a past turn needs its own check now that it's no longer
    // unmounted the instant the turn passes.
    if (!isMyTurn) {
      warn("It's not your turn.")
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
    // Present only on a fresh Start Game submission (LocalSetup/OnlineSetup
    // both always pass one). Omitted on restart/return-to-menu, which fall
    // back to the CURRENT boardShapeId state — "New Game" reshuffles tiles
    // but deliberately keeps whatever shape was originally chosen.
    shapeId?: BoardShapeId,
    // Set together with shapeId on a fresh submission — a player-drawn
    // shape's raw cells, or undefined if they picked a built-in one (which
    // must still WIN over a stale custom shape from an earlier game this
    // session, hence gating on isFreshSubmission below rather than `??`).
    customCells?: BoardCell[],
    // Present only on a fresh submission — same "keeps the prior value on
    // restart" treatment as shapeId, gated on the SAME isFreshSubmission
    // flag rather than its own presence check.
    rules?: GameRules,
    colorTokens?: PlayerColorToken[],
  ) => {
    const isFreshSubmission = shapeId !== undefined
    const effectiveShapeId = shapeId ?? boardShapeId
    const effectiveCustomCells = isFreshSubmission ? customCells : customBoardCells
    const effectiveRules = isFreshSubmission ? (rules ?? gameRules) : gameRules
    setBoardShapeId(effectiveShapeId)
    setCustomBoardCells(effectiveCustomCells)
    setGameRules(effectiveRules)
    setTotalRollsThisGame(0)
    setConsecutiveDoublesThisTurn(0)
    // Local Pass & Play omits the seed entirely and keeps its original
    // random board.
    const freshTiles = buildHexBoard(
      online ? (boardSeed ?? online.roomCode) : undefined,
      effectiveShapeId,
      effectiveCustomCells,
    )
    setTiles(freshTiles)
    setRobberTileId(freshTiles.find((tile) => tile.biome === 'desert')!.id)
    setPlayerCount(count)
    // Explicit names (a fresh Start Game submission) replace what's
    // remembered; omitting the argument (restart / return-to-menu) reuses
    // whatever was last entered, so those flows don't reset names to defaults.
    const resolvedNames = names ?? playerNames
    if (names) setPlayerNames(names)
    setPlayers(createInitialPlayers(count, resolvedNames, isFreshSubmission ? colorTokens : undefined))
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
    // Snapshots saved before board shapes existed won't have this field —
    // 'standard' is the only shape that could have produced them.
    const shapeId = snapshot.boardShapeId ?? 'standard'
    setBoardShapeId(shapeId)
    setCustomBoardCells(snapshot.customBoardCells)
    // Same fallback reasoning as boardShapeId — pre-house-rules snapshots
    // default to standard behavior.
    setGameRules(snapshot.gameRules ?? DEFAULT_GAME_RULES)
    setTotalRollsThisGame(snapshot.totalRollsThisGame ?? 0)
    setConsecutiveDoublesThisTurn(snapshot.consecutiveDoublesThisTurn ?? 0)
    const freshTiles = buildHexBoard(online.roomCode, shapeId, snapshot.customBoardCells)
    setTiles(freshTiles)
    setPlayerCount(snapshot.playerNames.length)
    setPlayerNames(snapshot.playerNames)
    // Player colors are already on each snapshot.players entry (colorToken)
    // — no separate restore step needed.
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
      // resetGame treats a defined shapeId as "this is a fresh submission,
      // not a restart" — info.boardShapeId is left undefined by the setup
      // screens specifically when a custom shape was chosen, so it has to
      // be defaulted here rather than passed through as-is, or a custom
      // pick would be mistaken for a restart-with-no-shape-change.
      resetGame(
        info.playerCount,
        info.names,
        info.online,
        undefined,
        info.boardShapeId ?? 'standard',
        info.customBoardCells,
        info.gameRules ?? DEFAULT_GAME_RULES,
        info.colorTokens,
      )
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
      boardShapeId,
      customBoardCells,
      gameRules,
      totalRollsThisGame,
      consecutiveDoublesThisTurn,
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
    boardShapeId,
    customBoardCells,
    gameRules,
    totalRollsThisGame,
    consecutiveDoublesThisTurn,
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
          <SceneRig outerSize={frameOuterSize} />
          <BoardFrame innerSize={frameInnerSize} />
          <Ocean innerSize={frameInnerSize} />
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
            remoteHover={remoteHover}
            onHoverChange={(target) => {
              if (!onlineInfo) return
              broadcastHoverChanged({ playerId: players[currentPlayerIndex].id, ...target })
            }}
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
            // 18 was tuned so the standard tray (outerSize 13.6) is fully
            // visible at max zoom-out — scaling by that same ratio keeps a
            // bigger board's tray from being zoomed-out-of-reach; never
            // less than 18, so standard's own feel is untouched.
            maxDistance={Math.max(18, frameOuterSize * (18 / 13.6))}
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
        eventLog={eventLog}
        chatMessages={chatMessages}
        onSendChatMessage={sendChatMessage}
      />
    </div>
  )
}

export default App
