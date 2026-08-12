// Shared by RoomCodeTag.tsx and OnlineSetup.tsx's lobby screen — same
// hand-rolled stroke-icon style as EyeIcon/TrashIcon elsewhere in this
// folder. Two states in one component, same reasoning as EyeIcon: briefly
// swaps to a checkmark right after a successful copy, then back — always
// used as that same before/after pair, never independently.
export function CopyIcon({ copied, className }: { copied: boolean; className?: string }) {
  if (copied) {
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
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}
