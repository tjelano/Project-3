# Queue-Mechanics Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the shared "waiting-room" mechanics — who's active on this screen right now, and removing exactly one resolved entry — out of 6 independently hand-rolled pending-player-queue mechanics in `App.tsx`, into one small, tested, reusable pair of pure functions. Each mechanic keeps its own reducer action, resolve function, and broadcast payload; only the bookkeeping around the queue itself becomes shared.

**Architecture:** A new pure module, `game/pendingQueue.ts`, exports two generic functions: `activeQueueEntry<T>` (who's active on this screen: online — is the local player anywhere in the queue; local pass-and-play — front of the queue) and `dequeueOne<T>` (remove exactly the first entry matching a player id, never every match). Both are generic over the queue's element type via a `getPlayerId` accessor, since 5 of the 6 queues hold bare `number[]` and one (`pillageQueue`) holds a richer object array. Every call site keeps its exact current behavior — this is a pure refactor, not a behavior change, with one explicitly-flagged exception (see Global Constraints).

**Tech Stack:** TypeScript, React (`useState`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` (Actions → "Queue-mechanics helper" section — this plan implements Sub-plan 2 of that spec's 7-sub-plan Sequencing).

## Global Constraints

- **Zero behavior change, with one explicit, documented exception.** All 6 call sites' observable behavior stays identical, EXCEPT: `activeProgressDiscarderId` (`progressCardOverLimitPlayerIds`'s active-derivation) currently has no online/local split at all — it always reads `progressCardOverLimitPlayerIds[0]`, unlike its 5 siblings' `onlineInfo ? ... : ...` ternary. This looks like a real, pre-existing gap (parallel online resolution for the C&K 4-card hand-limit discard, present everywhere else, missing here) — but fixing it is a behavior change outside a pure-refactor sub-plan's scope. This plan preserves the exact current behavior (hardcode `localPlayerId: null` at that one call site) and tracks the gap explicitly (see Out of Scope) rather than silently fixing or silently dropping it.
- **5 of 6 queues hold `number[]`, using `(id: number) => id` as their `getPlayerId` accessor; `pillageQueue` holds `BarbarianPillageTarget[]`, using `(t) => t.playerId`.** Both helper functions must be generic enough to serve both shapes with zero special-casing — confirmed already true of the spec's own design.
- **`dequeueOne` must remove exactly ONE matching entry, never every match — this is what already makes `goldFieldResourcePlayerIds`' hand-rolled logic correct (a city's 2 independent picks) and must stay true once generalized.** The other 5 queues currently use `Array.prototype.filter`, which happens to be safe today only because none of them can have more than one entry per player — migrating them onto `dequeueOne` is itself a small correctness improvement (removing an implicit, unenforced assumption), not just deduplication, and must not regress to `filter`'s "remove every match" semantics.
- **`npm run build` is required before any task is reported done** (this project's own standing requirement). **Use `npx tsc -p tsconfig.app.json` for the real per-task typecheck — never bare `npx tsc --noEmit`, which checks 0 files on this project's solution-style tsconfig** (found and documented during Sub-plan 1).
- Preserve every existing explanatory comment at each call site (e.g. "Filtered by playerId, not sliced off the front — online, tied winners resolve independently...") — these document real, non-obvious rationale about *why* player-id-based removal is correct here, not queue-order removal. Only the underlying array-transformation *mechanism* changes to call the shared helper; the rationale comments stay.

---

### Task 1: Create the `game/pendingQueue.ts` helper module

**Files:**
- Create: `catan-3d/src/game/pendingQueue.ts`
- Test: `catan-3d/src/game/pendingQueue.test.ts`

**Interfaces:**
- Produces: `activeQueueEntry<T>(queue: T[], getPlayerId: (entry: T) => number, localPlayerId: number | null): T | null` and `dequeueOne<T>(queue: T[], getPlayerId: (entry: T) => number, playerId: number): T[]` — both consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/pendingQueue.test.ts
import { describe, expect, it } from 'vitest'
import { activeQueueEntry, dequeueOne } from './pendingQueue'

const byId = (id: number) => id

describe('activeQueueEntry', () => {
  it('online: returns the entry matching localPlayerId when present', () => {
    expect(activeQueueEntry([3, 5, 7], byId, 5)).toBe(5)
  })

  it('online: returns null when localPlayerId is not in the queue', () => {
    expect(activeQueueEntry([3, 5, 7], byId, 9)).toBeNull()
  })

  it('local pass-and-play (localPlayerId null): returns the front of the queue', () => {
    expect(activeQueueEntry([3, 5, 7], byId, null)).toBe(3)
  })

  it('local pass-and-play: returns null for an empty queue', () => {
    expect(activeQueueEntry([], byId, null)).toBeNull()
  })

  it('online: returns null for an empty queue even with a real localPlayerId', () => {
    expect(activeQueueEntry([], byId, 5)).toBeNull()
  })

  it('works with a richer element type via a custom accessor', () => {
    const queue = [{ playerId: 1, vertexId: 'V1' }, { playerId: 2, vertexId: 'V2' }]
    expect(activeQueueEntry(queue, (t) => t.playerId, 2)).toEqual({ playerId: 2, vertexId: 'V2' })
  })
})

describe('dequeueOne', () => {
  it('removes exactly the first matching entry', () => {
    expect(dequeueOne([1, 2, 3], byId, 2)).toEqual([1, 3])
  })

  it('removes only ONE occurrence, leaving a duplicate entry for the same id intact', () => {
    expect(dequeueOne([1, 1, 2], byId, 1)).toEqual([1, 2])
  })

  it('returns the exact same array reference when nothing matches (no-op)', () => {
    const queue = [1, 2, 3]
    expect(dequeueOne(queue, byId, 9)).toBe(queue)
  })

  it('handles an empty queue', () => {
    expect(dequeueOne([], byId, 1)).toEqual([])
  })

  it('works with a richer element type via a custom accessor', () => {
    const queue = [{ playerId: 1, vertexId: 'V1' }, { playerId: 2, vertexId: 'V2' }]
    expect(dequeueOne(queue, (t) => t.playerId, 1)).toEqual([{ playerId: 2, vertexId: 'V2' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/pendingQueue.test.ts`
Expected: FAIL — `Cannot find module './pendingQueue'`

- [ ] **Step 3: Implement**

```ts
// catan-3d/src/game/pendingQueue.ts

// Shared "waiting room" mechanics for App.tsx's pending-player-queue
// mechanics (discard, Science level 3's free-resource pick, Gold Field
// picks, barbarian pillage/winner-draw, progress-card hand-limit discard).
// Each mechanic keeps its own reducer action and resolve function — this
// module only generalizes two things every one of them independently
// hand-rolled: who's active on THIS screen right now, and removing exactly
// one resolved entry from the queue. Generic over the queue's element type
// via getPlayerId, since most queues hold bare player ids but one
// (pillageQueue) holds a richer { playerId, ... } object.

// Who's actively resolving this queue on THIS screen right now. Online
// multiplayer is PARALLEL — every affected player resolves independently,
// on their own screen, in whatever order they're each ready, so this
// checks "is the local player anywhere in the queue," not "are they at the
// front." Local Pass & Play is SEQUENTIAL — one shared device, so only the
// front of the queue is ever "up." localPlayerId is null for local
// Pass & Play (there is no single "local player" identity to filter to);
// callers pass `onlineInfo?.localPlayerId ?? null`.
export function activeQueueEntry<T>(queue: T[], getPlayerId: (entry: T) => number, localPlayerId: number | null): T | null {
  if (localPlayerId != null) return queue.find((entry) => getPlayerId(entry) === localPlayerId) ?? null
  return queue[0] ?? null
}

// Removes exactly the FIRST entry matching playerId — never every matching
// entry (Array.prototype.filter would incorrectly clear a second pending
// entry for the same player, e.g. a Gold Field city's 2 independent picks,
// along with the first). Returns the exact same array reference when
// nothing matches, so callers relying on reference identity (e.g. a
// useMemo/useEffect dependency array) don't see a spurious change.
export function dequeueOne<T>(queue: T[], getPlayerId: (entry: T) => number, playerId: number): T[] {
  const index = queue.findIndex((entry) => getPlayerId(entry) === playerId)
  return index === -1 ? queue : [...queue.slice(0, index), ...queue.slice(index + 1)]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/pendingQueue.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/pendingQueue.ts catan-3d/src/game/pendingQueue.test.ts
git commit -m "feat: add shared pending-queue waiting-room helper"
```

---

### Task 2: Migrate all 6 active-derivation sites onto `activeQueueEntry`

**Files:**
- Modify: `catan-3d/src/App.tsx` (import + 6 call sites, listed below with their current line numbers — these haven't moved since Sub-plan 1, which only touched `useRoomChannel.ts`, but locate each by its unique surrounding text if a number has drifted)

**Interfaces:**
- Consumes: `activeQueueEntry` (Task 1).

- [ ] **Step 1: Add the import**

Find `import { collectGoldFieldPicks } from './game/goldFieldProduction'` (currently `App.tsx:105`) and add directly after it:

```ts
import { activeQueueEntry } from './game/pendingQueue'
```

(Only `activeQueueEntry` — this project has `noUnusedLocals: true`, and Task 2 doesn't use `dequeueOne` yet. Task 3's own Step 1 widens this import to add `dequeueOne` once it has a real call site.)

- [ ] **Step 2: Migrate `activeDiscarderId` (currently `App.tsx:2321-2325`)**

Find:

```ts
  const activeDiscarderId = onlineInfo
    ? validDiscardPlayerIds.includes(onlineInfo.localPlayerId)
      ? onlineInfo.localPlayerId
      : null
    : (validDiscardPlayerIds[0] ?? null)
```

Replace with:

```ts
  const activeDiscarderId = activeQueueEntry(validDiscardPlayerIds, (id) => id, onlineInfo?.localPlayerId ?? null)
```

- [ ] **Step 3: Migrate `activeScienceFreeResourcePlayerId` (currently `App.tsx:2343-2347`)**

Find:

```ts
  const activeScienceFreeResourcePlayerId = onlineInfo
    ? scienceFreeResourcePlayerIds.includes(onlineInfo.localPlayerId)
      ? onlineInfo.localPlayerId
      : null
    : (scienceFreeResourcePlayerIds[0] ?? null)
```

Replace with:

```ts
  const activeScienceFreeResourcePlayerId = activeQueueEntry(scienceFreeResourcePlayerIds, (id) => id, onlineInfo?.localPlayerId ?? null)
```

- [ ] **Step 4: Migrate `activeGoldFieldResourcePlayerId` (currently `App.tsx:2356-2360`)**

Find:

```ts
  const activeGoldFieldResourcePlayerId = onlineInfo
    ? goldFieldResourcePlayerIds.includes(onlineInfo.localPlayerId)
      ? onlineInfo.localPlayerId
      : null
    : (goldFieldResourcePlayerIds[0] ?? null)
```

Replace with:

```ts
  const activeGoldFieldResourcePlayerId = activeQueueEntry(goldFieldResourcePlayerIds, (id) => id, onlineInfo?.localPlayerId ?? null)
```

- [ ] **Step 5: Migrate `activePillageTarget` and `activeWinnerDrawPlayerId` (currently `App.tsx:2373-2378`)**

Find:

```ts
  const activePillageTarget = onlineInfo
    ? (pillageQueue.find((t) => t.playerId === onlineInfo.localPlayerId) ?? null)
    : (pillageQueue[0] ?? null)
  const activeWinnerDrawPlayerId = onlineInfo
    ? (winnerDrawQueue.includes(onlineInfo.localPlayerId) ? onlineInfo.localPlayerId : null)
    : (winnerDrawQueue[0] ?? null)
```

Replace with:

```ts
  const activePillageTarget = activeQueueEntry(pillageQueue, (t) => t.playerId, onlineInfo?.localPlayerId ?? null)
  const activeWinnerDrawPlayerId = activeQueueEntry(winnerDrawQueue, (id) => id, onlineInfo?.localPlayerId ?? null)
```

- [ ] **Step 6: Migrate `activeProgressDiscarderId` (currently `App.tsx:3814`) — preserve its no-online-split behavior exactly**

Find:

```ts
  const activeProgressDiscarderId = progressCardOverLimitPlayerIds[0] ?? null
```

Replace with:

```ts
  // Unlike its 5 sibling queues, this one has never had an online/local
  // split — it always reads the front of the queue regardless of
  // onlineInfo. That looks like a real, pre-existing gap (parallel online
  // resolution for the C&K 4-card hand-limit discard exists everywhere
  // else, missing here), but fixing it is a behavior change outside this
  // sub-plan's pure-refactor scope — see project_apptsx_reducer_refactor
  // memory / the spec's Out of Scope section. localPlayerId is hardcoded
  // null here specifically to preserve that exact pre-existing behavior,
  // not because this queue is somehow local-only.
  const activeProgressDiscarderId = activeQueueEntry(progressCardOverLimitPlayerIds, (id) => id, null)
```

- [ ] **Step 7: Verify**

Run: `cd catan-3d && npx tsc -p tsconfig.app.json && npx eslint src && npx vitest run && npm run build`
Expected: no errors, full suite passing (417/417 or whatever the current count is — this task changes zero game logic, only which function computes an already-identical result), build succeeds.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "refactor: migrate 6 active-queue-entry derivations onto activeQueueEntry"
```

---

### Task 3: Migrate all 7 dequeue-in-resolve sites onto `dequeueOne`

**Files:**
- Modify: `catan-3d/src/App.tsx` (7 call sites across 6 resolve functions — `winnerDrawQueue` has two: its main resolve function and a separate AFK-timeout self-heal effect)

**Interfaces:**
- Consumes: `dequeueOne` (Task 1).

- [ ] **Step 1: Widen the import**

Find `import { activeQueueEntry } from './game/pendingQueue'` (added by Task 2's Step 1) and replace it with:

```ts
import { activeQueueEntry, dequeueOne } from './game/pendingQueue'
```

- [ ] **Step 2: Migrate `applyDiscard` (currently `App.tsx:1347-1351`) — preserves the eager-computed `remaining` value used just below for the phase-transition check**

Find:

```ts
  const applyDiscard = (playerId: number, counts: Partial<Record<ResourceType | CommodityType, number>>) => {
    dispatch({ type: 'DISCARD_CONFIRMED', playerId, counts })
    const remaining = discardPlayerIds.filter((id) => id !== playerId)
    setDiscardPlayerIds(remaining)
    debugLog('applyDiscard', { playerId, counts, discardPlayerIdsBefore: discardPlayerIds, remaining })
```

Replace with:

```ts
  const applyDiscard = (playerId: number, counts: Partial<Record<ResourceType | CommodityType, number>>) => {
    dispatch({ type: 'DISCARD_CONFIRMED', playerId, counts })
    const remaining = dequeueOne(discardPlayerIds, (id) => id, playerId)
    setDiscardPlayerIds(remaining)
    debugLog('applyDiscard', { playerId, counts, discardPlayerIdsBefore: discardPlayerIds, remaining })
```

(The rest of `applyDiscard`'s body, the `if (remaining.length === 0) { ... }` phase-transition block, is unchanged — do not touch it. `discardPlayerIds` can have at most one entry per player, same as every other migrated queue except Gold Field's, so `dequeueOne`'s "remove the first match" is behaviorally identical to the original `.filter()` here.)

- [ ] **Step 3: Migrate `applyProgressDiscard` (currently `App.tsx:1375-1378`)**

Find:

```ts
  const applyProgressDiscard = (playerId: number, indices: number[]) => {
    dispatch({ type: 'PROGRESS_DISCARD_CONFIRMED', playerId, indices })
    setProgressCardOverLimitPlayerIds((prev) => prev.filter((id) => id !== playerId))
  }
```

Replace with:

```ts
  const applyProgressDiscard = (playerId: number, indices: number[]) => {
    dispatch({ type: 'PROGRESS_DISCARD_CONFIRMED', playerId, indices })
    setProgressCardOverLimitPlayerIds((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

- [ ] **Step 4: Migrate `applyScienceFreeResourcePick` (currently `App.tsx:1384-1387`)**

Find:

```ts
  const applyScienceFreeResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'SCIENCE_FREE_RESOURCE_PICKED', playerId, resource })
    setScienceFreeResourcePlayerIds((prev) => prev.filter((id) => id !== playerId))
  }
```

Replace with:

```ts
  const applyScienceFreeResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'SCIENCE_FREE_RESOURCE_PICKED', playerId, resource })
    setScienceFreeResourcePlayerIds((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

- [ ] **Step 5: Migrate `applyGoldFieldResourcePick` (currently `App.tsx:1397-1404`)**

Find:

```ts
  const applyGoldFieldResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PICKED', playerId, resource })
    setGoldFieldResourcePlayerIds((prev) => {
      const index = prev.indexOf(playerId)
      if (index === -1) return prev
      return [...prev.slice(0, index), ...prev.slice(index + 1)]
    })
  }
```

Replace with:

```ts
  const applyGoldFieldResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PICKED', playerId, resource })
    setGoldFieldResourcePlayerIds((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

(This is the one site that was ALREADY correct — it already special-cased "remove only one entry" for exactly the reason `dequeueOne` now generalizes. This is the shipped, verbatim body of `dequeueOne` itself, so this migration is a pure like-for-like swap with zero behavior change, not a fix.)

- [ ] **Step 6: Migrate `applyPillage` (currently `App.tsx:1441`, one line inside a larger function — only this one line changes)**

Find this exact line (inside `applyPillage`, do not touch anything else in that function):

```ts
    setPillageQueue((prev) => prev.filter((t) => t.playerId !== playerId))
```

Replace with:

```ts
    setPillageQueue((prev) => dequeueOne(prev, (t) => t.playerId, playerId))
```

- [ ] **Step 7: Migrate `applyBarbarianWinnerDraw` (currently `App.tsx:1457-1463`)**

Find:

```ts
  const applyBarbarianWinnerDraw = (playerId: number, card: ProgressCardType) => {
    dispatch({ type: 'PROGRESS_CARDS_DRAWN', draws: [{ playerId, card }] })
    // Filtered by playerId, not sliced off the front — same reasoning as
    // applyPillage above: online, tied winners resolve independently in
    // whatever order they each act, not queue order.
    setWinnerDrawQueue((prev) => prev.filter((id) => id !== playerId))
  }
```

Replace with:

```ts
  const applyBarbarianWinnerDraw = (playerId: number, card: ProgressCardType) => {
    dispatch({ type: 'PROGRESS_CARDS_DRAWN', draws: [{ playerId, card }] })
    // Filtered by playerId, not sliced off the front — same reasoning as
    // applyPillage above: online, tied winners resolve independently in
    // whatever order they each act, not queue order.
    setWinnerDrawQueue((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

- [ ] **Step 8: Migrate the second `winnerDrawQueue` removal site — the AFK-timeout self-heal effect (currently `App.tsx:3959`, one line inside a larger `useEffect`)**

Find this exact line (inside the `useEffect` that auto-resolves a stuck winner-draw when every progress-card deck is empty — do not touch anything else in that effect):

```ts
          setWinnerDrawQueue((prev) => prev.filter((id) => id !== playerId))
```

Replace with:

```ts
          setWinnerDrawQueue((prev) => dequeueOne(prev, (id) => id, playerId))
```

- [ ] **Step 9: Verify**

Run: `cd catan-3d && npx tsc -p tsconfig.app.json && npx eslint src && npx vitest run && npm run build`
Expected: no errors, full suite passing, build succeeds. This task changes zero game logic — every migrated site's `dequeueOne` call produces the exact same result its original inline logic did, for every queue that can only ever hold one entry per player (all but Gold Field's, which was already using this exact logic verbatim).

- [ ] **Step 10: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "refactor: migrate 7 queue-dequeue call sites onto dequeueOne"
```

## Testing

Task 1's helper module gets real unit tests (11 cases covering both functions' online/local/empty/duplicate/custom-accessor behavior) — this is the one piece of genuinely new, testable logic this sub-plan introduces. Tasks 2-3 are pure call-site migrations with no new logic of their own (every replacement is a verified like-for-like behavioral match against the original inline code, confirmed during plan-writing by reading each site's actual current implementation) — their own verification is the full existing suite passing unchanged plus `npm run build`, following the same precedent Sub-plan 1 established for its own two migration tasks.

## Out of Scope

- **`activeProgressDiscarderId`'s missing online/local split** (Task 2, Step 6) — a real, pre-existing gap, explicitly preserved rather than fixed. Tracked here and in `project_apptsx_reducer_refactor` memory so it isn't lost; worth a small, separate, explicitly-scoped fix later (outside this refactor project, since it's a behavior change, not a refactor).
- No new game logic, no new reducer actions, no new broadcast payloads — every one of the 6 mechanics' own resolve/dispatch/broadcast logic is completely unchanged, only the queue bookkeeping around it.
- `discardPlayerIds`, `scienceFreeResourcePlayerIds`, `goldFieldResourcePlayerIds`, `pillageQueue`, `winnerDrawQueue`, `progressCardOverLimitPlayerIds` themselves stay as `useState` in this sub-plan — moving them into the reducer (`PendingState`) is Sub-plan 6's job, per the spec's own Sequencing (this sub-plan only extracts the shared bookkeeping *around* wherever the state currently lives, which works identically whether that state is `useState` today or reducer-tracked later).
