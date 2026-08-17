import { PLAYER_COLORS, type Player } from '../../game/types'

export interface PlayerTargetPickerProps {
  players: Player[] // already the "other players" list — caller filters out the viewer
  selectedPlayerId: number | null
  onSelect: (playerId: number) => void
}

// Extracted from TradeModal's player-target row (same visual shape:
// colored dot + name, one button per candidate) — now shared by any
// progress card that targets a specific opponent (Guild Dues, Espionage,
// Commercial Harbor).
export function PlayerTargetPicker({ players, selectedPlayerId, onSelect }: PlayerTargetPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {players.map((player) => {
        const selected = selectedPlayerId === player.id
        return (
          <button
            key={player.id}
            type="button"
            onClick={() => onSelect(player.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              selected ? 'border-white/60 bg-white/10 text-white' : 'border-white/20 text-white/70 hover:border-white/40'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[player.colorToken] }} />
            {player.name}
          </button>
        )
      })}
    </div>
  )
}
