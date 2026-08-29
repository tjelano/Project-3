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

const CONVERGENCE_TIMEOUT_MS = 30_000
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
// GameState field is included as-is for a full deep-equal.
async function getComparableState(page: Page) {
  return page.evaluate(() => {
    const state = window.__catanTestHarness!.getState()
    return {
      ...state,
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

    // The acting page's own harness snapshot can briefly lag its own
    // dispatch: React 18 batches an update triggered from outside its
    // event system (like this externally-injected page.evaluate() call)
    // onto a microtask rather than flushing it synchronously, so an
    // immediate read straight after dispatch can still observe pre-action
    // state — confirmed via a live two-browser run, where this lasted up
    // to several hundred ms. Wait for the acting page's own state to
    // actually move before treating it as ground truth, or a stale
    // immediate read makes convergence impossible to ever satisfy once
    // the other page correctly catches up past it.
    let expected = before
    await expect
      .poll(
        async () => {
          expected = await getComparableState(actingPage)
          return JSON.stringify(expected) === JSON.stringify(before)
        },
        {
          message: `Step ${index} (actor ${step.actor}, action ${step.action})'s own state never updated after dispatch`,
          timeout: CONVERGENCE_TIMEOUT_MS,
          intervals: [POLL_INTERVAL_MS],
        },
      )
      .toBe(false)

    await expect
      .poll(() => getComparableState(otherPage), {
        message: `Step ${index} (actor ${step.actor}, action ${step.action}) did not converge`,
        timeout: CONVERGENCE_TIMEOUT_MS,
        intervals: [POLL_INTERVAL_MS],
      })
      .toEqual(expected)
  }
}
