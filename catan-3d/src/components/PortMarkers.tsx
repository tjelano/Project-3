import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import { TILE_HEIGHT } from '../data/hexBoard'
import { BASIN_Y } from '../three/layout'
import type { Port } from '../data/boardGraph'
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../game/types'
import { BRASS_MATERIAL, decorMaterial } from '../three/materials'
import { createLabelTexture } from '../three/textLabels'

// The badge text's world size — matches the troika fontSize this replaces.
const BADGE_FONT_WORLD_SIZE = 0.1

const GENERIC_PORT_COLOR = '#f2f2f2'
// How far beyond the board edge the dock floats, into the open void.
const DOCK_OFFSET = 0.55

// Three close, warm-brown tones instead of one flat wood color — cycled by
// index across every timber part so no two adjacent pieces match exactly,
// the way individually-weathered boards actually look. decorMaterial() is
// the same cached PBR "weathered resin" recipe (roughness 0.92, warm sheen)
// used everywhere else on the board — only the base color varies.
const WOOD_TONES = ['#6a4a30', '#5b4027', '#77563a']
const woodTone = (i: number) => decorMaterial(WOOD_TONES[i % WOOD_TONES.length])

// --- Walkway ----------------------------------------------------------
// Local +Z is outward/seaward (see the rotation comment on PortMarker), so
// DECK_SHORE_Z is the landward edge and DECK_TIP_Z the open-water edge —
// everything else (piles, beams, bollards, the flag) is positioned relative
// to these two, so the whole pier can never drift out of alignment with
// itself even if the deck length or offset is retuned later.
const DECK_WIDTH = 0.16
const DECK_LENGTH = 0.62
const DECK_CENTER_Z = -0.14
const DECK_SHORE_Z = DECK_CENTER_Z - DECK_LENGTH / 2
const DECK_TIP_Z = DECK_CENTER_Z + DECK_LENGTH / 2

// Composite walkway: 4 distinct planks with real, visible gaps (not the
// hairline seams of a single near-solid box) so each one casts its own
// shadow line — the classic trick that reads as "boards", not "bench".
const PLANK_COUNT = 4
const PLANK_GAP = 0.012
const PLANK_THICKNESS = 0.028
const PLANK_WIDTH = (DECK_WIDTH - PLANK_GAP * (PLANK_COUNT - 1)) / PLANK_COUNT
const PLANK_STEP = PLANK_WIDTH + PLANK_GAP
const PLANK_X_POSITIONS = Array.from({ length: PLANK_COUNT }, (_, i) => (i - (PLANK_COUNT - 1) / 2) * PLANK_STEP)

// --- Under-framing ------------------------------------------------------
// Two beam layers per row "sandwich" the pile heads: an upper cap tight
// under the deck, and a lower wale right where the piles are captured —
// real pier framing, not a single rail the piles just happen to touch.
// Beams run a hair wider than the deck (poking past its edge) the way real
// timber framing does.
const BEAM_WIDTH = DECK_WIDTH + 0.02
const BEAM_THICKNESS = 0.024
const BEAM_DEPTH = 0.045
const UPPER_BEAM_Y = -0.03
const LOWER_BEAM_Y = -0.075

// --- Pilings --------------------------------------------------------------
// Two rows of two piles each, inset from the deck's ends — positioned under
// the beam rows above, since a pile that isn't under a beam isn't holding
// anything up.
const PILE_ROW_INSET = 0.08
const PILE_X_OFFSET = 0.055
const PILE_Z_POSITIONS = [DECK_SHORE_Z + PILE_ROW_INSET, DECK_TIP_Z - PILE_ROW_INSET]
const STILT_POSITIONS: [number, number][] = PILE_Z_POSITIONS.flatMap(
  (z): [number, number][] => [
    [-PILE_X_OFFSET, z],
    [PILE_X_OFFSET, z],
  ],
)
const PILE_TOP_RADIUS = 0.026
const PILE_BOTTOM_RADIUS = 0.02
// Piles start just below the lower beam (visually captured between the two
// beam layers) and run all the way to the basin floor — not merely deep
// enough to stay wet at the lowest wave trough, but driven into the seabed
// the way the brief asked for. Derived from BASIN_Y so it self-corrects if
// the sea's depth is ever retuned, the same discipline layout.ts uses for
// every other water-relative measurement on the board.
const PILE_TOP_Y = LOWER_BEAM_Y - 0.015
const STILT_LENGTH = TILE_HEIGHT / 2 + PILE_TOP_Y - BASIN_Y
const PILE_CENTER_Y = PILE_TOP_Y - STILT_LENGTH / 2

// --- Mooring bollards -------------------------------------------------
// Small square-read posts at all four walkway corners, just outside the
// plank edge — the detail that says "working cargo dock" rather than
// "footbridge". Brass-capped to echo the flagpole's hardware language.
const BOLLARD_RADIUS = 0.016
const BOLLARD_HEIGHT = 0.065
const BOLLARD_X = DECK_WIDTH / 2 + 0.022
const BOLLARD_INSET = 0.06
const BOLLARD_Y = PLANK_THICKNESS / 2 + BOLLARD_HEIGHT / 2
const BOLLARD_POSITIONS: [number, number][] = [DECK_SHORE_Z + BOLLARD_INSET, DECK_TIP_Z - BOLLARD_INSET].flatMap(
  (z): [number, number][] => [
    [-BOLLARD_X, z],
    [BOLLARD_X, z],
  ],
)

