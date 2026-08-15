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
//
// Eagerly created and preloaded here, at module load, rather than lazily
// on first play — matching the useGLTF.preload(...) convention this
// codebase already uses for 3D models. Without this, the FIRST play of any
// given sound has to wait on the browser fetching and decoding the file
// before it can start, which is exactly the "plays late" delay this fixes
// (a settlement's own placement sound is usually the very first time
// 'placement' plays in a match). `preload = 'auto'` plus an explicit
// `.load()` call kicks off that fetch immediately — Safari in particular
// doesn't always start fetching from the Audio() constructor alone.
const cache = new Map<SfxKey, HTMLAudioElement>(
  (Object.entries(SFX_URLS) as [SfxKey, string][]).map(([key, url]) => {
    const audio = new Audio(url)
    audio.preload = 'auto'
    audio.load()
    return [key, audio]
  }),
)

export function playSfx(key: SfxKey, volume = 0.55): void {
  const base = cache.get(key)
  if (!base) return
  const instance = base.cloneNode(true) as HTMLAudioElement
  instance.volume = volume
  // Browsers reject play() before any user gesture has reached the page —
  // by the time any of these fire (a roll, a build), one always has, but
  // failing silently rather than throwing keeps a rare rejection from ever
  // being mistaken for a real game-logic error.
  void instance.play().catch(() => {})
}
