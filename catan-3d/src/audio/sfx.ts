import placementUrl from '../assets/sounds/placement.mp3'
import roadPlacementUrl from '../assets/sounds/road_placement.mp3'
import diceRollUrl from '../assets/sounds/dice_roll.mp3'
import robberUrl from '../assets/sounds/robber.mp3'
import turnEndUrl from '../assets/sounds/turn_end.mp3'
import turnStartUrl from '../assets/sounds/turn_start.mp3'
import tradeRequestUrl from '../assets/sounds/trade_request.mp3'

export type SfxKey = 'placement' | 'roadPlacement' | 'diceRoll' | 'robber' | 'turnEnd' | 'turnStart' | 'tradeRequest'

const SFX_URLS: Record<SfxKey, string> = {
  placement: placementUrl,
  roadPlacement: roadPlacementUrl,
  diceRoll: diceRollUrl,
  robber: robberUrl,
  turnEnd: turnEndUrl,
  turnStart: turnStartUrl,
  tradeRequest: tradeRequestUrl,
}

// One decoded Audio element per sound, loaded once and reused as a
// clone per play — cloning (rather than replaying the same element) is
// what lets two triggers in quick succession (e.g. two setup roads placed
// back to back) overlap instead of the second cutting the first off.
const cache = new Map<SfxKey, HTMLAudioElement>()

export function playSfx(key: SfxKey, volume = 0.55): void {
  let base = cache.get(key)
  if (!base) {
    base = new Audio(SFX_URLS[key])
    cache.set(key, base)
  }
  const instance = base.cloneNode(true) as HTMLAudioElement
  instance.volume = volume
  // Browsers reject play() before any user gesture has reached the page —
  // by the time any of these fire (a roll, a build), one always has, but
  // failing silently rather than throwing keeps a rare rejection from ever
  // being mistaken for a real game-logic error.
  void instance.play().catch(() => {})
}
