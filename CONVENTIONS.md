# Conventions

Patterns this codebase has converged on, documented from real code so this stays accurate instead of idealized. Scope: `catan-3d/` (the game client).

**Keeping this in sync:** if a task changes how one of these patterns works — the shape of a trusted-apply function, a new gating derivation, a new source of non-deterministic randomness — update the relevant section as part of that task. Don't let this file describe code that no longer exists; a stale convention doc is worse than none.

---

## 1. Trusted-Apply Broadcast Pattern

For any state mutation that depends on a non-deterministic choice — `Math.random()`, or which of several valid targets a player clicked — only ONE client ever makes that choice. Every other client (including the acting client's own local path) applies the *result* through the same shared mutation function, never re-deriving it. A receiver that re-rolls its own random pick, or re-validates against its own possibly-stale local state instead of trusting the payload, will disagree with what the acting client actually did.

The shape has three parts:
1. A shared **trusted-apply function** — pure state mutation, takes already-decided values as arguments, no randomness inside it.
2. The **local actor's call site** — decides the random/click-driven value, calls the trusted-apply function, then broadcasts the same decided value.
3. The **receive handler** — validates the payload's shape against current local state (reject and log if it doesn't check out), then calls the *same* trusted-apply function with the payload's values.

The board-slice reducer refactor changed the trusted-apply function's own shape (not the three-part pattern above, which still holds): it now takes a trailing `isDeciding: boolean` parameter and routes its board-domain write through `dispatchGameAction` — which dispatches to `reduceGame`, fires the banner/sfx via `describeBoardAction`, and (when `isDeciding` is true) broadcasts — instead of a bare `setSettlements`/`setRoads` call. The local actor's call site no longer broadcasts separately; that now happens inside the trusted-apply function itself via `dispatchGameAction`'s `isDeciding` path.

### Do this

Trusted-apply function (`App.tsx`, `applyPillage`):

```tsx
// Tracks vertices already resolved this session, outside React state, so a
// second call in the SAME tick (StrictMode's effect double-invoke, the
// timeout sweep racing a manual click) is rejected before it reaches
// setPlayers or the banner. A `gameState.board.settlements` read alone
// can't do this: `dispatch` is async and the reducer's own state doesn't
// update until the next render, so two same-tick calls would both still
// see the pre-dispatch board and both pass a state-only check.
const resolvedPillageVertexIdsRef = useRef(new Set<string>())

const applyPillage = (vertexId: string, playerId: number, isDeciding: boolean) => {
  // City-ownership guard — rejects a vertex that was never a pillageable
  // city for this player.
  const building = gameState.board.settlements[vertexId]
  if (!building || building.type !== 'city' || building.ownerId !== playerId) return
  // Same-tick dedupe guard — see the ref's own comment above. Also gates
  // the banner: dispatchGameAction fires it unconditionally on every call,
  // so this is what stops a duplicate/racing invocation from firing it twice.
  if (resolvedPillageVertexIdsRef.current.has(vertexId)) return
  resolvedPillageVertexIdsRef.current.add(vertexId)
  dispatchGameAction({ type: 'PILLAGE_CITY', vertexId, playerId }, isDeciding)
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? {
            ...p,
            cityWalls: p.cityWalls.filter((v) => v !== vertexId),
            citiesRemaining: p.citiesRemaining + 1,
            settlementsRemaining: Math.max(0, p.settlementsRemaining - 1),
          }
        : p,
    ),
  )
  // The banner now fires via dispatchGameAction -> describeBoardAction —
  // do NOT call inform() here too, or the message doubles.
  setPillageQueue((prev) => prev.filter((t) => t.playerId !== playerId))
}
```

The ref's `Set` is cleared in `resetGame`/`restoreFromSnapshot` alongside their `setPillageQueue([])` reset, so a resolved vertex from a previous game doesn't stay "already resolved" forever.

**Why a ref, not a state check:** a value read off `gameState`/`useState` reflects the *last committed render*, not what's already been dispatched-but-not-yet-applied. Two calls in the same tick both see the same pre-dispatch snapshot, so a state-only guard lets both through — the mutation function's own side effects (here, `setPlayers` and the banner) then run twice even though the reducer itself correctly no-ops the duplicate action. A `useRef`-backed set updates synchronously and is shared across same-tick re-invocations, so it catches what a state read cannot.

Local actor's call site (`handlePillageTargetSelect`):

