import type { RpcRequest, ServerRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import { parseDesktopResponse } from '@deepseek-desktop/ipc-contract'

const MAX_DIAGNOSTIC_FRAMES = 256

interface Parser<T> {
  parse(value: unknown): T
}

type QueueItem<T> =
  | { kind: 'frame'; envelope: RpcRequest<T>; diagnostic: boolean }
  | { kind: 'end' }
  | { kind: 'error'; error: Error }

interface DesktopStreamOptions<T extends { type: string }> {
  stream: 'mux' | 'host'
  generation: number
  signal: AbortSignal
  subscribe(onMessage: (message: unknown) => void, onMessageError: () => void): () => void
  frameSchema: Parser<T>
  onEnvelope(message: ServerRequest): void
  onOpen?: () => void
}

export async function* readDesktopStream<T extends { type: string }>(
  options: DesktopStreamOptions<T>,
): AsyncGenerator<RpcRequest<T>> {
  const { frameSchema, generation, signal, stream } = options
  if (signal.aborted) return

  const queue: QueueItem<T>[] = []
  let diagnosticFrames = 0
  let wake: (() => void) | undefined
  let ended = false

  const enqueue = (item: QueueItem<T>): void => {
    if (ended) return
    if (item.kind === 'frame' && item.diagnostic) {
      if (diagnosticFrames >= MAX_DIAGNOSTIC_FRAMES) {
        const oldest = queue.findIndex(candidate => candidate.kind === 'frame' && candidate.diagnostic)
        if (oldest !== -1) {
          queue.splice(oldest, 1)
          diagnosticFrames -= 1
        }
      }
      diagnosticFrames += 1
    }
    if (item.kind === 'end' || item.kind === 'error') ended = true
    queue.push(item)
    wake?.()
    wake = undefined
  }

  const handleMessage = (data: unknown): void => {
    try {
      const response = parseDesktopResponse(data)
      if (response.generation !== generation) {
        throw new Error(
          `stale runtime generation: expected ${generation}, got ${response.generation}`,
        )
      }
      if (response.kind === 'stream-close') {
        if (response.stream !== stream) throw new Error(`stream mismatch: expected ${stream}`)
        enqueue(response.reason === undefined
          ? { kind: 'end' }
          : { kind: 'error', error: new Error(response.reason) })
        return
      }
      if (response.kind !== 'stream-frame' || response.stream !== stream) {
        throw new Error(`unexpected ${response.kind} message on ${stream} stream`)
      }
      const full = serverRequestSchema.parse(response.message)
      const frame = frameSchema.parse(full.payload)
      options.onEnvelope(full)
      enqueue({
        kind: 'frame',
        envelope: { rpcId: full.rpcId, payload: frame },
        diagnostic: frame.type === 'stream/error' || frame.type === 'host/agent-error',
      })
    } catch (error) {
      enqueue({ kind: 'error', error: toError(error) })
    }
  }
  const handleMessageError = (): void => {
    enqueue({ kind: 'error', error: new Error(`invalid MessagePort frame on ${stream} stream`) })
  }
  const unsubscribe = options.subscribe(handleMessage, handleMessageError)
  const handleAbort = (): void => {
    unsubscribe()
    enqueue({ kind: 'end' })
  }

  signal.addEventListener('abort', handleAbort, { once: true })
  if (signal.aborted) {
    handleAbort()
  } else {
    options.onOpen?.()
  }

  try {
    while (true) {
      while (queue.length > 0) {
        const item = queue.shift() as QueueItem<T>
        if (item.kind === 'frame') {
          if (item.diagnostic) diagnosticFrames -= 1
          yield item.envelope
          continue
        }
        if (item.kind === 'error') throw item.error
        return
      }
      await new Promise<void>((resolve) => { wake = resolve })
    }
  } finally {
    signal.removeEventListener('abort', handleAbort)
    unsubscribe()
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
