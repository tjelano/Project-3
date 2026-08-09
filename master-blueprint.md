# Master Development Blueprint v8: Project-3 (3D Multiplayer Catan)
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

---

## 👥 Agent Roster & Delegation Map (Streamlined)
Only load these 3 specific agents to save tokens and prevent conflicting planning loops:

| Task / Feature | Active Agent | Supporting Auditor |
| :--- | :--- | :--- |
| **Moveable, Draggable HUD Panels** | `engineering-frontend-developer.md` | `design-ui-finish-gate-reviewer.md` |
| **Click-to-Play 3D Development Cards** | `engineering-frontend-developer.md` | `design-ui-finish-gate-reviewer.md` |
| **Manual Discard Selection on 7-Roll** | `engineering-frontend-developer.md` | `design-ui-finish-gate-reviewer.md` |
| **Holographic "Ghost Mesh" Build Previews** | `engineering-frontend-developer.md` | `design-ui-finish-gate-reviewer.md` |
| **The Sideways Robber Offset** | `engineering-frontend-developer.md` | `design-ui-finish-gate-reviewer.md` |

---

## 🛠️ THE SPRINT BACKLOG: The 5 Remaining Features

### Feature 2: Moveable, Draggable HUD Panels
*   **The Issue:** The main Player Trading window and modal panels are rigidly locked in the center of the screen, completely blocking the player's view of the 3D board during crucial negotiations.
*   **The Fix:**
    *   Implement a clean React-based mouse-down, mouse-move tracking listener directly on the glassmorphic modal header container.
    *   Bind this interaction to update the modal's `transform: translate(x, y)` position or top/left offset coordinates.
    *   Ensure dragging releases cleanly on mouse-up and restricts bounds so panels cannot be dragged off-screen.
*   **Success Metric:** Clicking and dragging the trade modal header lets you freely slide it around the viewport to inspect the 3D island behind it.

### Feature 3: Click-to-Play 3D Development Cards
*   **The Issue:** Playing development cards relies on clicking static 2D buttons on the HUD sidebar, which feels un-tactile compared to holding a physical hand of cards in camera-space.
*   **The Fix:**
    *   Add a Raycast `onClick` or double-click handler directly to the local player's active 3D card meshes in `PlayerHand3D.tsx`.
    *   When a player clicks an active Development Card (e.g., Knight, Monopoly), trigger a beautiful, smooth 3D animation where the card slides up toward the center of the camera lens, flips 180 degrees, and automatically calls the corresponding play method (`playKnight`, `playMonopoly`, etc.) in `App.tsx`.
*   **Success Metric:** You can play a Knight card by clicking the actual 3D card mesh floating in your hand.

### Feature 4: Manual Discard Selection on 7-Roll
*   **The Issue:** When a 7 is rolled, any player holding more than 7 cards has exactly half of their hand randomly stripped away by the computer, removing the strategic decision of which resources to discard.
*   **The Fix:**
    *   When the game state enters the \"Over-Limit Discard\" phase during an online/local match, freeze actions and lock the screen with a frosted-glass overlay.
    *   Dim the main 3D game board and focus completely on the player's camera-space 3D fanned hand.
    *   Let the player click on individual 3D cards in their hand to \"flag\" them for discard. Selected cards should hover slightly higher and emit a soft, pulsating red outline.
    *   Add a simple HUD overlay counter (\"Select N more cards to discard\") and a \"Confirm Discard\" button that remains disabled until exactly half of the hand is selected.
*   **Success Metric:** Tactical discard choices are driven entirely by mouse interaction on the 3D cards.

### Feature 5: Holographic "Ghost Mesh" Build Previews
*   **The Issue:** Hovering over intersections or edges to build a Cottage or Road displays generic translucent colored spheres or cylinder blocks as highlights, which looks like unpolished developer placeholders.
*   **The Fix:**
    *   Modify `BoardInteractions.tsx`.
    *   Instead of rendering basic primitive geometries, reference the exact 3D models for the European Cottage (settlement/city) and Timber Road (road) meshes exported from `GamePieces.tsx`.
    *   Render these high-fidelity models with a semi-transparent, see-through holographic material profile: `transparent: true, opacity: 0.4, depthWrite: false`.
*   **Success Metric:** During the build phase, hovering over a vertex displays a ghostly, translucent 3D cottage instead of a colored sphere.

### Feature 6: The Sideways Robber Offset (Unblocking Tile Numbers)
*   **The Issue:** The low-poly 3D Robber figurine sits directly in the center of the hex tile, completely engulfing and hiding the active production number chit underneath it, forcing players to guess what number they are blocking.
*   **The Fix:**
    *   Do not redesign the meshes or build complex text hovering systems.
    *   In `RobberLayer.tsx` (inside `RobberToken`), apply a simple, fixed horizontal X/Z translation offset (e.g., `0.15` units on the local X-axis).
    *   This slides the Robber slightly sideways within the hex grid, positioning it like a guard standing next to the number token, keeping the chit perfectly visible and interactive.
*   **Success Metric:** When the Robber stands on an 8-Mountain tile, both the Robber figurine and the number 8 chit remain 100% visible from all camera angles.
