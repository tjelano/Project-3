import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CatanBoard } from './components/CatanBoard'
import { FreeCameraControls } from './components/FreeCameraControls'
import { SceneRig } from './components/SceneRig'
import { BoardFrame } from './components/BoardFrame'
import { CanvasErrorBoundary } from './components/CanvasErrorBoundary'
import { Ocean } from './components/Ocean'
import { computeFrameInnerSize, computeFrameOuterSize } from './three/layout'
import { BoardInteractions } from './components/BoardInteractions'
import { RobberLayer } from './components/RobberLayer'
import { TileSwapLayer } from './components/TileSwapLayer'
import { MerchantLayer } from './components/MerchantLayer'
import { KnightLayer } from './components/KnightLayer'
import { PillageLayer } from './components/PillageLayer'
import { PortMarkers } from './components/PortMarkers'
import { Dice3D, type DiceRollTarget, type EventDieFace } from './components/Dice3D'
import { PhysicsDice3D, type PhysicsRollTarget } from './components/PhysicsDice3D'
import { PlayerHand3D } from './components/PlayerHand3D'
import { GameHud } from './components/hud/GameHud'
import { BarbarianAttackModal } from './components/hud/BarbarianAttackModal'
import { StartScreen, type GameStartInfo } from './components/hud/StartScreen'
import type { PendingTrade } from './components/hud/TradeOfferPrompt'
import type { ProgressCardPlayHandlers } from './components/hud/ProgressCardsPanel'
import {
  useRoomChannel,
  type RoomPlayer,
  type HoverChangedPayload,
  type ChatMessagePayload,
} from './multiplayer/useRoomChannel'
import { saveMatchSnapshot, loadMatchSnapshot, type MatchSnapshot } from './multiplayer/matchSnapshot'
import { normalizePlayerName } from './multiplayer/roomCode'
import { buildHexBoard, type BoardCell, type BoardShapeId, type Biome } from './data/hexBoard'
import { createSeededRandom } from './utils/seededRandom'
import { playSfx } from './audio/sfx'
import { assignPorts, buildBoardGraph, buildVertexAdjacency } from './data/boardGraph'
import { revealTilesForVertex } from './game/hiddenTiles'
import { autoDiscardCounts, applyDiscardCounts, discardHandSize, discardThreshold } from './game/discard'
import { buildProgressCardDeck, progressCardHandExcess, resolveEventDieDraws, rollEventDie } from './game/progressCards'
import {
  canAffordImprovement,
  buyImprovementLevel,
  improvementLevelCost,
  MAX_IMPROVEMENT_LEVEL,
  evaluateMetropolisPurchase,
  metropolisHolderAfterPurchase,
  metropolisHolderLevel,
  unresolvedMetropolisClaimTrack,
} from './game/cityImprovements'
import { debugLog } from './utils/debugLog'
import {
  BIOME_LABELS,
  BIOME_TO_RESOURCE,
  CITY_COST,
  CITY_WALL_COST,
  COMMODITY_FOR_BIOME,
  COMMODITY_FOR_TRACK,
  COMMODITY_LABELS,
  COMMODITY_ORDER,
  DEFAULT_GAME_RULES,
  DEV_CARD_COST,
  DEV_CARD_SINGULAR,
  IMPROVEMENT_TRACK_LABELS,
  IMPROVEMENT_TRACK_NAMES,
  IMPROVEMENT_TRACK_ORDER,
  KNIGHT_ACTIVATE_COST,
  KNIGHT_PROMOTE_COST,
  KNIGHT_RECRUIT_COST,
  KNIGHT_STARTING_SUPPLY,
  KNIGHT_STRENGTH_ORDER,
  KNIGHT_STRENGTH_VALUE,
  LARGEST_ARMY_MIN_KNIGHTS,
  LONGEST_ROAD_MIN_LENGTH,
  PROGRESS_CARD_LABELS,
  PROGRESS_CARD_ORDER,
  PROGRESS_CARD_VP_TYPES,
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
  emptyCityImprovements,
  emptyCommodities,
  emptyResources,
  getPublicScore,
  removeOne,
  shuffle,
  type Building,
  type CommodityType,
  type DevCardType,
  type GameRules,
  type ImprovementTrack,
  type KnightPiece,
  type KnightStrength,
  type MetropolisHolders,
  type Player,
  type PlayerColorToken,
  type ProgressCardType,
  type ResourceType,
  type Resources,
} from './game/types'
import { calculateLongestRoad, pickTrophyHolder } from './game/trophies'
import {
  canActivateKnight,
  canBuildCityWall,
  canPromoteKnight,
  canRecruitKnight,
  knightDisplaceTargets,
  knightMoveTargets,
  nextKnightStrength,
  reachableOpponentKnights,
  recruitableVertices,
  resolveBarbarianAttack,
  selectSmithingPromotions,
  BARBARIAN_TRACK_LENGTH,
  type BarbarianAttackResult,
  type BarbarianPillageTarget,
} from './game/knights'

export type GamePhase = 'setup' | 'playing' | 'discard' | 'moveRobber'
export type SetupStage = 'settlement' | 'road'
export type DevCardPickerMode = 'yearOfPlenty' | 'monopoly' | 'resourceMonopolyProgress' | 'tradeMonopolyProgress'
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

// Cities & Knights Medicine — CityBuiltPayload.costOverride arrives over the
// wire and flows straight into deductCost, which does no clamping and no key
// validation of its own (see game/types.ts): a negative amount would ADD
// resources instead of deducting them, and an unrecognized key would write
// NaN into a real player's resource record permanently. Same
// validate-before-mutating convention as onBankTrade/onCommodityTraded's own
// payload guards, hoisted to module scope because it needs no component
// state.
function isValidCostOverride(costOverride: Partial<Resources>): boolean {
  if (typeof costOverride !== 'object' || costOverride === null) return false
  return Object.entries(costOverride).every(
    ([resource, amount]) =>
      RESOURCE_ORDER.includes(resource as ResourceType) && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0,
  )
}

// Position (px from the bottom-left corner) of the "F — Free camera" hint —
// nudge if it ever collides with GameHud's own bottom-left panels (event
// log, etc.).
const FREE_CAM_HINT_POSITION = { bottom: 210, left: 28 }

// How long a proposed trade waits for a response before auto-cancelling —
// see the effect near resolvePlayerTrade. Bounds how long an unanswered
// offer can block the whole table (see canPerformAction).
const TRADE_OFFER_TIMEOUT_MS = 90_000

