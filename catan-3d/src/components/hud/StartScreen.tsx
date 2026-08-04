import { useState } from 'react'

export function StartScreen({ onStart }: { onStart: (playerCount: number) => void }) {
  const [playerCount, setPlayerCount] = useState(3)

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-board-navy/80 backdrop-blur-md">
      <div className="w-80 rounded-2xl border border-glass-border bg-glass p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <h1 className="font-display text-3xl text-white">Settlers</h1>
        <p className="mt-1 font-body text-xs tracking-[0.25em] text-white/50 uppercase">A 3D Catan Prototype</p>

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

        <button
          type="button"
          onClick={() => onStart(playerCount)}
          className="mt-6 w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
        >
          Start Game
        </button>
      </div>
    </div>
  )
}
