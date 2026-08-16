import { COMMODITY_FOR_TRACK, type Commodities, type CityImprovements, type ImprovementTrack } from './types'

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
