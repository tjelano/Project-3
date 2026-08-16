import {
  COMMODITY_FOR_TRACK,
  IMPROVEMENT_TRACK_ORDER,
  type Building,
  type Commodities,
  type CityImprovements,
  type ImprovementTrack,
  type MetropolisHolders,
} from './types'

// Cost to move from level N-1 to level N is N matching commodities —
// confirmed against the physical City Improvement board component (see
// the design spec). Levels run 1-5; level 0 ("Basic City") is free/start.
export function improvementLevelCost(level: number): number {
  return level
}

const MAX_IMPROVEMENT_LEVEL = 5

export function canAffordImprovement(
  commodities: Commodities,
  track: ImprovementTrack,
  currentLevel: number,
): boolean {
  if (currentLevel >= MAX_IMPROVEMENT_LEVEL) return false
  const cost = improvementLevelCost(currentLevel + 1)
  return commodities[COMMODITY_FOR_TRACK[track]] >= cost
}

export function buyImprovementLevel(
  commodities: Commodities,
  cityImprovements: CityImprovements,
  track: ImprovementTrack,
): { commodities: Commodities; cityImprovements: CityImprovements } {
  const currentLevel = cityImprovements[track]
  const cost = improvementLevelCost(currentLevel + 1)
  const commodity = COMMODITY_FOR_TRACK[track]
  return {
    commodities: { ...commodities, [commodity]: commodities[commodity] - cost },
    cityImprovements: { ...cityImprovements, [track]: currentLevel + 1 },
  }
}

// Call immediately after `buyerId` reaches `newLevel` on `track`. Returns
// the metropolis holder for that track AFTER this purchase (unchanged if
// the purchase didn't trigger a control change).
//
// Deliberately NOT "current highest level always wins" (that's
// pickTrophyHolder's rule for Longest Road/Largest Army, game/trophies.ts)
// — official Cities & Knights is arrival-order-based: the first player to
// reach level 4 keeps temporary control even once someone else ALSO
// reaches level 4, and only a level-5 arrival (permanent control) can
// take it from them.
export function metropolisHolderAfterPurchase(
  currentHolderId: number | null,
  currentHolderLevel: number,
  buyerId: number,
  newLevel: number,
): number | null {
  if (newLevel < 4) return currentHolderId
  if (currentHolderId == null) return buyerId
  if (buyerId === currentHolderId) return currentHolderId
  if (newLevel >= 5 && currentHolderLevel < 5) return buyerId
  return currentHolderId
}

// True when a purchase reaching `newLevel` would actually make `buyerId` the
// (new) Metropolis holder for this track — i.e. a genuine claim that needs a
// spare city and a marker placement. False for: any level below 4 (no
// Metropolis involved yet), a buyer who ALREADY holds this track (leveling
// further doesn't move an already-placed marker — see
// metropolisHolderAfterPurchase's own "buyerId === currentHolderId" branch),
// and a second-or-later arrival at level 4 while someone else already holds
// it (arrival-order keeps temporary control with the incumbent). Callers
// (App.tsx's buyCityImprovement, GameHud's spare-city gate) both need this
// exact same "is this actually a claim" test — kept here, not duplicated, so
// the spend-time gate and the button's disabled state can never disagree
// about which purchases require a spare city.
export function purchaseClaimsMetropolis(
  currentHolderId: number | null,
  currentHolderLevel: number,
  buyerId: number,
  newLevel: number,
): boolean {
  if (newLevel < 4) return false
  if (currentHolderId === buyerId) return false
  return metropolisHolderAfterPurchase(currentHolderId, currentHolderLevel, buyerId, newLevel) === buyerId
}

// ---------------------------------------------------------------------------
// Derived Metropolis state.
//
// Everything below exists so that App.tsx (the spend-time gate, the
// click-time resolution, the reconnect restore) and GameHud.tsx (the buy
// button's disabled state) all reach their verdicts through the SAME code
// path with the SAME inputs. Both files previously re-derived
// `currentHolderLevel` and the own-city-vertex filter independently, which is
// exactly the kind of parallel derivation that silently drifts apart the next
// time one side changes.
// ---------------------------------------------------------------------------

// The subset of `Player` these helpers actually read. Widening the parameter
// this way keeps them callable from tests (and from snapshot data) without
// having to build a whole Player.
export interface MetropolisPlayerView {
  id: number
  cityImprovements: CityImprovements
}

export type MetropolisVertexIds = Record<ImprovementTrack, string | null>

