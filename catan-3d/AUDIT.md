# Catan 3D — Technical & Design Audit

Reviewed against a **shipped-commercial-game** bar, not a prototype bar. Every
finding below was verified by reading the source or running a probe — nothing
is inferred from vibes.

---

## Progress

**Wave 1 (correctness) — ✅ complete.** S0-1, S0-2, S0-3, S0-4 all fixed.
**Wave 2 (lock it down) — ✅ complete.** Vitest added; **35 tests passing**.
S3-4 (dead `App.css`) deleted.
**Wave 3 (visual pass) — ✅ complete.** S1-3 camera constraints, S1-4 IBL,
S2-3 post-processing. Also pulled forward: **S3-5 error boundary**, plus two
new items found while doing the work (**S2-6** duplicate three.js, **S3-7**
no Prettier config).

> ⚠️ **Wave 3 is not visually verified.** The browser automation this session
> had been using disconnected, and installing Playwright would have added
> ~300MB of browser binaries uninvited. Everything typechecks, tests, builds
> and serves — but nobody has *looked* at it. See "How to check Wave 3" below.

The S0-1 and S0-3 regressions are covered by tests that were *mutation-verified*
— reverting the fix turns them red (`expected 1 to be null`), so they have real
teeth rather than passing vacuously.

Two items were **missed in the first pass** and are added below: **S2-5**
(`npm run lint` is failing) and **S3-6** (TypeScript `strict` is off).

> S0-2 and S0-4 are verified by typecheck + code review only. They live inside
> the `App` component and can't be unit-tested without the S3-1 reducer
> refactor — which is now the strongest argument for doing S3-1.

---

## How to check Wave 3

Run `npm run dev`, open the board, and look for these four things. Each has a
single named constant to turn if it's wrong.

| Look for | Should be | If wrong, turn |
|---|---|---|
| Contact shadows where pieces meet tiles | Present but subtle — grounding, not grime | `AO_INTENSITY` / `AO_RADIUS` in `SceneRig.tsx` |
| Glow | Only on snow caps, gold, number tokens — **not** whole tiles | raise `BLOOM_THRESHOLD` (0.92 → 0.96) |
| Overall exposure | Richer than before, not darker | `KEY_LIGHT_INTENSITY`, `HEMI_INTENSITY` |
| Camera | Can't drop below the horizon or pan off the island | `maxPolarAngle` in `App.tsx` |

Nuclear option if post-processing misbehaves on your GPU: set
`ENABLE_POST_PROCESSING = false` at the top of `SceneRig.tsx`. The scene
still renders correctly — just flatter.

---

## Scoreboard

| # | Category | Score | One-line verdict |
|---|---|---|---|
| 1 | Game Rules Fidelity | **6.5** / 10 | Strong core, but 4 real rule violations — two of which can hand the game to the wrong player |
| 2 | Game Feel / Juice | **3.0** / 10 | Dice are world-class; everything else has zero feedback — no audio, no animation, no reward moments |
| 3 | UI / UX & Info Design | **5.5** / 10 | Coherent glass language, genuinely useful panels; breaks down on dismissal, focus, and any viewport that isn't ~1440px |
| 4 | Three.js Rendering Craft | **4.5** / 10 | Disciplined low-poly art direction, but rendering is "default R3F" — no IBL, no post, no fog, camera can fly under the world |
| 5 | Performance & Scalability | **4.0** / 10 | ~430 draw calls with ~430 unique materials + geometries, zero sharing, zero instancing, zero memoization |
| 6 | React Architecture | **3.5** / 10 | 1,007-line God component, 24 `useState`, 25-prop HUD, no state machine, no memo |
| 7 | Accessibility | **1.5** / 10 | Exactly one ARIA attribute in the entire codebase. Board is keyboard-unreachable |
| 8 | Code Health | **6.0** / 10 | Excellent *why*-comments and clean data/game layers; dead file, no tests, no error boundary |

