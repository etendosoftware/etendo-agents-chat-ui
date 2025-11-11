import { NextRequest } from "next/server"

const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN

const PING_INTERVAL_MS = 25_000
const STREAM_LEASE_MS = 280_000 // close before Vercel's 300s limit
const MESSAGE_POLL_INTERVAL_MS = Number(process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS ?? 1500)
const LABEL_POLL_INTERVAL_MS = Number(process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS ?? 8000)

const encoder = new TextEncoder()

type RawChatwootMessage = Record<string, any>

type LabelState = {
  lastKnownHasHuman: boolean | null
}

const REQUIRED_ENV = [
  { key: "CHATWOOT_BASE_URL", value: CHATWOOT_BASE_URL },
  { key: "CHATWOOT_ACCOUNT_ID", value: CHATWOOT_ACCOUNT_ID },
  { key: "CHATWOOT_API_TOKEN", value: CHATWOOT_API_TOKEN },
]

function formatEvent(event: string, data: unknown) {
  const payload = JSON.stringify(data ?? {})
  return encoder.encode(`event: ${event}\ndata: ${payload}\n\n`)
}

function extractMessages(payload: any): RawChatwootMessage[] {
  if (!payload || typeof payload !== "object") {
    return []
  }

  if (Array.isArray(payload?.messages)) {
    return payload.messages
  }

  if (Array.isArray(payload?.payload?.messages)) {
    return payload.payload.messages
  }

  if (Array.isArray(payload?.payload)) {
    return payload.payload
  }

  if (Array.isArray(payload?.data?.messages)) {
    return payload.data.messages
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (Array.isArray(payload)) {
    return payload
  }

  return []
}

function getMessageId(message: RawChatwootMessage) {
  const id =
    message?.id ??
    message?.message_id ??
    message?.created_at ??
    message?.uuid ??
    message?.timestamp

  if (id === null || id === undefined) {
    return null
  }

  return String(id)
}

function isOutgoingMessage(message: RawChatwootMessage) {
  const type = message?.message_type
  if (typeof type === "string") {
    return type.toLowerCase() === "outgoing"
  }
  if (typeof type === "number") {
    return type === 1
  }
  return false
}

function compareMessageOrder(a: RawChatwootMessage, b: RawChatwootMessage) {
  const timestamp = (message: RawChatwootMessage) => {
    const createdAt = message?.created_at ?? message?.created_at_i ?? message?.timestamp
    if (typeof createdAt === "number") {
      return createdAt > 9999999999 ? createdAt : createdAt * 1000
    }
    if (typeof createdAt === "string") {
      const parsed = Date.parse(createdAt)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
    const fallback = Number(message?.id ?? 0)
    return Number.isFinite(fallback) ? fallback : Date.now()
  }

  return timestamp(a) - timestamp(b)
}

function normalizeBaseUrl(base: string) {
  return base.replace(/\/$/, "")
}

async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "api_access_token": CHATWOOT_API_TOKEN!,
    },
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    const details = await response.text().catch(() => null)
    throw new Error(`Chatwoot ${response.status} ${response.statusText}: ${details ?? ""}`)
  }

  return response.json().catch(() => ({}))
}

function extractLabels(payload: any): string[] {
  const candidates = [
    payload?.labels,
    payload?.data?.labels,
    payload?.payload?.labels,
    payload?.conversation?.labels,
    payload?.payload?.conversation?.labels,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((label) => (typeof label === "string" ? label : String(label ?? "")))
    }
  }

  return []
}

function shouldEmitConversationLabels(state: LabelState, hasHuman: boolean) {
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

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const missing = REQUIRED_ENV.filter((item) => !item.value)
  if (missing.length > 0) {
    const keys = missing.map((item) => item.key).join(", ")
    return new Response(`Faltan variables de entorno: ${keys}`, { status: 500 })
  }

  const conversationId = request.nextUrl.searchParams.get("conversationId")

  if (!conversationId) {
    return new Response("conversationId es requerido", { status: 400 })
  }

  const baseUrl = normalizeBaseUrl(CHATWOOT_BASE_URL!)
  const messagesUrl = `${baseUrl}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`
  const conversationUrl = `${baseUrl}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}`

  let teardown: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const knownMessageIds = new Set<string>()
      const labelState: LabelState = { lastKnownHasHuman: null }

      let keepAlive: ReturnType<typeof setInterval> | null = null
      let leaseTimer: ReturnType<typeof setTimeout> | null = null

      const cleanup = () => {
        if (closed) {
          return
        }
        closed = true
        if (keepAlive) {
          clearInterval(keepAlive)
          keepAlive = null
        }
        if (leaseTimer) {
          clearTimeout(leaseTimer)
          leaseTimer = null
        }
        request.signal.removeEventListener("abort", abortHandler)
        try {
          controller.close()
        } catch (error) {
          console.error("[chatwoot] SSE close error", error)
        }
      }

      const abortHandler = () => {
        cleanup()
      }

      const enqueue = (event: string, data: unknown) => {
        if (closed) {
          return
        }
        try {
          controller.enqueue(formatEvent(event, data))
        } catch (error) {
          console.error("[chatwoot] SSE enqueue error", error)
          cleanup()
        }
      }

      const pollMessages = async () => {
        while (!closed && !request.signal.aborted) {
          try {
            const payload = await fetchJson(messagesUrl, request.signal)
            const rawMessages = extractMessages(payload)
            if (rawMessages.length > 0) {
              const fresh = rawMessages
                .filter((message) => {
                  if (!message || typeof message !== "object") {
                    return false
                  }

                  if (!isOutgoingMessage(message) || message?.private) {
                    return false
                  }

                  const messageId = getMessageId(message)
                  if (!messageId || knownMessageIds.has(messageId)) {
                    return false
                  }
                  knownMessageIds.add(messageId)
                  return true
                })
                .sort(compareMessageOrder)

              fresh.forEach((message) => {
                enqueue("chatwoot_message", {
                  conversationId,
                  message,
                })
              })
            }
          } catch (error) {
            if (request.signal.aborted || closed) {
              return
            }
            console.error("[chatwoot] Error obteniendo mensajes", error)
          }

          if (closed || request.signal.aborted) {
            return
          }

          await delay(MESSAGE_POLL_INTERVAL_MS)
        }
      }

      const pollLabels = async () => {
        while (!closed && !request.signal.aborted) {
          try {
            const payload = await fetchJson(conversationUrl, request.signal)
            const labels = extractLabels(payload)
            const hasHuman = labels.some((label) => label?.toLowerCase() === "humano")

            if (shouldEmitConversationLabels(labelState, hasHuman)) {
              enqueue("chatwoot_handoff", {
                conversationId,
                human: hasHuman,
                labels,
              })
            }
          } catch (error) {
            if (request.signal.aborted || closed) {
              return
            }
            console.error("[chatwoot] Error obteniendo etiquetas", error)
          }

          if (closed || request.signal.aborted) {
            return
          }

          await delay(LABEL_POLL_INTERVAL_MS)
        }
      }

      // kick off background polling loops
      pollMessages()
      pollLabels()

      keepAlive = setInterval(() => {
        enqueue("ping", { ts: Date.now() })
      }, PING_INTERVAL_MS)

      leaseTimer = setTimeout(() => {
        enqueue("drain", { conversationId })
        setTimeout(() => {
          cleanup()
        }, 250)
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
