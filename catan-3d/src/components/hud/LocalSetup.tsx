import { useState } from 'react'
import type { GameStartInfo } from './StartScreen'

// Namespaced so it can't collide with any other app sharing this origin.
const LOCAL_PLAYER_NAME_KEY = 'catan3d.localPlayerName'

function readSavedLocalPlayerName(): string {
  try {
    return localStorage.getItem(LOCAL_PLAYER_NAME_KEY) ?? ''
  } catch {
    // Storage can throw in private-browsing modes or when disabled —
    // the form still works, it just won't remember the name next time.
    return ''
  }
}

export function LocalSetup({ onStart }: { onStart: (info: GameStartInfo) => void }) {
  const [playerCount, setPlayerCount] = useState(3)
  // Sized to 4 regardless of the current count, so switching the dropdown
  // never discards a name already typed into a slot. Slot 0 is "this
  // device's" player — the only one worth remembering across visits.
  const [names, setNames] = useState<string[]>(() => {
    const saved = readSavedLocalPlayerName()
    return [saved, '', '', '']
  })

  const setName = (index: number, value: string) => {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)))
  }

  const handleStart = () => {
    const activeNames = names.slice(0, playerCount)
    try {
      if (activeNames[0]?.trim()) {
        localStorage.setItem(LOCAL_PLAYER_NAME_KEY, activeNames[0].trim())
      }
    } catch {
      // Same non-fatal storage failure as above — proceed regardless.
    }
    onStart({ playerCount, names: activeNames })
  }

  return (
    <div>
      <label className="mt-8 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase" htmlFor="player-count">
        Player Count
      </label>
      <select
        id="player-count"
        value={playerCount}
        onChange={(event) => setPlayerCount(Number(event.target.value))}
        className="mt-2 w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-center font-body text-sm text-white focus:border-gold/60 focus:outline-none"
      >
        <option value={2} className="bg-board-navy">
          2 Players
        </option>
        <option value={3} className="bg-board-navy">
          3 Players
        </option>
        <option value={4} className="bg-board-navy">
          4 Players
        </option>
      </select>

      <label className="mt-6 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
        Player Names
      </label>
      <div className="mt-2 flex flex-col gap-2">
        {Array.from({ length: playerCount }, (_, i) => (
          <input
            key={i}
            type="text"
            value={names[i]}
            onChange={(event) => setName(i, event.target.value)}
            placeholder={`Player ${i + 1}`}
            maxLength={20}
            className="w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-center font-body text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="mt-6 w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
      >
        Start Game
      </button>
    </div>
  )
}
