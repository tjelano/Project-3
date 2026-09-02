# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who already play the physical Settlers of Catan board game and want a real digital version — not newcomers being taught the game. They play either pass-and-play on one shared device or remotely with friends via a 4-character room code. The project is shared informally within the wider Catan-enthusiast community (word of mouth, communities/forums) rather than built for cold general-public discovery.

## Product Purpose

A free, browser-based 3D implementation of Settlers of Catan — base game plus the Seafarers and Cities & Knights expansions — with deep house-rule customization and real-time multiplayer. Built for players who know and love the tabletop game and want its full depth online.

## Positioning

Two things a neighboring product can't truthfully copy:

- **Full house-rule and expansion control** — granular toggles for individual rule variants, all four Cities & Knights phases, custom board-shape drawing — more configurable than the official Catan Universe app or flat web implementations like Colonist.io.
- **Real 3D presentation** — an actual react-three-fiber 3D board, not a flat 2D board graphic.

## Operating Context

Runs entirely in-browser, no install. Local mode: pass-and-play on one device. Online mode: Supabase Realtime multiplayer via room codes, no account/login required. Matches survive disconnects via snapshot persistence/restore.

## Capabilities and Constraints

- Base game + Seafarers + Cities & Knights (all four phases: Commodities/City Improvements, Progress Cards, Knights & City Walls, Barbarian Attacks) fully implemented.
- House rules system (independently toggleable rule variants) and a custom board-shape editor.
- **Rules fidelity is a hard constraint** — game logic must stay faithful to the official rulebooks; design/UX changes must never compromise correctness.
- Commercial status, licensing, and monetization: undecided/unconfirmed — not yet established as product fact, do not assume either way.

## Brand Commitments

A medieval/gold/fantasy visual identity (gold accents, dark navy, ornate painted panels, animated throne-room backdrop) is a confirmed, durable identity — the user likes this direction. Current UI executes it at high intensity; an explicit open request is to tone the intensity down without abandoning the identity itself.

**Structural pattern (standing preference, confirmed 2026-08-26):** For task/settings-style screens (pre-game setup, and by extension future config-heavy screens), the user prefers the conventional pattern — a tabbed panel with a persistent summary/Start bar — over novel structural inventions (a radial hub layout was offered and declined). Craft bar: a general well-designed game launcher's settings/options UI (e.g. Steam, a modern indie game's options menu), not tied to a specific Catan competitor. Execute this pattern at full fidelity, not as a token/safe version.

## Evidence on Hand

- Pixel-art UI kit at `UIKit/` (Aseprite/Sprites/Sprites Animated/Spritesheet) — user holds the originals, available to re-supply if needed.
- `pixellab` MCP tool connected and available for generating new pixel art (buttons, panels, icons) matching the existing style.
- Existing 3D GLB models (settlements, roads, robber, tiles) in a stylized low-poly look — not being touched by this UI work.
- Existing pre-game-flow art (`region-select-menu.png`, `host-menu.png`, `join-room-menu.png`, etc.) — incumbent visual evidence/anti-reference for the current rebuild.

## Product Principles

- Rules fidelity over convenience — never trade correctness for a smoother UI.
- Depth of customization is a first-class feature, not an afterthought.
- 3D presentation is the differentiator, not just functional parity with flat implementations.
- No paywall or account friction — free, room-code multiplayer.
- Speak to players who already know Catan, not people being onboarded to the game for the first time.
