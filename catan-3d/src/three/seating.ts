/**
 * One formula, shared by the camera rig (SceneRig.tsx) and the opponent
 * hand fans (PlayerHand3D.tsx) — they MUST agree on where every seat is, or
 * the camera would swing to face a point with no hand floating over it.
 *
 * Evenly divides the circle by player count: 2 players sit opposite each
 * other (0°, 180°); 3 or 4 split symmetrically (e.g. 4 -> 0°, 90°, 180°,
 * 270°). Angle 0 lines up with the default camera position [0, 9, 7] —
 * atan2(0, 7) = 0 — so seat 0 needs no rotation to match the game's
 * existing starting view.
 */
export function seatAngle(index: number, total: number): number {
  if (total <= 0) return 0
  return (index / total) * Math.PI * 2
}

/**
 * World-space (x, z) at the given radius for this seat, using the same
 * (sinθ, cosθ) "outward" convention as ports/robber/ocean throughout this
 * codebase — pairs with a group rotation of exactly `seatAngle(...)` on the
 * Y axis to also face that same outward direction (see the comment on
 * PortMarker's rotation for the underlying atan2(x, z) identity).
 */
export function seatPosition(index: number, total: number, radius: number): [number, number] {
  const angle = seatAngle(index, total)
  return [radius * Math.sin(angle), radius * Math.cos(angle)]
}
