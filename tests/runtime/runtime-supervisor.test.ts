import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RuntimeSupervisor } from '../../apps/desktop-main/src/runtime/runtime-supervisor.ts'

const buildCommit = '47f943859bef60e4160492346772ded9b24f765a'
const temporaryPaths: string[] = []

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true })
})

function createSupervisor(extraEnv: NodeJS.ProcessEnv = {}) {
  return new RuntimeSupervisor({
    paths: {
      nodeExecutable: process.execPath,
      hostEntry: join(import.meta.dirname, '..', 'fixtures', 'host-fixture.mjs'),
    },
    protocolVersion: '1',
    buildCommit,
    env: extraEnv,
    startupTimeoutMs: 5_000,
    shutdownTimeoutMs: 2_000,
  })
}

describe('RuntimeSupervisor', () => {
  it('starts a real child, correlates a request, and stops gracefully', async () => {
    const supervisor = createSupervisor()
    await expect(supervisor.start()).resolves.toMatchObject({ state: 'ready', generation: 1 })

    await expect(supervisor.invoke(1, {
      type: 'client-request',
      rpcId: RpcId('rpc-1'),
      method: 'host.describe',
      payload: {},
    })).resolves.toMatchObject({
      type: 'server-response',
      rpcId: 'rpc-1',
      result: { ok: true, value: { hostInstanceId: 'fixture-1' } },
    })

    await expect(supervisor.invoke(0, {
      type: 'client-request', rpcId: RpcId('rpc-stale'), method: 'host.describe', payload: {},
    })).rejects.toThrow('stale runtime generation')

    await supervisor.stop()
    expect(supervisor.status().state).toBe('stopped')
  })

  it('automatically restarts the Host once during startup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-desktop-runtime-'))
    temporaryPaths.push(dir)
    const supervisor = createSupervisor({ DSH_TEST_CRASH_ONCE_FILE: join(dir, 'crashed') })

    await expect(supervisor.start()).resolves.toMatchObject({ state: 'ready', generation: 2 })
    await supervisor.stop()
  })

  it('routes responses and ordered stream frames over the same generation', async () => {
    const supervisor = createSupervisor()
    await supervisor.start()

    await expect(supervisor.respond(1, {
      type: 'client-response',
      rpcId: RpcId('server-request-1'),
      result: { ok: true, value: { approved: true } },
    })).resolves.toEqual({ accepted: true })

    const stream = supervisor.openStream(1, 'host')
    const frames = (async () => {
      const result: string[] = []
      for await (const frame of stream) result.push(frame.rpcId)
      return result
    })()

    await expect(frames).resolves.toEqual(['host-1', 'host-2'])
    await supervisor.stop()
  })

  it('propagates a stream-close failure to an already waiting consumer', async () => {
    const supervisor = createSupervisor({ DSH_TEST_STREAM_CLOSE_REASON: 'fixture stream failed' })
    await supervisor.start()

    const stream = supervisor.openStream(1, 'host')[Symbol.asyncIterator]()
    await expect(stream.next()).rejects.toThrow('fixture stream failed')

    await supervisor.stop()
  })

  it('cancels a pending request by its upstream rpcId', async () => {
    const supervisor = createSupervisor()
    await supervisor.start()
    const pending = supervisor.invoke(1, {
      type: 'client-request',
      rpcId: RpcId('rpc-pending'),
      method: 'pending',
      payload: {},
    })

    await expect(supervisor.cancel(1, RpcId('rpc-pending'))).resolves.toBe(true)
    await expect(pending).rejects.toThrow('cancelled')
    await supervisor.stop()
  })

  it('correlates logical RPC over the same generation fence', async () => {
    const supervisor = createSupervisor()
    await supervisor.start()

    await expect(supervisor.rpc(
      1,
      RpcId('desktop-rpc-1'),
      '/api',
      'goals/create',
      { args: { agentId: 'agent-1' } },
    )).resolves.toEqual({
      ok: true,
      value: {
        channel: '/api',
        endpoint: 'goals/create',
        payload: { args: { agentId: 'agent-1' } },
      },
    })

    await supervisor.stop()
  })
})