// How long the discard phase waits on a still-over-limit player before
// forcing their discard for them — see the effect near confirmDiscard.
// Bounds how long a disconnected/unresponsive player can stall the whole
// table (gamePhase can't leave 'discard' until every over-limit player has
// gone).
const DISCARD_TIMEOUT_MS = 90_000

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
    // Kept even for a non-host client — lets isEffectiveHost (below) tell
    // whether the ORIGINAL host's presence is still in the room, so host
    // authority (autosave, restart, resolving trades/discards) can fail
    // over to someone else instead of freezing the match if the host's own
    // browser is the one that's gone.
    hostName: string
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
  const [customBoardBiomeOverrides, setCustomBoardBiomeOverrides] = useState<Record<string, Biome> | undefined>(undefined)
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
  // Which seat the setup snake (and the first real turn right after it)
  // starts from — randomized per game in resetGame instead of always being
  // seat 0 (the host), so the host isn't guaranteed to go first every match.
  const [startingPlayerIndex, setStartingPlayerIndex] = useState(0)
  const setupOrder = useMemo(
    () => buildSetupOrder(playerCount, startingPlayerIndex),
    [playerCount, startingPlayerIndex],
  )

  const [players, setPlayers] = useState(() => createInitialPlayers(3))
  // O(1) lookup map for players to avoid O(N) array finds in frequent game loops/callbacks.
  // Expected performance impact: ~5x faster lookup vs Array.find for typical 3-4 player sizes.
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  // Cities & Knights knights: vertex id -> the KnightPiece standing there
  // (any player). Reused by the road-placement and settlement-placement
  // occupancy checks below, and by Task 5's KnightLayer wiring — don't
  // create a second one later.
  const knightPiecesByVertex = useMemo(
    () => new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const))),
    [players],
  )
  // Cities & Knights knights: vertex id -> owning player id, for every
  // knight currently on the board. Feeds calculateLongestRoad's optional
  // 5th argument. Naturally empty (a no-op) whenever
  // gameRules.citiesAndKnightsKnights is off, since nothing populates any
  // player's knightPieces while the rule is off.
  const knightOwnerByVertex = useMemo(
    () => new Map(Array.from(knightPiecesByVertex, ([vertexId, knight]) => [vertexId, knight.ownerId] as const)),
    [knightPiecesByVertex],
  )
  // player id -> colorToken, same shape BoardInteractions.tsx already builds
  // internally for its own ghost-hologram tint — hoisted here so KnightLayer
  // (and any other future consumer) can reuse one copy instead of each
  // building its own.
  const colorTokenByPlayerId = useMemo(() => new Map(players.map((p) => [p.id, p.colorToken])), [players])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [lastRoll, setLastRoll] = useState<number | null>(null)
  const [settlements, setSettlements] = useState<Record<string, Building>>({})
  const [roads, setRoads] = useState<Record<string, number>>({})
  // Which tiles have had a settlement built on a touching vertex — drives
  // the Hidden Tiles house rule's mist/blank-chit rendering. Empty at game
  // start regardless of hiddenTiles mode; 'off' mode just means CatanBoard
  // never checks this set. Never re-hides a tile once added — see
  // game/hiddenTiles.ts.
  const [revealedTileIds, setRevealedTileIds] = useState<Set<string>>(new Set())
  const [banner, setBanner] = useState<BannerMessage | null>(null)
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])
  // Online-only — chat has no meaning in local Pass & Play (one shared
  // screen already shows everything to everyone). Capped the same way
  // eventLog is, for the same unbounded-growth reason.
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([])
  const [diceRoll, setDiceRoll] = useState<DiceRollTarget | null>(null)
  // The most recently rolled event die face, on THIS client — written by
  // BOTH the roller's own path (handlePhysicsSettled, right where eventDie
  // is computed) and a receiver's mirrored path (beginDiceAnimation), so it
  // reads correctly on the roller's own screen (diceRoll only ever gets
  // written by beginDiceAnimation, which the roller's own client never
  // calls) and in local Pass & Play (where beginDiceAnimation never runs at
  // all, since onDiceRolled never fires with no network). Deliberately its
  // own state rather than reading diceRoll.eventDie for that reason — not a
  // dedup of the same value, a genuinely different write path.
  const [lastEventDie, setLastEventDie] = useState<EventDieFace | null>(null)
  // Who actually rolled the dice currently animating in `diceRoll` — a
  // mirrored roll's 3D tumble takes real time to settle, and a TURN_PASSED
  // broadcast for THAT SAME roll can arrive and be processed on this client
  // before the animation finishes (near-instant handler vs. an animation).
  // applyRollResult needs this to tell "the roll that's finally settling"
  // apart from "whoever is current BY THE TIME it settles" — see its own
  // comment for why conflating the two mis-marks the new turn as pre-rolled.
  const [diceRollPlayerId, setDiceRollPlayerId] = useState<number | null>(null)
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
  const [progressCardDecks, setProgressCardDecks] = useState<Record<ImprovementTrack, ProgressCardType[]>>(() => ({
    science: buildProgressCardDeck('science'),
    trade: buildProgressCardDeck('trade'),
    politics: buildProgressCardDeck('politics'),
  }))
  // Queue of players currently over the 4-card progress-card hand limit,
  // same per-player-queue shape as discardPlayerIds/scienceFreeResourcePlayerIds
  // below — deterministic (computed from each client's own now-updated
  // players state inside applyProgressCardDraws below), so no broadcast is
  // needed to populate it; every client reaches the same queue independently
  // from the same trusted-applied hand contents.
  const [progressCardOverLimitPlayerIds, setProgressCardOverLimitPlayerIds] = useState<number[]>([])
  const [winner, setWinner] = useState<Player | null>(null)
  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null)
  // Guards resolvePlayerTrade against a rapid double-click on Accept — a
  // ref rather than state specifically because it has to block a SECOND
  // click that lands before React has re-rendered from the first one (a
  // state update wouldn't be visible yet to that second synchronous call).
  // Reset by the effect near resolvePlayerTrade whenever pendingTrade
  // itself changes, so it never blocks a genuinely NEW trade.
  const isResolvingTradeRef = useRef(false)
  const [freeRoadsRemaining, setFreeRoadsRemaining] = useState(0)
  // Cities & Knights Alchemy — set by playAlchemy (before rolling), consumed
  // once by handlePhysicsSettled to override the GAME-LOGIC d1/d2 for that
  // one roll (physics still tumbles and visually shows its own real result —
  // see handlePhysicsSettled's own comment for why that mismatch is
  // deliberate). null the rest of the time.
  const [alchemyPreset, setAlchemyPreset] = useState<[number, number] | null>(null)
  // Cities & Knights Crane — set by playCrane, cleared by the refund step
  // inside buyCityImprovement once the discount is actually consumed by a
  // purchase. Names a PLAYER (not a track): the card discounts whichever
  // improvement track that player buys next, not one specific track.
  const [craneDiscountPlayerId, setCraneDiscountPlayerId] = useState<number | null>(null)
  // Cities & Knights Medicine — set by playMedicine, cleared the instant the
  // discounted city placement actually resolves (buildSettlementRaw's
  // existing occupied-vertex/city-upgrade branch). Names a player, same
  // shape as craneDiscountPlayerId, for the same reason.
  const [pendingMedicineUse, setPendingMedicineUse] = useState<number | null>(null)
  // Cities & Knights Invention — set by playInvention, then filled in by 2
  // board-tile clicks (TileSwapLayer -> handleInventionTileSelect). null
  // once both tiles are chosen and the swap resolves.
  const [pendingInventionSwap, setPendingInventionSwap] = useState<{
    playerId: number
    firstTileId: string | null
  } | null>(null)
  // Cities & Knights Merchant Fleet — set by playMerchantFleet, consumed by
  // getPortRate (bank resource trades) and tradeCommodity (bank commodity
  // trades). Cleared on every turn advance (applyTurnAdvance) — the card
  // text is explicit that this only lasts "for the rest of this turn."
  const [merchantFleetRate, setMerchantFleetRate] = useState<{
    playerId: number
    type: ResourceType | CommodityType
  } | null>(null)
  // Cities & Knights Guild Dues — set by playGuildDues (which also spends
  // the card immediately, same "spend on click, resolve the argument after"
  // shape as pendingInventionSwap above), then resolved by confirmGuildDues
  // once the taker picks their 2 cards (or fewer, if the target holds
  // fewer) via OpponentHandPicker. targetId, not a fixed value, so the
  // player can switch among playersMeetingVpThreshold's eligible targets
  // (via PlayerTargetPicker) before confirming. Local-only, like every
  // other pending*-picker state above — only ever non-null on the acting
  // client's own screen.
  const [pendingGuildDues, setPendingGuildDues] = useState<{ targetId: number } | null>(null)
  // Cities & Knights Espionage — same shape as pendingGuildDues above, but
  // targeting is unrestricted ("another player," not VP-gated) and the take
  // itself is optional ("you may take 1") — see confirmEspionage.
  const [pendingEspionage, setPendingEspionage] = useState<{ targetId: number } | null>(null)
  // Cities & Knights Diplomacy (Task 12) — set by activateDiplomacy (which
  // only checks the card is held, WITHOUT spending it yet — unlike
  // pendingInventionSwap/pendingGuildDues above, the actual card spend lives
  // inside applyDiplomacyRemoval, only reached once an eligible road is
  // actually clicked, same "resolve-and-spend in one step" shape
  // applyIrrigationEffect/applySabotageEffect use). Resolved by playDiplomacy
  // via buildRoadRaw's own special-mode-first check (mirrors
  // pendingMetropolisClaim's branch in buildSettlementRaw), which routes
  // BoardInteractions' edge clicks here instead of the ordinary build flow
  // while this is set. Local-only, like every other pending*-picker state
  // above — only ever non-null on the acting client's own screen.
  const [pendingDiplomacyRemoval, setPendingDiplomacyRemoval] = useState<{ playerId: number } | null>(null)
  const [devCardPicker, setDevCardPicker] = useState<DevCardPickerMode | null>(null)
  const [longestRoadHolderId, setLongestRoadHolderId] = useState<number | null>(null)
  const [largestArmyHolderId, setLargestArmyHolderId] = useState<number | null>(null)
  // Cities & Knights Metropolis — per-track control (who currently holds
  // each track's Metropolis, for scoring) and per-track placement (which of
  // that player's own city vertices carries the marker, for the 3D board —
  // Task 7). Kept as two separate records rather than one, since control is
  // per-player but the marker itself sits on one specific city (see the
  // design note on Task 6's own plan entry).
  const [metropolisHolders, setMetropolisHolders] = useState<MetropolisHolders>({ science: null, trade: null, politics: null })
  const [metropolisVertexIds, setMetropolisVertexIds] = useState<Record<ImprovementTrack, string | null>>({
    science: null,
    trade: null,
    politics: null,
  })
  // Set the instant a purchase actually claims a track's Metropolis, cleared
  // the instant the resulting city-selection click resolves
  // (buildSettlementRaw's early branch, below).
  //
  // Carries the CLAIMING player's id, not just the track: the click-time
  // branch resolves against that captured id rather than against
  // players[currentPlayerIndex], so it can never quietly attribute a claim to
  // whoever happens to be the current player at click time. (handleEndTurn
  // also refuses to advance the turn while a claim is pending, so in practice
  // the two are the same player — but this makes it true by construction
  // rather than by convention, and it's what lets a reconnect restore the
  // claim to the right player.)
  //
  // Local-only UI state, deliberately NOT part of MatchSnapshot — an
  // interrupted claim is instead RE-DERIVED on restore from the persisted
  // holders/levels (see restoreFromSnapshot and
  // `unresolvedMetropolisClaimTrack`), which works even when the claimant
  // isn't the snapshot-writing host.
  const [pendingMetropolisClaim, setPendingMetropolisClaim] = useState<{
    track: ImprovementTrack
    playerId: number
  } | null>(null)

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
  // Indices into the OVER-LIMIT player's progressCards array, not card
  // identities — mirrors discardSelection's own composite-id approach to
  // the same "which specific instance of a possibly-duplicated card"
  // problem, just index-based since progress cards have no natural id
  // string the way resources do.
  const [progressDiscardSelection, setProgressDiscardSelection] = useState<number[]>([])
  // Player IDs owed a Science level 3 free-resource pick after the most
  // recent non-7 roll (production resolved, but they got nothing from it).
  // Deliberately its OWN queue, not the single-current-player devCardPicker
  // state below — this can trigger for ANY player, not just whoever's turn
  // it is, and possibly several players from the same roll. Mirrors
  // discardPlayerIds' shape (see applyRollResult and
  // activeScienceFreeResourcePlayerId below). The two queues never overlap:
  // discard only triggers on a 7, this explicitly excludes a 7.
  const [scienceFreeResourcePlayerIds, setScienceFreeResourcePlayerIds] = useState<number[]>([])
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

  // True while FreeCameraControls (toggled with F) has taken over the
  // camera — OrbitControls is disabled for the duration so the two never
  // fight over the same mouse/pointer-lock input.
  const [isFreeCamActive, setIsFreeCamActive] = useState(false)

  // A lost WebGL context (GPU driver reset, VRAM pressure, tab backgrounded
  // too long) does not throw — CanvasErrorBoundary can't catch it, and
  // three's default recovery doesn't reliably re-run onBeforeCompile shader
  // injections. Bumping this key forces a full Canvas remount, which is the
  // one recovery path guaranteed to reinitialize every custom shader and
  // GPU resource from scratch instead of leaving a permanently black canvas.
  const [canvasInstance, setCanvasInstance] = useState(0)

  const [robberTileId, setRobberTileId] = useState(() => tiles.find((tile) => tile.biome === 'desert')!.id)

  // Cities & Knights robber activation — starts inert (robber behaves as
  // base-game: always movable on a rolled 7). Permanently flips true the
  // first time a barbarian attack resolves (Task 4), regardless of
  // outcome. Until then, a 7 still forces discard but the robber never
  // moves and nothing is stolen — CN3087 p.7: "The robber does not
  // activate until after it has been placed on the desert following the
  // first barbarian attack."
  const [robberActive, setRobberActive] = useState(false)

  // Cities & Knights barbarian ship position on its 7-space track (0-6).
  // Advances on each 'ship' event-die face; resets to 0 after every attack.
  const [barbarianTrackPosition, setBarbarianTrackPosition] = useState(0)

  // Cities & Knights barbarian attack (Task 5) — the CURRENT result being
  // walked through (for the modal's headline/strength-comparison display),
  // plus the full pending lists for both post-attack choices (NOT assumed
  // front-ordered — see activePillageTarget/activeWinnerDrawPlayerId below
  // for why).
  const [activeBarbarianAttack, setActiveBarbarianAttack] = useState<BarbarianAttackResult | null>(null)
  const [pillageQueue, setPillageQueue] = useState<BarbarianPillageTarget[]>([])
  const [winnerDrawQueue, setWinnerDrawQueue] = useState<number[]>([]) // player ids, tied winners only

  // Cities & Knights Merchant (Task 13) — App-level board-piece state, same
  // category as robberTileId just above, not a per-player field: the piece
  // sits on one tile and is controlled by at most one player at a time,
  // independent of createInitialPlayers/Player. null until the card is
  // first played and placed.
  const [merchantTileId, setMerchantTileId] = useState<string | null>(null)
  const [merchantHolderId, setMerchantHolderId] = useState<number | null>(null)
  // Non-null only on the acting client's own screen while a placement is in
  // progress — local-only, never broadcast, same treatment
  // pendingInventionSwap/pendingDiplomacyRemoval already get. Carries the
  // placing player's id (gates MerchantLayer's eligible-tile filter and its
  // `active` rendering), not an object, since there's nothing else to track
  // between the card being spent and the single tile click that resolves it.
  const [pendingMerchantPlacement, setPendingMerchantPlacement] = useState<number | null>(null)

  // Cities & Knights Engineering (Task 13) — non-null only on the acting
  // client's own screen while a free-wall pick is in progress, same
  // local-only treatment pendingMerchantPlacement just above gets. Carries
  // the playing player's id (compared against ResourcePanel's `viewer.id` in
  // GameHud to derive `freeWallActive`, which reuses Task 12's own Wall
  // buttons rather than a dedicated picker — see playEngineering's own
  // comment below), not an object, same "nothing else to track between the
  // card being spent and the single click that resolves it" reasoning.
  const [pendingFreeCityWall, setPendingFreeCityWall] = useState<number | null>(null)

  // Cities & Knights knight recruit — non-null only on the acting client's
  // own screen while a placement is in progress, same local-only treatment
  // pendingMerchantPlacement/pendingInventionSwap already get.
  const [pendingKnightRecruit, setPendingKnightRecruit] = useState<number | null>(null)
  // Cities & Knights knight move/displace — which of the viewer's OWN
  // knights is currently armed for a Move or Displace action. Mutually
  // exclusive with pendingKnightRecruit (KnightsPanel only ever arms one
  // mode at a time) and with each other (armMode discriminates).
  const [armedKnightAction, setArmedKnightAction] = useState<{ knightId: string; mode: 'move' | 'displace' } | null>(
    null,
  )
  // Cities & Knights knight promote (Task 8) — once per turn, per knight
  // INSTANCE (a future Smithing card promotes 2 different knights for free
  // in one play, which must stay legal, so this is a Set of knight ids, not
  // a single flag or count). Cleared in applyTurnAdvance alongside
  // pendingKnightRecruit/armedKnightAction just above — same "shared
  // choke point for both the local end-turn action AND the remote
  // TURN_PASSED receiver" reasoning, not handleEndTurn, which only guards
  // and delegates to endTurn -> applyTurnAdvance.
  const [knightsPromotedThisTurn, setKnightsPromotedThisTurn] = useState<Set<string>>(new Set())
  // Cities & Knights "Chase Away the Robber" (Task 11) — which knight is
  // mid-action while gamePhase is 'moveRobber' via THIS entry point (as
  // opposed to a rolled 7). Local-only, cleared once moveRobber resolves —
  // also cleared in applyTurnAdvance below for defense-in-depth consistency
  // with pendingKnightRecruit/armedKnightAction just above, even though
  // moveRobber always resolves synchronously within the same interaction
  // that arms it and so never needs to survive to a turn boundary.
  const [chasingRobberKnightId, setChasingRobberKnightId] = useState<string | null>(null)

  // Cities & Knights Intrigue (Task 14) — non-null only on the acting
  // client's own screen while a displace target is being chosen, same
  // local-only "spend up front, resolve on the next click" treatment
  // pendingMerchantPlacement/pendingFreeCityWall already get. Carries the
  // playing player's id — Intrigue has no mover knight of its own to arm
  // (unlike armedKnightAction's 'displace' mode above), so this is its own
  // separate flag rather than a third armedKnightAction mode. handleKnightSelect
  // checks this FIRST, before the ordinary-displace body, so the two
  // branches never both fire for the same click.
  const [pendingIntrigueDisplace, setPendingIntrigueDisplace] = useState<number | null>(null)
  // Cities & Knights Treason (Task 14) — non-null only on the acting
  // client's own screen while the replacement-knight placement is pending,
  // same local-only treatment pendingKnightRecruit already gets. Carries
  // maxStrength/active from the just-removed knight (CN3087: "the same
  // strength or lower... matching active/inactive status" — see
  // playTreason's own comment for the exact rule and for why this shares
  // ONE derivation with handleKnightVertexSelect's own resolution instead
  // of two independent approximations that could disagree).
  const [pendingTreasonPlacement, setPendingTreasonPlacement] = useState<{
    playerId: number
    maxStrength: KnightStrength
    active: boolean
  } | null>(null)

  // Monotonic counter backing every new KnightPiece.id (Recruit and
  // Treason's replacement placement both call this). A `Date.now()`-based
  // id used to do this job, but that's both a react-hooks/purity ESLint
  // violation (Date.now() is impure) and a genuine collision risk: two
  // knights created for the same player within the same millisecond would
  // get the identical id, and that id is the key every knight lookup/
  // broadcast/knightsPromotedThisTurn entry uses.
  const knightIdCounterRef = useRef(0)
  const nextKnightId = (playerId: number): string => {
    knightIdCounterRef.current += 1
    return `knight-${playerId}-${knightIdCounterRef.current}`
  }

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
    // Cities & Knights Guild Dues/Espionage — the card is already spent the
    // instant either pending* state is set (playGuildDues/playEspionage),
    // same "forced choice already in motion" reasoning as devCardPicker
    // just above, so every other action (including ending the turn, which
    // calls this first) stays blocked until OpponentHandPicker resolves.
    if (pendingGuildDues) {
      warn('Finish taking your Guild Dues cards first.')
      return false
    }
    if (pendingEspionage) {
      warn('Finish playing Espionage first.')
      return false
    }
    if (activeScienceFreeResourcePlayerId != null) {
      warn('Resolve the free resource pick first.')
      return false
    }
    return true
  }

  // The progress-card equivalent of canPlayDevCardNow (further down, next to
  // the dev-card play handlers), minus the two parts that don't apply:
  // progress cards aren't purchased, so there's no once-per-turn limit and no
  // "bought this turn" exclusion, and each handler already checks its own
  // specific card is in hand. What's left is exactly the shared phase gate
  // every dev-card play has always had and no progress-card handler had at
  // all (only isMyTurn, from Task 7's correction) — so progress cards were
  // playable during gamePhase 'discard', mid-roll, and during 'moveRobber'.
  // The discard case is the one buyCityImprovement's own comment already
  // warns about: an action taken mid-discard changes the very hand the
  // player's own REQUIRED discard was sized against. isMyTurn stays in the
  // individual handlers (they each need players[currentPlayerIndex] anyway)
  // and is checked immediately after this call, mirroring canPlayDevCardNow's
  // own ordering: canPerformAction, then phase/rolling, then whose turn it is.
  //
  // Declared up here rather than beside canPlayDevCardNow for the reason
  // applyCommercialHarborEffect's own comment spells out: a plain top-level
  // const in this component referencing another declared LATER trips this
  // project's react-hooks lint config, and the earliest caller
  // (playCommercialHarbor) sits well above canPlayDevCardNow.
  const canPlayProgressCardNow = (): boolean => {
    if (!canPerformAction()) return false
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't play a progress card right now.")
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
    // nextIndex on the receiving side comes straight off another player's
    // TURN_PASSED broadcast — trusted by every OTHER handler in this file,
    // but this one feeds straight into players[nextIndex] all over the app
    // (GameHud's currentPlayer, turn checks, etc.) with no guard anywhere
    // downstream. A malformed/out-of-range broadcast used to make that
    // undefined, throwing on the very next render with nothing above it to
    // catch it — crashing every connected client at once, not just the
    // sender's own tab.
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= players.length) {
      console.error('[Catan] Ignoring TURN_PASSED with an out-of-range player index:', nextIndex)
      return
    }
    setFreeRoadsRemaining(0)
    setDevCardPlayedThisTurn(false)
    setHasRolledThisTurn(false)
    setConsecutiveDoublesThisTurn(0)
    // Cities & Knights Merchant Fleet — "for the rest of this turn," so any
    // active rate expires the instant the turn actually passes, regardless
    // of who it passes to.
    setMerchantFleetRate(null)
    // Cities & Knights knight recruit/move/displace — unlike
    // pendingMerchantPlacement (which spends its card up front and so
    // BLOCKS end-turn instead, see handleEndTurn), recruiting spends
    // nothing until the vertex click resolves, so there's nothing to
    // strand by silently clearing it here instead. Without this, a stale
    // pendingKnightRecruit/armedKnightAction from the OUTGOING player would
    // leave KnightLayer's target rings live and clickable on the incoming
    // player's turn — isMyTurn and pendingKnightRecruit != null would both
    // still read true, but pendingKnightRecruit would still hold the
    // OUTGOING player's id, letting the incoming player's click place (and
    // pay for) a knight on the outgoing player's behalf.
    setPendingKnightRecruit(null)
    setArmedKnightAction(null)
    // Cities & Knights "Chase Away the Robber" (Task 11) — chasingRobberKnightId
    // is local-only and always cleared synchronously within moveRobber's own
    // body before this function could ever run for the same action, so this
    // is defense-in-depth only (matching pendingKnightRecruit/armedKnightAction
    // just above), not a fix for an observed exploit.
    setChasingRobberKnightId(null)
    // Cities & Knights knight promote (Task 8) — same turn-boundary exploit
    // pendingKnightRecruit's own comment above describes: without this, a
    // stale knightsPromotedThisTurn entry from the OUTGOING player would
    // wrongly block the incoming player from promoting a same-id-coincident
    // knight, or (more importantly) simply never get cleared for the
    // outgoing player's own next turn. Cleared here — not in
    // handleEndTurn, which only guards and delegates to endTurn, which
    // calls this — so both the local end-turn action and the remote
    // TURN_PASSED receiver apply the identical reset.
    setKnightsPromotedThisTurn(new Set())
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

  // Only ever mirrors another player's DICE_ROLLED broadcast (the local
  // roller's own roll runs real physics via PhysicsDice3D/handlePhysicsSettled
  // instead) — the 3D dice animate toward the same (d1, d2), after which
  // handleDiceSettled/applyRollResult below applies the result. playerId is
  // remembered alongside it so applyRollResult can tell whether this roll is
  // still current by the time the animation actually finishes.
  const beginDiceAnimation = (d1: number, d2: number, eventDie: EventDieFace, playerId: number) => {
    setIsRolling(true)
    playSfx('diceRoll')
    setDiceRoll((prev) => ({ d1, d2, eventDie, rollId: (prev?.rollId ?? 0) + 1 }))
    setLastEventDie(eventDie)
    setDiceRollPlayerId(playerId)
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
    setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
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

  // costOverride — Cities & Knights Medicine's discounted 1 Wheat + 2 Ore
  // price, in place of the normal CITY_COST deduction. Defaults to CITY_COST
  // when absent, so every non-Medicine caller (setup, an ordinary city
  // upgrade, the broadcast receiver for those) is unaffected.
  const applyCityPlacement = (vertexId: string, playerId: number, costOverride?: Partial<Resources>) => {
    setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: playerId, type: 'city' } }))
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              resources: deductCost(p.resources, costOverride ?? CITY_COST),
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
        // The snake's starting seat (setupOrder[0], randomized in resetGame)
        // takes the first REAL turn too, same as standard Catan rules —
        // whoever placed first also rolls first.
        setCurrentPlayerIndex(setupOrder[0])
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
    // Broadcast-sourced — validated before ever being used as a resources[]
    // key/arithmetic operand. An untrusted or version-mismatched payload
    // with a bogus resource string would otherwise write NaN into a real
    // player's resource count permanently (every future +/- on it stays
    // NaN), which then poisons the 7-card discard threshold for the rest
    // of the match. Falls back to "nothing stolen" rather than dropping the
    // whole robber move, same as a genuinely empty-handed victim.
    const safeStolenResource = stolenResource != null && RESOURCE_ORDER.includes(stolenResource) ? stolenResource : null
    if (stolenResource != null && safeStolenResource == null) {
      console.error('[Catan] Ignoring robber-move payload with an invalid stolen resource:', stolenResource)
    }
    setRobberTileId(tileId)
    playSfx('robber')

    let stealNote = ''
    if (victimId != null && safeStolenResource != null) {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id === victimId) {
            return { ...p, resources: { ...p.resources, [safeStolenResource]: p.resources[safeStolenResource] - 1 } }
          }
          if (p.id === thiefId) {
            return { ...p, resources: { ...p.resources, [safeStolenResource]: p.resources[safeStolenResource] + 1 } }
          }
          return p
        }),
      )
      const thief = playerById.get(thiefId)
      const victim = playerById.get(victimId)
      if (thief && victim) {
        stealNote = ` ${thief.name} stole 1 ${RESOURCE_LABELS[safeStolenResource]} from ${victim.name}!`
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

  // Cities & Knights Resource Monopoly — a SEPARATE effect from base-game
  // Monopoly's applyMonopolyEffect just above, NOT a reuse of it. The card
  // text is "2 of that resource if they have them (or their last one if
  // they only have 1)" — capped, not take-all — so reusing
  // applyMonopolyEffect verbatim would over-collect (a real rules bug, not
  // a cosmetic naming difference; caught in this task's own review).
  // Shared by the local actor (resolveDevCardPicker's resourceMonopolyProgress
  // branch, below) and the receiving client (onResourceMonopolyPlayed),
  // same trust model as every other progress-card effect in this file.
  const applyResourceMonopolyProgressEffect = (playerId: number, resource: ResourceType) => {
    let collected = 0
    const victimNotes: string[] = []
    setPlayers((prev) => {
      const next = prev.map((p) => {
        if (p.id === playerId || p.resources[resource] <= 0) return p
        const take = Math.min(2, p.resources[resource]) // "2, or their last one if they only have 1"
        victimNotes.push(`${take} from ${p.name}`)
        collected += take
        return { ...p, resources: { ...p.resources, [resource]: p.resources[resource] - take } }
      })
      return next.map((p) =>
        p.id === playerId ? { ...p, resources: { ...p.resources, [resource]: p.resources[resource] + collected } } : p,
      )
    })
    const player = playerById.get(playerId)
    if (player) {
      inform(
        collected > 0
          ? `${player.name} monopolized ${RESOURCE_LABELS[resource]} — seized ${collected} card${collected === 1 ? '' : 's'} (${victimNotes.join(', ')})!`
          : `${player.name} played Resource Monopoly on ${RESOURCE_LABELS[resource]}, but no one had any.`,
      )
    }
  }

  // Cities & Knights Trade Monopoly — sibling to applyMonopolyEffect and
  // applyResourceMonopolyProgressEffect above, but takes only 1 of the
  // announced commodity per player (matching the physical card's "1 of
  // that commodity if they have it" text — neither base Monopoly's
  // take-all nor Resource Monopoly's take-2-or-fewer). Shared by the local
  // actor (resolveDevCardCommodityPicker, below) and the receiving client
  // (onTradeMonopolyPlayed), same trust model as every other progress-card
  // effect in this file.
  const applyTradeMonopolyEffect = (playerId: number, commodity: CommodityType) => {
    let collected = 0
    const victimNotes: string[] = []
    setPlayers((prev) => {
      const next = prev.map((p) => {
        if (p.id === playerId || p.commodities[commodity] <= 0) return p
        victimNotes.push(`1 from ${p.name}`)
        collected += 1
        return { ...p, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 } }
      })
      return next.map((p) =>
        p.id === playerId ? { ...p, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + collected } } : p,
      )
    })
    const player = playerById.get(playerId)
    if (player) {
      inform(
        collected > 0
          ? `${player.name} monopolized ${COMMODITY_LABELS[commodity]} trade — collected ${collected} card${collected === 1 ? '' : 's'} (${victimNotes.join(', ')})!`
          : `${player.name} played Trade Monopoly on ${COMMODITY_LABELS[commodity]}, but no one had any.`,
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
  // every other structural mutation in this file. counts is a resource/
  // commodity -> quantity tally (derived from the discarder's flagged card
  // ids), not a full resources/commodities object, so it composes with
  // whatever that player's holdings happen to be on THIS client — no risk
  // of clobbering a concurrent change from something else.
  const applyDiscard = (playerId: number, counts: Partial<Record<ResourceType | CommodityType, number>>) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p
        const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
        return { ...p, resources, commodities }
      }),
    )
    const remaining = discardPlayerIds.filter((id) => id !== playerId)
    setDiscardPlayerIds(remaining)
    debugLog('applyDiscard', { playerId, counts, discardPlayerIdsBefore: discardPlayerIds, remaining })
    // Cities & Knights barbarian-track gate (Task 3) — before the first
    // barbarian attack resolves, the robber stays inert: discard still
    // happens (above), but arming moveRobber is skipped and control
    // returns straight to play, same as applyRollResult's own no-discard
    // branch below.
    if (remaining.length === 0) {
      if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
        setGamePhase('moveRobber')
      } else {
        setGamePhase('playing')
      }
    }
  }

  // Trusted state mutation for one player's progress-card hand-limit
  // discard — shared by the local actor (confirmProgressDiscard, below,
  // which also broadcasts) and receiving clients (onProgressDiscardConfirmed).
  // indices are into the player's progressCards array on the CONFIRMING
  // client — every other client must already have the identical array
  // (this only ever runs after applyProgressCardDraws already synced every
  // client's copy of that player's hand), so sorting descending and
  // splicing is safe: it can't skip/misalign entries.
  const applyProgressDiscard = (playerId: number, indices: number[]) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p
        const next = [...p.progressCards]
        for (const index of [...indices].sort((a, b) => b - a)) next.splice(index, 1)
        return { ...p, progressCards: next }
      }),
    )
    setProgressCardOverLimitPlayerIds((prev) => prev.filter((id) => id !== playerId))
  }

  // Trusted state mutation for one player's Science level 3 free-resource
  // pick — shared by the local actor (resolveScienceFreeResource, below,
  // which also broadcasts) and receiving clients (onScienceFreeResourcePicked),
  // same trusted-apply split as applyDiscard above.
  const applyScienceFreeResourcePick = (playerId: number, resource: ResourceType) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 1 } } : p)),
    )
    setScienceFreeResourcePlayerIds((prev) => prev.filter((id) => id !== playerId))
  }

  // Trusted state mutation for one player's barbarian-pillage resolution —
  // shared by the local actor (handlePillageTargetSelect, below, which also
  // broadcasts) and receiving clients (onPillageResolved), same trusted-apply
  // split as applyScienceFreeResourcePick above. CN3087 p.11: a pillaged city
  // is reduced to a settlement (never destroyed outright) and loses any city
  // wall it had.
  const applyPillage = (vertexId: string, playerId: number) => {
    const owner = playerById.get(playerId)
    setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: playerId, type: 'settlement' } }))
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, cityWalls: p.cityWalls.filter((v) => v !== vertexId) } : p)),
    )
    if (owner) inform(`${owner.name}'s city was pillaged and reduced to a settlement.`)
    // Filtered by playerId, not sliced off the front — activePillageTarget
    // (Task 5) means resolution doesn't necessarily happen in queue order
    // online, where every affected player can act independently.
    setPillageQueue((prev) => prev.filter((t) => t.playerId !== playerId))
  }

  // Trusted state mutation for one tied Defender-of-Catan winner's
  // progress-card hand addition — shared by the local actor
  // (handleBarbarianWinnerDraw, below, which also broadcasts) and receiving
  // clients (onBarbarianWinnerDrawResolved), same trusted-apply split as
  // applyPillage above. `card` is the ALREADY-DRAWN card (trusted, from
  // either the local actor's own progressCardDecks[track] read or the
  // broadcast payload) — this helper never re-derives it, and deliberately
  // doesn't touch progressCardDecks itself: same reasoning as
  // applyProgressCardDraws' own comment below — the local actor sets its
  // own progressCardDecks[track] to the exact remainder it already
  // computed, while a receiver just pops the same COUNT (one card) off its
  // own independently-shuffled local copy, so each caller does its own deck
  // update after calling this.
  const applyBarbarianWinnerDraw = (playerId: number, card: ProgressCardType) => {
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, progressCards: [...p.progressCards, card] } : p)))
    // Filtered by playerId, not sliced off the front — same reasoning as
    // applyPillage above: online, tied winners resolve independently in
    // whatever order they each act, not queue order.
    setWinnerDrawQueue((prev) => prev.filter((id) => id !== playerId))
  }

  // Trusted state mutation for a city improvement purchase — shared by the
  // local actor (buyCityImprovement, below, which also broadcasts) and
  // receiving clients (onCityImprovementPurchased). Recomputes the cost from
  // THIS client's own copy of the buyer's current level via
  // buyImprovementLevel/improvementLevelCost, rather than trusting a cost
  // value sent over the wire — same trust model as every other trusted-apply
  // function in this file (applyDiscard, applyScienceFreeResourcePick, etc).
  const applyCityImprovementPurchase = (playerId: number, track: ImprovementTrack) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p
        const { commodities, cityImprovements } = buyImprovementLevel(p.commodities, p.cityImprovements, track)
        return { ...p, commodities, cityImprovements }
      }),
    )
  }

  // Trusted state mutation for a batch of progress-card draws from one
  // event-die trigger — shared by the local roller (handlePhysicsSettled,
  // below, which also broadcasts) and receiving clients
  // (onProgressCardsDrawn). Deck-count bookkeeping is intentionally NOT
  // done here — the roller sets its own progressCardDecks[track] to the
  // exact remainder its local resolveEventDieDraws computed, while a
  // receiver just needs to pop the same COUNT off its own independently-
  // shuffled local copy (see the devDeck/onDevCardBought precedent this
  // mirrors) — those are different operations on the same state, so each
  // caller does its own deck update after calling this for the hand-only
  // mutation.
  const applyProgressCardDraws = (draws: { playerId: number; card: ProgressCardType }[]) => {
    if (draws.length === 0) return
    setPlayers((prev) =>
      prev.map((p) => {
        const drawn = draws.filter((d) => d.playerId === p.id).map((d) => d.card)
        return drawn.length === 0 ? p : { ...p, progressCards: [...p.progressCards, ...drawn] }
      }),
    )
    // Deterministic — every client (roller and receivers alike) computes
    // this from its own just-updated hand, no broadcast needed. Merges
    // rather than overwrites, same reasoning as scienceFreeResourcePlayerIds
    // above: a second draw before the first discard resolves must not
    // silently drop the earlier over-limit player.
    //
    // Only players who are ACTUALLY over the limit are queued. This used to
    // enqueue every player who drew anything (Task 3's over-inclusive
    // design, filtered down later by the consumer's own
    // progressCardHandExcess call) — but the queue itself only clears on an
    // explicit Confirm click or the timeout, so a player who drew a 2nd card
    // still got the "Over the 4-Card Limit" prompt, had their Play buttons
    // repurposed into discard-selection toggles, and (since the queue
    // resolves front-only) made everyone else wait on them.
    //
    // The excess is computed from the hand AS IT WILL BE after this batch —
    // `players` here is still the pre-update snapshot, so the drawn cards
    // have to be appended explicitly. Computed outside the setPlayers
    // updater above rather than inside it, the same StrictMode-safety
    // reasoning applyWeddingEffect's own comment gives: an updater that a
    // dev-mode double-invocation runs twice must stay free of side effects.
    const overLimitIds = players
      .filter((p) => {
        const drawn = draws.filter((d) => d.playerId === p.id).map((d) => d.card)
        if (drawn.length === 0) return false
        return progressCardHandExcess([...p.progressCards, ...drawn]) > 0
      })
      .map((p) => p.id)
    debugLog('applyProgressCardDraws', { draws, overLimitIdsBefore: progressCardOverLimitPlayerIds, overLimitIds })
    // Nobody over the limit is now the COMMON case, not the exception, so
    // keep the previous array's identity in that case — the hand-limit
    // timeout effect below keys on this state's identity, and handing it a
    // fresh (still empty) array every roll would restart that timer for no
    // reason.
    if (overLimitIds.length === 0) return
    setProgressCardOverLimitPlayerIds((prev) => {
      const next = [...new Set([...prev, ...overLimitIds])]
      return next
    })
  }

  // Trusted state mutation for Trade level 3's 2:1 commodity trade — shared
  // by the local actor (tradeCommodity, below, which also broadcasts) and
  // receiving clients (onCommodityTraded). The rate is hardcoded at 2 here
  // rather than trusted over the wire (CommodityTradedPayload carries no
  // rate field at all) since this ability, unlike bank trades, has no
  // port-derived variance — it's always exactly 2:1. `receive` can name
  // either a resource or a different commodity (the rulebook allows both),
  // so which bucket gets the +1 is resolved by membership in COMMODITY_ORDER.
  const applyCommodityTrade = (playerId: number, give: CommodityType, receive: ResourceType | CommodityType) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p
        const commodities = { ...p.commodities, [give]: p.commodities[give] - 2 }
        if ((COMMODITY_ORDER as string[]).includes(receive)) {
          const receiveCommodity = receive as CommodityType
          return { ...p, commodities: { ...commodities, [receiveCommodity]: commodities[receiveCommodity] + 1 } }
        }
        const receiveResource = receive as ResourceType
        return { ...p, commodities, resources: { ...p.resources, [receiveResource]: p.resources[receiveResource] + 1 } }
      }),
    )
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
    // Renamed on destructure — `players` is already this file's own game
    // roster; this is the Realtime PRESENCE roster (who's actually
    // connected right now), a completely different thing. Previously never
    // read here at all: a mid-match disconnect/reconnect had no resync (see
    // the effect below) and the host had no fallback if THEIR OWN browser
    // was the one that dropped for good (see isEffectiveHost below).
    players: roomPresence,
    status: connectionStatus,
    broadcastDiceRolled,
    broadcastTurnPassed,
    broadcastSettlementBuilt,
    broadcastCityBuilt,
    broadcastRoadBuilt,
    broadcastRobberMoved,
    broadcastBarbarianShipAdvanced,
    broadcastBarbarianAttackResolved,
    broadcastPillageResolved,
    broadcastBarbarianWinnerDrawResolved,
    broadcastKnightPlayed,
    broadcastRoadBuildingPlayed,
    broadcastPlentyPlayed,
    broadcastMonopolyPlayed,
    broadcastResourceMonopolyPlayed,
    broadcastTradeMonopolyPlayed,
    broadcastTradeOffered,
    broadcastTradeAcceptRequest,
    broadcastTradeResolved,
    broadcastTradeCancelled,
    broadcastDiscardConfirmed,
    broadcastScienceFreeResourcePicked,
    broadcastTrophyUpdated,
    broadcastNewGame,
    broadcastDevCardBought,
    broadcastBankTrade,
    broadcastHoverChanged,
    broadcastChatMessage,
    broadcastCityImprovementPurchased,
    broadcastCommodityTraded,
    broadcastMetropolisClaimed,
    broadcastInventionSwapped,
    broadcastProgressCardsDrawn,
    broadcastProgressCardPlayed,
    broadcastProgressDiscardConfirmed,
    broadcastGuildDuesTaken,
    broadcastEspionageTaken,
    broadcastCommercialHarborPlayed,
    broadcastDiplomacyPlayed,
    broadcastMerchantMoved,
    broadcastKnightRecruited,
    broadcastKnightActivated,
    broadcastKnightPromoted,
    broadcastKnightMoved,
    broadcastKnightDisplaced,
    broadcastKnightDeactivatedAfterChase,
    broadcastCityWallBuilt,
    broadcastSmithingPlayed,
    broadcastEncouragementPlayed,
    broadcastIntrigueResolved,
    broadcastTreasonRemoved,
  } = useRoomChannel(onlineInfo?.roomCode ?? null, roomSelf, {
    // Mirrors the animation and runs local resource generation only — never
    // touches whose turn it is. Turn advancement is decoupled entirely from
    // this event; it only ever happens via TURN_PASSED, sent when the
    // roller clicks their own End Turn button.
    onDiceRolled: (payload) => {
      setDiceDisplayMode('remote')
      beginDiceAnimation(payload.dice[0], payload.dice[1], payload.eventDie, payload.playerId)
    },
    onTurnPassed: (payload) => applyTurnAdvance(payload.nextPlayerIndex),
    onSettlementBuilt: (payload) => applySettlementPlacement(payload.vertexId, payload.playerId, gamePhase === 'setup'),
    // Cities & Knights Medicine — costOverride carries the discounted price
    // the acting client actually charged (see CityBuiltPayload's own
    // comment); undefined here just means "normal CITY_COST," same as any
    // ordinary city upgrade. A PRESENT one is broadcast-sourced arithmetic
    // input, so it's validated first (isValidCostOverride, module scope
    // above) — the whole broadcast is rejected rather than just dropping the
    // override, matching every other malformed-payload guard in this object:
    // silently charging full price for a city another client charged a
    // discount for would desync the builder's resources permanently, which
    // is exactly what these guards exist to prevent.
    onCityBuilt: (payload) => {
      if (payload.costOverride !== undefined && !isValidCostOverride(payload.costOverride)) {
        console.error('[Catan] Ignoring malformed city-built payload:', payload)
        return
      }
      applyCityPlacement(payload.vertexId, payload.playerId, payload.costOverride)
    },
    onRoadBuilt: (payload) =>
      applyRoadPlacement(payload.edgeId, payload.playerId, gamePhase === 'setup', payload.isFreeRoad),
    onRobberMoved: (payload) =>
      applyRobberMove(payload.tileId, payload.thiefId, payload.victimId, payload.stolenResource),
    // Cities & Knights barbarian ship (Task 4) — trusted-apply, see
    // BarbarianShipAdvancedPayload/BarbarianAttackResolvedPayload's own
    // comments in useRoomChannel.ts.
    onBarbarianShipAdvanced: (payload) => {
      setBarbarianTrackPosition(payload.position)
    },
    onBarbarianAttackResolved: (payload) => {
      setBarbarianTrackPosition(0)
      if (payload.robberActivated) {
        setRobberActive(true)
        inform('The barbarians have landed — the robber is now active.')
      }
      applyBarbarianAttackResult(payload.result)
    },
    // Cities & Knights barbarian pillage (Task 6) — trusted-apply from the
    // choosing player's own client, which already validated vertexId
    // against its own activePillageTarget.eligibleCityVertexIds before
    // sending this. This receiver has no local copy of that validation to
    // re-run (it isn't the acting player), so it applies the payload
    // directly through the SAME applyPillage helper the local actor uses —
    // safe because applyPillage filters pillageQueue by playerId rather
    // than assuming queue order.
    onPillageResolved: (payload) => {
      applyPillage(payload.vertexId, payload.playerId)
    },
    // Cities & Knights barbarian winner draw (Task 7) — trusted-apply from
    // the drawing player's own client, which already read `card` off its
    // own local progressCardDecks[track] before sending this. Broadcast-
    // sourced, so validated the same shape as onProgressCardsDrawn/
    // onScienceFreeResourcePicked above: card/track must be recognized
    // values (they land straight in a real player's hand and index
    // progressCardDecks), and playerId must still be in THIS client's own
    // winnerDrawQueue — a duplicated message must not grant a second draw.
    onBarbarianWinnerDrawResolved: (payload) => {
      if (
        !IMPROVEMENT_TRACK_ORDER.includes(payload.track) ||
        !PROGRESS_CARD_ORDER.includes(payload.card) ||
        !winnerDrawQueue.includes(payload.playerId)
      ) {
        console.error('[Catan] Ignoring malformed barbarian winner-draw payload:', payload)
        return
      }
      applyBarbarianWinnerDraw(payload.playerId, payload.card)
      // Pop the SAME COUNT (one card) off this client's own local deck
      // copy — same reasoning as onProgressCardsDrawn: contents are never
      // shown to anyone, so which specific card remains doesn't need to
      // match the acting client's; only the remaining length does.
      setProgressCardDecks((prev) => ({ ...prev, [payload.track]: prev[payload.track].slice(1) }))
    },
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
    // Resource/Trade Monopoly are progress cards, not dev cards — spent at
    // play-time via progressCards/removeOne (see playResourceMonopoly/
    // playTradeMonopoly), not spendDevCard, so a receiving client (which
    // never ran either locally) removes the card from progressCards itself
    // here before applying the identical seize effect, same "receiver
    // spends since the acting client already spent" split onPlentyPlayed/
    // onMonopolyPlayed use above.
    onResourceMonopolyPlayed: (payload) => {
      if (!RESOURCE_ORDER.includes(payload.resource)) {
        console.error('[Catan] Ignoring malformed resource-monopoly payload:', payload)
        return
      }
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'resourceMonopoly') } : p,
        ),
      )
      // applyResourceMonopolyProgressEffect, NOT applyMonopolyEffect — see
      // that function's own comment for why Resource Monopoly's take-2-or-
      // fewer effect can't reuse base Monopoly's take-all one.
      applyResourceMonopolyProgressEffect(payload.playerId, payload.resource)
    },
    onTradeMonopolyPlayed: (payload) => {
      if (!COMMODITY_ORDER.includes(payload.commodity)) {
        console.error('[Catan] Ignoring malformed trade-monopoly payload:', payload)
        return
      }
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'tradeMonopoly') } : p,
        ),
      )
      applyTradeMonopolyEffect(payload.playerId, payload.commodity)
    },
    onTradeOffered: (payload) => {
      setPendingTrade(payload)
      playSfx('tradeRequest')
    },
    // Every client hears this, but only the (effective) host acts on it —
    // see resolveTradeAsHost, below, which validates against the host's
    // own (authoritative) copy of both players' resources before applying.
    onTradeAcceptRequest: (payload) => {
      if (isEffectiveHost) resolveTradeAsHost(payload)
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
    onScienceFreeResourcePicked: (payload) => {
      // Broadcast-sourced — same validation shape as onCityImprovementPurchased
      // above: payload.resource goes straight into resources[resource]
      // arithmetic, so a bogus key would write NaN into a real player's state
      // permanently. Also requiring playerId to still be in the pending queue
      // — a duplicated message must not grant a second free pick or apply one
      // to a player who was never actually eligible on this client.
      if (!RESOURCE_ORDER.includes(payload.resource) || !scienceFreeResourcePlayerIds.includes(payload.playerId)) {
        console.error('[Catan] Ignoring malformed science free-resource payload:', payload)
        return
      }
      applyScienceFreeResourcePick(payload.playerId, payload.resource)
    },
    // Trusted-apply from the effective host's own broadcast — see the
    // render-time trophy computation below, which only runs locally for
    // !onlineInfo || isEffectiveHost. Every other client just takes
    // whatever the host says here.
    onTrophyUpdated: (payload) => {
      setLongestRoadHolderId(payload.longestRoadHolderId)
      setLargestArmyHolderId(payload.largestArmyHolderId)
    },
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
    // Same reasoning as onDevCardBought above — a city improvement purchase
    // only touches the buyer's own commodities/cityImprovements, so every
    // OTHER client still needs telling or its copy of that player's track
    // levels silently drifts. applyCityImprovementPurchase recomputes the
    // cost locally rather than trusting payload.newLevel for the deduction —
    // newLevel is carried for logging/event-log purposes only.
    onCityImprovementPurchased: (payload) => {
      // Broadcast-sourced — same validation shape as onBankTrade/
      // onCommodityTraded below, and for the same reason: payload.track goes
      // straight into commodities[COMMODITY_FOR_TRACK[track]] arithmetic and
      // cityImprovements[track], so a bogus track string would write NaN into
      // a real player's state permanently.
      if (!IMPROVEMENT_TRACK_ORDER.includes(payload.track)) {
        console.error('[Catan] Ignoring malformed city-improvement payload:', payload)
        return
      }
      applyCityImprovementPurchase(payload.playerId, payload.track)
      // Cities & Knights Crane — mirrors the acting client's own
      // pay-full-then-refund-1 discount (see buyCityImprovement's own
      // comment) so this client's copy of the buyer's commodities ends up
      // at the exact same final count, without ever needing to know
      // anything about THIS client's own (irrelevant) craneDiscountPlayerId.
      if (payload.craneDiscount) {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === payload.playerId
              ? {
                  ...p,
                  commodities: {
                    ...p.commodities,
                    [COMMODITY_FOR_TRACK[payload.track]]: p.commodities[COMMODITY_FOR_TRACK[payload.track]] + 1,
                  },
                }
              : p,
          ),
        )
      }
    },
    onProgressCardsDrawn: (payload) => {
      // Broadcast-sourced — same validation shape as onCityImprovementPurchased:
      // payload.track goes straight into progressCardDecks[track] indexing, so
      // a bogus value must be rejected before use.
      //
      // The draws array needs the same treatment its sibling
      // onProgressCardPlayed already gives its single `card` field: every
      // drawn card lands in a real player's hand and later keys
      // PROGRESS_CARD_ART/PROGRESS_CARD_LABELS lookups, where an unrecognized
      // value renders a broken image and an undefined label. playerId is
      // checked too — applyProgressCardDraws would ignore an unknown id for
      // the hand update but still enqueue it for a hand-limit discard, and
      // neither the Confirm button nor the timeout can ever clear a queue
      // entry for a player who doesn't exist (both bail on the playerById
      // lookup), stalling the queue behind it forever. One draw per player
      // per event die is the hard maximum, hence the length bound.
      if (
        !IMPROVEMENT_TRACK_ORDER.includes(payload.track) ||
        !Array.isArray(payload.draws) ||
        payload.draws.length > players.length ||
        !payload.draws.every((draw) => PROGRESS_CARD_ORDER.includes(draw.card) && players.some((p) => p.id === draw.playerId))
      ) {
        console.error('[Catan] Ignoring malformed progress-card-draw payload:', payload)
        return
      }
      applyProgressCardDraws(payload.draws)
      // Pop the SAME COUNT off this client's own local deck copy — contents
      // never shown to anyone, so which specific cards remain doesn't need to
      // match the roller's; only the remaining length does.
      setProgressCardDecks((prev) => ({
        ...prev,
        [payload.track]: prev[payload.track].slice(payload.draws.length),
      }))
    },
    // Generic receiver for every self-only, no-picker progress card play
    // (Irrigation/Mining here; Task 14's Merchant Fleet reuses this same
    // shape). Validated against PROGRESS_CARD_ORDER before ever being used
    // to pick which applyXEffect to dispatch to — same malformed-payload
    // guard shape as onCityImprovementPurchased/onProgressCardsDrawn above.
    // Every one of these effects is deterministic from public state, so the
    // receiver only needs to know who/which card; it never re-spends
    // separately since applyIrrigationEffect/applyMiningEffect already
    // remove the card as part of the effect (see their own comments).
    onProgressCardPlayed: (payload) => {
      if (!PROGRESS_CARD_ORDER.includes(payload.card)) {
        console.error('[Catan] Ignoring malformed progress-card-played payload:', payload)
        return
      }
      if (payload.card === 'irrigation') applyIrrigationEffect(payload.playerId)
      else if (payload.card === 'mining') applyMiningEffect(payload.playerId)
      else if (payload.card === 'crane') applyCraneEffect(payload.playerId)
      else if (payload.card === 'medicine') applyMedicineEffect(payload.playerId)
      else if (payload.card === 'progressRoadBuilding') setFreeRoadsRemaining((prev) => prev + 2)
      // Sabotage/Wedding are also fully deterministic from public state (VP
      // comparison) plus each affected player's OWN hand contents — see
      // applySabotageEffect/applyWeddingEffect's own comments — so, same as
      // Irrigation/Mining/Crane/Medicine above, a receiver just needs to
      // know who played which card.
      else if (payload.card === 'sabotage') applySabotageEffect(payload.playerId)
      else if (payload.card === 'wedding') applyWeddingEffect(payload.playerId)
      else if (payload.card === 'invention') {
        // Unlike Irrigation/Mining/Crane/Medicine, Invention's effect isn't
        // "spend the card and immediately apply a deterministic result" —
        // the acting client still has to pick 2 board tiles AFTER this
        // broadcast lands. A receiver only needs to remove the card from
        // that player's hand here; the actual swap arrives separately via
        // onInventionSwapped once the actor finishes picking (applyInventionSwap
        // is safely reused verbatim for that, no player-specific state).
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'invention') } : p,
          ),
        )
      } else if (payload.card === 'merchantFleet') {
        // Same reasoning as Invention just above — the named type stays
        // local to the acting client (see playMerchantFleet's own comment),
        // so a receiver only needs to remove the card from that player's
        // hand; merchantFleetRate itself is never set on this client.
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'merchantFleet') } : p,
          ),
        )
      } else if (payload.card === 'guildDues' || payload.card === 'espionage') {
        // Same split as Invention/Merchant Fleet above — the target-and-
        // cards picker (pendingGuildDues/pendingEspionage) is local-only UI
        // state on the acting client, so a receiver just removes the spent
        // card here; the actual take arrives separately via
        // onGuildDuesTaken/onEspionageTaken once the actor confirms their
        // picks in OpponentHandPicker.
        setPlayers((prev) =>
          prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, payload.card) } : p)),
        )
      } else if (payload.card === 'intrigue') {
        // Cities & Knights Intrigue (Task 14) — same split as Guild Dues/
        // Espionage just above: pendingIntrigueDisplace is local-only UI
        // state on the acting client, so a receiver just removes the spent
        // card here; the actual displacement arrives separately via
        // onIntrigueResolved once the actor picks a knight on the board.
        setPlayers((prev) =>
          prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'intrigue') } : p)),
        )
      }
    },
    onInventionSwapped: (payload) => applyInventionSwap(payload.tileAId, payload.tileBId),
    // Broadcast-sourced — applyProgressDiscard sorts descending and splices,
    // which is only safe for in-range, non-duplicated indices: a NEGATIVE
    // index splices from the END of the array (removing a card the sender
    // never named), and a duplicate-heavy or oversized array over-splices,
    // silently destroying cards the hand limit never required. Validated
    // against THIS client's own copy of the target hand — which is already
    // guaranteed identical, since applyProgressCardDraws synced it before
    // any discard could be owed — rather than trusting the sender's view of
    // it. The count bound is progressCardHandExcess, the same number
    // confirmProgressDiscard requires of the local actor.
    onProgressDiscardConfirmed: (payload) => {
      const target = players.find((p) => p.id === payload.playerId)
      const indices = payload.indices
      const valid =
        target != null &&
        Array.isArray(indices) &&
        indices.length <= progressCardHandExcess(target.progressCards) &&
        new Set(indices).size === indices.length &&
        indices.every((index) => Number.isInteger(index) && index >= 0 && index < target.progressCards.length)
      if (!valid) {
        console.error('[Catan] Ignoring malformed progress-discard payload:', payload)
        return
      }
      applyProgressDiscard(payload.playerId, indices)
    },
    // Trusted-apply — the purchasing client already resolved which player
    // controls the track AND which of their cities carries the marker (see
    // buildSettlementRaw's pendingMetropolisClaim branch); every other
    // client just takes both values as given, same trust model
    // onTrophyUpdated already uses for trophy state.
    onMetropolisClaimed: (payload) => {
      // Same broadcast-sourced validation as onCityImprovementPurchased just
      // above — payload.track is used as the key both of these records are
      // written under, so an unrecognized value would quietly add a bogus
      // fourth entry that IMPROVEMENT_TRACK_ORDER-driven readers (score,
      // panel) never see, while the real track stays unclaimed.
      if (!IMPROVEMENT_TRACK_ORDER.includes(payload.track)) {
        console.error('[Catan] Ignoring malformed metropolis-claim payload:', payload)
        return
      }
      setMetropolisVertexIds((prev) => ({ ...prev, [payload.track]: payload.vertexId }))
      setMetropolisHolders((prev) => ({ ...prev, [payload.track]: payload.playerId }))
    },
    onBankTrade: (payload) => {
      // Broadcast-sourced — validated before ever being used as resources[]
      // keys/arithmetic operands. Same reasoning as applyRobberMove: a
      // bogus resource string or non-finite rate would otherwise write NaN
      // into a real player's resource count permanently.
      if (!RESOURCE_ORDER.includes(payload.give) || !RESOURCE_ORDER.includes(payload.receive) || !Number.isFinite(payload.rate)) {
        console.error('[Catan] Ignoring malformed bank-trade payload:', payload)
        return
      }
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
    // Broadcast-sourced — same validation shape as onBankTrade just above,
    // since this payload also indexes straight into commodities[]/resources[]
    // and does arithmetic on the result. receive can validly be either a
    // resource or a commodity (this ability allows trading for either), so
    // both COMMODITY_ORDER and RESOURCE_ORDER are checked before accepting it.
    onCommodityTraded: (payload) => {
      const validReceive =
        (COMMODITY_ORDER as string[]).includes(payload.receive) || RESOURCE_ORDER.includes(payload.receive as ResourceType)
      if (!COMMODITY_ORDER.includes(payload.give) || !validReceive) {
        console.error('[Catan] Ignoring malformed commodity-trade payload:', payload)
        return
      }
      applyCommodityTrade(payload.playerId, payload.give, payload.receive)
    },
    // Cities & Knights Guild Dues — validated against RESOURCE_ORDER/
    // COMMODITY_ORDER membership before ever reaching applyGuildDuesTake's
    // resources[]/commodities[] arithmetic, same malformed-payload guard
    // shape as onBankTrade/onCommodityTraded above. Quantities are ALSO
    // bounded against this client's own already-synced copy of the
    // target's hand (not just type membership): applyGuildDuesTake floors
    // the target's subtraction at 0 per entry, but the taker's addition is
    // unconditional per entry, so a malformed/stale payload with more
    // picks than the target actually holds (of a type, or in total) would
    // otherwise manufacture cards for the taker on every receiving client
    // — the same "re-derive/bound against already-synced state, don't
    // trust wire quantities" principle applyEspionageTake already applies
    // by re-deriving its card from an index rather than trusting an
    // identity field.
    onGuildDuesTaken: (payload) => {
      const validTypes = payload.picks.every(
        (pick) => (RESOURCE_ORDER as readonly string[]).includes(pick) || (COMMODITY_ORDER as readonly string[]).includes(pick),
      )
      if (!validTypes) {
        console.error('[Catan] Ignoring malformed guild-dues payload:', payload)
        return
      }
      const target = playerById.get(payload.targetId)
      const countsByType = new Map<ResourceType | CommodityType, number>()
      for (const pick of payload.picks) countsByType.set(pick, (countsByType.get(pick) ?? 0) + 1)
      const withinTargetHoldings = Array.from(countsByType.entries()).every(([type, count]) => {
        if (!target) return false
        const held = (RESOURCE_ORDER as readonly string[]).includes(type)
          ? target.resources[type as ResourceType]
          : target.commodities[type as CommodityType]
        return count <= held
      })
      if (!target || payload.picks.length > 2 || !withinTargetHoldings) {
        console.error('[Catan] Ignoring malformed guild-dues payload:', payload)
        return
      }
      applyGuildDuesTake(payload.takerId, payload.targetId, payload.picks)
    },
    // Cities & Knights Espionage — cardIndex is trusted as an index, not a
    // card identity (see EspionageTakenPayload's own comment in
    // useRoomChannel.ts); applyEspionageTake already re-derives the actual
    // card from target.progressCards[cardIndex] on THIS client and bails
    // out on an out-of-range index or a VP card, so no separate validation
    // is needed here beyond that.
    onEspionageTaken: (payload) => applyEspionageTake(payload.takerId, payload.targetId, payload.cardIndex),
    // Cities & Knights Commercial Harbor — validated against RESOURCE_ORDER
    // membership before ever being used as a resources[] key/arithmetic
    // operand inside applyCommercialHarborEffect, same malformed-enum guard
    // shape as onBankTrade above. turnOrderIds needs no separate validation:
    // it's derived from the SAME players roster every client already
    // shares (this game has no mid-match player removal), so any id in it
    // already resolves to a real player on the receiver too.
    onCommercialHarborPlayed: (payload) => {
      if (!RESOURCE_ORDER.includes(payload.resource)) {
        console.error('[Catan] Ignoring malformed commercial-harbor payload:', payload)
        return
      }
      applyCommercialHarborEffect(payload.playerId, payload.resource, payload.turnOrderIds)
    },
    // Cities & Knights Diplomacy — ownerId is bounded against this
    // receiver's OWN already-synced roads state rather than trusted
    // outright, same "re-derive/bound against already-synced state, don't
    // trust wire quantities" principle onGuildDuesTaken's own comment
    // describes: a malformed/stale ownerId that doesn't match who this
    // client already believes owns edgeId would otherwise return the WRONG
    // player's road to their supply on this client only, permanently
    // desyncing roadsRemaining from every other client.
    onDiplomacyPlayed: (payload) => {
      if (roads[payload.edgeId] !== payload.ownerId) {
        console.error('[Catan] Ignoring malformed diplomacy-played payload:', payload)
        return
      }
      applyDiplomacyRemoval(payload.playerId, payload.edgeId, payload.ownerId)
    },
    // Cities & Knights Merchant (Task 13) — trusted-apply, same reasoning
    // MerchantMovedPayload's own comment (useRoomChannel.ts) gives: the
    // sending client already validated land+adjacency locally, so every
    // other client just applies tileId/holderId directly.
    onMerchantMoved: (payload) => {
      setMerchantTileId(payload.tileId)
      setMerchantHolderId(payload.holderId)
    },
    // Cities & Knights knight recruit (Task 7) — trusted-apply, same
    // reasoning KnightRecruitedPayload's own comment (useRoomChannel.ts)
    // gives: the sending client already validated cost/supply/target
    // locally, so every other client just applies the fully-formed
    // KnightPiece directly. isFree (Treason, Task 14) branches both the
    // resource deduction and WHICH knightSupply bucket gets decremented —
    // see KnightRecruitedPayload.isFree's own comment in useRoomChannel.ts
    // for why reusing the paid path unconditionally here would desync
    // every other client's resources/supply for a Treason placement.
    onKnightRecruited: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === payload.knight.ownerId
            ? {
                ...p,
                resources: payload.isFree ? p.resources : deductCost(p.resources, KNIGHT_RECRUIT_COST),
                knightSupply: {
                  ...p.knightSupply,
                  [payload.knight.strength]: p.knightSupply[payload.knight.strength] - 1,
                },
                knightPieces: [...p.knightPieces, payload.knight],
              }
            : p,
        ),
      )
    },
    // Cities & Knights knight activate/promote (Task 8) — same trusted-apply
    // reasoning as onKnightRecruited just above: the sending client already
    // validated cost/state locally (canActivateKnight/canPromoteKnight)
    // before ever broadcasting.
    onKnightActivated: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== payload.playerId
            ? p
            : {
                ...p,
                resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST),
                knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, active: true } : k)),
              },
        ),
      )
    },
    onKnightPromoted: (payload) => {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== payload.playerId) return p
          const knight = p.knightPieces.find((k) => k.id === payload.knightId)
          if (!knight) return p
          return {
            ...p,
            resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
            knightSupply: {
              ...p.knightSupply,
              [knight.strength]: p.knightSupply[knight.strength] + 1,
              [payload.newStrength]: p.knightSupply[payload.newStrength] - 1,
            },
            knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, strength: payload.newStrength } : k)),
          }
        }),
      )
      setKnightsPromotedThisTurn((prev) => new Set(prev).add(payload.knightId))
    },
    // Cities & Knights knight move (Task 9) — same trusted-apply reasoning
    // as onKnightRecruited/onKnightActivated/onKnightPromoted above: the
    // sending client already validated the move locally (knightMoveTargets)
    // before ever broadcasting.
    onKnightMoved: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== payload.playerId
            ? p
            : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, vertexId: payload.vertexId, active: false } : k)) },
        ),
      )
    },
    // Cities & Knights knight displace (Task 10) — same trusted-apply
    // reasoning as onKnightMoved above, but mirrors the local resolution's
    // two-knight update exactly: the mover goes inactive at its new vertex,
    // while the displaced knight keeps its own active/inactive status
    // (CN3087 — only the mover goes inactive) and either relocates within
    // its own owner's pieces or, when displacedVertexId is null, is removed
    // and returned to that owner's supply.
    onKnightDisplaced: (payload) => {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id === payload.moverId) {
            return {
              ...p,
              knightPieces: p.knightPieces.map((k) =>
                k.id === payload.knightId ? { ...k, vertexId: payload.newMoverVertexId, active: false } : k,
              ),
            }
          }
          if (p.id === payload.displacedOwnerId) {
            if (payload.displacedVertexId) {
              return {
                ...p,
                knightPieces: p.knightPieces.map((k) =>
                  k.id === payload.targetKnightId ? { ...k, vertexId: payload.displacedVertexId! } : k,
                ),
              }
            }
            const removed = p.knightPieces.find((k) => k.id === payload.targetKnightId)
            return {
              ...p,
              knightPieces: p.knightPieces.filter((k) => k.id !== payload.targetKnightId),
              knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply,
            }
          }
          return p
        }),
      )
    },
    // Cities & Knights "Chase Away the Robber" (Task 11) — same trusted-apply
    // reasoning as onKnightDisplaced above: the sending client already
    // validated the knight's adjacency to the robber's hex locally
    // (armChaseRobber) before ever broadcasting.
    onKnightDeactivatedAfterChase: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== payload.playerId
            ? p
            : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, active: false } : k)) },
        ),
      )
    },
    // Cities & Knights city walls (Task 12) — same trusted-apply reasoning
    // as onKnightDeactivatedAfterChase above: the sending client already
    // validated ownership/no-existing-wall/board-wide-cap/affordability
    // locally (canBuildCityWall) before ever broadcasting. isFree (Task 13)
    // skips the deduction for Engineering's free wall — see
    // CityWallBuiltPayload.isFree's own comment in useRoomChannel.ts.
    onCityWallBuilt: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== payload.playerId
            ? p
            : {
                ...p,
                resources: payload.isFree ? p.resources : deductCost(p.resources, CITY_WALL_COST),
                cityWalls: [...p.cityWalls, payload.vertexId],
              },
        ),
      )
    },
    // Cities & Knights Smithing (Task 13) — same trusted-apply reasoning as
    // onCityWallBuilt above, but re-derives each promoted knight's new
    // strength LOCALLY via nextKnightStrength rather than trusting a
    // newStrength per knight in the payload (see SmithingPlayedPayload's own
    // comment in useRoomChannel.ts for why) — a knight whose current
    // strength no longer has a next rung (already mighty, or missing) is
    // simply skipped rather than trusting the sender's knightIds list blindly.
    // Unlike playSmithing's own SELECTION step (which must track a running
    // supply count — see its own comment in App.tsx for why a static
    // snapshot there can drive knightSupply negative), this handler never
    // selects anything: payload.knightIds already IS the sender's validated,
    // running-supply-respecting choice, so sequentially decrementing
    // `supply` below (same pattern playSmithing's own apply step uses) can't
    // go negative as long as the sender validated correctly.
    onSmithingPlayed: (payload) => {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== payload.playerId) return p
          let supply = { ...p.knightSupply }
          const knightPieces = p.knightPieces.map((k) => {
            if (!payload.knightIds.includes(k.id)) return k
            const next = nextKnightStrength(k.strength)
            if (!next) return k
            supply = { ...supply, [k.strength]: supply[k.strength] + 1, [next]: supply[next] - 1 }
            return { ...k, strength: next }
          })
          return { ...p, progressCards: removeOne(p.progressCards, 'smithing'), knightSupply: supply, knightPieces }
        }),
      )
      setKnightsPromotedThisTurn((prev) => {
        const next = new Set(prev)
        for (const knightId of payload.knightIds) next.add(knightId)
        return next
      })
    },
    // Cities & Knights Encouragement (Task 13) — same trusted-apply reasoning
    // as onSmithingPlayed above: the sending client already validated the
    // card was in hand before ever broadcasting.
    onEncouragementPlayed: (payload) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== payload.playerId
            ? p
            : { ...p, progressCards: removeOne(p.progressCards, 'encouragement'), knightPieces: p.knightPieces.map((k) => ({ ...k, active: true })) },
        ),
      )
    },
    // Cities & Knights Intrigue (Task 14) — trusted-apply, mirrors the local
    // resolution exactly (handleKnightSelect's own pendingIntrigueDisplace
    // branch): only the displaced knight's owner is touched here — the card
    // itself was already removed via the earlier onProgressCardPlayed
    // 'intrigue' branch above, same two-broadcast split Guild Dues/Espionage
    // already use.
    onIntrigueResolved: (payload) => {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== payload.displacedOwnerId) return p
          if (payload.displacedVertexId) {
            return {
              ...p,
              knightPieces: p.knightPieces.map((k) =>
                k.id === payload.targetKnightId ? { ...k, vertexId: payload.displacedVertexId! } : k,
              ),
            }
          }
          const removed = p.knightPieces.find((k) => k.id === payload.targetKnightId)
          return {
            ...p,
            knightPieces: p.knightPieces.filter((k) => k.id !== payload.targetKnightId),
            knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply,
          }
        }),
      )
    },
    // Cities & Knights Treason (Task 14) — trusted-apply, self-contained
    // (see TreasonRemovedPayload's own comment for why this doesn't need a
    // preceding onProgressCardPlayed broadcast the way Intrigue above
    // does): removes the card from the acting player's hand AND the
    // target's knight in one step, mirroring playTreason's own single
    // setPlayers call exactly. The placement half (if any) arrives
    // separately via onKnightRecruited — Task 7's existing receiver, reused
    // verbatim (see playTreason's own comment).
    onTreasonRemoved: (payload) => {
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id === payload.actingPlayerId) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
          if (p.id === payload.targetPlayerId) {
            return {
              ...p,
              knightPieces: p.knightPieces.filter((k) => k.id !== payload.removedKnight.id),
              knightSupply: { ...p.knightSupply, [payload.removedKnight.strength]: p.knightSupply[payload.removedKnight.strength] + 1 },
            }
          }
          return p
        }),
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

  // True for the ORIGINAL host, or — if their presence is no longer in the
  // room — for whichever CURRENTLY CONNECTED player has the lowest player
  // id. Every client independently computes the identical answer from the
  // identical `players` array, no coordination needed, same "everyone
  // derives the same result" pattern the board shuffle and starting-player
  // pick already rely on. Used everywhere host AUTHORITY is checked
  // (autosave, restart, resolving trades/discards) instead of the fixed
  // onlineInfo.isHost, so the match doesn't freeze for good just because
  // the actual host's own browser is the one that's disconnected — before
  // this, autosave silently stopped and restart/resolve-trade/discard-
  // timeout all stayed permanently host-gated with no fallback. Matching
  // presence to a Player by NAME is safe here (unlike the live-editable
  // lobby the earlier clientId fix was for) because match names are
  // locked in at Start Game, and RoomLobby now refuses to start a match
  // with two players sharing one.
  const isEffectiveHost = (() => {
    if (!onlineInfo) return false
    if (onlineInfo.isHost) return true
    const connectedNames = new Set(roomPresence.map((p) => normalizePlayerName(p.name)))
    if (connectedNames.has(normalizePlayerName(onlineInfo.hostName))) return false
    const connectedIds = players.filter((p) => connectedNames.has(normalizePlayerName(p.name))).map((p) => p.id)
    const lowestConnectedId = connectedIds.length > 0 ? Math.min(...connectedIds) : null
    return lowestConnectedId === onlineInfo.localPlayerId
  })()

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
  const playerDiscardThreshold = useCallback(
    (player: Player): number =>
      discardThreshold(gameRules.citiesAndKnightsKnights ? player.cityWalls.length : 0),
    [gameRules.citiesAndKnightsKnights],
  )

  const validDiscardPlayerIds = useMemo(
    () =>
      discardPlayerIds.filter((id) => {
        const player = playerById.get(id)
        if (player == null) return false
        return discardHandSize(player.resources, player.commodities, gameRules.citiesAndKnightsCommodities) > playerDiscardThreshold(player)
      }),
    [discardPlayerIds, playerById, gameRules.citiesAndKnightsCommodities, playerDiscardThreshold],
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
  const discardRequiredCount = discardingPlayer
    ? Math.floor(
        discardHandSize(
          discardingPlayer.resources,
          discardingPlayer.commodities,
          gameRules.citiesAndKnightsCommodities,
        ) / 2,
      )
    : 0

  // Who's actively resolving a Science level 3 free-resource pick on THIS
  // screen right now — same "sequential locally, parallel online" split as
  // activeDiscarderId above, and deliberately its own queue rather than
  // reusing devCardPicker (see scienceFreeResourcePlayerIds' declaration):
  // this can be true for a DIFFERENT player than currentPlayerIndex.
  const activeScienceFreeResourcePlayerId = onlineInfo
    ? scienceFreeResourcePlayerIds.includes(onlineInfo.localPlayerId)
      ? onlineInfo.localPlayerId
      : null
    : (scienceFreeResourcePlayerIds[0] ?? null)

  // Cities & Knights barbarian attack (Task 5) — who's actively resolving
  // their own pillage/draw choice on THIS screen right now. Mirrors
  // activeDiscarderId's exact split above: online is PARALLEL — each
  // affected player resolves their own pillage/draw independently, on their
  // own screen, whenever it's ready, regardless of what order they appear
  // in the queue (never pillageQueue[0]/winnerDrawQueue[0] directly — that
  // would let ANY connected client act on the front player's choice, with
  // no ownership check). Local Pass & Play is sequential — one shared
  // screen, so only the front of the queue is ever "up," and these
  // naturally resolve to the front entry since there's only ever one
  // shared "me."
  const activePillageTarget = onlineInfo
    ? (pillageQueue.find((t) => t.playerId === onlineInfo.localPlayerId) ?? null)
    : (pillageQueue[0] ?? null)
  const activeWinnerDrawPlayerId = onlineInfo
    ? (winnerDrawQueue.includes(onlineInfo.localPlayerId) ? onlineInfo.localPlayerId : null)
    : (winnerDrawQueue[0] ?? null)

  // Resolves the active barbarian-pillage choice with the vertex the player
  // clicked on the board. Only ever reachable by the local actor whose id
  // matches activePillageTarget.playerId — see that derivation above for
  // why this can be a different player than currentPlayerIndex, and why it
  // must be read through activePillageTarget rather than pillageQueue[0]
  // (Task 5's IMPORTANT note): online, ANY connected client could otherwise
  // call this for the front-of-queue player with no ownership check.
  const handlePillageTargetSelect = (vertexId: string) => {
    const current = activePillageTarget
    if (!current) return
    if (!current.eligibleCityVertexIds.includes(vertexId)) {
      warn('Not a valid pillage target.')
      return
    }
    applyPillage(vertexId, current.playerId)
    if (onlineInfo) broadcastPillageResolved({ vertexId, playerId: current.playerId })
  }

  // Resolves the active tied-winner progress-card deck choice with the
  // track the player clicked in BarbarianAttackModal's picker. Only ever
  // reachable by the local actor whose id matches activeWinnerDrawPlayerId
  // — see that derivation above for why this must be read through
  // activeWinnerDrawPlayerId rather than winnerDrawQueue[0] (Task 5's
  // IMPORTANT note, same reasoning handlePillageTargetSelect's own comment
  // gives): online, ANY connected client could otherwise call this for the
  // front-of-queue player with no ownership check.
  const handleBarbarianWinnerDraw = (track: ImprovementTrack) => {
    const playerId = activeWinnerDrawPlayerId
    if (playerId == null) return
    const deck = progressCardDecks[track]
    const [card, ...rest] = deck
    if (!card) {
      warn('That deck is empty.')
      return
    }
    applyBarbarianWinnerDraw(playerId, card)
    setProgressCardDecks((prev) => ({ ...prev, [track]: rest }))
    const player = playerById.get(playerId)
    if (player) inform(`${player.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card for tying as Defender of Catan.`)
    if (onlineInfo) broadcastBarbarianWinnerDrawResolved({ playerId, track, card })
  }

  // Barbarian attack modal's "small banner" text. Distinguishes "it's MY
  // choice" (activePillageTarget/activeWinnerDrawPlayerId non-null) from
  // "someone else is still choosing" (pillageQueue/winnerDrawQueue
  // non-empty but the derived active-* value is null — reachable only
  // online, for a client not itself in the relevant queue) — the design
  // spec's required online-only waiting state (see Task 5's IMPORTANT
  // note). Local Pass & Play never falls into either "waiting" branch:
  // activePillageTarget/activeWinnerDrawPlayerId always resolve to the
  // (only) front-of-queue entry there whenever the corresponding queue is
  // non-empty, matching the spec's "no waiting state at all" rule for local
  // play. Both waiting branches' `pillageQueue[0]`/`winnerDrawQueue[0]`
  // reads are display-only — a name for the banner text, not a target for
  // any action — so they don't need the ownership check the resolve
  // handlers, the picker UIs, and the pillage auto-skip effect do.
  const pendingChoiceLabel = pillageQueue.length > 0
    ? activePillageTarget
      ? `Choose which city to pillage — ${playerById.get(activePillageTarget.playerId)?.name ?? ''}`
      : `Waiting on ${playerById.get(pillageQueue[0].playerId)?.name ?? 'another player'} to choose a pillage target`
    : winnerDrawQueue.length > 0
      ? activeWinnerDrawPlayerId != null
        ? `${playerById.get(activeWinnerDrawPlayerId)?.name ?? ''} — choose a deck to draw from`
        : `Waiting on ${playerById.get(winnerDrawQueue[0])?.name ?? 'another player'} to choose a deck`
      : null

  // Auto-skip the picker when the active player has exactly one eligible
  // city — CN3087 p.11 doesn't require a click when there's no real choice
  // to make. Watches activePillageTarget (never pillageQueue[0] — Task 5's
  // IMPORTANT note), so this naturally fires only on the correct client in
  // each mode: online, activePillageTarget is non-null only on the
  // affected player's OWN screen; local Pass & Play only ever has the
  // front-of-queue player "up," so no extra gating is needed here.
  // activePillageTarget's object identity is stable across unrelated
  // re-renders (pillageQueue's entries are the same references until
  // actually filtered), so this dependency array won't re-fire spuriously.
  useEffect(() => {
    if (activePillageTarget && activePillageTarget.eligibleCityVertexIds.length === 1) {
      // Cascades into applyPillage's setSettlements/setPlayers/setPillageQueue
      // calls, same deliberate "self-heal" shape as the discard-queue effect
      // above (setGamePhase('moveRobber')) — there's no user gesture to hang
      // this resolution off of when there's only one legal target, so the
      // effect has to trigger it itself.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handlePillageTargetSelect(activePillageTarget.eligibleCityVertexIds[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlePillageTargetSelect is read fresh via closure; only activePillageTarget changing should re-fire this.
  }, [activePillageTarget])

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
    gamePhase === 'playing' &&
    !isRolling &&
    !winner &&
    !pendingTrade &&
    !devCardPicker &&
    activeScienceFreeResourcePlayerId == null &&
    !devCardPlayedThisTurn &&
    isMyTurn

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
      lengths.set(player.id, calculateLongestRoad(player.id, roads, graph, settlements, knightOwnerByVertex))
    }
    return lengths
  }, [players, roads, graph, settlements, knightOwnerByVertex])

  const knightCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const player of players) counts.set(player.id, player.knightsPlayed)
    return counts
  }, [players])

  // Longest Road and Largest Army transfer the instant another player
  // strictly exceeds the current holder — a tie leaves the incumbent in
  // place. See pickTrophyHolder for the exact rule. That stickiness makes
  // the result PATH-DEPENDENT, not just a function of the current board —
  // if two clients ever observed an intermediate roads/knights state in a
  // different order (ordinary broadcast-arrival jitter, not a bug on its
  // own), their independently-computed holders could permanently diverge
  // with nothing to ever resync them. So this only runs locally for local
  // (offline) play or for the effective host; every other online client
  // instead just applies whatever the host broadcasts (see onTrophyUpdated
  // above and the broadcast effect below). Applied directly during render
  // (not an effect) for the authoritative side: pickTrophyHolder is pure
  // and cheap, and the !== guard is what makes this self-terminating (the
  // condition goes false the instant state catches up) rather than an
  // infinite render loop — the same "adjust state during render" pattern
  // React's own docs recommend for state fully derived from other state.
  if (!onlineInfo || isEffectiveHost) {
    const nextLongestRoadHolderId = pickTrophyHolder(longestRoadHolderId, longestRoadLengths, LONGEST_ROAD_MIN_LENGTH)
    if (nextLongestRoadHolderId !== longestRoadHolderId) {
      setLongestRoadHolderId(nextLongestRoadHolderId)
    }

    const nextLargestArmyHolderId = pickTrophyHolder(largestArmyHolderId, knightCounts, LARGEST_ARMY_MIN_KNIGHTS)
    if (nextLargestArmyHolderId !== largestArmyHolderId) {
      setLargestArmyHolderId(nextLargestArmyHolderId)
    }
  }

  // Broadcasts the effective host's own (authoritative) trophy state
  // whenever it changes, so every other client's onTrophyUpdated handler
  // (above) can just apply it instead of computing its own — see the
  // render-time block above for why independent computation risks
  // permanent divergence. A real effect (not inline in the render-time
  // block above) since sending a network broadcast is a side effect, not
  // derived state.
  useEffect(() => {
    if (!onlineInfo || !isEffectiveHost) return
    broadcastTrophyUpdated({ longestRoadHolderId, largestArmyHolderId })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onlineInfo/broadcastTrophyUpdated are read fresh via closure; only the holder ids and isEffectiveHost changing should re-fire this.
  }, [longestRoadHolderId, largestArmyHolderId, isEffectiveHost])

  // The moment any player's score reaches the win threshold, halt the game.
  // Same render-time pattern — !winner is the self-terminating guard.
  if (!winner && gameStarted) {
    const found = players.find(
      (p) =>
        getPlayerScore(p, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders, merchantHolderId) >=
        gameRules.victoryPointTarget,
    )
    if (found) setWinner(found)
  }

  // The one piece of the discard self-healing (below, near
  // activeDiscarderId): releases gamePhase once the (self-healed) queue
  // empties out. Deliberately NOT the render-time pattern the winner check
  // above uses — this one also writes a diagnostic log entry (which touches
  // localStorage and the console), and a side effect like that belongs in a
  // commit, not in a render body that React is free to run twice or throw
  // away. gamePhase !== 'discard' still makes it self-terminating.
  useEffect(() => {
    if (gamePhase !== 'discard' || validDiscardPlayerIds.length > 0) return
    debugLog('discard self-heal fired', { discardPlayerIds })
    // The phase release rides along with the log instead of staying a
    // render-time adjustment: they are one step ("the queue self-healed, let
    // the phase go"), and splitting them would make the log unreachable —
    // a render-phase setState re-renders before effects flush, so an Effect
    // guarded on gamePhase === 'discard' would never see the discard phase.
    // Cities & Knights barbarian-track gate (Task 3) — same reasoning as
    // applyDiscard's queue-empty branch above: before the first barbarian
    // attack resolves, skip arming moveRobber and return straight to play.
    if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGamePhase('moveRobber')
    } else {
      setGamePhase('playing')
    }
  }, [gamePhase, validDiscardPlayerIds, discardPlayerIds, gameRules.citiesAndKnightsBarbarians, robberActive])

  // Does this player have a road touching the given intersection? Used for
  // both road and settlement connectivity checks.
  const hasPlayerRoadAt = (vertexId: string, playerId: number): boolean => {
    const edgeIds = graph.vertexEdgeIds.get(vertexId) ?? []
    return edgeIds.some((edgeId) => roads[edgeId] === playerId)
  }

  // Cities & Knights knights: a road cannot be extended THROUGH a vertex
  // occupied by another player's knight (CN3087 p.9's own illustration: "If
  // Blue places their knight at intersection A, then Orange will not be
  // able to extend their road past that point"). Arrival is unaffected —
  // this only matters for whether a vertex counts as a valid JUMPING-OFF
  // point for a NEW edge, so a settlement you already own at that vertex is
  // unaffected too (a settlement and a knight can never share a vertex —
  // see buildSettlementRaw's knight-occupancy check).
  const isBlockedForRoadPlacement = (vertexId: string, playerId: number): boolean => {
    if (!gameRules.citiesAndKnightsKnights) return false
    const knight = knightPiecesByVertex.get(vertexId)
    return knight != null && knight.ownerId !== playerId
  }

  const isRoadPlacementConnected = (edgeId: string, playerId: number): boolean => {
    const edge = edgeById.get(edgeId)
    if (!edge) return false
    if (settlements[edge.a]?.ownerId === playerId || settlements[edge.b]?.ownerId === playerId) return true
    const aUsable = hasPlayerRoadAt(edge.a, playerId) && !isBlockedForRoadPlacement(edge.a, playerId)
    const bUsable = hasPlayerRoadAt(edge.b, playerId) && !isBlockedForRoadPlacement(edge.b, playerId)
    return aUsable || bUsable
  }

  // Best available bank-trade rate for giving away this resource: 2:1 if the
  // player owns that resource's specific port, else 3:1 if they own any
  // generic port, else the standard 4:1.
  const getPortRate = (playerId: number, resource: ResourceType): number => {
    // Cities & Knights Merchant Fleet — checked first: its 2:1 is at least
    // as good as any port, and unlike a port, it isn't derived from
    // settlement ownership at all, so it has to short-circuit before the
    // ports loop below rather than fold into it.
    if (merchantFleetRate?.playerId === playerId && merchantFleetRate.type === resource) return 2
    // Cities & Knights Merchant (Task 13) — "trade that hex's resource
    // (not commodity) at 2:1" while controlled. Stacks with the checks
    // above/below (whichever applies): a distinct board-piece control
    // check, not derived from settlement ownership like the ports loop
    // below, so it short-circuits before that loop the same way the
    // Merchant Fleet check just above does.
    if (
      merchantHolderId === playerId &&
      merchantTileId &&
      tiles.find((t) => t.id === merchantTileId)?.biome &&
      BIOME_TO_RESOURCE[tiles.find((t) => t.id === merchantTileId)!.biome] === resource
    ) {
      return 2
    }
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
    // Metropolis selection reuses this exact click pipeline (VertexSlot's
    // onBuild) rather than a parallel click-target overlay — this branch
    // runs BEFORE canInteract()/setup checks below since choosing a
    // Metropolis city isn't gated by "has this player rolled yet" the way
    // building is; it's just resolving where a purchase that already
    // happened gets its marker.
    if (pendingMetropolisClaim) {
      const { track, playerId: claimantId } = pendingMetropolisClaim
      // Resolve against the player who actually BOUGHT the claim, matched
      // against whoever owns this screen (localPlayer — the online seat, or
      // the current player in hot-seat), never against
      // players[currentPlayerIndex] on its own.
      if (localPlayer.id !== claimantId) {
        warn('Only the player who bought that improvement can place its Metropolis.')
        return
      }
      const player = localPlayer
      const building = settlements[vertexId]
      if (!building || building.type !== 'city' || building.ownerId !== player.id) {
        warn('Choose one of your own cities for the Metropolis.')
        return
      }
      if (metropolisVertexIds[track] === vertexId) {
        warn('That city already holds this Metropolis.')
        return
      }
      // Re-resolve control BEFORE writing anything. Between the purchase and
      // this click, another client's broadcast can (rarely, online — the
      // accepted race documented on this task) have changed
      // metropolisHolders[track] to someone else. Writing the vertex first
      // and recomputing after would broadcast a holder and a vertex belonging
      // to two DIFFERENT players, and every client would apply that mismatch.
      const nextHolderId = metropolisHolderAfterPurchase(
        metropolisHolders[track],
        metropolisHolderLevel(players, metropolisHolders, track),
        player.id,
        player.cityImprovements[track],
      )
      if (nextHolderId !== player.id) {
        warn('Another player already claimed that Metropolis.')
        setPendingMetropolisClaim(null)
        return
      }
      setMetropolisVertexIds((prev) => ({ ...prev, [track]: vertexId }))
      setMetropolisHolders((prev) => ({ ...prev, [track]: nextHolderId }))
      setPendingMetropolisClaim(null)
      if (onlineInfo) broadcastMetropolisClaimed({ track, playerId: nextHolderId, vertexId })
      return
    }

    if (!canInteract()) return

    const player = players[currentPlayerIndex]
    const isSetup = gamePhase === 'setup'
    const existing = settlements[vertexId]

    // Setup placements never roll at all, so this only applies to a normal
    // turn — without it, a settlement/city could be built before rolling
    // even though handleEndTurn already refuses to end a turn that hasn't
    // rolled, a real Catan rules violation (and, online, a way to spend
    // that turn's resources before the roll that's supposed to gate them).
    if (!isSetup && !hasRolledThisTurn) {
      warn('Roll the dice before building.')
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
      // Cities & Knights Medicine — "Upgrade one settlement to a city for 1
      // wheat + 2 ore (instead of the normal city cost)." No new vertex-
      // highlight machinery needed: this reuses the exact SAME onBuild
      // click every ordinary city upgrade already goes through (Metropolis
      // claiming doesn't have its own highlight either — see this branch's
      // sibling above) — an ineligible click just gets warn()'d, matching
      // this codebase's established UX.
      const usingMedicine = pendingMedicineUse === player.id
      if (usingMedicine) {
        if (player.resources.grain < 1 || player.resources.ore < 2) {
          warn('Not enough resources for Medicine (needs 1 Wheat + 2 Ore).')
          return
        }
      } else if (!canAfford(player.resources, CITY_COST)) {
        warn('Not enough resources for a city.')
        return
      }

      const medicineCost = { grain: 1, ore: 2 }
      applyCityPlacement(vertexId, player.id, usingMedicine ? medicineCost : undefined)
      // Consumed exactly once, on the actual placement — not on playMedicine
      // (which only arms the flag) and not on an earlier click, since an
      // ineligible click above returns before ever reaching here.
      if (usingMedicine) setPendingMedicineUse(null)
      if (onlineInfo) {
        broadcastCityBuilt({ vertexId, playerId: player.id, costOverride: usingMedicine ? medicineCost : undefined })
      }
      return
    }

    // Cities & Knights knights: a settlement and a knight can never share a
    // vertex — the `existing` branch above only catches vertices that
    // already hold a BUILDING, so a knight-occupied-but-buildingless vertex
    // needs its own guard here, before the distance-rule/connectivity
    // checks and well before any resource-spending.
    if (gameRules.citiesAndKnightsKnights && knightPiecesByVertex.has(vertexId)) {
      warn('A knight is standing there.')
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

  // Cities & Knights Commercial Harbor — deliberate scope simplification
  // (see this task's own plan notes): the physical card's per-player
  // sequential offer/response becomes ONE resource type, walked once across
  // every other player in turn order. 1 unit of `resource` moves
  // announcer -> them, 1 commodity (auto-selected, most-held first — same
  // convention as Sabotage/Wedding's own auto-pick) moves them -> announcer;
  // a player holding no commodities is skipped entirely (announcer keeps
  // that unit), and the walk stops early the instant the announcer runs out
  // of `resource` (checked BEFORE each trade, so it can never go negative).
  // Trusted-apply — shared by the local actor (playCommercialHarbor, below,
  // which also broadcasts) and the receiving client (onCommercialHarborPlayed):
  // both replay the IDENTICAL sequential reduction from the same 3 values
  // (announcerId, resource, turnOrderIds) plus already-synced player state,
  // same reasoning ProgressCardPlayedPayload's siblings already establish.
  //
  // Declared here (next to buildSettlementRaw/buildRoadRaw) rather than
  // alongside its Guild Dues/Espionage siblings further down, so
  // buildRoadRaw's own pendingDiplomacyRemoval branch just below can call
  // playDiplomacy directly — a plain top-level const referencing another
  // plain top-level const declared LATER in this same component function
  // trips this project's react-hooks lint config (unlike the onXPlayed
  // callbacks passed into the useRoomChannel(...) handlers object above,
  // which are only ever invoked well after the whole component body has
  // finished running once).
  const applyCommercialHarborEffect = (announcerId: number, resource: ResourceType, otherIdsInOrder: number[]) => {
    setPlayers((prev) => {
      let next = prev.map((p) =>
        p.id === announcerId ? { ...p, progressCards: removeOne(p.progressCards, 'commercialHarbor') } : p,
      )
      for (const targetId of otherIdsInOrder) {
        const announcer = next.find((p) => p.id === announcerId)!
        if (announcer.resources[resource] <= 0) break
        const target = next.find((p) => p.id === targetId)!
        const heldCommodities = COMMODITY_ORDER.filter((c) => target.commodities[c] > 0).sort(
          (a, b) => target.commodities[b] - target.commodities[a],
        )
        if (heldCommodities.length === 0) continue
        const commodity = heldCommodities[0]
        next = next.map((p) => {
          if (p.id === announcerId) {
            return {
              ...p,
              resources: { ...p.resources, [resource]: p.resources[resource] - 1 },
              commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + 1 },
            }
          }
          if (p.id === targetId) {
            return {
              ...p,
              resources: { ...p.resources, [resource]: p.resources[resource] + 1 },
              commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 },
            }
          }
          return p
        })
      }
      return next
    })
  }

  const playCommercialHarbor = (resource: ResourceType) => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('commercialHarbor')) {
      warn('No Commercial Harbor card to play.')
      return
    }
    const turnOrderIds = [
      ...players.slice(currentPlayerIndex).map((p) => p.id),
      ...players.slice(0, currentPlayerIndex).map((p) => p.id),
    ].filter((id) => id !== player.id)
    applyCommercialHarborEffect(player.id, resource, turnOrderIds)
    inform(`${player.name} played Commercial Harbor — offered ${RESOURCE_LABELS[resource]} around the table for a commodity.`)
    if (onlineInfo) broadcastCommercialHarborPlayed({ playerId: player.id, resource, turnOrderIds })
  }

  // Cities & Knights Diplomacy — simplified "open" check (this task's own
  // scope note, flagged for the reviewer): only the DIRECTLY computable half
  // of the physical card's "open" definition — neither endpoint touches a
  // building (any owner's, not just this player's own — the card's
  // definition is about ANY adjacent building). Does NOT verify the other
  // half of the official text ("not part of a continuous route between two
  // buildings/knights"): calculateLongestRoad (game/trophies.ts) only
  // computes ONE specific player's own longest chain length from their own
  // owned edges — it has no per-edge/any-owner "is this edge part of a
  // through-route between 2 buildings" query to reuse, and building that
  // traversal from scratch is out of this task's scope (see the plan's own
  // note). This codebase also has no concept of a "knight standing on a
  // road" for the road-graph to consult either way.
  const isOpenRoad = (edgeId: string): boolean => {
    const edge = edgeById.get(edgeId)
    if (!edge) return false
    return !settlements[edge.a] && !settlements[edge.b]
  }

  // Trusted-apply for the actual removal — shared by the local actor
  // (playDiplomacy, below, which also validates/broadcasts) and the
  // receiving client (onDiplomacyPlayed). Spends the card as part of this
  // same update (unlike pendingDiplomacyRemoval's arming step, see that
  // state's own comment) so a receiver just needs these 3 values plus
  // already-synced roads/player state — same single-broadcast trust model
  // CommercialHarborPlayedPayload's own comment describes.
  const applyDiplomacyRemoval = (playerId: number, edgeId: string, ownerId: number) => {
    const actor = playerById.get(playerId)
    const owner = playerById.get(ownerId)
    setRoads((prev) => {
      const next = { ...prev }
      delete next[edgeId]
      return next
    })
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === playerId) return { ...p, progressCards: removeOne(p.progressCards, 'diplomacy') }
        // Returned to the OWNER's own supply, never the announcer's — a
        // removed road just goes back to whoever built it, same as any
        // other "un-build" (the announcer only gets something extra when
        // the removed road was their OWN, via the free-rebuild branch below,
        // not via this counter).
        if (p.id === ownerId && ownerId !== playerId) return { ...p, roadsRemaining: p.roadsRemaining + 1 }
        return p
      }),
    )
    // Own road removed -> 1 free rebuild, via the SAME freeRoadsRemaining
    // counter Road Building/setup free roads already use (buildRoadRaw
    // checks it directly) — not a second, parallel "free road" concept.
    if (ownerId === playerId) setFreeRoadsRemaining((prev) => prev + 1)
    if (actor) {
      inform(
        ownerId === playerId
          ? `${actor.name} played Diplomacy — removed their own road for a free rebuild.`
          : `${actor.name} played Diplomacy — removed ${owner?.name ?? "an opponent's"} road.`,
      )
    }
  }

  const playDiplomacy = (edgeId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('diplomacy')) return
    if (!isOpenRoad(edgeId)) {
      warn('That road is not open — it touches a building.')
      return
    }
    const ownerId = roads[edgeId]
    if (ownerId == null) {
      warn('That edge has no road to remove.')
      return
    }
    applyDiplomacyRemoval(player.id, edgeId, ownerId)
    setPendingDiplomacyRemoval(null)
    if (onlineInfo) broadcastDiplomacyPlayed({ playerId: player.id, edgeId, ownerId })
  }

  // Only spends nothing yet and opens the road-picker (a single board click,
  // routed through buildRoadRaw's own special-mode-first check below) — same
  // "needs its own small UI, so keyless in progressCardPlayHandlers" reasoning
  // Alchemy/Invention/Merchant Fleet already established, since GameHud
  // needs a dedicated affordance for this rather than the generic
  // click-to-play ProgressCardsPanel drives for no-picker cards.
  const activateDiplomacy = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('diplomacy')) {
      warn('No Diplomacy card to play.')
      return
    }
    if (pendingDiplomacyRemoval) {
      warn('Finish choosing a road first.')
      return
    }
    // Arming with nothing to pick was the root of a hard deadlock: the
    // picker would be armed forever (handleEndTurn refuses to advance while
    // it's set, and playDiplomacy — the only clear — can never succeed with
    // no eligible road on the board). Checked BEFORE arming rather than
    // relying on the Cancel affordance alone, since a player who can't
    // possibly complete the action should never be put into it in the first
    // place. Nothing is spent here either way (the card is only removed
    // inside applyDiplomacyRemoval, once a road is actually chosen), so
    // refusing costs the player nothing.
    if (!Object.keys(roads).some((edgeId) => isOpenRoad(edgeId))) {
      warn('No open roads available for Diplomacy.')
      return
    }
    setPendingDiplomacyRemoval({ playerId: player.id })
    inform(`${player.name} played Diplomacy — choose an open road to remove.`)
  }

  // Cancel affordance for the armed road-picker — same shape as
  // cancelGuildDues/cancelEspionage below. Diplomacy's card isn't spent
  // until a road is actually chosen (see applyDiplomacyRemoval), so backing
  // out is a clean no-op that returns the player exactly where they were,
  // and it's the escape hatch if the board state changes underneath an
  // already-armed picker (a road they were about to remove gets built next
  // to a fresh settlement, say) leaving nothing pickable.
  const cancelDiplomacy = () => setPendingDiplomacyRemoval(null)

  const buildRoadRaw = (edgeId: string) => {
    // Cities & Knights Diplomacy — check special mode FIRST, same shape as
    // buildSettlementRaw's pendingMetropolisClaim branch above: while the
    // road-picker is active, every edge click (even one that already carries
    // a road — EdgeSlot only exposes a hitbox there while this mode is
    // active, see its own pickerActive prop) resolves the Diplomacy removal
    // instead of the ordinary build flow below, and runs BEFORE
    // canInteract()/the roll-first check, since choosing which road to
    // remove isn't gated by "has this player rolled yet" any more than
    // Metropolis placement is.
    if (pendingDiplomacyRemoval) {
      if (players[currentPlayerIndex].id !== pendingDiplomacyRemoval.playerId) {
        warn('Only the player who played Diplomacy can choose a road.')
        return
      }
      playDiplomacy(edgeId)
      return
    }

    if (!canInteract()) return

    const player = players[currentPlayerIndex]
    const isSetup = gamePhase === 'setup'
    const isFreeRoad = !isSetup && freeRoadsRemaining > 0

    // Same reasoning as buildSettlementRaw's own guard above — except a
    // free road (from a Road Building card, which itself is legal to play
    // before rolling) is exempt: the roll requirement is about ordinary
    // paid building, not about placements a dev card already granted.
    if (!isSetup && !isFreeRoad && !hasRolledThisTurn) {
      warn('Roll the dice before building.')
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

  // Same stable-ref pattern as buildSettlement/buildRoad above, for the
  // same reason: this is handed to BoardInteractions (memoized) as
  // onHoverChange, so an inline arrow recreated every render would defeat
  // that memoization on every keystroke/state change elsewhere in the tree.
  const onHoverChangeRef = useRef((target: Pick<HoverChangedPayload, 'vertexId' | 'edgeId'>) => {
    void target
  })
  useLayoutEffect(() => {
    onHoverChangeRef.current = (target) => {
      if (!onlineInfo) return
      broadcastHoverChanged({ playerId: players[currentPlayerIndex].id, ...target })
    }
  })
  const onHoverChange = useCallback(
    (target: Pick<HoverChangedPayload, 'vertexId' | 'edgeId'>) => onHoverChangeRef.current(target),
    [],
  )

  // Cities & Knights barbarian attack (Task 5) — the real sequencing entry
  // point, replacing Task 4's console.log stub. Awards the sole winner's
  // Defender of Catan VP directly, or (on a tie) populates winnerDrawQueue
  // for Task 7's per-player progress-card draw UI; on a barbarian win,
  // populates pillageQueue for Task 6's per-player pillage-target picker.
  const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
    setActiveBarbarianAttack(result)
    setPillageQueue(result.pillageTargets)
    if (result.defendersWin) {
      const soleWinner = result.winners.find((w) => !w.tied)
      if (soleWinner) {
        setPlayers((prev) =>
          prev.map((p) => (p.id === soleWinner.playerId ? { ...p, defenderOfCatanCount: p.defenderOfCatanCount + 1 } : p)),
        )
        const winnerPlayer = playerById.get(soleWinner.playerId)
        if (winnerPlayer) inform(`${winnerPlayer.name} is the Defender of Catan! +1 VP.`)
      } else {
        setWinnerDrawQueue(result.winners.map((w) => w.playerId))
      }
    }
    // Every knight on the board becomes inactive, regardless of
    // participation — CN3087 p.11: unconditional, not scoped to only the
    // knights that were actually counted.
    setPlayers((prev) => prev.map((p) => ({ ...p, knightPieces: p.knightPieces.map((k) => ({ ...k, active: false })) })))
  }

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
  const handlePhysicsSettled = (physicsD1: number, physicsD2: number) => {
    // Cities & Knights Alchemy — overrides the GAME-LOGIC dice only; the
    // physics tumble that just settled still VISUALLY shows physicsD1/
    // physicsD2 on the table (PhysicsDice3D already rendered that outcome
    // before this callback ever fires), a deliberate visual/logic mismatch
    // rather than building a predetermined-physics mode. Consumed
    // unconditionally the instant a roll attempt lands here — even one the
    // no-sevens-first-two-rolls check below goes on to void and reroll —
    // so a preset that itself sums to 7 doesn't loop the reroll forever
    // reapplying the same fixed total; a voided Alchemy roll just falls
    // back to ordinary physics on the reroll.
    const [d1, d2] = alchemyPreset ?? [physicsD1, physicsD2]
    if (alchemyPreset) setAlchemyPreset(null)
    const total = d1 + d2
    const isDouble = d1 === d2
    // The event die is rolled unconditionally, every attempt — even a
    // voided/rerolled 7 still had a real event die face, but since that
    // whole roll is discarded and rerolled below, it's rolled fresh each
    // attempt rather than hoisted above this function.
    const eventDie = rollEventDie()
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
    // Only reachable for an ACCEPTED roll (a voided 7 returns above) — same
    // "only counts once accepted" treatment lastRoll already gets inside
    // applyRollResult, so a discarded reroll attempt's face never briefly
    // shows as current on the roller's own screen.
    setLastEventDie(eventDie)
    const rollerId = players[currentPlayerIndex].id
    if (onlineInfo) {
      broadcastDiceRolled({ dice: [d1, d2], eventDie, total, playerId: rollerId })
    }

    // Cities & Knights progress card draw — roller-only (this client's own
    // local, unseeded progressCardDecks order decides which exact card each
    // eligible player draws, same trust boundary as the devDeck/
    // onDevCardBought pattern), broadcast separately from DICE_ROLLED. Runs
    // before applyRollResult, which is the shared deterministic bookkeeping
    // path (total===7 discard/robber, resource production) that every
    // client — roller and receivers alike — runs identically; card draws
    // must not become part of that path since only the roller can resolve
    // them.
    //
    // Gated EXPLICITLY on the house rule (the plan's Global Constraints
    // correction): the draw logic is NOT naturally inert when the rule is
    // off. Commodities ON + progress cards OFF — the configuration every
    // existing Phase A game is already in — has real cityImprovements
    // levels, so without this check every roll silently dealt hidden cards
    // and a drawn Printing/Constitution silently added +1 VP (getScoreBreakdown
    // counts progressCards unconditionally) to a game that never opted in.
    // This is the ONLY path that ever adds a card to a hand locally, so
    // gating it here is what makes the whole feature genuinely inert:
    // nothing broadcasts PROGRESS_CARDS_DRAWN either (that call lives inside
    // this block), and progressCardOverLimitPlayerIds' only enqueue site is
    // applyProgressCardDraws, so the discard prompt/timeout can never fire
    // in a rule-off game either.
    if (gameRules.citiesAndKnightsProgressCards && eventDie !== 'ship') {
      const track = eventDie // 'science' | 'trade' | 'politics'
      const turnOrderIds = [
        ...players.slice(currentPlayerIndex).map((p) => p.id),
        ...players.slice(0, currentPlayerIndex).map((p) => p.id),
      ]
      const result = resolveEventDieDraws(players, track, d1, progressCardDecks[track], turnOrderIds)
      if (result.draws.length > 0) {
        applyProgressCardDraws(result.draws)
        setProgressCardDecks((prev) => ({ ...prev, [track]: result.remainingDeck }))
        for (const { playerId, card } of result.draws) {
          const p = playerById.get(playerId)
          if (p) inform(`${p.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card.`)
        }
        if (onlineInfo) broadcastProgressCardsDrawn({ track, draws: result.draws })
      }
    }

    // Cities & Knights barbarian ship — the OTHER 3 event-die faces (a
    // 'ship' roll advances the barbarian ship 1 space closer to attacking).
    // This was a documented no-op through Phase B and Phase C1
    // ("this plan doesn't implement Knights & Barbarians") — this is where
    // it becomes real. Gated the same explicit way the progress-card block
    // above is: NOT naturally inert when the rule is off, since without this
    // guard a 'ship' roll would silently advance shared board state
    // (barbarianTrackPosition) even in a game that never opted into this
    // house rule.
    if (gameRules.citiesAndKnightsBarbarians && eventDie === 'ship') {
      const nextPosition = barbarianTrackPosition + 1
      if (nextPosition >= BARBARIAN_TRACK_LENGTH - 1) {
        // Reached the final position — resolve the attack NOW, roller-only
        // (same authority model as the progress-card draw above: this
        // client's own computation is trusted and broadcast, not
        // independently re-derived by receivers).
        const currentMetropolisVertexIds = new Set(
          Object.values(metropolisVertexIds).filter((v): v is string => v != null),
        )
        const attackResult = resolveBarbarianAttack(players, settlements, currentMetropolisVertexIds)
        const isFirstActivation = !robberActive
        setBarbarianTrackPosition(0)
        if (isFirstActivation) {
          setRobberActive(true)
          // CN3087 p.7: the robber does not activate until after the first
          // barbarian attack — a one-time state transition, announced the
          // same way this project already announces others (e.g. Chase Away
          // the Robber's arm/resolve banners).
          inform('The barbarians have landed — the robber is now active.')
        }
        applyBarbarianAttackResult(attackResult) // Task 5 defines this
        if (onlineInfo) broadcastBarbarianAttackResolved({ result: attackResult, robberActivated: isFirstActivation })
      } else {
        setBarbarianTrackPosition(nextPosition)
        if (onlineInfo) broadcastBarbarianShipAdvanced({ position: nextPosition })
      }
    }

    const doublesCount = applyRollResult(total, isDouble, rollerId)

    // House rule: a double grants the SAME player another roll, same turn —
    // but the PLAYER triggers it themselves via a second Roll Dice click,
    // not an automatic re-roll. Un-flagging hasRolledThisTurn puts the
    // button back in its "Roll Dice" state (rollDice's own guard already
    // requires isMyTurn, so nobody else can roll on the active player's
    // behalf); it stays that way until they roll again or hit 3 in a row.
    // Only the roller's own client decides this (only this client runs real
    // physics) — applyRollResult above already ran the shared bookkeeping
    // (counting the double, wiping the hand on a third in a row) identically
    // on every client, roller and spectators alike.
    if (gameRules.doublesRerollRule && isDouble && doublesCount < 3) {
      inform('Doubles! Roll again.')
      setHasRolledThisTurn(false)
    }
  }

  // Returns the resulting consecutive-doubles count, so handlePhysicsSettled
  // (the only caller that ever needs it) can decide whether to trigger a
  // bonus roll without re-deriving it from state that may not have
  // committed yet.
  const applyRollResult = (total: number, isDouble: boolean, rollerId: number): number => {
    setIsRolling(false)
    const roller = playerById.get(rollerId)
    // True on the roller's own client (no network delay, always still their
    // turn by the time this runs) and on a spectator's client for a NORMAL
    // roll. False only when a mirrored roll's animation is still tumbling
    // after this client already processed TURN_PASSED for it — a spectator's
    // dice take real time to settle, and a fast End Turn click right behind
    // a roll (or, with doublesRerollRule on, a quick manual re-roll click)
    // can land the near-instant TURN_PASSED handler before that animation
    // finishes. Every "whose turn is it" flag below has to be skipped in
    // that case, or the new turn gets falsely marked as already-rolled
    // before its player ever touched Roll Dice. Resource distribution
    // further down is NOT gated behind this: it must always apply so this
    // client's board stays in sync with the roller's, whichever turn it's
    // since become.
    const isStillRollersTurn = players[currentPlayerIndex]?.id === rollerId
    if (isStillRollersTurn) {
      setLastRoll(total)
      setHasRolledThisTurn(true)
    }
    // Only reachable with an ACCEPTED roll (a rerolled 7 returns early in
    // handlePhysicsSettled above and never reaches here), so this stays a
    // reliable "how many rolls has the game had" count for noSevensFirstTwoRolls.
    setTotalRollsThisGame((n) => n + 1)
    const doublesCount = isDouble && isStillRollersTurn ? consecutiveDoublesThisTurn + 1 : 0
    if (isStillRollersTurn) setConsecutiveDoublesThisTurn(doublesCount)
    debugLog('applyRollResult', {
      rollerId,
      total,
      isDouble,
      isStillRollersTurn,
      consecutiveDoublesThisTurnBefore: consecutiveDoublesThisTurn,
      doublesCount,
      lastEventDie,
      onlineLocalPlayerId: onlineInfo?.localPlayerId,
      isMyRoll: onlineInfo ? rollerId === onlineInfo.localPlayerId : true,
    })
    // Every roll gets its own log entry — the branches below (7, resource
    // yields) may call inform() again right after this, which overwrites
    // the single active EventBanner (last write wins, same synchronous
    // batch), but logEvent inside inform() APPENDS rather than replacing,
    // so this line still shows up in EventLogPanel's history even when the
    // banner itself never visibly displays it.
    inform(`${roller?.name ?? 'A player'} rolled a ${total}.`)

    if (total === 7) {
      // A stale 7 can't reach here in practice (End Turn stays disabled
      // until 'discard'/'moveRobber' resolves back to 'playing', so the
      // roller's own turn can't have already passed) but the guard is kept
      // for the same reason as everything else above: opening a robber
      // phase for a turn that's no longer the roller's would be wrong.
      if (isStillRollersTurn) {
        const handSizeOf = (p: Player) =>
          discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
        const overLimitIds = players.filter((p) => handSizeOf(p) > playerDiscardThreshold(p)).map((p) => p.id)
        debugLog('7 rolled — discard check', {
          overLimitIds,
          resourceCounts: players.map((p) => ({ id: p.id, name: p.name, total: handSizeOf(p) })),
          consecutiveDoublesThisTurn,
          onlineLocalPlayerId: onlineInfo?.localPlayerId,
        })
        if (overLimitIds.length > 0) {
          setDiscardPlayerIds(overLimitIds)
          setDiscardSelection([])
          setGamePhase('discard')
          inform('Rolled 7 — players over their card limit must discard half.')
        } else if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
          inform('Rolled 7 — move the Robber.')
          setGamePhase('moveRobber')
        } else {
          // Cities & Knights barbarian-track gate (Task 3) — before the
          // first barbarian attack resolves, the robber stays inert: CN3087
          // p.7's "does not activate until after it has been placed on the
          // desert following the first barbarian attack." No robber move,
          // no steal — control returns straight to play.
          inform('Rolled 7 — the Robber has not activated yet.')
          setGamePhase('playing')
        }
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
      const next = prev.map((p) => ({ ...p, resources: { ...p.resources }, commodities: { ...p.commodities } }))
      const byId = new Map(next.map((p) => [p.id, p]))

      for (const tile of tiles) {
        if (tile.number !== total) continue
        if (tile.id === robberTileId) continue // blocked by the Robber

        const resource = BIOME_TO_RESOURCE[tile.biome]
        if (!resource) continue

        const commodity = COMMODITY_FOR_BIOME[tile.biome]

        const vertexIds = graph.tileVertexIds.get(tile.id) ?? []
        for (const vertexId of vertexIds) {
          const building = settlements[vertexId]
          if (!building) continue
          const owner = byId.get(building.ownerId)
          if (!owner) continue

          // A city on a commodity-producing hex (forest/pasture/mountains)
          // gets 1 resource + 1 commodity instead of 2 resource, when the
          // house rule is on. Settlements and fields/hills/desert
          // production are untouched.
          if (building.type === 'city' && gameRules.citiesAndKnightsCommodities && commodity) {
            owner.resources[resource] += 1
            owner.commodities[commodity] += 1
            messages.push(
              `${owner.name} city yields 1 ${RESOURCE_LABELS[resource]} + 1 ${COMMODITY_LABELS[commodity]}!`,
            )
            continue
          }

          const amount = building.type === 'city' ? 2 : 1
          owner.resources[resource] += amount
          if (building.type === 'city') {
            messages.push(`${owner.name} city yields ${amount} ${RESOURCE_LABELS[resource]}!`)
          }
        }
      }

      return next
    })

    // Science level 3: a player who received nothing this roll gets 1 free
    // resource of their choice — never on a 7 (a 7 doesn't produce at all,
    // and separately triggers discard, not this). Reads players/settlements/
    // graph from the enclosing closure, same as the production loop above —
    // players' cityImprovements aren't touched by that loop, so the
    // pre-update snapshot is still accurate for the science-level check.
    if (gameRules.citiesAndKnightsCommodities && total !== 7) {
      const producedTileIds = tiles.filter((t) => t.number === total && t.id !== robberTileId).map((t) => t.id)
      const producingVertexIds = new Set(producedTileIds.flatMap((id) => graph.tileVertexIds.get(id) ?? []))
      const playersWithProduction = new Set(
        [...producingVertexIds].map((vertexId) => settlements[vertexId]?.ownerId).filter((id): id is number => id != null),
      )
      const eligiblePlayerIds = players
        .filter((p) => p.cityImprovements.science >= 3 && !playersWithProduction.has(p.id))
        .map((p) => p.id)
      // Merge, don't replace: a player queued from an earlier roll who
      // hasn't resolved their pick yet (online, e.g. AFK/slow) must stay
      // queued even if a later roll's eligible set doesn't include them —
      // otherwise their still-unclaimed bonus is silently dropped.
      if (eligiblePlayerIds.length > 0) {
        setScienceFreeResourcePlayerIds((prev) => [...new Set([...prev, ...eligiblePlayerIds])])
      }
    }

    if (messages.length > 0) {
      inform(messages.join(' '))
    } else {
      setBanner(null)
    }

    // House rule: a third consecutive double empties the roller's hand —
    // unconditionally, overriding whatever this same roll's own resource
    // yield above just granted. total===7 can never be a double, so this
    // never races the discard/moveRobber branch further up. doublesCount is
    // forced to 0 whenever !isStillRollersTurn (above), so reaching >= 3
    // here already guarantees roller is still the active player.
    if (gameRules.doublesRerollRule && doublesCount >= 3 && roller) {
      debugLog('doubles-reroll hand wipe', { rollerId: roller.id, rollerName: roller.name, doublesCount, isStillRollersTurn })
      setPlayers((prev) => prev.map((p) => (p.id === roller.id ? { ...p, resources: emptyResources() } : p)))
      inform(`${roller.name} rolled doubles three times in a row — hand emptied!`)
    }

    return doublesCount
  }

  const handleDiceSettled = () => {
    if (!diceRoll || diceRollPlayerId == null) return
    // Spectator-side mirror of a broadcast roll — never triggers its own
    // bonus reroll (only the roller's handlePhysicsSettled does that), so
    // the returned doublesCount has no caller here.
    applyRollResult(diceRoll.d1 + diceRoll.d2, diceRoll.d1 === diceRoll.d2, diceRollPlayerId)
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
    const handSize = discardHandSize(player.resources, player.commodities, gameRules.citiesAndKnightsCommodities)
    const required = Math.floor(handSize / 2)
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
    const handSize = discardHandSize(player.resources, player.commodities, gameRules.citiesAndKnightsCommodities)
    const required = Math.floor(handSize / 2)
    if (discardSelection.length !== required) return

    // Card ids are "<resourceType|commodityType>-<index>" (buildCardSlots in
    // PlayerHand3D) — the index is purely a 3D-picking detail, only the
    // type prefix matters for the actual resource/commodity mutation.
    const counts: Partial<Record<ResourceType | CommodityType, number>> = {}
    for (const id of discardSelection) {
      const type = id.slice(0, id.lastIndexOf('-')) as ResourceType | CommodityType
      // Safe today only via a cross-file invariant (PlayerHand3D never lets
      // a dev-card id into discardSelection, and no ResourceType/
      // CommodityType contains a hyphen) — validated here too so a future
      // change to either side can't silently slip a bogus key into a real
      // resource/commodity mutation.
      if (!RESOURCE_ORDER.includes(type as ResourceType) && !COMMODITY_ORDER.includes(type as CommodityType)) {
        console.error('[Catan] Ignoring an unrecognized card id in discard selection:', id)
        continue
      }
      counts[type] = (counts[type] ?? 0) + 1
    }

    applyDiscard(activeDiscarderId, counts)
    setDiscardSelection([])
    inform(`${player.name} discarded ${required} card${required === 1 ? '' : 's'}.`)
    if (onlineInfo) broadcastDiscardConfirmed({ playerId: activeDiscarderId, counts })
  }

  // Cities & Knights progress-card hand limit (4 cards, VP cards excluded —
  // see progressCardHandExcess). Deliberately the front of the queue only —
  // unlike activeDiscarderId above (which branches on onlineInfo for
  // parallel per-player resolution), this is always progressCardOverLimitPlayerIds[0],
  // online or local: only one player resolves a progress-card discard at a
  // time. Combined with GameHud computing its own isMyProgressDiscardTurn as
  // activeProgressDiscarderId === viewer.id, this still resolves correctly
  // per-screen online (each screen's viewer is already that browser's own
  // player), and simply waits for the queue to reach a given player's own
  // turn in local Pass & Play.
  const activeProgressDiscarderId = progressCardOverLimitPlayerIds[0] ?? null
  const progressDiscardingPlayer = activeProgressDiscarderId != null ? playerById.get(activeProgressDiscarderId) : null
  // applyProgressCardDraws now only enqueues players actually over the limit
  // (it used to enqueue everyone who drew anything and leave the filtering
  // to this line, which meant a prompt-and-Confirm click chain for players
  // who owed nothing — see that function's own comment). This is still
  // computed live rather than frozen at enqueue time, and can still
  // legitimately read 0: a queued player can be brought back under the limit
  // by something else before they confirm (Espionage taking one of their
  // cards, say), and a snapshot restore rehydrates the queue as-saved.
  const progressDiscardRequiredCount = progressDiscardingPlayer
    ? progressCardHandExcess(progressDiscardingPlayer.progressCards)
    : 0

  const toggleProgressDiscardSelection = (index: number) => {
    if (activeProgressDiscarderId == null) return
    const player = playerById.get(activeProgressDiscarderId)
    if (!player) return
    const required = progressCardHandExcess(player.progressCards)
    setProgressDiscardSelection((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index)
      if (prev.length >= required) return prev
      return [...prev, index]
    })
  }

  const confirmProgressDiscard = () => {
    if (activeProgressDiscarderId == null) return
    const player = playerById.get(activeProgressDiscarderId)
    if (!player) return
    const required = progressCardHandExcess(player.progressCards)
    if (progressDiscardSelection.length !== required) {
      warn(`Choose exactly ${required} progress card${required === 1 ? '' : 's'} to discard.`)
      return
    }
    applyProgressDiscard(activeProgressDiscarderId, progressDiscardSelection)
    setProgressDiscardSelection([])
    inform(`${player.name} discarded ${required} progress card${required === 1 ? '' : 's'} (hand limit).`)
    if (onlineInfo) broadcastProgressDiscardConfirmed({ playerId: activeProgressDiscarderId, indices: progressDiscardSelection })
  }

  // A disconnected (or simply slow) over-limit player used to stall the
  // whole table forever after any 7-roll — gamePhase can't leave 'discard'
  // until every over-limit player has confirmed their OWN discard, and
  // there was no host or timeout fallback. Host-authoritative (same
  // pattern as resolveTradeAsHost): only the host's client applies the
  // forced discard and broadcasts it, so every other client applies it
  // exactly once via the same trusted onDiscardConfirmed path a normal
  // discard already uses — letting every client independently run this
  // would double-apply the same subtraction on every screen. Local Pass &
  // Play has no separate host/broadcast concept, so it applies directly.
  useEffect(() => {
    if (gamePhase !== 'discard' || validDiscardPlayerIds.length === 0) return
    if (onlineInfo && !isEffectiveHost) return
    const timer = setTimeout(() => {
      for (const playerId of validDiscardPlayerIds) {
        const player = playerById.get(playerId)
        if (!player) continue
        const handSize = discardHandSize(player.resources, player.commodities, gameRules.citiesAndKnightsCommodities)
        const required = Math.floor(handSize / 2)
        const counts = autoDiscardCounts(player.resources, player.commodities, required)
        applyDiscard(playerId, counts)
        inform(`${player.name}'s discard timed out — ${required} card${required === 1 ? '' : 's'} discarded automatically.`)
        if (onlineInfo) broadcastDiscardConfirmed({ playerId, counts })
      }
    }, DISCARD_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playerById/onlineInfo/inform/applyDiscard/broadcastDiscardConfirmed are read fresh via closure; only gamePhase/validDiscardPlayerIds/isEffectiveHost identity should restart the timer.
  }, [gamePhase, validDiscardPlayerIds, isEffectiveHost])

  // Mirrors the DISCARD_TIMEOUT_MS effect above for the progress-card
  // hand-limit queue instead of the resource-discard one — keyed on
  // progressCardOverLimitPlayerIds instead of validDiscardPlayerIds, and
  // greedily discards from the START of the array (index 0 upward) rather
  // than reusing autoDiscardCounts (that function is resource/commodity-
  // typed, not applicable here; this fallback doesn't need "spread the
  // loss" sophistication, arbitrary order is fine for an unresponsive
  // player). Two SEPARATE guards, same as the resource-discard timeout
  // above — `isEffectiveHost` alone is FALSE for local Pass & Play
  // (isEffectiveHost's own definition starts `if (!onlineInfo) return
  // false`), so folding it into the first check would silently disable
  // this timeout for local play entirely. The second check only bails when
  // we're online AND not the effective host; local play always proceeds.
  useEffect(() => {
    if (progressCardOverLimitPlayerIds.length === 0) return
    if (onlineInfo && !isEffectiveHost) return
    const timer = setTimeout(() => {
      for (const playerId of progressCardOverLimitPlayerIds) {
        const player = playerById.get(playerId)
        if (!player) continue
        const required = progressCardHandExcess(player.progressCards)
        const indices = Array.from({ length: required }, (_, i) => i)
        applyProgressDiscard(playerId, indices)
        inform(`${player.name}'s progress card discard timed out — ${required} discarded automatically.`)
        if (onlineInfo) broadcastProgressDiscardConfirmed({ playerId, indices })
      }
    }, DISCARD_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as the resource-discard timeout effect above (App.tsx:1856): playerById/onlineInfo/inform/applyProgressDiscard/broadcastProgressDiscardConfirmed read fresh via closure.
  }, [progressCardOverLimitPlayerIds, isEffectiveHost])

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
          if (
            owner &&
            getPublicScore(owner, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders, merchantHolderId) <= 2
          )
            continue
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

    // Cities & Knights "Chase Away the Robber" (Task 11) — only set when
    // this resolution was armed via armChaseRobber (a rolled 7 never sets
    // chasingRobberKnightId), so a plain 7-triggered move is unaffected.
    // applyRobberMove just above already returned gamePhase to 'playing'
    // (it's the shared helper both this local path and the onRobberMoved
    // network receiver call — see its own comment), so this simply appends
    // to moveRobber's tail rather than needing to precede a
    // setGamePhase('playing') call of moveRobber's own (moveRobber has none;
    // it delegates that transition to applyRobberMove). `thief` is the SAME
    // binding computed above, reused here rather than redeclared — a knight
    // action can only ever be armed by the current turn's player (armChaseRobber
    // enforces isMyTurn, like every other knight handler), so the knight's
    // owner and this thief are always the same player.
    if (chasingRobberKnightId) {
      const chaserId = chasingRobberKnightId
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== thief.id ? p : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === chaserId ? { ...k, active: false } : k)) },
        ),
      )
      setChasingRobberKnightId(null)
      if (onlineInfo) broadcastKnightDeactivatedAfterChase({ playerId: thief.id, knightId: chaserId })
    }
  }

  // The ONLY place currentPlayerIndex ever advances or TURN_PASSED fires —
  // an explicit user click, never an automatic side effect of dice physics
  // settling or a robber move resolving. Requires a roll to have actually
  // happened first, and (implicitly, via gamePhase !== 'playing' below) that
  // any pending robber move from a natural 7 has already been resolved.
  const handleEndTurn = () => {
    // Was its own `if (winner) return` — canPerformAction also blocks while
    // a trade offer or dev-card picker overlay is open, the same
    // defense-in-depth every other action handler in this file already
    // has. Not reachable through the current UI (the End Turn button is
    // hidden/disabled in those states too), but worth keeping in sync with
    // its siblings rather than relying solely on the UI condition.
    if (!canPerformAction()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (gamePhase !== 'playing' || !hasRolledThisTurn) {
      warn('Roll the dice before ending your turn.')
      return
    }
    // Same defense-in-depth as canPerformAction's pendingTrade/devCardPicker
    // guards: an unresolved Metropolis claim is a forced choice, and letting
    // the turn advance past it would strand the claim on a player who is no
    // longer the current player — the marker would never be placed, and the
    // NEXT player to reach that level would wrongly resolve as its "first"
    // claimant. Scoped to the current player's own claim so a stale claim
    // belonging to someone else can never freeze the whole table.
    if (pendingMetropolisClaim && pendingMetropolisClaim.playerId === players[currentPlayerIndex]?.id) {
      warn('Choose a city for the new Metropolis first.')
      return
    }
    // Cities & Knights Invention — same defense-in-depth as the Metropolis
    // claim guard just above: the card is already spent the instant
    // pendingInventionSwap is set (playInvention), so letting the turn
    // advance past an unresolved pick would strand it. Locally (Pass & Play)
    // that's worse than just "annoying": TileSwapLayer's `active` prop
    // compares pendingInventionSwap.playerId against localPlayer.id, which
    // TRACKS the current player on a shared device — the instant the turn
    // passed, the picker would silently vanish for the new current player,
    // permanently losing the swap's second tile with no way to resume it.
    if (pendingInventionSwap && pendingInventionSwap.playerId === players[currentPlayerIndex]?.id) {
      warn('Finish your Invention tile swap first.')
      return
    }
    // Cities & Knights Diplomacy — same defense-in-depth as the Invention
    // guard just above: unlike pendingInventionSwap, the card itself isn't
    // spent yet at this point (see pendingDiplomacyRemoval's own comment), so
    // letting the turn advance wouldn't strand a spent card — but it WOULD
    // leave pendingDiplomacyRemoval permanently set to this player's id,
    // silently reactivating the picker (with no card having been played)
    // if this same player ever becomes the current player again on some
    // later turn. Blocking here, rather than just clearing it silently,
    // keeps this consistent with Metropolis/Invention's own "forced choice,
    // finish it before ending your turn" precedent.
    if (pendingDiplomacyRemoval && pendingDiplomacyRemoval.playerId === players[currentPlayerIndex]?.id) {
      warn('Choose a road to remove with Diplomacy first.')
      return
    }
    // Cities & Knights Merchant — identical reasoning to the Invention guard
    // above, and identical failure modes without it: the card is already
    // spent the instant pendingMerchantPlacement is set (playMerchant), so
    // ending the turn stranded a spent card. Online it was worse than
    // stranding — the picker stayed live into the opponent's turn (see
    // handleMerchantTileSelect's own guard, the other half of this fix).
    // Locally, MerchantLayer's placingPlayerId compares against localPlayer.id,
    // which TRACKS the current player on a shared device, so the picker
    // silently vanished on turn advance instead.
    if (pendingMerchantPlacement != null && pendingMerchantPlacement === players[currentPlayerIndex]?.id) {
      warn('Place the Merchant on a hex first.')
      return
    }
    // Cities & Knights Engineering (Task 13) — identical reasoning to the
    // Merchant guard just above: playEngineering spends the card the instant
    // pendingFreeCityWall is set, so ending the turn before resolveFreeCityWall
    // runs would strand a spent card with its free wall never placed.
    if (pendingFreeCityWall != null && pendingFreeCityWall === players[currentPlayerIndex]?.id) {
      warn('Choose a city for your free wall first.')
      return
    }
    // Cities & Knights Intrigue (Task 14) — identical reasoning to the
    // Merchant/Engineering guards above: playIntrigue spends the card the
    // instant pendingIntrigueDisplace is set, so ending the turn before a
    // knight is actually chosen would strand a spent card with its
    // displacement never resolved.
    if (pendingIntrigueDisplace != null && pendingIntrigueDisplace === players[currentPlayerIndex]?.id) {
      warn('Choose a knight to displace with Intrigue first.')
      return
    }
    // Cities & Knights Treason (Task 14) — identical reasoning: playTreason
    // spends the card (and removes the target's knight) up front, then
    // pendingTreasonPlacement stays set while the acting player picks where
    // to place their own replacement knight.
    if (pendingTreasonPlacement && pendingTreasonPlacement.playerId === players[currentPlayerIndex]?.id) {
      warn('Place your knight first.')
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
    if (!hasRolledThisTurn) {
      warn('Roll the dice before trading.')
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

  // Cities & Knights Trade level 3 — trade 2 of any one commodity for 1 of
  // any other commodity or resource, any time on your own turn. Mirrors
  // EVERY guard bankTrade (just above) has, in the same order — this is a
  // sibling trade action exposed from the same TradeModal, not a build/buy
  // action like buyCityImprovement, so it follows bankTrade's gating shape
  // (including the isMyTurn re-check reasoning below) rather than
  // buyCityImprovement's canInteract()-based one.
  const tradeCommodity = (give: CommodityType, receive: ResourceType | CommodityType) => {
    if (!canPerformAction()) return
    if (gamePhase !== 'playing') {
      warn("You can't trade right now.")
      return
    }
    if (!hasRolledThisTurn) {
      warn('Roll the dice before trading.')
      return
    }
    // Same reasoning as bankTrade's guard just above — the trade window can
    // stay open across a turn change, so without this check a window left
    // open from a past turn could mutate whoever's turn it currently is.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (give === receive) {
      warn('Pick two different cards to trade.')
      return
    }

    const player = players[currentPlayerIndex]
    // Cities & Knights Merchant Fleet — the SAME merchantFleetRate check
    // getPortRate applies to resource bank-trades, applied here too for
    // commodity bank-trades (this ability names EITHER a resource or a
    // commodity, so naming one has to cover both trade tabs consistently).
    // Only unlocks the ONE named commodity below Trade level 3 — every OTHER
    // commodity still requires the real level.
    const hasMerchantFleetRate = merchantFleetRate?.playerId === player.id && merchantFleetRate.type === give
    if (!hasMerchantFleetRate && player.cityImprovements.trade < 3) {
      warn('Reach Trade level 3 to trade commodities.')
      return
    }
    if (player.commodities[give] < 2) {
      warn(`Not enough ${COMMODITY_LABELS[give]} to trade.`)
      return
    }

    applyCommodityTrade(player.id, give, receive)
    const receiveLabel = (COMMODITY_ORDER as string[]).includes(receive)
      ? COMMODITY_LABELS[receive as CommodityType]
      : RESOURCE_LABELS[receive as ResourceType]
    inform(`${player.name} traded 2 ${COMMODITY_LABELS[give]} for 1 ${receiveLabel}.`)
    if (onlineInfo) broadcastCommodityTraded({ playerId: player.id, give, receive })
  }

  const proposePlayerTrade = (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => {
    if (!canPerformAction()) return
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't trade right now.")
      return
    }
    if (!hasRolledThisTurn) {
      warn('Roll the dice before trading.')
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
    // A double-click (or a stray double key-activation) on Accept/Decline
    // used to be able to fire this twice before the first call's
    // setPendingTrade(null) had actually re-rendered — the host-as-target
    // path in particular ran resolveTradeAsHost, and therefore the resource
    // swap, off the same closure-captured state for both clicks.
    if (isResolvingTradeRef.current) return
    isResolvingTradeRef.current = true

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
      // state, so there's nothing to arbitrate between DIFFERENT clients —
      // but the accepting player's own resources still need checking here.
      // Only the OFFERER's side was validated back when the trade was
      // proposed; applyTradeResolution itself deliberately trusts its
      // caller rather than re-validating (see its own comment), so nothing
      // upstream confirms the ACCEPTER actually still has what's being
      // asked for — accepting a trade for a resource you don't have used
      // to send that count to -1 while the proposer received a resource
      // they never paid for.
      const fromPlayer = playerById.get(pendingTrade.fromPlayerId)
      const toPlayer = playerById.get(pendingTrade.toPlayerId)
      if (
        !fromPlayer ||
        !toPlayer ||
        toPlayer.resources[pendingTrade.wantResource] < 1 ||
        fromPlayer.resources[pendingTrade.offerResource] < 1
      ) {
        const reason = `The trade between ${fromPlayer?.name ?? 'a player'} and ${toPlayer?.name ?? 'a player'} fell through — resources changed.`
        setPendingTrade(null)
        inform(reason)
        return
      }
      applyTradeResolution(pendingTrade)
      setPendingTrade(null)
      return
    }

    if (isEffectiveHost) {
      // The (effective) host accepting their own incoming offer: resolve
      // directly rather than broadcasting a request to itself — Realtime
      // broadcasts don't echo back to the sender, so nothing would ever
      // receive it.
      resolveTradeAsHost(pendingTrade)
    } else {
      // Not the (effective) host: don't apply locally. Ask whoever has
      // host authority right now to validate against their own
      // authoritative resource counts first (pendingTrade stays set —
      // still awaiting TRADE_RESOLVED/TRADE_CANCELLED).
      broadcastTradeAcceptRequest(pendingTrade)
    }
  }

  // A pending trade used to have no way out short of the target explicitly
  // accepting or declining — canPerformAction() blocks rolling, building,
  // trading, and buying dev cards for the WHOLE TABLE while it's set, and
  // the offerer has no cancel affordance at all (TradeOfferPrompt only
  // renders for the target). If the target simply never responds — closes
  // their tab, walks away — the game was stuck forever with only a host
  // restart (losing all progress) as a way out. The effect's own cleanup
  // clears the previous timer on every change to `pendingTrade`, so by the
  // time this actually fires it's guaranteed to still be the same trade;
  // every connected client runs it independently and idempotently clears
  // the same trade, so it resolves even if the offerer's own client is the
  // one that's gone.
  useEffect(() => {
    if (!pendingTrade) return
    const timer = setTimeout(() => {
      const reason = 'The trade offer expired with no response.'
      setPendingTrade(null)
      inform(reason)
      if (onlineInfo) broadcastTradeCancelled({ reason })
    }, TRADE_OFFER_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inform/broadcastTradeCancelled are stable-enough callers read fresh via closure each run; only pendingTrade/onlineInfo identity should restart the timer.
  }, [pendingTrade, onlineInfo])

  // Un-blocks resolvePlayerTrade's double-click guard whenever pendingTrade
  // itself changes — including the moment a trade is newly proposed, so a
  // stale `true` left over from a PREVIOUS trade's resolution never blocks
  // this one.
  useEffect(() => {
    isResolvingTradeRef.current = false
  }, [pendingTrade])

  const buyDevCard = () => {
    if (!canPerformAction()) return
    if (gamePhase !== 'playing' || isRolling) {
      warn("You can't buy a development card right now.")
      return
    }
    // Every sibling handler (bankTrade, proposePlayerTrade) has this same
    // guard — buyDevCard always acts on players[currentPlayerIndex], so
    // without it a non-active player could spend the active player's
    // resources if the buy button were ever enabled for them by a future
    // UI change. Not reachable through the current UI (GameHud's own
    // canBuyDevCard already folds in isMyTurn) — pure defense-in-depth to
    // match the rest of this file.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (!hasRolledThisTurn) {
      warn('Roll the dice before buying a development card.')
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

  // Cities & Knights house rule — spends commodities to advance one of the
  // acting player's 3 city improvement tracks by a level. Crossing into
  // level 4 or 5 additionally requires a spare city (not already flying
  // THIS track's Metropolis) — but ONLY when this specific purchase would
  // actually flip control to the buyer (purchaseClaimsMetropolis). A second
  // player merely matching an existing level-4 holder doesn't get a marker
  // at all (the incumbent keeps temporary control — arrival-order rule, see
  // metropolisHolderAfterPurchase), and a player who already holds this
  // track doesn't need to re-place anything just to level up further.
  // Gating/prompting on newLevel alone (ignoring who'd actually end up
  // holding it) would let a non-claiming purchase overwrite
  // metropolisVertexIds with the wrong player's city while metropolisHolders
  // still (correctly) names someone else — the two would disagree about who
  // controls what — and would also make an already-holder's own re-level
  // permanently stuck re-prompting for a city they can never re-select (the
  // "already holds this Metropolis" guard in buildSettlementRaw would keep
  // rejecting their own already-marked city). Enforced here, at spend time,
  // so a player can never pay for a claim they can't actually place.
  const buyCityImprovement = (track: ImprovementTrack) => {
    const player = players[currentPlayerIndex]
    if (!canInteract()) return
    // canInteract() above only rejects 'moveRobber', NOT 'discard' — so
    // without this the acting player could still climb a track mid-discard,
    // changing the very commodity count their own required discard was sized
    // against. Every sibling action (buyDevCard, bankTrade,
    // proposePlayerTrade, tradeCommodity) states the phase explicitly for the
    // same reason. No isRolling re-check here, unlike those siblings —
    // canInteract() already covers it (they only need their own because they
    // gate on the weaker canPerformAction()).
    if (gamePhase !== 'playing') {
      warn("You can't buy a city improvement right now.")
      return
    }
    // Same "roll before you build/buy" gate every other action in this file
    // already has (buildSettlementRaw, buildRoad, buyDevCard, bankTrade) —
    // without it, leftover commodities from a prior turn let a player buy an
    // improvement the instant their turn starts, before rolling.
    if (!hasRolledThisTurn) {
      warn('Roll the dice before buying a city improvement.')
      return
    }
    // Cities & Knights Crane — "Build 1 city improvement for 1 commodity
    // less than normal." Deliberately does NOT touch cityImprovements.ts's
    // pure canAffordImprovement/buyImprovementLevel (other call sites depend
    // on their exact signatures) — implemented as a pay-full-then-refund-1
    // wrapper here instead, scoped entirely to this function. The
    // affordability check must ALSO account for the discount:
    // canAffordImprovement's FULL-cost check would wrongly block a player
    // who can only afford the DISCOUNTED price. Mirrors canAffordImprovement's
    // own max-level ceiling (MAX_IMPROVEMENT_LEVEL) so an already-maxed track
    // can't misread as "affordable," which would let the post-purchase
    // refund below hand out a free commodity once buyImprovementLevel's own
    // ceiling guard silently no-ops the purchase.
    const hasCraneDiscount = craneDiscountPlayerId === player.id
    const currentLevel = player.cityImprovements[track]
    const affordable = hasCraneDiscount
      ? currentLevel < MAX_IMPROVEMENT_LEVEL &&
        player.commodities[COMMODITY_FOR_TRACK[track]] >= Math.max(0, improvementLevelCost(currentLevel + 1) - 1)
      : canAffordImprovement(player.commodities, track, currentLevel)
    if (!affordable) {
      warn('Not enough commodities for that improvement.')
      return
    }
    const newLevel = currentLevel + 1
    // One shared verdict for BOTH this gate and GameHud's disabled-button
    // state — see evaluateMetropolisPurchase's own comment on why neither
    // side re-derives currentHolderLevel or the own-city filter itself.
    const { claimsMetropolis, blocked } = evaluateMetropolisPurchase(
      players,
      settlements,
      metropolisHolders,
      metropolisVertexIds,
      track,
      player.id,
    )
    if (blocked) {
      warn('You need a spare city not already flying this Metropolis to reach that level.')
      return
    }
    // A second claiming purchase before the first has been placed would
    // overwrite pendingMetropolisClaim and silently discard the first claim:
    // that track's holder would stay null forever, and a LATER player
    // reaching level 4 on it would then wrongly resolve as its first
    // claimant. Refuse the purchase outright (nothing is spent) rather than
    // queueing — a player can only ever be mid-claim on their OWN turn, and
    // handleEndTurn already refuses to advance past an unresolved claim.
    if (claimsMetropolis && pendingMetropolisClaim) {
      warn('Resolve your current Metropolis claim first.')
      return
    }

    applyCityImprovementPurchase(player.id, track)
    // Refund step of Crane's pay-full-then-refund-1 discount — applyCityImprovementPurchase
    // just deducted the FULL cost via buyImprovementLevel, so 1 of the
    // matching commodity comes back here, and the 1-time flag is cleared so
    // it can't be reused by a later purchase. craneDiscount is carried on
    // the broadcast below so every OTHER client applies the identical
    // refund — without it, a receiver's own applyCityImprovementPurchase
    // would deduct the full cost with no refund, permanently desyncing this
    // player's commodity count between clients.
    if (hasCraneDiscount) {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                commodities: {
                  ...p.commodities,
                  [COMMODITY_FOR_TRACK[track]]: p.commodities[COMMODITY_FOR_TRACK[track]] + 1,
                },
              }
            : p,
        ),
      )
      setCraneDiscountPlayerId(null)
    }
    inform(`${player.name} built the ${IMPROVEMENT_TRACK_NAMES[track][newLevel - 1]} (${IMPROVEMENT_TRACK_LABELS[track]} level ${newLevel}).`)
    if (onlineInfo) broadcastCityImprovementPurchased({ playerId: player.id, track, newLevel, craneDiscount: hasCraneDiscount })
    if (claimsMetropolis) {
      setPendingMetropolisClaim({ track, playerId: player.id })
      // Selection is resolved by clicking one of the player's own eligible
      // cities — see buildSettlementRaw's early branch. metropolisHolders/
      // metropolisVertexIds don't update until that click resolves.
    }
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

  // Cities & Knights Resource Monopoly — mirrors playMonopoly above for the
  // spend-then-open-picker SHAPE only: it spends the card and opens the
  // SAME DevCardResourcePicker (via the widened DevCardPickerMode) that
  // base-game Monopoly uses, but resolveDevCardPicker's
  // resourceMonopolyProgress branch calls a SEPARATE effect function,
  // applyResourceMonopolyProgressEffect (take-2-or-fewer per player, not
  // base Monopoly's take-all — see that function's own comment). Unlike
  // playMonopoly (reached only through ResourcePanel's dev-card buttons,
  // which are already isMyTurn-gated), this is dispatched through
  // progressCardPlayHandlers/ProgressCardsPanel — guarded directly anyway
  // per this plan's "guard even when the UI already blocks it" convention
  // (buyDevCard's own comment), since resolveDevCardPicker is a SHARED
  // function also used by the base-game Monopoly/Year-of-Plenty dev cards
  // and the panel-level gate alone isn't enough to stop a stale click from
  // reaching it.
  const playResourceMonopoly = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('resourceMonopoly')) {
      warn('No Resource Monopoly card to play.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'resourceMonopoly') } : p)),
    )
    setDevCardPicker('resourceMonopolyProgress')
  }

  // Cities & Knights Trade Monopoly — same 2-step spend-then-picker shape
  // as playResourceMonopoly just above, but opens DevCardCommodityPicker
  // (via resolveDevCardCommodityPicker) instead, since it announces a
  // CommodityType. Same isMyTurn guard reasoning as playResourceMonopoly.
  const playTradeMonopoly = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('tradeMonopoly')) {
      warn('No Trade Monopoly card to play.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'tradeMonopoly') } : p)),
    )
    setDevCardPicker('tradeMonopolyProgress')
  }

  // Cities & Knights Alchemy — playable only pre-roll (same gate every
  // other pre-roll-only action uses), so unlike playIrrigation/playMining
  // below it isn't wired into progressCardPlayHandlers at all: it has its
  // own 2-number picker UI rendered near the Roll Dice button instead of
  // ProgressCardsPanel's generic click-to-play (see GameHud.tsx), and
  // simply having no entry in progressCardPlayHandlers already makes
  // ProgressCardsPanel render its card as disabled, so it can't be
  // reached via a plain click either. No broadcast here — alchemyPreset
  // only matters on the roller's own client, consumed by
  // handlePhysicsSettled before that client ever calls
  // broadcastDiceRolled, so every other client already receives the
  // final, overridden dice/total with no separate signal needed.
  const playAlchemy = (d1: number, d2: number) => {
    if (!canPlayProgressCardNow()) return
    // Not currently reachable through the UI — the picker that calls this
    // is itself gated on isMyTurn (GameHud.tsx) — but every sibling
    // pre-roll/dev-card handler in this file (rollDice, buyDevCard,
    // canPlayDevCardNow) guards directly too rather than relying solely on
    // the UI gate; matching that convention here.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (hasRolledThisTurn) {
      warn('Alchemy can only be played before rolling.')
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('alchemy')) {
      warn('No Alchemy card to play.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'alchemy') } : p)),
    )
    setAlchemyPreset([d1, d2])
    inform(`${player.name} played Alchemy — the next roll's production dice are fixed.`)
  }

  // Shared by Irrigation (fields -> grain) and Mining (mountains -> ore) —
  // same "count unique tiles of one biome touching any of my buildings"
  // shape, just a different biome/resource pair. Counts each qualifying
  // tile once even if 2+ of the player's buildings touch it (a tileIds
  // Set, not a running total over every building).
  const countAdjacentBiomeHexes = (playerId: number, biome: Biome): number => {
    const ownedVertexIds = Object.entries(settlements)
      .filter(([, b]) => b.ownerId === playerId)
      .map(([vertexId]) => vertexId)
    const tileIds = new Set<string>()
    for (const vertexId of ownedVertexIds) {
      for (const tileId of graph.vertexTileIds.get(vertexId) ?? []) tileIds.add(tileId)
    }
    let count = 0
    for (const tileId of tileIds) {
      const tile = tiles.find((t) => t.id === tileId)
      if (tile?.biome === biome) count += 1
    }
    return count
  }

  // Trusted-apply for Irrigation — shared by the local play handler
  // (playIrrigation, below, which also spends via this same call and
  // broadcasts) and the receiving client (onProgressCardPlayed), which
  // calls this and only this: both clients compute the identical hexCount
  // from the same public board state, and removeOne here converges to an
  // equivalent hand on every client even independently (see
  // ProgressCardPlayedPayload's own comment in useRoomChannel.ts for why
  // that's safe).
  const applyIrrigationEffect = (playerId: number) => {
    const player = playerById.get(playerId)
    if (!player) return
    const hexCount = countAdjacentBiomeHexes(playerId, 'fields')
    const amount = hexCount * 2
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, resources: { ...p.resources, grain: p.resources.grain + amount }, progressCards: removeOne(p.progressCards, 'irrigation') }
          : p,
      ),
    )
    inform(`${player.name} played Irrigation — gained ${amount} Grain (${hexCount} field hexes).`)
  }

  const playIrrigation = () => {
    if (!canPlayProgressCardNow()) return
    // playIrrigation/playMining always act on players[currentPlayerIndex] —
    // without this guard, a non-turn player clicking their OWN Irrigation
    // card (ProgressCardsPanel shows viewer.progressCards regardless of
    // whose turn it is) would spend and credit the ACTUAL current player's
    // copy instead, if that player happened to also hold one. Same
    // "defense-in-depth to match the rest of this file" guard buyDevCard's
    // own comment describes — ProgressCardsPanel's disabled prop now also
    // gates on isMyTurn (GameHud.tsx), but this is the one place that
    // actually stops it if that ever drifts.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('irrigation')) {
      warn('No Irrigation card to play.')
      return
    }
    applyIrrigationEffect(player.id)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'irrigation' })
  }

  // Mining mirrors Irrigation exactly: biome 'mountains', resource 'ore',
  // card 'mining' — see applyIrrigationEffect's own comment for the trust
  // reasoning, identical here.
  const applyMiningEffect = (playerId: number) => {
    const player = playerById.get(playerId)
    if (!player) return
    const hexCount = countAdjacentBiomeHexes(playerId, 'mountains')
    const amount = hexCount * 2
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, resources: { ...p.resources, ore: p.resources.ore + amount }, progressCards: removeOne(p.progressCards, 'mining') }
          : p,
      ),
    )
    inform(`${player.name} played Mining — gained ${amount} Ore (${hexCount} mountain hexes).`)
  }

  const playMining = () => {
    if (!canPlayProgressCardNow()) return
    // See playIrrigation's own comment just above — identical reasoning.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('mining')) {
      warn('No Mining card to play.')
      return
    }
    applyMiningEffect(player.id)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'mining' })
  }

  // Cities & Knights Crane — spends the card and arms a 1-time "next city
  // improvement purchase costs 1 less" discount, consumed inside
  // buyCityImprovement (pay-full-then-refund-1, see that function's own
  // comment for why it's implemented as a wrapper there rather than
  // touching cityImprovements.ts's pure functions). Shared by the local
  // actor (playCrane, below) and the receiving client (onProgressCardPlayed)
  // so both remove the card from the SAME hand array — unlike Irrigation/
  // Mining's effect, craneDiscountPlayerId itself is only ever READ on the
  // acting client (buyCityImprovement only ever runs for players[currentPlayerIndex]
  // on THIS client), but setting it here too keeps this function's shape
  // identical for both callers regardless, matching the established pattern.
  const applyCraneEffect = (playerId: number) => {
    const player = playerById.get(playerId)
    if (!player) return
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, progressCards: removeOne(p.progressCards, 'crane') } : p)),
    )
    setCraneDiscountPlayerId(playerId)
    inform(`${player.name} played Crane — next city improvement purchase costs 1 less.`)
  }

  const playCrane = () => {
    if (!canPlayProgressCardNow()) return
    // Reachable through ProgressCardsPanel's generic click-to-play (the
    // panel already disables Play buttons when !isMyTurn), but every sibling
    // handler in this file guards directly too rather than relying solely on
    // the UI gate — same "guard even when the UI already blocks it"
    // convention buyDevCard/playIrrigation established.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('crane')) {
      warn('No Crane card to play.')
      return
    }
    applyCraneEffect(player.id)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'crane' })
  }

  // Cities & Knights Medicine — spends the card and arms a 1-time discounted
  // settlement->city upgrade, consumed inside buildSettlementRaw's existing
  // occupied-vertex/city-upgrade branch. Mirrors applyCraneEffect/playCrane
  // exactly (no picker of its own — the "picker" is just clicking one of the
  // player's own settlements, the same click every ordinary city upgrade
  // already uses).
  const applyMedicineEffect = (playerId: number) => {
    const player = playerById.get(playerId)
    if (!player) return
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, progressCards: removeOne(p.progressCards, 'medicine') } : p)),
    )
    setPendingMedicineUse(playerId)
    inform(`${player.name} played Medicine — next settlement upgraded to a city costs 1 Wheat + 2 Ore.`)
  }

  const playMedicine = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('medicine')) {
      warn('No Medicine card to play.')
      return
    }
    applyMedicineEffect(player.id)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'medicine' })
  }

  const playProgressRoadBuilding = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('progressRoadBuilding')) return
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'progressRoadBuilding') } : p)))
    setFreeRoadsRemaining((prev) => prev + 2)
    inform(`${player.name} played (progress card) Road Building — place 2 free roads.`)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'progressRoadBuilding' })
  }

  // Cities & Knights Invention — trusted-apply for the actual tile swap.
  // Deterministic given only the 2 tile ids (no player-specific state
  // involved at all — the board itself is the only thing that changes), so
  // this is safely reused VERBATIM by both the local actor
  // (handleInventionTileSelect, below) and the broadcast receiver
  // (onInventionSwapped) with no separate payload-shape decision to make.
  const applyInventionSwap = (tileAId: string, tileBId: string) => {
    setTiles((prev) =>
      prev.map((t) => {
        if (t.id === tileAId) return { ...t, number: prev.find((x) => x.id === tileBId)?.number ?? t.number }
        if (t.id === tileBId) return { ...t, number: prev.find((x) => x.id === tileAId)?.number ?? t.number }
        return t
      }),
    )
  }

  // Resolves each of the 2 board-tile clicks TileSwapLayer forwards while a
  // swap is pending. Only ever reachable by the local actor — pendingInventionSwap
  // is pure local UI state, never broadcast, so TileSwapLayer never renders
  // active on another client (see its own `active` prop derivation below).
  const handleInventionTileSelect = (tileId: string) => {
    if (!pendingInventionSwap) return
    const tile = tiles.find((t) => t.id === tileId)
    if (!tile || tile.number == null || [2, 6, 8, 12].includes(tile.number)) {
      warn("That number can't be swapped.")
      return
    }
    if (!pendingInventionSwap.firstTileId) {
      setPendingInventionSwap({ ...pendingInventionSwap, firstTileId: tileId })
      return
    }
    // TileSwapLayer already excludes the first-picked tile from its own
    // clickable set, but this is the actual state-mutating call site, so it
    // guards independently too rather than trusting the UI alone.
    if (tileId === pendingInventionSwap.firstTileId) return
    const firstTile = tiles.find((t) => t.id === pendingInventionSwap.firstTileId)
    const actor = playerById.get(pendingInventionSwap.playerId)
    applyInventionSwap(pendingInventionSwap.firstTileId, tileId)
    if (actor && firstTile) {
      inform(`${actor.name} played Invention — swapped the ${firstTile.number} and ${tile.number} tiles.`)
    }
    setPendingInventionSwap(null)
    if (onlineInfo) broadcastInventionSwapped({ tileAId: pendingInventionSwap.firstTileId, tileBId: tileId })
  }

  // Only spends the card and opens the picker (2 board-tile clicks, handled
  // above) — needs its own small UI (a Play button near Roll Dice, see
  // GameHud) rather than ProgressCardsPanel's generic click-to-play, same
  // exception as Alchemy in Task 7: leaving it keyless in
  // progressCardPlayHandlers means its card in the panel renders disabled,
  // so it can't ALSO be reached via a plain click that would skip the
  // picker.
  const playInvention = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('invention')) {
      warn('No Invention card to play.')
      return
    }
    // A second Invention played before the first swap resolves would spend
    // a second card just to silently reset firstTileId back to null — same
    // "refuse outright rather than clobber an in-progress pick" reasoning
    // buyCityImprovement's own pendingMetropolisClaim guard uses.
    if (pendingInventionSwap) {
      warn('Finish the current tile swap first.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'invention') } : p)),
    )
    setPendingInventionSwap({ playerId: player.id, firstTileId: null })
    inform(`${player.name} played Invention — choose 2 number tiles to swap.`)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'invention' })
  }

  // Cities & Knights Merchant Fleet — names 1 resource/commodity type for a
  // 2:1 bank rate, consumed inside getPortRate (resource trades) and
  // tradeCommodity (commodity trades). The named type deliberately stays
  // LOCAL (never broadcast) — bank trades are already a "resolve locally,
  // then broadcast the OUTCOME" action (BankTradePayload/CommodityTradedPayload
  // both carry the rate/amount actually applied, trusted-apply on the
  // receiving end), so every other client already ends up with the correct
  // result with no need to separately learn WHY that rate applied.
  const playMerchantFleet = (type: ResourceType | CommodityType) => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('merchantFleet')) {
      warn('No Merchant Fleet card to play.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'merchantFleet') } : p)),
    )
    setMerchantFleetRate({ playerId: player.id, type })
    const label = (COMMODITY_ORDER as string[]).includes(type)
      ? COMMODITY_LABELS[type as CommodityType]
      : RESOURCE_LABELS[type as ResourceType]
    inform(`${player.name} played Merchant Fleet — 2:1 trades with the bank for ${label} this turn.`)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'merchantFleet' })
  }

  // Cities & Knights Merchant (Task 13) — "Take control of the merchant
  // piece; place it on any land hex next to one of your buildings." Spends
  // the card up front (same "spend on click, resolve the argument after"
  // shape pendingInventionSwap already uses for Invention) and arms
  // MerchantLayer's placement mode; the actual tile pick resolves via
  // handleMerchantTileSelect below, entirely outside this function, same
  // split playInvention/handleInventionTileSelect already use.
  const playMerchant = () => {
    if (!canPlayProgressCardNow()) return
    // Binding correction from Task 7's review (applies plan-wide): must be
    // checked BEFORE reading players[currentPlayerIndex], not after.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('merchant')) {
      warn('No Merchant card to play.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'merchant') } : p)),
    )
    setPendingMerchantPlacement(player.id)
    inform(`${player.name} played Merchant — choose a land hex next to one of your buildings.`)
  }

  // Resolves the single board-tile click MerchantLayer offers while
  // pendingMerchantPlacement is set. Deterministic given just the clicked
  // tileId (MerchantLayer only ever offers land hexes adjacent to the
  // placing player's own buildings as click targets, so no further
  // validation is needed here) — trusted-apply on every OTHER client too,
  // same reasoning RobberMovedPayload/MetropolisClaimedPayload already use
  // for their own board-piece moves.
  const handleMerchantTileSelect = (tileId: string) => {
    // Unlike handleInventionTileSelect (whose picker can only ever be armed
    // and resolved inside one turn, because handleEndTurn refuses to advance
    // past it), this handler was reachable during an OPPONENT's turn: End
    // Turn used to allow advancing with pendingMerchantPlacement still set,
    // leaving this client's tile picker live so the Merchant (1 VP + a 2:1
    // rate) could be placed mid-opponent-turn. Guarded first, exactly like
    // every playX handler in this file. handleEndTurn now also refuses to
    // advance while a placement is pending, so the legitimate flow — play
    // Merchant, place it, then end your turn — is unaffected: isMyTurn is
    // true for the whole of it.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (pendingMerchantPlacement == null) return
    const playerId = pendingMerchantPlacement
    setMerchantTileId(tileId)
    setMerchantHolderId(playerId)
    setPendingMerchantPlacement(null)
    if (onlineInfo) broadcastMerchantMoved({ tileId, holderId: playerId })
  }

  // Cities & Knights knight recruit — arms KnightLayer's recruit-target
  // picker for the current player's own screen. Unlike playMerchant (which
  // spends the card up front before the tile pick resolves), nothing is
  // spent here until handleKnightVertexSelect below actually places the
  // knight, since recruiting has no card to consume — only resources and
  // knightSupply, both checked again at resolve time.
  const armKnightRecruit = () => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!canRecruitKnight(player)) {
      warn('Cannot recruit a knight right now.')
      return
    }
    if (pendingKnightRecruit != null || armedKnightAction) {
      warn('Finish the current knight action first.')
      return
    }
    setPendingKnightRecruit(player.id)
  }

  // Cities & Knights knight move (Task 9) — arms KnightLayer's move-target
  // picker for the current player's own screen, same "nothing spent/moved
  // until handleKnightVertexSelect's armedKnightAction branch below actually
  // resolves it" deferral armKnightRecruit's own comment above describes.
  // Mutually exclusive with a pending recruit AND with an already-armed
  // action (Displace, once Task 10 adds it), same guard armKnightRecruit
  // uses.
  const armKnightMove = (knightId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight || !knight.active) {
      warn('That knight cannot move.')
      return
    }
    if (pendingKnightRecruit != null || armedKnightAction) {
      warn('Finish the current knight action first.')
      return
    }
    setArmedKnightAction({ knightId, mode: 'move' })
  }

  // Cities & Knights knight displace (Task 10) — arms KnightLayer's
  // displace-target picker (a set of OPPONENT KNIGHTS, not empty vertices)
  // for the current player's own screen. Same "nothing spent/moved until
  // resolve actually resolves it" deferral, and the same mutual-exclusion
  // guard, armKnightMove's own comment above describes — Displace is the
  // 'displace' branch of the SAME armedKnightAction state armKnightMove
  // already uses, not a separate piece of state.
  const armKnightDisplace = (knightId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight || !knight.active) {
      warn('That knight cannot displace.')
      return
    }
    if (pendingKnightRecruit != null || armedKnightAction) {
      warn('Finish the current knight action first.')
      return
    }
    setArmedKnightAction({ knightId, mode: 'displace' })
  }

  // Cities & Knights "Chase Away the Robber" (Task 11) — an active knight
  // adjacent to the robber's hex triggers the SAME robber-move-and-steal
  // flow a rolled 7 already uses (gamePhase = 'moveRobber', resolved by
  // clicking a tile in RobberLayer). A knight action can only ever be taken
  // by the current turn's player (every other knight handler above already
  // enforces this via isMyTurn), so the knight owner and moveRobber's own
  // `thief` are always the same player — chasingRobberKnightId just
  // remembers WHICH knight initiated it, so moveRobber's tail can deactivate
  // it once the move resolves.
  const armChaseRobber = (knightId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (gamePhase !== 'playing') {
      warn('Cannot chase the robber right now.')
      return
    }
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight || !knight.active) {
      warn('That knight cannot chase the robber.')
      return
    }
    const adjacentTileIds = new Set(graph.vertexTileIds.get(knight.vertexId) ?? [])
    if (!adjacentTileIds.has(robberTileId)) {
      warn('That knight is not next to the robber.')
      return
    }
    setChasingRobberKnightId(knightId)
    setGamePhase('moveRobber')
  }

  // The SINGLE resolve handler KnightLayer's onSelectVertex calls — Task 9's
  // Move handler extends this with a branch checking armedKnightAction
  // instead of pendingKnightRecruit, rather than a second handler.
  const handleKnightVertexSelect = (vertexId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    // Cities & Knights Treason (Task 14) — leading branch, checked FIRST,
    // ahead of the ordinary recruit branch below (a distinct pending flag,
    // so the two never both fire for the same click). `available` here
    // uses the EXACT SAME treasonPlacementStrengthOptions derivation
    // playTreason's own canPlace check uses (see that function's own
    // comment) — recomputed fresh against the CURRENT player.knightSupply
    // rather than trusting canPlace's earlier snapshot, so this can only
    // ever find LESS available than canPlace promised, never more: it can
    // gracefully no-op, it can never overspend.
    if (pendingTreasonPlacement) {
      const { playerId, maxStrength, active } = pendingTreasonPlacement
      const player = playerById.get(playerId)!
      const targets = recruitableVertices(playerId, graph, roads, settlements, knightPiecesByVertex)
      if (!targets.has(vertexId)) {
        warn('Not a valid placement.')
        return
      }
      const available = treasonPlacementStrengthOptions(maxStrength).find((s) => player.knightSupply[s] > 0)
      if (!available) {
        setPendingTreasonPlacement(null)
        return
      }
      const newKnight: KnightPiece = { id: nextKnightId(playerId), ownerId: playerId, strength: available, active, vertexId }
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== playerId
            ? p
            : { ...p, knightSupply: { ...p.knightSupply, [available]: p.knightSupply[available] - 1 }, knightPieces: [...p.knightPieces, newKnight] },
        ),
      )
      setPendingTreasonPlacement(null)
      // Deliberately reuses Task 7's KnightRecruitedPayload/onKnightRecruited
      // — a "knight appears at this vertex with this strength/status" event
      // needs no Treason-specific shape. isFree: true — this placement is
      // free and can be ANY strength, unlike Recruit's own broadcast just
      // below; see KnightRecruitedPayload.isFree's own comment in
      // useRoomChannel.ts for why every other client's onKnightRecruited
      // receiver needs to be told not to charge for it / not to always
      // decrement the basic bucket.
      if (onlineInfo) broadcastKnightRecruited({ knight: newKnight, isFree: true })
      return
    }
    if (pendingKnightRecruit != null) {
      const playerId = pendingKnightRecruit
      const player = playerById.get(playerId)
      if (!player || !canRecruitKnight(player)) {
        warn('Cannot recruit a knight right now.')
        setPendingKnightRecruit(null)
        return
      }
      const targets = recruitableVertices(playerId, graph, roads, settlements, knightPiecesByVertex)
      if (!targets.has(vertexId)) {
        warn('Not a valid knight placement.')
        return
      }
      const newKnight: KnightPiece = {
        id: nextKnightId(playerId),
        ownerId: playerId,
        strength: 'basic',
        active: false,
        vertexId,
      }
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? {
                ...p,
                resources: deductCost(p.resources, KNIGHT_RECRUIT_COST),
                knightSupply: { ...p.knightSupply, basic: p.knightSupply.basic - 1 },
                knightPieces: [...p.knightPieces, newKnight],
              }
            : p,
        ),
      )
      setPendingKnightRecruit(null)
      if (onlineInfo) broadcastKnightRecruited({ knight: newKnight, isFree: false })
      return
    }
    // Cities & Knights knight move (Task 9) — mirrors the recruit branch
    // above but checks armedKnightAction (set by armKnightMove) instead of
    // pendingKnightRecruit. Reuses knightPiecesByVertex (the same memoized
    // vertex -> KnightPiece map the recruit branch's own
    // recruitableVertices call above already uses, and the road/settlement
    // occupancy checks near the top of this file build from) rather than
    // constructing a second one inline.
    if (armedKnightAction?.mode === 'move') {
      const { knightId } = armedKnightAction
      const player = players[currentPlayerIndex]
      const knight = player.knightPieces.find((k) => k.id === knightId)
      // !knight.active guard (Task 10 fix round) — closes the gap Task 9's
      // reviewer flagged: Displace introduces a second way a knight's active
      // state can change mid-turn (the mover goes inactive), so a stale
      // armedKnightAction referencing an already-inactive knight (e.g. this
      // same knight was just used to displace, or moved, in another armed
      // action) must not be allowed to resolve a second move.
      if (!knight || !knight.active) {
        setArmedKnightAction(null)
        return
      }
      const targets = knightMoveTargets(knight, graph, roads, settlements, knightPiecesByVertex)
      if (!targets.has(vertexId)) {
        warn('Not a valid move.')
        return
      }
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== player.id
            ? p
            : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, vertexId, active: false } : k)) },
        ),
      )
      setArmedKnightAction(null)
      if (onlineInfo) broadcastKnightMoved({ playerId: player.id, knightId, vertexId })
      return
    }
  }

  // Cities & Knights knight displace (Task 10) — the resolve handler
  // KnightLayer's onSelectKnight callback calls, kept SEPARATE from
  // handleKnightVertexSelect above: Displace's target is another player's
  // KNIGHT (clicked via displaceTargets), not an empty vertex, so it can't
  // share that handler's onSelectVertex wiring. Reuses knightPiecesByVertex
  // (the Task 3 memo every other knight lookup in this file already uses)
  // rather than building a fresh inline map.
  const handleKnightSelect = (targetKnightId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    // Cities & Knights Intrigue (Task 14) — leading branch, checked FIRST,
    // ahead of the ordinary Displace body below (a distinct pending flag —
    // Intrigue has no mover knight of its own to arm — so the two never
    // both fire for the same click).
    if (pendingIntrigueDisplace != null) {
      const playerId = pendingIntrigueDisplace
      const targets = intrigueDisplaceTargets(playerId)
      const target = targets.find((k) => k.id === targetKnightId)
      if (!target) {
        warn('Not a valid target.')
        return
      }
      // Same "reachable empty vertex from the displaced knight's OWN
      // network, else removed to supply" resolution the ordinary Displace
      // body below already established for Task 10 — identical inputs
      // (knightMoveTargets over the SAME knightPiecesByVertex map), identical
      // deterministic sort-and-pick-first tie-break, so the two flows can
      // never disagree about where a displaced knight ends up.
      const forcedTargets = [...knightMoveTargets(target, graph, roads, settlements, knightPiecesByVertex)].sort()
      const displacedVertexId = forcedTargets[0] ?? null
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== target.ownerId) return p
          if (displacedVertexId) {
            return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === target.id ? { ...k, vertexId: displacedVertexId } : k)) }
          }
          return {
            ...p,
            knightPieces: p.knightPieces.filter((k) => k.id !== target.id),
            knightSupply: { ...p.knightSupply, [target.strength]: p.knightSupply[target.strength] + 1 },
          }
        }),
      )
      setPendingIntrigueDisplace(null)
      if (onlineInfo) broadcastIntrigueResolved({ displacedOwnerId: target.ownerId, targetKnightId, displacedVertexId })
      return
    }
    if (armedKnightAction?.mode !== 'displace') return
    const { knightId } = armedKnightAction
    const player = players[currentPlayerIndex]
    const mover = player.knightPieces.find((k) => k.id === knightId)
    // !mover.active guard — the mover may have gone inactive mid-turn since
    // this action was armed (e.g. it already resolved a Move or a Displace
    // through a stale armedKnightAction reference); same reasoning as the
    // !knight.active guard added to the Move branch above.
    if (!mover || !mover.active) {
      setArmedKnightAction(null)
      return
    }
    const targets = knightDisplaceTargets(mover, graph, roads, settlements, knightPiecesByVertex)
    const target = targets.find((k) => k.id === targetKnightId)
    if (!target) {
      warn('Not a valid displace target.')
      return
    }
    const targetOwner = playerById.get(target.ownerId)!
    // Where the displaced knight is forced to — reachable empty vertex from
    // ITS OWN owner's road network, same reachability rule as an ordinary
    // move, computed as if the knight were still standing where it is right
    // now (its own vertexId is the origin). Picked deterministically (lowest
    // vertex id) — CN3087 places no choice constraint on which one.
    const forcedTargets = [...knightMoveTargets(target, graph, roads, settlements, knightPiecesByVertex)].sort()
    const displacedVertexId = forcedTargets[0] ?? null // null => removed to supply, no empty reachable vertex

    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === player.id) {
          return {
            ...p,
            knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, vertexId: target.vertexId, active: false } : k)),
          }
        }
        if (p.id === targetOwner.id) {
          if (displacedVertexId) {
            return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === target.id ? { ...k, vertexId: displacedVertexId } : k)) }
          }
          return {
            ...p,
            knightPieces: p.knightPieces.filter((k) => k.id !== target.id),
            knightSupply: { ...p.knightSupply, [target.strength]: p.knightSupply[target.strength] + 1 },
          }
        }
        return p
      }),
    )
    setArmedKnightAction(null)
    if (onlineInfo) {
      broadcastKnightDisplaced({
        moverId: player.id,
        knightId,
        displacedOwnerId: targetOwner.id,
        targetKnightId,
        newMoverVertexId: target.vertexId,
        displacedVertexId,
      })
    }
  }

  // Cities & Knights knight activate — resolves immediately, no board
  // picker: unlike Recruit (which arms a vertex picker via
  // pendingKnightRecruit), there's no target to choose, so this is the same
  // straightforward resource-deduct-and-broadcast shape buyDevCard uses.
  const activateKnight = (knightId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight || !canActivateKnight(player, knight)) {
      warn('Cannot activate that knight.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) =>
        p.id !== player.id
          ? p
          : {
              ...p,
              resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST),
              knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, active: true } : k)),
            },
      ),
    )
    if (onlineInfo) broadcastKnightActivated({ playerId: player.id, knightId })
  }

  // Cities & Knights knight promote — same immediate-resolve shape as
  // activateKnight above. knightsPromotedThisTurn (once per turn, per knight
  // INSTANCE) is checked here in addition to canPromoteKnight's own
  // cost/supply/track checks, since that module has no notion of "this
  // turn" (see canPromoteKnight's own comment in game/knights.ts).
  const promoteKnight = (knightId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight) {
      warn('Cannot promote that knight.')
      return
    }
    if (knightsPromotedThisTurn.has(knightId)) {
      warn('That knight was already promoted this turn.')
      return
    }
    if (!canPromoteKnight(player, knight)) {
      warn('Cannot promote that knight.')
      return
    }
    const next = nextKnightStrength(knight.strength)!
    setPlayers((prev) =>
      prev.map((p) =>
        p.id !== player.id
          ? p
          : {
              ...p,
              resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
              knightSupply: { ...p.knightSupply, [knight.strength]: p.knightSupply[knight.strength] + 1, [next]: p.knightSupply[next] - 1 },
              knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, strength: next } : k)),
            },
      ),
    )
    setKnightsPromotedThisTurn((prev) => new Set(prev).add(knightId))
    if (onlineInfo) broadcastKnightPromoted({ playerId: player.id, knightId, newStrength: next })
  }

  // Cities & Knights city walls — no board picker needed: the target is one
  // of the player's OWN existing cities, chosen via a HUD button
  // (ResourcePanel's "City Walls" row), not a 3D click. Same immediate-
  // resolve shape activateKnight/promoteKnight use above — canBuildCityWall
  // (game/knights.ts) already checks ownership/no-existing-wall/board-wide
  // cap/affordability, so this handler just calls it directly rather than
  // re-deriving those checks inline.
  const buildCityWall = (vertexId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    const totalWallsOnBoard = players.reduce((sum, p) => sum + p.cityWalls.length, 0)
    if (!canBuildCityWall(player, vertexId, settlements, totalWallsOnBoard)) {
      warn('Cannot build a city wall there.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) =>
        p.id !== player.id
          ? p
          : { ...p, resources: deductCost(p.resources, CITY_WALL_COST), cityWalls: [...p.cityWalls, vertexId] },
      ),
    )
    if (onlineInfo) broadcastCityWallBuilt({ playerId: player.id, vertexId, isFree: false })
  }

  // Cities & Knights Engineering (Task 13) — spends the card up front, then
  // arms Task 12's own ResourcePanel Wall buttons for a FREE build instead of
  // opening a dedicated picker (Engineering just needs the same "click one of
  // my eligible cities" affordance those buttons already offer, made free).
  // The eligibility check below reuses canBuildCityWall against a throwaway
  // clone of the player with brick set absurdly high — a deliberate trick to
  // reuse its ownership/no-existing-wall/board-wide-cap checks without its
  // resource-affordability half, without duplicating those 3 checks inline;
  // the clone is a local variable only, never written back to state.
  const playEngineering = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    // Progress Cards can be on with Knights off (an ordinary, fully
    // supported combination — see gameRules.citiesAndKnightsKnights's own
    // comment) and Engineering has no knightPieces/target-knights set to
    // naturally self-guard against like Smithing/Intrigue/Treason do — so
    // without this it would spend the card and append a "ghost" wall for
    // zero effect. Must run before the card is spent below.
    if (!gameRules.citiesAndKnightsKnights) {
      warn('Enable the Knights & City Walls house rule to play this card.')
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('engineering')) {
      warn('No Engineering card to play.')
      return
    }
    const totalWallsOnBoard = players.reduce((sum, p) => sum + p.cityWalls.length, 0)
    const hasEligibleCity = Object.entries(settlements).some(
      ([vertexId, b]) =>
        b.ownerId === player.id &&
        b.type === 'city' &&
        canBuildCityWall({ ...player, resources: { ...player.resources, brick: 999 } }, vertexId, settlements, totalWallsOnBoard),
    )
    if (!hasEligibleCity) {
      warn('No eligible city for a free wall.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'engineering') } : p)),
    )
    setPendingFreeCityWall(player.id)
    inform(`${player.name} played Engineering — choose a city for a free wall.`)
  }

  // Resolves the single Wall-button click ResourcePanel offers while
  // pendingFreeCityWall is set (freeWallActive branch, GameHud/ResourcePanel).
  // Re-validates ownership/no-existing-wall/board-wide-cap here (rather than
  // trusting the button's own disabled state) for the same reason every other
  // resolve-a-picker handler in this file does: the board state this button
  // was rendered against can be stale by the time the click lands. Reuses
  // canBuildCityWall directly — same throwaway resource-override clone trick
  // playEngineering's own hasEligibleCity check and GameHud's canBuildWallAt
  // already use — instead of duplicating its ownership/type/no-existing-
  // wall/board-cap checks inline.
  const resolveFreeCityWall = (vertexId: string) => {
    if (pendingFreeCityWall == null) return
    const playerId = pendingFreeCityWall
    const player = playerById.get(playerId)!
    const totalWallsOnBoard = players.reduce((sum, p) => sum + p.cityWalls.length, 0)
    if (
      !canBuildCityWall({ ...player, resources: { ...player.resources, brick: 999 } }, vertexId, settlements, totalWallsOnBoard)
    ) {
      warn('Not a valid free wall target.')
      return
    }
    setPlayers((prev) => prev.map((p) => (p.id !== playerId ? p : { ...p, cityWalls: [...p.cityWalls, vertexId] })))
    setPendingFreeCityWall(null)
    // isFree: true — unlike buildCityWall's own broadcast just above, this
    // never deducted CITY_WALL_COST locally, so every other client's
    // onCityWallBuilt receiver must be told not to either (see
    // CityWallBuiltPayload.isFree's own comment in useRoomChannel.ts for why
    // reusing the plain paid event here would desync resources).
    if (onlineInfo) broadcastCityWallBuilt({ playerId, vertexId, isFree: true })
  }

  // Cities & Knights Smithing (Task 13) — promotes up to 2 of the player's
  // OWN knights for free. knightsPromotedThisTurn (Task 8) is respected on
  // BOTH sides here: eligible knights already promoted this turn are
  // excluded from `promotable` below, and every knight Smithing itself
  // promotes is added to that same tracker afterward — a second, parallel
  // per-card tracking mechanism would let a knight be promoted twice in one
  // turn via promoteKnight + Smithing, or Smithing + Smithing across two
  // cards. The throwaway-clone trick (wool/ore set absurdly high) mirrors
  // playEngineering's own above: reuses canPromoteKnight's supply/politics-
  // track checks without its resource-affordability half.
  const playSmithing = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('smithing')) {
      warn('No Smithing card to play.')
      return
    }
    // selectSmithingPromotions (game/knights.ts) tracks a RUNNING copy of
    // knightSupply while picking candidates, rather than trusting a single
    // static check per candidate — see its own comment for why: two knights
    // eligible for the SAME next tier can't both be selected off a snapshot
    // showing supply[next] === 1 for both, only off a count that actually
    // decrements as each candidate is accepted.
    const toPromote = selectSmithingPromotions(
      { ...player, resources: { ...player.resources, wool: 999, ore: 999 } },
      knightsPromotedThisTurn,
    )
    if (toPromote.length === 0) {
      warn('No knights eligible to promote.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== player.id) return p
        let supply = { ...p.knightSupply }
        const knightPieces = p.knightPieces.map((k) => {
          const promoting = toPromote.find((t) => t.id === k.id)
          if (!promoting) return k
          const next = nextKnightStrength(k.strength)!
          supply = { ...supply, [k.strength]: supply[k.strength] + 1, [next]: supply[next] - 1 }
          return { ...k, strength: next }
        })
        return { ...p, progressCards: removeOne(p.progressCards, 'smithing'), knightSupply: supply, knightPieces }
      }),
    )
    setKnightsPromotedThisTurn((prev) => {
      const next = new Set(prev)
      for (const k of toPromote) next.add(k.id)
      return next
    })
    inform(`${player.name} played Smithing — promoted ${toPromote.length} knight(s).`)
    if (onlineInfo) broadcastSmithingPlayed({ playerId: player.id, knightIds: toPromote.map((k) => k.id) })
  }

  // Cities & Knights Encouragement (Task 13) — activates every one of the
  // player's OWN knights for free (no per-knight cost/eligibility check
  // needed: unlike activateKnight, there's nothing to be ineligible for
  // besides already being active, and re-activating an already-active
  // knight is a harmless no-op).
  const playEncouragement = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    // Progress Cards can be on with Knights off (an ordinary, fully
    // supported combination — see gameRules.citiesAndKnightsKnights's own
    // comment) and Encouragement has no knightPieces to naturally self-guard
    // against like Smithing/Intrigue/Treason do — without this it would
    // spend the card for a no-op map over an empty knights array and still
    // show a success toast. Must run before the card is spent below.
    if (!gameRules.citiesAndKnightsKnights) {
      warn('Enable the Knights & City Walls house rule to play this card.')
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('encouragement')) {
      warn('No Encouragement card to play.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) =>
        p.id !== player.id
          ? p
          : { ...p, progressCards: removeOne(p.progressCards, 'encouragement'), knightPieces: p.knightPieces.map((k) => ({ ...k, active: true })) },
      ),
    )
    inform(`${player.name} played Encouragement — all knights activated.`)
    if (onlineInfo) broadcastEncouragementPlayed({ playerId: player.id })
  }

  // Shared VP-comparison helper — both Sabotage and Wedding need "every
  // player whose VP compares a certain way to the announcer." Sabotage
  // uses 'gte' (AS MANY OR MORE VPs than the announcer triggers a forced
  // discard), Wedding uses 'gt' (STRICTLY MORE VPs triggers a gift) — the
  // card texts are easy to confuse with each other, so this single helper
  // is the one place that distinction is encoded, rather than each play
  // handler re-deriving its own comparison. Uses getPlayerScore (the TRUE
  // total, including face-down VP cards) rather than getPublicScore — the
  // physical card compares actual VP totals, not just what's visible on
  // the table, same as win detection elsewhere in this file.
  const playersMeetingVpThreshold = (announcerId: number, comparison: 'gte' | 'gt'): Player[] => {
    const announcer = playerById.get(announcerId)
    if (!announcer) return []
    const announcerVp = getPlayerScore(
      announcer,
      settlements,
      longestRoadHolderId,
      largestArmyHolderId,
      metropolisHolders,
      merchantHolderId,
    )
    return players.filter((p) => {
      if (p.id === announcerId) return false
      const vp = getPlayerScore(p, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders, merchantHolderId)
      return comparison === 'gte' ? vp >= announcerVp : vp > announcerVp
    })
  }

  // Cities & Knights Sabotage — every player with as many or more VPs than
  // the announcer discards half their resource-and/or-commodity hand
  // (rounded down). The physical card's "rounded down" leaves the exact
  // cards discarded up to the affected player, which this plan auto-selects
  // via the SAME greedy autoDiscardCounts logic the resource-discard
  // timeout fallback already uses (game/discard.ts) rather than building a
  // second targeted-player response UI for a choice the official text
  // doesn't actually require interaction for (deliberate scope cut, see
  // this plan's own Task 10 notes). Trusted-apply — shared by the local
  // actor (playSabotage, below, which also spends the card and broadcasts)
  // and the receiving client (onProgressCardPlayed): both recompute the
  // identical affected set from the same public VP state, then each
  // affected player's OWN hand contents (already synced), same "safe to
  // re-run identically on every client" reasoning as applyIrrigationEffect.
  const applySabotageEffect = (announcerId: number) => {
    const announcer = playerById.get(announcerId)
    if (!announcer) return
    const affected = playersMeetingVpThreshold(announcerId, 'gte')
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === announcerId) return { ...p, progressCards: removeOne(p.progressCards, 'sabotage') }
        if (!affected.some((a) => a.id === p.id)) return p
        const handSize = discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
        const counts = autoDiscardCounts(p.resources, p.commodities, Math.floor(handSize / 2))
        const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
        return { ...p, resources, commodities }
      }),
    )
    inform(`${announcer.name} played Sabotage — ${affected.length} player(s) discarded half their hand.`)
  }

  const playSabotage = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('sabotage')) {
      warn('No Sabotage card to play.')
      return
    }
    applySabotageEffect(player.id)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'sabotage' })
  }

  // Cities & Knights Wedding — every player with STRICTLY MORE VPs than the
  // announcer gives up to 2 resource-and/or-commodity cards of their choice
  // (or as many as they have, if fewer than 2). Same auto-selection
  // reasoning as Sabotage's own comment above, but the taken cards are
  // ADDED to the announcer's hand instead of discarded to the supply — the
  // one real difference from Sabotage's shape. The per-affected-player
  // counts (and the combined per-type total credited to the announcer) are
  // computed ONCE from the current players state, before setPlayers runs,
  // rather than inside the setPlayers updater itself — deliberately, so a
  // dev-mode StrictMode double-invocation of that updater can't double-count
  // what the announcer receives.
  const applyWeddingEffect = (announcerId: number) => {
    const announcer = playerById.get(announcerId)
    if (!announcer) return
    const affected = playersMeetingVpThreshold(announcerId, 'gt')
    const perPlayerCounts = new Map<number, Partial<Record<ResourceType | CommodityType, number>>>()
    const takenTotals: Partial<Record<ResourceType | CommodityType, number>> = {}
    let totalTaken = 0
    for (const p of affected) {
      const handSize = discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
      const counts = autoDiscardCounts(p.resources, p.commodities, Math.min(2, handSize))
      perPlayerCounts.set(p.id, counts)
      for (const [type, count] of Object.entries(counts)) {
        const key = type as ResourceType | CommodityType
        takenTotals[key] = (takenTotals[key] ?? 0) + (count as number)
        totalTaken += count as number
      }
    }
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === announcerId) {
          const resources = { ...p.resources }
          const commodities = { ...p.commodities }
          for (const [type, count] of Object.entries(takenTotals)) {
            if (RESOURCE_ORDER.includes(type as ResourceType)) resources[type as ResourceType] += count as number
            else commodities[type as CommodityType] += count as number
          }
          return { ...p, resources, commodities, progressCards: removeOne(p.progressCards, 'wedding') }
        }
        const counts = perPlayerCounts.get(p.id)
        if (!counts) return p
        const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
        return { ...p, resources, commodities }
      }),
    )
    inform(`${announcer.name} played Wedding — received ${totalTaken} card${totalTaken === 1 ? '' : 's'} from ${affected.length} player(s).`)
  }

  const playWedding = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('wedding')) {
      warn('No Wedding card to play.')
      return
    }
    applyWeddingEffect(player.id)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'wedding' })
  }

  // Cities & Knights Guild Dues — "look at the hand of a player with more
  // VPs than you, take any 2 cards of your choice (resource and/or
  // commodity) from them." Unlike Sabotage/Wedding just above, the taken
  // cards aren't auto-selected: the announcer picks EXACTLY which 2 (or
  // fewer, if the target holds fewer than 2 total), via OpponentHandPicker.
  // Trusted-apply — shared by the local actor (confirmGuildDues, below,
  // which also broadcasts) and the receiving client (onGuildDuesTaken):
  // both apply the identical mutation from the identical `picks` array, no
  // re-derivation needed, since (unlike a deck draw) there's no un-syncable
  // randomness involved in a player's own choice of which held cards to
  // give up.
  const applyGuildDuesTake = (takerId: number, targetId: number, picks: (ResourceType | CommodityType)[]) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === targetId) {
          let resources = { ...p.resources }
          let commodities = { ...p.commodities }
          for (const pick of picks) {
            if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: Math.max(0, resources[pick as ResourceType] - 1) }
            else commodities = { ...commodities, [pick]: Math.max(0, commodities[pick as CommodityType] - 1) }
          }
          return { ...p, resources, commodities }
        }
        if (p.id === takerId) {
          let resources = { ...p.resources }
          let commodities = { ...p.commodities }
          for (const pick of picks) {
            if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: resources[pick as ResourceType] + 1 }
            else commodities = { ...commodities, [pick]: commodities[pick as CommodityType] + 1 }
          }
          return { ...p, resources, commodities }
        }
        return p
      }),
    )
  }

  const playGuildDues = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('guildDues')) {
      warn('No Guild Dues card to play.')
      return
    }
    const eligibleTargets = playersMeetingVpThreshold(player.id, 'gt')
    if (eligibleTargets.length === 0) {
      warn('No player currently has more VP than you.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'guildDues') } : p)),
    )
    // picker lets the player switch targets among eligibleTargets before
    // confirming, via PlayerTargetPicker (see GameHud.tsx's own Guild Dues
    // dialog and guildDuesEligibleTargets, below).
    setPendingGuildDues({ targetId: eligibleTargets[0].id })
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'guildDues' })
  }

  // Lets the announcer switch targets (among playersMeetingVpThreshold's
  // eligible set) before confirming which cards to take — GameHud passes
  // this straight to PlayerTargetPicker's onSelect.
  const selectGuildDuesTarget = (playerId: number) => {
    if (!pendingGuildDues) return
    setPendingGuildDues({ targetId: playerId })
  }

  // picks: exactly 2 entries from ResourceType | CommodityType (or fewer,
  // if the target holds fewer than 2 total), each entry present at most as
  // many times as the target actually holds it — OpponentHandPicker
  // enforces this at selection time, this function trusts it (same trust
  // boundary as confirmDiscard trusting discardSelection's own length
  // invariant).
  const confirmGuildDues = (picks: (ResourceType | CommodityType)[]) => {
    if (!pendingGuildDues) return
    const taker = players[currentPlayerIndex]
    const targetId = pendingGuildDues.targetId
    const target = playerById.get(targetId)
    applyGuildDuesTake(taker.id, targetId, picks)
    setPendingGuildDues(null)
    if (onlineInfo) broadcastGuildDuesTaken({ takerId: taker.id, targetId, picks })
    inform(`${taker.name} took ${picks.length} card${picks.length === 1 ? '' : 's'} from ${target?.name ?? 'an opponent'} via Guild Dues.`)
  }

  const cancelGuildDues = () => setPendingGuildDues(null)

  // Cities & Knights Espionage — "look at another player's hand of
  // progress cards; you may take 1 and add it to your hand. VP cards can't
  // be taken this way." Same shape as Guild Dues just above, simpler: no
  // VP threshold ("another player," any of them) and the take itself is
  // optional, so confirmEspionage below tolerates 0 picks (looked, took
  // nothing) as well as exactly 1.
  const applyEspionageTake = (takerId: number, targetId: number, cardIndex: number) => {
    setPlayers((prev) => {
      const target = prev.find((p) => p.id === targetId)
      const card = target?.progressCards[cardIndex]
      // VP cards can't be taken — re-verified here (the receiver), not just
      // picker-side, since a receiving client must never trust that an
      // incoming index was already screened by the sender's own UI.
      if (!card || PROGRESS_CARD_VP_TYPES.has(card)) return prev
      return prev.map((p) => {
        if (p.id === targetId) {
          const next = [...p.progressCards]
          next.splice(cardIndex, 1)
          return { ...p, progressCards: next }
        }
        if (p.id === takerId) return { ...p, progressCards: [...p.progressCards, card] }
        return p
      })
    })
  }

  const playEspionage = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('espionage')) {
      warn('No Espionage card to play.')
      return
    }
    const otherPlayersList = players.filter((p) => p.id !== player.id)
    if (otherPlayersList.length === 0) {
      warn('No other player to target.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'espionage') } : p)),
    )
    setPendingEspionage({ targetId: otherPlayersList[0].id })
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'espionage' })
  }

  const selectEspionageTarget = (playerId: number) => {
    if (!pendingEspionage) return
    setPendingEspionage({ targetId: playerId })
  }

  // indices: 0 or 1 entries (OpponentHandPicker's maxPicks=1 for this
  // mode) — 0 means "looked, took nothing" (the card's own "you may take
  // 1" wording), matching Cancel's own effect exactly; a non-empty array
  // takes indices[0] via applyEspionageTake, which re-derives and
  // re-validates the actual card itself rather than trusting anything else
  // about it.
  const confirmEspionage = (indices: number[]) => {
    if (!pendingEspionage) return
    const taker = players[currentPlayerIndex]
    const targetId = pendingEspionage.targetId
    setPendingEspionage(null)
    if (indices.length === 0) return
    applyEspionageTake(taker.id, targetId, indices[0])
    if (onlineInfo) broadcastEspionageTaken({ takerId: taker.id, targetId, cardIndex: indices[0] })
    inform(`${taker.name} took a progress card via Espionage.`)
  }

  const cancelEspionage = () => setPendingEspionage(null)

  // Cities & Knights — Taxation is the LAST knight-dependent stub card left
  // (it needs Phase C2's barbarian-attack/robber-active gate, out of this
  // task's scope); Engineering/Smithing/Encouragement were unstubbed in
  // Task 13 and Intrigue/Treason in Task 14 (playIntrigue/playTreason
  // below) — none of those route through here anymore. Taxation still
  // warns and stays in hand unchanged — matching the design spec's "returns
  // the card to the player's hand unchanged" requirement.
  const playStubProgressCard = (card: ProgressCardType) => {
    warn(`${PROGRESS_CARD_LABELS[card]} isn't implemented yet (needs Knights & Barbarians) — kept in hand.`)
  }

  // Cities & Knights Intrigue (Task 14) — every opponent knight reachable
  // from ANY of playerId's own vertices at once (buildings + knights), not
  // a single origin the way an ordinary Displace action's real mover has —
  // CN3087: "You may displace an opponent's knight... connected to at
  // least one of your routes" — no strength restriction at all, unlike an
  // ordinary Displace action's own "must be stronger" rule. Uses
  // reachableOpponentKnights directly (game/knights.ts) rather than routing
  // through knightDisplaceTargets with a virtual mover of some strength —
  // an earlier version of this function tried a virtual 'mighty' mover,
  // but knightDisplaceTargets' own filter is `target >= mover -> excluded`
  // (strictly weaker required), so even 'mighty' — the top strength —
  // still wrongly excluded an opposing knight that was ALSO mighty (a
  // tie). reachableOpponentKnights has no strength filter at all, so this
  // now matches CN3087 exactly. Shared by playIntrigue's own eligibility
  // check and KnightLayer's displaceTargets prop (below, in the JSX) so the
  // two can never disagree about which knights are actually clickable.
  const intrigueDisplaceTargets = (playerId: number): KnightPiece[] => {
    const player = playerById.get(playerId)
    if (!player) return []
    const ownVertexIds = [
      ...Object.entries(settlements)
        .filter(([, b]) => b.ownerId === player.id)
        .map(([v]) => v),
      ...player.knightPieces.map((k) => k.vertexId),
    ]
    const seen = new Map<string, KnightPiece>()
    for (const origin of ownVertexIds) {
      for (const target of reachableOpponentKnights(origin, player.id, graph, roads, settlements, knightPiecesByVertex)) {
        seen.set(target.id, target)
      }
    }
    return [...seen.values()]
  }

  const playIntrigue = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('intrigue')) {
      warn('No Intrigue card to play.')
      return
    }
    // Intrigue resolves through the SAME two click handlers in KnightLayer
    // (vertex-click/knight-click) that armKnightRecruit/armKnightMove/
    // armKnightDisplace's own armedKnightAction arms — without this, arming
    // one of those and then playing Intrigue would leave both pending
    // states live, with the loser silently stranded. Mirrors the guard
    // those arm* functions already use against each other, just in the
    // other direction (see their own comments).
    if (pendingKnightRecruit != null || armedKnightAction) {
      warn('Finish the current knight action first.')
      return
    }
    // Refuse outright rather than clobber an in-progress pick — same
    // reasoning playInvention's own pendingInventionSwap guard uses. Real
    // risk here, not hypothetical: Intrigue's deck count is 2 (Politics),
    // so a player CAN hold a second copy while the first is still pending.
    if (pendingIntrigueDisplace != null) {
      warn('Finish choosing a knight to displace first.')
      return
    }
    if (intrigueDisplaceTargets(player.id).length === 0) {
      warn('No knight available to displace with Intrigue.')
      return
    }
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'intrigue') } : p)))
    setPendingIntrigueDisplace(player.id)
    inform(`${player.name} played Intrigue — choose an opponent knight to displace.`)
    // Same two-broadcast split Guild Dues/Espionage/Invention already use
    // (see their own comments): the card is spent NOW, so every other
    // client needs to hear about that immediately via the generic
    // onProgressCardPlayed handler, rather than waiting for
    // broadcastIntrigueResolved — which only fires later, once a knight is
    // actually chosen, and (deliberately, see IntrigueResolvedPayload's own
    // comment) doesn't itself carry an acting-player id to remove the card
    // by.
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'intrigue' })
  }

  // Cities & Knights Treason (Task 14) — every strength the acting player
  // could legally place in exchange for a knight of `maxStrength` (CN3087:
  // "the same strength or lower"), highest-eligible-first. Shared by
  // playTreason's own canPlace check below AND handleKnightVertexSelect's
  // pendingTreasonPlacement resolution so the two can never disagree about
  // whether a placement is actually available — see playTreason's own
  // comment for the bug this closes.
  const treasonPlacementStrengthOptions = (maxStrength: KnightStrength): KnightStrength[] =>
    KNIGHT_STRENGTH_ORDER.filter((s) => KNIGHT_STRENGTH_VALUE[s] <= KNIGHT_STRENGTH_VALUE[maxStrength]).reverse()

  const playTreason = (targetPlayerId: number) => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('treason')) {
      warn('No Treason card to play.')
      return
    }
    // Treason resolves through the SAME two click handlers in KnightLayer
    // (vertex-click/knight-click) that armKnightRecruit/armKnightMove/
    // armKnightDisplace's own armedKnightAction arms — same guard, and same
    // reasoning, as playIntrigue's own copy of this check above.
    if (pendingKnightRecruit != null || armedKnightAction) {
      warn('Finish the current knight action first.')
      return
    }
    // Refuse outright rather than clobber an in-progress placement — same
    // reasoning playIntrigue's own guard above uses, for the same reason:
    // Treason's deck count is also 2 (Politics), so a second copy really
    // can be in hand while the first's placement is still pending. Without
    // this, a second play would both remove ANOTHER opponent knight (a
    // real, irreversible effect — unlike Merchant's harmless same-player
    // overwrite) and silently discard the first removal's own placement
    // opportunity by overwriting pendingTreasonPlacement.
    if (pendingTreasonPlacement) {
      warn('Finish placing your knight first.')
      return
    }
    const target = playerById.get(targetPlayerId)
    if (!target || target.knightPieces.length === 0) {
      warn('That player has no knights to remove.')
      return
    }
    // The TARGET chooses which of their own knights to remove — since this
    // is a single local UI (no separate "opponent decides" prompt exists in
    // this codebase for Pass & Play, and online play has no out-of-band
    // channel for the opponent's OWN choice mid-turn), the removed knight
    // is picked deterministically: their currently WEAKEST knight (ties
    // broken by vertex id) — a reasonable stand-in for "opponent's choice"
    // that never favors the acting player, since removing the weakest
    // knight is the least costly outcome for the target, matching what a
    // rational opponent would pick anyway.
    const removed = [...target.knightPieces].sort(
      (a, b) => KNIGHT_STRENGTH_VALUE[a.strength] - KNIGHT_STRENGTH_VALUE[b.strength] || a.id.localeCompare(b.id),
    )[0]
    const eligiblePlacementVertices = recruitableVertices(player.id, graph, roads, settlements, knightPiecesByVertex)
    // Whether the acting player can ACTUALLY place a replacement — shares
    // treasonPlacementStrengthOptions with handleKnightVertexSelect's own
    // `available` lookup below rather than a separate approximation. A
    // task-14-brief draft of this function instead wrote
    // `KNIGHT_STRENGTH_VALUE[removed.strength] > 1` as a stand-in for "the
    // lower tier might have supply" (true whenever removed.strength isn't
    // 'basic', REGARDLESS of the player's actual knightSupply) and
    // `removed.strength === 'mighty'` as a stand-in for "some tier might
    // have supply" (unconditionally true) — both bypass supply entirely.
    // With knightSupply at {basic:0,strong:0,mighty:0}, a removed 'strong'
    // or 'mighty' knight would still report canPlace=true, arming
    // pendingTreasonPlacement for a placement that then silently fails at
    // resolve time (`available` undefined): the card gets spent, the
    // opponent's knight is still removed, but the acting player's OWN
    // promised rider silently never happens. Sharing this exact derivation
    // with the resolve-time check closes that gap the same way Task 13's
    // Smithing fix closed its own running-supply gap.
    const canPlace = eligiblePlacementVertices.size > 0 && treasonPlacementStrengthOptions(removed.strength).some((s) => player.knightSupply[s] > 0)
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === player.id) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
        if (p.id === targetPlayerId) {
          return {
            ...p,
            knightPieces: p.knightPieces.filter((k) => k.id !== removed.id),
            knightSupply: { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 },
          }
        }
        return p
      }),
    )
    inform(`${player.name} played Treason on ${target.name} — removed their ${removed.strength} knight.`)
    if (onlineInfo) broadcastTreasonRemoved({ actingPlayerId: player.id, targetPlayerId, removedKnight: removed })
    if (canPlace) {
      setPendingTreasonPlacement({ playerId: player.id, maxStrength: removed.strength, active: removed.active })
    }
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

    // Trade Monopoly resolves through resolveDevCardCommodityPicker instead
    // (GameHud renders DevCardCommodityPicker, not DevCardResourcePicker,
    // for this mode — see activePickerMode's render branch in GameHud.tsx)
    // — unreachable in practice, but bails out here rather than misapplying
    // a resource-typed effect to what would actually be a commodity pick if
    // that gating ever drifts.
    if (mode === 'tradeMonopolyProgress') return

    const resource = picks[0]
    if (mode === 'resourceMonopolyProgress') {
      // A SEPARATE effect function from base Monopoly's applyMonopolyEffect
      // (take-2-or-fewer, not take-all) — see applyResourceMonopolyProgressEffect's
      // own comment for why these can't share an implementation. The
      // broadcast event name also differs, so the event log / receiving
      // clients can tell which card actually triggered it.
      applyResourceMonopolyProgressEffect(player.id, resource)
      if (onlineInfo) broadcastResourceMonopolyPlayed({ playerId: player.id, resource })
      return
    }
    applyMonopolyEffect(player.id, resource)
    if (onlineInfo) broadcastMonopolyPlayed({ playerId: player.id, resource })
  }

  // Cities & Knights Trade Monopoly's own resolver — a separate function
  // from resolveDevCardPicker rather than widening that function's
  // ResourceType[] picks signature, since DevCardCommodityPicker resolves a
  // single CommodityType, not a resource array. Only ever reachable by the
  // local actor, same "devCardPicker is pure local UI state" reasoning as
  // resolveDevCardPicker's own comment.
  const resolveDevCardCommodityPicker = (pick: CommodityType) => {
    const mode = devCardPicker
    setDevCardPicker(null)
    if (mode !== 'tradeMonopolyProgress') return
    const player = players[currentPlayerIndex]
    applyTradeMonopolyEffect(player.id, pick)
    if (onlineInfo) broadcastTradeMonopolyPlayed({ playerId: player.id, commodity: pick })
  }

  // Resolves the active Science level 3 free-resource pick with the
  // resource the player chose in the modal. Only ever reachable by the
  // local actor whose id matches activeScienceFreeResourcePlayerId — see
  // that derivation above for why this can be a different player than
  // currentPlayerIndex.
  const resolveScienceFreeResource = (resource: ResourceType) => {
    const playerId = activeScienceFreeResourcePlayerId
    if (playerId == null) return
    const player = playerById.get(playerId)
    applyScienceFreeResourcePick(playerId, resource)
    if (player) inform(`${player.name} took 1 ${RESOURCE_LABELS[resource]} from the bank (Science level 3).`)
    if (onlineInfo) broadcastScienceFreeResourcePicked({ playerId, resource })
  }

  const currentPlayerPortRates = Object.fromEntries(
    RESOURCE_ORDER.map((resource) => [resource, getPortRate(players[currentPlayerIndex].id, resource)]),
  ) as Record<ResourceType, number>

  // Shared reset: reshuffles the board and dev deck once, deriving the new
  // Robber position from that exact same board shuffle so they can't desync.
  const resetGame = (
    count: number,
    names?: string[],
    online?: {
      roomCode: string
      localPlayerName: string
      isHost: boolean
      localClientId?: string
      clientIds?: string[]
      hostName?: string
    },
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
    // Same "present only on a fresh submission" treatment as customCells —
    // gated on the SAME isFreshSubmission flag, so "New Game" (no shapeId
    // passed) keeps whatever custom biome painting was already active
    // instead of losing it.
    customBiomeOverrides?: Record<string, Biome>,
  ) => {
    const isFreshSubmission = shapeId !== undefined
    const effectiveShapeId = shapeId ?? boardShapeId
    const effectiveCustomCells = isFreshSubmission ? customCells : customBoardCells
    const effectiveCustomBiomeOverrides = isFreshSubmission ? customBiomeOverrides : customBoardBiomeOverrides
    const effectiveRules = isFreshSubmission ? (rules ?? gameRules) : gameRules
    setBoardShapeId(effectiveShapeId)
    setCustomBoardCells(effectiveCustomCells)
    setCustomBoardBiomeOverrides(effectiveCustomBiomeOverrides)
    setGameRules(effectiveRules)
    setTotalRollsThisGame(0)
    setConsecutiveDoublesThisTurn(0)
    // Local Pass & Play omits the seed entirely and keeps its original
    // random board.
    const effectiveBoardSeed = online ? (boardSeed ?? online.roomCode) : undefined
    const freshTiles = buildHexBoard(effectiveBoardSeed, effectiveShapeId, effectiveCustomCells, effectiveCustomBiomeOverrides)
    setTiles(freshTiles)
    // freshTiles is only ever empty if cells was empty, which the
    // board-shape editor already prevents (minimum 3 tiles) — but nothing
    // guarantees one of those tiles is specifically 'desert' (an
    // aggressively-painted custom board can end up with none), so fall back
    // to the first tile instead of crashing on a missing robber start.
    const desertTile = freshTiles.find((tile) => tile.biome === 'desert')
    if (!desertTile) {
      console.error('[Catan] Generated board has no desert tile — placing the robber on the first tile instead:', freshTiles[0]?.id)
    }
    setRobberTileId((desertTile ?? freshTiles[0]).id)
    // Cities & Knights barbarian-track gate (Task 3) — same "always reset on
    // a fresh game" treatment as every other single-shot C&K flag below: a
    // leftover `true` from a PREVIOUS match's resolved barbarian attack would
    // let the robber move on the very first 7 of a brand-new match, even
    // with a from-scratch barbarian track that hasn't had a first attack yet.
    setRobberActive(false)
    setBarbarianTrackPosition(0)
    setPlayerCount(count)
    // Who goes first, randomized instead of always seat 0 (the host).
    // Online reuses the SAME seed the board itself was just built from —
    // every client derives the identical index independently, with no extra
    // broadcast needed, the same trick the tile shuffle and hex rotations
    // already rely on. Local Pass & Play has no other client to agree with,
    // so a plain Math.random is fine.
    const freshStartingPlayerIndex = effectiveBoardSeed
      ? Math.floor(createSeededRandom(`${effectiveBoardSeed}-starting-player`)() * count)
      : Math.floor(Math.random() * count)
    setStartingPlayerIndex(freshStartingPlayerIndex)
    // Explicit names (a fresh Start Game submission) replace what's
    // remembered; omitting the argument (restart / return-to-menu) reuses
    // whatever was last entered, so those flows don't reset names to defaults.
    const resolvedNames = names ?? playerNames
    if (names) setPlayerNames(names)
    setPlayers(
      createInitialPlayers(
        count,
        resolvedNames,
        isFreshSubmission ? colorTokens : undefined,
        effectiveRules.victoryPointTarget,
      ),
    )
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
            // Prefer resolving by stable clientId (present on every fresh
            // Start Game submission) over name-matching — the sender's own
            // view of a fast-typing player's name can still be stale
            // (track() is debounced) the instant Start Game is clicked, and
            // a name mismatch after normalization used to permanently lock
            // that player out of their own turn for the rest of the match.
            // Falls back to name-matching for a snapshot-restore reconnect,
            // which has no live clientIds to resolve against.
            localPlayerId:
              (online.clientIds && online.localClientId
                ? online.clientIds.indexOf(online.localClientId)
                : findPlayerIndexByName(resolvedNames, online.localPlayerName)) + 1,
            localPlayerName: online.localPlayerName,
            isHost: online.isHost,
            hostName: online.hostName ?? online.localPlayerName,
          }
        : null,
    )
    setCurrentPlayerIndex(freshStartingPlayerIndex)
    setLastRoll(null)
    setSettlements({})
    setRoads({})
    setRevealedTileIds(new Set())
    setBanner(null)
    setDevDeck(shuffle(buildDevCardDeck(effectiveRules.victoryPointTarget)))
    setProgressCardDecks({
      science: buildProgressCardDeck('science'),
      trade: buildProgressCardDeck('trade'),
      politics: buildProgressCardDeck('politics'),
    })
    setProgressCardOverLimitPlayerIds([])
    setWinner(null)
    setPendingTrade(null)
    setFreeRoadsRemaining(0)
    setDevCardPicker(null)
    setDevCardPlayedThisTurn(false)
    setHasRolledThisTurn(false)
    setDiscardPlayerIds([])
    setDiscardSelection([])
    setProgressDiscardSelection([])
    setScienceFreeResourcePlayerIds([])
    setBoardInstance((n) => n + 1)
    setLongestRoadHolderId(null)
    setLargestArmyHolderId(null)
    // Shared by Start Game, New Game, Return to Menu AND the remote onNewGame
    // apply — so leaving these out let a PREVIOUS match's Metropolis keep
    // scoring +2 VP for the rest of the session on every client. A leftover
    // pendingMetropolisClaim was worse still: buildSettlementRaw's Metropolis
    // branch runs ahead of the setup-placement checks, so the new game's
    // opening settlement clicks would silently resolve as Metropolis picks.
    setMetropolisHolders({ science: null, trade: null, politics: null })
    setMetropolisVertexIds({ science: null, trade: null, politics: null })
    setPendingMetropolisClaim(null)
    // Same reasoning as pendingMetropolisClaim just above — these are all
    // player-id-keyed flags, and a fresh game reuses the same 1..N player
    // ids, so leaving any of them set would silently misapply a PREVIOUS
    // match's pending discount/rate/swap to a player who never earned it in
    // this one.
    setCraneDiscountPlayerId(null)
    setPendingMedicineUse(null)
    setPendingInventionSwap(null)
    setMerchantFleetRate(null)
    setPendingGuildDues(null)
    setPendingEspionage(null)
    // Diplomacy's armed road-picker was the ONE sibling flag missing from
    // this block, and the most damaging one to leave behind: buildRoadRaw
    // checks pendingDiplomacyRemoval BEFORE its setup/canInteract checks, so
    // a stranded flag turned every road click in the NEXT game — including
    // the two free SETUP roads — into a Diplomacy removal attempt.
    setPendingDiplomacyRemoval(null)
    // Same one-shot-flag reasoning: a leftover Alchemy preset would override
    // the FIRST roll of the next game with the previous game's fixed dice.
    setAlchemyPreset(null)
    // Purely cosmetic (EventDieIndicator's badge), but a stale face from the
    // previous match would otherwise show over a brand-new board before
    // anyone has rolled.
    setLastEventDie(null)
    // Cities & Knights Merchant (Task 13) — same reasoning as
    // metropolisHolders/metropolisVertexIds above: a leftover holder/tile
    // from a PREVIOUS match would silently keep granting 2:1 trades and +1
    // VP to whoever last controlled it, on every client, for the rest of
    // this session. pendingMerchantPlacement is local-only pending state,
    // same "always reset on a fresh game" treatment pendingInventionSwap
    // gets just above.
    setMerchantTileId(null)
    setMerchantHolderId(null)
    setPendingMerchantPlacement(null)
    // Cities & Knights Engineering (Task 13) — same "always reset on a fresh
    // game" treatment pendingMerchantPlacement just above gets; local-only
    // UI state, never persisted/broadcast.
    setPendingFreeCityWall(null)
    // Cities & Knights knight recruit/move/displace — both are local-only UI
    // state (never persisted/broadcast), same "always reset on a fresh
    // game" treatment pendingMerchantPlacement gets just above. players'
    // own knightPieces/knightSupply/cityWalls reset automatically via
    // createInitialPlayers, so no separate reset is needed for those.
    setPendingKnightRecruit(null)
    setArmedKnightAction(null)
    // Cities & Knights "Chase Away the Robber" (Task 11) — same "always
    // reset on a fresh game" treatment pendingKnightRecruit/armedKnightAction
    // just above get; local-only UI state, never persisted/broadcast.
    setChasingRobberKnightId(null)
    // Cities & Knights Intrigue/Treason — same "always reset on a fresh
    // game" treatment as the pending flags just above. A stranded
    // pendingTreasonPlacement is the most damaging: handleKnightVertexSelect
    // checks it BEFORE the ordinary recruit branch, so it would hijack every
    // vertex click in the next game, and handleEndTurn refuses to advance
    // turns while it's set for the current player.
    setPendingIntrigueDisplace(null)
    setPendingTreasonPlacement(null)
    // Cities & Knights barbarian attack (Task 5) — same "always reset on a
    // fresh game" treatment as robberActive/barbarianTrackPosition above: a
    // leftover attack result or pending pillage/draw queue from a PREVIOUS
    // match would otherwise pop the attack modal (or strand a queue entry
    // no current player can ever clear) the instant the new game starts.
    setActiveBarbarianAttack(null)
    setPillageQueue([])
    setWinnerDrawQueue([])
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
    setCustomBoardBiomeOverrides(snapshot.customBoardBiomeOverrides)
    // Same fallback reasoning as boardShapeId — pre-house-rules snapshots
    // default to standard behavior.
    setGameRules(snapshot.gameRules ?? DEFAULT_GAME_RULES)
    setRevealedTileIds(new Set(snapshot.revealedTileIds ?? []))
    setTotalRollsThisGame(snapshot.totalRollsThisGame ?? 0)
    setConsecutiveDoublesThisTurn(snapshot.consecutiveDoublesThisTurn ?? 0)
    setStartingPlayerIndex(snapshot.startingPlayerIndex ?? 0)
    const freshTiles = buildHexBoard(online.roomCode, shapeId, snapshot.customBoardCells, snapshot.customBoardBiomeOverrides)
    setTiles(freshTiles)
    setPlayerCount(snapshot.playerNames.length)
    setPlayerNames(snapshot.playerNames)
    // Player colors are already on each snapshot.players entry (colorToken)
    // — no separate restore step needed.
    //
    // commodities/cityImprovements ARE required Player fields, but any row in
    // match_snapshots written before the Cities & Knights feature landed has
    // neither. Restoring one of those raw put `undefined` on a field the rest
    // of this file indexes into unconditionally (GameHud's Metropolis
    // evaluation, the discard hand-size math, buyCityImprovement) and threw a
    // hard TypeError, killing the client mid-match — reachable from BOTH
    // entry points into this function (the lobby Join flow and the
    // connection-restored resync effect below). Normalized here, in the one
    // place both go through, with the same `?? fallback` treatment every
    // other newly-added snapshot field above already gets.
    const normalizedPlayers = snapshot.players.map((p) => ({
      ...p,
      commodities: p.commodities ?? emptyCommodities(),
      cityImprovements: p.cityImprovements ?? emptyCityImprovements(),
      // progressCards is a required Player field (Task 1) — same
      // pre-feature-snapshot gap as commodities/cityImprovements above.
      // Missing it here would leave `undefined` on a field GameHud's
      // hand-limit math and progressCardVP scoring both index into
      // unconditionally.
      progressCards: p.progressCards ?? [],
      // Cities & Knights knight pieces & city walls — same pre-feature-
      // snapshot gap as the 3 fields above.
      knightPieces: p.knightPieces ?? [],
      knightSupply: p.knightSupply ?? { ...KNIGHT_STARTING_SUPPLY },
      cityWalls: p.cityWalls ?? [],
    }))
    setPlayers(normalizedPlayers)
    const restoredLocalPlayerId = findPlayerIndexByName(snapshot.playerNames, online.localPlayerName) + 1
    setOnlineInfo({
      roomCode: online.roomCode,
      localPlayerId: restoredLocalPlayerId,
      localPlayerName: online.localPlayerName,
      isHost: online.isHost,
      hostName: snapshot.hostName,
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
    const restoredMetropolisHolders = snapshot.metropolisHolders ?? { science: null, trade: null, politics: null }
    const restoredMetropolisVertexIds = snapshot.metropolisVertexIds ?? { science: null, trade: null, politics: null }
    setMetropolisHolders(restoredMetropolisHolders)
    setMetropolisVertexIds(restoredMetropolisVertexIds)
    // Cities & Knights Merchant (Task 13) — same optional/backward-compatible
    // `?? null` treatment as metropolisHolders/metropolisVertexIds above:
    // absent on any snapshot saved before this feature existed.
    setMerchantTileId(snapshot.merchantTileId ?? null)
    setMerchantHolderId(snapshot.merchantHolderId ?? null)
    setDevCardPlayedThisTurn(snapshot.devCardPlayedThisTurn)
    setFreeRoadsRemaining(snapshot.freeRoadsRemaining)
    setHasRolledThisTurn(snapshot.hasRolledThisTurn)
    setBanner(null)
    setPendingTrade(null)
    setDevCardPicker(null)
    // Not part of MatchSnapshot — RE-DERIVED instead. Simply clearing it
    // (the original behavior) was fine at level 4, where the player can just
    // buy again, but at level 5 there is no further purchase on that track,
    // so a disconnect between the purchase and the click lost that
    // Metropolis permanently. Deriving it from the restored
    // holders/levels also recovers claims made by a NON-host player, which a
    // persisted field could not: snapshots are written from the effective
    // host's local state only. Restored for the reconnecting client alone —
    // other players' unresolved claims are none of this screen's business.
    const restoredClaimTrack = unresolvedMetropolisClaimTrack(
      normalizedPlayers,
      snapshot.settlements,
      restoredMetropolisHolders,
      restoredMetropolisVertexIds,
      restoredLocalPlayerId,
    )
    setPendingMetropolisClaim(
      restoredClaimTrack ? { track: restoredClaimTrack, playerId: restoredLocalPlayerId } : null,
    )
    setDiceRoll(null)
    setIsRolling(false)
    // Local-only, not part of MatchSnapshot — same "always reset on
    // restore" treatment devCardPicker/pendingTrade just above get, rather
    // than risk carrying a pre-disconnect discount/rate/swap into the
    // reconnected session with no way to tell whether it's still valid.
    setCraneDiscountPlayerId(null)
    setPendingMedicineUse(null)
    setPendingInventionSwap(null)
    setMerchantFleetRate(null)
    setPendingGuildDues(null)
    setPendingEspionage(null)
    setPendingMerchantPlacement(null)
    // Same "always reset on restore" treatment as the flags just above — see
    // resetGame's own comments for why each of these three matters. A
    // stranded pendingDiplomacyRemoval is the worst of them: buildRoadRaw
    // resolves it ahead of every ordinary build check, so it would hijack
    // road placement for the rest of the reconnected session.
    setPendingDiplomacyRemoval(null)
    // Cities & Knights Intrigue/Treason — same "always reset on restore"
    // treatment, same resetGame reasoning: a stranded pendingTreasonPlacement
    // would hijack handleKnightVertexSelect's leading branch (intercepting
    // every vertex click) and make handleEndTurn refuse to advance turns for
    // the rest of the reconnected session.
    setPendingIntrigueDisplace(null)
    setPendingTreasonPlacement(null)
    setAlchemyPreset(null)
    setLastEventDie(null)
    setDiscardSelection([])
    // Progress-card hand-limit queue — unlike discardPlayerIds (recomputed
    // below from restored resource counts) this genuinely IS a persisted
    // MatchSnapshot field, so it's restored directly rather than re-derived.
    // `?? []` covers any snapshot saved before this feature existed.
    // progressDiscardSelection is local UI state, same "always reset on
    // restore" treatment as discardSelection just above — a stale set of
    // indices could otherwise point at the wrong cards in a freshly
    // restored progressCards array.
    setProgressCardOverLimitPlayerIds(snapshot.progressCardOverLimitPlayerIds ?? [])
    // Cities & Knights progress-card draw decks (Task 3, snapshot wiring
    // deferred to this task) — same `?? fallback` treatment as every other
    // optional MatchSnapshot field above: absent on any snapshot saved
    // before this field was wired in, which falls back to a freshly built
    // set of per-track decks (correct composition, just not this match's
    // exact remaining draw order).
    setProgressCardDecks(
      snapshot.progressCardDecks ?? {
        science: buildProgressCardDeck('science'),
        trade: buildProgressCardDeck('trade'),
        politics: buildProgressCardDeck('politics'),
      },
    )
    setProgressDiscardSelection([])
    // Unlike discardPlayerIds (recomputed below from restored resource
    // counts), Science level 3's queue isn't derivable after the fact — it
    // depends on THIS PARTICULAR roll's production, not any persistent
    // condition of current state. A pending free-resource pick from before
    // a disconnect is simply dropped on reconnect rather than reconstructed.
    setScienceFreeResourcePlayerIds([])
    // discardPlayerIds isn't persisted (fully derivable from resource
    // counts) — if the snapshot was saved mid-discard, recompute who still
    // owes one from the restored players rather than trusting a stale list.
    // Uses snapshot.gameRules (not the outer gameRules closure) because
    // setGameRules just above hasn't taken effect yet within this same
    // function call.
    const restoredRules = snapshot.gameRules ?? DEFAULT_GAME_RULES
    setDiscardPlayerIds(
      snapshot.gamePhase === 'discard'
        ? normalizedPlayers
            .filter(
              (p) =>
                discardHandSize(p.resources, p.commodities, restoredRules.citiesAndKnightsCommodities) >
                discardThreshold(restoredRules.citiesAndKnightsKnights ? p.cityWalls.length : 0),
            )
            .map((p) => p.id)
        : [],
    )
    setBoardInstance((n) => n + 1)
  }

  // A dropped-then-restored Realtime connection (CHANNEL_ERROR/TIMED_OUT/
  // CLOSED, then the hook's own retry) used to leave whatever was broadcast
  // during the outage gone for good — this client's local state could
  // silently keep diverging from everyone else's for the rest of the
  // match, with nothing here even reading connectionStatus to notice.
  // Re-fetching the last-saved snapshot and fully re-hydrating from it
  // (the same path a fresh reconnect through the lobby already uses) is
  // simpler and more robust than trying to replay whatever was missed.
  // Declared here (not right beside isEffectiveHost, which it'd otherwise
  // sit next to) because it calls restoreFromSnapshot, declared just above.
  const prevConnectionStatusRef = useRef(connectionStatus)
  useEffect(() => {
    const prevStatus = prevConnectionStatusRef.current
    prevConnectionStatusRef.current = connectionStatus
    if (!onlineInfo || !gameStarted) return
    if (connectionStatus !== 'connected' || prevStatus === 'connected') return
    void loadMatchSnapshot(onlineInfo.roomCode).then((snapshot) => {
      if (snapshot) restoreFromSnapshot(snapshot, onlineInfo)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onlineInfo/restoreFromSnapshot read fresh via closure; only the connectionStatus transition itself should trigger this.
  }, [connectionStatus, gameStarted])

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
        info.customBoardBiomeOverrides,
      )
    }
    setGameStarted(true)
  }

  const restartGame = () => {
    if (onlineInfo) {
      // Effective-host-only: mirrors the TopBar button being disabled for
      // everyone else, but re-checked here too since this fires other
      // players' whole board straight from local state — never trust the
      // click alone for an action with this much blast radius. Uses
      // isEffectiveHost (not the fixed onlineInfo.isHost) so the room
      // isn't permanently stuck on Restart if the original host's own
      // browser is the one that's gone for good.
      if (!isEffectiveHost) return
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

  // Effective-host-only, online-only: after any state-settling change,
  // persist a full snapshot so a reload — this browser's own, or the match
  // resuming after everyone had disconnected — has something to restore
  // from. Uses isEffectiveHost (not the fixed onlineInfo.isHost) so
  // autosaving doesn't just silently stop the moment the original host's
  // own browser is the one that's gone — before this, that meant no
  // further progress was ever saved, and the room could only ever resume
  // from whatever was last written before the host disappeared. Broad
  // dependency list is deliberate: this is meant to fire on essentially
  // every meaningful game event (dice, builds, robber, dev cards, turns),
  // and React's own change-detection is a more reliable way to guarantee
  // that than manually instrumenting every mutation site individually.
  useEffect(() => {
    if (!onlineInfo || !isEffectiveHost || !gameStarted) return
    const snapshot: MatchSnapshot = {
      // The ORIGINAL host's name, always — never the current saver's own
      // (onlineInfo.localPlayerName), which would be wrong the moment a
      // fallback effective host is the one actually saving, silently
      // corrupting which player every future reconnect recognizes as host.
      hostName: onlineInfo.hostName,
      boardShapeId,
      customBoardCells,
      customBoardBiomeOverrides,
      gameRules,
      // Set doesn't survive JSON.stringify as itself — convert at this one
      // serialization boundary, same as every other Map/Set-shaped state.
      revealedTileIds: Array.from(revealedTileIds),
      totalRollsThisGame,
      consecutiveDoublesThisTurn,
      startingPlayerIndex,
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
      metropolisHolders,
      metropolisVertexIds,
      merchantTileId,
      merchantHolderId,
      devCardPlayedThisTurn,
      freeRoadsRemaining,
      hasRolledThisTurn,
      progressCardOverLimitPlayerIds,
      progressCardDecks,
    }
    saveMatchSnapshot(onlineInfo.roomCode, snapshot)
  }, [
    onlineInfo,
    isEffectiveHost,
    gameStarted,
    boardShapeId,
    customBoardCells,
    customBoardBiomeOverrides,
    gameRules,
    revealedTileIds,
    totalRollsThisGame,
    consecutiveDoublesThisTurn,
    startingPlayerIndex,
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
    metropolisHolders,
    metropolisVertexIds,
    merchantTileId,
    merchantHolderId,
    devCardPlayedThisTurn,
    freeRoadsRemaining,
    hasRolledThisTurn,
    progressCardOverLimitPlayerIds,
    progressCardDecks,
  ])

  if (!gameStarted) {
    return (
      <div className="relative h-screen w-screen bg-board-navy">
        <StartScreen onStart={startGame} />
      </div>
    )
  }

  // Tasks 8-16 each wire in one more progress-card type's Play action —
  // ProgressCardsPanel treats a missing key as "no handler yet" (disabled
  // button), not a crash, so shipping this partial is safe. Alchemy,
  // Invention, and Merchant Fleet are deliberately absent: each needs its
  // own small argument-picker UI next to the Roll Dice button (playAlchemy/
  // playInvention/playMerchantFleet, wired directly to GameHud) rather than
  // the generic no-argument click-to-play this object drives — leaving them
  // keyless here means their cards in the panel render disabled, so they
  // can't ALSO be reached via a plain click that would skip the picker.
  // Commercial Harbor and Diplomacy (Task 12) join that same excluded set,
  // for the same reason: Commercial Harbor needs a resource type chosen
  // BEFORE the initial click (playCommercialHarbor, same shape as Merchant
  // Fleet's own type picker), and Diplomacy needs its own board-click picker
  // armed first (activateDiplomacy/onPlayDiplomacy, same shape as Invention's
  // own board-tile picker) — the plan's own Step 3 note to add these two
  // here was written before this file's real progressCardPlayHandlers
  // pattern was checked against Alchemy/Invention/Merchant Fleet's own
  // established precedent just above; following that precedent instead of
  // the plan's literal wording keeps every argument-needing card consistent.
  const progressCardPlayHandlers: ProgressCardPlayHandlers = {
    irrigation: playIrrigation,
    mining: playMining,
    crane: playCrane,
    medicine: playMedicine,
    progressRoadBuilding: playProgressRoadBuilding,
    resourceMonopoly: playResourceMonopoly,
    tradeMonopoly: playTradeMonopoly,
    sabotage: playSabotage,
    wedding: playWedding,
    // Guild Dues/Espionage DO fit the plain click-to-play shape this object
    // drives, unlike Alchemy/Invention/Merchant Fleet above — the target is
    // auto-picked (defaulted, then adjustable) rather than needing an
    // argument chosen BEFORE the initial click, same "click first, argue
    // after" shape Invention itself already uses for its board-tile pick.
    guildDues: playGuildDues,
    espionage: playEspionage,
    // Cities & Knights Merchant (Task 13) — fits the plain click-to-play
    // shape too, same "target/argument resolved AFTER the click" reasoning
    // guildDues/espionage's own comment gives just above: playMerchant only
    // spends the card and arms MerchantLayer's placement mode (rendered
    // straight on the 3D board, not via a GameHud picker), so it needs no
    // dedicated "own small argument-picker UI" the way Alchemy/Invention/
    // Merchant Fleet above do.
    merchant: playMerchant,
    // Cities & Knights Engineering/Smithing/Encouragement (Task 13) — fit the
    // same plain click-to-play shape guildDues/espionage/merchant above do:
    // each just spends the card and either arms an existing affordance
    // (Engineering reuses Task 12's Wall buttons) or resolves immediately
    // (Smithing/Encouragement), with no argument needed BEFORE the click.
    engineering: playEngineering,
    smithing: playSmithing,
    encouragement: playEncouragement,
    // Cities & Knights Intrigue (Task 14) — fits the same plain
    // click-to-play shape guildDues/espionage/merchant/engineering/
    // smithing/encouragement above do: the target is a KNIGHT clicked on
    // the board (KnightLayer's displaceTargets), not an argument chosen
    // before the initial click, so playIntrigue needs no dedicated GameHud
    // picker UI the way Treason (below, via onPlayTreason) does.
    intrigue: playIntrigue,
    // Cities & Knights Treason (Task 14) — the one remaining knight card
    // that DOES need an argument (a target PLAYER) chosen before the
    // initial click, same reason Alchemy/Invention/Merchant Fleet/
    // Commercial Harbor/Diplomacy above are excluded from this object —
    // see onPlayTreason's own wiring into GameHud instead.
    // Cities & Knights Taxation — the LAST remaining stub card (needs
    // Phase C2's barbarian/robber-active gate, out of this task's scope).
    taxation: () => playStubProgressCard('taxation'),
  }

  // Recomputed every render (cheap — one VP-comparison filter over
  // players), only meaningful while pendingGuildDues is actually open:
  // GameHud's PlayerTargetPicker needs the CURRENT eligible set (VP
  // standings can't change mid-picker since canPerformAction blocks every
  // other action while pendingGuildDues is set, but recomputing here rather
  // than freezing it at playGuildDues-time keeps this one source of truth
  // with playersMeetingVpThreshold, not a second copy that could drift).
  const guildDuesEligibleTargets = pendingGuildDues ? playersMeetingVpThreshold(players[currentPlayerIndex].id, 'gt') : []

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
          <CatanBoard tiles={tiles} hiddenTilesMode={gameRules.hiddenTiles} revealedTileIds={revealedTileIds} />
          <BoardInteractions
            key={boardInstance}
            graph={graph}
            settlements={settlements}
            roads={roads}
            players={players}
            metropolisVertexIds={metropolisVertexIds}
            onBuildSettlement={buildSettlement}
            onBuildRoad={buildRoad}
            // Building/road placement isn't broadcast to other clients in
            // this phase — locking it for whoever doesn't hold the turn
            // stops a non-active online player from placing something only
            // their own screen would ever see, not real network sync.
            locked={!!winner || !isMyTurn}
            // Cities & Knights Diplomacy — see BoardInteractions' own
            // roadPickerActive comment. Scoped to the local viewer only, same
            // reasoning TileSwapLayer's `active` prop below uses for
            // Invention (pendingDiplomacyRemoval is local-only state, never
            // broadcast, so this only ever renders active on the acting
            // client's own screen).
            roadPickerActive={pendingDiplomacyRemoval?.playerId === localPlayer.id}
            remoteHover={remoteHover}
            onHoverChange={onHoverChange}
            cityWalls={new Set(players.flatMap((p) => p.cityWalls))}
          />
          <RobberLayer
            tiles={tiles}
            robberTileId={robberTileId}
            isMovingRobber={gamePhase === 'moveRobber' && !winner && isMyTurn}
            onMoveRobber={moveRobber}
            // Same two inputs CatanBoard gets: the figurine has to stand on
            // top of the mist when its own tile is still fogged, or it is
            // sealed inside the dome and simply invisible.
            hiddenTilesMode={gameRules.hiddenTiles}
            revealedTileIds={revealedTileIds}
          />
          {/* Cities & Knights Invention — sibling to RobberLayer/
              BoardInteractions, same Canvas. active is scoped to the LOCAL
              client's own view: pendingInventionSwap is local-only state, so
              this only ever renders active for whichever browser actually
              played the card (in local Pass & Play, localPlayer tracks
              whoever's turn it currently is, which is the same player). */}
          <TileSwapLayer
            tiles={tiles}
            active={pendingInventionSwap?.playerId === localPlayer.id}
            firstTileId={pendingInventionSwap?.firstTileId ?? null}
            onSelectTile={handleInventionTileSelect}
            hiddenTilesMode={gameRules.hiddenTiles}
            revealedTileIds={revealedTileIds}
          />
          {/* Cities & Knights Merchant (Task 13) — sibling to RobberLayer/
              TileSwapLayer, same Canvas. placingPlayerId is scoped to the
              LOCAL client's own view: pendingMerchantPlacement is local-only
              state, so the eligible-tile picker only ever renders for
              whichever browser actually played the card (same reasoning
              TileSwapLayer's own `active` prop comment gives for Invention).
              The standing marker itself (wherever merchantTileId currently
              is) always renders for every client, regardless of who's
              placing. */}
          <MerchantLayer
            tiles={tiles}
            merchantTileId={merchantTileId}
            placingPlayerId={pendingMerchantPlacement === localPlayer.id ? pendingMerchantPlacement : null}
            settlements={settlements}
            vertexTileIds={graph.vertexTileIds}
            onSelectTile={handleMerchantTileSelect}
          />
          {/* Cities & Knights Knights (Task 7, Move wired in Task 9,
              Displace wired in Task 10) — sibling to RobberLayer/
              MerchantLayer, same Canvas. recruitTargets/moveTargets/
              displaceTargets are all scoped to the LOCAL client's own view:
              pendingKnightRecruit/armedKnightAction are both local-only
              state, same reasoning TileSwapLayer/MerchantLayer's own
              active/placingPlayerId props give above. */}
          {gameRules.citiesAndKnightsKnights && (
            <KnightLayer
              knights={players.flatMap((p) => p.knightPieces)}
              colorTokenByPlayerId={colorTokenByPlayerId}
              vertexById={graph.vertexById}
              recruitTargets={
                pendingKnightRecruit != null
                  ? recruitableVertices(pendingKnightRecruit, graph, roads, settlements, knightPiecesByVertex)
                  : // Cities & Knights Treason (Task 14) — the replacement-knight
                    // placement reuses Recruit's own eligible-vertex rule
                    // (recruitableVertices) and this same board-marker
                    // affordance, so it lights up here rather than needing a
                    // dedicated marker set of its own.
                    pendingTreasonPlacement
                    ? recruitableVertices(pendingTreasonPlacement.playerId, graph, roads, settlements, knightPiecesByVertex)
                    : null
              }
              moveTargets={
                armedKnightAction?.mode === 'move'
                  ? (() => {
                      const knight = players.flatMap((p) => p.knightPieces).find((k) => k.id === armedKnightAction.knightId)
                      return knight ? knightMoveTargets(knight, graph, roads, settlements, knightPiecesByVertex) : null
                    })()
                  : null
              }
              displaceTargets={
                // Cities & Knights Intrigue (Task 14) — union of
                // knightDisplaceTargets from every one of the acting
                // player's own vertices, via the SAME intrigueDisplaceTargets
                // helper playIntrigue's own eligibility check uses, so the
                // two can never disagree about which knights are clickable.
                pendingIntrigueDisplace != null
                  ? intrigueDisplaceTargets(pendingIntrigueDisplace)
                  : armedKnightAction?.mode === 'displace'
                    ? (() => {
                        const knight = players.flatMap((p) => p.knightPieces).find((k) => k.id === armedKnightAction.knightId)
                        return knight ? knightDisplaceTargets(knight, graph, roads, settlements, knightPiecesByVertex) : null
                      })()
                    : null
              }
              onSelectVertex={handleKnightVertexSelect}
              onSelectKnight={handleKnightSelect}
            />
          )}
          {/* Cities & Knights barbarian pillage (Task 6) — sibling to
              KnightLayer, same Canvas. Gated on activePillageTarget, NOT
              pillageQueue.length: the latter would render the picker (with
              some OTHER player's eligible cities) on every connected
              client online — see activePillageTarget's own derivation
              above (Task 5's IMPORTANT note) for why only the affected
              player's own screen may ever have this non-null. */}
          {activePillageTarget && (
            <PillageLayer
              eligibleVertexIds={activePillageTarget.eligibleCityVertexIds}
              vertexById={graph.vertexById}
              onSelectVertex={handlePillageTargetSelect}
            />
          )}
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
            commodities={localPlayer.commodities}
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
            is what makes the orbit feel weighted rather than twitchy.
            Exclusively under the player's own mouse input on every screen,
            every turn — except while FreeCameraControls (F) has taken
            over, when it's disabled outright so the two never fight over
            the same pointer. */}
          <OrbitControls
            enabled={!isFreeCamActive}
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
          {/* Opt-in fly-camera — F toggles it, WASD/mouse/space/shift move
              once active, R resets. See FreeCameraControls' own header for
              the full control scheme. */}
          <FreeCameraControls onActiveChange={setIsFreeCamActive} />
        </Canvas>
      </CanvasErrorBoundary>

      {/* Free-cam hides the mouse cursor (pointer lock) the instant it's
          active, so without this hint there'd be no on-screen indication
          of how the controls changed, or how to get the cursor back. */}
      <div
        className="pointer-events-none absolute z-10 font-body text-[10px] tracking-[0.08em] text-white/40 uppercase"
        style={{ bottom: `${FREE_CAM_HINT_POSITION.bottom}px`, left: `${FREE_CAM_HINT_POSITION.left}px` }}
      >
        {isFreeCamActive
          ? 'WASD move · Mouse look · Scroll zoom · Space/Shift up/down · R reset · F exit'
          : 'F — Free camera'}
      </div>

      <GameHud
        players={players}
        currentPlayerIndex={currentPlayerIndex}
        isMyTurn={isMyTurn}
        lastRoll={lastRoll}
        lastEventDie={lastEventDie}
        onRollDice={rollDice}
        hasRolledThisTurn={hasRolledThisTurn}
        onEndTurn={handleEndTurn}
        gamePhase={gamePhase}
        setupStage={setupStage}
        banner={banner}
        onRestart={restartGame}
        canRestart={onlineInfo == null || isEffectiveHost}
        portRates={currentPlayerPortRates}
        onTrade={bankTrade}
        onTradeCommodity={tradeCommodity}
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
        onResolveDevCardCommodityPicker={resolveDevCardCommodityPicker}
        scienceFreeResourceActive={activeScienceFreeResourcePlayerId != null}
        onResolveScienceFreeResource={resolveScienceFreeResource}
        devCardPlayedThisTurn={devCardPlayedThisTurn}
        longestRoadHolderId={longestRoadHolderId}
        longestRoadLengths={longestRoadLengths}
        largestArmyHolderId={largestArmyHolderId}
        metropolisHolders={metropolisHolders}
        metropolisVertexIds={metropolisVertexIds}
        merchantHolderId={merchantHolderId}
        pendingMetropolisTrack={
          pendingMetropolisClaim && pendingMetropolisClaim.playerId === localPlayer.id
            ? pendingMetropolisClaim.track
            : null
        }
        citiesAndKnightsCommodities={gameRules.citiesAndKnightsCommodities}
        onBuyImprovement={buyCityImprovement}
        citiesAndKnightsProgressCards={gameRules.citiesAndKnightsProgressCards}
        citiesAndKnightsKnights={gameRules.citiesAndKnightsKnights}
        onRecruitKnight={armKnightRecruit}
        canRecruitKnight={canRecruitKnight(localPlayer)}
        onActivateKnight={activateKnight}
        onPromoteKnight={promoteKnight}
        onArmKnightMove={armKnightMove}
        onArmKnightDisplace={armKnightDisplace}
        onArmChaseRobber={armChaseRobber}
        canChaseRobber={(knight) => new Set(graph.vertexTileIds.get(knight.vertexId) ?? []).has(robberTileId)}
        armedKnightId={armedKnightAction?.knightId ?? null}
        knightsPromotedThisTurn={knightsPromotedThisTurn}
        onBuildWall={buildCityWall}
        pendingFreeCityWall={pendingFreeCityWall}
        onResolveFreeWall={resolveFreeCityWall}
        progressCardDeckCounts={{
          science: progressCardDecks.science.length,
          trade: progressCardDecks.trade.length,
          politics: progressCardDecks.politics.length,
        }}
        progressCardPlayHandlers={progressCardPlayHandlers}
        onPlayAlchemy={playAlchemy}
        craneDiscountActive={craneDiscountPlayerId === localPlayer.id}
        onPlayInvention={playInvention}
        inventionSwapActive={pendingInventionSwap !== null}
        onPlayMerchantFleet={playMerchantFleet}
        merchantFleetRate={merchantFleetRate}
        onPlayCommercialHarbor={playCommercialHarbor}
        onPlayTreason={playTreason}
        treasonPlacementActive={pendingTreasonPlacement?.playerId === localPlayer.id}
        onPlayDiplomacy={activateDiplomacy}
        diplomacyPickerActive={pendingDiplomacyRemoval?.playerId === localPlayer.id}
        onCancelDiplomacy={cancelDiplomacy}
        pendingGuildDues={pendingGuildDues}
        guildDuesEligibleTargets={guildDuesEligibleTargets}
        onSelectGuildDuesTarget={selectGuildDuesTarget}
        onConfirmGuildDues={confirmGuildDues}
        onCancelGuildDues={cancelGuildDues}
        pendingEspionage={pendingEspionage}
        onSelectEspionageTarget={selectEspionageTarget}
        onConfirmEspionage={confirmEspionage}
        onCancelEspionage={cancelEspionage}
        activeProgressDiscarderId={activeProgressDiscarderId}
        progressDiscardSelection={progressDiscardSelection}
        onToggleProgressDiscard={toggleProgressDiscardSelection}
        progressDiscardRequiredCount={progressDiscardRequiredCount}
        onConfirmProgressDiscard={confirmProgressDiscard}
        progressDiscardingPlayerName={progressDiscardingPlayer?.name ?? ''}
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

      {/* Cities & Knights barbarian attack (Task 5-7) — modal shell +
          sequencing state, the pillage board-picker (PillageLayer, gated on
          activePillageTarget above), and this in-modal deck picker (gated
          on activeWinnerDrawPlayerId, not winnerDrawQueue.length — same
          reasoning as activePillageTarget's own derivation above). Close
          only renders once both queues are empty — there's nothing left to
          pick via either picker at that point — and just dismisses the
          modal; nothing left to clear. */}
      {activeBarbarianAttack && (
        <>
          <BarbarianAttackModal
            result={activeBarbarianAttack}
            players={players}
            pendingChoiceLabel={pendingChoiceLabel}
            winnerDrawActive={activeWinnerDrawPlayerId != null}
            onDrawFromTrack={handleBarbarianWinnerDraw}
          />
          {pillageQueue.length === 0 && winnerDrawQueue.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 z-50 flex justify-center">
              <button
                type="button"
                onClick={() => setActiveBarbarianAttack(null)}
                className="pointer-events-auto rounded-lg bg-gradient-to-b from-gold to-gold-deep px-6 py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
              >
                Close
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