// The current holder's own level on that track — 0 when nobody holds it (and
// also when the holder id somehow names a player who isn't in the list, which
// `metropolisHolderAfterPurchase` treats the same as "beatable at level 5").
export function metropolisHolderLevel(
  players: readonly MetropolisPlayerView[],
  metropolisHolders: MetropolisHolders,
  track: ImprovementTrack,
): number {
  const currentHolderId = metropolisHolders[track]
  if (currentHolderId == null) return 0
  return players.find((p) => p.id === currentHolderId)?.cityImprovements[track] ?? 0
}

// A player's own city vertex ids, in `settlements` iteration order.
export function ownCityVertexIds(settlements: Record<string, Building>, ownerId: number): string[] {
  return Object.entries(settlements)
    .filter(([, building]) => building.ownerId === ownerId && building.type === 'city')
    .map(([vertexId]) => vertexId)
}

// A city is "eligible" for a NEW Metropolis of this track if it isn't already
// flying that exact track's marker — a city already holding a DIFFERENT
// track's Metropolis is still eligible (CN3087 allows one Metropolis per
// track per city, not one Metropolis total per city).
export function hasSpareMetropolisCity(
  settlements: Record<string, Building>,
  metropolisVertexIds: MetropolisVertexIds,
  track: ImprovementTrack,
  ownerId: number,
): boolean {
  return ownCityVertexIds(settlements, ownerId).some((vertexId) => metropolisVertexIds[track] !== vertexId)
}

export interface MetropolisPurchaseVerdict {
  // Would buying the buyer's NEXT level on this track actually flip control
  // to them (and therefore need a marker placed on one of their cities)?
  claimsMetropolis: boolean
  // True only when that claim can't currently be placed — i.e. the purchase
  // must be refused outright rather than left un-placeable after the spend.
  blocked: boolean
}

// The single verdict App.tsx's `buyCityImprovement` and GameHud's buy-button
// disabled state both read. Derives `currentHolderLevel` and the buyer's own
// next level internally, so neither caller can compute them differently.
export function evaluateMetropolisPurchase(
  players: readonly MetropolisPlayerView[],
  settlements: Record<string, Building>,
  metropolisHolders: MetropolisHolders,
  metropolisVertexIds: MetropolisVertexIds,
  track: ImprovementTrack,
  buyerId: number,
): MetropolisPurchaseVerdict {
  const buyerLevel = players.find((p) => p.id === buyerId)?.cityImprovements[track] ?? 0
  const claimsMetropolis = purchaseClaimsMetropolis(
    metropolisHolders[track],
    metropolisHolderLevel(players, metropolisHolders, track),
    buyerId,
    buyerLevel + 1,
  )
  return {
    claimsMetropolis,
    blocked: claimsMetropolis && !hasSpareMetropolisCity(settlements, metropolisVertexIds, track, buyerId),
  }
}

// Which track (if any) `playerId` has ALREADY paid for but never placed —
// i.e. their CURRENT level on that track would claim its Metropolis, yet
// `metropolisHolders` still says otherwise.
//
// This is what makes an interrupted claim survive a reconnect without adding
// a persisted field: a level-5 claim has no "buy it again" recovery path (the
// track is maxed), so silently dropping the pending prompt would lose that
// Metropolis forever. Re-deriving it from state that is already broadcast and
// already in `MatchSnapshot` also works for a NON-host claimant, which a
// persisted `pendingMetropolisClaim` would not: snapshots are written from
// the effective host's local state only, and the pending flag lives on the
// claiming client.
//
// The derivation is exact because `purchaseClaimsMetropolis` returns false the
// moment the claim resolves (the buyer becomes the holder, hitting its own
// `currentHolderId === buyerId` early-out), and false for every player whose
// level never entitled them to the marker in the first place.
export function unresolvedMetropolisClaimTrack(
  players: readonly MetropolisPlayerView[],
  settlements: Record<string, Building>,
  metropolisHolders: MetropolisHolders,
  metropolisVertexIds: MetropolisVertexIds,
  playerId: number,
): ImprovementTrack | null {
  const player = players.find((p) => p.id === playerId)
  if (!player) return null
  return (
    IMPROVEMENT_TRACK_ORDER.find(
      (track) =>
        purchaseClaimsMetropolis(
          metropolisHolders[track],
          metropolisHolderLevel(players, metropolisHolders, track),
          playerId,
          player.cityImprovements[track],
        ) &&
        // Never restore a prompt the player couldn't actually satisfy — an
        // unsatisfiable prompt would block their End Turn permanently.
        hasSpareMetropolisCity(settlements, metropolisVertexIds, track, playerId),
    ) ?? null
  )
}
