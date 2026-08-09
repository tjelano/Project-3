// Excludes 0/O and 1/I/L — the characters people most often misread or
// mistype when reading a code off one screen and typing it into another.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LENGTH = 4

export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().slice(0, ROOM_CODE_LENGTH)
}

// A player's typed name is used to match them back to their original seat
// on rejoin, and to compare against the stored host name — both exact
// `===`/`indexOf` comparisons that silently fail (locking the player out of
// their own turn, or losing host status) on trailing whitespace from a
// mobile keyboard or a different case. This is what a human would consider
// "the same name."
export function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase()
}
