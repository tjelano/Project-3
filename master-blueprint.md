# Master Development Blueprint v12: Project-3 (3D Multiplayer Catan)
## 👥 The 3-Agent Strike Team Orchestration Guide

This master blueprint is a streamlined, high-fidelity engineering roadmap designed for Claude (Sonnet) using your local team of 18 specialized agents located in `.claude/agents/` (or `.cursor/rules/`).

---

## 🧠 THE NO-NONSENSE CODE & TALK PROTOCOL (MANDATORY STYLE FOR CLAUDE)
*   **Keep it simple.** Do not over-engineer. Write the smallest amount of code possible.
*   **Explain like I'm 5 (ELI5).** Use small words. Short sentences. Short paragraphs. If you use a big word (like *quad-tree* or *state-drift*), explain it right after.
*   **Only return what is actually necessary.** No extra text, fluff, or long intros.
*   **Keep-coding-instructions: true**
*   **Just tell me:** What you did, did it work, and what I do now.
*   **If I have to choose something:** Show **2 options max**, the quick context I need to choose fast, and which one you recommend.
*   **Keep paths and commands exact.** No hand-wavey stuff.

---

## 🛑 The Skeptical Agent Protocol (Mandatory Core Rule)
Before any agent writes or refactors a single line of code, they must invoke the **Skeptical Architectural Inquiry** protocol:
1.  **Is this change actually needed?** Do not implement complex patterns if a native framework feature or 1-line refactor handles it.
2.  **Will this break the physics loop?** Ensure continuous physics animations and render frame loops in React Three Fiber (R3F) remain completely decoupled from network overhead.
3.  **Turn advancement is manual-only:** `currentPlayerIndex` may ONLY change from an explicit "End Turn" button click (`handleEndTurn` in `App.tsx`). Never let a dice-settle callback, a robber move, or an incoming socket payload (`DICE_ROLLED`, `ROBBER_MOVED`, or any other broadcast) advance the turn on its own.

---

## 🔒 GOLDFREEZE DIRECTIVE: Working Systems (DO NOT TOUCH)
To prevent regressions, **Claude must not refactor or rewrite the following files or systems**. They are already production-complete, highly optimized, and fully operational:

1.  **3D Physics Dice (`Dice3D.tsx`):** Handled via a closed-form integral of exponential decay to achieve frame-rate independent landings. Do not touch or modify the physics calculation, spawn-burst math, or edge collisions.
2.  **Brave WebGL Crash Fixes (`SceneRig.tsx`, `App.tsx`):** Includes custom listeners for WebGL context loss/restore, and uses a standard shadow map size bounded at 2048x2048 to prevent VRAM overloads. Do not reintroduce custom shader compiles or soft shadow PCSS monkey-patches that trigger driver collapses in Brave or Safari.
3.  **Camera is 100% manual (`SceneRig.tsx`):** `SceneRig` takes zero props and never moves the camera under any circumstance — it was previously auto-rotating to the local player's seat on turn changes, but that caused disorienting jumps and race conditions with the dice/turn logic, so it was deliberately removed. `OrbitControls` in `App.tsx` is the sole camera driver, fully under the player's own mouse input. Do not reintroduce automatic camera movement of any kind (no seat-lock, no spectator cut, nothing turn-driven).
4.  **Anti-Cheat Texture Gating (`PlayerHand3D.tsx`):** Restricts front texture materials to the local player ID. Opponent card meshes only load the `backside_design.jpeg` texture, making casual camera peeking mathematically impossible.
5.  **Multiplayer Connection & Automated Tests (`testNetworkSync.ts`):** Complete with Presence and Broadcast routing on a unified Supabase channel.
6.  **Interactive P2P Trade Sync (`useRoomChannel.ts`, `App.tsx`, `GameHud.tsx`):** Uses four synchronized events (`TRADE_OFFERED`, `TRADE_ACCEPT_REQUEST`, `TRADE_RESOLVED`, `TRADE_CANCELLED`) and a Host-as-Arbiter pattern to handle trading over the internet safely. Do not touch!
7.  **Tactile 3D Cards, Fans & Hover Easing (`PlayerHand3D.tsx`):** Renders beautiful, fanned 3D card groups that lift and tilt with frame-rate independent Math.exp easing. Front faces use custom image assets, while opponent cards cleanly display backside design textures to prevent peeking.
8.  **Manual Discard Selection:** Players manually select which cards to discard from their fanned 3D hand when their card count is over the limit on a 7-roll.
9.  **Holographic Build Previews:** Translucent, European-style Cottage and Timber Road models render over valid nodes/edges during build mode.
10. **The Sideways Robber Offset:** The 3D Robber sits horizontally offset in the hex tile, keeping the number chit underneath fully visible and interactive.

---

## 👥 Agent Roster & Delegation Map (Streamlined)
Only load these 3 specific agents to save tokens and prevent conflicting planning loops:

