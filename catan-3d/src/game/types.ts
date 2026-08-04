import type { Biome } from '../data/hexBoard'

export type ResourceType = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore'

export type Resources = Record<ResourceType, number>

export type PlayerColorToken = 'player-1' | 'player-2' | 'player-3' | 'player-4'

export type DevCardType = 'knight' | 'victoryPoint' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly'

export interface Player {
  id: number
  name: string
  colorToken: PlayerColorToken
  resources: Resources
  settlementsRemaining: number
  roadsRemaining: number
  citiesRemaining: number
  devCards: DevCardType[]
  // Cards bought this turn — can't be played until the turn passes. Cleared
  // whenever this player's turn begins (see endTurn in App.tsx).
  devCardsBoughtThisTurn: DevCardType[]
  knightsPlayed: number
}

export type BuildingType = 'settlement' | 'city'

export interface Building {
  ownerId: number
  type: BuildingType
}

export const DEV_CARD_ORDER: DevCardType[] = ['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly']

export const DEV_CARD_LABELS: Record<DevCardType, string> = {
  knight: 'Knights',
  victoryPoint: 'Victory Points',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
}

// Victory Point cards are held silently for score — there's no "play" action
// for them, so they have no entry here.
export const DEV_CARD_PLAY_LABELS: Partial<Record<DevCardType, string>> = {
  knight: 'Play Knight',
  roadBuilding: 'Play Road Building',
  yearOfPlenty: 'Play Year of Plenty',
  monopoly: 'Play Monopoly',
}

// Singular form, for prose like "No playable Knight card." DEV_CARD_LABELS is
// pluralised for inventory counts and reads wrong in a sentence.
export const DEV_CARD_SINGULAR: Record<DevCardType, string> = {
  knight: 'Knight',
  victoryPoint: 'Victory Point',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
}

export const RESOURCE_ORDER: ResourceType[] = ['lumber', 'brick', 'wool', 'grain', 'ore']

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  lumber: 'Lumber',
  brick: 'Brick',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
}

// Mirrors the --color-player-* tokens in index.css — kept as plain hex here
// because Three.js materials can't read Tailwind/CSS custom properties.
export const PLAYER_COLORS: Record<PlayerColorToken, string> = {
  'player-1': '#d0453f',
  'player-2': '#3d7fd1',
  'player-3': '#9b59b6',
  'player-4': '#2a9d8f',
}

// Mirrors the --color-resource-* tokens in index.css — kept as plain hex
// here because Three.js materials can't read Tailwind/CSS custom properties.
export const RESOURCE_COLORS: Record<ResourceType, string> = {
  lumber: '#2e7d32',
  brick: '#c1682b',
  wool: '#a4d65e',
  grain: '#f4c430',
  ore: '#78909c',
}

// What each hex biome produces when its number is rolled. Desert never
// produces anything.
export const BIOME_TO_RESOURCE: Record<Biome, ResourceType | null> = {
  forest: 'lumber',
  hills: 'brick',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
  desert: null,
}

export const BIOME_LABELS: Record<Biome, string> = {
  forest: 'Forest',
  hills: 'Hills',
  pasture: 'Pasture',
  fields: 'Fields',
  mountains: 'Mountains',
  desert: 'Desert',
}

export const STARTING_SETTLEMENTS = 5
export const STARTING_ROADS = 15
export const STARTING_CITIES = 4

export const SETTLEMENT_COST: Partial<Resources> = { lumber: 1, brick: 1, wool: 1, grain: 1 }
export const ROAD_COST: Partial<Resources> = { lumber: 1, brick: 1 }
export const CITY_COST: Partial<Resources> = { ore: 3, grain: 2 }
export const DEV_CARD_COST: Partial<Resources> = { ore: 1, grain: 1, wool: 1 }

export const LONGEST_ROAD_MIN_LENGTH = 5
export const LARGEST_ARMY_MIN_KNIGHTS = 3
export const LONGEST_ROAD_VP = 2
export const LARGEST_ARMY_VP = 2

export const WINNING_SCORE = 10

