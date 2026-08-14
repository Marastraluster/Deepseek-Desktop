import { describe, expect, it } from 'vitest'
import type {
  DesktopRequest,
  DesktopResponse,
  RuntimeStatus,
} from '../../packages/ipc-contract/src/index.ts'
import type { DesktopHarnessBridge } from '../../packages/ipc-client/src/electron-ipc-api-client.ts'
import { createDesktopConnectionHandle } from '../../packages/desktop-connection/src/client/index.ts'

const buildCommit = '47f943859bef60e4160492346772ded9b24f765a'

function ready(generation: number): RuntimeStatus {
  return {
    state: 'ready',
    generation,
    protocolVersion: '1',
    buildCommit,
  }
}

function bridge(invoke: DesktopHarnessBridge['invoke']): DesktopHarnessBridge {
  return {
    invoke,
    openStream: () => { throw new Error('unexpected stream') },
    respond: async () => { throw new Error('unexpected respond') },
    runtimeStatus: async () => ready(7),
    restartRuntime: async () => ready(8),
  }
}

describe('desktop Connection client', () => {
  it('routes logical RPC through the current runtime generation', async () => {
    let sent: DesktopRequest | undefined
    const handle = createDesktopConnectionHandle(bridge(async (request): Promise<DesktopResponse> => {
      sent = request
      if (request.kind !== 'rpc') throw new Error('unexpected request')
      return {
        kind: 'rpc-response',
        generation: request.generation,
        requestId: request.requestId,
        result: { ok: true, value: { entries: [] } },
      }
    }))

    await expect(handle.rpc.call('/api', 'pluginInventory/list', { args: {} }))
      .resolves.toEqual({ ok: true, value: { entries: [] } })
    expect(sent).toMatchObject({
      kind: 'rpc',
      generation: 7,
      channel: '/api',
      endpoint: 'pluginInventory/list',
      payload: { args: {} },
      requestId: expect.any(String),
    })
  })

  it('cancels a logical RPC with its original request id', async () => {
    const sent: DesktopRequest[] = []
    const pending = new Promise<DesktopResponse>(() => undefined)
    const handle = createDesktopConnectionHandle(bridge(async (request) => {
      sent.push(request)
      if (request.kind === 'cancel') {
        return {
          kind: 'cancel-receipt',
          generation: request.generation,
          requestId: request.requestId,
          accepted: true,
        }
      }
      return pending
    }))
    const abort = new AbortController()

    const call = handle.rpc.call('/api', 'pluginInventory/list', { args: {} }, abort.signal)
    await Promise.resolve()
    abort.abort(new Error('cancelled by client'))

    await expect(call).rejects.toThrow('cancelled by client')
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({
      kind: 'cancel',
      generation: 7,
      requestId: sent[0]?.kind === 'rpc' ? sent[0].requestId : undefined,
    })
  })
})
