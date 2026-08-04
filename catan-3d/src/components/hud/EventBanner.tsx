import type { BannerMessage } from '../../App'

const VARIANT_STYLES: Record<BannerMessage['variant'], string> = {
  info: 'border-glass-border bg-glass text-white/90',
  warning: 'border-player-1/60 bg-player-1/15 text-player-1',
}

export function EventBanner({ banner }: { banner: BannerMessage | null }) {
  if (!banner) return null

  return (
    <div
      className={`pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-xl border px-4 py-2 text-center font-body text-xs shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl ${VARIANT_STYLES[banner.variant]}`}
    >
      {banner.text}
    </div>
  )
}
