import { useState } from 'react'
import type { BannerMessage, DevCardPickerMode, EventLogEntry, GamePhase, SetupStage } from '../../App'
import {
  COMMODITY_LABELS,
  COMMODITY_ORDER,
  IMPROVEMENT_TRACK_ORDER,
  RESOURCE_LABELS,
  RESOURCE_ORDER,
  type Building,
  type CommodityType,
  type DevCardType,
  type ImprovementTrack,
  type MetropolisHolders,
  type Player,
  type ResourceType,
} from '../../game/types'
import { evaluateMetropolisPurchase } from '../../game/cityImprovements'
import type { ChatMessagePayload } from '../../multiplayer/useRoomChannel'
import { TopBar } from './TopBar'
import { ResourcePanel } from './ResourcePanel'
import { RollDiceButton } from './RollDiceButton'
import { EventDieIndicator } from './EventDieIndicator'
import type { EventDieFace } from '../Dice3D'
import { EventBanner } from './EventBanner'
import { EventLogPanel } from './EventLogPanel'
import { ChatBoxPanel } from './ChatBoxPanel'
import { TradeModal } from './TradeModal'
import { VictoryBanner } from './VictoryBanner'
import { BuildingCostsPanel } from './BuildingCostsPanel'
import { TradeOfferPrompt, type PendingTrade } from './TradeOfferPrompt'
import { DevCardResourcePicker } from './DevCardResourcePicker'
import { DevCardCommodityPicker } from './DevCardCommodityPicker'
import { RankingsPanel } from './RankingsPanel'
import { DiscardPanel } from './DiscardPanel'
import { RoomCodeTag } from './RoomCodeTag'
import { CityImprovementsPanel } from './CityImprovementsPanel'
import { ProgressCardsPanel, type ProgressCardPlayHandlers } from './ProgressCardsPanel'
import { PlayerTargetPicker } from './PlayerTargetPicker'
import { OpponentHandPicker } from './OpponentHandPicker'
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'

// 'scienceFreeResource' isn't a DevCardPickerMode (App.tsx keeps it as a
// separate queue, not devCardPicker — see the design note on
// scienceFreeResourcePlayerIds in App.tsx) but shares the exact same
// "click N resource icons" modal, so it gets a case in this same copy map
// rather than a second hardcoded picker render below.
type PickerMode = DevCardPickerMode | 'scienceFreeResource'

const DEV_CARD_PICKER_COPY: Record<PickerMode, { title: string; subtitle: string; pickCount: number }> = {
  yearOfPlenty: { title: 'Year of Plenty', subtitle: 'Choose 2 resources to take from the bank.', pickCount: 2 },
  monopoly: { title: 'Monopoly', subtitle: 'Choose 1 resource type to seize from every opponent.', pickCount: 1 },
  resourceMonopolyProgress: {
    title: 'Resource Monopoly',
    subtitle: 'Announce 1 resource type — every opponent gives you 2 of it (or their last one).',
    pickCount: 1,
  },
  // pickCount here is never actually read — 'tradeMonopolyProgress' renders
  // DevCardCommodityPicker below, not DevCardResourcePicker, and that
  // component fixes its pick count at 1 internally. Kept for type
  // uniformity across this Record (title/subtitle ARE read for both) rather
  // than splitting the map in two.
  tradeMonopolyProgress: {
    title: 'Trade Monopoly',
    subtitle: 'Announce 1 commodity type — every opponent gives you 1 of it.',
    pickCount: 1,
  },
  scienceFreeResource: { title: 'Free Resource', subtitle: 'Science level 3: choose 1 resource.', pickCount: 1 },
}

// Stable "nothing is blocked" verdict for when the Cities & Knights house
// rule is off — a module constant rather than a fresh object literal per
// render so the (unrendered) panel below never sees a new identity either.
const NO_METROPOLIS_PURCHASE_BLOCKED: Record<ImprovementTrack, boolean> = {
  science: false,
  trade: false,
  politics: false,
}

