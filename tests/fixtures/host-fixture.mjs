import { existsSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const crashFile = process.env.DSH_TEST_CRASH_ONCE_FILE
if (crashFile && !existsSync(crashFile)) {
  writeFileSync(crashFile, 'crashed')
  process.exit(23)
}

const generation = Number(process.env.DSH_DESKTOP_GENERATION)
const buildCommit = process.env.DSH_DESKTOP_BUILD_COMMIT
const protocolVersion = process.env.DSH_DESKTOP_PROTOCOL_VERSION
const streamCloseReason = process.env.DSH_TEST_STREAM_CLOSE_REASON

process.stdout.write(`${JSON.stringify({
  kind: 'ready',
  generation,
  buildCommit,
  protocolVersion,
  nodeVersion: process.versions.node,
})}\n`)

const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.kind === 'shutdown') {
    process.stdout.write(`${JSON.stringify({ kind: 'stopped', generation })}\n`)
    process.exit(0)
  }
  if (message.kind === 'request') {
    if (message.payload.method === 'pending') return
    process.stdout.write(`${JSON.stringify({
      kind: 'response',
      generation,
      id: message.id,
      payload: {
        type: 'server-response',
        rpcId: message.payload.rpcId,
        result: { ok: true, value: { hostInstanceId: `fixture-${generation}` } },
      },
    })}\n`)
  }
  if (message.kind === 'respond') {
    process.stdout.write(`${JSON.stringify({
      kind: 'response',
      generation,
      id: message.id,
      payload: { accepted: true },
    })}\n`)
  }
  if (message.kind === 'rpc') {
    process.stdout.write(`${JSON.stringify({
      kind: 'rpc-response',
      generation,
      id: message.id,
      requestId: message.requestId,
      result: {
        ok: true,
        value: { channel: message.channel, endpoint: message.endpoint, payload: message.payload },
      },
    })}\n`)
  }
  if (message.kind === 'stream-open' && message.stream === 'host') {
    if (streamCloseReason) {
      process.stdout.write(`${JSON.stringify({
        kind: 'stream-close', generation, stream: 'host', reason: streamCloseReason,
      })}\n`)
      return
    }
    for (const rpcId of ['host-1', 'host-2']) {
      process.stdout.write(`${JSON.stringify({
        kind: 'stream',
        generation,
        stream: 'host',
        payload: {
          type: 'server-request',
          rpcId,
          method: 'events.host',
          payload: { type: 'host/session-status', sessionId: 'session-1', running: true },
        },
      })}\n`)
    }
    process.stdout.write(`${JSON.stringify({ kind: 'stream-close', generation, stream: 'host' })}\n`)
  }
})
