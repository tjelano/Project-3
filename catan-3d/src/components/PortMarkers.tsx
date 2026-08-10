import { useMemo } from 'react'
import { Billboard, useGLTF } from '@react-three/drei'
import { TILE_HEIGHT } from '../data/hexBoard'
import type { Port } from '../data/boardGraph'
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../game/types'
import { createLabelTexture } from '../three/textLabels'
import dockModelUrl from '../assets/models/dock.glb'

// The badge text's world size — matches the troika fontSize this replaces.
const BADGE_FONT_WORLD_SIZE = 0.1

const GENERIC_PORT_COLOR = '#f2f2f2'
// A tiny gap off the tile edge rather than 0 — flush against it read as
// clipping into the shore. The dock extends OUTWARD from here (see
// DOCK_LENGTH_OFFSET below), not centred on it.
const DOCK_OFFSET = -0.1

// An authored model replaces the old procedural pier (planks, framing,
// piles, bollards, flagpole) in one piece — this one already sculpts its
// own pilings and deck. Only the trade-rate badge below stays procedural:
// it carries live game data (which resource, what rate), not decoration.
// The model's own bounding box is ~symmetric around its local origin on
// the vertical axis (±0.336) — same "centred, not resting on its feet"
// authoring convention as every other model in this pack — so lifting by
// half that (scaled) height brings its own base down to local y=0, the
// same "resting surface" every other group in this file already assumes.
const DOCK_MODEL_HALF_HEIGHT = 0.0001
const DOCK_SCALE = 0.35
const DOCK_Y = DOCK_MODEL_HALF_HEIGHT * DOCK_SCALE

// The model's pier runs along its OWN local X (bounding box is ~0.95 on X,
// ~0.36 on Z — a walkway, not a square) rather than Z like the group's
// outward rotation assumes (the same axis-swap hills-tile.glb needed) — a
// 90° spin remaps that length onto the group's outward-facing Z axis.
// Once it's pointing the right way, DOCK_LENGTH_OFFSET shifts it forward
// by its own half-length (the original X half-extent, scaled) so its
// LANDWARD end sits at the group's origin — right at the tile edge —
// instead of straddling it and leaving a gap.
const DOCK_LENGTH_OFFSET = 0.952 * DOCK_SCALE

// Purely the model's own axis-swap fix now (see the comment above
// DOCK_LENGTH_OFFSET) — no empirical fudge added on top. That fudge used
// to be compensating for port.angle being the WRONG angle (radial from
// board center instead of the edge's own true perpendicular); now that
// boardGraph.ts computes the true one, this doesn't need a correction
// factor anymore.
const DOCK_ROTATION_Y = Math.PI / 2

useGLTF.preload(dockModelUrl)

// --- Badge ---------------------------------------------------------------
// Positioned above the dock model's own peak rather than relative to any
// procedural plank/flag geometry, since none of that exists here anymore.
const BADGE_Y = DOCK_Y * 2 + 0.25

function portColor(type: Port['type']): string {
  return type === '3:1' ? GENERIC_PORT_COLOR : RESOURCE_COLORS[type]
}

function portLabel(type: Port['type']): string {
  return type === '3:1' ? '3:1 Any' : `2:1 ${RESOURCE_LABELS[type]}`
}

function PortMarker({ port }: { port: Port }) {
  // port.angle is the edge's own true perpendicular (see the comment on
  // Port.angle in boardGraph.ts) — NOT the atan2(x, z)-from-board-center
  // convention used elsewhere (HexTile, RobberTileTarget): that shortcut
  // only holds on the flat middle of each of the board's 6 overall sides,
  // and is off by up to 49 degrees on the jagged edges in between.
  const outwardAngle = port.angle
  const dockX = port.x + Math.sin(outwardAngle) * DOCK_OFFSET
  const dockZ = port.z + Math.cos(outwardAngle) * DOCK_OFFSET
  const color = portColor(port.type)

  const { scene } = useGLTF(dockModelUrl)
  const dockInstance = useMemo(() => scene.clone(), [scene])

  const label = useMemo(
    () =>
      createLabelTexture(portLabel(port.type), {
        fontPx: 64,
        color,
        outlineColor: '#0b1220',
        outlineWidthPx: 3,
      }),
    [port.type, color],
  )
  const labelScale = BADGE_FONT_WORLD_SIZE / label.fontPx

  return (
    <group position={[dockX, TILE_HEIGHT / 2, dockZ]} rotation={[0, outwardAngle, 0]}>
      <primitive
        object={dockInstance}
        position={[0, DOCK_Y, DOCK_LENGTH_OFFSET]}
        rotation={[0, DOCK_ROTATION_Y, 0]}
        scale={DOCK_SCALE}
      />

      {/* floating rate badge — always faces the camera, floats above the dock */}
      <Billboard position={[0, BADGE_Y, DOCK_LENGTH_OFFSET]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[0.5, 0.16]} />
          <meshBasicMaterial color="#0b1220" transparent opacity={0.72} />
        </mesh>
        <mesh>
          <planeGeometry args={[label.width * labelScale, label.height * labelScale]} />
          <meshBasicMaterial map={label.texture} transparent depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

export function PortMarkers({ ports }: { ports: Port[] }) {
  return (
    <group>
      {ports.map((port) => (
        <PortMarker key={port.id} port={port} />
      ))}
    </group>
  )
}
