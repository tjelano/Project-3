import type { ResourceType } from '../../game/types'

export function ResourceIcon({ resource, className }: { resource: ResourceType; className?: string }) {
  switch (resource) {
    case 'lumber':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <rect x="10.5" y="16" width="3" height="6" />
          <polygon points="12,2 19,15 5,15" />
        </svg>
      )
    case 'brick':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <rect x="3" y="7" width="18" height="10" rx="1.5" />
        </svg>
      )
    case 'wool':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <circle cx="8" cy="12" r="5" />
          <circle cx="14" cy="9" r="5" />
          <circle cx="17" cy="14" r="4.5" />
          <circle cx="10" cy="16" r="4.5" />
        </svg>
      )
    case 'grain':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        >
          <line x1="12" y1="22" x2="12" y2="4" />
          <line x1="12" y1="8" x2="6" y2="3" />
          <line x1="12" y1="8" x2="18" y2="3" />
          <line x1="12" y1="14" x2="6" y2="9" />
          <line x1="12" y1="14" x2="18" y2="9" />
        </svg>
      )
    case 'ore':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <polygon points="12,2 20,10 12,22 4,10" />
        </svg>
      )
  }
}
