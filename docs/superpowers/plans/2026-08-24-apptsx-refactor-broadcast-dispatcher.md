# Broadcast Dispatcher Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `useRoomChannel.ts`'s 57 near-identical `broadcastX` functions and 57 near-identical `channel.on<T>` subscriptions down to near-zero duplicated boilerplate, with zero behavior change and zero change to any call site outside this one file.

**Architecture:** Two tiny generic helpers (`send<T>` for the broadcast side, `forwardTo<T>` for the subscription side) that every simple `broadcastX`/`onX` pair delegates its one-line body to. Every function/subscription keeps its own name, signature, and call site — only the *body* shrinks. 3 broadcast-side exceptions and 1 subscription-side exception (both already carrying genuine extra logic) are left completely untouched.

**Tech Stack:** TypeScript, Supabase Realtime channels, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` (Actions → "Broadcast dispatcher" section — this plan implements Sub-plan 1 of that spec's 7-sub-plan Sequencing).

## Global Constraints

- **Zero behavior change.** This is pure mechanical de-duplication. No event name, no payload shape, no call site outside `useRoomChannel.ts` changes.
- **Zero loss of compile-time type safety.** Every event's payload type must still be checked against its handler's parameter type by `tsc` — this is why every `channel.on<T>` call keeps its own explicit generic type argument, and every `broadcastX` function keeps its own typed parameter, rather than collapsing into one untyped dispatch table.
- **Exactly 3 broadcast-side exceptions, left completely untouched, byte-for-byte:**
  1. `broadcastGameStarted` — takes 9 named arguments, not a single payload object.
  2. `broadcastDiceRolled` — keeps its `.then((result) => debugLog(...))` wrapper (a specific stuck-screen bug hunt).
  3. `broadcastDiscardConfirmed` — keeps the identical `.then((result) => debugLog(...))` wrapper for the same bug hunt (its own comment: "See broadcastDiceRolled above — same reasoning, same bug hunt").
- **Exactly 1 subscription-side exception, left completely untouched, byte-for-byte:** `onGameStarted`'s subscription — calls its handler with 9 destructured arguments, not a single payload object.
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before either task is reported done** — this project's own established standing requirement.
- This file has no dedicated test file in this codebase (confirmed: no `useRoomChannel.test.ts` exists) — this is consistent with how Supabase-channel-wiring code is verified elsewhere in this project (type-check + lint + full suite + build), not a gap to fix in this plan.

---

### Task 1: Collapse the 57 `broadcastX` functions

**Files:**
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts:1258-1461` (the entire block of `broadcastX` function declarations, immediately before the hook's `return` statement)

**Interfaces:**
- Produces: `send<T>(event: string, payload: T): void` — a module-scope-shaped helper local to the hook body, used by every simple `broadcastX` function. Not exported; Task 2 does not depend on it.
- Every `broadcastX` function's own name and exported shape (via the hook's `return` object) is unchanged — Task 2 and every external caller are unaffected by this task.

- [ ] **Step 1: Replace the entire broadcast-function block**

Find this exact block in `catan-3d/src/multiplayer/useRoomChannel.ts` (starts right after the presence-tracking `useEffect` closes, ends right before `return {`):

