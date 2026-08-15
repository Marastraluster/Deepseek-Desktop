import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { afterEach, describe, expect, it } from 'vitest'

const buildCommit = '47f943859bef60e4160492346772ded9b24f765a'
const temporaryPaths: string[] = []

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('compiled desktop Host', () => {
  it('boots the official composition, serves API and Typert RPC, and stops over stdio', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-desktop-host-'))
    const workspacePath = mkdtempSync(join(tmpdir(), 'dsh-desktop-workspace-'))
    temporaryPaths.push(dshHome)
    temporaryPaths.push(workspacePath)
    const child = spawn(process.execPath, [resolve('apps/desktop-host/dist/main.js')], {
      cwd: resolve('.'),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        DSH_DESKTOP_GENERATION: '1',
        DSH_DESKTOP_PROTOCOL_VERSION: '1',
        DSH_DESKTOP_BUILD_COMMIT: buildCommit,
        DSH_DESKTOP_HARNESS_ROOT: resolve('vendor/deepseek-harness'),
      },
    })
    const messages = collectMessages(child)

    try {
      await expect(messages.next('ready')).resolves.toMatchObject({
        generation: 1,
        protocolVersion: '1',
        buildCommit,
      })

      child.stdin.write(`${JSON.stringify({
        kind: 'request',
        generation: 1,
        id: 'describe',
        payload: {
          type: 'client-request',
          rpcId: 'host-describe',
          method: 'host.describe',
          payload: {},
        },
      })}\n`)

      await expect(messages.next('response', 'describe')).resolves.toMatchObject({
        payload: {
          type: 'server-response',
          rpcId: 'host-describe',
          result: { ok: true },
        },
      })

      child.stdin.write(`${JSON.stringify({
        kind: 'request',
        generation: 1,
        id: 'agent-presets',
        payload: {
          type: 'client-request',
          rpcId: 'agent-preset-list',
          method: 'agentPreset.list',
          payload: {},
        },
      })}\n`)

      await expect(messages.next('response', 'agent-presets')).resolves.toMatchObject({
        payload: {
          type: 'server-response',
          rpcId: 'agent-preset-list',
          result: {
            ok: true,
            value: {
              presets: expect.arrayContaining([
                expect.objectContaining({ id: 'standard', trust: 'system', isDefault: true }),
                expect.objectContaining({ id: 'code', trust: 'system' }),
                expect.objectContaining({ id: 'minimal', trust: 'system' }),
                expect.objectContaining({ id: 'cordis', trust: 'system' }),
              ]),
            },
          },
        },
      })

      child.stdin.write(`${JSON.stringify({
        kind: 'request',
        generation: 1,
        id: 'workspace-create',
        payload: {
          type: 'client-request',
          rpcId: 'workspace-create',
          method: 'workspace.create',
          payload: { path: workspacePath },
        },
      })}\n`)

      const workspaceResponse = await messages.next('response', 'workspace-create')
      const workspaceId = (workspaceResponse.payload as {
        result: { ok: true; value: { workspace: { workspaceId: string } } }
      }).result.value.workspace.workspaceId

      child.stdin.write(`${JSON.stringify({
        kind: 'request',
        generation: 1,
        id: 'session-create',
        payload: {
          type: 'client-request',
          rpcId: 'session-create',
          method: 'session.create',
          payload: { workspaceId },
        },
      })}\n`)

      const sessionResponse = await messages.next('response', 'session-create')
      const sessionResult = (sessionResponse.payload as {
        result: { ok: boolean; error?: { message: string } }
      }).result
      if (!sessionResult.ok) throw new Error(`session.create failed: ${sessionResult.error?.message ?? 'unknown error'}`)

      expect(sessionResponse).toMatchObject({
        payload: {
          type: 'server-response',
          rpcId: 'session-create',
          result: {
            ok: true,
            value: { agentPreset: 'standard', sessionId: expect.any(String) },
          },
        },
      })

      for (const agentPreset of ['code', 'minimal', 'cordis']) {
        const presetWorkspacePath = mkdtempSync(join(tmpdir(), `dsh-desktop-${agentPreset}-`))
        temporaryPaths.push(presetWorkspacePath)
        child.stdin.write(`${JSON.stringify({
          kind: 'request',
          generation: 1,
          id: `workspace-create-${agentPreset}`,
          payload: {
            type: 'client-request',
            rpcId: `workspace-create-${agentPreset}`,
            method: 'workspace.create',
            payload: { path: presetWorkspacePath },
          },
        })}\n`)
        const createdWorkspace = await messages.next('response', `workspace-create-${agentPreset}`)
        const presetWorkspaceId = (createdWorkspace.payload as {
          result: { ok: true; value: { workspace: { workspaceId: string } } }
        }).result.value.workspace.workspaceId

        child.stdin.write(`${JSON.stringify({
          kind: 'request',
          generation: 1,
          id: `session-create-${agentPreset}`,
          payload: {
            type: 'client-request',
            rpcId: `session-create-${agentPreset}`,
            method: 'session.create',
            payload: { workspaceId: presetWorkspaceId },
          },
        })}\n`)
        const createdSession = await messages.next('response', `session-create-${agentPreset}`)
        const presetSessionId = (createdSession.payload as {
          result: { ok: true; value: { sessionId: string } }
        }).result.value.sessionId

        child.stdin.write(`${JSON.stringify({
          kind: 'request',
          generation: 1,
          id: `agent-preset-select-${agentPreset}`,
          payload: {
            type: 'client-request',
            rpcId: `agent-preset-select-${agentPreset}`,
            method: 'agentPreset.select',
            payload: { sessionId: presetSessionId, agentPreset },
          },
        })}\n`)

        await expect(messages.next('response', `agent-preset-select-${agentPreset}`)).resolves.toMatchObject({
          payload: {
            type: 'server-response',
            result: { ok: true, value: { agentPreset } },
          },
        })
      }

      child.stdin.write(`${JSON.stringify({
        kind: 'rpc',
        generation: 1,
        id: 'plugin-inventory',
        requestId: 'plugin-inventory-list',
        channel: '/api',
        endpoint: 'pluginInventory/list',
        payload: { args: {} },
      })}\n`)

      await expect(messages.next('rpc-response', 'plugin-inventory')).resolves.toMatchObject({
        requestId: 'plugin-inventory-list',
        result: {
          ok: true,
          value: {
            entries: expect.any(Array),
          },
        },
      })

      child.stdin.write(`${JSON.stringify({ kind: 'shutdown', generation: 1 })}\n`)
      await expect(messages.next('stopped')).resolves.toMatchObject({ generation: 1 })
      await expect(closeOf(child)).resolves.toMatchObject({ code: 0, signal: null })
    } finally {
      if (child.exitCode === null) child.kill()
    }
  }, 60_000)
})

