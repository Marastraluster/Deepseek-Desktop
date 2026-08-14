import { contextBridge, ipcRenderer } from 'electron'
import {
  parseDesktopRequest,
  parseDesktopResponse,
  parseRuntimeStatus,
  type ClientResponse,
  type DesktopRequest,
} from '@deepseek-desktop/ipc-contract'
import { IPC_CHANNELS } from './ipc/main-router.ts'

const desktopHarness = Object.freeze({
  async invoke(request: Extract<DesktopRequest, { kind: 'unary' | 'cancel' | 'rpc' }>) {
    return parseDesktopResponse(await ipcRenderer.invoke(
      IPC_CHANNELS.invoke,
      parseDesktopRequest(request),
    ))
  },

  openStream(
    stream: 'mux' | 'host',
    generation: number,
    onMessage: (message: unknown) => void,
    onMessageError: () => void,
  ): () => void {
    const channel = new MessageChannel()
    const handleMessage = (event: MessageEvent<unknown>): void => { onMessage(event.data) }
    const handleMessageError = (): void => { onMessageError() }
    channel.port1.addEventListener('message', handleMessage)
    channel.port1.addEventListener('messageerror', handleMessageError)
    channel.port1.start()
    ipcRenderer.postMessage(IPC_CHANNELS.streamOpen, {
      kind: 'stream-open',
      generation,
      stream,
    }, [channel.port2])
    return () => {
      channel.port1.removeEventListener('message', handleMessage)
      channel.port1.removeEventListener('messageerror', handleMessageError)
      channel.port1.close()
    }
  },

  async respond(response: ClientResponse, generation: number) {
    return parseDesktopResponse(await ipcRenderer.invoke(IPC_CHANNELS.respond, {
      kind: 'respond',
      generation,
      response,
    }))
  },

  async runtimeStatus() {
    return parseRuntimeStatus(await ipcRenderer.invoke(IPC_CHANNELS.status))
  },

  async restartRuntime() {
    return parseRuntimeStatus(await ipcRenderer.invoke(IPC_CHANNELS.restart))
  },
})

contextBridge.exposeInMainWorld('desktopHarness', desktopHarness)
