import type { Biome } from '../data/hexBoard'

export type ResourceType = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore'

export type Resources = Record<ResourceType, number>

export type PlayerColorToken = 'player-1' | 'player-2' | 'player-3' | 'player-4' | 'player-5' | 'player-6'

export type DevCardType = 'knight' | 'victoryPoint' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly'

export interface Player {
  id: number
  name: string
  colorToken: PlayerColorToken
  resources: Resources
  commodities: Commodities
  cityImprovements: CityImprovements
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
  'player-5': '#dd7a2c',
  'player-6': '#c2478a',
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

export type CommodityType = 'paper' | 'cloth' | 'coin'

export type Commodities = Record<CommodityType, number>

export const COMMODITY_ORDER: CommodityType[] = ['paper', 'cloth', 'coin']

export const COMMODITY_LABELS: Record<CommodityType, string> = {
  paper: 'Paper',
  cloth: 'Cloth',
  coin: 'Coin',
}

// Same reasoning as RESOURCE_COLORS: kept as plain hex, not a CSS custom
// property, because Three.js materials can't read those.
export const COMMODITY_COLORS: Record<CommodityType, string> = {
  paper: '#dcd3b0',
  cloth: '#7fae60',
  coin: '#c9a227',
}

// Only 3 of the 5 resource-producing biomes yield a commodity when a city
// collects from them — fields/hills cities just get double the plain
// resource instead (unchanged base-game behavior, see App.tsx's
// production loop). Confirmed against the official Cities & Knights
// rulebook (CN3087) — see the design spec for the full citation.
export const COMMODITY_FOR_BIOME: Partial<Record<Biome, CommodityType>> = {
  forest: 'paper',
  pasture: 'cloth',
  mountains: 'coin',
}

export type ImprovementTrack = 'science' | 'trade' | 'politics'

export type CityImprovements = Record<ImprovementTrack, number> // 0-5 each

export const IMPROVEMENT_TRACK_ORDER: ImprovementTrack[] = ['science', 'trade', 'politics']

export const IMPROVEMENT_TRACK_LABELS: Record<ImprovementTrack, string> = {
  science: 'Science',
  trade: 'Trade',
  politics: 'Politics',
}

// Which commodity spends on which track's improvements.
export const COMMODITY_FOR_TRACK: Record<ImprovementTrack, CommodityType> = {
  science: 'paper',
  trade: 'cloth',
  politics: 'coin',
}

// The building name at each level, confirmed against the physical City
// Improvement board component — index 0 is level 1 (level 0 is the
// unbuilt "Basic City" starting state, which has no name of its own).
export const IMPROVEMENT_TRACK_NAMES: Record<ImprovementTrack, string[]> = {
  science: ['School', 'Library', 'Aqueduct', 'Theater', 'University'],
  trade: ['Market', 'Trading House', 'Merchant Guild', 'Bank', 'Great Exchange'],
  politics: ['Town Hall', 'Embassy', 'Fortress', 'Courthouse', 'High Assembly'],
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

// Optional house rules, chosen once at game setup (LocalSetup.tsx /
// OnlineSetup.tsx) and carried in GameStartInfo the same way boardShapeId
// is — see App.tsx's gameRules state. All default to standard-Catan
// behavior (off / WINNING_SCORE), so a match with no rules touched plays
// identically to before this existed.
export interface GameRules {
  // Can't move the robber onto a tile to steal from a player holding 2 or
  // fewer PUBLIC victory points.
  friendlyRobber: boolean
  // A 7 rolled on either of the first two rolls of the game has no effect
  // (no discard, no robber move) instead of triggering normally.
  noSevensFirstTwoRolls: boolean
  // Score needed to win — replaces the fixed WINNING_SCORE when set.
  victoryPointTarget: number
  // Skips the "no settlement within one edge of another" distance check.
  allowAdjacentSettlements: boolean
  // During the setup phase only, a settlement's vertex must touch at least
  // one boundary tile (i.e. border open water), not just any legal spot.
  coastalOnlySetupPlacement: boolean
  // Rolling a double grants the SAME player an immediate extra roll, same
  // turn. Three doubles in a row empties that player's whole hand.
  doublesRerollRule: boolean
  // Hides a tile's number, resource type, or both until a settlement is
  // built on a vertex touching it — reveal is permanent and shared by every
  // player (no per-player secret knowledge). Purely a rendering concern:
  // tile.number/tile.biome are always the real values everywhere else.
  hiddenTiles: 'off' | 'numbers' | 'resources' | 'both'
  // Cities adjacent to forest/pasture/mountains hexes also produce a
  // commodity; players spend commodities climbing 3 city improvement
  // tracks. See docs/superpowers/specs/2026-08-15-cities-knights-commodities-design.md.
  citiesAndKnightsCommodities: boolean
}

export const DEFAULT_GAME_RULES: GameRules = {
  friendlyRobber: false,
  noSevensFirstTwoRolls: false,
  victoryPointTarget: WINNING_SCORE,
  allowAdjacentSettlements: false,
  coastalOnlySetupPlacement: false,
  doublesRerollRule: false,
  hiddenTiles: 'off',
  citiesAndKnightsCommodities: false,
}

// A victoryPointTarget set above WINNING_SCORE needs proportionally more of
// everything to actually be reachable — under the standard piece/deck counts
// the hard ceiling on a single player's score is roughly 13 (4 cities + 1
// settlement + both bonuses) plus whatever share of the 5 shared VP cards
// they draw, so a target much past that softlocks the game: nobody can ever
// win. Scales UP only (never below standard, even for a target set BELOW
// WINNING_SCORE) so a short custom game never gets fewer pieces than normal
// Catan provides.
function victoryPointScale(victoryPointTarget: number): number {
  return Math.max(1, victoryPointTarget / WINNING_SCORE)
}

// Standard 25-card Catan development deck (at the default WINNING_SCORE
// target — see victoryPointScale above for how a higher one grows this).
export function buildDevCardDeck(victoryPointTarget: number = WINNING_SCORE): DevCardType[] {
  const scale = victoryPointScale(victoryPointTarget)
  const deck: DevCardType[] = []
  for (let i = 0; i < Math.ceil(14 * scale); i++) deck.push('knight')
  for (let i = 0; i < Math.ceil(5 * scale); i++) deck.push('victoryPoint')
  for (let i = 0; i < Math.ceil(2 * scale); i++) deck.push('roadBuilding')
  for (let i = 0; i < Math.ceil(2 * scale); i++) deck.push('yearOfPlenty')
  for (let i = 0; i < Math.ceil(2 * scale); i++) deck.push('monopoly')
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

export function emptyResources(): Resources {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
}

export function emptyCommodities(): Commodities {
  return { paper: 0, cloth: 0, coin: 0 }
}

export function emptyCityImprovements(): CityImprovements {
  return { science: 0, trade: 0, politics: 0 }
}

const DEFAULT_COLOR_TOKENS: PlayerColorToken[] = [
  'player-1',
  'player-2',
  'player-3',
  'player-4',
  'player-5',
  'player-6',
]

export function createInitialPlayers(
  playerCount: number,
  names?: string[],
  colorTokens?: PlayerColorToken[],
  // See victoryPointScale above — a higher target grants every player more
  // settlements/cities/roads to build with, proportionally.
  victoryPointTarget: number = WINNING_SCORE,
): Player[] {
  const resolvedColorTokens = (colorTokens ?? DEFAULT_COLOR_TOKENS).slice(0, playerCount)
  const scale = victoryPointScale(victoryPointTarget)
  const settlementsRemaining = Math.ceil(STARTING_SETTLEMENTS * scale)
  const roadsRemaining = Math.ceil(STARTING_ROADS * scale)
  const citiesRemaining = Math.ceil(STARTING_CITIES * scale)
  return resolvedColorTokens.map((colorToken, index) => ({
    id: index + 1,
    name: names?.[index]?.trim() || `Player ${index + 1}`,
    colorToken,
    resources: emptyResources(),
    commodities: emptyCommodities(),
    cityImprovements: emptyCityImprovements(),
    settlementsRemaining,
    roadsRemaining,
    citiesRemaining,
    devCards: [],
    devCardsBoughtThisTurn: [],
    knightsPlayed: 0,
  }))
}

// Standard Catan setup snake order for N players: startIndex, startIndex+1,
// ... wrapping through every seat, then reversed straight back down to
// startIndex. Each stop places one free settlement then road. startIndex
// exists so who goes first can be randomized without disturbing the actual
// seating order everyone continues turns in — it rotates WHERE the snake
// begins, not the relative order players take their turns in.
export function buildSetupOrder(playerCount: number, startIndex = 0): number[] {
  const ascending = Array.from({ length: playerCount }, (_, i) => (startIndex + i) % playerCount)
  return [...ascending, ...[...ascending].reverse()]
}

export type MetropolisHolders = Record<ImprovementTrack, number | null>

export interface ScoreBreakdown {
  settlements: number
  cities: number
  victoryPointCards: number
  longestRoad: number
  largestArmy: number
  metropolis: number
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
  metropolisHolders: MetropolisHolders,
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
  const metropolis = IMPROVEMENT_TRACK_ORDER.filter((track) => metropolisHolders[track] === player.id).length * 2
  return {
    settlements: settlementCount,
    cities: cityCount,
    victoryPointCards,
    longestRoad,
    largestArmy,
    metropolis,
    total: settlementCount + cityCount * 2 + victoryPointCards + longestRoad + largestArmy + metropolis,
  }
}

export function getPlayerScore(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
  metropolisHolders: MetropolisHolders,
): number {
  return getScoreBreakdown(player, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders).total
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
  metropolisHolders: MetropolisHolders,
): number {
  const score = getScoreBreakdown(player, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders)
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