| Task / Feature | Active Agent | Supporting Auditor |
| :--- | :--- | :--- |
| **Emergency Playtest Bug Fixes & HUD Drag Optimization** | `engineering-frontend-developer.md` | `design-ui-finish-gate-reviewer.md` |
| **Tactical Hover-Zoom & Click-to-Play Dev Cards** | `engineering-frontend-developer.md` | `design-ui-finish-gate-reviewer.md` |

---

## 🚨 EMERGENCY PLAYTEST BUG BACKLOG (FIX THESE FIRST!)

### Bug 1: 7-Roll Discard Lockout
*   **The Issue:** When a 7 is rolled, Player 1 (holding > 7 cards) has to discard, but Player 2 (holding <= 7 cards) does not. Player 1 gets stuck in a permanent "Waiting for everyone to discard" loop because the game waits for Player 2 to discard, even though Player 2 has nothing to discard.
*   **The Fix:** 
    *   In `App.tsx`, update the discard waiting check. 
    *   The state engine must only wait for players who actually have more than 7 cards (`totalCards > 7`). 
    *   Players with 7 or fewer cards must be marked as "auto-completed" or skipped in the discard checklist.
*   **Success Metric:** If Player 1 has 8 cards and Player 2 has 5 cards, rolling a 7 asks Player 1 to discard and immediately continues the game as soon as Player 1 finishes.

### Bug 2: Rejoined Player Dice Roll Lockout
*   **The Issue:** When a player leaves a match and joins back in (reconnects), they cannot roll the dice when it is their turn. This is likely because the rejoining player name doesn't match the original slot exactly, or the `localPlayerId` mapping does not restore their turn permissions.
*   **The Fix:**
    *   In `App.tsx` and the re-hydration loops (`loadMatchSnapshot` / `restoreFromSnapshot`), ensure that the rejoining player is mapped to their correct original player slot by matching their username or storing the player index.
    *   Make sure `currentPlayerIndex` and the "Roll Dice" button lock gate properly on the reconnected player's active state.
*   **Success Metric:** Rejoining a game restores your original seat, cards, and lets you roll the dice normally when your turn starts.

### Bug 3: Low-Floating Number Chits
*   **The Issue:** The 3D number circles (chits) are sitting too low in their stands. They clip into the pedestal model and are hard to see from different camera angles.
*   **The Fix:**
    *   In `TileDecorations.tsx`, increase the vertical Y-axis height offset of the number chits.
    *   Lift them up slightly higher so they float cleanly above the tile pedestal and terrain models.
*   **Success Metric:** Number chits are perfectly visible and readable from all angles without clipping.

### Bug 4: Choppy Trade HUD Panel Dragging (Performance Optimization)
*   **The Issue:** Clicking and dragging the glassmorphic trading modal feels choppy and stuttery. React's default state updates on every single pixel movement trigger expensive virtual DOM diffs and re-renders of parent UI/canvas containers at a low frame-rate.
*   **The Fix:**
    *   Optimize the mouse event handlers for dragging the panels.
    *   Instead of writing to high-level reactive coordinate states that trigger full component renders during active drags, apply a hardware-accelerated CSS `transform: translate3d(x, y, 0)` directly to the DOM element's style using a React `useRef` pointing to the modal container.
    *   This entirely bypasses React's virtual DOM reconciliation loop during active mouse movement, achieving a buttery-smooth 60+ FPS drag feel!
*   **Success Metric:** Clicking and sliding the trading panel is completely smooth and fluid, with zero game-board lag or visual stuttering.

---

## 🛠️ THE SPRINT BACKLOG: Remaining Features

### Feature Refinement: Tactical Hover-Zoom & Click-to-Play Dev Cards
*   **The Issue:** When clicking a 3D development card, it instantly plays the card. Players do not have a chance to read the card's rules text before playing it.
*   **The Fix:**
    *   Modify `PlayerHand3D.tsx`.
    *   **Hover-Zoom (Enlarge):** When a player hovers their cursor over a 3D development card, amplify the hover animation: scale its mesh up significantly larger (e.g., `scale: 1.45`), lift it higher on the Y-axis, and tilt its face flat to the camera lens so the text is fully readable.
    *   **Hover-Off (Shrink):** When the cursor leaves the card (hover ends), it must automatically slide back down and shrink to its original size in the fanned hand.
    *   **Click-to-Play:** Clicking the card while it is hovered will play the development card (calling the corresponding play handler like `playKnight`, `playMonopoly`, etc., in `App.tsx`). This completely bypasses the need for a secondary state or click-to-zoom tracking, keeping interaction dead simple and intuitive!
*   **Success Metric:** Hovering over a Knight card enlarges it so you can read its rules; clicking it immediately plays it; moving the mouse away shrinks it back down safely to your hand.
