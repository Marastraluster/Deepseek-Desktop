import { describe, expect, it } from 'vitest'
import { registerMainRouter } from '../../apps/desktop-main/src/ipc/main-router.ts'

describe('main IPC router', () => {
  it('rejects invocations from an unknown WebContents sender', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    registerMainRouter({
      ownedWebContentsId: 41,
      registrar: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: () => undefined,
      },
      runtime: {
        status: () => ({
          state: 'ready', generation: 1, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        invoke: async () => { throw new Error('must not run') },
        rpc: async () => { throw new Error('must not run') },
        cancel: async () => false,
        respond: async () => ({ accepted: true }),
        restart: async () => ({
          state: 'ready', generation: 2, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        openStream: async function* () {},
      },
    })

    const invoke = handlers.get('dsh:invoke')
    await expect(invoke?.({ sender: { id: 99 } }, {
      kind: 'unary',
      generation: 1,
      request: { type: 'client-request', rpcId: 'rpc-1', method: 'host.describe', payload: {} },
    })).rejects.toThrow('unauthorized IPC sender')
  })

  it('returns a generation-tagged response for an authorized sender', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    registerMainRouter({
      ownedWebContentsId: 41,
      registrar: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: () => undefined,
      },
      runtime: {
        status: () => ({
          state: 'ready', generation: 1, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        invoke: async (_generation, request) => ({
          type: 'server-response', rpcId: request.rpcId,
          result: { ok: true, value: { platform: 'win32' } },
        }),
        rpc: async () => { throw new Error('unexpected rpc') },
        cancel: async () => false,
        respond: async () => ({ accepted: true }),
        restart: async () => ({
          state: 'ready', generation: 2, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        openStream: async function* () {},
      },
    })

    const invoke = handlers.get('dsh:invoke')
    await expect(invoke?.({ sender: { id: 41 } }, {
      kind: 'unary',
      generation: 1,
      request: { type: 'client-request', rpcId: 'rpc-1', method: 'host.describe', payload: {} },
    })).resolves.toMatchObject({ kind: 'unary-response', generation: 1 })
  })

  it('routes cancellation through the authorized invoke channel', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const cancelled: string[] = []
    registerMainRouter({
      ownedWebContentsId: 41,
      registrar: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: () => undefined,
      },
      runtime: {
        status: () => ({
          state: 'ready', generation: 4, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        invoke: async () => { throw new Error('unexpected unary') },
        rpc: async () => { throw new Error('unexpected rpc') },
        cancel: async (_generation, requestId) => {
          cancelled.push(requestId)
          return true
        },
        respond: async () => ({ accepted: true }),
        restart: async () => ({
          state: 'ready', generation: 5, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        openStream: async function* () {},
      },
    })

    const invoke = handlers.get('dsh:invoke')
    await expect(invoke?.({ sender: { id: 41 } }, {
      kind: 'cancel',
      generation: 4,
      requestId: 'rpc-cancelled',
    })).resolves.toEqual({
      kind: 'cancel-receipt',
      generation: 4,
      requestId: 'rpc-cancelled',
      accepted: true,
    })
    expect(cancelled).toEqual(['rpc-cancelled'])
  })

  it('routes a validated logical RPC through the authorized invoke channel', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    registerMainRouter({
      ownedWebContentsId: 41,
      registrar: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: () => undefined,
      },
      runtime: {
        status: () => ({
          state: 'ready', generation: 7, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        invoke: async () => { throw new Error('unexpected unary') },
        rpc: async (generation, requestId, channel, endpoint, payload) => ({
          ok: true,
          value: { generation, requestId, channel, endpoint, payload },
        }),
        cancel: async () => false,
        respond: async () => ({ accepted: true }),
        restart: async () => ({
          state: 'ready', generation: 8, protocolVersion: '1',
          buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
        }),
        openStream: async function* () {},
      },
    })

    const invoke = handlers.get('dsh:invoke')
    await expect(invoke?.({ sender: { id: 41 } }, {
      kind: 'rpc',
      generation: 7,
      requestId: 'desktop-rpc-1',
      channel: '/api',
      endpoint: 'goals/create',
      payload: { args: { agentId: 'agent-1' } },
    })).resolves.toMatchObject({
      kind: 'rpc-response',
      generation: 7,
      requestId: 'desktop-rpc-1',
      result: { ok: true, value: { channel: '/api', endpoint: 'goals/create' } },
    })
  })
})
