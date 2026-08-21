# Graph Report - catan-3d  (2026-08-21)

## Corpus Check
- Large corpus: 205 files · ~2,185,082 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 920 nodes · 2121 edges · 68 communities (60 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.73)
- Token cost: 0 input · 117,748 output

## Community Hubs (Navigation)
- Dice & Board Frame Rendering
- NPM Dependencies
- Core Game Types & Constants
- ESLint Tooling Config
- Multiplayer Broadcast Payloads
- City Improvements UI & Logic
- Room Lobby UI
- TS App Config
- App.tsx Helper Functions
- Barbarians & Knights UI
- Game Phase & Event UI
- Vite/Node TS Config
- Progress Cards UI & Deck
- Knights & Rankings Panels
- Hex Board Generation
- Start Screen & Game Setup
- Merchant Fleet 3D Layer
- Design Audit: Accessibility & Physics
- Dev Card & Commodity Pickers
- Catan Board 3D Component
- Game State Reducer & SFX
- Board Shape Editor
- Game Setup Menu
- Region Select Menu
- Hex Terrain Geometry
- Resource Panel, Trade & Discard
- Port Markers & Tile Decorations
- Network Sync Test Harness
- Knight & Pillage 3D Layers
- Player Hand 3D Cards
- Board Interactions & Hover
- Game Pieces 3D Models
- Trade & Dev Card Payloads
- Design Audit: React Architecture
- Join Room Modal
- Board Graph Construction
- Trophies (Longest Road/Army)
- Free Camera Controls
- Robber & Hidden Tiles
- Discard Logic Tests
- Barbarian & Improvement Payloads
- Chat Panel & Draggable UI
- Canvas Error Boundary
- Building Costs Panel
- Model Error Boundary
- Debug Log Utility
- Design Audit: Lighting & Post-FX
- README: Build Tooling
- Prettier Config
- Perf Benchmark Script
- Design Audit: Longest Road Fidelity
- Design Audit: Dev Card Limits
- Design Audit: Rendering & State Mgmt
- MemoryStorage Utility
- Design Audit: Code Health & Tests
- Design Audit: three.js Dedupe Bug
- Design Audit: VP Card Leak Bug
- Top Bar UI
- Vite Env Types
- Design Audit: Modal Accessibility
- Robber & Taxation Payloads
- Root TS Config
- Design Audit: Setup Road Bug
- Design Audit: Dead App.css
- App Entry Point
- Knight Strength Payload

## God Nodes (most connected - your core abstractions)
1. `App()` - 64 edges
2. `Catan 3D Technical & Design Audit` - 42 edges
3. `Player` - 31 edges
4. `ResourceType` - 28 edges
5. `Building` - 24 edges
6. `ImprovementTrack` - 20 edges
7. `GameRules` - 19 edges
8. `compilerOptions` - 19 edges
9. `GameHudProps` - 18 edges
10. `CommodityType` - 18 edges

## Surprising Connections (you probably didn't know these)
- `typescript-eslint type-checked configs` --semantically_similar_to--> `S2-5: npm run lint failing (6 errors, setState-in-effect pattern)`  [INFERRED] [semantically similar]
  README.md → AUDIT.md
- `App()` --indirect_call--> `reduceGame()`  [INFERRED]
  src/App.tsx → src/game/gameState.ts
- `DockModelMesh()` --calls--> `useClonedModel()`  [EXTRACTED]
  src/components/PortMarkers.tsx → src/hooks/useClonedModel.ts
- `RobberToken()` --calls--> `useClonedModel()`  [EXTRACTED]
  src/components/RobberLayer.tsx → src/hooks/useClonedModel.ts
- `RegionOption` --references--> `BoardShapeId`  [EXTRACTED]
  src/components/hud/RegionSelectMenu.tsx → src/data/hexBoard.ts

## Import Cycles
- 3-file cycle: `src/App.tsx -> src/components/hud/GameHud.tsx -> src/components/hud/EventBanner.tsx -> src/App.tsx`
- 3-file cycle: `src/App.tsx -> src/components/hud/GameHud.tsx -> src/components/hud/EventLogPanel.tsx -> src/App.tsx`

## Hyperedges (group relationships)
- **Wave 1 correctness fixes (S0-1 through S0-4)** — catan_3d_audit_s0_1, catan_3d_audit_s0_2, catan_3d_audit_s0_3, catan_3d_audit_s0_4 [EXTRACTED 1.00]
- **New dependencies implied by the audit** — catan_3d_audit_zustand, catan_3d_audit_react_spring_three, catan_3d_audit_react_three_postprocessing, catan_3d_audit_howler, catan_3d_audit_vitest [EXTRACTED 1.00]
- **Top-tier techniques that must not be regressed** — catan_3d_audit_dice_landing_physics, catan_3d_audit_dice_collision_physics, catan_3d_audit_longest_road_dfs, catan_3d_audit_board_graph, catan_3d_audit_seeded_prng [EXTRACTED 1.00]

