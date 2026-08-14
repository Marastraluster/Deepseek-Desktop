import type {
  ClientRequest,
  ClientResponse,
  RpcReceipt,
  ServerRequest,
  ServerResponse,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  clientRequestSchema as upstreamClientRequestSchema,
  clientResponseSchema as upstreamClientResponseSchema,
  rpcErrorSchema,
  rpcIdSchema,
  rpcReceiptSchema as upstreamRpcReceiptSchema,
  serverRequestSchema as upstreamServerRequestSchema,
  serverResponseSchema as upstreamServerResponseSchema,
} from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import { z } from 'zod'

const generationSchema = z.number().int().nonnegative()
const channelSchema = z.string().regex(/^\/[A-Za-z0-9._~-]+$/)
const endpointSchema = z.string().refine((value) => {
  const segments = value.split('/')
  return segments.length > 0 && segments.every(segment =>
    segment !== '' && segment !== '.' && segment !== '..' && /^[A-Za-z0-9_$.-]+$/.test(segment))
}, 'invalid logical RPC endpoint')
const jsonValueSchema = z.json()

export const desktopRpcResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    value: jsonValueSchema.optional(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: rpcErrorSchema,
  }).strict(),
])

export const clientRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: rpcIdSchema,
  method: z.string(),
  payload: z.unknown(),
}).strict().transform((value): ClientRequest => upstreamClientRequestSchema.parse(value))

export const serverResponseSchema = z.object({
  type: z.literal('server-response'),
  rpcId: rpcIdSchema,
  result: z.unknown(),
}).strict().transform((value): ServerResponse => upstreamServerResponseSchema.parse(value))

export const serverRequestSchema = z.object({
  type: z.literal('server-request'),
  rpcId: rpcIdSchema,
  method: z.string(),
  payload: z.unknown(),
}).strict().transform((value): ServerRequest => upstreamServerRequestSchema.parse(value))

export const clientResponseSchema = z.object({
  type: z.literal('client-response'),
  rpcId: rpcIdSchema,
  result: z.unknown(),
}).strict().transform((value): ClientResponse => upstreamClientResponseSchema.parse(value))

export const rpcReceiptSchema = upstreamRpcReceiptSchema

export const desktopRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unary'),
    generation: generationSchema,
    request: clientRequestSchema,
  }).strict(),
  z.object({
    kind: z.literal('respond'),
    generation: generationSchema,
    response: clientResponseSchema,
  }).strict(),
  z.object({
    kind: z.literal('stream-open'),
    generation: generationSchema,
    stream: z.enum(['mux', 'host']),
  }).strict(),
  z.object({
    kind: z.literal('cancel'),
    generation: generationSchema,
    requestId: rpcIdSchema,
  }).strict(),
  z.object({
    kind: z.literal('rpc'),
    generation: generationSchema,
    requestId: rpcIdSchema,
    channel: channelSchema,
    endpoint: endpointSchema,
    payload: jsonValueSchema,
  }).strict(),
])

export const desktopResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unary-response'),
    generation: generationSchema,
    response: serverResponseSchema,
  }).strict(),
  z.object({
    kind: z.literal('respond-receipt'),
    generation: generationSchema,
    receipt: rpcReceiptSchema,
  }).strict(),
  z.object({
    kind: z.literal('cancel-receipt'),
    generation: generationSchema,
    requestId: rpcIdSchema,
    accepted: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal('stream-frame'),
    generation: generationSchema,
    stream: z.enum(['mux', 'host']),
    message: serverRequestSchema,
  }).strict(),
  z.object({
    kind: z.literal('stream-close'),
    generation: generationSchema,
    stream: z.enum(['mux', 'host']),
    reason: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal('rpc-response'),
    generation: generationSchema,
    requestId: rpcIdSchema,
    result: desktopRpcResultSchema,
  }).strict(),
])

export const runtimeStatusSchema = z.object({
  state: z.enum(['starting', 'ready', 'reconnecting', 'failed', 'stopped']),
  generation: generationSchema,
  protocolVersion: z.string().min(1),
  buildCommit: z.string().regex(/^[0-9a-f]{40}$/),
  pid: z.number().int().positive().optional(),
  lastExit: z.object({
    code: z.number().int().nullable(),
    signal: z.string().nullable(),
  }).strict().optional(),
  diagnostic: z.string().optional(),
}).strict()

export type { ClientRequest, ClientResponse, RpcReceipt, ServerRequest, ServerResponse }
export type DesktopRequest = z.infer<typeof desktopRequestSchema>
export type DesktopResponse = z.infer<typeof desktopResponseSchema>
export type DesktopRpcResult = z.infer<typeof desktopRpcResultSchema>
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>