// --- Flag & badge -------------------------------------------------------
// Set at the extreme seaward tip, inset just enough that the pole base
// stands on the last plank instead of overhanging open water.
const FLAG_Z = DECK_TIP_Z - 0.05

function portColor(type: Port['type']): string {
  return type === '3:1' ? GENERIC_PORT_COLOR : RESOURCE_COLORS[type]
}

function portLabel(type: Port['type']): string {
  return type === '3:1' ? '3:1 Any' : `2:1 ${RESOURCE_LABELS[type]}`
}

function PortMarker({ port }: { port: Port }) {
  // Matches the rotation convention used throughout the board (HexTile,
  // EdgeSlot, RobberTileTarget): rotation.y = atan2(x, z) maps local +Z to
  // the world direction (x, z) — i.e. straight outward, away from center.
  const outwardAngle = Math.atan2(port.x, port.z)
  const dockX = port.x + Math.sin(outwardAngle) * DOCK_OFFSET
  const dockZ = port.z + Math.cos(outwardAngle) * DOCK_OFFSET
  const color = portColor(port.type)

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
      {/* Composite walkway: 4 distinct planks, real visible gaps between
          them, each its own weathered tone. */}
      {PLANK_X_POSITIONS.map((x, i) => (
        <mesh key={x} position={[x, 0, DECK_CENTER_Z]} material={woodTone(i)} castShadow receiveShadow>
          <boxGeometry args={[PLANK_WIDTH, PLANK_THICKNESS, DECK_LENGTH]} />
        </mesh>
      ))}

      {/* Under-framing: two beam layers per pile row, sandwiching the pile
          heads between an upper cap (tight under the deck) and a lower
          wale — real structural depth, not one flat rail. */}
      {PILE_Z_POSITIONS.map((z, i) => (
        <group key={z}>
          <mesh position={[0, UPPER_BEAM_Y, z]} material={woodTone(i)} castShadow receiveShadow>
            <boxGeometry args={[BEAM_WIDTH, BEAM_THICKNESS, BEAM_DEPTH]} />
          </mesh>
          <mesh position={[0, LOWER_BEAM_Y, z]} material={woodTone(i + 1)} castShadow receiveShadow>
            <boxGeometry args={[BEAM_WIDTH, BEAM_THICKNESS, BEAM_DEPTH]} />
          </mesh>
        </group>
      ))}

      {/* Pilings: thick, slightly tapered columns driven straight down
          through the beam sandwich, through the rolling wave surface, and
          all the way to the basin floor. */}
      {STILT_POSITIONS.map(([x, z], i) => (
        <mesh key={i} position={[x, PILE_CENTER_Y, z]} material={woodTone(i)} castShadow receiveShadow>
          <cylinderGeometry args={[PILE_TOP_RADIUS, PILE_BOTTOM_RADIUS, STILT_LENGTH, 7]} />
        </mesh>
      ))}

      {/* Mooring bollards at the four walkway corners, each brass-capped to
          echo the flagpole's hardware. */}
      {BOLLARD_POSITIONS.map(([x, z], i) => (
        <group key={`${x}-${z}`}>
          <mesh position={[x, BOLLARD_Y, z]} material={woodTone(i + 2)} castShadow receiveShadow>
            <cylinderGeometry args={[BOLLARD_RADIUS, BOLLARD_RADIUS * 1.1, BOLLARD_HEIGHT, 6]} />
          </mesh>
          <mesh position={[x, BOLLARD_Y + BOLLARD_HEIGHT / 2 + 0.006, z]} material={BRASS_MATERIAL} castShadow>
            <sphereGeometry args={[BOLLARD_RADIUS * 0.7, 6, 5]} />
          </mesh>
        </group>
      ))}

      {/* Flag pole, at the extreme seaward tip of the walkway. */}
      <mesh position={[0, 0.21, FLAG_Z]} material={BRASS_MATERIAL} castShadow>
        <cylinderGeometry args={[0.011, 0.013, 0.42, 12]} />
      </mesh>
      {/* Finial — a small brass ball caps the pole rather than a raw cut. */}
      <mesh position={[0, 0.425, FLAG_Z]} material={BRASS_MATERIAL} castShadow>
        <sphereGeometry args={[0.019, 8, 6]} />
      </mesh>

      {/* Flag in two folded segments: the second panel is angled back from
          the first, so the pennant reads as caught in the wind while staying
          completely static — no per-frame cost across nine ports. */}
      <group position={[0.012, 0.335, FLAG_Z]}>
        <mesh position={[0.037, 0, 0.006]} material={decorMaterial(color)} castShadow>
          <boxGeometry args={[0.075, 0.085, 0.011]} />
        </mesh>
        <mesh
          position={[0.104, -0.004, 0.021]}
          rotation={[0, -0.42, 0.05]}
          material={decorMaterial(color)}
          castShadow
        >
          <boxGeometry args={[0.062, 0.073, 0.011]} />
        </mesh>
      </group>
      {/* floating rate badge — always faces the camera, floats directly
          above the flag it belongs to */}
      <Billboard position={[0, 0.55, FLAG_Z]}>
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
