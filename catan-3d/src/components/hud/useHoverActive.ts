import { useState } from 'react'

// Tracks "is this element currently hovered or keyboard-focused" as a plain
// boolean, so a caller can drive a glow overlay's opacity from a real
// editable number (see the GLOW_*_OPACITY constants next to each usage)
// instead of Tailwind's group-hover: variant — which only ever toggles
// between the two opacity values baked into its own class names, with no
// way to expose them as numbers someone can tune.
export function useHoverActive() {
  const [isActive, setIsActive] = useState(false)
  return {
    isActive,
    handlers: {
      onMouseEnter: () => setIsActive(true),
      onMouseLeave: () => setIsActive(false),
      onFocus: () => setIsActive(true),
      onBlur: () => setIsActive(false),
    },
  }
}
