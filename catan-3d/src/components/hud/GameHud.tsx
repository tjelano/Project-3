import { useState } from 'react'
import type { BannerMessage, DevCardPickerMode, GamePhase, SetupStage } from '../../App'
import type { Building, DevCardType, Player, ResourceType } from '../../game/types'
import { TopBar } from './TopBar'
import { ResourcePanel } from './ResourcePanel'
import { RollDiceButton } from './RollDiceButton'
import { EventBanner } from './EventBanner'
import { TradeModal } from './TradeModal'
import { VictoryBanner } from './VictoryBanner'
import { BuildingCostsPanel } from './BuildingCostsPanel'
import { TradeOfferPrompt, type PendingTrade } from './TradeOfferPrompt'
import { DevCardResourcePicker } from './DevCardResourcePicker'
import { RankingsPanel } from './RankingsPanel'

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
  gamePhase: GamePhase
  setupStage: SetupStage
  banner: BannerMessage | null
  onRestart: () => void
  portRates: Record<ResourceType, number>
  onTrade: (give: ResourceType, receive: ResourceType) => void
  isRolling: boolean
  devDeckCount: number
  onBuyDevCard: () => void
  winner: Player | null
  settlements: Record<string, Building>
  onReturnToMenu: () => void
  pendingTrade: PendingTrade | null
  onProposeTrade: (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => void
  onResolveTrade: (accept: boolean) => void
  onPlayDevCard: (type: DevCardType) => void
  devCardPicker: DevCardPickerMode | null
  onResolveDevCardPicker: (picks: ResourceType[]) => void
  devCardPlayedThisTurn: boolean
  longestRoadHolderId: number | null
  longestRoadLengths: Map<number, number>
  largestArmyHolderId: number | null
}

export function GameHud({
  players,
  currentPlayerIndex,
  isMyTurn,
  lastRoll,
  onRollDice,
  gamePhase,
  setupStage,
  banner,
  onRestart,
  portRates,
  onTrade,
  isRolling,
  devDeckCount,
  onBuyDevCard,
  winner,
  settlements,
  onReturnToMenu,
  pendingTrade,
  onProposeTrade,
  onResolveTrade,
  onPlayDevCard,
  devCardPicker,
  onResolveDevCardPicker,
  devCardPlayedThisTurn,
  longestRoadHolderId,
  longestRoadLengths,
  largestArmyHolderId,
}: GameHudProps) {
  const [isTradeOpen, setIsTradeOpen] = useState(false)
  const currentPlayer = players[currentPlayerIndex]
  const otherPlayers = players.filter((p) => p.id !== currentPlayer.id)
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
      />
      <EventBanner banner={banner} />
      <BuildingCostsPanel />
      <RankingsPanel
        players={players}
        settlements={settlements}
        currentPlayerId={currentPlayer.id}
        longestRoadHolderId={longestRoadHolderId}
        longestRoadLengths={longestRoadLengths}
        largestArmyHolderId={largestArmyHolderId}
      />
      <ResourcePanel
        resources={currentPlayer.resources}
        canTrade={canTrade}
        onOpenTrade={() => setIsTradeOpen(true)}
        devCards={currentPlayer.devCards}
        devCardsBoughtThisTurn={currentPlayer.devCardsBoughtThisTurn}
        knightsPlayed={currentPlayer.knightsPlayed}
        canBuyDevCard={canBuyDevCard}
        onBuyDevCard={onBuyDevCard}
        canPlayDevCards={canPlayDevCards}
        onPlayDevCard={onPlayDevCard}
      />
      {isTradeOpen && canTrade && (
        <TradeModal
          resources={currentPlayer.resources}
          rates={portRates}
          onTrade={(give, receive) => onTrade(give, receive)}
          otherPlayers={otherPlayers}
          onProposeTrade={onProposeTrade}
          onClose={() => setIsTradeOpen(false)}
        />
      )}
      <RollDiceButton
        lastRoll={lastRoll}
        onRoll={onRollDice}
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
      {pendingTrade && (
        <TradeOfferPrompt
          trade={pendingTrade}
          players={players}
          onAccept={() => onResolveTrade(true)}
          onDecline={() => onResolveTrade(false)}
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