### **Overall: 4.3 / 10** against a commercial bar

Framed fairly: as a **portfolio prototype** this is a **~7/10** — the scope is
large, the board math is exact, and the dice solution is legitimately better
than what most shipped indie games do. The 4.3 reflects the distance to
*shippable*, which is what the top 1% bar measures.

**What is already top-tier and must not be regressed:**
- Closed-form exponential-decay dice landing (frame-rate independent, provably exact)
- Elastic dice-vs-dice collision with momentum + energy conservation
- Longest-road DFS that correctly honors opponent-settlement path breaking
- Deterministic board graph derived purely from tile centers
- Seeded PRNG for decorations vs. true RNG for gameplay — correct separation

---

## To-Do List — ranked by severity

### 🔴 S0 — Correctness. These change who wins.

---

#### S0-1 · Longest Road is never surrendered when the network is broken
**File:** `src/game/trophies.ts` → `pickTrophyHolder`
**Verified by probe:**
```
holder road broken to 3, nobody else >=5
expected: null (card returned)   got: 1   <-- BUG
```
An opponent plants a settlement mid-path, your 6-road chain splits to 3 — you
keep Longest Road and its **+2 VP** indefinitely. This can directly produce a
wrong winner, and it silently invalidates the otherwise-correct path-breaking
logic you already wrote in `calculateLongestRoad`.

**Fix** — the incumbent must re-qualify against the threshold, not just against challengers:
```ts
export function pickTrophyHolder(
  prevHolderId: number | null,
  counts: Map<number, number>,
  threshold: number,
): number | null {
  // An incumbent who has fallen below the threshold no longer holds anything.
  const incumbentQualifies =
    prevHolderId != null && (counts.get(prevHolderId) ?? 0) >= threshold

  let winnerId = incumbentQualifies ? prevHolderId : null
  let winnerCount = incumbentQualifies ? counts.get(prevHolderId!)! : threshold - 1

  for (const [playerId, count] of counts) {
    if (playerId === prevHolderId && incumbentQualifies) continue
    if (count < threshold) continue
    if (count > winnerCount) {
      winnerId = playerId
      winnerCount = count
    }
  }
  return winnerId
}
```
Keep the existing tie rule (incumbent wins ties) — that part is correct.

---

#### S0-2 · Setup roads may be placed anywhere on the board
**File:** `src/App.tsx` → `buildRoad`, line ~335
```ts
if (!isSetup && !isRoadPlacementConnected(edgeId, player.id)) { … }
//  ^^^^^^^^ connectivity is entirely skipped during setup
```
During the opening snake draft a player can drop their free road on any empty
edge on the map — nowhere near the settlement they just placed. This breaks the
single most strategically important decision in Catan (opening road direction),
and it lets players pre-seed disconnected road fragments to game Longest Road later.

**Fix** — during setup the road must touch the settlement placed this step. Track it:
```ts
const [setupSettlementVertexId, setSetupSettlementVertexId] = useState<string | null>(null)
// …in buildSettlement's isSetup branch:
setSetupSettlementVertexId(vertexId)

// …in buildRoad, replacing the guard above:
if (isSetup) {
  const edge = edgeById.get(edgeId)
  const touchesNewSettlement =
    edge && (edge.a === setupSettlementVertexId || edge.b === setupSettlementVertexId)
  if (!touchesNewSettlement) {
    warn('Your first road must connect to the settlement you just placed!')
    return
  }
} else if (!isRoadPlacementConnected(edgeId, player.id)) {
  warn('Road must connect to your existing structures.')
  return
}
```
Reset `setupSettlementVertexId` to `null` in `resetGame`.

---

#### S0-3 · Hidden Victory Point cards are leaked to every player
**File:** `src/components/hud/RankingsPanel.tsx`
`getScoreBreakdown(...).total` includes `victoryPointCards`, and that total is
rendered for **all** players. In a hot-seat game everyone is looking at the same
screen — so secret VP cards aren't secret. This removes the entire bluff layer
(the "are they at 8 or actually at 10?" tension that makes the endgame work).

