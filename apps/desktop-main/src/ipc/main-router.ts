import {
  parseDesktopRequest,
  parseDesktopResponse,
  parseRuntimeStatus,
  type ClientRequest,
  type ClientResponse,
  type DesktopRpcResult,
  type RpcReceipt,
  type RuntimeStatus,
  type ServerRequest,
  type ServerResponse,
} from '@deepseek-desktop/ipc-contract'

interface IpcEventLike {
  sender: { id: number }
  ports?: Array<{ postMessage(message: unknown): void; close(): void }>
}

interface IpcRegistrar {
  handle(channel: string, handler: (event: IpcEventLike, payload?: unknown) => unknown): void
  on(channel: string, listener: (event: IpcEventLike, payload?: unknown) => void): void
}

export interface RuntimeRouterTarget {
  status(): RuntimeStatus
  invoke(generation: number, request: ClientRequest): Promise<ServerResponse>
  rpc(
    generation: number,
    requestId: string,
    channel: string,
    endpoint: string,
    payload: unknown,
  ): Promise<DesktopRpcResult>
  cancel(generation: number, requestId: string): Promise<boolean>
  respond(generation: number, response: ClientResponse): Promise<RpcReceipt>
  restart(): Promise<RuntimeStatus>
  openStream(generation: number, stream: 'mux' | 'host'): AsyncIterable<ServerRequest>
}

interface MainRouterOptions {
  ownedWebContentsId: number
  registrar: IpcRegistrar
  runtime: RuntimeRouterTarget
}

export const IPC_CHANNELS = Object.freeze({
  invoke: 'dsh:invoke',
  respond: 'dsh:respond',
  status: 'dsh:status',
  restart: 'dsh:restart',
  streamOpen: 'dsh:stream-open',
})

function authorize(event: IpcEventLike, expectedId: number): void {
  if (event.sender.id !== expectedId) throw new Error('unauthorized IPC sender')
}

export function registerMainRouter(options: MainRouterOptions): void {
  const { ownedWebContentsId, registrar, runtime } = options

  registrar.handle(IPC_CHANNELS.invoke, async (event, payload) => {
    authorize(event, ownedWebContentsId)
    const request = parseDesktopRequest(payload)
    if (request.kind === 'unary') {
      const response = await runtime.invoke(request.generation, request.request)
      return parseDesktopResponse({
        kind: 'unary-response',
        generation: request.generation,
        response,
      })
    }
    if (request.kind === 'rpc') {
      const result = await runtime.rpc(
        request.generation,
        request.requestId,
        request.channel,
        request.endpoint,
        request.payload,
      )
      return parseDesktopResponse({
        kind: 'rpc-response',
        generation: request.generation,
        requestId: request.requestId,
        result,
      })
    }
    if (request.kind === 'cancel') {
      const accepted = await runtime.cancel(request.generation, request.requestId)
      return parseDesktopResponse({
        kind: 'cancel-receipt',
        generation: request.generation,
        requestId: request.requestId,
        accepted,
      })
    }
    throw new Error('invalid message kind for invoke channel')
  })

  registrar.handle(IPC_CHANNELS.respond, async (event, payload) => {
    authorize(event, ownedWebContentsId)
    const request = parseDesktopRequest(payload)
    if (request.kind !== 'respond') throw new Error('invalid message kind for respond channel')
    const receipt = await runtime.respond(request.generation, request.response)
    return parseDesktopResponse({
      kind: 'respond-receipt',
      generation: request.generation,
      receipt,
    })
  })

  registrar.handle(IPC_CHANNELS.status, (event) => {
    authorize(event, ownedWebContentsId)
    return parseRuntimeStatus(runtime.status())
  })

  registrar.handle(IPC_CHANNELS.restart, async (event) => {
    authorize(event, ownedWebContentsId)
    return parseRuntimeStatus(await runtime.restart())
  })

  registrar.on(IPC_CHANNELS.streamOpen, (event, payload) => {
    authorize(event, ownedWebContentsId)
    const request = parseDesktopRequest(payload)
    if (request.kind !== 'stream-open') throw new Error('invalid message kind for stream channel')
    const port = event.ports?.[0]
    if (port === undefined) throw new Error('stream channel requires one MessagePort')

    void (async () => {
      try {
        for await (const message of runtime.openStream(request.generation, request.stream)) {
          port.postMessage(parseDesktopResponse({
            kind: 'stream-frame',
            generation: request.generation,
            stream: request.stream,
            message,
          }))
        }
        port.postMessage(parseDesktopResponse({
          kind: 'stream-close',
          generation: request.generation,
          stream: request.stream,
        }))
      } catch (error) {
        port.postMessage(parseDesktopResponse({
          kind: 'stream-close',
          generation: request.generation,
          stream: request.stream,
          reason: error instanceof Error ? error.message : String(error),
        }))
      } finally {
        port.close()
      }
    })()
  })
}