function collectMessages(child: ChildProcessWithoutNullStreams): {
  next(kind: string, id?: string): Promise<Record<string, unknown>>
} {
  const queued: Record<string, unknown>[] = []
  const waiters: Array<{
    kind: string
    id?: string
    resolve(value: Record<string, unknown>): void
  }> = []
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    const message = JSON.parse(line) as Record<string, unknown>
    const index = waiters.findIndex(waiter => matches(message, waiter.kind, waiter.id))
    if (index >= 0) {
      waiters.splice(index, 1)[0]?.resolve(message)
    } else {
      queued.push(message)
    }
  })
  return {
    next(kind, id) {
      const index = queued.findIndex(message => matches(message, kind, id))
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0] as Record<string, unknown>)
      return new Promise((resolve, reject) => {
        const waiter = { kind, ...(id === undefined ? {} : { id }), resolve }
        waiters.push(waiter)
        setTimeout(() => {
          const pending = waiters.indexOf(waiter)
          if (pending >= 0) waiters.splice(pending, 1)
          reject(new Error(`timed out waiting for ${kind}${id === undefined ? '' : ` ${id}`}`))
        }, 5_000).unref()
      })
    },
  }
}

function matches(message: Record<string, unknown>, kind: string, id?: string): boolean {
  return message.kind === kind && (id === undefined || message.id === id)
}

function closeOf(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; signal: string | null }> {
  return new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })))
}
