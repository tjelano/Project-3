import { useState } from 'react'
import { LocalSetup } from './LocalSetup'
import { OnlineSetup } from './OnlineSetup'
import type { MatchSnapshot } from '../../multiplayer/matchSnapshot'
import type { BoardCell, BoardShapeId } from '../../data/hexBoard'
import type { GameRules, PlayerColorToken } from '../../game/types'

type SetupMode = 'local' | 'online'

export interface GameStartInfo {
  playerCount: number
  names: string[]
  // Parallel to `names` — each player's chosen color. Local: picked
  // directly in LocalSetup's own rows. Online: each lobby player picks
  // their own (RoomPlayer.colorToken), resolved into this array once the
  // room is full. Absent on a snapshot restore, where App.tsx reads
  // colors back out of the restored Player[] instead.
  colorTokens?: PlayerColorToken[]
  // House rules chosen at setup — absent on a snapshot restore, where
  // App.tsx reads them from the snapshot instead (a rule mid-match can't
  // silently change on reconnect).
  gameRules?: GameRules
  // Local: whatever LocalSetup's own picker chose. Online: the host's pick,
  // relayed to every other client via the game-started broadcast — absent
  // when restoring a snapshot, where App.tsx reads it from the snapshot
  // itself instead.
  boardShapeId?: BoardShapeId
  // Set together, only when the picker chose a player-drawn shape —
  // overrides boardShapeId entirely (see buildHexBoard's customCells
  // param). Carried as raw cell data, not just a saved shape's id, since
  // other online clients / a stored snapshot have no way to look a custom
  // shape up locally the way they can for the 3 built-ins.
  customBoardCells?: BoardCell[]
  customBoardName?: string
  // Present only for Online Multiplayer matches. localPlayerName identifies
  // which of `names` this specific browser controls — App.tsx resolves it
  // to a Player.id once the (identical, seeded-by-roomCode) player list is
  // built, since createInitialPlayers assigns ids in `names` order. isHost
  // is re-derived from the snapshot on a reconnect, not assumed from which
  // UI flow (Host vs Join) the browser happened to use this time.
  online?: { roomCode: string; localPlayerName: string; isHost: boolean }
  // Present when rejoining a match already in progress — App.tsx restores
  // exactly this saved state instead of building a fresh game.
  snapshot?: MatchSnapshot
}

const TAB_CLASS = (active: boolean) =>
  `flex-1 rounded-md py-2 font-body text-[11px] tracking-[0.1em] uppercase transition-colors ${
    active ? 'bg-gold text-board-navy' : 'text-white/60 hover:text-white'
  }`

export function StartScreen({ onStart }: { onStart: (info: GameStartInfo) => void }) {
  const [mode, setMode] = useState<SetupMode>('local')

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
      <video
        src="/branding/logo-loop.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-board-navy/50" />
      <div className="relative w-96 rounded-2xl border border-glass-border bg-glass p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <h1 className="font-display text-3xl text-white">Conquer</h1>
        <p className="mt-1 font-body text-xs tracking-[0.25em] text-white/50 uppercase">Only the bravest shall remain.</p>

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
