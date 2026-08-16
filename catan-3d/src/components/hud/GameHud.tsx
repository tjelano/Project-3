import { useState } from 'react'
import type { BannerMessage, DevCardPickerMode, EventLogEntry, GamePhase, SetupStage } from '../../App'
import type { Building, DevCardType, Player, ResourceType } from '../../game/types'
import type { ChatMessagePayload } from '../../multiplayer/useRoomChannel'
import { TopBar } from './TopBar'
import { ResourcePanel } from './ResourcePanel'
import { RollDiceButton } from './RollDiceButton'
import { EventBanner } from './EventBanner'
import { EventLogPanel } from './EventLogPanel'
import { ChatBoxPanel } from './ChatBoxPanel'
import { TradeModal } from './TradeModal'
import { VictoryBanner } from './VictoryBanner'
import { BuildingCostsPanel } from './BuildingCostsPanel'
import { TradeOfferPrompt, type PendingTrade } from './TradeOfferPrompt'
import { DevCardResourcePicker } from './DevCardResourcePicker'
import { RankingsPanel } from './RankingsPanel'
import { DiscardPanel } from './DiscardPanel'
import { RoomCodeTag } from './RoomCodeTag'

const DEV_CARD_PICKER_COPY: Record<DevCardPickerMode, { title: string; subtitle: string; pickCount: number }> = {
  yearOfPlenty: { title: 'Year of Plenty', subtitle: 'Choose 2 resources to take from the bank.', pickCount: 2 },
  monopoly: { title: 'Monopoly', subtitle: 'Choose 1 resource type to seize from every opponent.', pickCount: 1 },
}

interface GameHudProps {
  players: Player[]
  currentPlayerIndex: number
  // Always true for local Pass & Play. For Online Multiplayer, true only on
  // the browser whose seat currently holds the turn — everyone else's
  // action buttons stay locked until they hear a TURN_PASSED broadcast.
  isMyTurn: boolean
  lastRoll: number | null
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
  devCardPlayedThisTurn: boolean
  longestRoadHolderId: number | null
  longestRoadLengths: Map<number, number>
  largestArmyHolderId: number | null
  // Cities & Knights house rule — whether commodity cards count toward the
  // "cards in hand" discard-risk total shown in ResourcePanel. Passed as a
  // plain boolean (not the whole GameRules object) since that's the only
  // piece a display component like ResourcePanel needs.
  citiesAndKnightsCommodities: boolean
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
  devCardPlayedThisTurn,
  longestRoadHolderId,
  longestRoadLengths,
  largestArmyHolderId,
  citiesAndKnightsCommodities,
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
  const currentPlayer = players[currentPlayerIndex]
  const viewer = players.find((p) => p.id === viewerPlayerId) ?? currentPlayer
  const otherPlayers = players.filter((p) => p.id !== viewer.id)
  const gameActive = !winner
  const tradeBlocked = !!pendingTrade
  const pickerBlocked = !!devCardPicker
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
        />
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
      {devCardPicker && (
        <DevCardResourcePicker
          title={DEV_CARD_PICKER_COPY[devCardPicker].title}
          subtitle={DEV_CARD_PICKER_COPY[devCardPicker].subtitle}
          pickCount={DEV_CARD_PICKER_COPY[devCardPicker].pickCount}
          onComplete={onResolveDevCardPicker}
        />
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
          onReturnToMenu={onReturnToMenu}
        />
      )}
    </div>
  )
}
