// Ink-on-parchment palette shared by every pre-game screen using the
// open-book/.expansion-card art (GameSetupMenu, JoinRoomModal,
// RegionSelectMenu, RoomLobby) — distinct from the dark-navy/gold tokens
// used by the in-game HUD, since the book's pages are light cream and
// light-gold-on-dark text would be nearly invisible on them. Tuned to the
// actual page tone (sampled: #f1e0be) and a warm brown ink.
export const INK = 'text-[#2b1810]'
export const INK_MUTED = 'text-[#7a6248]'

export const PARCHMENT_INPUT =
  'mt-1 w-full rounded-md border border-[#8a6d47]/50 bg-[#f1e0be]/50 px-3 py-2.5 font-body text-sm text-[#2b1810] placeholder:text-[#7a6248] focus:border-[#7a3b1e] focus:outline-none'

// No hand-made art exists for these action buttons yet (Back/Join/Select
// region/etc.) — a plain tan pill, same treatment as GameSetupMenu's VP
// stepper buttons, until/unless dedicated art gets made for them too. Focus
// outline lives here (not per call site) so every parchment button gets
// the same keyboard-focus indicator without each usage repeating it by
// hand — CodeRabbit caught 4 of 5 call sites doing exactly that.
export const PARCHMENT_BUTTON =
  'rounded-md border border-[#8a6d47] bg-[#d9c49a]/90 text-[#2b1810] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(43,24,16,0.3)] transition-colors hover:bg-[#e3d0a8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold'
