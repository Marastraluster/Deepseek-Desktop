import type { Context } from '@deepseek-ai/cordis'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  ClientConnectionRpc,
  ConnectionConfig,
  ConnectionHandle,
  ConnectionSinks,
  HostDescription,
} from '@deepseek-ai/dsh-client-connection/client'
import { parseDesktopRequest, parseDesktopResponse } from '@deepseek-desktop/ipc-contract'
import {
  ElectronIpcApiClient,
  type DesktopHarnessBridge,
} from '@deepseek-desktop/ipc-client'
import { ConnectionController } from '../../../../vendor/deepseek-harness/packages/client/connection/lib/types/client/connection.js'

declare global {
  interface Window {
    desktopHarness: DesktopHarnessBridge
  }
}

export function createDesktopConnectionHandle(bridge: DesktopHarnessBridge): ConnectionHandle {
  const currentGeneration = async (): Promise<number> => {
    const status = await bridge.runtimeStatus()
    if (status.state !== 'ready') throw new Error(`Harness Host is not ready (${status.state})`)
    return status.generation
  }
  const api = new ElectronIpcApiClient(bridge, currentGeneration)
  const rpc = createDesktopConnectionRpc(bridge, currentGeneration)
  let started = false
  let description: HostDescription | undefined
  const descriptionListeners = new Set<() => void>()
  const publishDescription = (next: HostDescription | undefined): void => {
    if (Object.is(description, next)) return
    description = next
    for (const listener of [...descriptionListeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[desktop-connection] host-description listener threw:', error)
      }
    }
  }

  return {
    api,
    rpc,
    isLoopback: true,
    hostDescription: {
      getSnapshot: () => description,
      subscribe(listener) {
        descriptionListeners.add(listener)
        return () => { descriptionListeners.delete(listener) }
      },
    },
    start(sinks: ConnectionSinks, config?: ConnectionConfig) {
      if (started) throw new Error('connection: the stream loop is already owned by another consumer')
      started = true
      const controller = new ConnectionController(api, {
        ...sinks,
        onConnected: (next) => {
          publishDescription(next)
          if (!Object.is(description, next)) return
          sinks.onConnected?.(next)
        },
        onStateChange: (state) => {
          if (state === 'reconnecting') publishDescription(undefined)
          sinks.onStateChange?.(state)
        },
      }, config ?? {})
      controller.start()
      return {
        stop() {
          controller.stop()
          publishDescription(undefined)
        },
      }
    },
  }
}

function createDesktopConnectionRpc(
  bridge: DesktopHarnessBridge,
  currentGeneration: () => Promise<number>,
): ClientConnectionRpc {
  return {
    async call(channel, endpoint, payload, signal) {
      const generation = await currentGeneration()
      const requestId = RpcId(globalThis.crypto.randomUUID())
      const request = parseDesktopRequest({
        kind: 'rpc',
        generation,
        requestId,
        channel,
        endpoint,
        payload,
      })
      if (request.kind !== 'rpc') throw new Error('desktop RPC request normalization failed')
      const pending = bridge.invoke(request)
      const response = parseDesktopResponse(await abortable(
        pending,
        signal,
        () => {
          const cancellation = parseDesktopRequest({ kind: 'cancel', generation, requestId })
          if (cancellation.kind !== 'cancel') throw new Error('desktop cancellation normalization failed')
          return bridge.invoke(cancellation)
        },
      ))
      if (response.generation !== generation) {
        throw new Error(`stale runtime generation: expected ${generation}, got ${response.generation}`)
      }
      if (response.kind !== 'rpc-response' || response.requestId !== requestId) {
        throw new Error(`unexpected desktop RPC response for ${endpoint}`)
      }
      return response.result.ok
        ? { ok: true, value: response.result.value }
        : response.result
    },
  }
}

function abortable<T>(
  pending: Promise<T>,
  signal: AbortSignal | undefined,
  cancel: () => Promise<unknown>,
): Promise<T> {
  if (signal === undefined) return pending
  if (signal.aborted) {
    void cancel().catch(() => undefined)
    return Promise.reject(abortError(signal))
  }
  return new Promise((resolve, reject) => {
    const handleAbort = (): void => {
      void cancel().catch(() => undefined)
      reject(abortError(signal))
    }
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

export const inject: string[] = []

export function apply(ctx: Context): void {
  ctx.provide('connection', createDesktopConnectionHandle(window.desktopHarness) as never)
}
