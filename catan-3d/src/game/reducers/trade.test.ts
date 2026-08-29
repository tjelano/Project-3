import { describe, expect, it } from 'vitest'
import { reduceTrade, initialTradeState } from './trade'
import { initialGameState } from '../gameState'
import type { PendingTrade } from '../../components/hud/TradeOfferPrompt'

const OFFER: PendingTrade = { fromPlayerId: 1, toPlayerId: 2, offerCard: 'brick', wantCard: 'grain' }

describe('reduceTrade — PENDING_TRADE_SET', () => {
  it('stores the offered trade, leaves every other field untouched', () => {
    const result = reduceTrade(initialTradeState, { type: 'PENDING_TRADE_SET', trade: OFFER }, initialGameState)
    expect(result).toEqual({ ...initialTradeState, pendingTrade: OFFER })
  })

  it('replaces an already-pending offer rather than merging with it', () => {
    const dirty = { ...initialTradeState, pendingTrade: OFFER }
    const next: PendingTrade = { fromPlayerId: 3, toPlayerId: 1, offerCard: 'ore', wantCard: 'wool' }
    const result = reduceTrade(dirty, { type: 'PENDING_TRADE_SET', trade: next }, initialGameState)
    expect(result.pendingTrade).toBe(next)
  })
})

describe('reduceTrade — PENDING_TRADE_CLEARED', () => {
  it('clears pendingTrade to null', () => {
    const dirty = { ...initialTradeState, pendingTrade: OFFER }
    const result = reduceTrade(dirty, { type: 'PENDING_TRADE_CLEARED' }, initialGameState)
    expect(result).toEqual({ ...initialTradeState, pendingTrade: null })
  })

  it('is a no-op shape-wise when nothing was pending', () => {
    const result = reduceTrade(initialTradeState, { type: 'PENDING_TRADE_CLEARED' }, initialGameState)
    expect(result.pendingTrade).toBeNull()
  })
})

describe('reduceTrade — TURN_ADVANCED', () => {
  it('leaves a pending offer alone — a trade offer is deliberately NOT turn-scoped', () => {
    const dirty = { ...initialTradeState, pendingTrade: OFFER }
    const result = reduceTrade(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toBe(dirty)
  })
})

describe('reduceTrade — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceTrade(initialTradeState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialTradeState)
  })
})