interface GameHudProps {
  players: Player[]
  currentPlayerIndex: number
  // Always true for local Pass & Play. For Online Multiplayer, true only on
  // the browser whose seat currently holds the turn — everyone else's
  // action buttons stay locked until they hear a TURN_PASSED broadcast.
  isMyTurn: boolean
  lastRoll: number | null
  lastEventDie: EventDieFace | null
  onRollDice: () => void
  // Once true, the Roll Dice button morphs into End Turn (same slot) — the
  // ONLY way currentPlayerIndex ever advances is that explicit click.
  hasRolledThisTurn: boolean
  onEndTurn: () => void
  gamePhase: GamePhase
  setupStage: SetupStage
  banner: BannerMessage | null
  onRestart: () => void
  // False only in an online match for a non-host player.
  canRestart: boolean
  portRates: Record<ResourceType, number>
  onTrade: (give: ResourceType, receive: ResourceType) => void
  // Cities & Knights Trade level 3 — 2:1 commodity trading, any time on the
  // viewer's own turn (not just after building/buying). Gated inside
  // TradeModal itself (canTradeCommodities, derived below from the viewer's
  // own trade track level) rather than here, same split onTrade/bankTrade
  // already has between "can the modal even be opened" (canTrade, below) and
  // "is this specific trade currently legal" (App.tsx's own guards).
  onTradeCommodity: (give: CommodityType, receive: ResourceType | CommodityType) => void
  isRolling: boolean
  devDeckCount: number
  onBuyDevCard: () => void
  winner: Player | null
  settlements: Record<string, Building>
  onReturnToMenu: () => void
  pendingTrade: PendingTrade | null
  // null for local Pass & Play (everyone shares one screen, so the trade
  // prompt always shows there). Online, only the browser whose player ID
  // matches pendingTrade.toPlayerId should see the Accept/Decline prompt —
  // everyone else (including the proposer) just sees their action buttons
  // locked until it resolves.
  localPlayerId: number | null
  onProposeTrade: (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => void
  onResolveTrade: (accept: boolean) => void
  onPlayDevCard: (type: DevCardType) => void
  devCardPicker: DevCardPickerMode | null
  onResolveDevCardPicker: (picks: ResourceType[]) => void
  // Cities & Knights Trade Monopoly's picker — a separate resolver rather
  // than widening onResolveDevCardPicker's ResourceType[] signature, since
  // DevCardCommodityPicker resolves a single CommodityType, not a
  // ResourceType array. Only ever called while devCardPicker ===
  // 'tradeMonopolyProgress' (see activePickerMode's render branch below).
  onResolveDevCardCommodityPicker: (pick: CommodityType) => void
  // Science level 3's per-roll bonus: a player who received zero production
  // this roll gets to pick 1 free resource. Modeled as its own flag/handler
  // pair (not folded into devCardPicker) because it can be true for a
  // DIFFERENT player than currentPlayerIndex — see scienceFreeResourcePlayerIds
  // in App.tsx. Mutually exclusive with devCardPicker in practice (dev cards
  // are played during the Action phase, this only opens right after a roll).
  scienceFreeResourceActive: boolean
  onResolveScienceFreeResource: (resource: ResourceType) => void
  devCardPlayedThisTurn: boolean
  longestRoadHolderId: number | null
  longestRoadLengths: Map<number, number>
  largestArmyHolderId: number | null
  // Cities & Knights Metropolis — who currently controls each track (for
  // scoring, passed on to RankingsPanel/VictoryBanner) and which of that
  // player's cities carries each track's marker (for CityImprovementsPanel's
  // spare-city gate below). Both live in App.tsx (Task 6), not on Player,
  // since a Metropolis's marker belongs to one specific city vertex, not
  // just "a player."
  metropolisHolders: MetropolisHolders
  metropolisVertexIds: Record<ImprovementTrack, string | null>
  // Cities & Knights Merchant (Task 13) — who currently controls the
  // Merchant piece (App-level board state, Task 13), passed on to
  // RankingsPanel/VictoryBanner for scoring, same "live in App.tsx, not on
  // Player" reasoning metropolisHolders' own comment above gives.
  merchantHolderId: number | null
  // Set the instant the viewer's own purchase crosses into level 4/5 on a
  // track — threaded straight down from App.tsx (not derivable from any
  // prop GameHud already has) so CityImprovementsPanel can swap that row to
  // a "select a city" prompt.
  pendingMetropolisTrack: ImprovementTrack | null
  // Cities & Knights house rule — whether commodity cards count toward the
  // "cards in hand" discard-risk total shown in ResourcePanel. Passed as a
  // plain boolean (not the whole GameRules object) since that's the only
  // piece a display component like ResourcePanel needs. Also gates whether
  // CityImprovementsPanel renders at all — a match with this house rule off
  // never shows city improvement tracks.
  citiesAndKnightsCommodities: boolean
  onBuyImprovement: (track: ImprovementTrack) => void
  // Cities & Knights progress cards — gates whether ProgressCardsPanel
  // renders at all, same "derived from GameRules, not folded into
  // citiesAndKnightsCommodities" split GameRules itself keeps (see that
  // field's own comment in game/types.ts: naturally inert without
  // citiesAndKnightsCommodities also on, but no UI-level dependency
  // enforced here either, matching that precedent).
  citiesAndKnightsProgressCards: boolean
  // Remaining cards in each of the 3 progress-card decks — shown in the
  // panel header the same way DiscardPanel/EventLogPanel show live counts.
  progressCardDeckCounts: Record<'science' | 'trade' | 'politics', number>
  // Per-type Play handlers — a Partial (Tasks 8-16 each add one key) so a
  // card with no wired-in Play action yet renders disabled instead of
  // crashing on a missing handler.
  progressCardPlayHandlers: ProgressCardPlayHandlers
  // Cities & Knights Alchemy — deliberately NOT part of
  // progressCardPlayHandlers above (see that prop's own comment): this
  // fires straight from the small 2-number picker rendered near the Roll
  // Dice button below, only reachable pre-roll on the current player's own
  // turn.
  onPlayAlchemy: (d1: number, d2: number) => void
  // Cities & Knights Crane — true when the viewer holds an unused "next
  // improvement costs 1 less" discount. Threaded straight through to
  // CityImprovementsPanel — see that prop's own comment for why the button-
  // enabled check needs it too, not just App.tsx's own purchase gate.
  craneDiscountActive: boolean
  // Cities & Knights Invention — deliberately NOT part of
  // progressCardPlayHandlers (same exception as Alchemy above): fires from
  // its own small "Play" button near Roll Dice, which only spends the card
  // and opens the 2-tile board picker (App.tsx's pendingInventionSwap) —
  // the actual swap resolves via board clicks, entirely outside GameHud.
  onPlayInvention: () => void
  // True while the VIEWER'S OWN 2-tile pick is in progress — hides the Play
  // button (so a second Invention can't be spent mid-pick from here; App.tsx
  // guards this too) and shows a "pick 2 tiles" hint instead.
  inventionSwapActive: boolean
  // Cities & Knights Merchant Fleet — same exception as Invention/Alchemy:
  // needs a resource/commodity TYPE picked before it can be played, so it
  // gets its own small picker UI rather than progressCardPlayHandlers'
  // plain click-to-play.
  onPlayMerchantFleet: (type: ResourceType | CommodityType) => void
  // The viewer's own active rate, if any — null once nobody on this seat has
  // one going. Drives both the small "active" status line near the picker
  // and (below) whether the Commodities trade tab is reachable even short of
  // Trade level 3, when the named type is a commodity.
  merchantFleetRate: { playerId: number; type: ResourceType | CommodityType } | null
  // Cities & Knights Commercial Harbor (Task 12) — same exception as
  // Merchant Fleet just above: needs a RESOURCE type (never a commodity —
  // this card only ever GIVES resources, in exchange for a commodity, unlike
  // Merchant Fleet's rate which can name either) picked before it can be
  // played, so it gets its own small picker UI too.
  onPlayCommercialHarbor: (resource: ResourceType) => void
  // Cities & Knights Diplomacy (Task 12) — same exception as Invention: no
  // argument picker of its own here, the actual road pick happens on the
  // board itself (BoardInteractions' EdgeSlot, App.tsx's
  // pendingDiplomacyRemoval), so this is just a spend-and-arm button plus a
  // flag for whether the viewer's own road pick is currently in progress
  // (hides the Play button / shows a hint, same shape as inventionSwapActive).
  onPlayDiplomacy: () => void
  diplomacyPickerActive: boolean
  // Cities & Knights Guild Dues — null until the viewer's own OWN play
  // spends the card (App.tsx's playGuildDues), local-only like
  // pendingInventionSwap/merchantFleetType above (only ever set on the
  // acting client's own screen). guildDuesEligibleTargets is App.tsx's own
  // playersMeetingVpThreshold result, threaded down rather than
  // recomputed here so this file doesn't need its own copy of that VP-
  // comparison logic (or the settlements/trophy/metropolis state it reads).
  pendingGuildDues: { targetId: number } | null
  guildDuesEligibleTargets: Player[]
  onSelectGuildDuesTarget: (playerId: number) => void
  onConfirmGuildDues: (picks: (ResourceType | CommodityType)[]) => void
  onCancelGuildDues: () => void
  // Cities & Knights Espionage — same shape as pendingGuildDues above, but
  // targets every OTHER player (no VP filter needed, so no separate
  // eligible-targets prop — this file's own `otherPlayers`, below, already
  // is that list).
  pendingEspionage: { targetId: number } | null
  onSelectEspionageTarget: (playerId: number) => void
  onConfirmEspionage: (indices: number[]) => void
  onCancelEspionage: () => void
  // Cities & Knights progress-card hand limit (4 cards). Unlike
  // isMyDiscardTurn below (a plain boolean App.tsx already resolved),
  // this is the raw front-of-queue player id — GameHud derives its OWN
  // isMyProgressDiscardTurn from it (activeProgressDiscarderId === viewer.id)
  // since `viewer` (this screen's own player) is a GameHud-local concept
  // App.tsx doesn't have a matching hand-off for outside the resource-
  // discard flow. null when nobody currently owes a progress-card discard.
  activeProgressDiscarderId: number | null
  // Indices into the ACTIVE discarder's progressCards array (see
  // ProgressCardsPanel's own discardSelection prop) — not meaningful for
  // any other player, but harmless to pass down regardless since the panel
  // only reads it while discardActive is true.
  progressDiscardSelection: number[]
  onToggleProgressDiscard: (index: number) => void
  // How many cards the active discarder still needs to pick — 0 is
  // possible (progressCardOverLimitPlayerIds is deliberately over-
  // inclusive per Task 3), in which case the confirm button is immediately
  // enabled.
  progressDiscardRequiredCount: number
  onConfirmProgressDiscard: () => void
  // Named for the small "waiting for X" indicator, same role as
  // discardingPlayerName below but for the progress-card queue.
  progressDiscardingPlayerName: string
  // Discard (7-roll, over 7 cards). isMyDiscardTurn gates whether THIS
  // screen sees the counter/Confirm button vs. a "waiting" message —
  // discardingPlayerName still names whoever's actually discarding either way.
  isMyDiscardTurn: boolean
  discardingPlayerName: string
  discardRequiredCount: number
  discardSelectedCount: number
  onConfirmDiscard: () => void
  // null for local Pass & Play. Online, shown persistently so a player who
  // never noted the code down can still find it to reconnect.
  roomCode: string | null
  // Whoever is actually looking at THIS screen — App.tsx's own localPlayer,
  // already handling both the online case (this browser's assigned player,
  // not whoever's turn it is) and the local-Pass-&-Play discard hand-off
  // (the specific over-limit player currently discarding, not necessarily
  // the roller). Panels showing "your own" data (hand count, dev cards,
  // hidden Victory Point hint) need this, not currentPlayerIndex.
  viewerPlayerId: number
  eventLog: EventLogEntry[]
  // Online-only — ChatBoxPanel only renders when roomCode is set.
  chatMessages: ChatMessagePayload[]
  onSendChatMessage: (text: string) => void
}

export function GameHud({
  players,
  currentPlayerIndex,
  isMyTurn,
  lastRoll,
  lastEventDie,
  onRollDice,
  hasRolledThisTurn,
  onEndTurn,
  gamePhase,
  setupStage,
  banner,
  onRestart,
  canRestart,
  portRates,
  onTrade,
  onTradeCommodity,
  isRolling,
  devDeckCount,
  onBuyDevCard,
  winner,
  settlements,
  onReturnToMenu,
  pendingTrade,
  localPlayerId,
  onProposeTrade,
  onResolveTrade,
  onPlayDevCard,
  devCardPicker,
  onResolveDevCardPicker,
  onResolveDevCardCommodityPicker,
  scienceFreeResourceActive,
  onResolveScienceFreeResource,
  devCardPlayedThisTurn,
  longestRoadHolderId,
  longestRoadLengths,
  largestArmyHolderId,
  metropolisHolders,
  metropolisVertexIds,
  merchantHolderId,
  pendingMetropolisTrack,
  citiesAndKnightsCommodities,
  onBuyImprovement,
  citiesAndKnightsProgressCards,
  progressCardDeckCounts,
  progressCardPlayHandlers,
  onPlayAlchemy,
  craneDiscountActive,
  onPlayInvention,
  inventionSwapActive,
  onPlayMerchantFleet,
  merchantFleetRate,
  onPlayCommercialHarbor,
  onPlayDiplomacy,
  diplomacyPickerActive,
  pendingGuildDues,
  guildDuesEligibleTargets,
  onSelectGuildDuesTarget,
  onConfirmGuildDues,
  onCancelGuildDues,
  pendingEspionage,
  onSelectEspionageTarget,
  onConfirmEspionage,
  onCancelEspionage,
  activeProgressDiscarderId,
  progressDiscardSelection,
  onToggleProgressDiscard,
  progressDiscardRequiredCount,
  onConfirmProgressDiscard,
  progressDiscardingPlayerName,
  isMyDiscardTurn,
  discardingPlayerName,
  discardRequiredCount,
  discardSelectedCount,
  onConfirmDiscard,
  roomCode,
  viewerPlayerId,
  eventLog,
  chatMessages,
  onSendChatMessage,
}: GameHudProps) {
  const [isTradeOpen, setIsTradeOpen] = useState(false)
  // Cities & Knights Alchemy's own 2-number picker (Set Dice button near
  // Roll Dice, below) — plain local UI state, never broadcast, same
  // treatment devCardPicker's OWN resource choices get before submission.
  const [alchemyD1, setAlchemyD1] = useState(1)
  const [alchemyD2, setAlchemyD2] = useState(1)
  // Cities & Knights Merchant Fleet's own type picker (Play button near Roll
  // Dice, below) — same local-UI-state treatment as alchemyD1/alchemyD2.
  const [merchantFleetType, setMerchantFleetType] = useState<ResourceType | CommodityType>(RESOURCE_ORDER[0])
  // Cities & Knights Commercial Harbor's own type picker (Task 12) — same
  // local-UI-state treatment as merchantFleetType, but RESOURCE_ORDER-only
  // (see onPlayCommercialHarbor's own comment for why).
  const [commercialHarborResource, setCommercialHarborResource] = useState<ResourceType>(RESOURCE_ORDER[0])
  // devCardPicker takes priority — the two are mutually exclusive in
  // practice (see scienceFreeResourceActive's prop comment), but this
  // ordering also doubles as the "guard against stacking" the two modals
  // that every other picker/modal in this file already applies.
  const activePickerMode: PickerMode | null = devCardPicker ?? (scienceFreeResourceActive ? 'scienceFreeResource' : null)
  const currentPlayer = players[currentPlayerIndex]
  const viewer = players.find((p) => p.id === viewerPlayerId) ?? currentPlayer
  const otherPlayers = players.filter((p) => p.id !== viewer.id)
  // Cities & Knights Guild Dues/Espionage — each dialog gets its own focus
  // trap (same DevCardResourcePicker-style forced-overlay treatment),
  // wired to that card's own Cancel action for Escape-to-dismiss. Called
  // unconditionally (hooks can't be conditional) — harmless when the
  // matching pending* state is null, since the ref callback just never
  // attaches to a mounted node.
  const guildDuesDialogRef = useModalFocusTrap<HTMLDivElement>(onCancelGuildDues)
  const espionageDialogRef = useModalFocusTrap<HTMLDivElement>(onCancelEspionage)
  // Cities & Knights progress-card hand-limit discard — mirrors
  // isMyDiscardTurn's role, but computed HERE (not in App.tsx) since it
  // needs THIS screen's own viewer, which online is always this browser's
  // own player regardless of turn order, and locally is whoever the shared
  // device is currently showing.
  const isMyProgressDiscardTurn = activeProgressDiscarderId === viewer.id
  // Per track: does buying the viewer's NEXT level require (and lack) a spare
  // city? This is the EXACT same call App.tsx's buyCityImprovement makes, with
  // the same inputs — the helper derives the current holder's level and the
  // viewer's own city vertices internally, so the button's disabled state and
  // the real spend-time gate cannot drift apart (they each used to re-derive
  // both of those independently, which is how they were free to).
  // Only computed when the house rule is actually on — the sole consumer
  // (CityImprovementsPanel, below) is gated on the same flag, so off the rule
  // this was a players.find sweep per track on every single render whose
  // result nothing could ever read. It also reaches into each player's
  // cityImprovements, which a pre-Cities-&-Knights snapshot can be missing
  // entirely (see restoreFromSnapshot's normalization in App.tsx) — keeping
  // the work behind the flag keeps this off that crash path too.
  const metropolisPurchaseBlocked = citiesAndKnightsCommodities
    ? (Object.fromEntries(
        IMPROVEMENT_TRACK_ORDER.map((track) => [
          track,
          evaluateMetropolisPurchase(players, settlements, metropolisHolders, metropolisVertexIds, track, viewer.id)
            .blocked,
        ]),
      ) as Record<ImprovementTrack, boolean>)
    : NO_METROPOLIS_PURCHASE_BLOCKED
  const gameActive = !winner
  const tradeBlocked = !!pendingTrade
  // Covers every forced-choice overlay (devCardPicker, the Science level-3
  // free-resource pick, and Guild Dues/Espionage's own target-and-cards
  // dialogs below) — same reasoning as the canRestart guard further down:
  // the modal overlay alone stops mouse hit-testing, not keyboard Tab/Enter
  // reaching an action button still marked enabled. App.tsx's
  // canPerformAction() re-checks pendingGuildDues/pendingEspionage
  // independently at handler time — this is the matching UI-level lock, not
  // the only one.
  const pickerBlocked = !!activePickerMode || !!pendingGuildDues || !!pendingEspionage
  const canTrade = gamePhase === 'playing' && !isRolling && gameActive && !tradeBlocked && !pickerBlocked && isMyTurn
  const canBuyDevCard =
    gamePhase === 'playing' &&
    !isRolling &&
    gameActive &&
    !tradeBlocked &&
    !pickerBlocked &&
    devDeckCount > 0 &&
    isMyTurn
  const canPlayDevCards =
    gamePhase === 'playing' &&
    !isRolling &&
    gameActive &&
    !tradeBlocked &&
    !pickerBlocked &&
    !devCardPlayedThisTurn &&
    isMyTurn
  // Mirrors canBuyDevCard's derivation above — city improvements are also
  // only purchasable during your own action phase, after rolling (same
  // "roll before you build/buy" rule buildSettlementRaw/buyDevCard/bankTrade
  // enforce in App.tsx). No devDeckCount-style stock check here (commodities
  // affordability is checked per-track inside CityImprovementsPanel itself,
  // via canAffordImprovement).
  const canBuyImprovement =
    gamePhase === 'playing' &&
    !isRolling &&
    gameActive &&
    !tradeBlocked &&
    !pickerBlocked &&
    isMyTurn &&
    hasRolledThisTurn
  const statusLabel = pickerBlocked
    ? 'Choose your resources…'
    : tradeBlocked
      ? 'Trade pending…'
      : isRolling
        ? 'Rolling…'
        : gamePhase === 'setup'
        ? setupStage === 'settlement'
          ? 'Place your settlement'
          : 'Place your road'
        : gamePhase === 'discard'
          ? `${discardingPlayerName} discarding…`
          : gamePhase === 'moveRobber'
            ? 'Move the Robber'
            : `${currentPlayer.name}’s turn`

  return (
    <div className="pointer-events-none absolute inset-0 font-body text-white">
      <TopBar
        players={players}
        currentPlayerIndex={currentPlayerIndex}
        statusLabel={statusLabel}
        onRestart={onRestart}
        // tradeBlocked/pickerBlocked only stop mouse hit-testing on their
        // own full-screen overlays, not Tab order or Enter/Space — without
        // this, a keyboard user could tab past a decision another player
        // needs to make (accept/decline a trade, choose dev-card
        // resources) straight to New Game and wipe the match out from
        // under them. winner deliberately does NOT block this: restarting
        // from the victory screen is the normal next action there, not a
        // bypass of anything still in progress.
        canRestart={canRestart && !tradeBlocked && !pickerBlocked}
      />
      <EventBanner banner={banner} />
      {/* Its own independent slot, ABOVE the stack below — kept out of that
          stack's normal flow so its presence (online only) never pushes
          BuildingCostsPanel down off the top-20 alignment ResourcePanel
          (the "cards in hand" panel, right-4) also sits at. */}
      {roomCode && (
        <div className="pointer-events-none absolute top-4 left-4">
          <RoomCodeTag roomCode={roomCode} />
        </div>
      )}
      {/* Stacked in normal flow (not each independently absolute-positioned)
          so opening one accordion pushes the one below it down instead of
          them overlapping or leaving a fixed gap regardless of state. */}
      <div className="pointer-events-none absolute top-20 left-4 flex w-52 flex-col gap-2">
        <BuildingCostsPanel />
        <RankingsPanel
          players={players}
          settlements={settlements}
          viewerPlayerId={viewer.id}
          longestRoadHolderId={longestRoadHolderId}
          longestRoadLengths={longestRoadLengths}
          largestArmyHolderId={largestArmyHolderId}
          metropolisHolders={metropolisHolders}
          merchantHolderId={merchantHolderId}
        />
        {/* Placement is a first-pass call, not yet confirmed live in the
            browser (see this task's report) — stacked here alongside
            BuildingCostsPanel/RankingsPanel since it's the same "your own
            reference info" category, but may move once actually rendered. */}
        {citiesAndKnightsCommodities && (
          <CityImprovementsPanel
            commodities={viewer.commodities}
            cityImprovements={viewer.cityImprovements}
            canBuy={canBuyImprovement}
            onBuy={onBuyImprovement}
            pendingMetropolisTrack={pendingMetropolisTrack}
            metropolisPurchaseBlocked={metropolisPurchaseBlocked}
            craneDiscountActive={craneDiscountActive}
          />
        )}
        {citiesAndKnightsProgressCards && (
          <>
            <ProgressCardsPanel
              progressCards={viewer.progressCards}
              deckCounts={progressCardDeckCounts}
              playHandlers={progressCardPlayHandlers}
              isMyTurn={isMyTurn}
              discardActive={isMyProgressDiscardTurn}
              discardSelection={progressDiscardSelection}
              onToggleDiscard={onToggleProgressDiscard}
            />
            {/* Small confirm/count indicator for the 4-card hand-limit
                discard — deliberately NOT a full-screen DiscardPanel-style
                modal like the 7-roll resource discard: a progress-card draw
                can land on the SAME roll as a natural 7 (event die and
                production dice are independent — see handlePhysicsSettled),
                so both discard flows can be active at once, and two
                centered full-screen overlays would fight over the same
                screen space. This stays compact and in-flow, right below
                the panel it belongs to, same "stacked, not overlapping"
                treatment the rest of this left column already uses. */}
            {activeProgressDiscarderId != null && (
              <div className="pointer-events-auto rounded-2xl border border-glass-border bg-glass p-3 text-center shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                {isMyProgressDiscardTurn ? (
                  <>
                    <p className="font-body text-[10px] tracking-[0.2em] text-player-1/80 uppercase">
                      Over the 4-Card Limit
                    </p>
                    <p className="mt-1 font-display text-sm text-white">
                      {progressDiscardRequiredCount - progressDiscardSelection.length > 0
                        ? `Select ${progressDiscardRequiredCount - progressDiscardSelection.length} more card${
                            progressDiscardRequiredCount - progressDiscardSelection.length === 1 ? '' : 's'
                          }`
                        : 'Ready to discard'}
                    </p>
                    <button
                      type="button"
                      disabled={progressDiscardSelection.length !== progressDiscardRequiredCount}
                      onClick={onConfirmProgressDiscard}
                      className="mt-2 w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2 font-display text-xs font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Confirm Discard
                    </button>
                  </>
                ) : (
                  <p className="font-body text-xs text-white/70">Waiting for {progressDiscardingPlayerName} to discard…</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <EventLogPanel events={eventLog} />
      {roomCode && <ChatBoxPanel messages={chatMessages} players={players} onSend={onSendChatMessage} />}
      <ResourcePanel
        resources={viewer.resources}
        commodities={viewer.commodities}
        countsCommodities={citiesAndKnightsCommodities}
        canTrade={canTrade}
        onOpenTrade={() => setIsTradeOpen(true)}
        devCards={viewer.devCards}
        devCardsBoughtThisTurn={viewer.devCardsBoughtThisTurn}
        knightsPlayed={viewer.knightsPlayed}
        canBuyDevCard={canBuyDevCard}
        onBuyDevCard={onBuyDevCard}
        canPlayDevCards={canPlayDevCards}
        onPlayDevCard={onPlayDevCard}
      />
      {isTradeOpen && (
        <TradeModal
          resources={viewer.resources}
          rates={portRates}
          onTrade={(give, receive) => onTrade(give, receive)}
          otherPlayers={otherPlayers}
          onProposeTrade={onProposeTrade}
          onClose={() => setIsTradeOpen(false)}
          isMyTurn={isMyTurn}
          commodities={viewer.commodities}
          // Not further AND-ed with citiesAndKnightsCommodities here — a
          // player can only ever reach trade level 3 via CityImprovementsPanel,
          // which already only renders under that same house rule (see its
          // own conditional above), same precedent buyCityImprovement/
          // canBuyImprovement rely on without re-checking the house rule
          // flag themselves.
          //
          // Cities & Knights Merchant Fleet — also reachable below Trade
          // level 3 when the viewer's active rate names a COMMODITY: without
          // this, naming a commodity via Merchant Fleet would be unplayable
          // through this UI, since the tab itself would never render. The
          // trade's own 2:1 minimum-quantity check inside TradeModal already
          // covers "affordable"; App.tsx's tradeCommodity independently
          // re-checks the SAME merchantFleetRate before actually applying a
          // trade below level 3, so selecting a non-named commodity here
          // (still visible, since this only unlocks the TAB, not per-icon
          // restriction) is rejected with a warn() at confirm time — the
          // same "ineligible click just gets warn()'d" precedent Medicine's
          // city-upgrade click already established.
          canTradeCommodities={
            viewer.cityImprovements.trade >= 3 ||
            (merchantFleetRate?.playerId === viewer.id && (COMMODITY_ORDER as string[]).includes(merchantFleetRate.type))
          }
          onTradeCommodity={onTradeCommodity}
        />
      )}
      <RollDiceButton
        lastRoll={lastRoll}
        onRoll={onRollDice}
        onEndTurn={onEndTurn}
        hasRolledThisTurn={hasRolledThisTurn}
        disabled={gamePhase !== 'playing' || isRolling || !gameActive || tradeBlocked || pickerBlocked || !isMyTurn}
        playerLabel={`${currentPlayer.name}:`}
      />
      {/* Every progress card with its own small picker UI (not
          progressCardPlayHandlers' generic click-to-play) stacks in this one
          column, anchored to the LEFT of Roll Dice (right-44 clears that
          button's own right-8/w-32 footprint). flex-col-reverse + gap-2
          grows the stack UPWARD from a single shared bottom-10 anchor as
          more of these become simultaneously eligible, rather than each
          needing its own hand-tuned bottom offset that would need
          re-tuning every time a sibling is added/removed. */}
      <div className="pointer-events-none absolute right-44 bottom-10 flex flex-col-reverse items-center gap-2">
        {/* Cities & Knights Alchemy — a 2-number picker, gated on the exact
            same pre-roll/own-turn conditions as RollDiceButton right next to
            it, so it only ever appears for the player who could actually use
            it right now. */}
        {citiesAndKnightsProgressCards && isMyTurn && !hasRolledThisTurn && currentPlayer.progressCards.includes('alchemy') && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-xl border border-glass-border bg-glass p-2.5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <span className="font-body text-[9px] tracking-[0.15em] text-white/60 uppercase">Alchemy: Set Dice</span>
            <div className="flex items-center gap-1.5">
              <select
                value={alchemyD1}
                onChange={(e) => setAlchemyD1(Number(e.target.value))}
                className="rounded border border-white/20 bg-board-navy/80 px-1.5 py-1 font-data text-sm text-white"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <select
                value={alchemyD2}
                onChange={(e) => setAlchemyD2(Number(e.target.value))}
                className="rounded border border-white/20 bg-board-navy/80 px-1.5 py-1 font-data text-sm text-white"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => onPlayAlchemy(alchemyD1, alchemyD2)}
              className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep px-3 py-1.5 font-display text-xs font-semibold text-board-navy transition-opacity hover:opacity-90"
            >
              Play
            </button>
          </div>
        )}
        {/* Cities & Knights Invention — no argument picker of its own (the
            actual 2-tile pick happens on the board itself, via
            TileSwapLayer), so this is just a spend-and-arm button. Hidden
            once inventionSwapActive so a second Invention can't be spent
            mid-pick from here (App.tsx's playInvention guards this too); a
            "pick tiles" hint takes its place instead. No pre-roll
            restriction, unlike Alchemy — Invention has no such rule. */}
        {citiesAndKnightsProgressCards && isMyTurn && !inventionSwapActive && currentPlayer.progressCards.includes('invention') && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-xl border border-glass-border bg-glass p-2.5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <span className="font-body text-[9px] tracking-[0.15em] text-white/60 uppercase">Invention</span>
            <button
              type="button"
              onClick={onPlayInvention}
              className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep px-3 py-1.5 font-display text-xs font-semibold text-board-navy transition-opacity hover:opacity-90"
            >
              Play
            </button>
          </div>
        )}
        {citiesAndKnightsProgressCards && isMyTurn && inventionSwapActive && (
          <div className="pointer-events-auto animate-gold-pulse rounded-xl border border-gold/60 bg-gold/10 px-3 py-2 text-center font-body text-[10px] text-gold uppercase">
            Pick 2 number tiles on the board
          </div>
        )}
        {/* Cities & Knights Merchant Fleet — a 1-type picker (resource or
            commodity), same shape as Alchemy's 2-number picker. No pre-roll
            restriction either. */}
        {citiesAndKnightsProgressCards && isMyTurn && currentPlayer.progressCards.includes('merchantFleet') && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-xl border border-glass-border bg-glass p-2.5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <span className="font-body text-[9px] tracking-[0.15em] text-white/60 uppercase">Merchant Fleet: Name a Type</span>
            <select
              value={merchantFleetType}
              onChange={(e) => setMerchantFleetType(e.target.value as ResourceType | CommodityType)}
              className="w-full rounded border border-white/20 bg-board-navy/80 px-1.5 py-1 font-data text-xs text-white"
            >
              {RESOURCE_ORDER.map((resource) => (
                <option key={resource} value={resource}>
                  {RESOURCE_LABELS[resource]}
                </option>
              ))}
              {COMMODITY_ORDER.map((commodity) => (
                <option key={commodity} value={commodity}>
                  {COMMODITY_LABELS[commodity]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onPlayMerchantFleet(merchantFleetType)}
              className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep px-3 py-1.5 font-display text-xs font-semibold text-board-navy transition-opacity hover:opacity-90"
            >
              Play
            </button>
            {merchantFleetRate?.playerId === viewer.id && (
              <span className="font-body text-[9px] text-gold/80">
                Active: 2:1{' '}
                {(COMMODITY_ORDER as string[]).includes(merchantFleetRate.type)
                  ? COMMODITY_LABELS[merchantFleetRate.type as CommodityType]
                  : RESOURCE_LABELS[merchantFleetRate.type as ResourceType]}
              </span>
            )}
          </div>
        )}
        {/* Cities & Knights Commercial Harbor (Task 12) — a 1-RESOURCE-type
            picker, same shape as Merchant Fleet's own picker just above but
            resource-only (this card only ever gives resources, never
            commodities). No pre-roll restriction. */}
        {citiesAndKnightsProgressCards && isMyTurn && currentPlayer.progressCards.includes('commercialHarbor') && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-xl border border-glass-border bg-glass p-2.5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <span className="font-body text-[9px] tracking-[0.15em] text-white/60 uppercase">Commercial Harbor: Offer a Resource</span>
            <select
              value={commercialHarborResource}
              onChange={(e) => setCommercialHarborResource(e.target.value as ResourceType)}
              className="w-full rounded border border-white/20 bg-board-navy/80 px-1.5 py-1 font-data text-xs text-white"
            >
              {RESOURCE_ORDER.map((resource) => (
                <option key={resource} value={resource}>
                  {RESOURCE_LABELS[resource]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onPlayCommercialHarbor(commercialHarborResource)}
              className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep px-3 py-1.5 font-display text-xs font-semibold text-board-navy transition-opacity hover:opacity-90"
            >
              Play
            </button>
          </div>
        )}
        {/* Cities & Knights Diplomacy (Task 12) — no argument picker of its
            own (the actual road pick happens on the board itself), so this
            is just a spend-and-arm button, same shape as Invention's own
            block above: hidden once diplomacyPickerActive so a second
            Diplomacy can't be spent mid-pick from here (App.tsx's
            activateDiplomacy guards this too), a "pick a road" hint taking
            its place instead. */}
        {citiesAndKnightsProgressCards && isMyTurn && !diplomacyPickerActive && currentPlayer.progressCards.includes('diplomacy') && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-xl border border-glass-border bg-glass p-2.5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <span className="font-body text-[9px] tracking-[0.15em] text-white/60 uppercase">Diplomacy</span>
            <button
              type="button"
              onClick={onPlayDiplomacy}
              className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep px-3 py-1.5 font-display text-xs font-semibold text-board-navy transition-opacity hover:opacity-90"
            >
              Play
            </button>
          </div>
        )}
        {citiesAndKnightsProgressCards && isMyTurn && diplomacyPickerActive && (
          <div className="pointer-events-auto animate-gold-pulse rounded-xl border border-gold/60 bg-gold/10 px-3 py-2 text-center font-body text-[10px] text-gold uppercase">
            Pick an open road on the board
          </div>
        )}
      </div>
      {lastEventDie && (
        <div className="pointer-events-none absolute right-8 bottom-40">
          <EventDieIndicator face={lastEventDie} />
        </div>
      )}
      {/* Trade Monopoly announces a CommodityType, not a ResourceType, so it
          gets its own picker component (DevCardCommodityPicker) rather than
          forcing DevCardResourcePicker's resource-only picks array to carry
          a commodity — see that component's own comment for why it isn't
          generalized into DevCardResourcePicker instead. Every other
          activePickerMode still renders the original resource picker. */}
      {activePickerMode && activePickerMode !== 'tradeMonopolyProgress' && (
        <DevCardResourcePicker
          title={DEV_CARD_PICKER_COPY[activePickerMode].title}
          subtitle={DEV_CARD_PICKER_COPY[activePickerMode].subtitle}
          pickCount={DEV_CARD_PICKER_COPY[activePickerMode].pickCount}
          onComplete={(picks) =>
            activePickerMode === 'scienceFreeResource' ? onResolveScienceFreeResource(picks[0]) : onResolveDevCardPicker(picks)
          }
        />
      )}
      {activePickerMode === 'tradeMonopolyProgress' && (
        <DevCardCommodityPicker
          title={DEV_CARD_PICKER_COPY.tradeMonopolyProgress.title}
          subtitle={DEV_CARD_PICKER_COPY.tradeMonopolyProgress.subtitle}
          onComplete={onResolveDevCardCommodityPicker}
        />
      )}
      {/* Cities & Knights Guild Dues — target picker (PlayerTargetPicker,
          restricted to playersMeetingVpThreshold's eligible set) stacked
          above the card picker (OpponentHandPicker) in ONE dialog box, same
          "one box, multiple sections" composition TradeModal already uses
          for its own player-target row + give/receive grids, rather than a
          sequential 2-screen flow. Only ever rendered on the acting
          client's own screen — pendingGuildDues is local-only state (see
          its own comment in App.tsx). */}
      {pendingGuildDues && (
        <div
          ref={guildDuesDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guild-dues-title"
          tabIndex={-1}
          className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-board-navy/80 backdrop-blur-md"
        >
          <div className="w-80 rounded-2xl border border-glass-border bg-glass p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <p id="guild-dues-title" className="mb-3 text-center font-body text-xs tracking-[0.25em] text-gold/80 uppercase">
              Guild Dues
            </p>
            <span className="mb-1 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Target</span>
            <div className="mb-4">
              <PlayerTargetPicker
                players={guildDuesEligibleTargets}
                selectedPlayerId={pendingGuildDues.targetId}
                onSelect={onSelectGuildDuesTarget}
              />
            </div>
            <OpponentHandPicker
              // Keyed on the target — OpponentHandPicker's own picks/
              // cardPicks selection state is local to the component
              // instance, so without a fresh key here, switching targets
              // via PlayerTargetPicker above would carry stale selections
              // (picked against the OLD target) into a submit against the
              // NEW one instead of resetting them.
              key={pendingGuildDues.targetId}
              target={players.find((p) => p.id === pendingGuildDues.targetId) ?? guildDuesEligibleTargets[0] ?? viewer}
              mode="resourcesAndCommodities"
              maxPicks={2}
              onConfirm={(picks) => onConfirmGuildDues(picks as (ResourceType | CommodityType)[])}
              onCancel={onCancelGuildDues}
            />
          </div>
        </div>
      )}
      {/* Cities & Knights Espionage — same composition as Guild Dues above,
          but the target list is `otherPlayers` (unrestricted — "another
          player," no VP filter) rather than a VP-eligible subset. */}
      {pendingEspionage && (
        <div
          ref={espionageDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="espionage-title"
          tabIndex={-1}
          className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-board-navy/80 backdrop-blur-md"
        >
          <div className="w-80 rounded-2xl border border-glass-border bg-glass p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <p id="espionage-title" className="mb-3 text-center font-body text-xs tracking-[0.25em] text-gold/80 uppercase">
              Espionage
            </p>
            <span className="mb-1 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Target</span>
            <div className="mb-4">
              <PlayerTargetPicker
                players={otherPlayers}
                selectedPlayerId={pendingEspionage.targetId}
                onSelect={onSelectEspionageTarget}
              />
            </div>
            <OpponentHandPicker
              // Same reset-on-switch reasoning as Guild Dues' own key above.
              key={pendingEspionage.targetId}
              target={players.find((p) => p.id === pendingEspionage.targetId) ?? otherPlayers[0] ?? viewer}
              mode="progressCards"
              maxPicks={1}
              onConfirm={(picks) => onConfirmEspionage(picks as number[])}
              onCancel={onCancelEspionage}
            />
          </div>
        </div>
      )}
      {pendingTrade && (localPlayerId == null || pendingTrade.toPlayerId === localPlayerId) && (
        <TradeOfferPrompt
          trade={pendingTrade}
          players={players}
          onAccept={() => onResolveTrade(true)}
          onDecline={() => onResolveTrade(false)}
        />
      )}
      {gamePhase === 'discard' && (
        <DiscardPanel
          isMyDiscardTurn={isMyDiscardTurn}
          discardingPlayerName={discardingPlayerName}
          requiredCount={discardRequiredCount}
          selectedCount={discardSelectedCount}
          onConfirm={onConfirmDiscard}
        />
      )}
      {winner && (
        <VictoryBanner
          winner={winner}
          players={players}
          settlements={settlements}
          longestRoadHolderId={longestRoadHolderId}
          largestArmyHolderId={largestArmyHolderId}
          metropolisHolders={metropolisHolders}
          merchantHolderId={merchantHolderId}
          onReturnToMenu={onReturnToMenu}
        />
      )}
    </div>
  )
}