**Fix** — show a public score in the live HUD, reveal the true total only on the victory screen:
```ts
// types.ts — add alongside the existing breakdown
export function getPublicScore(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
): number {
  const s = getScoreBreakdown(player, settlements, longestRoadHolderId, largestArmyHolderId)
  return s.total - s.victoryPointCards // hidden until claimed
}
```
Use `getPublicScore` in `RankingsPanel`; keep `getScoreBreakdown` in `VictoryBanner`.
Win detection must keep using the *true* total — that stays as-is.

---

#### S0-4 · Unlimited development cards per turn
**Files:** `src/App.tsx` → `playKnight` / `playRoadBuilding` / `playYearOfPlenty` / `playMonopoly`
No guard exists. A player holding three Knights can play all three in one turn,
instantly claiming Largest Army (+2 VP) and moving the Robber three times.
Official rule: **one dev card per turn**.

**Fix** — one flag, cleared in the existing `endTurn` you already centralized:
```ts
const [devCardPlayedThisTurn, setDevCardPlayedThisTurn] = useState(false)

// shared guard at the top of each play* handler:
if (devCardPlayedThisTurn) {
  warn('You may only play one development card per turn.')
  return
}
// …on success in each handler:
setDevCardPlayedThisTurn(true)

// in endTurn():
setDevCardPlayedThisTurn(false)
```
Also thread it into `canPlayDevCards` in `GameHud` so the buttons visibly disable.

---

### 🟠 S1 — Player experience. The game works but doesn't *feel* built.

---

#### S1-1 · Zero audio
There is no sound in the entire application. For a dice-and-trade game this is
the single largest game-feel gap — dice clatter, settlement thunk, resource
chime, and a Robber sting carry more perceived polish than any shader.

**Best fit for this stack:** `howler` for UI/one-shots (simple, reliable pooling),
plus drei's `<PositionalAudio>` if you want the dice to sound spatial.
```bash
npm i howler @types/howler
```
Hook the dice into the moment they first touch the ground in `Dice3D`'s
`useFrame` (`position.y <= REST_Y` with `velY` above a threshold), and gate
volume behind a mute toggle in `TopBar`.

---

#### S1-2 · Event banners never dismiss
**File:** `src/App.tsx` / `EventBanner.tsx` — verified: **zero** `setTimeout` in the codebase.
A warning sits on screen indefinitely until some other message replaces it, so
stale errors ("Not enough resources") linger through unrelated turns and read as
a stuck UI.

**Fix** — auto-expire with cleanup, keyed so repeat messages re-trigger:
```ts
const [banner, setBanner] = useState<BannerMessage | null>(null)

useEffect(() => {
  if (!banner) return
  const id = setTimeout(() => setBanner(null), banner.variant === 'warning' ? 3500 : 5000)
  return () => clearTimeout(id)
}, [banner])
```
Give `BannerMessage` an incrementing `id` field so two identical warnings in a
row still restart the timer. Pair with a fade/slide via the `@theme` animation
tokens you already established in `index.css`.

---

#### S1-3 · Camera can fly under the world
**File:** `src/App.tsx` line 973 — `<OrbitControls target={[0, 0, 0]} />`, fully unconstrained.
The player can orbit beneath the ocean plane and view the board from below
(seeing untextured backfaces and the underside of every token), pan the island
off-screen entirely, and dolly through geometry.

**Fix:**
```tsx
<OrbitControls
  target={[0, 0, 0]}
  minPolarAngle={Math.PI / 6}      // don't go fully top-down
  maxPolarAngle={Math.PI / 2.35}   // never below the horizon
  minDistance={6}
  maxDistance={18}
  enablePan={false}                 // island stays centered
  enableDamping
  dampingFactor={0.08}
/>
```
Damping alone materially improves how premium the camera feels.

