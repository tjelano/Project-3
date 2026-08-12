import { useEffect, useRef } from 'react'
import type { EventLogEntry } from '../../App'

const VARIANT_DOT: Record<EventLogEntry['variant'], string> = {
  info: 'bg-white/40',
  warning: 'bg-player-1',
}

export function EventLogPanel({ events }: { events: EventLogEntry[] }) {
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest entry — a log the player has to manually
  // scroll down to keep reading defeats the point of it being "live".
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [events])

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 flex h-48 w-72 flex-col rounded-2xl border border-glass-border bg-board-navy/70 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="px-3 pt-2.5 pb-1 font-body text-[10px] tracking-[0.25em] text-white/50 uppercase">
        Event Log
      </span>
      <div ref={listRef} className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2.5">
        {events.length === 0 && <span className="font-body text-[11px] text-white/30 italic">Nothing yet.</span>}
        {events.slice(-20).map((event) => (
          <div key={event.id} className="flex items-start gap-1.5">
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${VARIANT_DOT[event.variant]}`} />
            <span className="font-body text-[11px] leading-snug text-white/75">{event.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
