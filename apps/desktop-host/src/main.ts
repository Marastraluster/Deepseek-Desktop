import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { Context } from '@deepseek-ai/cordis'
import type { DesktopConnectionService } from '@deepseek-desktop/connection'
import type { ApiProxy, ClientRequest, ClientResponse } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  clientRequestSchema,
  clientResponseSchema,
  rpcReceiptSchema,
  rpcResultSchema,
  serverResponseSchema,
} from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import { toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import { z } from 'zod'
import { bootDesktopHost } from './compose-host.js'

const generation = z.coerce.number().int().nonnegative().parse(process.env.DSH_DESKTOP_GENERATION)
const protocolVersion = z.string().min(1).parse(process.env.DSH_DESKTOP_PROTOCOL_VERSION)
const buildCommit = z.string().regex(/^[0-9a-f]{40}$/).parse(process.env.DSH_DESKTOP_BUILD_COMMIT)
const controllers = new Map<string, AbortController>()
const streams = new Map<'mux' | 'host', AbortController>()
const channelSchema = z.string().regex(/^\/[A-Za-z0-9._~-]+$/)
const endpointSchema = z.string().refine((value) => {
  const segments = value.split('/')
  return segments.length > 0 && segments.every(segment =>
    segment !== '' && segment !== '.' && segment !== '..' && /^[A-Za-z0-9_$.-]+$/.test(segment))
}, 'invalid logical RPC endpoint')

const inboundSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('request'),
    generation: z.number().int().nonnegative(),
    id: z.string().min(1),
    payload: clientRequestSchema,
  }).strict(),
  z.object({
    kind: z.literal('respond'),
    generation: z.number().int().nonnegative(),
    id: z.string().min(1),
    payload: clientResponseSchema,
  }).strict(),
  z.object({
    kind: z.literal('rpc'),
    generation: z.number().int().nonnegative(),
    id: z.string().min(1),
    requestId: z.string().min(1),
    channel: channelSchema,
    endpoint: endpointSchema,
    payload: z.json(),
  }).strict(),
  z.object({
    kind: z.literal('cancel'),
    generation: z.number().int().nonnegative(),
    requestId: z.string(),
  }).strict(),
  z.object({
    kind: z.literal('stream-open'),
    generation: z.number().int().nonnegative(),
    stream: z.enum(['mux', 'host']),
  }).strict(),
  z.object({
    kind: z.literal('shutdown'),
    generation: z.number().int().nonnegative(),
  }).strict(),
])

