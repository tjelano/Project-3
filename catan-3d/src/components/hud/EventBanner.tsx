import type { BannerMessage } from '../../App'

const VARIANT_STYLES: Record<BannerMessage['variant'], string> = {
  info: 'border-glass-border bg-glass text-white/90',
  warning: 'border-player-1/60 bg-player-1/15 text-player-1',
}

export function EventBanner({
  banner,
  // Cities & Knights barbarian track (GameHud.tsx) sits in this exact
  // top-center column too, at top-[74px] with a measured 91px height — a
  // transient banner would otherwise render on top of it. When the
  // barbarian house rule is on, drop this down to top-[173px] (the
  // track's own bottom edge + 8px, the same gap-2 spacing every other HUD
  // stack uses) instead of overlapping it.
  belowBarbarianTrack,
}: {
  banner: BannerMessage | null
  belowBarbarianTrack: boolean
}) {
  if (!banner) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute ${belowBarbarianTrack ? 'top-[173px]' : 'top-20'} left-1/2 -translate-x-1/2 rounded-xl border px-4 py-2 text-center font-body text-xs shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl ${VARIANT_STYLES[banner.variant]}`}
    >
      {banner.text}
    </div>
  )
}
