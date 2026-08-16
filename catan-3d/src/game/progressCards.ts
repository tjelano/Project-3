import {
  PROGRESS_CARD_DECK_COMPOSITION,
  PROGRESS_CARD_VP_TYPES,
  shuffle,
  type ImprovementTrack,
  type ProgressCardType,
} from './types'

// One full shuffled deck for a track, exact composition per
// PROGRESS_CARD_DECK_COMPOSITION (18 cards, every track).
export function buildProgressCardDeck(track: ImprovementTrack): ProgressCardType[] {
  const deck: ProgressCardType[] = []
  const composition = PROGRESS_CARD_DECK_COMPOSITION[track]
  for (const type of Object.keys(composition) as ProgressCardType[]) {
    const qty = composition[type] ?? 0
    for (let i = 0; i < qty; i++) deck.push(type)
  }
  return shuffle(deck)
}

// CN3087 p.6/p.8: level N (1-5) draws on red-die 1 through N+1. Level 0
// never draws (no range printed on the City Improvement board).
export function isEligibleToDraw(level: number, redDie: number): boolean {
  if (level < 1) return false
  return redDie <= level + 1
}

export interface ProgressCardDrawResolution {
  draws: { playerId: number; card: ProgressCardType }[]
  remainingDeck: ProgressCardType[]
}

// Resolves one event-die roll's worth of draws for a single track. Callers
// pass players in FULL turn order starting at the current roller (CN3087
// p.6: "in turn order, starting with the current player and continuing
// clockwise") — this function does not reorder its input, it trusts the
// caller's order and just filters + draws.
export function resolveEventDieDraws(
  players: { id: number; cityImprovements: Record<ImprovementTrack, number> }[],
  track: ImprovementTrack,
  redDie: number,
  deck: ProgressCardType[],
  turnOrderIds: number[],
): ProgressCardDrawResolution {
  const byId = new Map(players.map((p) => [p.id, p]))
  let remainingDeck = deck
  const draws: { playerId: number; card: ProgressCardType }[] = []
  for (const playerId of turnOrderIds) {
    const player = byId.get(playerId)
    if (!player) continue
    if (!isEligibleToDraw(player.cityImprovements[track], redDie)) continue
    if (remainingDeck.length === 0) continue // deck exhausted — no-op, not an error
    const [card, ...rest] = remainingDeck
    draws.push({ playerId, card })
    remainingDeck = rest
  }
  return { draws, remainingDeck }
}

// CN3087 p.10: 4-card hand limit, VP cards excluded (they're never held in
// hand — see PROGRESS_CARD_VP_TYPES in types.ts). Returns how many cards
// over the limit the hand currently is (0 if at or under).
export function progressCardHandExcess(progressCards: ProgressCardType[]): number {
  const nonVpCount = progressCards.filter((card) => !PROGRESS_CARD_VP_TYPES.has(card)).length
  return Math.max(0, nonVpCount - 4)
}
