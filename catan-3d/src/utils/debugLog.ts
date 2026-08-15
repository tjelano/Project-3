// Diagnostic ring buffer for hard-to-reproduce online-sync bugs (e.g. the
// discard screen getting stuck) — console logs alone don't survive a tab
// close, and these bugs can take a full game to resurface. Every entry also
// goes to localStorage so it survives a refresh; exportDebugLog() turns the
// buffer into a downloadable file to hand over for investigation.
//
// Deliberately narrow: this instruments the specific discard/doubles/
// broadcast-delivery code paths this was built to catch, not a general-
// purpose logging framework — add more call sites if a different bug needs
// tracing, don't build out unused generality now.
const STORAGE_KEY = 'catan-debug-log'
const MAX_ENTRIES = 500

interface DebugLogEntry {
  time: string
  event: string
  data?: Record<string, unknown>
}

function loadBuffer(): DebugLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DebugLogEntry[]) : []
  } catch (err) {
    console.error('[Catan] Failed to read debug log from localStorage:', err)
    return []
  }
}

let buffer = loadBuffer()

export function debugLog(event: string, data?: Record<string, unknown>): void {
  const entry: DebugLogEntry = { time: new Date().toISOString(), event, data }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(buffer.length - MAX_ENTRIES)
  console.error('[Catan Debug]', event, data ?? '')
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer))
  } catch (err) {
    // Quota errors etc. — the in-memory buffer and console output still
    // work, so a live debugging session isn't lost even if persistence is.
    console.error('[Catan] Failed to persist debug log to localStorage:', err)
  }
}

export function exportDebugLog(): void {
  const blob = new Blob([JSON.stringify(buffer, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `catan-debug-log-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function clearDebugLog(): void {
  buffer = []
  localStorage.removeItem(STORAGE_KEY)
}

// Console-accessible without needing a code path to call it from — run
// `exportCatanDebugLog()` in DevTools right after hitting a bug.
declare global {
  interface Window {
    exportCatanDebugLog: () => void
    clearCatanDebugLog: () => void
  }
}
if (typeof window !== 'undefined') {
  window.exportCatanDebugLog = exportDebugLog
  window.clearCatanDebugLog = clearDebugLog
}