```ts
  const broadcastGameStarted = (
    names: string[],
    hostName: string,
    boardShapeId: BoardShapeId,
    gameRules: GameRules,
    customBoardCells?: BoardCell[],
    customBoardName?: string,
    clientIds?: string[],
    colorTokens?: PlayerColorToken[],
    customBoardBiomeOverrides?: Record<string, Biome>,
  ) => {
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'game-started',
      payload: {
        names,
        hostName,
        boardShapeId,
        gameRules,
        customBoardCells,
        customBoardName,
        clientIds,
        colorTokens,
        customBoardBiomeOverrides,
      },
    })
  }
  const broadcastDiceRolled = (payload: DiceRolledPayload) => {
    // Delivery result logged (not just discarded via `void` like every
    // other broadcast here) — chasing a rare stuck-discard-screen bug that
    // may trace back to a broadcast silently falling back to REST or timing
    // out. See debugLog.ts.
    void channelRef.current
      ?.send({ type: 'broadcast', event: 'DICE_ROLLED', payload })
      .then((result) => debugLog('broadcastDiceRolled result', { result, payload }))
  }
  const broadcastTurnPassed = (payload: TurnPassedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TURN_PASSED', payload })
  }
  const broadcastSettlementBuilt = (payload: SettlementBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SETTLEMENT_BUILT', payload })
  }
  const broadcastCityBuilt = (payload: CityBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'CITY_BUILT', payload })
  }
  const broadcastRoadBuilt = (payload: RoadBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ROAD_BUILT', payload })
  }
  const broadcastShipBuilt = (payload: ShipBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SHIP_BUILT', payload })
  }
  const broadcastShipMoved = (payload: ShipMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SHIP_MOVED', payload })
  }
  const broadcastRobberMoved = (payload: RobberMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ROBBER_MOVED', payload })
  }
  const broadcastPirateMoved = (payload: PirateMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PIRATE_MOVED', payload })
  }
  const broadcastBarbarianShipAdvanced = (payload: BarbarianShipAdvancedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'BARBARIAN_SHIP_ADVANCED', payload })
  }
  const broadcastBarbarianAttackResolved = (payload: BarbarianAttackResolvedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'BARBARIAN_ATTACK_RESOLVED', payload })
  }
  const broadcastPillageResolved = (payload: PillageResolvedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PILLAGE_RESOLVED', payload })
  }
  const broadcastBarbarianWinnerDrawResolved = (payload: BarbarianWinnerDrawResolvedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'BARBARIAN_WINNER_DRAW_RESOLVED', payload })
  }
  const broadcastKnightPlayed = (payload: KnightPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_PLAYED', payload })
  }
  const broadcastRoadBuildingPlayed = (payload: RoadBuildingPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ROAD_BUILDING_PLAYED', payload })
  }
  const broadcastPlentyPlayed = (payload: PlentyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PLENTY_PLAYED', payload })
  }
  const broadcastMonopolyPlayed = (payload: MonopolyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'MONOPOLY_PLAYED', payload })
  }
  const broadcastResourceMonopolyPlayed = (payload: ResourceMonopolyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'RESOURCE_MONOPOLY_PLAYED', payload })
  }
  const broadcastTradeMonopolyPlayed = (payload: TradeMonopolyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_MONOPOLY_PLAYED', payload })
  }
  const broadcastTradeOffered = (payload: TradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_OFFERED', payload })
  }
  const broadcastTradeAcceptRequest = (payload: TradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_ACCEPT_REQUEST', payload })
  }
  const broadcastTradeResolved = (payload: TradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_RESOLVED', payload })
  }
  const broadcastTradeCancelled = (payload: TradeCancelledPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_CANCELLED', payload })
  }
  const broadcastDiscardConfirmed = (payload: DiscardConfirmedPayload) => {
    // See broadcastDiceRolled above — same reasoning, same bug hunt.
    void channelRef.current
      ?.send({ type: 'broadcast', event: 'DISCARD_CONFIRMED', payload })
      .then((result) => debugLog('broadcastDiscardConfirmed result', { result, payload }))
  }
  const broadcastProgressDiscardConfirmed = (payload: ProgressDiscardConfirmedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_DISCARD_CONFIRMED', payload })
  }
  const broadcastScienceFreeResourcePicked = (payload: ScienceFreeResourcePickedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SCIENCE_FREE_RESOURCE_PICKED', payload })
  }
  const broadcastGoldFieldResourcePicked = (payload: GoldFieldResourcePickedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'GOLD_FIELD_RESOURCE_PICKED', payload })
  }
  const broadcastTrophyUpdated = (payload: TrophyUpdatedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TROPHY_UPDATED', payload })
  }
  const broadcastNewGame = (payload: NewGamePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'NEW_GAME', payload })
  }
  const broadcastDevCardBought = (payload: DevCardBoughtPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'DEV_CARD_BOUGHT', payload })
  }
  const broadcastCityImprovementPurchased = (payload: CityImprovementPurchasedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'CITY_IMPROVEMENT_PURCHASED', payload })
  }
  const broadcastProgressCardsDrawn = (payload: ProgressCardsDrawnPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_CARDS_DRAWN', payload })
  }
  const broadcastProgressCardPlayed = (payload: ProgressCardPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_CARD_PLAYED', payload })
  }
  const broadcastMetropolisClaimed = (payload: MetropolisClaimedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'METROPOLIS_CLAIMED', payload })
  }
  const broadcastInventionSwapped = (payload: InventionSwappedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'INVENTION_SWAPPED', payload })
  }
  const broadcastBankTrade = (payload: BankTradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'BANK_TRADE', payload })
  }
  const broadcastCommodityTraded = (payload: CommodityTradedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'COMMODITY_TRADED', payload })
  }
  const broadcastGuildDuesTaken = (payload: GuildDuesTakenPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'GUILD_DUES_TAKEN', payload })
  }
  const broadcastEspionageTaken = (payload: EspionageTakenPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ESPIONAGE_TAKEN', payload })
  }
  const broadcastCommercialHarborPlayed = (payload: CommercialHarborPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'COMMERCIAL_HARBOR_PLAYED', payload })
  }
  const broadcastDiplomacyPlayed = (payload: DiplomacyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'DIPLOMACY_PLAYED', payload })
  }
  const broadcastMerchantMoved = (payload: MerchantMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'MERCHANT_MOVED', payload })
  }
  const broadcastKnightRecruited = (payload: KnightRecruitedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_RECRUITED', payload })
  }
  const broadcastKnightActivated = (payload: KnightActivatedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_ACTIVATED', payload })
  }
  const broadcastKnightPromoted = (payload: KnightPromotedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_PROMOTED', payload })
  }
  const broadcastKnightMoved = (payload: KnightMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_MOVED', payload })
  }
  const broadcastKnightDisplaced = (payload: KnightDisplacedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_DISPLACED', payload })
  }
  const broadcastKnightDeactivatedAfterChase = (payload: KnightDeactivatedAfterChasePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_DEACTIVATED_AFTER_CHASE', payload })
  }
  const broadcastCityWallBuilt = (payload: CityWallBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'CITY_WALL_BUILT', payload })
  }
  const broadcastSmithingPlayed = (payload: SmithingPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SMITHING_PLAYED', payload })
  }
  const broadcastEncouragementPlayed = (payload: EncouragementPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ENCOURAGEMENT_PLAYED', payload })
  }
  const broadcastIntrigueResolved = (payload: IntrigueResolvedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'INTRIGUE_RESOLVED', payload })
  }
  const broadcastTreasonRemoved = (payload: TreasonRemovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TREASON_REMOVED', payload })
  }
  const broadcastTaxationResolved = (payload: TaxationResolvedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TAXATION_RESOLVED', payload })
  }
  const broadcastHoverChanged = (payload: HoverChangedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'HOVER_CHANGED', payload })
  }
  const broadcastChatMessage = (payload: ChatMessagePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'CHAT_MESSAGE', payload })
  }
```

Replace the WHOLE block above with:

```ts
  const broadcastGameStarted = (
    names: string[],
    hostName: string,
    boardShapeId: BoardShapeId,
    gameRules: GameRules,
    customBoardCells?: BoardCell[],
    customBoardName?: string,
    clientIds?: string[],
    colorTokens?: PlayerColorToken[],
    customBoardBiomeOverrides?: Record<string, Biome>,
  ) => {
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'game-started',
      payload: {
        names,
        hostName,
        boardShapeId,
        gameRules,
        customBoardCells,
        customBoardName,
        clientIds,
        colorTokens,
        customBoardBiomeOverrides,
      },
    })
  }
  // Shared by every broadcastX below except broadcastGameStarted (multiple
  // named arguments, not one payload — kept bespoke above),
  // broadcastDiceRolled, and broadcastDiscardConfirmed (both below, both
  // keep a real .then((result) => debugLog(...)) wrapper for a specific
  // stuck-screen bug hunt — see debugLog.ts). Every other broadcastX's
  // body was the identical one-liner this replaces.
  function send<T>(event: string, payload: T) {
    void channelRef.current?.send({ type: 'broadcast', event, payload })
  }
  const broadcastDiceRolled = (payload: DiceRolledPayload) => {
    // Delivery result logged (not just discarded via `void` like every
    // other broadcast here) — chasing a rare stuck-discard-screen bug that
    // may trace back to a broadcast silently falling back to REST or timing
    // out. See debugLog.ts.
    void channelRef.current
      ?.send({ type: 'broadcast', event: 'DICE_ROLLED', payload })
      .then((result) => debugLog('broadcastDiceRolled result', { result, payload }))
  }
  const broadcastTurnPassed = (payload: TurnPassedPayload) => send('TURN_PASSED', payload)
  const broadcastSettlementBuilt = (payload: SettlementBuiltPayload) => send('SETTLEMENT_BUILT', payload)
  const broadcastCityBuilt = (payload: CityBuiltPayload) => send('CITY_BUILT', payload)
  const broadcastRoadBuilt = (payload: RoadBuiltPayload) => send('ROAD_BUILT', payload)
  const broadcastShipBuilt = (payload: ShipBuiltPayload) => send('SHIP_BUILT', payload)
  const broadcastShipMoved = (payload: ShipMovedPayload) => send('SHIP_MOVED', payload)
  const broadcastRobberMoved = (payload: RobberMovedPayload) => send('ROBBER_MOVED', payload)
  const broadcastPirateMoved = (payload: PirateMovedPayload) => send('PIRATE_MOVED', payload)
  const broadcastBarbarianShipAdvanced = (payload: BarbarianShipAdvancedPayload) => send('BARBARIAN_SHIP_ADVANCED', payload)
  const broadcastBarbarianAttackResolved = (payload: BarbarianAttackResolvedPayload) => send('BARBARIAN_ATTACK_RESOLVED', payload)
  const broadcastPillageResolved = (payload: PillageResolvedPayload) => send('PILLAGE_RESOLVED', payload)
  const broadcastBarbarianWinnerDrawResolved = (payload: BarbarianWinnerDrawResolvedPayload) =>
    send('BARBARIAN_WINNER_DRAW_RESOLVED', payload)
  const broadcastKnightPlayed = (payload: KnightPlayedPayload) => send('KNIGHT_PLAYED', payload)
  const broadcastRoadBuildingPlayed = (payload: RoadBuildingPlayedPayload) => send('ROAD_BUILDING_PLAYED', payload)
  const broadcastPlentyPlayed = (payload: PlentyPlayedPayload) => send('PLENTY_PLAYED', payload)
  const broadcastMonopolyPlayed = (payload: MonopolyPlayedPayload) => send('MONOPOLY_PLAYED', payload)
  const broadcastResourceMonopolyPlayed = (payload: ResourceMonopolyPlayedPayload) => send('RESOURCE_MONOPOLY_PLAYED', payload)
  const broadcastTradeMonopolyPlayed = (payload: TradeMonopolyPlayedPayload) => send('TRADE_MONOPOLY_PLAYED', payload)
  const broadcastTradeOffered = (payload: TradePayload) => send('TRADE_OFFERED', payload)
  const broadcastTradeAcceptRequest = (payload: TradePayload) => send('TRADE_ACCEPT_REQUEST', payload)
  const broadcastTradeResolved = (payload: TradePayload) => send('TRADE_RESOLVED', payload)
  const broadcastTradeCancelled = (payload: TradeCancelledPayload) => send('TRADE_CANCELLED', payload)
  const broadcastDiscardConfirmed = (payload: DiscardConfirmedPayload) => {
    // See broadcastDiceRolled above — same reasoning, same bug hunt.
    void channelRef.current
      ?.send({ type: 'broadcast', event: 'DISCARD_CONFIRMED', payload })
      .then((result) => debugLog('broadcastDiscardConfirmed result', { result, payload }))
  }
  const broadcastProgressDiscardConfirmed = (payload: ProgressDiscardConfirmedPayload) =>
    send('PROGRESS_DISCARD_CONFIRMED', payload)
  const broadcastScienceFreeResourcePicked = (payload: ScienceFreeResourcePickedPayload) =>
    send('SCIENCE_FREE_RESOURCE_PICKED', payload)
  const broadcastGoldFieldResourcePicked = (payload: GoldFieldResourcePickedPayload) => send('GOLD_FIELD_RESOURCE_PICKED', payload)
  const broadcastTrophyUpdated = (payload: TrophyUpdatedPayload) => send('TROPHY_UPDATED', payload)
  const broadcastNewGame = (payload: NewGamePayload) => send('NEW_GAME', payload)
  const broadcastDevCardBought = (payload: DevCardBoughtPayload) => send('DEV_CARD_BOUGHT', payload)
  const broadcastCityImprovementPurchased = (payload: CityImprovementPurchasedPayload) =>
    send('CITY_IMPROVEMENT_PURCHASED', payload)
  const broadcastProgressCardsDrawn = (payload: ProgressCardsDrawnPayload) => send('PROGRESS_CARDS_DRAWN', payload)
  const broadcastProgressCardPlayed = (payload: ProgressCardPlayedPayload) => send('PROGRESS_CARD_PLAYED', payload)
  const broadcastMetropolisClaimed = (payload: MetropolisClaimedPayload) => send('METROPOLIS_CLAIMED', payload)
  const broadcastInventionSwapped = (payload: InventionSwappedPayload) => send('INVENTION_SWAPPED', payload)
  const broadcastBankTrade = (payload: BankTradePayload) => send('BANK_TRADE', payload)
  const broadcastCommodityTraded = (payload: CommodityTradedPayload) => send('COMMODITY_TRADED', payload)
  const broadcastGuildDuesTaken = (payload: GuildDuesTakenPayload) => send('GUILD_DUES_TAKEN', payload)
  const broadcastEspionageTaken = (payload: EspionageTakenPayload) => send('ESPIONAGE_TAKEN', payload)
  const broadcastCommercialHarborPlayed = (payload: CommercialHarborPlayedPayload) => send('COMMERCIAL_HARBOR_PLAYED', payload)
  const broadcastDiplomacyPlayed = (payload: DiplomacyPlayedPayload) => send('DIPLOMACY_PLAYED', payload)
  const broadcastMerchantMoved = (payload: MerchantMovedPayload) => send('MERCHANT_MOVED', payload)
  const broadcastKnightRecruited = (payload: KnightRecruitedPayload) => send('KNIGHT_RECRUITED', payload)
  const broadcastKnightActivated = (payload: KnightActivatedPayload) => send('KNIGHT_ACTIVATED', payload)
  const broadcastKnightPromoted = (payload: KnightPromotedPayload) => send('KNIGHT_PROMOTED', payload)
  const broadcastKnightMoved = (payload: KnightMovedPayload) => send('KNIGHT_MOVED', payload)
  const broadcastKnightDisplaced = (payload: KnightDisplacedPayload) => send('KNIGHT_DISPLACED', payload)
  const broadcastKnightDeactivatedAfterChase = (payload: KnightDeactivatedAfterChasePayload) =>
    send('KNIGHT_DEACTIVATED_AFTER_CHASE', payload)
  const broadcastCityWallBuilt = (payload: CityWallBuiltPayload) => send('CITY_WALL_BUILT', payload)
  const broadcastSmithingPlayed = (payload: SmithingPlayedPayload) => send('SMITHING_PLAYED', payload)
  const broadcastEncouragementPlayed = (payload: EncouragementPlayedPayload) => send('ENCOURAGEMENT_PLAYED', payload)
  const broadcastIntrigueResolved = (payload: IntrigueResolvedPayload) => send('INTRIGUE_RESOLVED', payload)
  const broadcastTreasonRemoved = (payload: TreasonRemovedPayload) => send('TREASON_REMOVED', payload)
  const broadcastTaxationResolved = (payload: TaxationResolvedPayload) => send('TAXATION_RESOLVED', payload)
  const broadcastHoverChanged = (payload: HoverChangedPayload) => send('HOVER_CHANGED', payload)
  const broadcastChatMessage = (payload: ChatMessagePayload) => send('CHAT_MESSAGE', payload)
```