```tsx
const handlePillageTargetSelect = (vertexId: string) => {
  const current = activePillageTarget
  if (!current) return
  if (!current.eligibleCityVertexIds.includes(vertexId)) {
    warn('Not a valid pillage target.')
    return
  }
  applyPillage(vertexId, current.playerId, true)
}
```

Note there's no separate `broadcastPillageResolved` call here — passing `isDeciding: true` into `applyPillage` is what triggers the broadcast, generically, inside `dispatchGameAction`.

Receive handler (`onPillageResolved`):

```tsx
onPillageResolved: (payload) => {
  const building = gameState.board.settlements[payload.vertexId]
  if (
    !building ||
    building.type !== 'city' ||
    building.ownerId !== payload.playerId ||
    !pillageQueue.some((t) => t.playerId === payload.playerId)
  ) {
    console.error('[Catan] Ignoring malformed pillage-resolved payload:', payload)
    return
  }
  applyPillage(payload.vertexId, payload.playerId, false)
},
```

Same three-part shape shows up throughout `App.tsx`: `applyRobberMove`/`onRobberMoved`, `applyBarbarianWinnerDraw`/`onBarbarianWinnerDrawResolved`, `resolveTaxation`/`onTaxationResolved`.

### Don't do this

Illustrative counter-example (not real shipped code, but the mistake the pattern above prevents):

```tsx
// WRONG — receiver re-derives instead of trusting the broadcast
onPillageResolved: (payload) => {
  // Re-picks a "valid" target locally instead of applying payload.vertexId
  // directly. If this client's local settlements/pillageQueue state is even
  // one broadcast behind the acting client's, this silently picks a
  // DIFFERENT vertex than what the acting client actually pillaged —
  // permanent, undetectable desync between clients.
  const target = pillageQueue.find((t) => t.playerId === payload.playerId)
  if (target) applyPillage(target.eligibleCityVertexIds[0], payload.playerId, false)
},
```

The receiver's job is to *validate*, not *re-decide*. If validation fails, reject and log — never substitute your own guess for the payload's value.

---

## 2. Online-Parallel / Local-Sequential Gating Pattern

