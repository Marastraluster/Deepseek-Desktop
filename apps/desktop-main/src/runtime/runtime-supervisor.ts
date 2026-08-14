import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import type {
  ClientRequest,
  ClientResponse,
  DesktopRpcResult,
  RpcReceipt,
  RuntimeStatus,
  ServerRequest,
  ServerResponse,
} from '@deepseek-desktop/ipc-contract'
import { desktopRpcResultSchema } from '@deepseek-desktop/ipc-contract'
import type { RuntimePaths } from './runtime-paths.ts'

interface RuntimeSupervisorOptions {
  paths: RuntimePaths
  protocolVersion: string
  buildCommit: string
  env?: NodeJS.ProcessEnv
  startupTimeoutMs?: number
  shutdownTimeoutMs?: number
}

interface PendingBase {
  generation: number
  requestId: string
  reject(error: Error): void
}

interface PendingInvoke extends PendingBase {
  kind: 'invoke'
  resolve(value: ServerResponse): void
}

interface PendingRespond extends PendingBase {
  kind: 'respond'
  resolve(value: RpcReceipt): void
}

interface PendingRpc extends PendingBase {
  kind: 'rpc'
  resolve(value: DesktopRpcResult): void
}

type PendingCall = PendingInvoke | PendingRespond | PendingRpc

interface HostReadyMessage {
  kind: 'ready'
  generation: number
  protocolVersion: string
  buildCommit: string
  nodeVersion: string
}

interface HostResponseMessage {
  kind: 'response'
  generation: number
  id: string
  payload: ServerResponse | RpcReceipt
}

interface HostStreamMessage {
  kind: 'stream'
  generation: number
  stream: 'mux' | 'host'
  payload: ServerRequest
}

interface HostStreamCloseMessage {
  kind: 'stream-close'
  generation: number
  stream: 'mux' | 'host'
  reason?: string
}

interface HostRpcResponseMessage {
  kind: 'rpc-response'
  generation: number
  id: string
  requestId: string
  result: DesktopRpcResult
}

type HostMessage = HostReadyMessage | HostResponseMessage | HostStreamMessage | HostStreamCloseMessage
  | HostRpcResponseMessage | {
  kind: 'stopped'
  generation: number
}

class FrameQueue {
  private readonly frames: ServerRequest[] = []
  private readonly waiters: Array<{
    resolve(result: IteratorResult<ServerRequest>): void
    reject(error: Error): void
  }> = []
  private closed = false
  private failure: Error | undefined

  push(frame: ServerRequest): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter.resolve({ done: false, value: frame })
      return
    }
    this.frames.push(frame)
  }

  close(error?: Error): void {
    if (this.closed) return
    this.closed = true
    this.failure = error
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift() as {
        resolve(result: IteratorResult<ServerRequest>): void
        reject(error: Error): void
      }
      if (error !== undefined) {
        waiter.reject(error)
      } else {
        waiter.resolve({ done: true, value: undefined })
      }
    }
  }

  async *iterate(): AsyncGenerator<ServerRequest> {
    while (true) {
      const next = await this.next()
      if (next.done) return
      yield next.value
    }
  }

  private next(): Promise<IteratorResult<ServerRequest>> {
    if (this.frames.length > 0) {
      return Promise.resolve({ done: false, value: this.frames.shift() as ServerRequest })
    }
    if (this.closed) {
      if (this.failure !== undefined) return Promise.reject(this.failure)
      return Promise.resolve({ done: true, value: undefined })
    }
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }
}

export class RuntimeSupervisor {
  private child: ChildProcessWithoutNullStreams | undefined
  private generation = 0
  private restartCount = 0
  private stopping = false
  private currentStatus: RuntimeStatus
  private readonly pending = new Map<string, PendingCall>()
  private readonly requestToCall = new Map<string, string>()
  private readonly streams = new Map<'mux' | 'host', { generation: number; queue: FrameQueue }>()
  private startResolve: ((status: RuntimeStatus) => void) | undefined
  private startReject: ((error: Error) => void) | undefined
  private startTimer: NodeJS.Timeout | undefined

  constructor(private readonly options: RuntimeSupervisorOptions) {
    this.currentStatus = {
      state: 'stopped',
      generation: 0,
      protocolVersion: options.protocolVersion,
      buildCommit: options.buildCommit,
    }
  }

  status(): RuntimeStatus {
    return structuredClone(this.currentStatus)
  }

  async start(): Promise<RuntimeStatus> {
    if (this.currentStatus.state === 'ready') return this.status()
    if (this.startResolve !== undefined) throw new Error('runtime startup is already in progress')

    this.stopping = false
    this.restartCount = 0
    const started = new Promise<RuntimeStatus>((resolve, reject) => {
      this.startResolve = resolve
      this.startReject = reject
    })
    this.startTimer = setTimeout(() => {
      this.failStartup(new Error('Harness Host startup timed out'))
      this.child?.kill()
    }, this.options.startupTimeoutMs ?? 15_000)
    this.spawnGeneration()
    return started
  }

