import { KNIGHT_STRENGTH_LABELS, KNIGHT_STRENGTH_ORDER, type KnightPiece, type Player } from '../../game/types'

export interface KnightsPanelProps {
  player: Player
  isMyTurn: boolean
  onRecruit: () => void
  onActivate: (knightId: string) => void
  onPromote: (knightId: string) => void
  onArmMove: (knightId: string) => void
  onArmDisplace: (knightId: string) => void
  onArmChaseRobber: (knightId: string) => void
  canRecruit: boolean
  canPromote: (knight: KnightPiece) => boolean
  canChaseRobber: (knight: KnightPiece) => boolean
  armedKnightId: string | null
}

export function KnightsPanel({
  player,
  isMyTurn,
  onRecruit,
  onActivate,
  onPromote,
  onArmMove,
  onArmDisplace,
  onArmChaseRobber,
  canRecruit,
  canPromote,
  canChaseRobber,
  armedKnightId,
}: KnightsPanelProps) {
  const slots: { strength: (typeof KNIGHT_STRENGTH_ORDER)[number]; knight: KnightPiece | undefined }[] = []
  for (const strength of KNIGHT_STRENGTH_ORDER) {
    const owned = player.knightPieces.filter((k) => k.strength === strength)
    const inSupply = player.knightSupply[strength]
    for (let i = 0; i < owned.length; i++) slots.push({ strength, knight: owned[i] })
    for (let i = 0; i < inSupply; i++) slots.push({ strength, knight: undefined })
  }

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">Knights</span>
      <div className="flex flex-col gap-1.5">
        {slots.map((slot, index) => (
          <div
            key={slot.knight?.id ?? `empty-${slot.strength}-${index}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-white/80"
          >
            <span>{KNIGHT_STRENGTH_LABELS[slot.strength]}</span>
            {!slot.knight && (
              <button
                type="button"
                disabled={!isMyTurn || !canRecruit}
                onClick={onRecruit}
                className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
              >
                Recruit
              </button>
            )}
            {slot.knight && !slot.knight.active && (
              <button
                type="button"
                disabled={!isMyTurn}
                onClick={() => onActivate(slot.knight!.id)}
                className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
              >
                Activate
              </button>
            )}
            {slot.knight && slot.knight.active && (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={!isMyTurn || !canPromote(slot.knight)}
                  onClick={() => onPromote(slot.knight!.id)}
                  className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
                >
                  Promote
                </button>
                <button
                  type="button"
                  disabled={!isMyTurn}
                  onClick={() => onArmMove(slot.knight!.id)}
                  className={`rounded px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40 ${
                    armedKnightId === slot.knight.id ? 'bg-cyan-400/30' : 'bg-white/10'
                  }`}
                >
                  Move
                </button>
                <button
                  type="button"
                  disabled={!isMyTurn}
                  onClick={() => onArmDisplace(slot.knight!.id)}
                  className={`rounded px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40 ${
                    armedKnightId === slot.knight.id ? 'bg-red-400/30' : 'bg-white/10'
                  }`}
                >
                  Displace
                </button>
                <button
                  type="button"
                  disabled={!isMyTurn || !canChaseRobber(slot.knight)}
                  onClick={() => onArmChaseRobber(slot.knight!.id)}
                  className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
                >
                  Chase Robber
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
