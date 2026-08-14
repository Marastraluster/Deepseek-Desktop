export type {
  ClientRequest,
  ClientResponse,
  DesktopRequest,
  DesktopResponse,
  DesktopRpcResult,
  RpcReceipt,
  RuntimeStatus,
  ServerRequest,
  ServerResponse,
} from './schemas.js'
export {
  clientRequestSchema,
  clientResponseSchema,
  desktopRequestSchema,
  desktopResponseSchema,
  desktopRpcResultSchema,
  rpcReceiptSchema,
  runtimeStatusSchema,
  serverRequestSchema,
  serverResponseSchema,
} from './schemas.js'

import {
  desktopRequestSchema,
  desktopResponseSchema,
  runtimeStatusSchema,
} from './schemas.js'

export const parseDesktopRequest = desktopRequestSchema.parse
export const parseDesktopResponse = desktopResponseSchema.parse
export const parseRuntimeStatus = runtimeStatusSchema.parse