## Communities (68 total, 8 thin omitted)

### Community 0 - "Dice & Board Frame Rendering"
Cohesion: 0.06
Nodes (44): BoardFrame(), buildRingGeometry(), traceRoundedRect(), createRestingAnim(), Dice3D(), Dice3DProps, DiceRollTarget, DieAnimState (+36 more)

### Community 1 - "NPM Dependencies"
Cohesion: 0.06
Nodes (35): dependencies, postprocessing, react, react-dom, @react-three/drei, @react-three/fiber, @react-three/postprocessing, @react-three/rapier (+27 more)

### Community 2 - "Core Game Types & Constants"
Cohesion: 0.09
Nodes (31): BIOME_LABELS, BIOME_TO_RESOURCE, buildDevCardDeck(), BuildingType, buildSetupOrder(), CITY_COST, COMMODITY_COLORS, COMMODITY_FOR_BIOME (+23 more)

### Community 3 - "ESLint Tooling Config"
Cohesion: 0.06
Nodes (31): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+23 more)

### Community 4 - "Multiplayer Broadcast Payloads"
Cohesion: 0.07
Nodes (28): BarbarianShipAdvancedPayload, CityBuiltPayload, CityWallBuiltPayload, DevCardBoughtPayload, DiplomacyPlayedPayload, EncouragementPlayedPayload, EspionageTakenPayload, generateClientId() (+20 more)

### Community 5 - "City Improvements UI & Logic"
Cohesion: 0.16
Nodes (23): CityImprovementsPanel(), CityImprovementsPanelProps, buyImprovementLevel(), canAffordImprovement(), evaluateMetropolisPurchase(), hasSpareMetropolisCity(), improvementLevelCost(), MAX_IMPROVEMENT_LEVEL (+15 more)

### Community 6 - "Room Lobby UI"
Cohesion: 0.11
Nodes (23): CopyIcon(), EyeIcon(), RoomCodeTag(), ALL_COLOR_TOKENS, comparePlayers(), groupOffsetStyle(), LAYOUT, PLAYER_ROWS_OFFSET (+15 more)

### Community 7 - "TS App Config"
Cohesion: 0.07
Nodes (26): DOM, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+18 more)

### Community 8 - "App.tsx Helper Functions"
Cohesion: 0.12
Nodes (20): App(), findPlayerIndexByName(), heldItemsFor(), isValidCostOverride(), pickRandom(), randomInt(), randomSeedString(), playSfx() (+12 more)

### Community 9 - "Barbarians & Knights UI"
Cohesion: 0.15
Nodes (21): FREE_CAM_HINT_POSITION, BarbarianAttackModal(), BarbarianTrackPanel(), BARBARIAN_TRACK_LENGTH, BarbarianAttackWinner, BarbarianPillageTarget, knightDisplaceTargets(), knightMoveTargets() (+13 more)

### Community 10 - "Game Phase & Event UI"
Cohesion: 0.12
Nodes (18): BannerMessage, DevCardPickerMode, EventLogEntry, GamePhase, SetupStage, DiscardPanel(), EventBanner(), VARIANT_STYLES (+10 more)

### Community 11 - "Vite/Node TS Config"
Cohesion: 0.09
Nodes (21): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+13 more)

### Community 12 - "Progress Cards UI & Deck"
Cohesion: 0.16
Nodes (18): EventDieFace, PROGRESS_CARD_ART, ProgressCardsPanel(), ProgressCardsPanelProps, buildProgressCardDeck(), EVENT_DIE_FACES, isEligibleToDraw(), PROGRESS_CARD_HAND_LIMIT (+10 more)

### Community 13 - "Knights & Rankings Panels"
Cohesion: 0.15
Nodes (18): BarbarianTrackPanelProps, KnightsPanel(), KnightsPanelProps, PlayerTargetPicker(), PlayerTargetPickerProps, DOT_CLASS, RankingsPanel(), RankingsPanelProps (+10 more)

### Community 14 - "Hex Board Generation"
Cohesion: 0.14
Nodes (20): allocateProportional(), BIOME_WEIGHTS, BOARD_SHAPE_LABELS, BOARD_SHAPES, buildBiomePool(), buildHexBoard(), buildHexBoardFromCells(), buildNumberPool() (+12 more)