  async invoke(generation: number, request: ClientRequest): Promise<ServerResponse> {
    this.assertReadyGeneration(generation)
    const id = randomUUID()
    const response = new Promise<ServerResponse>((resolve, reject) => {
      this.pending.set(id, { kind: 'invoke', generation, requestId: request.rpcId, resolve, reject })
      this.requestToCall.set(request.rpcId, id)
    })
    this.write({ kind: 'request', generation, id, payload: request })
    return response
  }

  async respond(generation: number, response: ClientResponse): Promise<RpcReceipt> {
    this.assertReadyGeneration(generation)
    const id = randomUUID()
    const receipt = new Promise<RpcReceipt>((resolve, reject) => {
      this.pending.set(id, { kind: 'respond', generation, requestId: response.rpcId, resolve, reject })
      this.requestToCall.set(response.rpcId, id)
    })
    this.write({ kind: 'respond', generation, id, payload: response })
    return receipt
  }

  async rpc(
    generation: number,
    requestId: string,
    channel: string,
    endpoint: string,
    payload: unknown,
  ): Promise<DesktopRpcResult> {
    this.assertReadyGeneration(generation)
    const id = randomUUID()
    const result = new Promise<DesktopRpcResult>((resolve, reject) => {
      this.pending.set(id, { kind: 'rpc', generation, requestId, resolve, reject })
      this.requestToCall.set(requestId, id)
    })
    this.write({ kind: 'rpc', generation, id, requestId, channel, endpoint, payload })
    return result
  }

  async cancel(generation: number, requestId: string): Promise<boolean> {
    if (generation !== this.generation) {
      throw new Error(`stale runtime generation: expected ${this.generation}, got ${generation}`)
    }
    const id = this.requestToCall.get(requestId)
    if (id === undefined) return false
    this.requestToCall.delete(requestId)
    const pending = this.pending.get(id)
    this.pending.delete(id)
    if (this.child !== undefined && !this.child.stdin.destroyed) {
      this.write({ kind: 'cancel', generation, requestId })
    }
    pending?.reject(new Error(`request ${requestId} cancelled`))
    return pending !== undefined
  }

  openStream(generation: number, stream: 'mux' | 'host'): AsyncIterable<ServerRequest> {
    this.assertReadyGeneration(generation)
    this.streams.get(stream)?.queue.close(new Error('stream replaced'))
    const queue = new FrameQueue()
    this.streams.set(stream, { generation, queue })
    this.write({ kind: 'stream-open', generation, stream })
    return queue.iterate()
  }

  async restart(): Promise<RuntimeStatus> {
    await this.stop()
    return this.start()
  }

  async stop(): Promise<void> {
    const child = this.child
    this.closeStreams(new Error('Harness Host stopped'))
    if (child === undefined) {
      this.setStatus('stopped')
      return
    }

    this.stopping = true
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
    if (!child.stdin.destroyed) this.write({ kind: 'shutdown', generation: this.generation })
    const timeoutMs = this.options.shutdownTimeoutMs ?? 5_000
    const graceful = await Promise.race([
      closed.then(() => true),
      new Promise<false>(resolve => setTimeout(() => resolve(false), timeoutMs)),
    ])
    if (!graceful && child.exitCode === null) {
      child.kill()
      await closed
    }
    this.child = undefined
    this.setStatus('stopped')
    this.rejectPending(new Error('Harness Host stopped'))
  }

  private assertReadyGeneration(generation: number): void {
    if (generation !== this.generation) {
      throw new Error(`stale runtime generation: expected ${this.generation}, got ${generation}`)
    }
    if (this.currentStatus.state !== 'ready' || this.child === undefined) {
      throw new Error(`Harness Host is not ready (${this.currentStatus.state})`)
    }
  }

