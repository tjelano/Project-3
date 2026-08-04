import { useState } from 'react'
import { LocalSetup } from './LocalSetup'
import { OnlineSetup } from './OnlineSetup'

type SetupMode = 'local' | 'online'

export interface GameStartInfo {
  playerCount: number
  names: string[]
  // Present only for Online Multiplayer matches. localPlayerName identifies
  // which of `names` this specific browser controls — App.tsx resolves it
  // to a Player.id once the (identical, seeded-by-roomCode) player list is
  // built, since createInitialPlayers assigns ids in `names` order.
  online?: { roomCode: string; localPlayerName: string }
}

const TAB_CLASS = (active: boolean) =>
  `flex-1 rounded-md py-2 font-body text-[11px] tracking-[0.1em] uppercase transition-colors ${
    active ? 'bg-gold text-board-navy' : 'text-white/60 hover:text-white'
  }`

export function StartScreen({ onStart }: { onStart: (info: GameStartInfo) => void }) {
  const [mode, setMode] = useState<SetupMode>('local')

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-board-navy/80 backdrop-blur-md">
      <div className="w-96 rounded-2xl border border-glass-border bg-glass p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <h1 className="font-display text-3xl text-white">Settlers</h1>
        <p className="mt-1 font-body text-xs tracking-[0.25em] text-white/50 uppercase">A 3D Catan Prototype</p>

        <div className="mt-8 flex gap-1 rounded-lg border border-glass-border bg-white/5 p-1">
          <button type="button" onClick={() => setMode('local')} className={TAB_CLASS(mode === 'local')}>
            Pass &amp; Play (Local)
          </button>
          <button type="button" onClick={() => setMode('online')} className={TAB_CLASS(mode === 'online')}>
            Online Multiplayer
          </button>
        </div>

        {mode === 'local' ? <LocalSetup onStart={onStart} /> : <OnlineSetup onStart={onStart} />}
      </div>
    </div>
  )
}
