import { describe, expect, it } from 'vitest'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { DesktopRequest, DesktopResponse, RuntimeStatus } from '../../packages/ipc-contract/src/index.ts'
import {
  ElectronIpcApiClient,
  type DesktopHarnessBridge,
} from '../../packages/ipc-client/src/electron-ipc-api-client.ts'

class FakePort {
  private readonly listeners = new Map<string, Set<(event: { data: unknown }) => void>>()
  closed = false
  started = false

  addEventListener(type: 'message' | 'messageerror', listener: (event: { data: unknown }) => void): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: 'message' | 'messageerror', listener: (event: { data: unknown }) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  start(): void {
    this.started = true
  }

  close(): void {
    this.closed = true
  }

  emit(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) listener({ data })
  }
}

function openFakePort(port: FakePort): DesktopHarnessBridge['openStream'] {
  return (_stream, _generation, onMessage, onMessageError) => {
    const handleMessage = (event: { data: unknown }): void => { onMessage(event.data) }
    const handleMessageError = (): void => { onMessageError() }
    port.addEventListener('message', handleMessage)
    port.addEventListener('messageerror', handleMessageError)
    port.start()
    return () => {
      port.removeEventListener('message', handleMessage)
      port.removeEventListener('messageerror', handleMessageError)
      port.close()
    }
  }
}

function status(generation: number): RuntimeStatus {
  return {
    state: 'ready',
    generation,
    protocolVersion: '1',
    buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
  }
}

function bridge(overrides: Partial<DesktopHarnessBridge> = {}): DesktopHarnessBridge {
  return {
    invoke: async () => { throw new Error('unexpected invoke') },
    openStream: () => { throw new Error('unexpected stream') },
    respond: async () => { throw new Error('unexpected respond') },
    runtimeStatus: async () => status(2),
    restartRuntime: async () => status(3),
    ...overrides,
  }
}

describe('ElectronIpcApiClient', () => {
  it('streams through callbacks without returning a cross-context MessagePort', async () => {
    let onMessage: ((message: unknown) => void) | undefined
    let closed = false
    const api = new ElectronIpcApiClient(bridge({
      openStream: ((
        _stream: 'mux' | 'host',
        _generation: number,
        next: (message: unknown) => void,
      ) => {
        onMessage = next
        return () => { closed = true }
      }) as DesktopHarnessBridge['openStream'],
    }), () => 2)
    const abort = new AbortController()
    const iterator = api.events.host({}, abort.signal)[Symbol.asyncIterator]()

    const first = iterator.next()
    await Promise.resolve()
    expect(onMessage).toBeTypeOf('function')
    onMessage?.(hostFrame('rpc-callback', true))

    await expect(first).resolves.toMatchObject({
      done: false,
      value: { rpcId: 'rpc-callback', payload: { running: true } },
    })
    abort.abort()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(closed).toBe(true)
  })

  it('rejects a unary response from an older runtime generation', async () => {
    const api = new ElectronIpcApiClient(bridge({
      invoke: async (request): Promise<DesktopResponse> => {
        if (request.kind !== 'unary') throw new Error('unexpected request')
        return {
          kind: 'unary-response',
          generation: 1,
          response: {
            type: 'server-response',
            rpcId: request.request.rpcId,
            result: {
              ok: true,
              value: {
                version: '0.1.0-rc.5',
                cwd: 'C:\\workspace',
                attachedSessions: 0,
                canOpenPath: true,
              },
            },
          },
        }
      },
    }), () => 2)

    await expect(api.host.describe({})).rejects.toThrow('stale runtime generation')
  })

  it('preserves host frame order and closes its MessagePort on abort', async () => {
    const port = new FakePort()
    let opened = 0
    const api = new ElectronIpcApiClient(bridge({ openStream: openFakePort(port) }), () => 2)
    const abort = new AbortController()
    const iterator = api.events.host({}, abort.signal, () => { opened += 1 })[Symbol.asyncIterator]()

    const first = iterator.next()
    port.emit(hostFrame('rpc-1', true))
    port.emit(hostFrame('rpc-2', false))

    await expect(first).resolves.toMatchObject({
      done: false,
      value: { rpcId: 'rpc-1', payload: { running: true } },
    })
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { rpcId: 'rpc-2', payload: { running: false } },
    })
    expect(port.started).toBe(true)
    expect(opened).toBe(1)

    abort.abort()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(port.closed).toBe(true)
  })

  it('propagates unary abort using the original rpcId', async () => {
    const requests: DesktopRequest[] = []
    const never = new Promise<DesktopResponse>(() => undefined)
    const api = new ElectronIpcApiClient(bridge({
      invoke: async (request) => {
        requests.push(request)
        if (request.kind === 'cancel') {
          return {
            kind: 'cancel-receipt',
            generation: request.generation,
            requestId: request.requestId,
            accepted: true,
          }
        }
        return never
      },
    }), () => 2)
    const abort = new AbortController()

    const call = api.host.describe({}, abort.signal)
    abort.abort(new Error('cancelled by test'))

    await expect(call).rejects.toThrow('cancelled by test')
    expect(requests).toHaveLength(2)
    expect(requests[0]?.kind).toBe('unary')
    expect(requests[1]).toMatchObject({
      kind: 'cancel',
      generation: 2,
      requestId: requests[0]?.kind === 'unary' ? requests[0].request.rpcId : undefined,
    })
  })

  it('bounds diagnostic frames without dropping durable host frames', async () => {
    const port = new FakePort()
    const api = new ElectronIpcApiClient(bridge({ openStream: openFakePort(port) }), () => 2)
    const abort = new AbortController()
    const received: Array<{ rpcId: string; type: string }> = []
    const collecting = (async () => {
      for await (const envelope of api.events.host({}, abort.signal)) {
        received.push({ rpcId: envelope.rpcId, type: envelope.payload.type })
      }
    })()

    for (let index = 0; index < 300; index += 1) {
      port.emit(diagnosticFrame(`diagnostic-${index}`))
    }
    port.emit(hostFrame('durable-status', true))
    port.emit({ kind: 'stream-close', generation: 2, stream: 'host' })
    await collecting

    expect(received).toHaveLength(257)
    expect(received[0]).toEqual({ rpcId: 'diagnostic-44', type: 'stream/error' })
    expect(received.at(-1)).toEqual({ rpcId: 'durable-status', type: 'host/session-status' })
  })
})

function hostFrame(rpcId: string, running: boolean): DesktopResponse {
  return {
    kind: 'stream-frame',
    generation: 2,
    stream: 'host',
    message: {
      type: 'server-request',
      rpcId: RpcId(rpcId),
      method: 'events.host',
      payload: { type: 'host/session-status', sessionId: 'session-1', running },
    },
  }
}

function diagnosticFrame(rpcId: string): DesktopResponse {
  return {
    kind: 'stream-frame',
    generation: 2,
    stream: 'host',
    message: {
      type: 'server-request',
      rpcId: RpcId(rpcId),
      method: 'events.host',
      payload: {
        type: 'stream/error',
        error: { code: 'cancelled', message: 'diagnostic', details: {} },
      },
    },
  }
}
