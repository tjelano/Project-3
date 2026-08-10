/**
 * Where opponent (and your own) hand fans float around the table, used by
 * PlayerHand3D.tsx's TableSeatHands. Used to be shared with the camera rig
 * too, back when SceneRig.tsx auto-rotated to face whichever seat's turn it
 * was — this formula spread every seat evenly around a full circle to match,
 * with seat 0 lined up on the camera's own default angle so it needed no
 * rotation. That auto-rotation was removed entirely (the camera is now
 * fixed and never moves), but this formula wasn't updated to match: seat 0
 * sitting at the camera's own angle meant it now sat directly BEHIND the
 * camera's fixed view — invisible to every player, every game.
 *
 * Instead, every seat now sits on an arc facing the camera (centred on the
 * far side of the board, angle = PI), spread across 90 degrees, so the
 * whole arc stays inside the fixed camera's frustum for 2, 3, and 4
 * players alike.
 */
const SEAT_ARC_SPREAD = Math.PI / 2

export function seatAngle(index: number, total: number): number {
  if (total <= 1) return Math.PI
  const t = index / (total - 1) - 0.5 // -0.5 .. 0.5 across the seat count
  return Math.PI + t * SEAT_ARC_SPREAD
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