---

#### S1-4 · Materials read flat and plasticky — no image-based lighting
`meshStandardMaterial` is PBR, but with no environment map it has nothing to
reflect, so every surface resolves to raw diffuse. **This is the highest
visual-return-per-line-of-code change available in the project.**

**Fix** — use drei `<Environment>` with inline `<Lightformer>`s rather than a
`preset`, so nothing is fetched from a CDN (keeps the app fully offline and
avoids a network dependency in a portfolio piece):
```tsx
import { Environment, Lightformer } from '@react-three/drei'

<Environment resolution={256}>
  <Lightformer intensity={2.2} position={[0, 5, -6]} scale={[12, 6, 1]} color="#cfe3ff" />
  <Lightformer intensity={0.9} position={[-6, 2,  4]} scale={[8, 4, 1]}  color="#ffd9a0" />
  <Lightformer intensity={0.6} position={[ 6, 1, -2]} scale={[8, 4, 1]}  color="#7aa7ff" />
</Environment>
```
Then give materials something to work with — `roughness={0.65} metalness={0.05}`
on tiles, lower roughness on the ocean and dice.

---

#### S1-5 · Modals can't be dismissed by keyboard or backdrop
`TradeModal`, `DevCardResourcePicker`, and `TradeOfferPrompt` have no Escape
handler, no click-outside, and no focus trap. Verified: **one** `aria-*`
attribute exists in the whole codebase, and there are zero `onKeyDown` handlers.

**Fix** — a shared `useDismissable(onClose)` hook (Escape + backdrop click), and
move focus into the dialog on mount, restoring it on unmount. If you'd rather not
hand-roll focus trapping, `radix-ui/react-dialog` gives you trap + Escape +
`role="dialog"` + scroll-lock correctly, and is unstyled so your glass language survives.

---

#### S1-6 · Buildings appear instantly with no transition
Settlements, cities, and roads pop into existence at full scale. The single
highest-value juice addition after audio: a ~250ms spring scale-in, plus a brief
emissive flash in the owner's color.

**Best fit:** `@react-spring/three` (pmndrs-native, composes directly with R3F).
```tsx
const { scale } = useSpring({ from: { scale: 0 }, to: { scale: 1 }, config: { tension: 300, friction: 18 } })
<a.group scale={scale}>{/* SettlementModel */}</a.group>
```

---

### 🟡 S2 — Rendering technique & performance.

---

#### S2-1 · ~430 draw calls, ~430 unique materials, ~430 unique geometries
Measured composition on a standard board: 19 tiles + 12 mountain + 15 hill +
48 forest + 32 sheep + 48 wheat + 36 token meshes + **126 interaction hitboxes**
+ 45 port meshes + 44 dice pips + ocean + robber.

Every `<meshStandardMaterial>` / `<coneGeometry>` in JSX instantiates a **separate**
`THREE.Material` and `THREE.BufferGeometry` per mesh — verified 30 inline material
tags and 34 geometry tags, none shared. On desktop this still hits 60fps, but it
is the opposite of the technique the low-poly style is designed to enable, and it
will fall over on mid-tier mobile.

**Fix** — drei `<Instances>` for repeated decorations. Trees, sheep, wheat, and
hill bumps are ideal: identical geometry, per-instance transform + color.
```tsx
import { Instances, Instance } from '@react-three/drei'

<Instances limit={200} castShadow receiveShadow>
  <coneGeometry args={[1, 1, 6]} />
  <meshStandardMaterial flatShading />
  {allTreesAcrossAllTiles.map((t, i) => (
    <Instance key={i} position={t.pos} scale={t.scale} color={t.color} />
  ))}
</Instances>
```
This collapses ~143 decoration draw calls into ~4. Hoist the decoration
generation from per-tile `useMemo` up to one board-level pass so instances can
be batched across tiles.

