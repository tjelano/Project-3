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
  // The role="status"/aria-live region must stay mounted even with no
  // active banner — screen readers only reliably announce a CONTENT change
  // on a live region already in the accessibility tree, not a whole
  // element (role + text together) freshly inserted in one paint. Returning
  // null here when banner is empty (CodeRabbit review, PR #106) would have
  // undermined the aria-live announcement it's paired with. Empty content +
  // pointer-events-none makes an unstyled hidden div a no-op visually and
  // for click-through while banner is null.
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute ${belowBarbarianTrack ? 'top-[173px]' : 'top-20'} left-1/2 -translate-x-1/2 ${banner ? `rounded-xl border px-4 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl ${VARIANT_STYLES[banner.variant]}` : ''} text-center font-body text-xs`}
    >
      {banner?.text}
    </div>
  )
}
