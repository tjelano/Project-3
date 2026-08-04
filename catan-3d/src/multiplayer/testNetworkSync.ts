/**
 * Standalone Node CLI — not part of the browser bundle. Run via
 * `npm run test:network`. Spins up two REAL, independent Supabase client
 * instances (not stubs — this is meant to catch actual misconfiguration:
 * a bad URL, a revoked key, Realtime disabled on the project) and drives
 * them through the same lobby lifecycle the game itself uses: connect,
 * join a shared room-code channel, sync presence, receive a broadcast.
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY — the same two
 * variables src/lib/supabaseClient.ts reads in the browser build. (The
 * brief named VITE_SUPABASE_ANON_KEY; this project uses "publishable key"
 * naming throughout, since that's Supabase's current key format — kept
 * consistent with the app's own env vars rather than introducing a second,
 * differently-named variable that nothing else would ever read.)
 */
import { existsSync } from 'node:fs'
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js'

const ENV_PATH = '.env.local'
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// --- terminal formatting ---------------------------------------------------
const isTTY = Boolean(process.stdout.isTTY)
const paint = (code: string, text: string) => (isTTY ? `\x1b[${code}m${text}\x1b[0m` : text)
const green = (t: string) => paint('32', t)
const red = (t: string) => paint('31', t)
const dim = (t: string) => paint('2', t)
const bold = (t: string) => paint('1', t)

interface StepOutcome {
  label: string
  ok: boolean
}

const outcomes: StepOutcome[] = []

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms with no response`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function runStep(label: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await fn()
    outcomes.push({ label, ok: true })
    console.log(`${green('✔')} ${bold(label)}: ${green('SUCCESS')}${detail ? dim(`  (${detail})`) : ''}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    outcomes.push({ label, ok: false })
    console.log(`${red('✘')} ${bold(label)}: ${red('FAILED')}`)
    console.log(dim(`    ${message}`))
    return false
  }
}

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
  return code
}

function waitForSubscribed(channel: RealtimeChannel, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') resolve()
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(err ?? new Error(`${label}: Realtime returned ${status}`))
      }
    })
  })
}

function printSummary(): never {
  const failed = outcomes.filter((o) => !o.ok)
  console.log('')
  console.log(bold('─'.repeat(52)))
  if (outcomes.length > 0 && failed.length === 0) {
    console.log(green(bold('All checks passed — Supabase Realtime is correctly configured.')))
  } else {
    console.log(red(bold(`${failed.length} of ${outcomes.length} check(s) failed.`)))
  }
  console.log(bold('─'.repeat(52)) + '\n')
  process.exit(failed.length === 0 && outcomes.length > 0 ? 0 : 1)
}

async function main() {
  console.log(bold('\nCatan 3D — Supabase Realtime network integration test\n'))

  if (existsSync(ENV_PATH)) {
    process.loadEnvFile(ENV_PATH)
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const roomCode = generateRoomCode()

  let clientA: SupabaseClient | undefined
  let clientB: SupabaseClient | undefined
  let channelA: RealtimeChannel | undefined
  let channelB: RealtimeChannel | undefined

  const connectionOk = await runStep('Supabase Connection', async () => {
    if (!existsSync(ENV_PATH)) {
      throw new Error(`No .env.local found at ${process.cwd()}.`)
    }
    if (!url) throw new Error('VITE_SUPABASE_URL is not set in .env.local.')
    if (!key) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is not set in .env.local.')
    try {
      const parsed = new URL(url)
      if (!parsed.hostname.endsWith('.supabase.co')) {
        console.log(dim(`    note: "${url}" doesn't look like a *.supabase.co project URL — continuing anyway`))
      }
    } catch {
      throw new Error(
        `VITE_SUPABASE_URL is "${url}" — that is not a valid URL. It should look like ` +
          `https://<project-ref>.supabase.co (Supabase dashboard -> Settings -> API), not an API key.`,
      )
    }

    clientA = createClient(url, key)
    clientB = createClient(url, key)

    // A throwaway channel, separate from the room-code channel under test,
    // so a bad URL/key reports as "Supabase Connection failed" rather than
    // getting misattributed to room routing.
    const probe = clientA.channel('network-test:handshake-probe')
    await withTimeout(waitForSubscribed(probe, 'Supabase Connection'), 8000, 'Supabase Connection')
    await clientA.removeChannel(probe)
    return `${url}`
  })

  if (!connectionOk || !clientA || !clientB) {
    printSummary()
  }

  console.log(dim(`\n  Room code under test: ${roomCode}\n`))

  // Supabase's Realtime client requires ALL `.on()` bindings — presence in
  // particular — to be registered before `.subscribe()` is called; it
  // throws if you try to add a presence callback afterward. So every
  // listener is wired up here, before either channel subscribes, even
  // though the things they're listening FOR (track/send) don't happen
  // until later, reported-separately steps below.
  channelA = clientA!.channel(`room:${roomCode}`, { config: { presence: { key: 'client-a', enabled: true } } })
  channelB = clientB!.channel(`room:${roomCode}`, { config: { presence: { key: 'client-b', enabled: true } } })

  let clientBSeenByA = false
  let clientASeenByB = false
  let resolvePresenceSynced!: () => void
  const presenceSynced = new Promise<void>((resolve) => {
    resolvePresenceSynced = resolve
  })
  const checkMutuallyVisible = () => {
    if (clientBSeenByA && clientASeenByB) resolvePresenceSynced()
  }
  channelA.on('presence', { event: 'sync' }, () => {
    if (channelA!.presenceState()['client-b']) clientBSeenByA = true
    checkMutuallyVisible()
  })
  channelB.on('presence', { event: 'sync' }, () => {
    if (channelB!.presenceState()['client-a']) clientASeenByB = true
    checkMutuallyVisible()
  })

  let resolveBroadcastReceived!: () => void
  const broadcastReceived = new Promise<void>((resolve) => {
    resolveBroadcastReceived = resolve
  })
  channelB.on<{ message: string }>('broadcast', { event: 'game-started' }, ({ payload }) => {
    if (payload.message === 'network-test') resolveBroadcastReceived()
  })

  const routingOk = await runStep('Room Code Routing', async () => {
    await withTimeout(
      Promise.all([
        waitForSubscribed(channelA!, 'Room Code Routing (Client A)'),
        waitForSubscribed(channelB!, 'Room Code Routing (Client B)'),
      ]),
      8000,
      'Room Code Routing',
    )
    return `both clients independently subscribed to room:${roomCode}`
  })

  if (!routingOk) {
    await cleanup()
    printSummary()
  }

  const presenceOk = await runStep('Presence Sync', async () => {
    await Promise.all([channelA!.track({ role: 'host' }), channelB!.track({ role: 'joiner' })])
    await withTimeout(presenceSynced, 8000, 'Presence Sync')
    return 'Client A and Client B are mutually visible in presence state'
  })
  void presenceOk

  const broadcastOk = await runStep('Broadcast Delivery', async () => {
    await channelA!.send({ type: 'broadcast', event: 'game-started', payload: { message: 'network-test' } })
    await withTimeout(broadcastReceived, 5000, 'Broadcast Delivery')
    return "Client B received Client A's broadcast"
  })
  void broadcastOk

  await cleanup()
  printSummary()

  async function cleanup() {
    if (channelA && clientA) await clientA.removeChannel(channelA)
    if (channelB && clientB) await clientB.removeChannel(channelB)
  }
}

main().catch((err: unknown) => {
  console.error(red('\nUnexpected error running the network test:'))
  console.error(err)
  process.exit(1)
})