### Community 15 - "Start Screen & Game Setup"
Cohesion: 0.26
Nodes (18): GameStartInfo, HostRegionConfig, JoinSeed, PendingRegionSelect, StartScreen(), CustomBoardShape, Biome, BoardCell (+10 more)

### Community 16 - "Merchant Fleet 3D Layer"
Cohesion: 0.15
Nodes (17): isAdjacentToPlayerBuilding(), isLandTile(), LAND_BIOMES, MerchantLayer(), MerchantLayerProps, MerchantTileGlow(), MerchantTileTarget(), RobberTileGlow() (+9 more)

### Community 17 - "Design Audit: Accessibility & Physics"
Cohesion: 0.13
Nodes (19): Catan 3D Technical & Design Audit, Scoreboard: Accessibility (1.5/10), Deterministic board graph derived from tile centers, Elastic dice-vs-dice collision with momentum + energy conservation, Closed-form exponential-decay dice landing, drei <Instances>/<Instance>, Scoreboard: Game Feel / Juice (3.0/10), howler (audio library) (+11 more)

### Community 18 - "Dev Card & Commodity Pickers"
Cohesion: 0.22
Nodes (12): CommodityIcon(), NOTE: this is a separate, small inline-SVG icon for compact display (e.g., DevCardCommodityPicker(), DevCardCommodityPickerProps, DevCardResourcePicker(), OpponentHandPickerProps, ResourceIcon(), TradeOfferPrompt() (+4 more)

### Community 19 - "Catan Board 3D Component"
Cohesion: 0.16
Nodes (16): BIOME_CHIT_Y_OFFSET, BIOME_MODEL_ROTATION_Y, BIOME_MODEL_URLS, BiomeTileModel(), CatanBoard, HexTile, NO_TILES, randomHexRotation() (+8 more)

### Community 20 - "Game State Reducer & SFX"
Cohesion: 0.21
Nodes (12): cache, SFX_URLS, SfxKey, GameAction, GameState, initialGameState, reduceGame(), BoardAction (+4 more)

### Community 21 - "Board Shape Editor"
Cohesion: 0.25
Nodes (14): BIOME_PALETTE, BoardShapeEditor(), cellKey(), COL_RANGE, CORNER_ANGLES_DEG, hexPolygonPoints(), isSingleConnectedGroup(), ROW_RANGE (+6 more)

### Community 22 - "Game Setup Menu"
Cohesion: 0.14
Nodes (14): GameMode, GameSetupMenu(), HOUSE_RULES_HEADER, JOIN_EXISTING_GAME_TEXT_OFFSET, LAYOUT, Rect, rectStyle(), selectorOverlayStyle() (+6 more)

### Community 23 - "Region Select Menu"
Cohesion: 0.15
Nodes (15): CONFIRM_BUTTON_SELECTOR_INSET, CONFIRM_BUTTON_SELECTOR_OFFSET, percentRect(), REGION_ICON_OFFSETS, REGION_ICON_URLS, REGION_LABEL_OFFSETS, REGION_LIST_ENTRIES, REGION_LIST_LAYOUT (+7 more)

### Community 24 - "Hex Terrain Geometry"
Cohesion: 0.18
Nodes (16): HEX_RADIUS, biomeLandform(), buildGeometry(), buildHeightField(), cache, edgeOverlayCache, getTileTerrain(), HeightField (+8 more)

### Community 25 - "Resource Panel, Trade & Discard"
Cohesion: 0.24
Nodes (13): ResourcePanel(), TradeModalProps, TradeMode, discardHandSize(), discardThreshold(), Commodities, COMMODITY_LABELS, COMMODITY_ORDER (+5 more)

### Community 26 - "Port Markers & Tile Decorations"
Cohesion: 0.17
Nodes (13): DockModelMesh(), portColor(), portLabel(), PortMarker(), PortMarkers(), NumberToken(), WORLD_POS, Port (+5 more)

### Community 27 - "Network Sync Test Harness"
Cohesion: 0.28
Nodes (14): bold(), dim(), generateRoomCode(), green(), isTTY, main(), outcomes, paint() (+6 more)

### Community 28 - "Knight & Pillage 3D Layers"
Cohesion: 0.18
Nodes (10): KnightLayer(), KnightLayerProps, PillageLayer(), PillageLayerProps, BoardVertex, STRUCTURE_ELEVATION, TILE_HEIGHT, KnightPiece (+2 more)

### Community 29 - "Player Hand 3D Cards"
Cohesion: 0.21
Nodes (12): buildCardSlots(), CARD_ART, CardKey, CardLayout, CardSlot, HandCard(), layoutFor(), loadCardTexture() (+4 more)

### Community 30 - "Board Interactions & Hover"
Cohesion: 0.21
Nodes (11): BoardInteractions, BoardInteractionsProps, EdgeSlot, GhostModel(), hologramCache, hologramMaterial(), HoverTarget, VertexSlot (+3 more)

### Community 31 - "Game Pieces 3D Models"
Cohesion: 0.23
Nodes (10): CITY_URLS, CityMesh(), CityModel(), ROAD_URLS, RoadMesh(), RoadModel(), SETTLEMENT_URLS, SettlementMesh() (+2 more)

### Community 32 - "Trade & Dev Card Payloads"
Cohesion: 0.17
Nodes (12): DevCardResourcePickerProps, ResourceType, BankTradePayload, CommercialHarborPlayedPayload, CommodityTradedPayload, DiscardConfirmedPayload, GuildDuesTakenPayload, MonopolyPlayedPayload (+4 more)

### Community 33 - "Design Audit: React Architecture"
Cohesion: 0.20
Nodes (11): Scoreboard: React Architecture (3.5/10), S1-2: Event banners never dismiss, S1-3: Camera can fly under the world, S2-5: npm run lint failing (6 errors, setState-in-effect pattern), S3-1: App.tsx is 1,007 lines with 24 useState hooks, S3-6: TypeScript strict mode is off, typescript-eslint type-checked configs, App component (src/App.tsx) (+3 more)

### Community 34 - "Join Room Modal"
Cohesion: 0.31
Nodes (9): JoinRoomModal(), LAYOUT, Rect, rectStyle(), selectorOverlayStyle(), isPlausibleMatchSnapshot(), loadMatchSnapshot(), normalizePlayerName() (+1 more)

### Community 35 - "Board Graph Construction"
Cohesion: 0.29
Nodes (9): assignPorts(), BoardEdge, buildBoardGraph(), buildVertexAdjacency(), CORNER_ANGLES, outwardEdgeAngle(), PORT_TYPE_SEQUENCE, PortType (+1 more)

### Community 36 - "Trophies (Longest Road/Army)"
Cohesion: 0.27
Nodes (6): calculateLongestRoad(), pickTrophyHolder(), chain(), edge(), LARGEST_ARMY_MIN_KNIGHTS, LONGEST_ROAD_MIN_LENGTH

### Community 37 - "Free Camera Controls"
Cohesion: 0.25
Nodes (8): FreeCameraControls(), scratchEuler, scratchForward, scratchMove, scratchRight, START_POSITION, START_TARGET, yawPitchFromDirection()

### Community 38 - "Robber & Hidden Tiles"
Cohesion: 0.31
Nodes (5): RobberLayer(), RobberLayerProps, RobberToken(), hidesResourceMesh(), revealTilesForVertex()

### Community 39 - "Discard Logic Tests"
Cohesion: 0.25
Nodes (8): applyDiscardCounts(), autoDiscardCounts(), playerWithCities(), createInitialPlayers(), emptyCityImprovements(), emptyCommodities(), emptyResources(), playerWith()

### Community 40 - "Barbarian & Improvement Payloads"
Cohesion: 0.25
Nodes (8): BarbarianAttackModalProps, BarbarianAttackResult, ImprovementTrack, BarbarianAttackResolvedPayload, BarbarianWinnerDrawResolvedPayload, CityImprovementPurchasedPayload, MetropolisClaimedPayload, ProgressCardsDrawnPayload

### Community 41 - "Chat Panel & Draggable UI"
Cohesion: 0.36
Nodes (6): ChatBoxPanel(), TEXT_CLASS, TradeModal(), clampRange(), useDraggablePanel(), ChatMessagePayload

### Community 42 - "Canvas Error Boundary"
Cohesion: 0.29
Nodes (3): CanvasErrorBoundary, Props, State

### Community 43 - "Building Costs Panel"
Cohesion: 0.33
Nodes (5): BuildingCostsPanel(), RECIPES, RESOURCE_ICONS, CollapsibleSection(), CollapsibleSectionProps

### Community 44 - "Model Error Boundary"
Cohesion: 0.29
Nodes (3): ModelErrorBoundary, Props, State

### Community 45 - "Debug Log Utility"
Cohesion: 0.29
Nodes (3): buffer, DebugLogEntry, Window

### Community 46 - "Design Audit: Lighting & Post-FX"
Cohesion: 0.33
Nodes (6): drei <Environment>/<Lightformer>, @react-three/postprocessing, S1-4: Materials read flat, no image-based lighting, S2-3: No post-processing pass (bloom, AO, vignette), Scoreboard: Three.js Rendering Craft (4.5/10), SceneRig component

### Community 47 - "README: Build Tooling"
Cohesion: 0.33
Nodes (6): catan-3d React + TypeScript + Vite README, eslint-plugin-react-dom, eslint-plugin-react-x, React Compiler, @vitejs/plugin-react, @vitejs/plugin-react-swc

### Community 48 - "Prettier Config"
Cohesion: 0.33
Nodes (5): arrowParens, printWidth, semi, singleQuote, trailingComma

### Community 50 - "Design Audit: Longest Road Fidelity"
Cohesion: 0.50
Nodes (5): Scoreboard: Game Rules Fidelity (6.5/10), Longest-road DFS honoring opponent-settlement path breaking, S0-1: Longest Road never surrendered when network breaks, calculateLongestRoad (src/game/trophies.ts), pickTrophyHolder (src/game/trophies.ts)

### Community 51 - "Design Audit: Dev Card Limits"
Cohesion: 0.40
Nodes (5): S0-4: Unlimited development cards per turn, playKnight (src/App.tsx), playMonopoly (src/App.tsx), playRoadBuilding (src/App.tsx), playYearOfPlenty (src/App.tsx)

### Community 52 - "Design Audit: Rendering & State Mgmt"
Cohesion: 0.40
Nodes (5): S2-2: Zero memoization, entire 3D tree re-renders, S3-2: GameHud takes 25 props (pass-through plumbing), Zustand (state management), BoardInteractions component, GameHud component

### Community 54 - "Design Audit: Code Health & Tests"
Cohesion: 0.50
Nodes (4): Scoreboard: Code Health (6.0/10), S3-5: No tests, no error boundary, Vitest, trophies.test.ts (src/game/__tests__/)

### Community 55 - "Design Audit: three.js Dedupe Bug"
Cohesion: 0.50
Nodes (4): drei <SoftShadows>, S2-6: Two copies of three.js were loading (fixed), S2-7: drei SoftShadows breaks shader compilation on three 0.185 (landmine), resolve.dedupe (vite.config.ts)

### Community 56 - "Design Audit: VP Card Leak Bug"
Cohesion: 0.50
Nodes (4): S0-3: Hidden Victory Point cards leaked to every player, RankingsPanel (src/components/hud/RankingsPanel.tsx), getPublicScore (types.ts, proposed), getScoreBreakdown (types.ts)

### Community 58 - "Vite Env Types"
Cohesion: 0.50
Nodes (3): *.glb, ImportMeta, ImportMetaEnv

### Community 59 - "Design Audit: Modal Accessibility"
Cohesion: 0.67
Nodes (3): radix-ui/react-dialog, S1-5: Modals can't be dismissed by keyboard or backdrop, Scoreboard: UI / UX & Info Design (5.5/10)

### Community 60 - "Robber & Taxation Payloads"
Cohesion: 0.67
Nodes (3): StolenItem, RobberMovedPayload, TaxationResolvedPayload

## Knowledge Gaps
- **276 isolated node(s):** `semi`, `singleQuote`, `printWidth`, `trailingComma`, `arrowParens` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Biome` connect `Start Screen & Game Setup` to `Core Game Types & Constants`, `Multiplayer Broadcast Payloads`, `Barbarians & Knights UI`, `Hex Board Generation`, `Merchant Fleet 3D Layer`, `Catan Board 3D Component`, `Board Shape Editor`, `Hex Terrain Geometry`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `ResourceType` connect `Trade & Dev Card Payloads` to `Core Game Types & Constants`, `Board Graph Construction`, `Multiplayer Broadcast Payloads`, `Barbarians & Knights UI`, `Game Phase & Event UI`, `Building Costs Panel`, `Dev Card & Commodity Pickers`, `Resource Panel, Trade & Discard`, `Player Hand 3D Cards`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Player` connect `Knights & Rankings Panels` to `Core Game Types & Constants`, `Barbarian & Improvement Payloads`, `Barbarians & Knights UI`, `Game Phase & Event UI`, `Chat Panel & Draggable UI`, `App.tsx Helper Functions`, `Start Screen & Game Setup`, `Dev Card & Commodity Pickers`, `Game State Reducer & SFX`, `Resource Panel, Trade & Discard`, `Top Bar UI`, `Board Interactions & Hover`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `semi`, `singleQuote`, `printWidth` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dice & Board Frame Rendering` be split into smaller, more focused modules?**
  _Cohesion score 0.06289308176100629 - nodes in this community are weakly interconnected._
- **Should `NPM Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `Core Game Types & Constants` be split into smaller, more focused modules?**
  _Cohesion score 0.08901515151515152 - nodes in this community are weakly interconnected._