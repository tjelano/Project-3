import type { GameAction, GameState } from '../gameState'
import { shuffle } from '../../utils/seededRandom'
import { buildDevCardDeck, type DevCardType, type ImprovementTrack, type ProgressCardType } from '../types'
import { buildProgressCardDeck } from '../progressCards'

export interface DecksState {
  devDeck: DevCardType[]
  progressCardDecks: Record<ImprovementTrack, ProgressCardType[]>
}

// Matches the default the old `useState(() => shuffle(buildDevCardDeck()))`/
// `useState(() => ({ science: buildProgressCardDeck('science'), ... }))`
// used to seed with, before a real game (resetGame) replaces them — same
// "plain non-lazy value" treatment initialGameState.players already gets
// (createInitialPlayers(3), not a lazy function — see gameState.ts).
export const initialDecksState: DecksState = {
  devDeck: shuffle(buildDevCardDeck()),
  progressCardDecks: {
    science: buildProgressCardDeck('science'),
    trade: buildProgressCardDeck('trade'),
    politics: buildProgressCardDeck('politics'),
  },
}

export type DecksAction =
  | { type: 'DEV_CARD_DRAWN' }
  | { type: 'DEV_DECK_SET'; deck: DevCardType[] }
  | { type: 'PROGRESS_CARD_DECK_SET'; track: ImprovementTrack; deck: ProgressCardType[] }
  | { type: 'PROGRESS_CARD_DECK_POPPED'; track: ImprovementTrack; count: number }

export function reduceDecks(state: DecksState, action: GameAction, _fullState: GameState): DecksState {
  switch (action.type) {
    case 'DEV_CARD_DRAWN':
      return { ...state, devDeck: state.devDeck.slice(1) }
    case 'DEV_DECK_SET':
      return { ...state, devDeck: action.deck }
    case 'PROGRESS_CARD_DECK_SET':
      return { ...state, progressCardDecks: { ...state.progressCardDecks, [action.track]: action.deck } }
    case 'PROGRESS_CARD_DECK_POPPED':
      return {
        ...state,
        progressCardDecks: {
          ...state.progressCardDecks,
          [action.track]: state.progressCardDecks[action.track].slice(action.count),
        },
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full GameAction
      // union (every slice's actions), not just DecksAction, so most of that
      // union — including every board-only/players-only/turn-only/progress-
      // only action — is legitimately unhandled here. reduceDecks only owns
      // the 4 dedicated cases above.
      return state
  }
}