- [ ] **Step 2: Verify**

Run: `cd catan-3d && npx tsc -p tsconfig.app.json && npx eslint src/multiplayer/useRoomChannel.ts`
Expected: no errors. This confirms every converted `broadcastX` call still resolves to a correctly-typed `channelRef.current?.send(...)` call — a payload/event mismatch here would be a real `tsc` error, not a silent bug, because `send<T>`'s generic parameter is inferred from each call site's own typed `payload` argument.

Run: `cd catan-3d && npx vitest run`
Expected: full suite passes unchanged (this task changes no game logic, only how a broadcast message gets sent over the wire).

- [ ] **Step 3: Commit**

```bash
git add catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "refactor: collapse 54 of 57 broadcastX functions onto a shared send() helper"
```

---

### Task 2: Collapse the 57 `channel.on<T>` subscriptions

**Files:**
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts:992-1172` (the entire block of `channel.on<T>('broadcast', ...)` subscriptions, inside the channel-setup `useEffect`)

**Interfaces:**
- Consumes: nothing from Task 1 — this task is independent (different lines, different concern: receiving vs. sending).
- Produces: `forwardTo<T>(handlerKey: keyof RoomChannelHandlers): (message: { payload: T }) => void` — a helper local to the hook body, used by every simple subscription. Every subscription's own registered event name and generic type argument is unchanged, so nothing outside this file is affected.

- [ ] **Step 1: Replace the entire subscription block**

Find this exact block in `catan-3d/src/multiplayer/useRoomChannel.ts` (starts right after the presence-sync `channel.on('presence', ...)` call, ends right before `channel.subscribe(...)`):

```ts
    channel.on<GameStartedPayload>('broadcast', { event: 'game-started' }, ({ payload }) => {
      handlersRef.current.onGameStarted?.(
        payload.names,
        payload.hostName,
        payload.boardShapeId,
        payload.gameRules,
        payload.customBoardCells,
        payload.customBoardName,
        payload.clientIds,
        payload.colorTokens,
        payload.customBoardBiomeOverrides,
      )
    })
    channel.on<DiceRolledPayload>('broadcast', { event: 'DICE_ROLLED' }, ({ payload }) => {
      handlersRef.current.onDiceRolled?.(payload)
    })
    channel.on<TurnPassedPayload>('broadcast', { event: 'TURN_PASSED' }, ({ payload }) => {
      handlersRef.current.onTurnPassed?.(payload)
    })
    channel.on<SettlementBuiltPayload>('broadcast', { event: 'SETTLEMENT_BUILT' }, ({ payload }) => {
      handlersRef.current.onSettlementBuilt?.(payload)
    })
    channel.on<CityBuiltPayload>('broadcast', { event: 'CITY_BUILT' }, ({ payload }) => {
      handlersRef.current.onCityBuilt?.(payload)
    })
    channel.on<RoadBuiltPayload>('broadcast', { event: 'ROAD_BUILT' }, ({ payload }) => {
      handlersRef.current.onRoadBuilt?.(payload)
    })
    channel.on<ShipBuiltPayload>('broadcast', { event: 'SHIP_BUILT' }, ({ payload }) => {
      handlersRef.current.onShipBuilt?.(payload)
    })
    channel.on<ShipMovedPayload>('broadcast', { event: 'SHIP_MOVED' }, ({ payload }) => {
      handlersRef.current.onShipMoved?.(payload)
    })
    channel.on<RobberMovedPayload>('broadcast', { event: 'ROBBER_MOVED' }, ({ payload }) => {
      handlersRef.current.onRobberMoved?.(payload)
    })
    channel.on<PirateMovedPayload>('broadcast', { event: 'PIRATE_MOVED' }, ({ payload }) => {
      handlersRef.current.onPirateMoved?.(payload)
    })
    channel.on<BarbarianShipAdvancedPayload>('broadcast', { event: 'BARBARIAN_SHIP_ADVANCED' }, ({ payload }) => {
      handlersRef.current.onBarbarianShipAdvanced?.(payload)
    })
    channel.on<BarbarianAttackResolvedPayload>('broadcast', { event: 'BARBARIAN_ATTACK_RESOLVED' }, ({ payload }) => {
      handlersRef.current.onBarbarianAttackResolved?.(payload)
    })
    channel.on<PillageResolvedPayload>('broadcast', { event: 'PILLAGE_RESOLVED' }, ({ payload }) => {
      handlersRef.current.onPillageResolved?.(payload)
    })
    channel.on<BarbarianWinnerDrawResolvedPayload>('broadcast', { event: 'BARBARIAN_WINNER_DRAW_RESOLVED' }, ({ payload }) => {
      handlersRef.current.onBarbarianWinnerDrawResolved?.(payload)
    })
    channel.on<KnightPlayedPayload>('broadcast', { event: 'KNIGHT_PLAYED' }, ({ payload }) => {
      handlersRef.current.onKnightPlayed?.(payload)
    })
    channel.on<RoadBuildingPlayedPayload>('broadcast', { event: 'ROAD_BUILDING_PLAYED' }, ({ payload }) => {
      handlersRef.current.onRoadBuildingPlayed?.(payload)
    })
    channel.on<PlentyPlayedPayload>('broadcast', { event: 'PLENTY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onPlentyPlayed?.(payload)
    })
    channel.on<MonopolyPlayedPayload>('broadcast', { event: 'MONOPOLY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onMonopolyPlayed?.(payload)
    })
    channel.on<ResourceMonopolyPlayedPayload>('broadcast', { event: 'RESOURCE_MONOPOLY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onResourceMonopolyPlayed?.(payload)
    })
    channel.on<TradeMonopolyPlayedPayload>('broadcast', { event: 'TRADE_MONOPOLY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onTradeMonopolyPlayed?.(payload)
    })
    channel.on<TradePayload>('broadcast', { event: 'TRADE_OFFERED' }, ({ payload }) => {
      handlersRef.current.onTradeOffered?.(payload)
    })
    channel.on<TradePayload>('broadcast', { event: 'TRADE_ACCEPT_REQUEST' }, ({ payload }) => {
      handlersRef.current.onTradeAcceptRequest?.(payload)
    })
    channel.on<TradePayload>('broadcast', { event: 'TRADE_RESOLVED' }, ({ payload }) => {
      handlersRef.current.onTradeResolved?.(payload)
    })
    channel.on<TradeCancelledPayload>('broadcast', { event: 'TRADE_CANCELLED' }, ({ payload }) => {
      handlersRef.current.onTradeCancelled?.(payload)
    })
    channel.on<DiscardConfirmedPayload>('broadcast', { event: 'DISCARD_CONFIRMED' }, ({ payload }) => {
      handlersRef.current.onDiscardConfirmed?.(payload)
    })
    channel.on<ProgressDiscardConfirmedPayload>('broadcast', { event: 'PROGRESS_DISCARD_CONFIRMED' }, ({ payload }) => {
      handlersRef.current.onProgressDiscardConfirmed?.(payload)
    })
    channel.on<ScienceFreeResourcePickedPayload>('broadcast', { event: 'SCIENCE_FREE_RESOURCE_PICKED' }, ({ payload }) => {
      handlersRef.current.onScienceFreeResourcePicked?.(payload)
    })
    channel.on<GoldFieldResourcePickedPayload>('broadcast', { event: 'GOLD_FIELD_RESOURCE_PICKED' }, ({ payload }) => {
      handlersRef.current.onGoldFieldResourcePicked?.(payload)
    })
    channel.on<TrophyUpdatedPayload>('broadcast', { event: 'TROPHY_UPDATED' }, ({ payload }) => {
      handlersRef.current.onTrophyUpdated?.(payload)
    })
    channel.on<NewGamePayload>('broadcast', { event: 'NEW_GAME' }, ({ payload }) => {
      handlersRef.current.onNewGame?.(payload)
    })
    channel.on<DevCardBoughtPayload>('broadcast', { event: 'DEV_CARD_BOUGHT' }, ({ payload }) => {
      handlersRef.current.onDevCardBought?.(payload)
    })
    channel.on<CityImprovementPurchasedPayload>('broadcast', { event: 'CITY_IMPROVEMENT_PURCHASED' }, ({ payload }) => {
      handlersRef.current.onCityImprovementPurchased?.(payload)
    })
    channel.on<ProgressCardsDrawnPayload>('broadcast', { event: 'PROGRESS_CARDS_DRAWN' }, ({ payload }) => {
      handlersRef.current.onProgressCardsDrawn?.(payload)
    })
    channel.on<ProgressCardPlayedPayload>('broadcast', { event: 'PROGRESS_CARD_PLAYED' }, ({ payload }) => {
      handlersRef.current.onProgressCardPlayed?.(payload)
    })
    channel.on<MetropolisClaimedPayload>('broadcast', { event: 'METROPOLIS_CLAIMED' }, ({ payload }) => {
      handlersRef.current.onMetropolisClaimed?.(payload)
    })
    channel.on<InventionSwappedPayload>('broadcast', { event: 'INVENTION_SWAPPED' }, ({ payload }) => {
      handlersRef.current.onInventionSwapped?.(payload)
    })
    channel.on<BankTradePayload>('broadcast', { event: 'BANK_TRADE' }, ({ payload }) => {
      handlersRef.current.onBankTrade?.(payload)
    })
    channel.on<CommodityTradedPayload>('broadcast', { event: 'COMMODITY_TRADED' }, ({ payload }) => {
      handlersRef.current.onCommodityTraded?.(payload)
    })
    channel.on<GuildDuesTakenPayload>('broadcast', { event: 'GUILD_DUES_TAKEN' }, ({ payload }) => {
      handlersRef.current.onGuildDuesTaken?.(payload)
    })
    channel.on<EspionageTakenPayload>('broadcast', { event: 'ESPIONAGE_TAKEN' }, ({ payload }) => {
      handlersRef.current.onEspionageTaken?.(payload)
    })
    channel.on<CommercialHarborPlayedPayload>('broadcast', { event: 'COMMERCIAL_HARBOR_PLAYED' }, ({ payload }) => {
      handlersRef.current.onCommercialHarborPlayed?.(payload)
    })
    channel.on<DiplomacyPlayedPayload>('broadcast', { event: 'DIPLOMACY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onDiplomacyPlayed?.(payload)
    })
    channel.on<MerchantMovedPayload>('broadcast', { event: 'MERCHANT_MOVED' }, ({ payload }) => {
      handlersRef.current.onMerchantMoved?.(payload)
    })
    channel.on<KnightRecruitedPayload>('broadcast', { event: 'KNIGHT_RECRUITED' }, ({ payload }) => {
      handlersRef.current.onKnightRecruited?.(payload)
    })
    channel.on<KnightActivatedPayload>('broadcast', { event: 'KNIGHT_ACTIVATED' }, ({ payload }) => {
      handlersRef.current.onKnightActivated?.(payload)
    })
    channel.on<KnightPromotedPayload>('broadcast', { event: 'KNIGHT_PROMOTED' }, ({ payload }) => {
      handlersRef.current.onKnightPromoted?.(payload)
    })
    channel.on<KnightMovedPayload>('broadcast', { event: 'KNIGHT_MOVED' }, ({ payload }) => {
      handlersRef.current.onKnightMoved?.(payload)
    })
    channel.on<KnightDisplacedPayload>('broadcast', { event: 'KNIGHT_DISPLACED' }, ({ payload }) => {
      handlersRef.current.onKnightDisplaced?.(payload)
    })
    channel.on<KnightDeactivatedAfterChasePayload>('broadcast', { event: 'KNIGHT_DEACTIVATED_AFTER_CHASE' }, ({ payload }) => {
      handlersRef.current.onKnightDeactivatedAfterChase?.(payload)
    })
    channel.on<CityWallBuiltPayload>('broadcast', { event: 'CITY_WALL_BUILT' }, ({ payload }) => {
      handlersRef.current.onCityWallBuilt?.(payload)
    })
    channel.on<SmithingPlayedPayload>('broadcast', { event: 'SMITHING_PLAYED' }, ({ payload }) => {
      handlersRef.current.onSmithingPlayed?.(payload)
    })
    channel.on<EncouragementPlayedPayload>('broadcast', { event: 'ENCOURAGEMENT_PLAYED' }, ({ payload }) => {
      handlersRef.current.onEncouragementPlayed?.(payload)
    })
    channel.on<IntrigueResolvedPayload>('broadcast', { event: 'INTRIGUE_RESOLVED' }, ({ payload }) => {
      handlersRef.current.onIntrigueResolved?.(payload)
    })
    channel.on<TreasonRemovedPayload>('broadcast', { event: 'TREASON_REMOVED' }, ({ payload }) => {
      handlersRef.current.onTreasonRemoved?.(payload)
    })
    channel.on<TaxationResolvedPayload>('broadcast', { event: 'TAXATION_RESOLVED' }, ({ payload }) => {
      handlersRef.current.onTaxationResolved?.(payload)
    })
    channel.on<HoverChangedPayload>('broadcast', { event: 'HOVER_CHANGED' }, ({ payload }) => {
      handlersRef.current.onHoverChanged?.(payload)
    })
    channel.on<ChatMessagePayload>('broadcast', { event: 'CHAT_MESSAGE' }, ({ payload }) => {
      handlersRef.current.onChatMessage?.(payload)
    })
