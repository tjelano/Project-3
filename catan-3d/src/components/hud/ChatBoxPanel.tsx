import { useEffect, useRef, useState } from 'react'
import type { ChatMessagePayload } from '../../multiplayer/useRoomChannel'
import type { Player, PlayerColorToken } from '../../game/types'

const TEXT_CLASS: Record<PlayerColorToken, string> = {
  'player-1': 'text-player-1',
  'player-2': 'text-player-2',
  'player-3': 'text-player-3',
  'player-4': 'text-player-4',
  'player-5': 'text-player-5',
  'player-6': 'text-player-6',
}

export function ChatBoxPanel({
  messages,
  players,
  onSend,
}: {
  messages: ChatMessagePayload[]
  players: Player[]
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const colorByPlayerId = new Map(players.map((player) => [player.id, player.colorToken]))

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const submit = () => {
    if (!draft.trim()) return
    onSend(draft)
    setDraft('')
  }

  return (
    // Sits above the Roll Dice hex button (right-8 bottom-10, h-28) rather
    // than beside it — that button's own footprint (right 2rem–10rem,
    // bottom 2.5rem–9.5rem) leaves no clean horizontal gap next to the
    // card fan at this viewport width.
    <div className="pointer-events-auto absolute right-4 bottom-40 flex h-56 w-72 flex-col rounded-2xl border border-glass-border bg-board-navy/70 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="border-b border-glass-border px-3 pt-2.5 pb-2 font-body text-[10px] tracking-[0.25em] text-gold/80 uppercase">
        Chat
      </span>
      <div ref={listRef} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
        {messages.length === 0 && <span className="font-body text-[11px] text-white/30 italic">No messages yet.</span>}
        {messages.map((message, i) => {
          const colorToken = colorByPlayerId.get(message.senderId)
          return (
            <div key={`${message.timestamp}-${i}`} className="font-body text-[11px] leading-snug">
              <span className={`font-semibold ${colorToken ? TEXT_CLASS[colorToken] : 'text-white/70'}`}>
                {message.senderName}:
              </span>{' '}
              <span className="text-white/80">{message.text}</span>
            </div>
          )
        })}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex items-center gap-1.5 border-t border-glass-border p-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something…"
          maxLength={200}
          className="min-w-0 flex-1 rounded-full border border-glass-border bg-white/5 px-3 py-1.5 font-body text-[11px] text-white/85 placeholder:text-white/30 focus:border-gold/50 focus:outline-none"
        />
      </form>
    </div>
  )
}
