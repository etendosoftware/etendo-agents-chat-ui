import { NextRequest } from "next/server"
import {
  getChatwootPendingMessages,
  getChatwootLabelState,
  type StoredChatwootMessage,
} from "@/lib/chatwoot/message-store"

const PING_INTERVAL_MS = 25_000
const STREAM_LEASE_MS = 60_000
const MESSAGE_POLL_INTERVAL_MS = Number(process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS ?? 2000)
const LABEL_POLL_INTERVAL_MS = Number(process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS ?? 10_000)

const encoder = new TextEncoder()

type LabelState = { lastKnownHasHuman: boolean | null }

function formatEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => { setTimeout(resolve, ms) })
}

function shouldEmitHandoff(state: LabelState, hasHuman: boolean) {
  if (state.lastKnownHasHuman === null) {
    state.lastKnownHasHuman = hasHuman
    return hasHuman
  }
  if (state.lastKnownHasHuman !== hasHuman) {
    state.lastKnownHasHuman = hasHuman
    return true
  }
  return false
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId")
  if (!conversationId) {
    return new Response("conversationId es requerido", { status: 400 })
  }

  let teardown: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const knownMessageIds = new Set<string>()
      const labelState: LabelState = { lastKnownHasHuman: null }

      let keepAlive: ReturnType<typeof setInterval> | null = null
      let leaseTimer: ReturnType<typeof setTimeout> | null = null

      const cleanup = () => {
        if (closed) return
        closed = true
        if (keepAlive) { clearInterval(keepAlive); keepAlive = null }
        if (leaseTimer) { clearTimeout(leaseTimer); leaseTimer = null }
        request.signal.removeEventListener("abort", abortHandler)
        try { controller.close() } catch { /* already closed */ }
      }

      const abortHandler = () => cleanup()

      const enqueue = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(formatEvent(event, data))
        } catch {
          cleanup()
        }
      }

      const pollMessages = async () => {
        while (!closed && !request.signal.aborted) {
          try {
            const messages = await getChatwootPendingMessages(conversationId)
            const fresh = messages.filter((msg: StoredChatwootMessage) => {
              if (!msg.id || knownMessageIds.has(msg.id)) return false
              knownMessageIds.add(msg.id)
              return true
            })
            fresh.forEach((msg: StoredChatwootMessage) => {
              enqueue("chatwoot_message", { conversationId, message: msg })
            })
          } catch (error) {
            if (!closed && !request.signal.aborted) {
              console.error("[chatwoot] Error leyendo mensajes de MongoDB", error)
            }
          }

          if (closed || request.signal.aborted) return
          await delay(MESSAGE_POLL_INTERVAL_MS)
        }
      }

      const pollLabels = async () => {
        while (!closed && !request.signal.aborted) {
          try {
            const state = await getChatwootLabelState(conversationId)
            if (state && shouldEmitHandoff(labelState, state.hasHuman)) {
              enqueue("chatwoot_handoff", {
                conversationId,
                human: state.hasHuman,
                labels: state.labels,
              })
            }
          } catch (error) {
            if (!closed && !request.signal.aborted) {
              console.error("[chatwoot] Error leyendo labels de MongoDB", error)
            }
          }

          if (closed || request.signal.aborted) return
          await delay(LABEL_POLL_INTERVAL_MS)
        }
      }

      pollMessages()
      pollLabels()

      keepAlive = setInterval(() => {
        enqueue("ping", { ts: Date.now() })
      }, PING_INTERVAL_MS)

      leaseTimer = setTimeout(() => {
        enqueue("drain", { conversationId })
        setTimeout(cleanup, 250)
      }, STREAM_LEASE_MS)

      request.signal.addEventListener("abort", abortHandler)
      enqueue("connected", { conversationId })

      teardown = cleanup
    },
    cancel() {
      teardown?.()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
