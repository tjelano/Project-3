# Graph Report - apptsx-refactor-gamehud-props  (2026-08-26)

## Corpus Check
- 198 files · ~2,430,426 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1944 nodes · 3281 edges · 117 communities (108 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e0da7fc4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- gameState.ts
- dependencies
- types.ts
- devDependencies
- useRoomChannel.ts
- GameHud.tsx
- 🔵 S3 — Architecture & long-term health.
- compilerOptions
- Image Prompt Engineer Agent
- Persona Walkthrough Specialist
- hexTerrain.ts
- compilerOptions
- ArchitectUX Agent Personality
- cityImprovements.ts
- Data Engineer Agent
- hexBoard.ts
- Brand Guardian Agent Personality
- Dice3D.tsx
- UX Researcher Agent Personality
- Whimsy Injector Agent Personality
- DevOps Automator Agent Personality
- UI Designer Agent Personality
- Frontend Developer Agent Personality
- RoomLobby.tsx
- Visual Storyteller Agent
- Backend Architect Agent Personality
- API Tester Agent Personality
- AI Engineer Agent
- Prompt Engineer
- RobberLayer.tsx
- UI Finish-Gate Reviewer Agent Personality
- Reused Patterns (verified against current code, exact citations)
- Player
- App.tsx
- App.tsx Reducer Refactor — Sub-plan 8 (FINAL): `GameHud` prop grouping
- CatanBoard.tsx
- File Structure
- Global Constraints
- useModalFocusTrap
- BoardShapeEditor.tsx
- CommodityType
- Data Model — `PendingQueuesState`'s 7 Fields, Verified This Session
- GameSetupMenu.tsx
- StartScreen.tsx
- PortMarkers.tsx
- testNetworkSync.ts
- Global Constraints
- React + TypeScript + Vite
- RegionSelectMenu.tsx
- benchmark.js
- boardGraph.ts
- PlayerHand3D.tsx
- BoardInteractions.tsx
- Cities & Knights — Commodities & City Improvements (Phase A) — Design Spec
- Seafarers — Ships & Open Sea (Phase 4 of the C&K/Seafarers plan)
- App.tsx Reducer Refactor — Finishing the Players-Slice Migration
- Building
- Master Development Blueprint v12: Project-3 (3D Multiplayer Catan)
- ResourcePanel.tsx
- Global Constraints
- Global Constraints
- Cities & Knights — Progress Cards (Phase B) — Design Spec
- Cities & Knights — Knights & City Walls (Phase C1) — Design Spec
- Game State Reducer — Design Spec
- CodeRabbit Findings Fix Report — PR #16 (Knights & City Walls)
- JoinRoomModal.tsx
- matchSnapshot.ts
- useRoomChannel
- 📸 Inclusive Visuals Specialist
- File Structure
- App.tsx Reducer Refactor — Sub-plan 7: `pendingTrade` + `freeRoadsRemaining`
- Hidden Tiles House Rule — Design Spec
- Cities & Knights — Barbarian Track & Attacks (Phase C2) — Design Spec
- Seafarers — Rules Reference
- SRE (Site Reliability Engineer) Agent
- Conventions
- Global Constraints
- Sub-plan 5: City Improvements + Merchant + Turn-Misc
- Seafarers Robber & Pirate Migration Implementation Plan
- Custom Map Editor v2 — Design
- Game State Reducer — Players Slice Design Spec
- AGENTS
- FreeCameraControls.tsx
- KnightPiece
- Seafarers Ships & Longest Route Implementation Plan
- Baseline (confirmed this session)
- Global Constraints
- scripts
- Global Constraints
- Sub-plan 6: Final Cutover
- Global Constraints
- App.tsx Reducer Refactor — Sub-plan 4: C&K Board-Piece Bucket (Board + Progress)
- App.tsx Reducer Refactor — Sub-plan 5: Decks & Trophies Bucket
- Cities & Knights 5–6 Player Expansion — Rules Reference
- CanvasErrorBoundary
- EventDieFace
- Seafarers Board Foundation Implementation Plan
- Global Constraints
- .prettierrc.json
- Global Constraints
- Cities & Knights — Progress Cards Reference
- benchmark.cjs
- catan-3d/package.json
- MemoryStorage
- Base CATAN — Sanity Check vs. `catan-3d/src/game/types.ts`
- vite-env.d.ts
- bolt.md
- dependencies
- tsconfig.json
- tsx
- @types/node
- @types/react
- typescript
- vitest
- CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `App()` - 65 edges
2. `Player` - 35 edges
3. `ResourceType` - 33 edges
4. `Building` - 28 edges
5. `ImprovementTrack` - 25 edges
6. `CommodityType` - 22 edges
7. `GameRules` - 19 edges
8. `compilerOptions` - 19 edges
9. `PlayerColorToken` - 18 edges
10. `ProgressCardType` - 18 edges

## Surprising Connections (you probably didn't know these)
- `App()` --indirect_call--> `reduceGame()`  [INFERRED]
  catan-3d/src/App.tsx → catan-3d/src/game/gameState.ts
- `DockModelMesh()` --calls--> `useClonedModel()`  [EXTRACTED]
  catan-3d/src/components/PortMarkers.tsx → catan-3d/src/hooks/useClonedModel.ts
- `RobberTileGlow()` --calls--> `getTileEdgeOverlay()`  [EXTRACTED]
  catan-3d/src/components/RobberLayer.tsx → catan-3d/src/three/hexTerrain.ts
- `DevCardResourcePickerProps` --references--> `ResourceType`  [EXTRACTED]
  catan-3d/src/components/hud/DevCardResourcePicker.tsx → catan-3d/src/game/types.ts
- `DevCardHudState` --references--> `DevCardType`  [EXTRACTED]
  catan-3d/src/components/hud/GameHud.tsx → catan-3d/src/game/types.ts

## Import Cycles
- 3-file cycle: `catan-3d/src/App.tsx -> catan-3d/src/components/hud/GameHud.tsx -> catan-3d/src/components/hud/EventLogPanel.tsx -> catan-3d/src/App.tsx`
- 3-file cycle: `catan-3d/src/App.tsx -> catan-3d/src/components/hud/GameHud.tsx -> catan-3d/src/components/hud/EventBanner.tsx -> catan-3d/src/App.tsx`

## Communities (117 total, 9 thin omitted)

### Community 0 - "gameState.ts"
Cohesion: 0.05
Nodes (66): cache, playSfx(), SFX_URLS, SfxKey, ImprovementHudState, TrophyHudState, PROGRESS_CARD_ART, ProgressCardsPanel() (+58 more)

### Community 1 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, postprocessing, react, react-dom, @react-three/drei, @react-three/fiber, @react-three/postprocessing, @react-three/rapier (+15 more)

### Community 2 - "types.ts"
Cohesion: 0.09
Nodes (42): playerWithCities(), applyStealTransfer(), PlayersAction, reducePlayers(), buildDevCardDeck(), BuildingType, buildSetupOrder(), CITY_COST (+34 more)

### Community 3 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @types/react-dom, @types/three (+13 more)

### Community 4 - "useRoomChannel.ts"
Cohesion: 0.06
Nodes (40): ResourceType, StolenItem, BankTradePayload, BarbarianShipAdvancedPayload, CityWallBuiltPayload, CommercialHarborPlayedPayload, DevCardBoughtPayload, DiplomacyPlayedPayload (+32 more)

### Community 5 - "GameHud.tsx"
Cohesion: 0.07
Nodes (29): BannerMessage, DevCardPickerMode, EventLogEntry, BuildingCostsPanel(), RECIPES, RESOURCE_ICONS, DiscardPanel(), EventBanner() (+21 more)

### Community 6 - "🔵 S3 — Architecture & long-term health."
Cohesion: 0.05
Nodes (36): Catan 3D — Technical & Design Audit, How to check Wave 3, New dependencies implied, **Overall: 4.3 / 10** against a commercial bar, Progress, S0-1 · Longest Road is never surrendered when the network is broken, S0-2 · Setup roads may be placed anywhere on the board, S0-3 · Hidden Victory Point cards are leaked to every player (+28 more)

### Community 7 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+18 more)

### Community 8 - "Image Prompt Engineer Agent"
Cohesion: 0.05
Nodes (36): Advanced Capabilities, Advanced Prompt Patterns, Cinematic Portrait, Critical Rules You Must Follow, Environment & Setting Layer, Environmental Portrait, Example Prompt Templates, Fashion Photography (+28 more)

### Community 9 - "Persona Walkthrough Specialist"
Cohesion: 0.06
Nodes (35): 🚀 Advanced Capabilities, Analyst Assessment Template (per fold), Cialdini's 7 Principles, 💭 Communication Style, Competitive Walkthrough, 🎯 Core Mission, 🚨 Critical Rules, Cross-Cultural Adaptation (+27 more)

### Community 10 - "hexTerrain.ts"
Cohesion: 0.10
Nodes (29): isAdjacentToPlayerBuilding(), isLandTile(), LAND_BIOMES, MerchantLayer(), MerchantTileGlow(), MerchantTileTarget(), RobberTileTarget(), EXCLUDED_NUMBERS (+21 more)

### Community 11 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+13 more)

### Community 12 - "ArchitectUX Agent Personality"
Cohesion: 0.07
Nodes (29): 🚀 Advanced Capabilities, ArchitectUX Agent Personality, Bridge PM and Development, Create Developer-Ready Foundations, 🚨 Critical Rules You Must Follow, CSS Architecture Mastery, CSS Design System Foundation, Developer Experience (+21 more)

### Community 13 - "cityImprovements.ts"
Cohesion: 0.15
Nodes (24): CityImprovementsPanel(), CityImprovementsPanelProps, buyImprovementLevel(), canAffordImprovement(), evaluateMetropolisPurchase(), hasSpareMetropolisCity(), improvementLevelCost(), metropolisHolderAfterPurchase() (+16 more)

### Community 14 - "Data Engineer Agent"
Cohesion: 0.07
Nodes (28): 🚀 Advanced Capabilities, Advanced Lakehouse Patterns, Architecture Principles, Cloud Platform Mastery, 🚨 Critical Rules You Must Follow, Data Engineer Agent, Data Pipeline Engineering, Data Platform Architecture (+20 more)

### Community 15 - "hexBoard.ts"
Cohesion: 0.11
Nodes (26): allocateProportional(), BIOME_OVERRIDES_BY_SHAPE, BIOME_WEIGHTS, BOARD_SHAPE_LABELS, BOARD_SHAPES, buildBiomePool(), buildHexBoard(), buildHexBoardFromCells() (+18 more)

### Community 16 - "Brand Guardian Agent Personality"
Cohesion: 0.07
Nodes (27): 🚀 Advanced Capabilities, Brand-First Approach, Brand Foundation Framework, Brand Guardian Agent Personality, Brand Protection Expertise, Brand Strategy Mastery, Brand Voice and Messaging, Create Comprehensive Brand Foundations (+19 more)

### Community 17 - "Dice3D.tsx"
Cohesion: 0.07
Nodes (42): BoardFrame(), buildRingGeometry(), traceRoundedRect(), createRestingAnim(), Dice3D(), Dice3DProps, DiceRollTarget, DieAnimState (+34 more)

### Community 18 - "UX Researcher Agent Personality"
Cohesion: 0.07
Nodes (27): 🚀 Advanced Capabilities, Behavioral Analysis Mastery, 🚨 Critical Rules You Must Follow, Ethical Research Practices, Insight Communication, 🔄 Learning & Memory, Pattern Recognition, Provide Actionable Insights (+19 more)

### Community 19 - "Whimsy Injector Agent Personality"
Cohesion: 0.07
Nodes (27): 🚀 Advanced Capabilities, Balance Delight with Usability, Brand Personality Framework, Brand Personality Integration, Create Memorable Experiences, 🚨 Critical Rules You Must Follow, Gamification Mastery, Gamification System Design (+19 more)

### Community 20 - "DevOps Automator Agent Personality"
Cohesion: 0.07
Nodes (27): 🚀 Advanced Capabilities, Automate Infrastructure and Deployments, Automation-First Approach, CI/CD Excellence, CI/CD Pipeline Architecture, 🚨 Critical Rules You Must Follow, DevOps Automator Agent Personality, Ensure System Reliability and Scalability (+19 more)

### Community 21 - "UI Designer Agent Personality"
Cohesion: 0.07
Nodes (26): 🚀 Advanced Capabilities, Component Library Architecture, Craft Pixel-Perfect Interfaces, Create Comprehensive Design Systems, 🚨 Critical Rules You Must Follow, Design System First Approach, Design System Mastery, Developer Collaboration (+18 more)

### Community 22 - "Frontend Developer Agent Personality"
Cohesion: 0.08
Nodes (25): Accessibility and Inclusive Design, Accessibility Leadership, 🚀 Advanced Capabilities, Create Modern Web Applications, 🚨 Critical Rules You Must Follow, Editor Integration Engineering, Frontend Developer Agent Personality, 🔄 Learning & Memory (+17 more)

### Community 23 - "RoomLobby.tsx"
Cohesion: 0.12
Nodes (21): CopyIcon(), EyeIcon(), RoomCodeTag(), ALL_COLOR_TOKENS, comparePlayers(), groupOffsetStyle(), LAYOUT, PLAYER_ROWS_OFFSET (+13 more)

### Community 24 - "Visual Storyteller Agent"
Cohesion: 0.08
Nodes (24): 🚀 Advanced Capabilities, 🚨 Critical Rules You Must Follow, Cross-Platform Adaptation, Cross-Platform Visual Strategy, Information Design & Data Visualization, Multimedia Content Creation, Multimedia Design Excellence, Step 1: Story Strategy Development (+16 more)

### Community 25 - "Backend Architect Agent Personality"
Cohesion: 0.08
Nodes (24): 🚀 Advanced Capabilities, API Contract Governance, API Design Specification, Backend Architect Agent Personality, Cloud Infrastructure Expertise, 🚨 Critical Rules You Must Follow, Data Evolution & Migration Safety, Data/Schema Engineering Excellence (+16 more)

### Community 26 - "API Tester Agent Personality"
Cohesion: 0.08
Nodes (24): 🚀 Advanced Capabilities, API Tester Agent Personality, Comprehensive API Test Suite Example, Comprehensive API Testing Strategy, 🚨 Critical Rules You Must Follow, Integration and Documentation Testing, 🔄 Learning & Memory, Performance and Security Validation (+16 more)

### Community 27 - "AI Engineer Agent"
Cohesion: 0.08
Nodes (23): 🚀 Advanced Capabilities, Advanced ML Architecture, AI Engineer Agent, AI Ethics and Safety, AI Ethics & Safety Implementation, AI Safety and Ethics Standards, 🚨 Critical Rules You Must Follow, Intelligent System Development (+15 more)

### Community 28 - "Prompt Engineer"
Cohesion: 0.09
Nodes (22): 🚀 Advanced Capabilities, Chain-of-Thought and Reasoning Scaffolds, 🚨 Critical Rules You Must Follow, Dynamic Prompt Assembly, Few-Shot Example Builder, 🔄 Learning & Memory, Multi-Model Prompt Porting, Phase 1: Requirements Translation (+14 more)

### Community 29 - "RobberLayer.tsx"
Cohesion: 0.14
Nodes (14): CITY_URLS, CityMesh(), ROAD_URLS, RoadMesh(), SETTLEMENT_URLS, SettlementMesh(), ModelErrorBoundary, Props (+6 more)

### Community 30 - "UI Finish-Gate Reviewer Agent Personality"
Cohesion: 0.09
Nodes (21): 💭 Communication Style, 📋 Concrete Deliverables, Create a Design Contract, 🚨 Critical Rules You Must Follow, Evidence Before Opinion, Example: Generic Analytics Dashboard, Example: Mobile Operations Screen, Example: SaaS Setup Flow (+13 more)

### Community 31 - "Reused Patterns (verified against current code, exact citations)"
Cohesion: 0.10
Nodes (20): Cities & Knights — Progress Cards (Phase B) Implementation Plan, Global Constraints, Reused Patterns (verified against current code, exact citations), Task 10: All-players-respond cards — Resource Monopoly, Trade Monopoly, Sabotage, Wedding, Task 11: Guild Dues and Espionage — view-and-take from a targeted opponent, Task 12: Commercial Harbor and Diplomacy, Task 13: Merchant board piece, Task 14: progressRoadBuilding — reuse the free-roads counter (+12 more)

### Community 32 - "Player"
Cohesion: 0.19
Nodes (14): ChatBoxPanel(), TEXT_CLASS, PlayerTargetPicker(), PlayerTargetPickerProps, ResourceIcon(), TradeModal(), TradeModalProps, TradeMode (+6 more)

### Community 33 - "App.tsx"
Cohesion: 0.10
Nodes (37): App(), FREE_CAM_HINT_POSITION, heldItemsFor(), isValidCostOverride(), pickRandom(), randomInt(), randomSeedString(), validateStolenItem() (+29 more)

### Community 34 - "App.tsx Reducer Refactor — Sub-plan 8 (FINAL): `GameHud` prop grouping"
Cohesion: 0.10
Nodes (19): A note on the plan's code blocks, Access-pattern rule (binding, no per-field judgment), After the last task, App.tsx Reducer Refactor — Sub-plan 8 (FINAL): `GameHud` prop grouping, Behavior-change analysis (the one risk, verified safe), Data Model — the 16 groups and the 11 singletons, End state — the complete call site after all 4 tasks, File Structure (+11 more)

### Community 35 - "CatanBoard.tsx"
Cohesion: 0.16
Nodes (16): BIOME_CHIT_Y_OFFSET, BIOME_MODEL_ROTATION_Y, BIOME_MODEL_URLS, BiomeTileModel(), CatanBoard, HexTile, NO_TILES, randomHexRotation() (+8 more)

### Community 36 - "File Structure"
Cohesion: 0.11
Nodes (17): After All Tasks, File Structure, Game State Reducer — Board Slice Implementation Plan, Global Constraints, Task 10: Migrate `applyRoadPlacement`, Task 11: Migrate `applyPillage`, Task 12: Migrate `applyDiplomacyRemoval`, Task 13: Migrate `resetGame` and `restoreFromSnapshot` (+9 more)

### Community 37 - "Global Constraints"
Cohesion: 0.11
Nodes (17): Game State Reducer — Players Slice, Sub-plan 4b: Progress Card Effect Resolution — Implementation Plan, Global Constraints, Task 10: Migrate `applyDiplomacyRemoval` to `DIPLOMACY_PLAYED`, Task 11: Migrate `applySabotageEffect` to `SABOTAGE_PLAYED`, Task 12: Migrate `applyWeddingEffect` to `WEDDING_PLAYED`, Task 13: Migrate `applyGuildDuesTake` to `GUILD_DUES_TAKEN`, Task 14: Migrate `applyEspionageTake` to `ESPIONAGE_TAKEN`, Task 15: Final verification for this sub-plan (+9 more)

### Community 38 - "useModalFocusTrap"
Cohesion: 0.17
Nodes (13): BarbarianAttackModal(), BarbarianAttackModalProps, DevCardResourcePicker(), DevCardResourcePickerProps, DOT_CLASS, VictoryBanner(), VictoryBannerProps, WINNER_TEXT_CLASS (+5 more)

### Community 39 - "BoardShapeEditor.tsx"
Cohesion: 0.25
Nodes (14): BIOME_PALETTE, BoardShapeEditor(), cellKey(), COL_RANGE, CORNER_ANGLES_DEG, hexPolygonPoints(), isSingleConnectedGroup(), ROW_RANGE (+6 more)

### Community 40 - "CommodityType"
Cohesion: 0.17
Nodes (14): CommodityIcon(), NOTE: this is a separate, small inline-SVG icon for compact display (e.g., DevCardCommodityPicker(), DevCardCommodityPickerProps, GuildDuesHudState, TradeHudState, OpponentHandPicker(), OpponentHandPickerProps (+6 more)

### Community 41 - "Data Model — `PendingQueuesState`'s 7 Fields, Verified This Session"
Cohesion: 0.12
Nodes (16): App.tsx Reducer Refactor — Sub-plan 6: Pending Queues (Uniform Half), Data Model — `PendingQueuesState`'s 7 Fields, Verified This Session, `discardPlayerIds: number[]` (Task 2) — not in `MatchSnapshot`, File Structure, Global Constraints, `goldFieldResourcePlayerIds: number[]` (Task 2) — not in `MatchSnapshot`; gates `canPerformAction()` (`App.tsx:816-819`, untouched READ site); identical shape to science EXCEPT never deduped (a city on Gold Field owes 2 independent picks), `pillageQueue: BarbarianPillageTarget[]` (Task 3) — element type `{ playerId: number; eligibleCityVertexIds: string[] }` from `src/game/knights.ts:245-248`; not in `MatchSnapshot`, `progressCardOverLimitPlayerIds: number[]` (Task 4) — the ONE queue with a genuine snapshot-restored value; the ONE queue whose `activeQueueEntry` read site (`App.tsx:3792`) hardcodes `localPlayerId: null` (pre-existing gap, out of scope, unaffected read site) (+8 more)

### Community 42 - "GameSetupMenu.tsx"
Cohesion: 0.15
Nodes (13): GameMode, GameSetupMenu(), HOUSE_RULES_HEADER, JOIN_EXISTING_GAME_TEXT_OFFSET, LAYOUT, Rect, rectStyle(), selectorOverlayStyle() (+5 more)

### Community 43 - "StartScreen.tsx"
Cohesion: 0.33
Nodes (15): GameStartInfo, HostRegionConfig, JoinSeed, PendingRegionSelect, StartScreen(), CustomBoardShape, Biome, BoardCell (+7 more)

### Community 44 - "PortMarkers.tsx"
Cohesion: 0.17
Nodes (13): DockModelMesh(), portColor(), portLabel(), PortMarker(), PortMarkers(), NumberToken(), WORLD_POS, Port (+5 more)

### Community 45 - "testNetworkSync.ts"
Cohesion: 0.28
Nodes (14): bold(), dim(), generateRoomCode(), green(), isTTY, main(), outcomes, paint() (+6 more)

### Community 46 - "Global Constraints"
Cohesion: 0.12
Nodes (15): Game State Reducer — Players Slice, Sub-plan 3: Barbarians + Knights — Implementation Plan, Global Constraints, Task 10: Migrate `playEncouragement`/`onEncouragementPlayed` to `ENCOURAGEMENT_PLAYED`, Task 11: Migrate `moveRobber`'s chase-robber-knight-deactivation tail and `onKnightDeactivatedAfterChase` to `KNIGHT_DEACTIVATED_AFTER_CHASE`, Task 12: Migrate `playTreason`/`onTreasonRemoved` to `TREASON_KNIGHT_REMOVED`, Task 13: Final verification for this sub-plan, Task 1: Migrate `applyBarbarianAttackResult` to `DEFENDER_OF_CATAN_AWARDED` + `ALL_KNIGHTS_DEACTIVATED`, Task 2: Migrate taxation (`armTaxation`, `resolveTaxation`, `onTaxationResolved`, `onProgressCardPlayed`'s taxation branch) to `TAXATION_ARMED` + `TAXATION_RESOLVED`, via a shared `applyTaxationResolved` (+7 more)

### Community 47 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + TypeScript + Vite

### Community 48 - "RegionSelectMenu.tsx"
Cohesion: 0.15
Nodes (14): CONFIRM_BUTTON_SELECTOR_INSET, CONFIRM_BUTTON_SELECTOR_OFFSET, percentRect(), REGION_ICON_OFFSETS, REGION_ICON_URLS, REGION_LABEL_OFFSETS, REGION_LIST_ENTRIES, REGION_LIST_LAYOUT (+6 more)

### Community 49 - "benchmark.js"
Cohesion: 0.25
Nodes (5): { performance }, settlements, start, thief, vertexIds

### Community 50 - "boardGraph.ts"
Cohesion: 0.10
Nodes (20): assignPorts(), BoardEdge, BoardGraph, buildBoardGraph(), buildVertexAdjacency(), CORNER_ANGLES, outwardEdgeAngle(), PORT_TYPE_SEQUENCE (+12 more)

### Community 51 - "PlayerHand3D.tsx"
Cohesion: 0.19
Nodes (13): buildCardSlots(), CARD_ART, CardKey, CardLayout, CardSlot, HandCard(), layoutFor(), loadCardTexture() (+5 more)

### Community 52 - "BoardInteractions.tsx"
Cohesion: 0.10
Nodes (21): BoardInteractions, BoardInteractionsProps, EdgeSlot, GhostModel(), hologramCache, hologramMaterial(), HoverTarget, VertexSlot (+13 more)

### Community 53 - "Cities & Knights — Commodities & City Improvements (Phase A) — Design Spec"
Cohesion: 0.14
Nodes (13): Cities & Knights — Commodities & City Improvements (Phase A) — Design Spec, City Improvement tracks, Commodity production, Data model, Global Constraints, Improvements UI & purchase, Metropolis placeholder, Multiplayer sync (+5 more)

### Community 54 - "Seafarers — Ships & Open Sea (Phase 4 of the C&K/Seafarers plan)"
Cohesion: 0.14
Nodes (13): Actions, Data Model, Dev card changes, Global Constraints, Gold fields, Longest Route, New board shape, Out of Scope (+5 more)

### Community 55 - "App.tsx Reducer Refactor — Finishing the Players-Slice Migration"
Cohesion: 0.14
Nodes (13): Actions, App.tsx Reducer Refactor — Finishing the Players-Slice Migration, Broadcast dispatcher (`useRoomChannel.ts`), Classification Rule, Data Model — New/Extended Reducer Slices, GameHud props (final sub-plan only), Global Constraints, Out of Scope (+5 more)

### Community 56 - "Building"
Cohesion: 0.17
Nodes (12): CollapsibleSection(), CollapsibleSectionProps, DOT_CLASS, RankingsPanel(), RankingsPanelProps, MerchantLayerProps, RobberLayerProps, HexTileData (+4 more)

### Community 57 - "Master Development Blueprint v12: Project-3 (3D Multiplayer Catan)"
Cohesion: 0.14
Nodes (13): 👥 Agent Roster & Delegation Map (Streamlined), Bug 1: 7-Roll Discard Lockout, Bug 2: Rejoined Player Dice Roll Lockout, Bug 3: Low-Floating Number Chits, Bug 4: Choppy Trade HUD Panel Dragging (Performance Optimization), 🚨 EMERGENCY PLAYTEST BUG BACKLOG (FIX THESE FIRST!), Feature Refinement: Tactical Hover-Zoom & Click-to-Play Dev Cards, 🔒 GOLDFREEZE DIRECTIVE: Working Systems (DO NOT TOUCH) (+5 more)

### Community 58 - "ResourcePanel.tsx"
Cohesion: 0.29
Nodes (10): ResourcePanel(), applyDiscardCounts(), autoDiscardCounts(), discardHandSize(), discardThreshold(), COMMODITY_COLORS, COMMODITY_ORDER, emptyCommodities() (+2 more)

### Community 59 - "Global Constraints"
Cohesion: 0.15
Nodes (12): Cities & Knights — Commodities & City Improvements (Phase A) Implementation Plan, Global Constraints, Task 10: Commodity cards in the hand + discard selection, Task 1: Data model — commodities, improvement tracks, Metropolis holder state, Task 2: Pure city-improvement purchase logic, Task 3: Commodity production hook + combined discard threshold, Task 4: Science level-3 free-resource queue, Task 5: Commodity icon + City Improvements panel + purchase flow (+4 more)

### Community 60 - "Global Constraints"
Cohesion: 0.15
Nodes (12): Global Constraints, Hidden Tiles House Rule Implementation Plan, Self-Review Notes, Task 1: `hiddenTiles` field on `GameRules`, Task 2: Pure reveal-tracking logic, Task 3: Wire reveal state into App.tsx, Task 4: Multiplayer snapshot round-trip, Task 5: Mist tile asset — placement, scale, rotation (+4 more)

### Community 61 - "Cities & Knights — Progress Cards (Phase B) — Design Spec"
Cohesion: 0.15
Nodes (12): Card Effects — Categorized, Cities & Knights — Progress Cards (Phase B) — Design Spec, Data Model, Global Constraints, Hand Limit & Discard UI, Multiplayer Sync, Out of Scope for v1 (this spec), Scoring (+4 more)

### Community 62 - "Cities & Knights — Knights & City Walls (Phase C1) — Design Spec"
Cohesion: 0.15
Nodes (12): Board UI — Placement & Knight Actions, Cities & Knights — Knights & City Walls (Phase C1) — Design Spec, Data Model, Global Constraints, Hand Limit (City Walls), Longest Route Interaction, Multiplayer Sync, Naming — Avoiding Collisions (+4 more)

### Community 63 - "Game State Reducer — Design Spec"
Cohesion: 0.15
Nodes (12): Composition Mechanism, Data Model, Game State Reducer — Design Spec, `GameAction` — one discriminated union, `GameState` — composed of domain slices, Global Constraints, Multiplayer Integration, Out of Scope (+4 more)

### Community 64 - "CodeRabbit Findings Fix Report — PR #16 (Knights & City Walls)"
Cohesion: 0.15
Nodes (12): 1. CRITICAL — Knight starting supply blocked basic→strong promotion forever, 2. CRITICAL — Treason free placement reused the paid Recruit broadcast (desync), 3. MAJOR — `pendingIntrigueDisplace`/`pendingTreasonPlacement` never reset, 4. MAJOR — `KnightsPanel`'s turn-gate wrongly required Progress Cards on, 5. MAJOR — `Date.now()`-based knight IDs (new lint violations + collision risk), 6. MAJOR — `resolveFreeCityWall` duplicated `canBuildCityWall`'s validation, 7. MINOR — 7-roll banner text hardcoded "7 cards", 8. MINOR — Wall building not gated on `hasRolledThisTurn` (+4 more)

### Community 65 - "JoinRoomModal.tsx"
Cohesion: 0.29
Nodes (9): findPlayerIndexByName(), JoinRoomModal(), LAYOUT, Rect, rectStyle(), selectorOverlayStyle(), useHoverActive(), normalizePlayerName() (+1 more)

### Community 66 - "matchSnapshot.ts"
Cohesion: 0.27
Nodes (10): TurnHudState, GamePhase, SetupStage, getSupabaseClient(), isSupabaseConfigured(), activeSave, isPlausibleMatchSnapshot(), loadMatchSnapshot() (+2 more)

### Community 67 - "useRoomChannel"
Cohesion: 0.17
Nodes (6): generateClientId(), useRoomChannel(), buffer, debugLog(), DebugLogEntry, Window

### Community 68 - "📸 Inclusive Visuals Specialist"
Cohesion: 0.17
Nodes (11): 🚀 Advanced Capabilities, 🚨 Critical Rules You Must Follow, Example Code: The Dignified Video Prompt, 📸 Inclusive Visuals Specialist, 🔄 Learning & Memory, 💭 Your Communication Style, 🎯 Your Core Mission, 🧠 Your Identity & Memory (+3 more)

### Community 69 - "File Structure"
Cohesion: 0.17
Nodes (11): File Structure, Game State Reducer — Players Slice, Sub-plan 1 (Building) Implementation Plan, Global Constraints, Task 1: Extend `BoardAction`'s fields; widen `reduceBoard`/`describeBoardAction` to the composed `GameAction`, Task 2: `players.ts` — `PlayersAction`, `reducePlayers`, Task 3: Compose `players` into `GameState`/`GameAction`/`reduceGame`, Task 4: Bridge every remaining `setPlayers` call site, delete the old `useState`, Task 5: Migrate `applySettlementPlacement` and `grantResourcesForVertex` to real actions (+3 more)

### Community 70 - "App.tsx Reducer Refactor — Sub-plan 7: `pendingTrade` + `freeRoadsRemaining`"
Cohesion: 0.17
Nodes (11): Adjacency check at the two bulk-reset sites — no entangled neighbors, App.tsx Reducer Refactor — Sub-plan 7: `pendingTrade` + `freeRoadsRemaining`, Data Model — the 2 Fields, Verified This Session, File Structure, `freeRoadsRemaining: number` → joins the EXISTING `TurnState` (Task 2) — IS a required `MatchSnapshot` field (`matchSnapshot.ts:105`, `freeRoadsRemaining: number`), Global Constraints, `pendingTrade: PendingTrade | null` → a NEW `TradeState`/`trade.ts` slice (Task 3) — NOT a `MatchSnapshot` field at all, Self-Review Notes (+3 more)

### Community 71 - "Hidden Tiles House Rule — Design Spec"
Cohesion: 0.17
Nodes (11): Animated mist shader, Hidden Tiles House Rule — Design Spec, Modes, Multiplayer sync, Numbers hidden (`'numbers'` / `'both'`), Out of scope for v1, Resources hidden (`'resources'` / `'both'`), Reveal mechanic (+3 more)

### Community 72 - "Cities & Knights — Barbarian Track & Attacks (Phase C2) — Design Spec"
Cohesion: 0.17
Nodes (11): Attack Resolution Logic, Board UI — Track HUD & Attack Modal, Cities & Knights — Barbarian Track & Attacks (Phase C2) — Design Spec, Data Model, Global Constraints, Multiplayer Sync, Out of Scope for This Spec, Scoring (+3 more)

### Community 73 - "Seafarers — Rules Reference"
Cohesion: 0.17
Nodes (11): Components (CN3083 p.1, confirmed by rendering the page as an image —, Development card changes in Seafarers (CN3083 p.3, confirmed verbatim), Gold fields (new resource-producing hex, no new resource type), Longest Route (renamed from "Longest Road"), Scenarios (CN3083 pp.3–20; full list confirmed), Seafarers 5–6 Player Expansion (CN3084), Seafarers — Rules Reference, Setup changes (CN3083 p.3) (+3 more)

### Community 74 - "SRE (Site Reliability Engineer) Agent"
Cohesion: 0.18
Nodes (10): 💬 Communication Style, 🔧 Critical Rules, Golden Signals, 🔥 Incident Response Integration, 🔭 Observability Stack, 📋 SLO Framework, SRE (Site Reliability Engineer) Agent, The Three Pillars (+2 more)

### Community 75 - "Conventions"
Cohesion: 0.18
Nodes (10): 1. Trusted-Apply Broadcast Pattern, 2. Online-Parallel / Local-Sequential Gating Pattern, 3. Module-Scope Helper Convention (keeping impure calls out of component scope), Conventions, Do this, Do this, Do this, Don't do this (+2 more)

### Community 76 - "Global Constraints"
Cohesion: 0.18
Nodes (10): Game State Reducer — Players Slice, Sub-plan 2: Trading + Robber/Pillage — Implementation Plan, Global Constraints, Task 1: Migrate `applyRobberMove` to `ROBBER_MOVED`, Task 2: Migrate `applyPillage`'s players-side write onto the existing `PILLAGE_CITY` action, Task 3: Migrate `applyTradeResolution` to `TRADE_RESOLVED`, Task 4: Migrate `applyDiscard` to `DISCARD_CONFIRMED`, Task 5: Migrate `applyCommodityTrade` to `COMMODITY_TRADED`, Task 6: Migrate `applyCommercialHarborEffect` to `COMMERCIAL_HARBOR_PLAYED` (+2 more)

### Community 77 - "Sub-plan 5: City Improvements + Merchant + Turn-Misc"
Cohesion: 0.18
Nodes (10): Global Constraints, Sub-plan 5: City Improvements + Merchant + Turn-Misc, Task 1: Migrate `applyCityImprovementPurchase` + `buyCityImprovement`'s Crane refund + `onCityImprovementPurchased`'s Crane refund to `CITY_IMPROVEMENT_PURCHASED`, Task 2: Migrate `buildCityWall` + `resolveFreeCityWall` + `onCityWallBuilt` to `CITY_WALL_BUILT`, Task 3: Migrate `applyTurnAdvance` to `TURN_ADVANCED`, Task 4: Migrate `buyDevCard` + `onDevCardBought` to `DEV_CARD_BOUGHT`, Task 5: Migrate `applyRollResult` to `RESOURCES_PRODUCED` + `DOUBLES_REROLL_HAND_WIPED`, Task 6: Migrate `applyBarbarianWinnerDraw` to reuse `PROGRESS_CARDS_DRAWN` (+2 more)

### Community 78 - "Seafarers Robber & Pirate Migration Implementation Plan"
Cohesion: 0.18
Nodes (10): Global Constraints, Seafarers Robber & Pirate Migration Implementation Plan, Task 1: Data model — `robberTileId`/`pirateTileId` on `BoardState`, `tileEdgeIds` on `BoardGraph`, Task 2: `ROBBER_MOVED`/`TAXATION_RESOLVED` board cases, `PIRATE_MOVED` action, Task 3: Migrate `App.tsx`'s `robberTileId` off `useState` — HIGH SCRUTINY, Task 4: Pirate movement and steal mechanic, Task 5: Chase Away the Pirate, Task 6: Robber-or-pirate choice UI (+2 more)

### Community 79 - "Custom Map Editor v2 — Design"
Cohesion: 0.18
Nodes (10): `BoardShapeEditor.tsx`, Context, Custom Map Editor v2 — Design, `data/hexBoard.ts` callers, Data model changes, Decisions from clarifying questions, Generation logic changes, Out of scope for this pass (explicitly deferred) (+2 more)

### Community 80 - "Game State Reducer — Players Slice Design Spec"
Cohesion: 0.18
Nodes (10): Data Model, `fullState` — where it's actually needed, Game State Reducer — Players Slice Design Spec, GameAction — composition, Global Constraints, Migration order — six sub-plans, Out of Scope, Side Effects & Testing (+2 more)

### Community 81 - "AGENTS"
Cohesion: 0.20
Nodes (9): AGENTS, Build and run commands, Conventions and pitfalls, Important files, Key architecture notes, Notes for Claude agents, Project layout, Purpose (+1 more)

### Community 82 - "FreeCameraControls.tsx"
Cohesion: 0.25
Nodes (8): FreeCameraControls(), scratchEuler, scratchForward, scratchMove, scratchRight, START_POSITION, START_TARGET, yawPitchFromDirection()

### Community 83 - "KnightPiece"
Cohesion: 0.25
Nodes (8): KnightsHudState, KnightsPanel(), KnightsPanelProps, KNIGHT_STRENGTH_LABELS, KNIGHT_STRENGTH_ORDER, KnightPiece, KnightRecruitedPayload, TreasonRemovedPayload

### Community 84 - "Seafarers Ships & Longest Route Implementation Plan"
Cohesion: 0.22
Nodes (8): Global Constraints, Seafarers Ships & Longest Route Implementation Plan, Task 1: Data model — ships, per-turn ship tracking, sea-adjacency graph primitive, snapshot persistence, Task 2: `BUILD_SHIP`, `MOVE_SHIP`, and `TURN_ADVANCED` reducer cases, Task 3: Longest Route — merge roads and ships in `calculateLongestRoad`, Task 4: Ship building — eligibility, dispatch, and multiplayer broadcast, Task 5: Ship movement — eligibility, dispatch, and multiplayer broadcast, Task 6: Final verification

### Community 85 - "Baseline (confirmed this session)"
Cohesion: 0.22
Nodes (8): App.tsx Reducer Refactor — Turn-State Slice Implementation Plan, Baseline (confirmed this session), Global Constraints, Task 1: Create the `TurnState` reducer slice and wire it into `GameState`, Task 2: Migrate `currentPlayerIndex`, Task 3: Migrate `gamePhase`, Task 4: Migrate the setup-flow trio (`setupStepIndex`, `setupStage`, `setupSettlementVertexId`), Task 5: Migrate the 4 per-turn counters (`devCardPlayedThisTurn`, `hasRolledThisTurn`, `totalRollsThisGame`, `consecutiveDoublesThisTurn`)

### Community 86 - "Global Constraints"
Cohesion: 0.22
Nodes (8): Global Constraints, Seafarers — Gold Fields Implementation Plan, Task 1: Gold Field pick-collection helper (pure, testable), Task 2: `GOLD_FIELD_RESOURCE_PICKED` reducer action, Task 3: Multiplayer broadcast plumbing, Task 4: App.tsx gold-field integration, Task 5: Gold Field resource-picker UI, Task 6: Setup-phase ship substitution

### Community 87 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, preview, test, test:network, test:watch

### Community 88 - "Global Constraints"
Cohesion: 0.25
Nodes (7): Custom Map Editor v2 Implementation Plan, Global Constraints, Task 1: Data model — `CustomBoardShape.biomeOverrides` + resurrect delete/load, Task 2: Generation logic — `buildHexBoardFromCells`/`buildHexBoard` biome overrides, Task 3: `BoardShapeEditor` — biome painting, Task 4: `BoardShapeEditor` — sidebar (browse / preview / edit / delete / new), Task 5: Thread `biomeOverrides` through the online/snapshot pipeline

### Community 89 - "Sub-plan 6: Final Cutover"
Cohesion: 0.25
Nodes (7): Completion signal, Global Constraints, Sub-plan 6: Final Cutover, Task 1: Migrate `resetGame` + `restoreFromSnapshot` to `RESET_PLAYERS` + `RESTORE_PLAYERS`, Task 2: Delete `LEGACY_SET_PLAYERS`, Task 3: Final verification, Why this differs in shape from every prior sub-plan

### Community 90 - "Global Constraints"
Cohesion: 0.25
Nodes (7): Global Constraints, Out of Scope, Queue-Mechanics Helper Implementation Plan, Task 1: Create the `game/pendingQueue.ts` helper module, Task 2: Migrate all 6 active-derivation sites onto `activeQueueEntry`, Task 3: Migrate all 7 dequeue-in-resolve sites onto `dequeueOne`, Testing

### Community 91 - "App.tsx Reducer Refactor — Sub-plan 4: C&K Board-Piece Bucket (Board + Progress)"
Cohesion: 0.25
Nodes (7): App.tsx Reducer Refactor — Sub-plan 4: C&K Board-Piece Bucket (Board + Progress), File Structure, Global Constraints, Self-Review, Task 1: Extend `board.ts`, create `progress.ts`, wire `gameState.ts`, Task 2: Migrate `robberActive`, `merchantTileId`, `merchantHolderId` (`BoardState` fields) in `App.tsx`, Task 3: Migrate `barbarianTrackPosition`, `activeBarbarianAttack`, `knightsPromotedThisTurn` (`ProgressState` fields) in `App.tsx`

### Community 92 - "App.tsx Reducer Refactor — Sub-plan 5: Decks & Trophies Bucket"
Cohesion: 0.25
Nodes (7): App.tsx Reducer Refactor — Sub-plan 5: Decks & Trophies Bucket, File Structure, Global Constraints, Self-Review, Task 1: Create `decks.ts`/`decks.test.ts` and `trophies.ts`/`trophies.test.ts`, wire `gameState.ts` + `gameState.test.ts`, Task 2: Migrate `devDeck` + `progressCardDecks` (`DecksState` fields) in `App.tsx`, Task 3: Migrate `longestRoadHolderId` + `largestArmyHolderId` + `metropolisHolders` + `metropolisVertexIds` (`TrophiesState` fields) in `App.tsx`

### Community 93 - "Cities & Knights 5–6 Player Expansion — Rules Reference"
Cohesion: 0.25
Nodes (7): Cities & Knights 5–6 Player Expansion — Rules Reference, Components added (p.2, confirmed), Headline finding: no new gameplay mechanic, only component scaling + the shared paired-player turn, Interaction with Seafarers not covered here, Net takeaway for the phase plan, Setup changes (p.3, confirmed verbatim), Turn structure (p.3, confirmed verbatim)

### Community 94 - "CanvasErrorBoundary"
Cohesion: 0.29
Nodes (3): CanvasErrorBoundary, Props, State

### Community 95 - "EventDieFace"
Cohesion: 0.29
Nodes (6): EventDieFace, EVENT_DIE_ICON, EVENT_DIE_LABEL, EventDieIndicator(), DiceHudState, DiceRolledPayload

### Community 96 - "Seafarers Board Foundation Implementation Plan"
Cohesion: 0.29
Nodes (6): Global Constraints, Seafarers Board Foundation Implementation Plan, Task 1: Add `sea`/`gold` biomes, update every exhaustive biome table, exclude sea from number-disc assignment, Task 2: Wire WaterHexTile.glb as the sea model, add a placeholder gold model, Task 3: New `seafarersBasic` board shape — algorithmic sea ring + pinned gold fields, Task 4: Final verification

### Community 97 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Broadcast Dispatcher Collapse Implementation Plan, Global Constraints, Task 1: Collapse the 57 `broadcastX` functions, Task 2: Collapse the 57 `channel.on<T>` subscriptions, Task 3: Automated exception-count self-check, then full verification, Testing

### Community 98 - ".prettierrc.json"
Cohesion: 0.33
Nodes (5): arrowParens, printWidth, semi, singleQuote, trailingComma

### Community 99 - "Global Constraints"
Cohesion: 0.33
Nodes (5): Game State Reducer — Players Slice, Sub-plan 4a: Progress Card Spend — Implementation Plan, Global Constraints, Task 1: Add `PROGRESS_CARD_SPENT` and migrate its 12 call sites, Task 2: Add `DEV_CARD_SPENT` and migrate `spendDevCard`, Task 3: Final verification for this sub-plan

### Community 100 - "Cities & Knights — Progress Cards Reference"
Cohesion: 0.33
Nodes (5): Cities & Knights — Progress Cards Reference, Notes for Phase B implementation, Politics (9 unique types, 18 cards), Science (10 unique types, 18 cards), Trade (6 unique types, 18 cards)

### Community 102 - "catan-3d/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 104 - "Base CATAN — Sanity Check vs. `catan-3d/src/game/types.ts`"
Cohesion: 0.40
Nodes (4): Base CATAN — Sanity Check vs. `catan-3d/src/game/types.ts`, Confirmed matches (no action needed), Gaps worth reviewing, Not checked in this pass (out of scope per task prioritization)

### Community 105 - "vite-env.d.ts"
Cohesion: 0.50
Nodes (3): *.glb, ImportMeta, ImportMetaEnv

### Community 106 - "bolt.md"
Cohesion: 0.50
Nodes (3): 2024-05-18 - React.memo() Failure with Inline Functions in R3F, 2024-08-08 - Optimize Player Lookup, 2024-11-20 - Array instead of Set for small collections

### Community 107 - "dependencies"
Cohesion: 0.50
Nodes (3): dependencies, @supabase/supabase-js, @supabase/supabase-js

## Knowledge Gaps
- **1010 isolated node(s):** `{ performance }`, `vertexIds`, `settlements`, `thief`, `start` (+1005 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MemoryStorage` connect `MemoryStorage` to `BoardShapeEditor.tsx`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `ModelErrorBoundary` connect `RobberLayer.tsx` to `CatanBoard.tsx`, `PortMarkers.tsx`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `GameRules` connect `StartScreen.tsx` to `App.tsx`, `types.ts`, `CatanBoard.tsx`, `matchSnapshot.ts`, `useRoomChannel.ts`, `GameSetupMenu.tsx`, `hexTerrain.ts`, `RoomLobby.tsx`, `Building`, `RobberLayer.tsx`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `{ performance }`, `vertexIds`, `settlements` to the rest of the system?**
  _1010 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `gameState.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05318352059925094 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08888888888888889 - nodes in this community are weakly interconnected._