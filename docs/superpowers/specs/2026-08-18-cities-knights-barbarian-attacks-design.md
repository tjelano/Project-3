# Cities & Knights — Barbarian Track & Attacks (Phase C2) — Design Spec

## Summary

The fourth of the 5-phase Cities & Knights/Seafarers plan to ship (Phase A —
Commodities & City Improvements, Phase B — Progress Cards, Phase C1 —
Knights & City Walls — all shipped). This is the second half of the
original plan's Phase 2, "Knights & Barbarians" — everything Phase C1's
design spec explicitly deferred: the barbarian track, its HUD
presentation, attack resolution, robber activation, the Defender of Catan
VP, and the last stubbed progress card, Taxation.

All rules below are sourced directly from the official Cities & Knights
rulebook (CN3087, catan.com, 6th edition — the same edition already used
throughout this project, verified against card text and draw-mechanic
wording that match verbatim). The barbarian track's exact length (7
positions) was confirmed two ways: cross-referencing web sources (which
disagreed, 7 vs. 8, likely an edition difference) against CN3087's own
component art on page 3 (the sea-frame illustration's wave-marked track),
which matches the 7-position figure — the same "verify against the actual
owned rulebook, not memory or a disputed web source" discipline this
project has followed throughout.

This spec's piece is `citiesAndKnightsBarbarians: boolean`, default
`false`. Unlike every other Cities & Knights flag in this project, this
one is **not** independently toggleable — it hard-requires
`citiesAndKnightsKnights` to also be on. Every other C&K combination so
far has been "harmless if the dependency is off"; this one is not:
without knights, defender strength is always 0, so every attack would be
an unwinnable auto-pillage with no possible defense. This is the same
class of reasoning gap that produced a Critical finding in Phase B's final
review ("naturally inert" assumed instead of verified) — caught during
this design's own self-review before any code was written, not after.

## Global Constraints

(Carried forward from Phase A/B/C1's specs, still binding)

- **Placeholder assets first.** No 3D barbarian ship model — the ship
  exists only as a HUD track marker icon (a deliberate reversal of this
  project's original Phase C1 discussion, per explicit user direction this
  session). No new 3D board geometry this phase at all.
- **Gated asset preloading.** N/A — no new 3D assets.
- **Multiplayer sync** for all new state follows the existing pattern:
  round-trip through `MatchSnapshot` as optional fields, normalized with
  `?? <default>` fallbacks in `restoreFromSnapshot`, broadcast/apply split
  the same way every other structural mutation in `App.tsx` works. This
  project has hit the "forgot the reset case" bug class at least 4 times
  now (Phases A, B, C1 twice) — treating this as a standing checklist
  item, not something to trust falling out naturally.
- **House rules stay independently toggleable** — with the one explicit
  exception above (`citiesAndKnightsBarbarians` requires
  `citiesAndKnightsKnights`), enforced in the UI, not just documented.
- **Turn-ownership guard convention.** Every new handler acting on turn
  state gets both an `isMyTurn`-equivalent check and a panel-level UI
  gate.

## Data Model

```ts
// App-level state, not Player-level — the barbarian ship and its track
// position are shared, board-wide state, like the robber's own position.
barbarianTrackPosition: number // 0-6, 7 positions total
robberActive: boolean          // starts false; permanently true after the
                                // first-ever attack resolves
```

- `barbarianTrackPosition` advances by 1 each time the event die's `'ship'`
  face is rolled (currently a documented no-op in `progressCards.ts`,
  since Phase B explicitly deferred this — see "Turn Flow Integration"
  below). Reaching position 6 (the 7th and final position) triggers the
  attack. Resets to 0 after every attack, win or lose.
- `robberActive` starts `false` — until the first-ever attack resolves,
  the robber keeps behaving exactly as it does today (movable on any
  rolled 7, base-game behavior, since this codebase never implemented the
  "inert until first attack" gate). The first attack (regardless of
  outcome) permanently flips this to `true`. The existing 7-roll
  robber-move-and-steal logic gets wrapped in `if (robberActive)`; before
  that, a 7 still forces discard, just no robber move/steal. Taxation's
  existing "not yet implemented" stub becomes a real `if (!robberActive)`
  guard once this phase gives it a real implementation (see below).
- `Player.defenderOfCatanCount: number` — a cumulative counter, **not** a
  challengeable single-holder trophy like Longest Road/Largest Army. Per
  the rulebook, a token once awarded is never taken back; multiple
  players can hold one or more simultaneously. Feeds
  `ScoreBreakdown.defenderOfCatanVP`, included in both
  `getScoreBreakdown` and `getPublicScore` **without subtraction** — the
  rulebook is explicit the token is placed face up in front of the
  player, same visibility class as Printing/Constitution, not hidden like
  a base-game dev-card VP. No cap on total awards across the game (the
  physical component count of 6 tokens is a box-manufacturing constraint,
  not a rule — confirmed with the user, digital version awards unlimited).
- `GameRules.citiesAndKnightsBarbarians: boolean`, default `false`,
  hard-requires `citiesAndKnightsKnights` (see Summary above).

## Attack Resolution Logic

New pure-logic function (own module or added to `game/knights.ts` — decide
during planning based on resulting file size). Pure data in, pure result
out, no React/App.tsx coupling, matching every other rules-logic function
in this project.

- **Barbarian strength** = total cities (including metropolises) across
  all players.
- **Defender strength** = sum of active-knight strengths across all
  players.
- **Ties favor defenders** — `defenderStrength >= barbarianStrength` means
  the defenders win.
- **Losing side (barbarians win):** find the tier of players tied for
  *lowest* active-knight contribution (0 active knights automatically
  qualifies as lowest). If every player in that tier is immune (0 cities,
  or metropolis-only cities), move up to the next-lowest tier and
  re-check. Once a tier has at least one non-immune player, every
  non-immune player in *that specific tier* loses 1 city each (their own
  choice of which — see UI section below); immune players in the same
  tier are simply skipped, not cascaded past individually. City walls on
  a pillaged city are destroyed (returned to the owner's build supply, per
  Phase C1's existing city-wall data model).
- **Winning side (defenders win):** immunity does **not** apply here — a
  metropolis-only player can still be the highest contributor and win. A
  single highest active-knight contributor gets 1 Defender of Catan VP
  (`defenderOfCatanCount += 1`). A tie for highest awards no VP; each
  tied player instead draws 1 progress card from any deck of their
  choice, in turn order starting from the current player.
- Either outcome: `barbarianTrackPosition` resets to 0, and **every**
  knight on the board (regardless of whether it participated) becomes
  inactive — per the rulebook, this is unconditional, not scoped to only
  the knights that were actually counted.

## Board UI — Track HUD & Attack Modal

**Track HUD** (new component, renders only when
`citiesAndKnightsBarbarians` is on, positioned top-center — matching the
reference mockups reviewed this session): 7 numbered segments with a
ship-icon marker on the current position; passed/current/upcoming color
states. Two live-derived text lines beneath it (recomputed from current
board state on every render, not stored): `Barbarian Strength: X ·
Defenders: Y` and `Next attack in N events` (`N = 6 -
barbarianTrackPosition`).

**Attack modal**, triggered automatically the instant
`barbarianTrackPosition` reaches 6. Not dismissible until fully resolved;
blocks turn progression to the Production Phase until resolution
completes — matching how the existing 7-roll discard flow already pauses
the turn.

1. Shows the strength comparison and the headline outcome.
2. Resolves per-player consequences in turn order, one at a time:
   - **Losers** (each non-immune player in the lowest-viable tier): the
     modal shrinks to a small "Choose which city to pillage" banner while
     a board overlay (new, following the exact established pattern
     `KnightLayer`/`RobberLayer`/`MerchantLayer` already use) highlights
     only that player's own eligible cities for a direct click — matching
     every other "pick one of your own buildings" interaction in this
     codebase (Metropolis claim, Merchant placement, knight recruit), not
     a one-off in-modal list. If a losing player has exactly one eligible
     city, skip the picker entirely and auto-resolve — no point forcing a
     click with a single option.
   - **Winner(s):** the single highest contributor sees a "+1 Defender of
     Catan VP" beat in the modal; tied-highest contributors each get a
     3-button Science/Trade/Politics deck picker, in-modal (no board
     interaction needed, this is a pure hand-management choice like an
     ordinary progress-card draw).
3. **Online play:** only the affected client sees their own active choice
   prompt; everyone else sees a "waiting on Player X" state, mirroring
   this project's existing multi-step sequencing conventions (e.g. the
   progress-card-over-limit discard queue). **Local Pass & Play:** no
   "waiting" state at all — proceeds turn-by-turn on the shared screen,
   same as every other multi-step local interaction already works.

**First-ever robber activation** gets a plain banner/event-log entry
(e.g. "The barbarians have landed — the robber is now active"), matching
how this project already announces other one-time state transitions.

**Defender of Catan trophy display**: added alongside wherever Longest
Road/Largest Army currently render (exact component TBD during
planning — likely `VictoryBanner.tsx`/`RankingsPanel.tsx`, per Phase C1's
precedent for Metropolis/Merchant VP display). Shown as a per-player
count, not a single current-holder badge, since it's cumulative and never
changes hands.

## Turn Flow Integration

The event die's `'ship'` face is currently a documented no-op:
`progressCards.ts`'s `EVENT_DIE_FACES` comment reads "3 ship faces (this
plan doesn't implement the Knights & Barbarians expansion, so a ship face
is a no-op)." This phase gives it real behavior: inside the existing
dice-roll resolution path (`handlePhysicsSettled` or wherever the event
die's result is currently branched on), a `'ship'` roll advances
`barbarianTrackPosition` by 1 (gated behind
`gameRules.citiesAndKnightsBarbarians`) and checks whether the attack
threshold was reached, triggering the modal flow above if so — this
happens *before* production resolves, per the existing documented turn
sequence (event die resolves before production dice).

## Taxation — Full Implementation (not just a guard change)

Taxation is currently fully stubbed (shows "not yet implemented," per
Phase B's design — it's one of the 6 knight/barbarian-dependent no-ops).
This phase gives it a real implementation, **distinct from both** the
base-game robber-steal (one random victim) and Phase C1's "Chase Away the
Robber" (which reuses that same single-victim flow): Taxation reuses the
existing robber tile-picker UI to choose a new hex, then steals 1 random
resource/commodity card from **every** player with a building on that
hex (not just one) — a new multi-victim steal loop, not a reuse of the
existing single-victim resolution. Its guard changes from the
unconditional stub to `if (!robberActive) { warn(...); return }`.

## Scoring

`ScoreBreakdown` gains `defenderOfCatanVP: number` (see Data Model above).
`getScoreBreakdown`/`getPlayerScore`/`getPublicScore` all thread it
through unmodified (public, not subtracted) — the same signature-threading
pattern this project has now done 3 times (Metropolis, Merchant, and now
this).

## Multiplayer Sync

- `barbarianTrackPosition` and `robberActive` round-trip through
  `MatchSnapshot` as new top-level optional fields (App-level state, not
  Player-level — same treatment `merchantTileId`/`merchantHolderId`
  already get).
- `Player.defenderOfCatanCount` round-trips as part of the existing
  wholesale `players: Player[]` serialization, normalized with `?? 0` in
  `restoreFromSnapshot`'s `normalizedPlayers` mapping, alongside the
  existing sibling fallbacks.
- Attack resolution follows the established broadcast/trusted-apply
  pattern: the resolving client (host, or whoever's turn triggers it —
  decide the exact authority model during planning, matching however
  event-die resolution authority already works today) computes the full
  result and broadcasts it; other clients apply without re-deriving.

## Out of Scope for This Spec

- Seafarers (Phases 4/5 of the original 5-phase plan) — untouched,
  unrelated to barbarians.
- Any physical-component-count enforcement for Defender of Catan VP
  tokens (confirmed unlimited with the user).
- Any 3D visual for the barbarian ship (confirmed HUD-only with the
  user this session, reversing the original Phase C1 discussion).
