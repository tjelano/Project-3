import { describe, expect, it } from 'vitest'
import { reduceProgress, initialProgressState } from './progress'
import { initialGameState } from '../gameState'
import type { BarbarianAttackResult } from '../knights'

describe('reduceProgress — BARBARIAN_TRACK_POSITION_SET', () => {
  it('sets barbarianTrackPosition, leaves every other field untouched', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'BARBARIAN_TRACK_POSITION_SET', position: 4 },
      initialGameState,
    )
    expect(result).toEqual({ ...initialProgressState, barbarianTrackPosition: 4 })
  })
})

describe('reduceProgress — BARBARIAN_ATTACK_SET', () => {
  const sampleResult: BarbarianAttackResult = {
    barbarianStrength: 5,
    defenderStrength: 3,
    defendersWin: false,
    pillageTargets: [{ playerId: 1, eligibleCityVertexIds: ['V1'] }],
    winners: [],
  }

  it('sets activeBarbarianAttack to the given result', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'BARBARIAN_ATTACK_SET', result: sampleResult },
      initialGameState,
    )
    expect(result).toEqual({ ...initialProgressState, activeBarbarianAttack: sampleResult })
  })

  it('accepts null (clearing the attack once resolved/dismissed)', () => {
    const dirty = { ...initialProgressState, activeBarbarianAttack: sampleResult }
    const result = reduceProgress(dirty, { type: 'BARBARIAN_ATTACK_SET', result: null }, initialGameState)
    expect(result.activeBarbarianAttack).toBeNull()
  })
})

describe('reduceProgress — KNIGHTS_PROMOTED_THIS_TURN_ADDED', () => {
  it('adds a single knight id to an empty set', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-1-1'] },
      initialGameState,
    )
    expect(result.knightsPromotedThisTurn).toEqual(new Set(['knight-1-1']))
  })

  it('adds multiple knight ids in one dispatch (Smithing)', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-1-1', 'knight-1-2'] },
      initialGameState,
    )
    expect(result.knightsPromotedThisTurn).toEqual(new Set(['knight-1-1', 'knight-1-2']))
  })

  it('merges into an already-populated set rather than replacing it', () => {
    const dirty = { ...initialProgressState, knightsPromotedThisTurn: new Set(['knight-1-1']) }
    const result = reduceProgress(
      dirty,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-2-1'] },
      initialGameState,
    )
    expect(result.knightsPromotedThisTurn).toEqual(new Set(['knight-1-1', 'knight-2-1']))
  })

  it('leaves barbarianTrackPosition/activeBarbarianAttack untouched', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-1-1'] },
      initialGameState,
    )
    expect(result.barbarianTrackPosition).toBe(0)
    expect(result.activeBarbarianAttack).toBeNull()
  })
})

describe('reduceProgress — TURN_ADVANCED', () => {
  it('clears knightsPromotedThisTurn, leaves barbarianTrackPosition/activeBarbarianAttack untouched', () => {
    const sampleResult: BarbarianAttackResult = {
      barbarianStrength: 5,
      defenderStrength: 3,
      defendersWin: true,
      pillageTargets: [],
      winners: [{ playerId: 1, tied: false }],
    }
    const dirty = {
      barbarianTrackPosition: 3,
      activeBarbarianAttack: sampleResult,
      knightsPromotedThisTurn: new Set(['knight-1-1']),
    }
    const result = reduceProgress(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toEqual({ ...dirty, knightsPromotedThisTurn: new Set() })
  })
})

describe('reduceProgress — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceProgress(initialProgressState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialProgressState)
  })
})
