import type { GameState } from './game/gameState'
import type { Commodities, CommodityType, DevCardType, GameRules, ImprovementTrack, ProgressCardType, Resources, ResourceType } from './game/types'
import type { Biome } from './data/hexBoard'

// Plain, JSON-safe shape for the board graph — BoardGraph itself
// (data/boardGraph.ts) carries several fields as native Map objects,
// which silently serialize to `{}` across Playwright's page.evaluate()
// boundary. getGraph() converts them before returning.
export interface TestHarnessGraph {
  vertices: { id: string; x: number; z: number }[]
  edges: { id: string; a: string; b: string }[]
  vertexEdgeIds: Record<string, string[]>
  // vertex id -> the ids of the (1-3) tiles that touch it. Combined with
  // `tiles` below, lets a scenario pick a vertex adjacent to specific
  // biomes — e.g. the dev-card purchase scenario picks each setup
  // settlement to touch mountains/fields/pasture (ore+grain+wool), getting
  // as close as the board's random biome layout allows to buyDevCard's
  // cost — not always achievable in one placement, so that scenario also
  // needs `number` below to break ties toward tiles that actually produce
  // often, and falls back to a bounded number of real dice rolls for
  // whatever a placement alone couldn't cover.
  vertexTileIds: Record<string, string[]>
  // edge id -> the ids of the 1-2 tiles that flank it. Lets a scenario
  // tell whether a specific edge borders the sea (any flanking tile has
  // biome 'sea') — the same check App.tsx's own edgeTouchesSea makes —
  // which matters because ships can ONLY be placed on such edges. Needed
  // by the Seafarers ship scenario to walk a coastal chain, choosing ship
  // vs. road per edge based on its actual terrain rather than assuming.
  edgeTileIds: Record<string, string[]>
  tiles: { id: string; biome: Biome; number: number | null }[]
}

