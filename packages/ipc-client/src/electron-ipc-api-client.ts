import type {
  ApiProxy,
  ClientRequest,
  ClientResponse,
  HostFrame,
  MuxFrame,
  RpcRequest,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import {
  clientRequestSchema,
  clientResponseSchema,
} from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import { AbstractApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import {
  parseDesktopResponse,
  type DesktopRequest,
  type DesktopResponse,
  type RuntimeStatus,
} from '@deepseek-desktop/ipc-contract'
import { readDesktopStream } from './stream-readable.js'

type DesktopInvokeRequest = Extract<DesktopRequest, { kind: 'unary' | 'cancel' | 'rpc' }>

export interface DesktopHarnessBridge {
  invoke(request: DesktopInvokeRequest): Promise<DesktopResponse>
  openStream(
    stream: 'mux' | 'host',
    generation: number,
    onMessage: (message: unknown) => void,
    onMessageError: () => void,
  ): () => void
  respond(message: ClientResponse, generation: number): Promise<DesktopResponse>
  runtimeStatus(): Promise<RuntimeStatus>
  restartRuntime(): Promise<RuntimeStatus>
}

export class ElectronIpcApiClient extends AbstractApiClient {
  constructor(
    private readonly bridge: DesktopHarnessBridge,
    private readonly generation: () => number | Promise<number>,
    timeoutMs?: number,
  ) {
    super(timeoutMs)
  }

  protected async doFetch(input: URL, init?: RequestInit): Promise<Response> {
    const body = parseJsonBody(init?.body)
    const generation = await this.generation()
    const signal = init?.signal ?? undefined

    if (input.pathname === '/api/respond') {
      const message = clientResponseSchema.parse(body)
      const response = await withAbort(this.bridge.respond(message, generation), signal)
      assertGeneration(response, generation)
      if (response.kind !== 'respond-receipt') {
        throw new Error(`unexpected ${response.kind} response for client response`)
      }
      return Response.json(response.receipt)
    }

    const message = clientRequestSchema.parse(body)
    const response = await this.invoke(message, generation, signal)
    assertGeneration(response, generation)
    if (response.kind !== 'unary-response') {
      throw new Error(`unexpected ${response.kind} response for unary request`)
    }
    return Response.json(response.response)
  }

  protected override openMux(
    _payload: Parameters<ApiProxy['events']['mux']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<MuxFrame>> {
    return this.openDesktopStream('mux', signal, muxFrameSchema, onOpen)
  }

  protected override openHost(
    _payload: Parameters<ApiProxy['events']['host']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<HostFrame>> {
    return this.openDesktopStream('host', signal, hostFrameSchema, onOpen)
  }

  private openDesktopStream<T extends MuxFrame | HostFrame>(
    stream: 'mux' | 'host',
    signal: AbortSignal,
    frameSchema: { parse(value: unknown): T },
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<T>> {
    const generation = this.generation()
    if (typeof generation === 'number') {
      return this.readWithGeneration(stream, generation, signal, frameSchema, onOpen)
    }
    return this.readAfterGeneration(stream, generation, signal, frameSchema, onOpen)
  }

  private async *readAfterGeneration<T extends MuxFrame | HostFrame>(
    stream: 'mux' | 'host',
    pendingGeneration: Promise<number>,
    signal: AbortSignal,
    frameSchema: { parse(value: unknown): T },
    onOpen?: () => void,
  ): AsyncGenerator<RpcRequest<T>> {
    const generation = await pendingGeneration
    yield* this.readWithGeneration(stream, generation, signal, frameSchema, onOpen)
  }

  private readWithGeneration<T extends MuxFrame | HostFrame>(
    stream: 'mux' | 'host',
    generation: number,
    signal: AbortSignal,
    frameSchema: { parse(value: unknown): T },
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<T>> {
    return readDesktopStream({
      stream,
      generation,
      signal,
      subscribe: (onMessage, onMessageError) =>
        this.bridge.openStream(stream, generation, onMessage, onMessageError),
      frameSchema,
      onEnvelope: message => this.onEnvelope(message),
      ...(onOpen === undefined ? {} : { onOpen }),
    })
  }

  private invoke(
    request: ClientRequest,
    generation: number,
    signal: AbortSignal | undefined,
  ): Promise<DesktopResponse> {
    const pending = this.bridge.invoke({ kind: 'unary', generation, request })
    if (signal === undefined) return pending

    return new Promise((resolve, reject) => {
      const handleAbort = (): void => {
        void this.bridge.invoke({
          kind: 'cancel',
          generation,
          requestId: request.rpcId,
        }).catch(() => undefined)
        reject(abortError(signal))
      }
      if (signal.aborted) {
        handleAbort()
        return
      }
      signal.addEventListener('abort', handleAbort, { once: true })
      pending.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', handleAbort)
      })
    })
  }
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') throw new Error('Electron IPC transport requires a JSON string body')
  return JSON.parse(body) as unknown
}

function assertGeneration(response: DesktopResponse, expected: number): void {
  if (response.generation !== expected) {
    throw new Error(`stale runtime generation: expected ${expected}, got ${response.generation}`)
  }
}

function withAbort<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return pending
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise((resolve, reject) => {
    const handleAbort = (): void => { reject(abortError(signal)) }
    signal.addEventListener('abort', handleAbort, { once: true })
    pending.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort)
    })
  })
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError')
}