reserveStdoutForProtocol()
void run().catch((error: unknown) => {
  process.stderr.write(`[desktop-host] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})

async function run(): Promise<void> {
  const ctx = await bootDesktopHost()
  const api = ctx.get('apiProxy')
  if (api === undefined) throw new Error('official ApiProxyService did not activate')
  const handler = toFetchHandler(api)

  send({
    kind: 'ready',
    generation,
    protocolVersion,
    buildCommit,
    nodeVersion: process.versions.node,
  })

  const lines = createInterface({ input: process.stdin })
  lines.on('line', (line) => {
    void dispatchLine(ctx, api, handler, line).catch((error: unknown) => {
      process.stderr.write(`[desktop-host] rejected frame: ${messageOf(error)}\n`)
    })
  })
  process.once('SIGTERM', () => { void shutdown(ctx) })
  process.once('SIGINT', () => { void shutdown(ctx) })
}

async function dispatchLine(
  ctx: Context,
  api: ApiProxy,
  handler: ReturnType<typeof toFetchHandler>,
  line: string,
): Promise<void> {
  const message = inboundSchema.parse(JSON.parse(line) as unknown)
  if (message.generation !== generation) return

  if (message.kind === 'request') {
    await invokeUnary(handler, message.id, message.payload)
    return
  }
  if (message.kind === 'respond') {
    await respond(handler, message.id, message.payload)
    return
  }
  if (message.kind === 'rpc') {
    const desktopConnection = ctx.get('desktopConnection') as DesktopConnectionService | undefined
    if (desktopConnection === undefined) throw new Error('desktop Connection service did not activate')
    await invokeRpc(
      desktopConnection,
      message.id,
      message.requestId,
      message.channel,
      message.endpoint,
      message.payload,
    )
    return
  }
  if (message.kind === 'cancel') {
    controllers.get(message.requestId)?.abort(new Error(`request ${message.requestId} cancelled`))
    controllers.delete(message.requestId)
    return
  }
  if (message.kind === 'stream-open') {
    openStream(api, message.stream)
    return
  }
  await shutdown(ctx)
}

async function invokeUnary(
  handler: ReturnType<typeof toFetchHandler>,
  id: string,
  request: ClientRequest,
): Promise<void> {
  const controller = new AbortController()
  controllers.set(request.rpcId, controller)
  try {
    const response = await handler.fetch(new URL(`/api/${request.method}`, 'http://dsh.internal'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`ApiProxy transport failure: HTTP ${response.status}`)
    send({ kind: 'response', generation, id, payload: serverResponseSchema.parse(await response.json()) })
  } finally {
    controllers.delete(request.rpcId)
  }
}

async function respond(
  handler: ReturnType<typeof toFetchHandler>,
  id: string,
  responseMessage: ClientResponse,
): Promise<void> {
  const response = await handler.fetch(new URL('/api/respond', 'http://dsh.internal'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(responseMessage),
  })
  if (!response.ok) throw new Error(`ApiProxy response transport failure: HTTP ${response.status}`)
  send({ kind: 'response', generation, id, payload: rpcReceiptSchema.parse(await response.json()) })
}

async function invokeRpc(
  connection: DesktopConnectionService,
  id: string,
  requestId: string,
  channel: string,
  endpoint: string,
  payload: unknown,
): Promise<void> {
  const controller = new AbortController()
  controllers.set(requestId, controller)
  try {
    const result = await connection.dispatch(channel, endpoint, payload, controller.signal)
    send({
      kind: 'rpc-response',
      generation,
      id,
      requestId,
      result: rpcResultSchema(z.json().optional()).parse(result),
    })
  } finally {
    controllers.delete(requestId)
  }
}

function openStream(api: ApiProxy, stream: 'mux' | 'host'): void {
  streams.get(stream)?.abort(new Error(`${stream} stream replaced`))
  const controller = new AbortController()
  streams.set(stream, controller)
  void (async () => {
    try {
      const frames = stream === 'mux'
        ? api.events.mux({ rpcId: RpcId(randomUUID()), payload: {} }, controller.signal)
        : api.events.host({ rpcId: RpcId(randomUUID()), payload: {} }, controller.signal)
      for await (const frame of frames) {
        send({
          kind: 'stream',
          generation,
          stream,
          payload: {
            type: 'server-request',
            rpcId: frame.rpcId,
            method: frame.payload.type,
            payload: frame.payload,
          },
        })
      }
      send({ kind: 'stream-close', generation, stream })
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        send({ kind: 'stream-close', generation, stream, reason: messageOf(error) })
      }
    } finally {
      if (streams.get(stream) === controller) streams.delete(stream)
    }
  })()
}

let shuttingDown = false
async function shutdown(ctx: Context): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  for (const controller of controllers.values()) controller.abort()
  for (const controller of streams.values()) controller.abort()
  controllers.clear()
  streams.clear()
  await ctx.fiber.dispose()
  send({ kind: 'stopped', generation })
  process.exit(0)
}

function send(message: object): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function reserveStdoutForProtocol(): void {
  const write = (...values: unknown[]): void => {
    process.stderr.write(`${values.map(messageOf).join(' ')}\n`)
  }
  console.log = write
  console.info = write
  console.warn = write
  console.error = write
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.stack ?? value.message : String(value)
}