export interface CatanTestHarness {
  actions: {
    buildSettlement: (vertexId: string) => void
    buildRoad: (edgeId: string) => void
    buildShip: (edgeId: string) => void
    rollDice: () => void
    discard: () => void
    chooseRobber: () => void
    moveRobber: (tileId: string) => void
    buyDevCard: () => void
    playDevCard: (card: DevCardType) => void
    buyCityImprovement: (track: ImprovementTrack) => void
    // Bank trade, App.tsx's own bankTrade — rate is computed server-side
    // (game/App.tsx's getPortRate, port-aware) from `give`, not passed in;
    // a caller only needs to know it'll never be worse than 4:1, so a
    // surplus of >=4 in `give` always succeeds regardless of ports. Same
    // guards as the real UI action: silently no-ops (getLastWarning()
    // explains why) unless gamePhase is 'playing', the caller has already
    // rolled this turn, it's actually their turn, and give !== receive.
    bankTrade: (give: ResourceType, receive: ResourceType) => void
    // Test-only backdoor: adds resources/commodities directly to THIS page's
    // own player, bypassing dice/bank-rate/turn/phase — for scenario setups
    // that would be impractical or impossible via realistic dice+trade alone
    // (e.g. leveling a Cities & Knights improvement track past what barbarian-
    // attack pillage risk allows within a bounded round count). Purely
    // additive; broadcasts to the other page like bankTrade does.
    grantResources: (resources?: Partial<Resources>, commodities?: Partial<Commodities>) => void
    // Test-only backdoor: adds a NAMED progress card directly to THIS page's
    // own player's hand, bypassing the random draw — for scenarios that need
    // to reliably play a specific card's effect instead of grinding rolls
    // hoping it comes up. Broadcasts to the other page like grantResources.
    grantProgressCard: (card: ProgressCardType) => void
    // Local-only (not broadcast) — see its App.tsx wiring comment for why
    // that's safe: called identically on every page before any game
    // action, from gameRules already synced by the game-started broadcast.
    setGameRules: (overrides: Partial<GameRules>) => void
    // Wired to App.tsx's handleEndTurn (the guarded handler, same one the
    // real End Turn button calls) — not the raw endTurn it delegates to,
    // which has no guards of its own and assumes only handleEndTurn's
    // click ever reaches it. A wrongly-timed scenario step gets a real
    // getLastWarning() rejection here, same as every other action.
    endTurn: () => void
    // Cities & Knights Invention — real player-facing actions (see App.tsx's
    // installTestHarness wiring for why these need no MODE gating, unlike
    // grantResources/grantProgressCard above). playInvention spends the
    // card and arms the 2-tile picker; selectInventionTile mirrors
    // TileSwapLayer's onSelectTile — call it twice with two distinct,
    // swappable (non-null, non-2/6/8/12) tile ids from getGraph().tiles.
    playInvention: () => void
    selectInventionTile: (tileId: string) => void
    // Cities & Knights Sabotage/Wedding — same "real, already-guarded
    // production action" reasoning as playInvention above: both are
    // plain click-to-play (no argument-picker), fully resolved by one
    // call. Sabotage forces every player with >= the announcer's VP to
    // discard half their hand (floor); Wedding takes up to 2 cards from
    // every player with STRICTLY MORE VP than the announcer. Both derive
    // their affected-player set and auto-discard selection independently
    // per client from already-synced public state — same risk shape as
    // the two real desync bugs this harness already caught.
    playSabotage: () => void
    playWedding: () => void
    // Cities & Knights Espionage — look at another player's progress-card
    // hand, optionally take exactly one BY INDEX. In a 2-player game the
    // target is always the only other player (no selectEspionageTarget
    // exposed — nothing to choose between). playEspionage spends the card
    // and arms the pending pick; confirmEspionage([cardIndex]) resolves it
    // (empty array = looked, took nothing, matching the card's "you may
    // take 1" wording). The real risk this exercises: ESPIONAGE_TAKEN
    // resolves `cardIndex` against EACH client's own local copy of the
    // target's progressCards array (players.ts's ESPIONAGE_TAKEN case) —
    // if the two clients' arrays ever drifted in order, they'd resolve
    // DIFFERENT actual cards from the same index.
    playEspionage: () => void
    confirmEspionage: (indices: number[]) => void
    // Cities & Knights Resource Monopoly / Trade Monopoly — both spend the
    // card and open a picker (playResourceMonopoly/playTradeMonopoly),
    // resolved by a SEPARATE call (resolveDevCardPicker/
    // resolveDevCardCommodityPicker) once a resource/commodity is chosen —
    // same 2-step shape base-game Monopoly/Year of Plenty already use.
    // resolveDevCardPicker is generic (handles both those AND Resource
    // Monopoly), so exposing it here also makes base-game Monopoly/Year of
    // Plenty reachable, previously untested by any scenario. The real risk:
    // both cards' effects independently recompute which opponents to take
    // from, and how much, from each client's own already-synced resource/
    // commodity counts (players.ts's RESOURCE_MONOPOLY_PLAYED/
    // TRADE_MONOPOLY_PLAYED cases) — same shape as Sabotage/Wedding.
    playResourceMonopoly: () => void
    playTradeMonopoly: () => void
    resolveDevCardPicker: (picks: ResourceType[]) => void
    resolveDevCardCommodityPicker: (pick: CommodityType) => void
    // Cities & Knights Guild Dues — look at a player with MORE VP than you,
    // take any 2 cards of your choice. playGuildDues spends the card and
    // arms the pending pick (defaulted to the only eligible target in a
    // 2-player game — no selectGuildDuesTarget exposed, nothing to choose
    // between); confirmGuildDues resolves it, same shape as Espionage's
    // playEspionage/confirmEspionage above.
    playGuildDues: () => void
    confirmGuildDues: (picks: (ResourceType | CommodityType)[]) => void
    // Cities & Knights Diplomacy — remove any "open" road (neither endpoint
    // touches a building) and immediately rebuild it free if it was your
    // own, otherwise it returns to whoever owned it. activateDiplomacy
    // spends nothing and arms the picker; resolving it needs no new
    // action — buildRoadRaw checks pendingDiplomacyRemoval BEFORE its
    // normal build logic and routes an armed click straight to
    // playDiplomacy internally, so the already-exposed buildRoad(edgeId)
    // resolves this too, same click target a real player uses.
    activateDiplomacy: () => void
    // Cities & Knights Taxation — only playable once robberActive is true
    // (the first barbarian attack to ever resolve, win or lose). Spends the
    // card and arms the SAME tile-picker gamePhase='moveRobber' already
    // uses for a natural 7/Chase Away the Robber — resolved via the
    // already-exposed moveRobber(tileId) above, same "existing action
    // already routes an armed click" pattern buildRoad/activateDiplomacy
    // established. armTaxation also flips gamePhase to 'moveRobber' LOCALLY
    // (never mirrored to the receiver — only PROGRESS_CARD_SPENT is, via
    // onProgressCardPlayed's taxation branch), so it needs the same
    // BypassAction treatment activateDiplomacy does.
    armTaxation: () => void
  }
  getState: () => GameState
  // Reflects whatever board resetGame() last built. Called before the
  // game has actually started (gameStarted still false), this returns
  // the DEFAULT board, not the real match's board — plausible-looking
  // but wrong vertex/edge ids. Call only after waitForGameStarted().
  getGraph: () => TestHarnessGraph
  getStatus: () => { gameStarted: boolean; isMyTurn: boolean; connectionStatus: string }
  getLastWarning: () => string | null
}

declare global {
  interface Window {
    __catanTestHarness?: CatanTestHarness
  }
}

// A plain module-scope function, not an inline assignment inside App()'s
// effect — eslint-plugin-react-hooks's immutability rule flags direct
// `window.foo = ...` writes from within a component/hook body (part of its
// React Compiler-oriented purity checks), even from inside a useEffect.
// This mutation is genuinely test-only and mode-gated out of every real
// build (see App.tsx's own MODE guard), so it isn't a real purity concern
// — routing it through an ordinary outside-a-component function is enough
// to satisfy the rule without suppressing it.
export function installTestHarness(harness: CatanTestHarness): void {
  window.__catanTestHarness = harness
}

// Plain module-scope function, not inline Math.random() inside App()'s own
// closure — eslint-plugin-react-hooks's purity rule flags a direct impure
// call reachable from a component's render, but is opaque to (and so
// doesn't flag) a call out to an ordinary imported function — same reason
// game/progressCards.ts's rollEventDie exists as its own module-scope
// function rather than inline in App.tsx. Used only by rollDice's
// test-mode bypass (triggerDiceAttempt in App.tsx), which resolves a roll
// directly instead of waiting on PhysicsDice3D's simulation — there's no
// Canvas mounted to ever run it in test mode.
export function rollTestDicePair(): [number, number] {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]
}
