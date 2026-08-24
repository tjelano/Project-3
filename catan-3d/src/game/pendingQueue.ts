// Shared "waiting room" mechanics for App.tsx's pending-player-queue
// mechanics (discard, Science level 3's free-resource pick, Gold Field
// picks, barbarian pillage/winner-draw, progress-card hand-limit discard).
// Each mechanic keeps its own reducer action and resolve function — this
// module only generalizes two things every one of them independently
// hand-rolled: who's active on THIS screen right now, and removing exactly
// one resolved entry from the queue. Generic over the queue's element type
// via getPlayerId, since most queues hold bare player ids but one
// (pillageQueue) holds a richer { playerId, ... } object.

// Who's actively resolving this queue on THIS screen right now. Online
// multiplayer is PARALLEL — every affected player resolves independently,
// on their own screen, in whatever order they're each ready, so this
// checks "is the local player anywhere in the queue," not "are they at the
// front." Local Pass & Play is SEQUENTIAL — one shared device, so only the
// front of the queue is ever "up." localPlayerId is null for local
// Pass & Play (there is no single "local player" identity to filter to);
// callers pass `onlineInfo?.localPlayerId ?? null`.
export function activeQueueEntry<T>(queue: T[], getPlayerId: (entry: T) => number, localPlayerId: number | null): T | null {
  if (localPlayerId != null) return queue.find((entry) => getPlayerId(entry) === localPlayerId) ?? null
  return queue[0] ?? null
}

// Removes exactly the FIRST entry matching playerId — never every matching
// entry (Array.prototype.filter would incorrectly clear a second pending
// entry for the same player, e.g. a Gold Field city's 2 independent picks,
// along with the first). Returns the exact same array reference when
// nothing matches, so callers relying on reference identity (e.g. a
// useMemo/useEffect dependency array) don't see a spurious change.
export function dequeueOne<T>(queue: T[], getPlayerId: (entry: T) => number, playerId: number): T[] {
  const index = queue.findIndex((entry) => getPlayerId(entry) === playerId)
  return index === -1 ? queue : [...queue.slice(0, index), ...queue.slice(index + 1)]
}
