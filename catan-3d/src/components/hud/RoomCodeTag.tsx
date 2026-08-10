export function RoomCodeTag({ roomCode }: { roomCode: string }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-glass-border bg-glass px-2.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
        code: <span className="font-data text-white/80">{roomCode}</span>
      </span>
    </div>
  )
}
