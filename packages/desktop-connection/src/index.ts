import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  ConnectionRpcEndpointMatcher,
  ConnectionRpcHandler,
  ConnectionRpcHandlerOptions,
  HostConnectionHandle,
  HostConnectionRpc,
} from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/

interface DedicatedRegistration {
  handler: ConnectionRpcHandler
  options: ConnectionRpcHandlerOptions
}

interface SharedRegistration extends DedicatedRegistration {
  matches: ConnectionRpcEndpointMatcher
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: HostConnectionHandle
    desktopConnection: DesktopConnectionService
  }
}

export class DesktopConnectionService extends Service implements HostConnectionHandle {
  private readonly dedicated = new Map<string, DedicatedRegistration>()
  private shared: SharedRegistration | undefined

  constructor(ctx: Context) {
    super(ctx, 'connection')
    ctx.provide('desktopConnection', this)
  }

  get rpc(): HostConnectionRpc {
    const owner = this.ctx
    return {
      handle: (channel, handler, options) =>
        this.registerDedicated(owner, channel, handler, options),
      intercept: (channel, matches, handler, options) =>
        this.registerShared(owner, channel, matches, handler, options),
    }
  }

  async dispatch(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<RpcResult<unknown>> {
    const registration = channel === '/api'
      ? this.shared?.matches(endpoint) === true ? this.shared : undefined
      : this.dedicated.get(channel)
    if (registration === undefined) {
      return {
        ok: false,
        error: {
          code: 'bad-request',
          message: `desktop connection RPC endpoint is unavailable: ${channel}/${endpoint}`,
          details: { issues: [] },
        },
      }
    }
    return registration.handler(endpoint, payload, signal)
  }

  private registerDedicated(
    owner: Context,
    channel: string,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => Promise<void> {
    if (!CHANNEL_PATTERN.test(channel) || channel === '/api') {
      throw new Error(`connection: invalid or reserved RPC channel ${JSON.stringify(channel)}`)
    }
    return owner.effect(() => {
      if (this.dedicated.has(channel)) {
        throw new Error(`connection: RPC channel ${JSON.stringify(channel)} is already registered`)
      }
      this.dedicated.set(channel, { handler, options })
      return () => { this.dedicated.delete(channel) }
    }, `desktop-connection: ${channel} rpc channel`)
  }

  private registerShared(
    owner: Context,
    channel: '/api',
    matches: ConnectionRpcEndpointMatcher,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => Promise<void> {
    if (channel !== '/api') {
      throw new Error(`connection: invalid shared RPC channel ${JSON.stringify(channel)}`)
    }
    return owner.effect(() => {
      if (this.shared !== undefined) {
        throw new Error('connection: shared RPC channel "/api" already has an interceptor')
      }
      const registration = { matches, handler, options }
      this.shared = registration
      return () => {
        if (this.shared === registration) this.shared = undefined
      }
    }, 'desktop-connection: /api rpc interceptor')
  }
}

export const inject: string[] = []

export function apply(ctx: Context): void {
  new DesktopConnectionService(ctx)
}