// Standard 25-card Catan development deck.
export function buildDevCardDeck(): DevCardType[] {
  const deck: DevCardType[] = []
  for (let i = 0; i < 14; i++) deck.push('knight')
  for (let i = 0; i < 5; i++) deck.push('victoryPoint')
  for (let i = 0; i < 2; i++) deck.push('roadBuilding')
  for (let i = 0; i < 2; i++) deck.push('yearOfPlenty')
  for (let i = 0; i < 2; i++) deck.push('monopoly')
  return deck
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Removes a single matching instance from a list, leaving the rest of the
// order untouched. Used to spend one card of a fungible type (e.g. a Knight)
// without caring which specific instance is removed.
export function removeOne<T>(items: T[], value: T): T[] {
  const index = items.indexOf(value)
  if (index === -1) return items
  return [...items.slice(0, index), ...items.slice(index + 1)]
}

function emptyResources(): Resources {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
}

export function createInitialPlayers(playerCount: number): Player[] {
  const colorTokens: PlayerColorToken[] = ['player-1', 'player-2', 'player-3', 'player-4']
  return colorTokens.slice(0, playerCount).map((colorToken, index) => ({
    id: index + 1,
    name: `Player ${index + 1}`,
    colorToken,
    resources: emptyResources(),
    settlementsRemaining: STARTING_SETTLEMENTS,
    roadsRemaining: STARTING_ROADS,
    citiesRemaining: STARTING_CITIES,
    devCards: [],
    devCardsBoughtThisTurn: [],
    knightsPlayed: 0,
  }))
}

// Standard Catan setup snake order for N players: 0..N-1, then reversed
// straight back down to 0. Each stop places one free settlement then road.
export function buildSetupOrder(playerCount: number): number[] {
  const ascending = Array.from({ length: playerCount }, (_, i) => i)
  return [...ascending, ...[...ascending].reverse()]
}

export interface ScoreBreakdown {
  settlements: number
  cities: number
  victoryPointCards: number
  longestRoad: number
  largestArmy: number
  total: number
}

// Authoritative score breakdown: 1 per settlement, 2 per city, 1 per hidden
// Victory Point development card, +2 for holding Longest Road, +2 for
// holding Largest Army. Trophy holders are tracked as App-level state (see
// trophies.ts) rather than recomputed here, since "current holder" depends
// on transfer history (a tie doesn't unseat the incumbent), not just an
// instantaneous max.
export function getScoreBreakdown(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
): ScoreBreakdown {
  let settlementCount = 0
  let cityCount = 0
  for (const building of Object.values(settlements)) {
    if (building.ownerId !== player.id) continue
    if (building.type === 'city') cityCount += 1
    else settlementCount += 1
  }
  const victoryPointCards = player.devCards.filter((card) => card === 'victoryPoint').length
  const longestRoad = player.id === longestRoadHolderId ? LONGEST_ROAD_VP : 0
  const largestArmy = player.id === largestArmyHolderId ? LARGEST_ARMY_VP : 0
  return {
    settlements: settlementCount,
    cities: cityCount,
    victoryPointCards,
    longestRoad,
    largestArmy,
    total: settlementCount + cityCount * 2 + victoryPointCards + longestRoad + largestArmy,
  }
}

export function getPlayerScore(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
): number {
  return getScoreBreakdown(player, settlements, longestRoadHolderId, largestArmyHolderId).total
}

// The score everyone at the table can legitimately see. Victory Point
// development cards stay face-down in real Catan and are only revealed on
// the winning turn, so the live HUD must exclude them — otherwise a
// hot-seat game leaks every opponent's hidden cards and the endgame loses
// its bluff. Win detection and the post-game scoreboard use the TRUE total
// (getPlayerScore / getScoreBreakdown) instead.
export function getPublicScore(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
): number {
  const score = getScoreBreakdown(player, settlements, longestRoadHolderId, largestArmyHolderId)
  return score.total - score.victoryPointCards
}

export function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (Object.entries(cost) as [ResourceType, number][]).every(
    ([resource, amount]) => resources[resource] >= amount,
  )
}

export function deductCost(resources: Resources, cost: Partial<Resources>): Resources {
  const next = { ...resources }
  for (const [resource, amount] of Object.entries(cost) as [ResourceType, number][]) {
    next[resource] -= amount
  }
  return next
}

export function totalResourceCount(resources: Resources): number {
  return RESOURCE_ORDER.reduce((sum, resource) => sum + resources[resource], 0)
}

// Automatic discard for the 7-roll rule: randomly removes floor(total/2)
// cards from whatever the player holds. No UI for choosing which cards —
// this game has no request for that, so it's fully automatic.
export function discardRandomHalf(resources: Resources): { resources: Resources; discarded: number } {
  const discardCount = Math.floor(totalResourceCount(resources) / 2)
  if (discardCount <= 0) return { resources, discarded: 0 }

  const pool: ResourceType[] = []
  for (const resource of RESOURCE_ORDER) {
    for (let i = 0; i < resources[resource]; i++) pool.push(resource)
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const next = { ...resources }
  for (let i = 0; i < discardCount; i++) {
    next[pool[i]] -= 1
  }

  return { resources: next, discarded: discardCount }
}
