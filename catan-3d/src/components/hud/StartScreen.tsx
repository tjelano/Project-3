import { useState } from 'react'
import { GameSetupMenu } from './GameSetupMenu'
import { RegionSelectMenu } from './RegionSelectMenu'
import { RoomLobby } from './RoomLobby'
import type { MatchSnapshot } from '../../multiplayer/matchSnapshot'
import type { BoardCell, BoardShapeId, Biome } from '../../data/hexBoard'
import type { CustomBoardShape } from '../../data/customBoardShapes'
import type { GameRules, PlayerColorToken } from '../../game/types'

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
  customBoardBiomeOverrides?: Record<string, Biome>
  // Present only for Online Multiplayer matches. localPlayerName identifies
  // which of `names` this specific browser controls — App.tsx resolves it
  // to a Player.id once the (identical, seeded-by-roomCode) player list is
  // built, since createInitialPlayers assigns ids in `names` order. isHost
  // is re-derived from the snapshot on a reconnect, not assumed from which
  // UI flow (Host vs Join) the browser happened to use this time.
  // localClientId/clientIds (both present together, or both absent — a
  // fresh Start Game submission always has them, a snapshot-restore
  // reconnect never does) let App.tsx resolve "which seat is this browser"
  // by stable id instead of by re-matching localPlayerName against `names`,
  // which can be stale by the time Start Game is actually clicked.
  // hostName lets App.tsx tell whether the ORIGINAL host is still present
  // later in the match (isEffectiveHost), so host authority can fail over
  // instead of freezing the game if that browser disconnects for good.
  online?: {
    roomCode: string
    localPlayerName: string
    isHost: boolean
    localClientId?: string
    clientIds?: string[]
    hostName?: string
  }
  // Present when rejoining a match already in progress — App.tsx restores
  // exactly this saved state instead of building a fresh game.
  snapshot?: MatchSnapshot
}

// Region selection is shared by two different destinations: local play goes
// straight to onStart once a shape is picked, while hosting needs to carry
// the pick one screen further into RoomLobby (which still needs a room and a
// name) instead — this tags which one a given RegionSelectMenu visit is for.
type PendingRegionSelect =
  | { kind: 'local'; info: GameStartInfo }
  | { kind: 'host'; playerCount: number; gameRules: GameRules }

// Set once RegionSelectMenu confirms a shape for the 'host' path above —
// RoomLobby (role: 'host') is rendered from this.
interface HostRegionConfig {
  playerCount: number
  gameRules: GameRules
  boardShapeId?: BoardShapeId
  customBoardShape?: CustomBoardShape
}

// Set once JoinRoomModal's own snapshot-check confirms there's no
// in-progress match at that code yet (a live one skips straight to onStart
// instead) — RoomLobby (role: 'joiner') is rendered from this.
interface JoinSeed {
  roomCode: string
  selfName: string
}

export function StartScreen({ onStart }: { onStart: (info: GameStartInfo) => void }) {
  const [pendingRegionSelect, setPendingRegionSelect] = useState<PendingRegionSelect | null>(null)
  const [hostRegionConfig, setHostRegionConfig] = useState<HostRegionConfig | null>(null)
  const [joinSeed, setJoinSeed] = useState<JoinSeed | null>(null)

  const handleSetupStart = (info: GameStartInfo) => {
    // Online joins and snapshot restores already carry their destination;
    // only local setup needs the region selection step.
    if (info.online || info.snapshot) {
      onStart(info)
    } else {
      setPendingRegionSelect({ kind: 'local', info })
    }
  }

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
      <div className="relative z-10 w-full px-4">
        {pendingRegionSelect ? (
          <RegionSelectMenu
            initialShape={pendingRegionSelect.kind === 'local' ? (pendingRegionSelect.info.boardShapeId ?? 'standard') : 'standard'}
            onConfirm={(boardShapeId) => {
              if (pendingRegionSelect.kind === 'local') {
                onStart({ ...pendingRegionSelect.info, boardShapeId })
              } else {
                setHostRegionConfig({ playerCount: pendingRegionSelect.playerCount, gameRules: pendingRegionSelect.gameRules, boardShapeId })
              }
              setPendingRegionSelect(null)
            }}
            onConfirmCustom={(shape) => {
              if (pendingRegionSelect.kind === 'local') {
                onStart({
                  ...pendingRegionSelect.info,
                  boardShapeId: undefined,
                  customBoardCells: shape.cells,
                  customBoardName: shape.name,
                  customBoardBiomeOverrides: shape.biomeOverrides,
                })
              } else {
                setHostRegionConfig({
                  playerCount: pendingRegionSelect.playerCount,
                  gameRules: pendingRegionSelect.gameRules,
                  boardShapeId: undefined,
                  customBoardShape: shape,
                })
              }
              setPendingRegionSelect(null)
            }}
            onBack={() => setPendingRegionSelect(null)}
          />
        ) : hostRegionConfig ? (
          <RoomLobby
            role="host"
            targetCount={hostRegionConfig.playerCount}
            gameRules={hostRegionConfig.gameRules}
            boardShapeId={hostRegionConfig.boardShapeId}
            customBoardShape={hostRegionConfig.customBoardShape}
            onStart={onStart}
            onBack={() => setHostRegionConfig(null)}
          />
        ) : joinSeed ? (
          <RoomLobby
            role="joiner"
            roomCode={joinSeed.roomCode}
            selfName={joinSeed.selfName}
            onStart={onStart}
            onBack={() => setJoinSeed(null)}
          />
        ) : (
          <GameSetupMenu
            onStart={handleSetupStart}
            onHost={(config) => setPendingRegionSelect({ kind: 'host', playerCount: config.playerCount, gameRules: config.gameRules })}
            onJoinLobby={(seed) => setJoinSeed({ roomCode: seed.roomCode, selfName: seed.selfName })}
          />
        )}
      </div>
    </div>
  )
}
