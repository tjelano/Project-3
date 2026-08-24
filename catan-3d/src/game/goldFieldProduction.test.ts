import { describe, expect, it } from 'vitest'
import { collectGoldFieldPicks } from './goldFieldProduction'
import type { HexTileData } from '../data/hexBoard'
import type { Building } from './types'

function tile(id: string, biome: HexTileData['biome'], number: number | null): HexTileData {
  return { id, col: 0, row: 0, x: 0, z: 0, biome, number }
}

describe('collectGoldFieldPicks', () => {
  it('owes 1 pick for a settlement on a matching gold tile', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([{ playerId: 1, vertexId: 'V1' }])
  })

  it('owes 2 picks for a city on a matching gold tile', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'city' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([
      { playerId: 1, vertexId: 'V1' },
      { playerId: 1, vertexId: 'V1' },
    ])
  })

  it('ignores a gold tile blocked by the Robber', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, 'G1', settlements, tileVertexIds)).toEqual([])
  })

  it('ignores a gold tile that did not match the roll', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 6, '', settlements, tileVertexIds)).toEqual([])
  })

  it('ignores a non-gold tile even when it matches the roll', () => {
    const tiles = [tile('F1', 'forest', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['F1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([])
  })

  it('skips a vertex with no building', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const tileVertexIds = new Map([['G1', ['V1', 'V2']]])
    expect(collectGoldFieldPicks(tiles, 8, '', {}, tileVertexIds)).toEqual([])
  })

  it('aggregates across multiple gold tiles and multiple owners', () => {
    const tiles = [tile('G1', 'gold', 8), tile('G2', 'gold', 8)]
    const settlements: Record<string, Building> = {
      V1: { ownerId: 1, type: 'settlement' },
      V2: { ownerId: 2, type: 'city' },
    }
    const tileVertexIds = new Map([
      ['G1', ['V1']],
      ['G2', ['V2']],
    ])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([
      { playerId: 1, vertexId: 'V1' },
      { playerId: 2, vertexId: 'V2' },
      { playerId: 2, vertexId: 'V2' },
    ])
  })
})
