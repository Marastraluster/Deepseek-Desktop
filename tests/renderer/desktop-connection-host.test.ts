import { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { describe, expect, it } from 'vitest'
import {
  apply,
  type DesktopConnectionService,
} from '../../packages/desktop-connection/src/index.ts'

describe('desktop Connection Host service', () => {
  it('dispatches dedicated and shared logical RPC registrations without a web server', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const connection = ctx.get('connection') as HostConnectionHandle
    const desktop = ctx.get('desktopConnection') as DesktopConnectionService

    const removeDedicated = connection.rpc.handle(
      '/rpc',
      async (endpoint, payload) => ({ ok: true, value: { endpoint, payload } }),
      { authority: 'loopback' },
    )
    await expect(desktop.dispatch('/rpc', 'goals/read', { goalId: 'goal-1' }, new AbortController().signal))
      .resolves.toEqual({
        ok: true,
        value: { endpoint: 'goals/read', payload: { goalId: 'goal-1' } },
      })

    const removeShared = connection.rpc.intercept(
      '/api',
      endpoint => endpoint === 'goals/create',
      async (_endpoint, payload) => ({ ok: true, value: { accepted: payload } }),
      { authority: 'loopback' },
    )
    await expect(desktop.dispatch('/api', 'goals/create', { title: 'Ship' }, new AbortController().signal))
      .resolves.toEqual({ ok: true, value: { accepted: { title: 'Ship' } } })

    expect(() => connection.rpc.handle(
      '/rpc', async () => ({ ok: true, value: null }), { authority: 'loopback' },
    )).toThrow('already registered')

    await removeShared()
    await removeDedicated()
    await expect(desktop.dispatch('/rpc', 'goals/read', {}, new AbortController().signal))
      .resolves.toMatchObject({ ok: false, error: { code: 'bad-request' } })
    await fiber.dispose()
  })
})
