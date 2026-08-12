// Shared by LocalSetup.tsx and OnlineSetup.tsx's custom-shapes dropdown
// trigger — the Unicode "▾" glyph reads as a tiny, inconsistent triangle
// across platforms/fonts; a real stroke icon (same style as TrashIcon)
// stays crisp and sized on purpose instead.
export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