```

Replace the WHOLE block above with:

```ts
    channel.on<GameStartedPayload>('broadcast', { event: 'game-started' }, ({ payload }) => {
      handlersRef.current.onGameStarted?.(
        payload.names,
        payload.hostName,
        payload.boardShapeId,
        payload.gameRules,
        payload.customBoardCells,
        payload.customBoardName,
        payload.clientIds,
        payload.colorTokens,
        payload.customBoardBiomeOverrides,
      )
    })
    // Shared by every subscription below except onGameStarted above (its
    // handler takes 9 destructured arguments, not one payload — kept
    // bespoke). Every other subscription's body was the identical
    // one-liner this replaces: forward the received payload straight to
    // the matching handler, if the caller supplied one.
    function forwardTo<T>(handlerKey: keyof RoomChannelHandlers) {
      return ({ payload }: { payload: T }) => {
        ;(handlersRef.current[handlerKey] as ((p: T) => void) | undefined)?.(payload)
      }
    }
    // POST-MERGE CORRECTION (found by this sub-plan's own final whole-branch
    // review, fixed in commit 738a070 — kept here as an accurate historical
    // record rather than silently rewritten): the signature above lets T be
    // inferred solely from the calling channel.on<T>'s own generic argument,
    // with no actual link to handlerKey, so a real mismatch (e.g.
    // forwardTo('onChatMessage') under a DiceRolledPayload subscription)
    // silently compiled. The shipped, correct version is:
    //   function forwardTo<K extends keyof RoomChannelHandlers>(handlerKey: K) {
    //     type P = Parameters<NonNullable<RoomChannelHandlers[K]>>[0]
    //     return ({ payload }: { payload: P }) => {
    //       ;(handlersRef.current[handlerKey] as ((p: P) => void) | undefined)?.(payload)
    //     }
    //   }
    // This ties the inferred type to the actual handler K refers to, independent
    // of the outer call's own generic — proven via a live repro during the final
    // review (commit 738a070's message has the full reasoning; the fix itself
    // is what's live in useRoomChannel.ts).
    channel.on<DiceRolledPayload>('broadcast', { event: 'DICE_ROLLED' }, forwardTo('onDiceRolled'))
    channel.on<TurnPassedPayload>('broadcast', { event: 'TURN_PASSED' }, forwardTo('onTurnPassed'))
    channel.on<SettlementBuiltPayload>('broadcast', { event: 'SETTLEMENT_BUILT' }, forwardTo('onSettlementBuilt'))
    channel.on<CityBuiltPayload>('broadcast', { event: 'CITY_BUILT' }, forwardTo('onCityBuilt'))
    channel.on<RoadBuiltPayload>('broadcast', { event: 'ROAD_BUILT' }, forwardTo('onRoadBuilt'))
    channel.on<ShipBuiltPayload>('broadcast', { event: 'SHIP_BUILT' }, forwardTo('onShipBuilt'))
    channel.on<ShipMovedPayload>('broadcast', { event: 'SHIP_MOVED' }, forwardTo('onShipMoved'))
    channel.on<RobberMovedPayload>('broadcast', { event: 'ROBBER_MOVED' }, forwardTo('onRobberMoved'))
    channel.on<PirateMovedPayload>('broadcast', { event: 'PIRATE_MOVED' }, forwardTo('onPirateMoved'))
    channel.on<BarbarianShipAdvancedPayload>('broadcast', { event: 'BARBARIAN_SHIP_ADVANCED' }, forwardTo('onBarbarianShipAdvanced'))
    channel.on<BarbarianAttackResolvedPayload>(
      'broadcast',
      { event: 'BARBARIAN_ATTACK_RESOLVED' },
      forwardTo('onBarbarianAttackResolved'),
    )
    channel.on<PillageResolvedPayload>('broadcast', { event: 'PILLAGE_RESOLVED' }, forwardTo('onPillageResolved'))
    channel.on<BarbarianWinnerDrawResolvedPayload>(
      'broadcast',
      { event: 'BARBARIAN_WINNER_DRAW_RESOLVED' },
      forwardTo('onBarbarianWinnerDrawResolved'),
    )
    channel.on<KnightPlayedPayload>('broadcast', { event: 'KNIGHT_PLAYED' }, forwardTo('onKnightPlayed'))
    channel.on<RoadBuildingPlayedPayload>('broadcast', { event: 'ROAD_BUILDING_PLAYED' }, forwardTo('onRoadBuildingPlayed'))
    channel.on<PlentyPlayedPayload>('broadcast', { event: 'PLENTY_PLAYED' }, forwardTo('onPlentyPlayed'))
    channel.on<MonopolyPlayedPayload>('broadcast', { event: 'MONOPOLY_PLAYED' }, forwardTo('onMonopolyPlayed'))
    channel.on<ResourceMonopolyPlayedPayload>(
      'broadcast',
      { event: 'RESOURCE_MONOPOLY_PLAYED' },
      forwardTo('onResourceMonopolyPlayed'),
    )
    channel.on<TradeMonopolyPlayedPayload>('broadcast', { event: 'TRADE_MONOPOLY_PLAYED' }, forwardTo('onTradeMonopolyPlayed'))
    channel.on<TradePayload>('broadcast', { event: 'TRADE_OFFERED' }, forwardTo('onTradeOffered'))
    channel.on<TradePayload>('broadcast', { event: 'TRADE_ACCEPT_REQUEST' }, forwardTo('onTradeAcceptRequest'))
    channel.on<TradePayload>('broadcast', { event: 'TRADE_RESOLVED' }, forwardTo('onTradeResolved'))
    channel.on<TradeCancelledPayload>('broadcast', { event: 'TRADE_CANCELLED' }, forwardTo('onTradeCancelled'))
    channel.on<DiscardConfirmedPayload>('broadcast', { event: 'DISCARD_CONFIRMED' }, forwardTo('onDiscardConfirmed'))
    channel.on<ProgressDiscardConfirmedPayload>(
      'broadcast',
      { event: 'PROGRESS_DISCARD_CONFIRMED' },
      forwardTo('onProgressDiscardConfirmed'),
    )
    channel.on<ScienceFreeResourcePickedPayload>(
      'broadcast',
      { event: 'SCIENCE_FREE_RESOURCE_PICKED' },
      forwardTo('onScienceFreeResourcePicked'),
    )
    channel.on<GoldFieldResourcePickedPayload>(
      'broadcast',
      { event: 'GOLD_FIELD_RESOURCE_PICKED' },
      forwardTo('onGoldFieldResourcePicked'),
    )
    channel.on<TrophyUpdatedPayload>('broadcast', { event: 'TROPHY_UPDATED' }, forwardTo('onTrophyUpdated'))
    channel.on<NewGamePayload>('broadcast', { event: 'NEW_GAME' }, forwardTo('onNewGame'))
    channel.on<DevCardBoughtPayload>('broadcast', { event: 'DEV_CARD_BOUGHT' }, forwardTo('onDevCardBought'))
    channel.on<CityImprovementPurchasedPayload>(
      'broadcast',
      { event: 'CITY_IMPROVEMENT_PURCHASED' },
      forwardTo('onCityImprovementPurchased'),
    )
    channel.on<ProgressCardsDrawnPayload>('broadcast', { event: 'PROGRESS_CARDS_DRAWN' }, forwardTo('onProgressCardsDrawn'))
    channel.on<ProgressCardPlayedPayload>('broadcast', { event: 'PROGRESS_CARD_PLAYED' }, forwardTo('onProgressCardPlayed'))
    channel.on<MetropolisClaimedPayload>('broadcast', { event: 'METROPOLIS_CLAIMED' }, forwardTo('onMetropolisClaimed'))
    channel.on<InventionSwappedPayload>('broadcast', { event: 'INVENTION_SWAPPED' }, forwardTo('onInventionSwapped'))
    channel.on<BankTradePayload>('broadcast', { event: 'BANK_TRADE' }, forwardTo('onBankTrade'))
    channel.on<CommodityTradedPayload>('broadcast', { event: 'COMMODITY_TRADED' }, forwardTo('onCommodityTraded'))
    channel.on<GuildDuesTakenPayload>('broadcast', { event: 'GUILD_DUES_TAKEN' }, forwardTo('onGuildDuesTaken'))
    channel.on<EspionageTakenPayload>('broadcast', { event: 'ESPIONAGE_TAKEN' }, forwardTo('onEspionageTaken'))
    channel.on<CommercialHarborPlayedPayload>(
      'broadcast',
      { event: 'COMMERCIAL_HARBOR_PLAYED' },
      forwardTo('onCommercialHarborPlayed'),
    )
    channel.on<DiplomacyPlayedPayload>('broadcast', { event: 'DIPLOMACY_PLAYED' }, forwardTo('onDiplomacyPlayed'))
    channel.on<MerchantMovedPayload>('broadcast', { event: 'MERCHANT_MOVED' }, forwardTo('onMerchantMoved'))
    channel.on<KnightRecruitedPayload>('broadcast', { event: 'KNIGHT_RECRUITED' }, forwardTo('onKnightRecruited'))
    channel.on<KnightActivatedPayload>('broadcast', { event: 'KNIGHT_ACTIVATED' }, forwardTo('onKnightActivated'))
    channel.on<KnightPromotedPayload>('broadcast', { event: 'KNIGHT_PROMOTED' }, forwardTo('onKnightPromoted'))
    channel.on<KnightMovedPayload>('broadcast', { event: 'KNIGHT_MOVED' }, forwardTo('onKnightMoved'))
    channel.on<KnightDisplacedPayload>('broadcast', { event: 'KNIGHT_DISPLACED' }, forwardTo('onKnightDisplaced'))
    channel.on<KnightDeactivatedAfterChasePayload>(
      'broadcast',
      { event: 'KNIGHT_DEACTIVATED_AFTER_CHASE' },
      forwardTo('onKnightDeactivatedAfterChase'),
    )
    channel.on<CityWallBuiltPayload>('broadcast', { event: 'CITY_WALL_BUILT' }, forwardTo('onCityWallBuilt'))
    channel.on<SmithingPlayedPayload>('broadcast', { event: 'SMITHING_PLAYED' }, forwardTo('onSmithingPlayed'))
    channel.on<EncouragementPlayedPayload>('broadcast', { event: 'ENCOURAGEMENT_PLAYED' }, forwardTo('onEncouragementPlayed'))
    channel.on<IntrigueResolvedPayload>('broadcast', { event: 'INTRIGUE_RESOLVED' }, forwardTo('onIntrigueResolved'))
    channel.on<TreasonRemovedPayload>('broadcast', { event: 'TREASON_REMOVED' }, forwardTo('onTreasonRemoved'))
    channel.on<TaxationResolvedPayload>('broadcast', { event: 'TAXATION_RESOLVED' }, forwardTo('onTaxationResolved'))
    channel.on<HoverChangedPayload>('broadcast', { event: 'HOVER_CHANGED' }, forwardTo('onHoverChanged'))
    channel.on<ChatMessagePayload>('broadcast', { event: 'CHAT_MESSAGE' }, forwardTo('onChatMessage'))