For the 126 hitboxes: they're invisible, so drop them from the shadow and raycast
cost by sharing one module-level geometry + material singleton and setting
`raycast` only on the layer you're currently interacting with.

---

#### S2-2 · Zero memoization — every state change re-renders the entire 3D tree
Verified: **0** occurrences of `React.memo`, `useCallback`, or `memo(` in `src/`.
`BoardInteractions` builds 126 slot components, each receiving a freshly-allocated
`onBuild={() => …}` closure on every parent render. A banner change, a resource
tick, or a dice frame re-reconciles all of them.

**Fix (structural, and it solves prop-drilling at the same time):** move game state
into **Zustand**. Its key property here is that 3D children can subscribe to a
narrow slice and re-render *independently of the parent*, which is the idiomatic
pmndrs answer to exactly this problem.
```bash
npm i zustand
```
```ts
// only re-renders when THIS vertex's building changes
const building = useGameStore(s => s.settlements[vertexId])
```
Interim cheap win if you'd rather not restructure yet: `export const VertexSlot = memo(...)`
plus stable `useCallback` handlers in `App.tsx`.

---

#### S2-3 · No post-processing pass
No bloom on the gold accents, no ambient occlusion grounding pieces to tiles, no
vignette focusing the composition. This is the difference between "3D board" and
"game".

**Fix:** `@react-three/postprocessing`
```bash
npm i @react-three/postprocessing postprocessing
```
```tsx
<EffectComposer multisampling={4}>
  <N8AO aoRadius={0.35} intensity={1.4} distanceFalloff={0.6} />
  <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.5} />
  <Vignette eskil={false} offset={0.15} darkness={0.55} />
</EffectComposer>
```
`N8AO` in particular will do more for perceived quality than any other single
addition — contact shadows where pieces meet tiles.

---

#### S2-4 · Ocean is static, and its edge is a hard line
`Ocean.tsx` jitters vertices once at build time and never moves. There's also no
fog, so the 40×40 plane terminates in a visible straight edge against the
background at shallow camera angles.