  private spawnGeneration(): void {
    const generation = ++this.generation
    this.setStatus(this.restartCount === 0 ? 'starting' : 'reconnecting')
    const child = spawn(this.options.paths.nodeExecutable, [this.options.paths.hostEntry], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        ...this.options.env,
        DSH_DESKTOP_GENERATION: String(generation),
        DSH_DESKTOP_PROTOCOL_VERSION: this.options.protocolVersion,
        DSH_DESKTOP_BUILD_COMMIT: this.options.buildCommit,
      },
    })
    this.child = child

    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => this.handleLine(line, generation))
    child.stderr.on('data', () => {
      // The file logger owns diagnostics in production. Tests intentionally ignore fixture stderr.
    })
    child.once('error', error => this.handleProcessFailure(error, generation))
    child.once('close', (code, signal) => this.handleClose(code, signal, generation))
  }

  private handleLine(line: string, generation: number): void {
    let message: HostMessage
    try {
      message = JSON.parse(line) as HostMessage
    } catch {
      this.handleProcessFailure(new Error('Harness Host emitted malformed JSON'), generation)
      return
    }
    if (message.generation !== generation || generation !== this.generation) return

    if (message.kind === 'ready') {
      if (message.protocolVersion !== this.options.protocolVersion
        || message.buildCommit !== this.options.buildCommit) {
        this.handleProcessFailure(new Error(
          `Harness Host identity mismatch: protocol ${message.protocolVersion}, build ${message.buildCommit}`,
        ), generation)
        return
      }
      this.currentStatus = {
        state: 'ready',
        generation,
        protocolVersion: message.protocolVersion,
        buildCommit: message.buildCommit,
        ...(this.child?.pid === undefined ? {} : { pid: this.child.pid }),
      }
      this.resolveStartup()
      return
    }

    if (message.kind === 'response') {
      const pending = this.pending.get(message.id)
      if (pending === undefined || pending.generation !== generation) return
      this.pending.delete(message.id)
      this.requestToCall.delete(pending.requestId)
      if (pending.kind === 'invoke' && isServerResponse(message.payload)) {
        pending.resolve(message.payload)
      } else if (pending.kind === 'respond' && isRpcReceipt(message.payload)) {
        pending.resolve(message.payload)
      } else {
        pending.reject(new Error(`Host response kind mismatch for ${pending.kind}`))
      }
      return
    }

    if (message.kind === 'rpc-response') {
      const pending = this.pending.get(message.id)
      if (pending === undefined || pending.generation !== generation) return
      this.pending.delete(message.id)
      this.requestToCall.delete(pending.requestId)
      if (pending.kind === 'rpc' && message.requestId === pending.requestId) {
        pending.resolve(desktopRpcResultSchema.parse(message.result))
      } else {
        pending.reject(new Error(`Host response kind mismatch for ${pending.kind}`))
      }
      return
    }

    if (message.kind === 'stream') {
      const active = this.streams.get(message.stream)
      if (active?.generation === generation) active.queue.push(message.payload)
      return
    }

    if (message.kind === 'stream-close') {
      const active = this.streams.get(message.stream)
      if (active?.generation === generation) {
        active.queue.close(message.reason === undefined ? undefined : new Error(message.reason))
        this.streams.delete(message.stream)
      }
    }
  }

  private handleProcessFailure(error: Error, generation: number): void {
    if (generation !== this.generation || this.stopping) return
    this.currentStatus = {
      ...this.currentStatus,
      state: 'failed',
      generation,
      diagnostic: error.message,
    }
    this.child?.kill()
  }

  private handleClose(code: number | null, signal: NodeJS.Signals | null, generation: number): void {
    if (generation !== this.generation) return
    this.child = undefined
    this.closeStreams(new Error(`Harness Host exited (${String(code)}, ${String(signal)})`))
    this.rejectPending(new Error(`Harness Host exited (${String(code)}, ${String(signal)})`), generation)
    if (this.stopping) {
      this.setStatus('stopped', { code, signal })
      return
    }

    if (this.restartCount < 1) {
      this.restartCount += 1
      this.spawnGeneration()
      return
    }

    this.currentStatus = {
      state: 'failed',
      generation,
      protocolVersion: this.options.protocolVersion,
      buildCommit: this.options.buildCommit,
      lastExit: { code, signal },
      diagnostic: this.currentStatus.diagnostic ?? 'Harness Host exited repeatedly',
    }
    this.failStartup(new Error(this.currentStatus.diagnostic))
  }

  private write(message: object): void {
    const child = this.child
    if (child === undefined || child.stdin.destroyed) throw new Error('Harness Host input is closed')
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private setStatus(
    state: RuntimeStatus['state'],
    lastExit?: { code: number | null; signal: string | null },
  ): void {
    this.currentStatus = {
      state,
      generation: this.generation,
      protocolVersion: this.options.protocolVersion,
      buildCommit: this.options.buildCommit,
      ...(lastExit === undefined ? {} : { lastExit }),
    }
  }

  private resolveStartup(): void {
    if (this.startTimer !== undefined) clearTimeout(this.startTimer)
    this.startTimer = undefined
    const resolve = this.startResolve
    this.startResolve = undefined
    this.startReject = undefined
    resolve?.(this.status())
  }

  private failStartup(error: Error): void {
    if (this.startTimer !== undefined) clearTimeout(this.startTimer)
    this.startTimer = undefined
    const reject = this.startReject
    this.startResolve = undefined
    this.startReject = undefined
    reject?.(error)
  }

  private rejectPending(error: Error, generation?: number): void {
    for (const [id, pending] of this.pending) {
      if (generation !== undefined && pending.generation !== generation) continue
      this.pending.delete(id)
      this.requestToCall.delete(pending.requestId)
      pending.reject(error)
    }
  }

  private closeStreams(error?: Error): void {
    for (const active of this.streams.values()) active.queue.close(error)
    this.streams.clear()
  }
}

function isServerResponse(value: ServerResponse | RpcReceipt): value is ServerResponse {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'server-response'
}

function isRpcReceipt(value: ServerResponse | RpcReceipt): value is RpcReceipt {
  return typeof value === 'object' && value !== null && 'accepted' in value
}