For any multi-player queue where several players might each owe a choice (discard over the limit, pick a pillage target, draw a tied-winner's card): **local Pass & Play is sequential** — one shared screen, so only the front of the queue is ever "up." **Online is parallel** — every affected player resolves on their own screen, independently, in whatever order they each act, not queue order.

A derived value each client computes from its own `onlineInfo.localPlayerId` captures both cases in one expression — online, "is *my* id anywhere in the pending set"; local, "front of the queue." **Every consumer that gates an action — a click handler, a component's render condition, an auto-resolve effect — must go through this derived value, never a raw `queue[0]` read.** A raw front-of-queue read used for gating has two failure modes: it forces strictly sequential resolution even online (only one player can ever act until the front of the queue changes), and — worse — it lets *any* connected client act on the front player's pending choice, since nothing in a bare index read checks whose choice it actually is.

### Do this

Origin of the pattern (`App.tsx`, `activeDiscarderId` — the resource-discard queue):

```tsx
// Who's actively discarding on THIS screen right now. Local Pass & Play
// is sequential — everyone shares one device, so only the first player
// still in the queue is ever "up." Online is parallel — every affected
// player discards on their own screen at the same time, so this is just
// "am I one of the people who still owes a discard."
const activeDiscarderId = onlineInfo
  ? validDiscardPlayerIds.includes(onlineInfo.localPlayerId)
    ? onlineInfo.localPlayerId
    : null
  : (validDiscardPlayerIds[0] ?? null)
```

Applied to the barbarian-attack pillage/winner-draw queues (`App.tsx`):

```tsx
const activePillageTarget = onlineInfo
  ? (pillageQueue.find((t) => t.playerId === onlineInfo.localPlayerId) ?? null)
  : (pillageQueue[0] ?? null)
const activeWinnerDrawPlayerId = onlineInfo
  ? (winnerDrawQueue.includes(onlineInfo.localPlayerId) ? onlineInfo.localPlayerId : null)
  : (winnerDrawQueue[0] ?? null)
```

Every downstream consumer — `PillageLayer`'s render gate, the auto-skip effect, `handlePillageTargetSelect`'s validation, `BarbarianAttackModal`'s `winnerDrawActive` prop — reads `activePillageTarget`/`activeWinnerDrawPlayerId`, never `pillageQueue[0]`/`winnerDrawQueue[0]` directly. (A raw index read is still fine for *display-only* text, e.g. a "waiting on Player X" banner — the rule is specifically about gating an action.)

### Don't do this

This exact mistake was caught during planning for the barbarian-attack pillage queue, before any code shipped — worth keeping as the canonical example of what the pattern rules out:

```tsx
// WRONG — caught in review before this ever shipped
const handlePillageTargetSelect = (vertexId: string) => {
  const current = pillageQueue[0]   // <- gates on raw queue position
  if (!current) return
  ...
}

// and rendering the picker for every connected client, not just the
// affected one:
{pillageQueue.length > 0 && (
  <PillageLayer eligibleVertexIds={pillageQueue[0].eligibleCityVertexIds} ... />
)}
```

Online, this renders city-pillage targets — and lets a click resolve them — on every connected client's screen, for whichever player happens to be at the front of the shared array, regardless of whose turn it actually is to choose.

---

## 3. Module-Scope Helper Convention (keeping impure calls out of component scope)

`react-hooks/purity` flags `Math.random()` (and similar impure calls) anywhere reachable from a component's lexical scope — including deep inside handler closures the linter can't prove are only ever invoked from a click handler or effect, never during render. Two real bugs this convention exists to prevent:

- **A false-positive lint error** that's actually harmless (the call really is only ever invoked from an event handler) but can't be statically proven, so it just sits as accepted debt forever.
- **A genuine StrictMode bug**: `Math.random()` called *inside* a `setState` updater callback gets double-invoked by React 19 StrictMode's dev-mode double-render, producing two different random picks where only one should exist — and if the first pick is what gets broadcast to other clients while the second is what actually lands in local state, that's a real actor/peer desync, not just a lint nag.

The fix for both: move the random call to a **plain function defined outside the component**, and — separately — never call `Math.random()` (or build a randomness-dependent result) *inside* a `setState` updater. Compute the random value first, from the component's current state (safe, since it only runs from an event handler where that state is current), then pass the already-decided value into a pure updater.

### Do this

Module-scope helpers (`App.tsx`, defined before `function App()`):

```tsx
function randomInt(max: number): number {
  return Math.floor(Math.random() * max)
}
function pickRandom<T>(items: readonly T[]): T {
  return items[randomInt(items.length)]
}
function randomSeedString(): string {
  return Math.random().toString(36).slice(2)
}
```

Pre-existing precedent this mirrors (`components/Dice3D.tsx`):

```tsx
function randomSpinSpeed(): THREE.Vector3 {
  const sign = () => (Math.random() < 0.5 ? -1 : 1)
  return new THREE.Vector3(
    (8 + Math.random() * 6) * sign(),
    (8 + Math.random() * 6) * sign(),
    (8 + Math.random() * 6) * sign(),
  )
}
```

Computing the random pick *before* the updater, not inside it (`App.tsx`, `resolveTaxation`):

```tsx
// Computed OUTSIDE setPlayers — an updater a dev-mode double-invocation
// runs twice must stay free of side effects (Math.random, array mutation).
const steals: { victimId: number; item: StolenItem | null }[] = []
for (const victimId of victimIds) {
  const victim = players.find((p) => p.id === victimId)
  if (!victim) continue
  const heldItems = heldItemsFor(victim)
  if (heldItems.length === 0) {
    steals.push({ victimId, item: null })
    continue
  }
  steals.push({ victimId, item: pickRandom(heldItems) })
}
setPlayers((prev) => /* pure map over the already-decided `steals` */ ...)
```

### Don't do this

Real code that shipped this exact bug and was later fixed (`resolveTaxation`, before the fix):

```tsx
// WRONG — this was actually committed, then fixed
const steals: { victimId: number; resource: ResourceType | null }[] = []
setPlayers((prev) => {
  let next = prev
  for (const victimId of victimIds) {
    const victim = next.find((p) => p.id === victimId)
    if (!victim) continue
    const heldResources: ResourceType[] = []
    for (const resource of RESOURCE_ORDER) {
      for (let i = 0; i < victim.resources[resource]; i++) heldResources.push(resource)
    }
    if (heldResources.length === 0) {
      steals.push({ victimId, resource: null })
      continue
    }
    // Math.random() INSIDE the updater — StrictMode's double-invoke can run
    // this twice, pushing duplicate `steals` entries and letting the
    // SECOND roll land in local state while the FIRST is what got broadcast.
    const stolenResource = heldResources[Math.floor(Math.random() * heldResources.length)]
    steals.push({ victimId, resource: stolenResource })
    next = next.map((p) => (p.id === victimId ? { ...p, resources: { ...p.resources, [stolenResource]: p.resources[stolenResource] - 1 } } : p))
  }
  return next
})
```
