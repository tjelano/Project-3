import { useState } from 'react'
import { EyeIcon } from './EyeIcon'
import { CopyIcon } from './CopyIcon'

// How long the copy button shows its "copied" checkmark before reverting.
const COPIED_FEEDBACK_MS = 1500

export function RoomCodeTag({ roomCode }: { roomCode: string }) {
  // Defaults hidden — protects anyone streaming/screen-sharing from having
  // their code sniped the instant this tag renders; a deliberate eye click
  // is what reveals it.
  const [isVisible, setIsVisible] = useState(false)
  const [justCopied, setJustCopied] = useState(false)

  const handleCopy = () => {
    // Copies the REAL code regardless of isVisible — sharing it through a
    // side channel (chat, voice) shouldn't require exposing it on-screen.
    void navigator.clipboard.writeText(roomCode)
    setJustCopied(true)
    setTimeout(() => setJustCopied(false), COPIED_FEEDBACK_MS)
  }

  return (
    <div className="pointer-events-none flex items-center gap-1.5 self-start rounded-lg border border-glass-border bg-glass px-2.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setIsVisible((prev) => !prev)}
        aria-label={isVisible ? 'Hide room code' : 'Show room code'}
        className="pointer-events-auto text-white/40 transition-colors hover:text-white/70"
      >
        <EyeIcon open={isVisible} className="h-3 w-3" />
      </button>
      <span className="font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
        code: <span className="font-data text-white/80">{isVisible ? roomCode : '••••'}</span>
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy room code"
        className="pointer-events-auto text-white/40 transition-colors hover:text-white/70"
      >
        <CopyIcon copied={justCopied} className="h-3 w-3" />
      </button>
    </div>
  )
}