```

- [ ] **Step 2: Verify**

Run: `cd catan-3d && npx tsc -p tsconfig.app.json && npx eslint src/multiplayer/useRoomChannel.ts`
Expected: no errors. `forwardTo<T>`'s return type must satisfy the exact callback shape `channel.on<T>('broadcast', {event}, callback)` expects — a real type mismatch here (e.g. `forwardTo`'s inferred `T` not matching the `channel.on<T>` call's own explicit generic argument) is a compile error, not a silent bug.

Run: `cd catan-3d && npx vitest run`
Expected: full suite passes unchanged.

- [ ] **Step 3: Commit**

```bash
git add catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "refactor: collapse 56 of 57 channel.on subscriptions onto a shared forwardTo() helper"
```

---

### Task 3: Automated exception-count self-check, then full verification

**Files:**
- No file changes — this task only verifies Tasks 1-2's output.

**Interfaces:**
- Consumes: the final state of `catan-3d/src/multiplayer/useRoomChannel.ts` from Tasks 1-2.

This task exists because the ORIGINAL design pass for this spec sampled the file instead of checking it exhaustively, and missed a real second exception (`broadcastDiscardConfirmed`'s debugLog wrapper) — caught only by re-running the same style of check against every match, not a sample, right before this plan was written. Re-run that exact technique here as a mechanical proof the two collapsed blocks are complete and correct, not just "looks right."

- [ ] **Step 1: Confirm exactly 3 broadcast-side exceptions remain, byte-identical to the originals**

Run:
```bash
cd catan-3d && awk '
/^  const broadcast[A-Za-z]+ = / { capture=1; block=""; }
capture { block = block $0 "\n" }
capture && /^  }$/ {
  n = gsub(/\n/, "\n", block)
  if (n > 2) print block "---"
  capture=0
}
' src/multiplayer/useRoomChannel.ts
```
Expected: exactly 3 blocks printed — `broadcastGameStarted` (multi-argument), `broadcastDiceRolled` (debugLog wrapper), `broadcastDiscardConfirmed` (debugLog wrapper). If a 4th block appears, or one of these 3 is missing, STOP — a real exception was collapsed incorrectly or a new one wasn't accounted for. Report this to the task reviewer as a concrete finding rather than fixing it silently, since it means this plan's own Step 1 transcription in Task 1 or Task 2 diverged from the actual original file.

- [ ] **Step 2: Confirm exactly 1 subscription-side exception remains, byte-identical to the original**

Run:
```bash
cd catan-3d && awk '
/channel\.on</ { capture=1; block=""; }
capture { block = block $0 "\n" }
capture && /^\s*}\)$/ {
  n = gsub(/\n/, "\n", block)
  if (n > 3) print block "---"
  capture=0
}
' src/multiplayer/useRoomChannel.ts
```
Expected: exactly 1 block printed — `onGameStarted`'s subscription (the 9-argument handler call). If anything else appears, or this one is missing, STOP for the same reason as Step 1.

**POST-MERGE CORRECTION (found while actually executing this task, kept here as an accurate historical record):** the Step 1 script above has a real false-positive bug. Its capture loop assumes every matched block ends with a standalone `}` line — true for multi-line functions, but a single-line arrow function (the correct, intended shape for every collapsed `broadcastX`) has no closing-brace line of its own. If such a function happens to be the LAST one before unrelated code (here, `broadcastChatMessage` immediately before `return {`), the script has no next `const broadcast` line to trigger a reset, so it keeps consuming lines until it hits the return statement's own closing brace — reporting a 4th, phantom "exception" that isn't real. This was caught live by the implementer, who correctly stopped and escalated instead of guessing. Content-based checks are the reliable alternative and were used instead: confirm `debugLog(` appears exactly twice within the broadcast-function region (the two real debug-wrapped exceptions), and confirm `broadcastGameStarted`'s multi-argument body is intact — e.g. `sed -n '<broadcast-region-start>,<broadcast-region-end>p' src/multiplayer/useRoomChannel.ts | grep -n "debugLog("`. The equivalent Step 2 script (subscription side) was not exercised against this same failure mode in practice, but shares the identical structural assumption and should be treated with the same caution — prefer a content-based check (e.g. grep for `payload.customBoardBiomeOverrides,`, the unique string only `onGameStarted`'s handler call contains) over trusting the line-boundary script's raw block count.

- [ ] **Step 3: Full verification**

Run: `cd catan-3d && npx tsc -p tsconfig.app.json && npx eslint src && npx vitest run && npm run build`
Expected: no errors, full suite passing (417/417 or whatever the current count is — confirm it matches the count from immediately before Task 1 started, since this task changes zero game logic), build succeeds.

- [ ] **Step 4: Report**

No commit for this task (nothing to change) — report the two self-check results (exception counts + which functions/subscriptions they matched) and the full verification results in the task's own report file, so the task reviewer can independently confirm both checks without re-deriving them.

## Testing

No new automated tests are added — this codebase has no existing test file for `useRoomChannel.ts`'s broadcast/subscription wiring (confirmed: no `useRoomChannel.test.ts` exists), consistent with how this class of Supabase-channel-wiring code is verified elsewhere in the project (type-check + lint + full suite + build, not unit tests of the wiring itself). Task 3's exhaustive self-check scripts are the closest equivalent to a regression test for this specific change, and are included as an explicit plan step rather than left to reviewer judgment.
