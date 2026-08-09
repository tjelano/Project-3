# AGENTS

## Purpose
This file gives AI coding agents the essential project structure, commands, and conventions for the `catan-3d` React + TypeScript game project.

## Project layout
- The real application lives in `catan-3d/`.
- `catan-3d/src/` contains the game app, 3D scene, UI, game logic, multiplayer support, and tests.
- Top-level `package.json` is minimal; use `catan-3d/package.json` for dev/build/test commands.

## Build and run commands
From the `catan-3d/` folder:
- `npm install`
- `npm run dev` — start Vite dev server
- `npm run build` — run TypeScript build and Vite production build
- `npm run lint` — run ESLint across the repo
- `npm run test` — run Vitest once
- `npm run test:watch` — run Vitest watch mode
- `npm run test:network` — run the multiplayer network sync script (`src/multiplayer/testNetworkSync.ts`)

## Key architecture notes
- The UI is React + TypeScript + Vite with React 19.
- Rendering uses React Three Fiber (`@react-three/fiber`) and `three`.
- `src/game/` and `src/data/` contain framework-free game logic and are tested in Node.
- `src/components/` holds the app UI and 3D scene components.
- `src/three/` contains three.js helpers, layout, materials, and labels.
- `src/multiplayer/` contains room code, network sync, and multiplayer state.

## Important files
- `catan-3d/vite.config.ts` — Vite config uses `host: true` and dedupes `three` to avoid multiple runtime copies.
- `catan-3d/tsconfig.app.json` — app TS config with strict options and DOM libs.
- `catan-3d/eslint.config.js` — ESLint rules and plugin configuration.
- `catan-3d/AUDIT.md` — project-specific design and correctness notes.

## Conventions and pitfalls
- Do not introduce a second `three` copy. Use the existing Vite `dedupe: ['three']` behavior.
- The game logic in `src/game` is intentionally separated from React and should remain framework-agnostic.
- `src/components/hud` contains most of the game HUD and player interaction surface.
- `src/multiplayer/testNetworkSync.ts` is a Node-only test script excluded from `tsconfig.app.json`.
- No Prettier config is present; use existing linting and formatting practices.

## When editing code
- Prefer changes inside `catan-3d/` unless the task explicitly requires a top-level workspace change.
- Keep UI and game-logic separation clear: `src/game` for rules, `src/components` and `src/three` for presentation.
- Use targeted `Vitest` tests under `src/**/*.test.ts` to verify gameplay logic.

## Notes for Claude agents
- The recommended workspace root for tasks is `catan-3d/`.
- Use `AUDIT.md` for project-specific non-obvious requirements and bug context.
- If the task touches multiplayer behavior, `src/multiplayer/` and `src/components/hud` are the most relevant areas.
