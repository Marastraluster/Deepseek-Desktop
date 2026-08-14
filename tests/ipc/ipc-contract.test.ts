import { describe, expect, it } from 'vitest'
import {
  parseDesktopRequest,
  parseDesktopResponse,
  parseRuntimeStatus,
} from '../../packages/ipc-contract/src/index.ts'

describe('desktop IPC contract', () => {
  it('accepts a valid unary request and rejects unknown fields', () => {
    const request = {
      kind: 'unary',
      generation: 3,
      request: {
        type: 'client-request',
        rpcId: 'rpc-1',
        method: 'host.describe',
        payload: {},
      },
    }

    expect(parseDesktopRequest(request)).toEqual(request)
    expect(() => parseDesktopRequest({ ...request, channel: 'arbitrary' })).toThrow()
  })

  it('rejects stale-shaped and negative-generation responses', () => {
    expect(() => parseDesktopResponse({
      kind: 'unary-response',
      generation: -1,
      response: {
        type: 'server-response',
        rpcId: 'rpc-1',
        result: { ok: true, value: {} },
      },
    })).toThrow()
  })

  it('accepts only known runtime states', () => {
    expect(parseRuntimeStatus({
      state: 'ready',
      generation: 2,
      protocolVersion: '1',
      buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
      pid: 1234,
    }).state).toBe('ready')

    expect(() => parseRuntimeStatus({
      state: 'unknown',
      generation: 2,
      protocolVersion: '1',
      buildCommit: '47f943859bef60e4160492346772ded9b24f765a',
    })).toThrow()
  })

  it('validates desktop logical RPC targets and JSON results', () => {
    const request = {
      kind: 'rpc',
      generation: 2,
      requestId: 'desktop-rpc-1',
      channel: '/api',
      endpoint: 'goals/create',
      payload: { args: { agentId: 'agent-1' } },
    }
    expect(parseDesktopRequest(request)).toEqual(request)
    expect(() => parseDesktopRequest({ ...request, channel: 'api' })).toThrow()
    expect(() => parseDesktopRequest({ ...request, endpoint: '../credentials' })).toThrow()
    expect(() => parseDesktopRequest({ ...request, payload: undefined })).toThrow()

    expect(parseDesktopResponse({
      kind: 'rpc-response',
      generation: 2,
      requestId: 'desktop-rpc-1',
      result: { ok: true, value: { goalId: 'goal-1' } },
    })).toMatchObject({ kind: 'rpc-response', result: { ok: true } })

    expect(parseDesktopResponse({
      kind: 'rpc-response',
      generation: 2,
      requestId: 'desktop-rpc-void',
      result: { ok: true },
    })).toMatchObject({ kind: 'rpc-response', result: { ok: true } })
  })
})
