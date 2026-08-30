import { expect, type Page } from '@playwright/test'
import type { CatanTestHarness } from '../../src/testHarness'

export type Actor = 'A' | 'B'

// Steps carry the action NAME plus plain, JSON-serializable args — not a
// closure over CatanTestHarness. page.evaluate() can only cross the
// Node/browser boundary with explicit serializable data in its second
// argument; Function.prototype.toString() (the alternative — stringify
// a closure, reconstruct it in-browser) captures only SOURCE TEXT, never
// values closed over from Node's own scope. A step like
// `(h) => h.actions.buildSettlement(v1)`, where v1 is a vertex id read
// earlier in the test, would reconstruct in-browser with v1 undefined —
// this isn't an implementation choice, it's a hard constraint of the
// boundary itself.
export interface ScenarioStep {
  actor: Actor
  action: keyof CatanTestHarness['actions']
  args?: unknown[]
}

// A live run on real hardware (not a rendering-constrained sandbox) still
// measured a genuine cross-page convergence taking longer than 30s once —
// the receiving page's state was entirely unchanged (not partial/corrupt),
// consistent with real Supabase Realtime latency rather than a logic bug.
// 60s gives real headroom without masking an actual regression, which
// would still show up as a real diff, just discovered later.
const CONVERGENCE_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 200

async function runAction(page: Page, action: ScenarioStep['action'], args: unknown[] = []): Promise<void> {
  await page.evaluate(
    ({ action, args }) => {
      const fn = window.__catanTestHarness!.actions[action] as (...a: unknown[]) => void
      fn(...args)
    },
    { action, args },
  )
}

async function getLastWarning(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__catanTestHarness!.getLastWarning())
}

// decks.devDeck / decks.progressCardDecks[track] are compared by LENGTH
// only, never contents — their exact remaining order is never shown to
// any player and is allowed to differ between clients by design (see the
// harness design spec's "Convergence & assertions" section). Every other
// GameState field is included as-is for a full deep-equal — which requires
// normalizing Set/Map first (see normalizeForComparison below), or this
// claim is false: GameState carries real Sets (e.g.
// progress.knightsPromotedThisTurn, pendingQueues.revealedTileIds) that
// Playwright's page.evaluate() serializer has no branch for — it falls
// through to Object.keys(), which is `{}` for either, so two DIFFERENT
// Sets would silently compare as vacuously equal forever without this.
async function getComparableState(page: Page) {
  return page.evaluate(() => {
    function normalizeForComparison(value: unknown): unknown {
      if (value instanceof Set) return Array.from(value).sort()
      if (value instanceof Map) {
        return Array.from(value.entries())
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, normalizeForComparison(v)])
      }
      if (Array.isArray(value)) return value.map(normalizeForComparison)
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeForComparison(v)]))
      }
      return value
    }

    const state = window.__catanTestHarness!.getState()
    return {
      ...(normalizeForComparison(state) as typeof state),
      decks: {
        devDeckLength: state.decks.devDeck.length,
        progressCardDeckLengths: {
          science: state.decks.progressCardDecks.science.length,
          trade: state.decks.progressCardDecks.trade.length,
          politics: state.decks.progressCardDecks.politics.length,
        },
      },
    }
  })
}

export async function runScenario(pageA: Page, pageB: Page, steps: ScenarioStep[]): Promise<void> {
  for (const [index, step] of steps.entries()) {
    const actingPage = step.actor === 'A' ? pageA : pageB
    const otherPage = step.actor === 'A' ? pageB : pageA

    const before = await getComparableState(actingPage)
    await runAction(actingPage, step.action, step.args)

    const warning = await getLastWarning(actingPage)
    if (warning) {
      throw new Error(`Step ${index} (actor ${step.actor}, action ${step.action}) was rejected: "${warning}"`)
    }

    // Poll both pages against EACH OTHER — not the acting page's state
    // frozen as a fixed "expected" the moment it first differs from
    // `before`. A frozen snapshot is unsound whenever the acting page's
    // own post-action state isn't terminal: e.g. Longest Road / Largest
    // Army are recomputed host-side only (App.tsx's effective-host
    // effect) and then broadcast — if the acting page is the JOINER, its
    // own state moves once locally (piece placed, no trophy yet) and a
    // frozen snapshot at that point is never reached again once the
    // host's trophy rebroadcast lands on both sides; the step would time
    // out even though both pages are converging correctly. Comparing the
    // two LIVE pages to each other on every poll has no such assumption
    // — either they end up equal (and changed from `before`, so a step
    // that's a genuine no-op doesn't vacuously "converge" on itself), or
    // they don't and the timeout's diff shows exactly what still differs.
    // A single matching poll can be transient — either a later broadcast
    // landing right after (e.g. Longest Road/Largest Army, recomputed
    // host-side only and broadcast SEPARATELY from the piece placement
    // itself; CodeRabbit review, PR #71), or BOTH pages' test-hook
    // snapshots lagging the true reducer state by roughly the same amount
    // at once — mutually consistent with each other, matched, yet still
    // behind what the very next scripted action actually needs to see
    // (e.g. setupStage having genuinely advanced to 'road'). The second
    // case is a stable-but-wrong plateau, not a flicker — a short 2-poll
    // confirmation (~400ms) can land entirely inside it. Require the
    // match to hold for STABILIZATION_POLLS consecutive polls (~1s of
    // real time at POLL_INTERVAL_MS) instead, giving the test hook's own
    // effect-driven refresh real wall-clock room to catch up fully before
    // this step is trusted as done.
    const STABILIZATION_POLLS = 5
    let actingState = before
    let otherState = await getComparableState(otherPage)
    let converged = false
    let consecutiveMatches = 0
    const deadline = Date.now() + CONVERGENCE_TIMEOUT_MS
    while (Date.now() < deadline) {
      ;[actingState, otherState] = await Promise.all([getComparableState(actingPage), getComparableState(otherPage)])
      const changed = JSON.stringify(actingState) !== JSON.stringify(before)
      const matched = JSON.stringify(actingState) === JSON.stringify(otherState)
      if (changed && matched) {
        consecutiveMatches += 1
        if (consecutiveMatches >= STABILIZATION_POLLS) {
          converged = true
          break
        }
      } else {
        consecutiveMatches = 0
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    // If the acting page's own state never moved at all, both sides are
    // still sitting at `before` and therefore still equal to each other —
    // the loop above never breaks early, but the final toEqual() below
    // would otherwise pass vacuously (converged-on-nothing) instead of
    // reporting that the action produced no observable effect at all.
    if (!converged && JSON.stringify(actingState) === JSON.stringify(before)) {
      throw new Error(
        `Step ${index} (actor ${step.actor}, action ${step.action}) produced no observable state ` +
          `change on the acting page within ${CONVERGENCE_TIMEOUT_MS}ms`,
      )
    }

    expect(otherState, `Step ${index} (actor ${step.actor}, action ${step.action}) did not converge`).toEqual(
      actingState,
    )
  }
}
