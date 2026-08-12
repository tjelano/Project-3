import { useState } from 'react'
import { EyeIcon } from './EyeIcon'

export function RoomCodeTag({ roomCode }: { roomCode: string }) {
  // Defaults visible — this only protects streamers who opt to hide it,
  // it shouldn't surprise everyone else with a masked code by default.
  const [isVisible, setIsVisible] = useState(true)

  return (
    <div className="pointer-events-none flex items-center gap-1.5 self-start rounded-lg border border-glass-border bg-glass px-2.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
        code: <span className="font-data text-white/80">{isVisible ? roomCode : '••••'}</span>
      </span>
      <button
        type="button"
        onClick={() => setIsVisible((prev) => !prev)}
        aria-label={isVisible ? 'Hide room code' : 'Show room code'}
        className="pointer-events-auto text-white/40 transition-colors hover:text-white/70"
      >
        <EyeIcon open={isVisible} className="h-3 w-3" />
      </button>
    </div>
  )
}