**Fix** — animate the existing vertices in `useFrame` (cheap: 625 verts, and it
matches the codebase's existing hand-rolled-math style):
```ts
useFrame(({ clock }) => {
  const t = clock.elapsedTime
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    pos.setY(i, Math.sin(x * 0.6 + t * 0.9) * 0.03 + Math.cos(z * 0.5 + t * 0.7) * 0.03)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
})
```
Add `<fog attach="fog" args={['#0b1220', 18, 42]} />` to the Canvas to dissolve
the far edge into the background.

---

---

#### S2-5 · `npm run lint` is failing — 6 errors ⚠️ *missed in the first audit pass*
Verified: `npx eslint src` exits non-zero. Three of the six are the same
architectural smell, and it's a meaningful one.

```
src/App.tsx        149:5   setState called synchronously within an effect  (longestRoadHolderId)
src/App.tsx        153:5   setState called synchronously within an effect  (largestArmyHolderId)
src/App.tsx        162:16  setState called synchronously within an effect  (winner)
src/components/Dice3D.tsx  203:12  Cannot modify local variables after render completes
src/components/Dice3D.tsx  236:7   This value cannot be modified
src/components/Dice3D.tsx  329:19  Cannot access refs during render
```

**The App.tsx three** are the classic *"you might not need an effect"* pattern:
state that is really derived gets stored in `useState` and synced by `useEffect`,
costing an extra render pass every time and briefly rendering a stale score.

The nuance worth preserving: trophy holders are **not purely derived** — the
tie rule makes them path-dependent on the previous holder, so they legitimately
need to persist. The correct fix is not to compute them during render, but to
recalculate them **in the event handlers that can change them** (`buildRoad`,
`buildSettlement` for path-breaking, `playKnight`) instead of reacting after the
fact. `winner` should likewise be settled where the score changes.

**The Dice3D three** stem from `const groupRefs = [useRef(null), useRef(null)]`
— building a ref array inline during render. Two plainly-named refs
(`die0Ref` / `die1Ref`) resolve all three cleanly.

Fold this into Wave 5 with S3-1, and add `npm run lint` to the definition of done.

---

### 🔵 S3 — Architecture & long-term health.

---

#### S3-1 · `App.tsx` is 1,007 lines with 24 `useState` hooks
Phase state is spread across `gamePhase`, `setupStage`, `isRolling`, `winner`,
`pendingTrade`, `devCardPicker`, `robberMoveFromKnight`, and `freeRoadsRemaining`
— eight independent variables that can express contradictory states, and every
action handler re-checks a hand-written subset of them. That's why the same four
guard clauses are copy-pasted across ~8 handlers.

**Fix:** collapse to a discriminated union driven by `useReducer`:
```ts
type GameState =
  | { phase: 'setup'; stage: 'settlement' | 'road'; stepIndex: number }
  | { phase: 'awaitingRoll' }
  | { phase: 'rolling'; target: DiceRollTarget }
  | { phase: 'moveRobber'; fromKnight: boolean }
  | { phase: 'resourcePicker'; mode: DevCardPickerMode }
  | { phase: 'tradePending'; trade: PendingTrade }
  | { phase: 'build'; freeRoads: number }
  | { phase: 'gameOver'; winnerId: number }
```
Illegal states stop being representable, and each handler validates one field
instead of six. XState is overkill at this size — a reducer is proportionate.

---

#### S3-2 · `GameHud` takes 25 props
Pure pass-through plumbing from `App`. Dissolves automatically once S2-2 (Zustand)
lands — panels select what they need directly.

---

#### S3-3 · Accessibility is effectively absent
One `aria-label` total. No keyboard path to the board, no focus-visible styling,
no `aria-live` on the banner, and player identity is conveyed by color alone
(a problem for the ~8% of men with color vision deficiency — and `player-1` red
vs `player-3` purple is a common confusion pair).

**Fix, in priority order:**
1. `role="status" aria-live="polite"` on `EventBanner` — one line, large win.
2. Focus trap + Escape on all three modals (see S1-5).
3. `focus-visible:ring-2 focus-visible:ring-gold` on every interactive element.
4. Add a shape/pattern to player tokens, or a letter badge, so color isn't the sole channel.
5. Keyboard board traversal (arrow keys cycling legal vertices) — larger effort, do last.

---

#### S3-4 · ~~Dead file: `src/App.css` (184 lines)~~ ✅ done
Leftover Vite scaffold (`.counter`, `.hero`, `.vite` logo rules), imported
nowhere. Deleted.

---

#### S2-7 · ⚠️ Do not use drei's `<SoftShadows>` on three 0.185 *(landmine)*
It monkey-patches three's `shadowmap_pars_fragment` chunk to add PCSS. In
drei 10.7.7 against three 0.185 that patch no longer matches, and **every
fragment shader in the scene fails to compile**:

```
THREE.WebGLProgram: Shader Error 1282 - VALIDATE_STATUS false
Program Info Log: Fragment shader is not compiled.
```

Nothing typechecks or builds differently — it only shows at runtime, in the
browser console. Caught here by reading the Vite dev log, which forwards
client `console.error` to the terminal.

Soft shadows now come from **VSM** instead (`shadows={{ type: THREE.VSMShadowMap }}`
on the Canvas plus `shadow-radius` / `shadow-blurSamples` on the key light).
VSM is core three, blurs the shadow map natively, and patches nothing.
Re-test before ever reintroducing `<SoftShadows>`.

---

#### S2-6 · Two copies of three.js were loading ✅ fixed *(found during Wave 3)*
The dev server was logging `THREE.WARNING: Multiple instances of Three.js
being imported`. Cause: `stats-gl` (a drei dependency) pins its own
`three@0.170` next to the project's root `three@0.185`.

Two copies is not cosmetic — `instanceof` checks across the boundary fail
silently, which surfaces much later as an unexplained material, raycast, or
geometry error that looks like a logic bug.

Fixed with `resolve.dedupe: ['three']` in `vite.config.ts`; Vite's
optimized-deps metadata now shows a single `three` entry resolving to the
root copy. Worth re-checking after any future drei/postprocessing upgrade.

---

#### S3-7 · No Prettier config ✅ fixed *(found the hard way during Wave 3)*
The project had no `.prettierrc`, so running `prettier --write` on any file
silently reformats it to Prettier's defaults — double quotes and semicolons —
against a codebase written with single quotes and none. I did exactly that to
`App.tsx` mid-wave and had to reverse it.

Added `.prettierrc.json` reverse-engineered from the untouched source
(`semi: false`, `singleQuote: true`, `printWidth: 115`). `App.tsx` is now
clean against it.

**Not done:** the rest of `src/` was never Prettier-formatted and still
drifts. That's a mass diff across files this work didn't touch, and with no
git in this project there'd be no way to review it — so it's left for a
deliberate one-shot `npx prettier --write src` when you're ready.

---

#### S3-6 · TypeScript `strict` is off ⚠️ *missed in the first audit pass*
`tsconfig.app.json` sets `noUnusedLocals` / `noUnusedParameters` but **never
enables `strict`** — so `strictNullChecks` is off across the whole project.

That's why `settlements[vertexId]`, `tileById.get(...)`, and
`graph.vertexById.get(edge.a)!` all typecheck despite returning
`T | undefined`. The codebase is *written* as though null-safe — the care is
visible in the `?? []` fallbacks and `!= null` guards — but none of it is
actually enforced by the compiler, so a missed guard fails at runtime instead
of at build.

**Fix** — turn it on and work the list down:
```jsonc
// tsconfig.app.json
"strict": true,
```
Expect a batch of errors concentrated in `App.tsx` map lookups. Do this
*before* the S3-1 reducer refactor, so the refactor happens under a compiler
that can actually catch mistakes.

---

#### S3-5 · No tests, no error boundary
There is no test suite, despite the codebase containing exactly the kind of pure,
high-value logic that rewards testing — `calculateLongestRoad`, `pickTrophyHolder`,
`buildSetupOrder`, `getScoreBreakdown`, `discardRandomHalf`. Both S0 bugs above
would have been caught by a five-line test.

**Fix:** Vitest is already a one-line addition to a Vite project.
```bash
npm i -D vitest
```
Start with `src/game/__tests__/trophies.test.ts` covering the S0-1 regression.
Separately, wrap `<Canvas>` in an error boundary — a WebGL context loss currently
white-screens the entire app with no recovery path.

---

## Suggested execution order

| Wave | Items | Why this order |
|---|---|---|
| **1** ✅ | S0-1 → S0-4 | Correctness first. Ship a game that computes the right winner. |
| **2** ✅ | S3-5 (tests for the S0 fixes), S3-4 | Lock the bugs closed before layering features on top. |
| **3** | S1-4, S2-3, S1-3 | IBL + AO + camera constraints. Biggest visual leap for the least code. |
| **4** | S1-1, S1-2, S1-6 | Audio, banner lifecycle, placement springs — the "feels built" wave. |
| **5** | S3-6, then S2-2, S3-1, S3-2, S2-5 | `strict` on *first*, then Zustand + reducer + lint green. Do it after features settle. |
| **6** | S2-1, S2-4, S1-5, S3-3 | Instancing, water, modal a11y, accessibility pass. |

---

## New dependencies implied

```bash
npm i zustand @react-spring/three @react-three/postprocessing postprocessing howler
npm i -D vitest @types/howler
```
All are pmndrs-ecosystem or ecosystem-adjacent and compose cleanly with the
existing R3F v9 / React 19 / Vite 8 setup. No version conflicts expected.
