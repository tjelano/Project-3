# App.tsx Reducer Refactor — Sub-plan 8 (FINAL): `GameHud` prop grouping

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `GameHudProps`'s single flat 102-prop interface with 16 named group objects plus 11 genuine singleton props (27 top-level props total), updating `GameHud.tsx`'s interface, its destructuring header, its internal body reads, and its one and only call site (`App.tsx:7298-7412`) — with zero behavior change.

**Architecture:** This is the LAST sub-plan of the 8-sub-plan "App.tsx Reducer Refactor" project. **After this merges, the whole project is complete.** Unlike Sub-plans 1-7, this one moves NO state: nothing enters or leaves the `GameState` reducer, no `useState` cell is touched, no broadcast is touched, no value or expression passed to `GameHud` changes. It is a pure component-API restructuring — every one of the 102 values stays byte-identical at the call site and only changes how it is *packaged* (flat JSX attribute → key inside an object literal). The spec deliberately deferred the exact grouping until the final state shape was known ("Exact grouping decided against the actual final prop list, not pre-designed now"); Sub-plan 7 merged, so this plan does that design work against the live 102-prop list.

**Tech Stack:** React 19 + TypeScript, no new dependencies, no new files. Verification is `tsc`/`eslint`/`vitest`/`vite build` — there are no unit tests for this component (see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` — specifically its "### GameHud props (final sub-plan only)" section (line 119-121) and Sequencing item 7. That section names exactly one worked example (`pickerState` folding `devCardPicker`/`scienceFreeResourceActive`/`goldFieldResourceActive`/`onResolve*` together); this plan implements that example as `picker` and applies the same by-mechanic philosophy to the other 15 groups. The spec's Ponytail-Audit finding #4 ("`GameHudProps` is a flat 100+-entry interface with no internal grouping — every new picker/queue mechanic added 2+ top-level props rather than fitting into any existing structure") is the problem statement this plan closes.

**Grouping philosophy — user-approved before this plan was written:** group by MECHANIC into roughly 12-15 named objects. The "fewer, broader groups" option was explicitly declined. True singletons that cluster with nothing stay plain top-level props — do not force everything into a group.

---

## Global Constraints

- **`catan-3d/tsconfig.json` is solution-style (`"files": []`) — bare `npx tsc --noEmit` checks 0 files and is vacuous. Every task's typecheck gate MUST be `npx tsc -p tsconfig.app.json` (run from `catan-3d/`).**
- **This is a PURE interface restructuring with ZERO behavior change** — every prop's actual value/computation at the call site stays byte-identical, only how it is PACKAGED (flat attribute vs. nested inside an object literal) changes. **No prop is renamed** unless grouping genuinely requires disambiguation (e.g. if two different groups would otherwise both want a field called `active`). Verified this session: no such collision exists anywhere in the 16 groups below, so **every one of the 102 props keeps its exact existing name as a key inside its new group object.** That includes deliberately redundant-looking ones like `houseRules.citiesAndKnightsCommodities` — do NOT shorten it to `houseRules.commodities`.
- **`GameHud.tsx` has NO dedicated test file** (confirmed this session — the only `*.test.ts` files in `src/` are under `src/game/` and `src/data/`; no UI component in this codebase is unit-tested, and `App.tsx` has no test file either). Verification for every task is: `npx tsc -p tsconfig.app.json` (this is what actually catches a prop-wiring mistake here — a missing, extra, or mistyped field in a JSX object-literal prop is a compile error in both directions) + `npx eslint` + the full existing Vitest suite (confirms zero regressions elsewhere — none are expected, since nothing under `src/game/` or any tested module changes) + `npm run build`. This mirrors the spec's own already-approved Sub-plan 1 deviation for pure mechanical plumbing with no logic of its own to test.
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before any task is reported done** — this project's own history has a real case (Board Foundation, Seafarers sub-plan 1) of a broken Vite import that only `npm run build` caught.
- **`GameHudProps`/`GameHud` are used from exactly one call site in the whole codebase** (`App.tsx:22` imports it, `App.tsx:7298` renders it — confirmed by grep this session), and **no file anywhere imports the `GameHudProps` type** (it is not even exported today). There is no third caller to break or forget, and no external consumer.
- **Preserve every existing prop-level explanatory comment's SUBSTANCE.** Each field's comment block travels with the field, verbatim, into its new group. Where the grouping itself needs explaining (a field whose new home isn't obvious from its name), this plan supplies a NEW short comment verbatim in the task step. Gate: `grep -c "^\s*//" src/components/hud/GameHud.tsx` returns **388** on the current branch and must still return **388** after every task. Do not silently delete institutional-knowledge comments while moving code around.
- **Group-interface declaration order must match the original prop-declaration order** (the canonical order in the Data Model below). Many comments say things like "same shape as `pendingGuildDues` above", "unlike `isMyDiscardTurn` below", "see `citiesAndKnightsProgressCards`' own comment just above" — every one of those cross-references was checked this session and stays literally true under the canonical order. Reordering the groups would silently falsify them.
- **No "widen then narrow."** Do NOT keep old flat props alongside new grouped ones temporarily. With one call site and no external consumer there is no benefit; each task fully converts its clusters and nothing is ever duplicated.
- **Task decomposition is by PROP-GROUP CLUSTER, not by file.** A group's interface fields, its destructuring, its internal body reads, and its slice of the App.tsx call site are mutually coupled — they must land in the SAME commit or the branch does not compile. Every task therefore edits both files and leaves the whole branch compiling.
- **Explicitly out of scope, do not touch:** any `useState` cell in `App.tsx`; any reducer slice; any child component under `src/components/hud/` other than `GameHud.tsx` itself (`TopBar`, `ResourcePanel`, `KnightsPanel`, `ProgressCardsPanel`, `CityImprovementsPanel`, `RankingsPanel`, `VictoryBanner`, `DiscardPanel`, `ChatBoxPanel`, … all keep their existing flat prop interfaces — this plan changes only what `GameHud` RECEIVES, never what it PASSES DOWN); `CONVENTIONS.md` (checked this session — its three sections document the trusted-apply broadcast pattern, the online-parallel/local-sequential gating pattern, and the module-scope helper convention; none of the three describes component prop shape, so there is nothing to sync).

---

## Data Model — the 16 groups and the 11 singletons

Every field below keeps its exact current name and type. The line numbers are `GameHud.tsx` as of this branch's HEAD (pre-Task-1) and are given so the implementer can find each field's comment block; they shift as tasks land, so later tasks locate code by content, not by line number.

### Naming

- **Interface names use a `…HudState` suffix** (`TurnHudState`, `TradeHudState`, …) rather than the bare `TurnState`/`TradeState`/`TrophiesState` the spec sketched. Reason: `src/game/reducers/turn.ts`, `trade.ts`, and `trophies.ts` already export reducer-slice types under those exact bare names. These HUD groups are a *view* packaging concern, not those slices (they mix reducer state, local `useState`, derived booleans, and callbacks), and a reader must never confuse the two.
- **Prop names are the plain noun** (`turn`, `dice`, `trade`, …), not `turnState`/`tradeState`. The call site reads `turn={{ … }}`, the body reads `knights.armedKnightId`.
- All 16 interfaces are declared **in `GameHud.tsx` itself, immediately above `interface GameHudProps`**, and are **not exported** — nothing imports them (the call site builds plain object literals, which TypeScript contextually type-checks against `GameHudProps` with full excess-property checking). This matches the file's own existing precedent (`GameHudProps` is not exported either) and avoids adding a new module or a new public type surface for zero benefit.

### The 16 groups (canonical declaration order)

| # | Prop | Interface | Fields | Access in body |
|---|------|-----------|--------|----------------|
| 1 | `turn` | `TurnHudState` | `currentPlayerIndex`, `isMyTurn`, `gamePhase`, `setupStage`, `hasRolledThisTurn`, `devCardPlayedThisTurn`, `onEndTurn` (7) | destructured |
| 2 | `dice` | `DiceHudState` | `lastRoll`, `lastEventDie`, `isRolling`, `onRollDice` (4) | destructured |
| 3 | `trade` | `TradeHudState` | `portRates`, `onTrade`, `onTradeCommodity`, `pendingTrade`, `localPlayerId`, `onProposeTrade`, `onResolveTrade` (7) | destructured |
| 4 | `devCards` | `DevCardHudState` | `devDeckCount`, `onBuyDevCard`, `onPlayDevCard` (3) | destructured |
| 5 | `picker` | `PickerHudState` | `devCardPicker`, `onResolveDevCardPicker`, `onResolveDevCardCommodityPicker`, `scienceFreeResourceActive`, `onResolveScienceFreeResource`, `goldFieldResourceActive`, `onResolveGoldFieldResource` (7) | destructured |
| 6 | `trophies` | `TrophyHudState` | `longestRoadHolderId`, `longestRoadLengths`, `largestArmyHolderId`, `metropolisHolders`, `metropolisVertexIds`, `merchantHolderId` (6) | dot access |
| 7 | `houseRules` | `HouseRulesHudState` | `citiesAndKnightsCommodities`, `citiesAndKnightsProgressCards`, `citiesAndKnightsBarbarians`, `citiesAndKnightsKnights` (4) | destructured |
| 8 | `improvements` | `ImprovementHudState` | `onBuyImprovement`, `pendingMetropolisTrack`, `craneDiscountActive` (3) | dot access |
| 9 | `knights` | `KnightsHudState` | `onRecruitKnight`, `canRecruitKnight`, `onActivateKnight`, `onPromoteKnight`, `onArmKnightMove`, `onArmKnightDisplace`, `onArmChaseRobber`, `canChaseRobber`, `onArmChasePirate`, `canChasePirate`, `armedKnightId`, `knightsPromotedThisTurn` (12) | dot access |
| 10 | `cityWalls` | `CityWallHudState` | `onBuildWall`, `pendingFreeCityWall`, `onResolveFreeWall` (3) | dot access |
| 11 | `progressCards` | `ProgressCardHudState` | `progressCardDeckCounts`, `progressCardPlayHandlers`, `onPlayAlchemy`, `onPlayInvention`, `inventionSwapActive`, `onPlayMerchantFleet`, `merchantFleetRate`, `onPlayCommercialHarbor`, `onPlayTreason`, `treasonPlacementActive`, `onPlayDiplomacy`, `diplomacyPickerActive`, `onCancelDiplomacy` (13) | dot access, one exception (`merchantFleetRate`, see below) |
| 12 | `guildDues` | `GuildDuesHudState` | `pendingGuildDues`, `guildDuesEligibleTargets`, `onSelectGuildDuesTarget`, `onConfirmGuildDues`, `onCancelGuildDues` (5) | dot access |
| 13 | `espionage` | `EspionageHudState` | `pendingEspionage`, `onSelectEspionageTarget`, `onConfirmEspionage`, `onCancelEspionage` (4) | dot access |
| 14 | `progressDiscard` | `ProgressDiscardHudState` | `activeProgressDiscarderId`, `progressDiscardSelection`, `onToggleProgressDiscard`, `progressDiscardRequiredCount`, `onConfirmProgressDiscard`, `progressDiscardingPlayerName` (6) | destructured |
| 15 | `discard` | `DiscardHudState` | `isMyDiscardTurn`, `discardingPlayerName`, `discardRequiredCount`, `discardSelectedCount`, `onConfirmDiscard` (5) | dot access |
| 16 | `chat` | `ChatHudState` | `chatMessages`, `onSendChatMessage` (2) | dot access |

**91 fields in groups + 11 singletons = 102.** (7+4+7+3+7+6+4+3+12+3+13+5+4+6+5+2 = 91.)

### The 11 singletons that deliberately stay flat

Per the user's explicit instruction not to force everything into a group:

- **`players`** — read by nearly every branch in the file (TopBar, RankingsPanel, BarbarianTrackPanel, ChatBoxPanel, TradeOfferPrompt, VictoryBanner, the `viewer`/`otherPlayers`/`currentPlayer` derivations, `totalWallsOnBoard`, `metropolisPurchaseBlocked`, both OpponentHandPicker target lookups). It belongs to no mechanic; it is the file's substrate.
- **`settlements`** — same reason: BarbarianTrackPanel, RankingsPanel, VictoryBanner, `ownCities`, `canBuildWallAt`, `metropolisPurchaseBlocked`.
- **`viewerPlayerId`** — this screen's identity, the input to the `viewer` derivation that a dozen other things hang off. Cross-cutting by definition.
- **`winner`** — feeds VictoryBanner *and* the `gameActive` gate that every single action check ANDs in. Not a victory-screen-only concern.
- **`onReturnToMenu`** — one navigation callback, one consumer (VictoryBanner).
- **`onRestart`** and **`canRestart`** — one navigation callback plus its own permission flag, both consumed only by TopBar. A two-field `restartState` object would add a level of nesting and buy nothing; `onRestart` is one of the user's own named examples of a legitimate singleton.
- **`banner`** — one value, one consumer (EventBanner), pure pass-through.
- **`roomCode`** — gates TWO unrelated things (the RoomCodeTag badge and whether ChatBoxPanel renders at all). It is the online/offline discriminator, not a chat field, so it does not go inside `chat`.
- **`barbarianTrackPosition`** — the only non-house-rule field the barbarian mechanic passes; its natural sibling (`citiesAndKnightsBarbarians`) belongs in `houseRules` with the other three house-rule booleans. A one-field `barbarians` group earns nothing.
- **`eventLog`** — one array, one consumer (EventLogPanel). It is not chat (different panel, different data, different lifecycle), so it does not go inside `chat`.

### Judgment calls worth knowing about (and their reasoning)

- **16 groups, not 15.** `dice` is kept separate from `turn` on purpose. `isRolling` is a per-client dice-animation flag — the spec's own Out of Scope list names "dice-roll animation display" as genuinely local, explicitly NOT reducer state — while `turn`'s fields are exactly the reducer's `TurnState` shape. Merging them would blur the local/shared boundary this entire 8-sub-plan project has spent seven sub-plans drawing. Likewise `guildDues`/`espionage` stay separate (two different progress cards with parallel but distinct shapes — Guild Dues carries a VP-filtered eligible-targets list, Espionage does not) and `cityWalls` stays separate from `knights` (walls are rendered by ResourcePanel, knights by KnightsPanel).
- **`craneDiscountActive` lives in `improvements`, not `progressCards`.** It is a progress card by origin, but its sole consumer is CityImprovementsPanel and its meaning is "the viewer's next improvement costs 1 less". Grouping is by what the field DOES in this component, not by which rulebook chapter minted it. Task 2 adds a one-line comment saying exactly that, so the next reader does not "fix" it back.
- **`merchantHolderId` lives in `trophies`.** It is `BoardState`-owned in the reducer, but in this file its only two consumers are RankingsPanel and VictoryBanner, sitting alongside `longestRoadHolderId`/`largestArmyHolderId`/`metropolisHolders` for scoring. Its own existing comment already says it gets the same treatment as `metropolisHolders`, which is in this group.
- **`localPlayerId` lives in `trade`.** Verified this session: its ONLY read in the entire 780-line body is the TradeOfferPrompt gate (`GameHud.tsx:1273`), and its whole comment block is about that gate. It is not a general identity prop — `viewerPlayerId` is.
- **`metropolisVertexIds` lives in `trophies` with `metropolisHolders`** even though its only read is inside the `metropolisPurchaseBlocked` derivation that feeds `improvements`' panel. The two share one comment block explaining why both live in `App.tsx` rather than on `Player` (a Metropolis's marker belongs to one specific city vertex, not just "a player") — splitting them would split that comment.

### Institutional knowledge that must survive (comment-substance summary)

Every comment moves verbatim with its field, so this list is a safety net, not a replacement. The design rationale a future reader must not lose:

1. **Why `scienceFreeResourceActive`/`goldFieldResourceActive` are separate flags and NOT folded into `devCardPicker`** (`GameHud.tsx:138-154`): each can be true for a DIFFERENT player than `currentPlayerIndex` (they are per-roll queues in `App.tsx`, not turn-scoped dev-card plays). They are mutually exclusive with `devCardPicker` in practice, and with each other — Science level 3 only fires for a player who got ZERO production that roll, and a Gold Field pick IS production. `activePickerMode` encodes that priority ordering as a stacking guard. **Grouping them into `picker` does not merge them into `devCardPicker`; they remain three distinct fields.**
2. **Why `metropolisHolders`/`metropolisVertexIds` live in `App.tsx`, not on `Player`** (`GameHud.tsx:159-166`): a Metropolis's marker belongs to one specific city VERTEX, not just to a player. Same reasoning is cited by `merchantHolderId`'s own comment.
3. **Why each `citiesAndKnights*` flag is a separate boolean rather than the whole `GameRules` object, and why none of them is derived from another** (`GameHud.tsx:177-211`): a display component only needs the one boolean; the four house rules are independently toggleable (Knights ON + Progress Cards OFF is a fully supported match), and no UI-level dependency between them is enforced here, matching `GameRules`' own precedent in `game/types.ts`.
4. **Why `onResolveDevCardCommodityPicker` is a separate resolver** rather than widening `onResolveDevCardPicker`'s `ResourceType[]` signature (`GameHud.tsx:132-136`): Trade Monopoly resolves a single `CommodityType`.
5. **Why Alchemy / Invention / Merchant Fleet / Commercial Harbor / Treason / Diplomacy are NOT in `progressCardPlayHandlers`** (`GameHud.tsx:281-350`): each needs an argument picked (or a board pick armed) before it can be played, so each gets its own small widget instead of the panel's generic click-to-play. `onCancelDiplomacy` is required, not optional — End Turn refuses to advance while the picker is armed, so with no cancel path an armed picker with nothing pickable was a hard deadlock.
6. **Why `knightsPromotedThisTurn` is passed as a raw `Set`** and not a derived boolean (`GameHud.tsx:248-253`): `canPromote` checks membership per-knight, not once for the whole panel.
7. **Why `canChaseRobber`/`canChasePirate` are computed in `App.tsx` while `canPromote`/`canBuildWallAt` are computed here** (`GameHud.tsx:233-246`): the chase checks need `graph.vertexTileIds`/`robberTileId`/`pirateTileId`, none of which this component otherwise receives.
8. **Why `activeProgressDiscarderId` is the raw front-of-queue id while `isMyDiscardTurn` is a pre-resolved boolean** (`GameHud.tsx:371-378`): `GameHud` derives its own `isMyProgressDiscardTurn` from `viewer.id`, a GameHud-local concept `App.tsx` has no matching hand-off for outside the resource-discard flow.
9. **Why `pendingFreeCityWall` reuses the same Wall buttons instead of a dedicated picker** (`GameHud.tsx:264-273`), and why `freeWallActive` branches ONLY the affordability half of `canBuildWallAt` — every turn/phase gate still applies identically, so a free wall is exactly as unclickable off-turn as a paid one.

### Access-pattern rule (binding, no per-field judgment)

The file's existing style is: named local `const`s for derivations (with comments), direct pass-through in JSX. The grouping follows it exactly.

- **7 groups are destructured into locals** in one statement each, immediately after the props destructuring, keeping every field's existing name: **`turn`, `dice`, `trade`, `devCards`, `picker`, `houseRules`, `progressDiscard`.** Every one of them has at least one field feeding a local derivation, a boolean gate, or arithmetic (`canTrade`, `canBuyDevCard`, `canPlayDevCards`, `canBuildWallAt`, `canBuyImprovement`, `canPlayProgressCards`, `canPlayKnightActions`, `activePickerMode`, `tradeBlocked`, `statusLabel`, `isMyProgressDiscardTurn`, and the hand-limit "select N more cards" arithmetic). Destructuring keeps those dense expressions readable and leaves their lines untouched.
- **The other 9 groups are read by dot access at each use site** (`knights.armedKnightId`, `discard.discardingPlayerName`, …). Every one of them is threaded straight to a child component or a single JSX block, where `group.field` reads as *better* documentation than a bare name.
- **Exactly one exception:** `progressCards.merchantFleetRate` is pulled into a local (`const { merchantFleetRate } = progressCards`) because two of its read sites narrow it across a `&&` chain (`GameHud.tsx:940-943` and `1057-1062`). Dot access there depends on TypeScript narrowing a nested property path, which is fragile to reason about and would otherwise invite a non-null assertion. One local, one line, stated up front — not a judgment call left to the implementer.

Net effect: 43 names in the component's local scope (11 singletons + 16 group props + 32 destructured fields + `merchantFleetRate`) instead of today's 102 flat props.

### Behavior-change analysis (the one risk, verified safe)

Building 16 fresh object literals per render creates 16 new object identities per render. Verified this session that this changes nothing:

- `GameHud` is `export function GameHud(...)` — **not** wrapped in `React.memo`. It already re-renders on every `App` render, so new prop identities cost nothing and skip nothing.
- **No group object is ever passed onward.** Every child component still receives individual fields, exactly as today. No child sees an object whose identity changed.
- The only hook consuming a prop callback is `useModalFocusTrap(guildDues.onCancelGuildDues)` / `useModalFocusTrap(espionage.onCancelEspionage)`. Those read the SAME `App.tsx` function references as today — wrapping a reference in an object literal does not change the reference. Effect dependency identity is unchanged.

### End state — the complete call site after all 4 tasks

This is the exact target for `App.tsx:7298-7412`. Each task converts its own slice of it; this is the finished shape for reference (nothing here is new — every value is copied verbatim from the current flat attributes):

```tsx
      <GameHud
        players={players}
        turn={{
          currentPlayerIndex,
          isMyTurn,
          gamePhase,
          setupStage,
          hasRolledThisTurn,
          devCardPlayedThisTurn,
          onEndTurn: handleEndTurn,
        }}
        dice={{ lastRoll, lastEventDie, isRolling, onRollDice: rollDice }}
        banner={banner}
        onRestart={restartGame}
        canRestart={onlineInfo == null || isEffectiveHost}
        trade={{
          portRates: currentPlayerPortRates,
          onTrade: bankTrade,
          onTradeCommodity: tradeCommodity,
          pendingTrade,
          localPlayerId: onlineInfo?.localPlayerId ?? null,
          onProposeTrade: proposePlayerTrade,
          onResolveTrade: resolvePlayerTrade,
        }}
        devCards={{ devDeckCount: devDeck.length, onBuyDevCard: buyDevCard, onPlayDevCard: playDevCard }}
        winner={winner}
        settlements={gameState.board.settlements}
        onReturnToMenu={returnToMenu}
        picker={{
          devCardPicker,
          onResolveDevCardPicker: resolveDevCardPicker,
          onResolveDevCardCommodityPicker: resolveDevCardCommodityPicker,
          scienceFreeResourceActive: activeScienceFreeResourcePlayerId != null,
          onResolveScienceFreeResource: resolveScienceFreeResource,
          goldFieldResourceActive: activeGoldFieldResourcePlayerId != null,
          onResolveGoldFieldResource: resolveGoldFieldResourcePick,
        }}
        trophies={{
          longestRoadHolderId,
          longestRoadLengths,
          largestArmyHolderId,
          metropolisHolders,
          metropolisVertexIds,
          merchantHolderId,
        }}
        houseRules={{
          citiesAndKnightsCommodities: gameRules.citiesAndKnightsCommodities,
          citiesAndKnightsProgressCards: gameRules.citiesAndKnightsProgressCards,
          citiesAndKnightsBarbarians: gameRules.citiesAndKnightsBarbarians,
          citiesAndKnightsKnights: gameRules.citiesAndKnightsKnights,
        }}
        improvements={{
          onBuyImprovement: buyCityImprovement,
          pendingMetropolisTrack:
            pendingMetropolisClaim && pendingMetropolisClaim.playerId === localPlayer.id
              ? pendingMetropolisClaim.track
              : null,
          craneDiscountActive: craneDiscountPlayerId === localPlayer.id,
        }}
        barbarianTrackPosition={barbarianTrackPosition}
        knights={{
          onRecruitKnight: armKnightRecruit,
          canRecruitKnight: canRecruitKnight(localPlayer),
          onActivateKnight: activateKnight,
          onPromoteKnight: promoteKnight,
          onArmKnightMove: armKnightMove,
          onArmKnightDisplace: armKnightDisplace,
          onArmChaseRobber: armChaseRobber,
          canChaseRobber: (knight) =>
            new Set(graph.vertexTileIds.get(knight.vertexId) ?? []).has(gameState.board.robberTileId),
          onArmChasePirate: armChasePirate,
          canChasePirate: (knight) =>
            gameState.board.pirateTileId != null &&
            new Set(graph.vertexTileIds.get(knight.vertexId) ?? []).has(gameState.board.pirateTileId),
          armedKnightId: armedKnightAction?.knightId ?? null,
          knightsPromotedThisTurn,
        }}
        cityWalls={{
          onBuildWall: buildCityWall,
          pendingFreeCityWall,
          onResolveFreeWall: resolveFreeCityWall,
        }}
        progressCards={{
          progressCardDeckCounts: {
            science: progressCardDecks.science.length,
            trade: progressCardDecks.trade.length,
            politics: progressCardDecks.politics.length,
          },
          progressCardPlayHandlers,
          onPlayAlchemy: playAlchemy,
          onPlayInvention: playInvention,
          inventionSwapActive: pendingInventionSwap !== null,
          onPlayMerchantFleet: playMerchantFleet,
          merchantFleetRate,
          onPlayCommercialHarbor: playCommercialHarbor,
          onPlayTreason: playTreason,
          treasonPlacementActive: pendingTreasonPlacement?.playerId === localPlayer.id,
          onPlayDiplomacy: activateDiplomacy,
          diplomacyPickerActive: pendingDiplomacyRemoval?.playerId === localPlayer.id,
          onCancelDiplomacy: cancelDiplomacy,
        }}
        guildDues={{
          pendingGuildDues,
          guildDuesEligibleTargets,
          onSelectGuildDuesTarget: selectGuildDuesTarget,
          onConfirmGuildDues: confirmGuildDues,
          onCancelGuildDues: cancelGuildDues,
        }}
        espionage={{
          pendingEspionage,
          onSelectEspionageTarget: selectEspionageTarget,
          onConfirmEspionage: confirmEspionage,
          onCancelEspionage: cancelEspionage,
        }}
        progressDiscard={{
          activeProgressDiscarderId,
          progressDiscardSelection,
          onToggleProgressDiscard: toggleProgressDiscardSelection,
          progressDiscardRequiredCount,
          onConfirmProgressDiscard: confirmProgressDiscard,
          progressDiscardingPlayerName: progressDiscardingPlayer?.name ?? '',
        }}
        discard={{
          isMyDiscardTurn,
          discardingPlayerName: discardingPlayer?.name ?? '',
          discardRequiredCount,
          discardSelectedCount: discardSelection.length,
          onConfirmDiscard: confirmDiscard,
        }}
        roomCode={onlineInfo?.roomCode ?? null}
        viewerPlayerId={localPlayer.id}
        eventLog={eventLog}
        chat={{ chatMessages, onSendChatMessage: sendChatMessage }}
      />
```

Two spots that look surprising but are correct as written:

- **`canRecruitKnight: canRecruitKnight(localPlayer)`** — the key and the called function share a name. This is not recursion and not a shadowing bug; an object-literal key is not a binding. It is the same expression as today's `canRecruitKnight={canRecruitKnight(localPlayer)}`.
- **`canChaseRobber: (knight) => …`** — the arrow parameter stays untyped. TypeScript contextually types object-literal members against `KnightsHudState`, so `knight` infers as `KnightPiece` exactly as it does from the JSX attribute today. If (contrary to expectation) `tsc` reports an implicit `any` here, the fix is `(knight: KnightPiece) => …` plus adding `KnightPiece` to `App.tsx`'s existing `import type { … } from './game/types'` list — but do NOT add either pre-emptively.

---

## File Structure

Two files, no new files, no deletions:

- **Modify `catan-3d/src/components/hud/GameHud.tsx`** — insert 16 new non-exported interfaces above `GameHudProps` (canonical order); shrink `GameHudProps` from 102 fields to 27; replace the 102-name destructuring header with 27 names; add 7 group-destructuring `const` lines at the top of the component body; rewrite the ~60 body read sites belonging to the 9 dot-access groups.
- **Modify `catan-3d/src/App.tsx`** — rewrite the single `<GameHud …>` call site (currently lines 7298-7412) from 102 flat attributes to 11 flat attributes + 16 object-literal attributes. `App.tsx:22`'s `import { GameHud } from './components/hud/GameHud'` is unchanged; no new import is needed anywhere.

---

## A note on the plan's code blocks

Every field in this refactor keeps its **exact existing name, type, and comment**; the entire operation is a re-nesting. The code blocks below therefore show each new interface's field **signatures** in full, real form, with a marker line of the form:

```
  // [MOVE GameHud.tsx:138-143 comment block here, verbatim]
```

That marker is a precise relocation instruction against content that already exists in the repo at the named lines — it is not a placeholder for content the implementer has to invent, and nothing is left to judgment. Reproducing 388 lines of existing comments inside this plan would risk transcription drift in the one direction that matters (silently altered institutional knowledge). The `grep -c "^\s*//"` gate (must stay 388) in every task's verification is what proves the relocation was complete. Where this plan asks for a genuinely NEW comment, the comment text is given verbatim in the step.

---

## Task 1: `turn`, `dice`, `trade`, `devCards`, `picker` (28 props)

**Files:**
- Modify: `catan-3d/src/components/hud/GameHud.tsx:85-522` (interface + destructuring header; **zero body edits in this task** — all 5 groups are destructure groups whose field names are preserved)
- Modify: `catan-3d/src/App.tsx:7298-7412` (call site)
- Test: none — see Global Constraints (no test file exists for this component; `tsc` is the real gate)

**Interfaces:**
- Consumes: nothing from other tasks (this is the first).
- Produces: `TurnHudState`, `DiceHudState`, `TradeHudState`, `DevCardHudState`, `PickerHudState` (non-exported, declared in `GameHud.tsx` above `GameHudProps`), and the `turn`/`dice`/`trade`/`devCards`/`picker` props on `GameHudProps`. Establishes the group-destructuring block at the top of the component body that Tasks 2 and 4 append to.

- [ ] **Step 1: Read both regions before editing anything**

Read `catan-3d/src/components/hud/GameHud.tsx` lines 85-560 (the interface, the destructuring header, and the first derivations) and `catan-3d/src/App.tsx` lines 7298-7412 (the whole call site). Confirm the current field/attribute names match this plan's Data Model table. If anything differs, stop and report the difference rather than guessing.

- [ ] **Step 2: Add the 5 group interfaces above `GameHudProps`**

Insert immediately after `NO_METROPOLIS_PURCHASE_BLOCKED`'s closing `}` (currently `GameHud.tsx:83`) and before `interface GameHudProps {`:

```ts
// GameHud's props are grouped by mechanic rather than passed as one flat list
// (it reached 102 top-level props before this grouping). Each interface below
// is one cohesive mechanic; genuinely cross-cutting values (players,
// settlements, viewerPlayerId, winner, banner, roomCode, eventLog, and the
// two restart/return callbacks) stay flat on GameHudProps itself. Declaration
// order matches the pre-grouping prop order, because several comments below
// refer to their neighbours as "above"/"below".

interface TurnHudState {
  currentPlayerIndex: number
  // [MOVE GameHud.tsx:88-90 comment block here, verbatim]
  isMyTurn: boolean
  // [MOVE GameHud.tsx:95-96 comment block here, verbatim]
  hasRolledThisTurn: boolean
  onEndTurn: () => void
  gamePhase: GamePhase
  setupStage: SetupStage
  devCardPlayedThisTurn: boolean
}

interface DiceHudState {
  lastRoll: number | null
  lastEventDie: EventDieFace | null
  onRollDice: () => void
  isRolling: boolean
}

interface TradeHudState {
  portRates: Record<ResourceType, number>
  onTrade: (give: ResourceType, receive: ResourceType) => void
  // [MOVE GameHud.tsx:107-112 comment block here, verbatim]
  onTradeCommodity: (give: CommodityType, receive: ResourceType | CommodityType) => void
  pendingTrade: PendingTrade | null
  // [MOVE GameHud.tsx:121-125 comment block here, verbatim]
  localPlayerId: number | null
  onProposeTrade: (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => void
  onResolveTrade: (accept: boolean) => void
}

interface DevCardHudState {
  devDeckCount: number
  onBuyDevCard: () => void
  onPlayDevCard: (type: DevCardType) => void
}

interface PickerHudState {
  devCardPicker: DevCardPickerMode | null
  onResolveDevCardPicker: (picks: ResourceType[]) => void
  // [MOVE GameHud.tsx:132-136 comment block here, verbatim]
  onResolveDevCardCommodityPicker: (pick: CommodityType) => void
  // [MOVE GameHud.tsx:138-143 comment block here, verbatim]
  scienceFreeResourceActive: boolean
  onResolveScienceFreeResource: (resource: ResourceType) => void
  // [MOVE GameHud.tsx:146-152 comment block here, verbatim]
  goldFieldResourceActive: boolean
  onResolveGoldFieldResource: (resource: ResourceType) => void
}
```

Note the within-group field ordering: it follows each field's original declaration order except where the original order interleaved fields from different groups (e.g. `hasRolledThisTurn` originally sat between `onRollDice` and `onEndTurn`). Every comment's "above"/"below" reference was checked against this ordering this session and stays true.

- [ ] **Step 3: Delete those 28 fields from `GameHudProps` and add the 5 group props in their place**

In `interface GameHudProps`, the fields being removed are exactly: `currentPlayerIndex`, `isMyTurn`, `lastRoll`, `lastEventDie`, `onRollDice`, `hasRolledThisTurn`, `onEndTurn`, `gamePhase`, `setupStage`, `portRates`, `onTrade`, `onTradeCommodity`, `isRolling`, `devDeckCount`, `onBuyDevCard`, `pendingTrade`, `localPlayerId`, `onProposeTrade`, `onResolveTrade`, `onPlayDevCard`, `devCardPicker`, `onResolveDevCardPicker`, `onResolveDevCardCommodityPicker`, `scienceFreeResourceActive`, `onResolveScienceFreeResource`, `goldFieldResourceActive`, `onResolveGoldFieldResource`, `devCardPlayedThisTurn` (28), together with the comment blocks that moved with them in Step 2.

After this step the top of `GameHudProps` reads:

```ts
interface GameHudProps {
  players: Player[]
  turn: TurnHudState
  dice: DiceHudState
  banner: BannerMessage | null
  onRestart: () => void
  // [the existing canRestart comment at GameHud.tsx:103 stays put, unmoved]
  canRestart: boolean
  trade: TradeHudState
  devCards: DevCardHudState
  winner: Player | null
  settlements: Record<string, Building>
  onReturnToMenu: () => void
  picker: PickerHudState
  longestRoadHolderId: number | null
  // …every other prop in this task's scope is untouched, in its existing order
}
```

- [ ] **Step 4: Replace those 28 names in the destructuring header and add the 5 destructuring lines**

In `export function GameHud({ … }: GameHudProps) {`, remove the same 28 names and add `turn`, `dice`, `trade`, `devCards`, `picker` in the positions the removed names occupied (`turn`/`dice` after `players`, `trade`/`devCards` after `canRestart`, `picker` after `onReturnToMenu`). Then insert this block immediately after the `}: GameHudProps) {` line, before the existing `const [isTradeOpen, setIsTradeOpen] = useState(false)`:

```tsx
  // Groups whose fields feed this file's own derivations (the canX gates,
  // activePickerMode, statusLabel, the hand-limit arithmetic) are destructured
  // straight back into locals under their existing names, so those dense
  // boolean expressions below stay readable. Every OTHER prop group is read by
  // dot access at the single panel it's threaded to (knights.armedKnightId,
  // discard.discardingPlayerName, …), where the group name reads as useful
  // provenance rather than noise.
  const { currentPlayerIndex, isMyTurn, hasRolledThisTurn, onEndTurn, gamePhase, setupStage, devCardPlayedThisTurn } = turn
  const { lastRoll, lastEventDie, onRollDice, isRolling } = dice
  const { portRates, onTrade, onTradeCommodity, pendingTrade, localPlayerId, onProposeTrade, onResolveTrade } = trade
  const { devDeckCount, onBuyDevCard, onPlayDevCard } = devCards
  const {
    devCardPicker,
    onResolveDevCardPicker,
    onResolveDevCardCommodityPicker,
    scienceFreeResourceActive,
    onResolveScienceFreeResource,
    goldFieldResourceActive,
    onResolveGoldFieldResource,
  } = picker
```

- [ ] **Step 5: Confirm the component body was NOT edited**

Every name this task moved is still in scope under its exact old name, so lines 523-1304 must be untouched apart from the inserted block above.

Run: `git diff --stat catan-3d/src/components/hud/GameHud.tsx`
Then run: `git diff catan-3d/src/components/hud/GameHud.tsx` and confirm every hunk is inside the interface region or the destructuring header/insert — no hunk touches JSX.

- [ ] **Step 6: Convert this task's slice of the App.tsx call site**

In `App.tsx`, replace these flat attributes (currently lines 7300-7308, 7312-7317, 7321-7333) with the grouped attributes. The exact target — copy verbatim from the Data Model's "End state" block above — is:

```tsx
        turn={{
          currentPlayerIndex,
          isMyTurn,
          gamePhase,
          setupStage,
          hasRolledThisTurn,
          devCardPlayedThisTurn,
          onEndTurn: handleEndTurn,
        }}
        dice={{ lastRoll, lastEventDie, isRolling, onRollDice: rollDice }}
```
placed where `currentPlayerIndex={currentPlayerIndex}` is today (right after `players={players}`),

```tsx
        trade={{
          portRates: currentPlayerPortRates,
          onTrade: bankTrade,
          onTradeCommodity: tradeCommodity,
          pendingTrade,
          localPlayerId: onlineInfo?.localPlayerId ?? null,
          onProposeTrade: proposePlayerTrade,
          onResolveTrade: resolvePlayerTrade,
        }}
        devCards={{ devDeckCount: devDeck.length, onBuyDevCard: buyDevCard, onPlayDevCard: playDevCard }}
```
placed where `portRates={currentPlayerPortRates}` is today (right after `canRestart={…}`), and

```tsx
        picker={{
          devCardPicker,
          onResolveDevCardPicker: resolveDevCardPicker,
          onResolveDevCardCommodityPicker: resolveDevCardCommodityPicker,
          scienceFreeResourceActive: activeScienceFreeResourcePlayerId != null,
          onResolveScienceFreeResource: resolveScienceFreeResource,
          goldFieldResourceActive: activeGoldFieldResourcePlayerId != null,
          onResolveGoldFieldResource: resolveGoldFieldResourcePick,
        }}
```
placed where `pendingTrade={pendingTrade}` is today (right after `onReturnToMenu={returnToMenu}`).

`banner`, `onRestart`, `canRestart`, `winner`, `settlements`, `onReturnToMenu`, `players` stay exactly where they are as flat attributes. `devCardPlayedThisTurn={devCardPlayedThisTurn}` (line 7333) is absorbed into the `turn` object — do not leave a duplicate behind.

- [ ] **Step 7: Typecheck**

Run (from `catan-3d/`): `npx tsc -p tsconfig.app.json`
Expected: no output, exit 0. A missing, extra, or mistyped key in any of the 5 object literals fails here — that is the whole verification story for this task.

- [ ] **Step 8: Lint**

Run (from `catan-3d/`): `npx eslint src/App.tsx src/components/hud/GameHud.tsx`
Expected: no output, exit 0.

- [ ] **Step 9: Confirm no comment was lost**

Run (from `catan-3d/`): `grep -c "^\s*//" src/components/hud/GameHud.tsx`
Expected: **401** — the pre-task baseline of 388, plus the 6-line block comment added in Step 2 and the 7-line block comment added in Step 4. The number MUST be ≥ 388: below that means a comment block was dropped during a move — find it with `git diff` and restore it verbatim before continuing. Record the actual number; Task 2's own gate compares against it.

- [ ] **Step 10: Run the full test suite**

Run (from `catan-3d/`): `npm test`
Expected: all existing tests pass. No test touches this component; a failure here means something outside this task's scope was disturbed.

- [ ] **Step 11: Build**

Run (from `catan-3d/`): `npm run build`
Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add catan-3d/src/components/hud/GameHud.tsx catan-3d/src/App.tsx
git commit -m "refactor: group GameHud turn/dice/trade/devCards/picker props"
```

---

## Task 2: `houseRules`, `trophies`, `improvements`, `cityWalls` (16 props)

**Files:**
- Modify: `catan-3d/src/components/hud/GameHud.tsx` (interface, destructuring header, and 10 body read sites — pre-Task-1 lines 591, 648, 794-798, 809-812, 907, 909, 1295-1298)
- Modify: `catan-3d/src/App.tsx` (call site)
- Test: none — `tsc` is the gate

**Interfaces:**
- Consumes: nothing from Task 1 (disjoint field sets); appends to the group-destructuring block Task 1 created.
- Produces: `HouseRulesHudState`, `TrophyHudState`, `ImprovementHudState`, `CityWallHudState`, and the `houseRules`/`trophies`/`improvements`/`cityWalls` props. `houseRules` is a destructure group; the other three are dot-access groups — the first three dot-access groups in the plan, so this task sets that pattern for Tasks 3 and 4.

- [ ] **Step 1: Read the current state of both files' relevant regions**

Read `GameHud.tsx`'s interface region and the body lines that read these 16 props (search for `metropolisHolders`, `pendingFreeCityWall`, `craneDiscountActive`, `citiesAndKnights`), plus the current `<GameHud …>` call site in `App.tsx`. Line numbers shifted in Task 1; locate by content.

- [ ] **Step 2: Add the 4 group interfaces, in canonical order, after `PickerHudState`**

```ts
interface TrophyHudState {
  longestRoadHolderId: number | null
  longestRoadLengths: Map<number, number>
  largestArmyHolderId: number | null
  // [MOVE GameHud.tsx:159-164 comment block here, verbatim]
  metropolisHolders: MetropolisHolders
  metropolisVertexIds: Record<ImprovementTrack, string | null>
  // [MOVE GameHud.tsx:167-170 comment block here, verbatim]
  merchantHolderId: number | null
}

interface HouseRulesHudState {
  // [MOVE GameHud.tsx:177-182 comment block here, verbatim]
  citiesAndKnightsCommodities: boolean
  // [MOVE GameHud.tsx:185-190 comment block here, verbatim]
  citiesAndKnightsProgressCards: boolean
  // [MOVE GameHud.tsx:192-199 comment block here, verbatim]
  citiesAndKnightsBarbarians: boolean
  // [MOVE GameHud.tsx:204-210 comment block here, verbatim]
  citiesAndKnightsKnights: boolean
}

interface ImprovementHudState {
  onBuyImprovement: (track: ImprovementTrack) => void
  // [MOVE GameHud.tsx:172-175 comment block here, verbatim]
  pendingMetropolisTrack: ImprovementTrack | null
  // Grouped with the improvement track rather than with the other progress
  // cards: Crane is a progress card by origin, but its only consumer is
  // CityImprovementsPanel and its only meaning is "the viewer's next
  // improvement costs 1 less." Grouped by what it does here, not by which
  // rulebook chapter minted it.
  // [MOVE GameHud.tsx:287-290 comment block here, verbatim, below the note above]
  craneDiscountActive: boolean
}

interface CityWallHudState {
  // [MOVE GameHud.tsx:255-262 comment block here, verbatim]
  onBuildWall: (vertexId: string) => void
  // [MOVE GameHud.tsx:264-271 comment block here, verbatim]
  pendingFreeCityWall: number | null
  onResolveFreeWall: (vertexId: string) => void
}
```

- [ ] **Step 3: Remove those 16 fields from `GameHudProps`, add the 4 group props, keep `barbarianTrackPosition` flat**

Removed: `longestRoadHolderId`, `longestRoadLengths`, `largestArmyHolderId`, `metropolisHolders`, `metropolisVertexIds`, `merchantHolderId`, `pendingMetropolisTrack`, `citiesAndKnightsCommodities`, `onBuyImprovement`, `citiesAndKnightsProgressCards`, `citiesAndKnightsBarbarians`, `citiesAndKnightsKnights`, `onBuildWall`, `pendingFreeCityWall`, `onResolveFreeWall`, `craneDiscountActive` (16).

`barbarianTrackPosition: number` and its comment (`GameHud.tsx:201-203`) **stay exactly where they are** as a flat prop, sitting between the new `improvements` and `knights` props. Add `trophies: TrophyHudState`, `houseRules: HouseRulesHudState`, `improvements: ImprovementHudState` where the removed fields were, and `cityWalls: CityWallHudState` where `onBuildWall` was.

- [ ] **Step 4: Update the destructuring header and add the `houseRules` destructuring line**

Remove those 16 names from the header; add `trophies`, `houseRules`, `improvements`, `cityWalls` in their place. Append to the group-destructuring block Task 1 created (after the `picker` destructuring):

```tsx
  const { citiesAndKnightsCommodities, citiesAndKnightsProgressCards, citiesAndKnightsBarbarians, citiesAndKnightsKnights } =
    houseRules
```

`trophies`, `improvements`, and `cityWalls` get NO destructuring line — they are dot-access groups.

- [ ] **Step 5: Rewrite the 10 dot-access body read sites**

Exact edits (find by content; pre-Task-1 line numbers given for orientation):

```tsx
// GameHud.tsx:591 — inside metropolisPurchaseBlocked
-          evaluateMetropolisPurchase(players, settlements, metropolisHolders, metropolisVertexIds, track, viewer.id)
+          evaluateMetropolisPurchase(
+            players,
+            settlements,
+            trophies.metropolisHolders,
+            trophies.metropolisVertexIds,
+            track,
+            viewer.id,
+          )
```

```tsx
// GameHud.tsx:648
-  const freeWallActive = pendingFreeCityWall === viewer.id
+  const freeWallActive = cityWalls.pendingFreeCityWall === viewer.id
```

```tsx
// GameHud.tsx:794-798 — RankingsPanel
-          longestRoadHolderId={longestRoadHolderId}
-          longestRoadLengths={longestRoadLengths}
-          largestArmyHolderId={largestArmyHolderId}
-          metropolisHolders={metropolisHolders}
-          merchantHolderId={merchantHolderId}
+          longestRoadHolderId={trophies.longestRoadHolderId}
+          longestRoadLengths={trophies.longestRoadLengths}
+          largestArmyHolderId={trophies.largestArmyHolderId}
+          metropolisHolders={trophies.metropolisHolders}
+          merchantHolderId={trophies.merchantHolderId}
```

```tsx
// GameHud.tsx:809-812 — CityImprovementsPanel
-            onBuy={onBuyImprovement}
-            pendingMetropolisTrack={pendingMetropolisTrack}
+            onBuy={improvements.onBuyImprovement}
+            pendingMetropolisTrack={improvements.pendingMetropolisTrack}
             metropolisPurchaseBlocked={metropolisPurchaseBlocked}
-            craneDiscountActive={craneDiscountActive}
+            craneDiscountActive={improvements.craneDiscountActive}
```

```tsx
// GameHud.tsx:907,909 — ResourcePanel
-        onBuildWall={onBuildWall}
+        onBuildWall={cityWalls.onBuildWall}
         freeWallActive={freeWallActive}
-        onResolveFreeWall={onResolveFreeWall}
+        onResolveFreeWall={cityWalls.onResolveFreeWall}
```

```tsx
// GameHud.tsx:1295-1298 — VictoryBanner
-          longestRoadHolderId={longestRoadHolderId}
-          largestArmyHolderId={largestArmyHolderId}
-          metropolisHolders={metropolisHolders}
-          merchantHolderId={merchantHolderId}
+          longestRoadHolderId={trophies.longestRoadHolderId}
+          largestArmyHolderId={trophies.largestArmyHolderId}
+          metropolisHolders={trophies.metropolisHolders}
+          merchantHolderId={trophies.merchantHolderId}
```

Every read of the four `citiesAndKnights*` booleans stays a bare identifier (they are destructured) — do NOT rewrite lines 587, 635, 702, 771, 804, 815, 869, 893, 903, 1023, 1121, 1159 or any other `citiesAndKnights*` read.

- [ ] **Step 6: Convert this task's slice of the App.tsx call site**

Replace the flat `longestRoadHolderId`/`longestRoadLengths`/`largestArmyHolderId`/`metropolisHolders`/`metropolisVertexIds`/`merchantHolderId` attributes with the `trophies={{ … }}` block; the `pendingMetropolisTrack`/`citiesAndKnightsCommodities`/`onBuyImprovement`/`citiesAndKnightsProgressCards`/`citiesAndKnightsBarbarians`/`citiesAndKnightsKnights` attributes with the `houseRules={{ … }}` and `improvements={{ … }}` blocks; and the `onBuildWall`/`pendingFreeCityWall`/`onResolveFreeWall` attributes with the `cityWalls={{ … }}` block — all four copied verbatim from the Data Model's "End state" block above. `barbarianTrackPosition={barbarianTrackPosition}` stays a flat attribute, in its existing position between `improvements` and `knights`.

Note the multi-line ternary that moves into `improvements.pendingMetropolisTrack` — it is the same expression as today, just re-indented as an object property:

```tsx
          pendingMetropolisTrack:
            pendingMetropolisClaim && pendingMetropolisClaim.playerId === localPlayer.id
              ? pendingMetropolisClaim.track
              : null,
```

- [ ] **Step 7: Typecheck**

Run (from `catan-3d/`): `npx tsc -p tsconfig.app.json`
Expected: no output, exit 0.

- [ ] **Step 8: Lint**

Run (from `catan-3d/`): `npx eslint src/App.tsx src/components/hud/GameHud.tsx`
Expected: no output, exit 0.

- [ ] **Step 9: Confirm no comment was lost and no stale bare reads survive**

Run (from `catan-3d/`): `grep -c "^\s*//" src/components/hud/GameHud.tsx` — must be ≥ the count recorded at the end of Task 1 (this task adds 5 new comment lines in `ImprovementHudState`).

Run (from `catan-3d/`): `grep -n "={longestRoadHolderId}\|={metropolisHolders}\|={merchantHolderId}\|={craneDiscountActive}\|={onBuildWall}\|={onResolveFreeWall}\|={onBuyImprovement}\|={pendingMetropolisTrack}\|={largestArmyHolderId}\|={longestRoadLengths}" src/components/hud/GameHud.tsx`
Expected: **no matches.** Any match is a body read this task missed (`tsc` would already have failed, but this makes the sweep explicit).

- [ ] **Step 10: Run the full test suite**

Run (from `catan-3d/`): `npm test`
Expected: all existing tests pass.

- [ ] **Step 11: Build**

Run (from `catan-3d/`): `npm run build`
Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add catan-3d/src/components/hud/GameHud.tsx catan-3d/src/App.tsx
git commit -m "refactor: group GameHud houseRules/trophies/improvements/cityWalls props"
```

---

## Task 3: `knights`, `progressCards` (25 props)

**Files:**
- Modify: `catan-3d/src/components/hud/GameHud.tsx` (interface, destructuring header, and ~25 body read sites — pre-Task-1 lines 819-820, 873-884, 942, 997, 1011, 1016, 1023, 1052, 1057-1062, 1087, 1101, 1106, 1121, 1126, 1142, 1148)
- Modify: `catan-3d/src/App.tsx` (call site)
- Test: none — `tsc` is the gate

**Interfaces:**
- Consumes: the four destructured `citiesAndKnights*` locals from Task 2 (several progress-card widget conditions read `citiesAndKnightsProgressCards` alongside a `progressCards.*` field — those reads stay bare identifiers), and Task 1's `isMyTurn` local (same).
- Produces: `KnightsHudState`, `ProgressCardHudState`, and the `knights`/`progressCards` props. Both are dot-access groups, with the single `merchantFleetRate` local exception.

- [ ] **Step 1: Read the current state of both files' relevant regions**

Read `GameHud.tsx`'s interface region, the `KnightsPanel` render block, the whole progress-card widget column (the `flex-col-reverse` stack), and the `TradeModal`'s `canTradeCommodities` expression. Read the current `<GameHud …>` call site in `App.tsx`.

- [ ] **Step 2: Add the 2 group interfaces, in canonical order, after `HouseRulesHudState`/`ImprovementHudState`**

Canonical order places `KnightsHudState` after `ImprovementHudState` (matching `onRecruitKnight`'s original position after `citiesAndKnightsKnights`), then `CityWallHudState` (added in Task 2), then `ProgressCardHudState`.

```ts
interface KnightsHudState {
  // [MOVE GameHud.tsx:212-217 comment block here, verbatim]
  onRecruitKnight: () => void
  canRecruitKnight: boolean
  onActivateKnight: (knightId: string) => void
  onPromoteKnight: (knightId: string) => void
  // [MOVE GameHud.tsx:222-227 comment block here, verbatim]
  onArmKnightMove: (knightId: string) => void
  // [MOVE GameHud.tsx:229-231 comment block here, verbatim]
  onArmKnightDisplace: (knightId: string) => void
  // [MOVE GameHud.tsx:233-239 comment block here, verbatim]
  onArmChaseRobber: (knightId: string) => void
  canChaseRobber: (knight: KnightPiece) => boolean
  // [MOVE GameHud.tsx:242-244 comment block here, verbatim]
  onArmChasePirate: (knightId: string) => void
  canChasePirate: (knight: KnightPiece) => boolean
  armedKnightId: string | null
  // [MOVE GameHud.tsx:248-253 comment block here, verbatim]
  knightsPromotedThisTurn: Set<string>
}

interface ProgressCardHudState {
  // [MOVE GameHud.tsx:274-275 comment block here, verbatim]
  progressCardDeckCounts: Record<'science' | 'trade' | 'politics', number>
  // [MOVE GameHud.tsx:277-279 comment block here, verbatim]
  progressCardPlayHandlers: ProgressCardPlayHandlers
  // [MOVE GameHud.tsx:281-285 comment block here, verbatim]
  onPlayAlchemy: (d1: number, d2: number) => void
  // [MOVE GameHud.tsx:292-296 comment block here, verbatim]
  onPlayInvention: () => void
  // [MOVE GameHud.tsx:298-300 comment block here, verbatim]
  inventionSwapActive: boolean
  // [MOVE GameHud.tsx:302-305 comment block here, verbatim]
  onPlayMerchantFleet: (type: ResourceType | CommodityType) => void
  // [MOVE GameHud.tsx:307-310 comment block here, verbatim]
  merchantFleetRate: { playerId: number; type: ResourceType | CommodityType } | null
  // [MOVE GameHud.tsx:312-316 comment block here, verbatim]
  onPlayCommercialHarbor: (resource: ResourceType) => void
  // [MOVE GameHud.tsx:318-324 comment block here, verbatim]
  onPlayTreason: (targetPlayerId: number) => void
  // [MOVE GameHud.tsx:326-335 comment block here, verbatim]
  treasonPlacementActive: boolean
  // [MOVE GameHud.tsx:337-342 comment block here, verbatim]
  onPlayDiplomacy: () => void
  diplomacyPickerActive: boolean
  // [MOVE GameHud.tsx:345-349 comment block here, verbatim]
  onCancelDiplomacy: () => void
}
```

Note: `craneDiscountActive` sat between `onPlayAlchemy` and `onPlayInvention` in the original order and moved to `ImprovementHudState` in Task 2 — it must NOT appear here.

- [ ] **Step 3: Remove those 25 fields from `GameHudProps` and add the 2 group props**

Removed: the 12 knight fields and the 13 progress-card fields listed in Step 2. Add `knights: KnightsHudState` where `onRecruitKnight` was and `progressCards: ProgressCardHudState` where `progressCardDeckCounts` was.

- [ ] **Step 4: Update the destructuring header and add the one `merchantFleetRate` local**

Remove those 25 names from the header, add `knights` and `progressCards`. Then append to the group-destructuring block:

```tsx
  // The one field pulled out of an otherwise dot-accessed group: merchantFleetRate
  // is null-narrowed across an && chain in two places below (TradeModal's
  // canTradeCommodities gate and the Merchant Fleet widget's "Active: 2:1" line),
  // and a local keeps that narrowing obvious instead of resting on TypeScript
  // narrowing a nested property path.
  const { merchantFleetRate } = progressCards
```

- [ ] **Step 5: Rewrite the `KnightsPanel` block (12 reads)**

```tsx
// GameHud.tsx:869-886
         {citiesAndKnightsKnights && (
           <KnightsPanel
             player={viewer}
             isMyTurn={canPlayKnightActions}
-            onRecruit={onRecruitKnight}
-            onActivate={onActivateKnight}
-            onPromote={onPromoteKnight}
-            onArmMove={onArmKnightMove}
-            onArmDisplace={onArmKnightDisplace}
-            onArmChaseRobber={onArmChaseRobber}
-            onArmChasePirate={onArmChasePirate}
-            canRecruit={canRecruitKnight}
-            canPromote={(knight) => canPromoteKnight(viewer, knight) && !knightsPromotedThisTurn.has(knight.id)}
-            canChaseRobber={canChaseRobber}
-            canChasePirate={canChasePirate}
-            armedKnightId={armedKnightId}
+            onRecruit={knights.onRecruitKnight}
+            onActivate={knights.onActivateKnight}
+            onPromote={knights.onPromoteKnight}
+            onArmMove={knights.onArmKnightMove}
+            onArmDisplace={knights.onArmKnightDisplace}
+            onArmChaseRobber={knights.onArmChaseRobber}
+            onArmChasePirate={knights.onArmChasePirate}
+            canRecruit={knights.canRecruitKnight}
+            canPromote={(knight) => canPromoteKnight(viewer, knight) && !knights.knightsPromotedThisTurn.has(knight.id)}
+            canChaseRobber={knights.canChaseRobber}
+            canChasePirate={knights.canChasePirate}
+            armedKnightId={knights.armedKnightId}
           />
         )}
```

- [ ] **Step 6: Rewrite the progress-card body reads (13 sites)**

```tsx
// GameHud.tsx:819-820 — ProgressCardsPanel
-              deckCounts={progressCardDeckCounts}
-              playHandlers={progressCardPlayHandlers}
+              deckCounts={progressCards.progressCardDeckCounts}
+              playHandlers={progressCards.progressCardPlayHandlers}
```

`GameHud.tsx:942` (TradeModal's `canTradeCommodities`) and `GameHud.tsx:1057-1062` (the "Active: 2:1" line) read `merchantFleetRate` — **leave both completely unchanged**; the Step 4 local keeps them valid.

```tsx
// GameHud.tsx:997 — Alchemy widget
-              onClick={() => onPlayAlchemy(alchemyD1, alchemyD2)}
+              onClick={() => progressCards.onPlayAlchemy(alchemyD1, alchemyD2)}
```

```tsx
// GameHud.tsx:1011,1016 — Invention widget
-        {canPlayProgressCards && !inventionSwapActive && viewer.progressCards.includes('invention') && (
+        {canPlayProgressCards && !progressCards.inventionSwapActive && viewer.progressCards.includes('invention') && (
…
-              onClick={onPlayInvention}
+              onClick={progressCards.onPlayInvention}
```

```tsx
// GameHud.tsx:1023 — Invention hint
-        {citiesAndKnightsProgressCards && isMyTurn && inventionSwapActive && (
+        {citiesAndKnightsProgressCards && isMyTurn && progressCards.inventionSwapActive && (
```

```tsx
// GameHud.tsx:1052 — Merchant Fleet widget
-              onClick={() => onPlayMerchantFleet(merchantFleetType)}
+              onClick={() => progressCards.onPlayMerchantFleet(merchantFleetType)}
```

```tsx
// GameHud.tsx:1087 — Commercial Harbor widget
-              onClick={() => onPlayCommercialHarbor(commercialHarborResource)}
+              onClick={() => progressCards.onPlayCommercialHarbor(commercialHarborResource)}
```

```tsx
// GameHud.tsx:1101,1106 — Diplomacy widget
-        {canPlayProgressCards && !diplomacyPickerActive && viewer.progressCards.includes('diplomacy') && (
+        {canPlayProgressCards && !progressCards.diplomacyPickerActive && viewer.progressCards.includes('diplomacy') && (
…
-              onClick={onPlayDiplomacy}
+              onClick={progressCards.onPlayDiplomacy}
```

```tsx
// GameHud.tsx:1121,1126 — Diplomacy hint + Cancel
-        {citiesAndKnightsProgressCards && isMyTurn && diplomacyPickerActive && (
+        {citiesAndKnightsProgressCards && isMyTurn && progressCards.diplomacyPickerActive && (
…
-              onClick={onCancelDiplomacy}
+              onClick={progressCards.onCancelDiplomacy}
```

```tsx
// GameHud.tsx:1142,1148 — Treason widget
-        {canPlayProgressCards && !treasonPlacementActive && resolvedTreasonTargetId != null && viewer.progressCards.includes('treason') && (
+        {canPlayProgressCards &&
+          !progressCards.treasonPlacementActive &&
+          resolvedTreasonTargetId != null &&
+          viewer.progressCards.includes('treason') && (
…
-              onClick={() => onPlayTreason(resolvedTreasonTargetId)}
+              onClick={() => progressCards.onPlayTreason(resolvedTreasonTargetId)}
```

- [ ] **Step 7: Convert this task's slice of the App.tsx call site**

Replace the flat `onRecruitKnight` … `knightsPromotedThisTurn` attributes with the `knights={{ … }}` block, and the flat `progressCardDeckCounts` … `onCancelDiplomacy` attributes with the `progressCards={{ … }}` block, both copied verbatim from the Data Model's "End state" block above. `onBuildWall`/`pendingFreeCityWall`/`onResolveFreeWall` are already `cityWalls={{ … }}` from Task 2 and sit between them — leave that block where it is. `craneDiscountActive` is already inside `improvements={{ … }}` from Task 2 — it must NOT reappear inside `progressCards`.

- [ ] **Step 8: Typecheck**

Run (from `catan-3d/`): `npx tsc -p tsconfig.app.json`
Expected: no output, exit 0. If it reports an implicit `any` on the `knight` parameter of `canChaseRobber`/`canChasePirate`, annotate them `(knight: KnightPiece) => …` and add `KnightPiece` to `App.tsx`'s existing `import type { … } from './game/types'` — see the Data Model's note. Do not do this pre-emptively.

- [ ] **Step 9: Lint**

Run (from `catan-3d/`): `npx eslint src/App.tsx src/components/hud/GameHud.tsx`
Expected: no output, exit 0.

- [ ] **Step 10: Confirm no comment was lost and no stale bare reads survive**

Run (from `catan-3d/`): `grep -c "^\s*//" src/components/hud/GameHud.tsx` — must be ≥ the count recorded at the end of Task 2 (this task adds 5 new comment lines in Step 4).

Run (from `catan-3d/`): `grep -n "={onRecruitKnight}\|={canRecruitKnight}\|={armedKnightId}\|={onPlayInvention}\|={onPlayDiplomacy}\|={onCancelDiplomacy}\|={progressCardDeckCounts}\|={progressCardPlayHandlers}" src/components/hud/GameHud.tsx`
Expected: **no matches.**

- [ ] **Step 11: Run the full test suite**

Run (from `catan-3d/`): `npm test`
Expected: all existing tests pass.

- [ ] **Step 12: Build**

Run (from `catan-3d/`): `npm run build`
Expected: exit 0.

- [ ] **Step 13: Commit**

```bash
git add catan-3d/src/components/hud/GameHud.tsx catan-3d/src/App.tsx
git commit -m "refactor: group GameHud knights/progressCards props"
```

---

## Task 4: `guildDues`, `espionage`, `progressDiscard`, `discard`, `chat` (22 props) + final sweep

**Files:**
- Modify: `catan-3d/src/components/hud/GameHud.tsx` (interface, destructuring header, and the body reads at pre-Task-1 lines 566-567, 606, 737, 889, 1199-1232, 1240-1268, 1283-1287)
- Modify: `catan-3d/src/App.tsx` (call site)
- Test: none — `tsc` is the gate

**Interfaces:**
- Consumes: nothing from Tasks 1-3 (disjoint field sets); appends to the same group-destructuring block.
- Produces: `GuildDuesHudState`, `EspionageHudState`, `ProgressDiscardHudState`, `DiscardHudState`, `ChatHudState`, and the final shape of `GameHudProps` — 27 top-level props. This is the last task of the sub-plan and of the whole 8-sub-plan project.

- [ ] **Step 1: Read the current state of both files' relevant regions**

Read `GameHud.tsx`'s interface region, the two modal-focus-trap lines, `pickerBlocked`, `statusLabel`, the progress-card hand-limit block, both dialog blocks, the `DiscardPanel` render, and the `ChatBoxPanel` line. Read the current `<GameHud …>` call site.

- [ ] **Step 2: Add the 5 group interfaces, in canonical order, after `ProgressCardHudState`**

```ts
interface GuildDuesHudState {
  // [MOVE GameHud.tsx:351-357 comment block here, verbatim]
  pendingGuildDues: { targetId: number } | null
  guildDuesEligibleTargets: Player[]
  onSelectGuildDuesTarget: (playerId: number) => void
  onConfirmGuildDues: (picks: (ResourceType | CommodityType)[]) => void
  onCancelGuildDues: () => void
}

interface EspionageHudState {
  // [MOVE GameHud.tsx:363-366 comment block here, verbatim]
  pendingEspionage: { targetId: number } | null
  onSelectEspionageTarget: (playerId: number) => void
  onConfirmEspionage: (indices: number[]) => void
  onCancelEspionage: () => void
}

interface ProgressDiscardHudState {
  // [MOVE GameHud.tsx:371-377 comment block here, verbatim]
  activeProgressDiscarderId: number | null
  // [MOVE GameHud.tsx:379-382 comment block here, verbatim]
  progressDiscardSelection: number[]
  onToggleProgressDiscard: (index: number) => void
  // [MOVE GameHud.tsx:385-389 comment block here, verbatim]
  progressDiscardRequiredCount: number
  onConfirmProgressDiscard: () => void
  // [MOVE GameHud.tsx:392-393 comment block here, verbatim]
  progressDiscardingPlayerName: string
}

interface DiscardHudState {
  // [MOVE GameHud.tsx:395-397 comment block here, verbatim]
  isMyDiscardTurn: boolean
  discardingPlayerName: string
  discardRequiredCount: number
  discardSelectedCount: number
  onConfirmDiscard: () => void
}

interface ChatHudState {
  // [MOVE GameHud.tsx:414 comment line here, verbatim]
  chatMessages: ChatMessagePayload[]
  onSendChatMessage: (text: string) => void
}
```

- [ ] **Step 3: Remove those 22 fields from `GameHudProps` and add the 5 group props — this is the final shape**

After this step `GameHudProps` has exactly 27 top-level props. The whole interface reads:

```ts
interface GameHudProps {
  players: Player[]
  turn: TurnHudState
  dice: DiceHudState
  banner: BannerMessage | null
  onRestart: () => void
  // [the existing canRestart comment stays put]
  canRestart: boolean
  trade: TradeHudState
  devCards: DevCardHudState
  winner: Player | null
  settlements: Record<string, Building>
  onReturnToMenu: () => void
  picker: PickerHudState
  trophies: TrophyHudState
  houseRules: HouseRulesHudState
  improvements: ImprovementHudState
  // [the existing barbarianTrackPosition comment stays put]
  barbarianTrackPosition: number
  knights: KnightsHudState
  cityWalls: CityWallHudState
  progressCards: ProgressCardHudState
  guildDues: GuildDuesHudState
  espionage: EspionageHudState
  progressDiscard: ProgressDiscardHudState
  discard: DiscardHudState
  // [the existing roomCode comment stays put]
  roomCode: string | null
  // [the existing viewerPlayerId comment stays put]
  viewerPlayerId: number
  eventLog: EventLogEntry[]
  chat: ChatHudState
}
```

- [ ] **Step 4: Update the destructuring header and add the `progressDiscard` destructuring line**

The header becomes exactly those 27 names. Append to the group-destructuring block:

```tsx
  const {
    activeProgressDiscarderId,
    progressDiscardSelection,
    onToggleProgressDiscard,
    progressDiscardRequiredCount,
    onConfirmProgressDiscard,
    progressDiscardingPlayerName,
  } = progressDiscard
```

`guildDues`, `espionage`, `discard`, and `chat` get NO destructuring line.

- [ ] **Step 5: Rewrite the Guild Dues / Espionage body reads**

```tsx
// GameHud.tsx:566-567
-  const guildDuesDialogRef = useModalFocusTrap<HTMLDivElement>(onCancelGuildDues)
-  const espionageDialogRef = useModalFocusTrap<HTMLDivElement>(onCancelEspionage)
+  const guildDuesDialogRef = useModalFocusTrap<HTMLDivElement>(guildDues.onCancelGuildDues)
+  const espionageDialogRef = useModalFocusTrap<HTMLDivElement>(espionage.onCancelEspionage)
```

```tsx
// GameHud.tsx:606
-  const pickerBlocked = !!activePickerMode || !!pendingGuildDues || !!pendingEspionage
+  const pickerBlocked = !!activePickerMode || !!guildDues.pendingGuildDues || !!espionage.pendingEspionage
```

```tsx
// GameHud.tsx:1199,1215-1217,1227-1232 — the Guild Dues dialog
-      {pendingGuildDues && (
+      {guildDues.pendingGuildDues && (
…
-                players={guildDuesEligibleTargets}
-                selectedPlayerId={pendingGuildDues.targetId}
-                onSelect={onSelectGuildDuesTarget}
+                players={guildDues.guildDuesEligibleTargets}
+                selectedPlayerId={guildDues.pendingGuildDues.targetId}
+                onSelect={guildDues.onSelectGuildDuesTarget}
…
-              key={pendingGuildDues.targetId}
-              target={players.find((p) => p.id === pendingGuildDues.targetId) ?? guildDuesEligibleTargets[0] ?? viewer}
+              key={guildDues.pendingGuildDues.targetId}
+              target={
+                players.find((p) => p.id === guildDues.pendingGuildDues!.targetId) ??
+                guildDues.guildDuesEligibleTargets[0] ??
+                viewer
+              }
…
-              onConfirm={(picks) => onConfirmGuildDues(picks as (ResourceType | CommodityType)[])}
-              onCancel={onCancelGuildDues}
+              onConfirm={(picks) => guildDues.onConfirmGuildDues(picks as (ResourceType | CommodityType)[])}
+              onCancel={guildDues.onCancelGuildDues}
```

**Narrowing note, read before editing:** today's `{pendingGuildDues && ( … pendingGuildDues.targetId … )}` narrows the bare local for the whole JSX subtree. TypeScript narrows property access paths the same way, so `guildDues.pendingGuildDues.targetId` compiles inside the guarded subtree in most positions — but narrowing is NOT preserved inside the arrow function passed to `players.find(…)`'s sibling expression on the same line if TS decides the path may have changed. Try it WITHOUT the `!` first: remove the `!` from the `target={…}` snippet above, run `npx tsc -p tsconfig.app.json`, and keep the un-asserted version if it compiles. Only if `tsc` reports "possibly null" here, restore the `!` exactly as shown — it is guarded by the enclosing `guildDues.pendingGuildDues &&`, so it is safe either way, but the un-asserted form is preferred.

```tsx
// GameHud.tsx:1240,1257-1258,1263-1268 — the Espionage dialog
-      {pendingEspionage && (
+      {espionage.pendingEspionage && (
…
-                selectedPlayerId={pendingEspionage.targetId}
-                onSelect={onSelectEspionageTarget}
+                selectedPlayerId={espionage.pendingEspionage.targetId}
+                onSelect={espionage.onSelectEspionageTarget}
…
-              key={pendingEspionage.targetId}
-              target={players.find((p) => p.id === pendingEspionage.targetId) ?? otherPlayers[0] ?? viewer}
+              key={espionage.pendingEspionage.targetId}
+              target={players.find((p) => p.id === espionage.pendingEspionage!.targetId) ?? otherPlayers[0] ?? viewer}
…
-              onConfirm={(picks) => onConfirmEspionage(picks as number[])}
-              onCancel={onCancelEspionage}
+              onConfirm={(picks) => espionage.onConfirmEspionage(picks as number[])}
+              onCancel={espionage.onCancelEspionage}
```

Same narrowing note applies to the `!` here — try without it first.

- [ ] **Step 6: Rewrite the discard and chat body reads**

The 6 `progressDiscard` fields are destructured, so the hand-limit block (`GameHud.tsx:836-863`), `isMyProgressDiscardTurn` (573), and `ProgressCardsPanel`'s `discardSelection`/`onToggleDiscard` (823-824) stay **completely unchanged**. Only these change:

```tsx
// GameHud.tsx:737 — statusLabel
-          ? `${discardingPlayerName} discarding…`
+          ? `${discard.discardingPlayerName} discarding…`
```

```tsx
// GameHud.tsx:889 — ChatBoxPanel
-      {roomCode && <ChatBoxPanel messages={chatMessages} players={players} onSend={onSendChatMessage} />}
+      {roomCode && <ChatBoxPanel messages={chat.chatMessages} players={players} onSend={chat.onSendChatMessage} />}
```

```tsx
// GameHud.tsx:1281-1289 — DiscardPanel
       {gamePhase === 'discard' && (
         <DiscardPanel
-          isMyDiscardTurn={isMyDiscardTurn}
-          discardingPlayerName={discardingPlayerName}
-          requiredCount={discardRequiredCount}
-          selectedCount={discardSelectedCount}
-          onConfirm={onConfirmDiscard}
+          isMyDiscardTurn={discard.isMyDiscardTurn}
+          discardingPlayerName={discard.discardingPlayerName}
+          requiredCount={discard.discardRequiredCount}
+          selectedCount={discard.discardSelectedCount}
+          onConfirm={discard.onConfirmDiscard}
         />
       )}
```

- [ ] **Step 7: Convert the last slice of the App.tsx call site**

Replace the remaining flat attributes — `pendingGuildDues` … `onCancelGuildDues`, `pendingEspionage` … `onCancelEspionage`, `activeProgressDiscarderId` … `progressDiscardingPlayerName`, `isMyDiscardTurn` … `onConfirmDiscard`, and `chatMessages`/`onSendChatMessage` — with the `guildDues={{ … }}`, `espionage={{ … }}`, `progressDiscard={{ … }}`, `discard={{ … }}`, and `chat={{ … }}` blocks, copied verbatim from the Data Model's "End state" block above. `roomCode`, `viewerPlayerId`, and `eventLog` stay flat, in their existing positions between `discard` and `chat`.

- [ ] **Step 8: Verify the call site matches the plan's end state exactly**

Read the whole `<GameHud … />` element in `App.tsx` and diff it by eye against the Data Model's "End state" block. It must have 27 attributes: 11 flat (`players`, `banner`, `onRestart`, `canRestart`, `winner`, `settlements`, `onReturnToMenu`, `barbarianTrackPosition`, `roomCode`, `viewerPlayerId`, `eventLog`) and 16 object literals.

- [ ] **Step 9: Typecheck**

Run (from `catan-3d/`): `npx tsc -p tsconfig.app.json`
Expected: no output, exit 0.

- [ ] **Step 10: Lint**

Run (from `catan-3d/`): `npx eslint src/App.tsx src/components/hud/GameHud.tsx`
Expected: no output, exit 0.

- [ ] **Step 11: Final sweep — comment count, prop count, and no stale reads**

Run (from `catan-3d/`): `grep -c "^\s*//" src/components/hud/GameHud.tsx`
Expected: ≥ **388** (the pre-Task-1 baseline; the four tasks add ~23 new comment lines of their own, so a number in the low 410s is the expected outcome). **A number below 388 means a comment block was dropped — find it via `git diff main -- catan-3d/src/components/hud/GameHud.tsx` and restore it verbatim before continuing.**

Run (from `catan-3d/`): `grep -c "^  [a-zA-Z]" src/components/hud/GameHud.tsx` is NOT a reliable prop count — instead read `interface GameHudProps` in full and confirm it lists exactly the 27 props from Step 3, in that order.

Run (from `catan-3d/`): `grep -n "={pendingGuildDues}\|={pendingEspionage}\|={chatMessages}\|={onSendChatMessage}\|={isMyDiscardTurn}\|={onConfirmDiscard}" src/components/hud/GameHud.tsx`
Expected: **no matches.**

- [ ] **Step 12: Run the full test suite**

Run (from `catan-3d/`): `npm test`
Expected: all existing tests pass — the same count as on `main`, since nothing under `src/game/` or `src/data/` was touched by any task in this sub-plan.

- [ ] **Step 13: Build**

Run (from `catan-3d/`): `npm run build`
Expected: exit 0.

- [ ] **Step 14: Whole-branch behavior audit before committing**

Run: `git diff main -- catan-3d/src/App.tsx` and confirm that **every removed flat attribute's value expression appears verbatim as an object property** — same function reference, same comparison, same `?? null` fallback, same ternary. This is the one check `tsc` cannot do for you: it verifies types, not that `onTrade: bankTrade` didn't become `onTrade: tradeCommodity`. Walk the 102 values once, against the Data Model's End state block.

- [ ] **Step 15: Commit**

```bash
git add catan-3d/src/components/hud/GameHud.tsx catan-3d/src/App.tsx
git commit -m "refactor: group GameHud guildDues/espionage/discard/chat props, completing the 102-prop regrouping"
```

---

## After the last task

This sub-plan is the 8th and FINAL sub-plan of the "App.tsx Reducer Refactor" project. Once this branch merges, the whole project — broadcast dispatcher, queue-mechanics helper, five `GameState` reducer slices, and this prop restructuring — is complete.

Standard project workflow from here (the controller's steps, not this plan's):

1. `superpowers:requesting-code-review` for a final whole-branch review on the most capable model, per this project's own precedent (Sub-plan 1's review is what caught the vacuous `tsc --noEmit` gate; Sub-plan 5's caught a real stale-closure bug).
2. Push the branch and hand the PR-creation URL to the user — there is no `gh` CLI in this environment.
3. Kill any `vite` child process holding the worktree before the worktree is removed.
4. Update `MEMORY.md`'s `project_apptsx_reducer_refactor.md` entry to PROJECT COMPLETE.

---

## Self-Review

**Spec coverage.** The spec's only requirement for this sub-plan is its "### GameHud props (final sub-plan only)" section: group related props into cohesive objects, with `pickerState` as the named example, decided against the actual final prop list. Task 1 implements that exact example as `picker` (all four named props plus the two commodity/gold resolvers). The other 15 groups cover the remaining 84 grouped props, and the 11 singletons are enumerated with reasons. Ponytail-Audit finding #4 (flat 100+-entry interface, no internal structure for new mechanics to fit into) is closed: a new picker/queue mechanic now extends an existing group interface instead of adding top-level props. Sequencing item 7 ("GameHud prop restructuring — last, once the final shape is known") is satisfied — Sub-plan 7 merged at `8866566`.

**Placeholder scan.** No "TBD", no "implement later", no "add appropriate X", no "similar to Task N". Every task repeats its own full code rather than referring back. The `// [MOVE GameHud.tsx:NNN-MMM comment block here, verbatim]` markers are relocation instructions against content that exists in the repo at the named, verified line ranges — see "A note on the plan's code blocks" — and every one of them is backed by the `grep -c "^\s*//"` ≥ 388 gate in each task.

**Type consistency.** The 16 interface names used in the task steps (`TurnHudState`, `DiceHudState`, `TradeHudState`, `DevCardHudState`, `PickerHudState`, `TrophyHudState`, `HouseRulesHudState`, `ImprovementHudState`, `KnightsHudState`, `CityWallHudState`, `ProgressCardHudState`, `GuildDuesHudState`, `EspionageHudState`, `ProgressDiscardHudState`, `DiscardHudState`, `ChatHudState`) match the Data Model table and the final `GameHudProps` in Task 4 Step 3 one-for-one. The 16 prop names (`turn`, `dice`, `trade`, `devCards`, `picker`, `trophies`, `houseRules`, `improvements`, `knights`, `cityWalls`, `progressCards`, `guildDues`, `espionage`, `progressDiscard`, `discard`, `chat`) match between the Data Model table, the End state call site, every task's body-edit snippets, and the final interface. Field counts sum to 91 grouped + 11 flat = 102, matching the live count confirmed on both sides this session. No new type is referenced that isn't declared by a task, and every type used inside the group interfaces (`GamePhase`, `SetupStage`, `EventDieFace`, `ResourceType`, `CommodityType`, `DevCardType`, `DevCardPickerMode`, `ImprovementTrack`, `MetropolisHolders`, `KnightPiece`, `Player`, `Building`, `PendingTrade`, `ProgressCardPlayHandlers`, `ChatMessagePayload`, `BannerMessage`, `EventLogEntry`) is already imported at the top of `GameHud.tsx` — no import line changes anywhere in this sub-plan.
