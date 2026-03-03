import "server-only"

const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN
const CHATWOOT_MESSAGES_TIMEOUT_MS = 8000

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

interface RawChatwootAttachment {
  id?: number | string
  data_url?: string
  file_url?: string
  url?: string
  download_url?: string
  thumb_url?: string
  file_type?: string
  content_type?: string
  file_size?: number
  byte_size?: number
  name?: string
  filename?: string
}

interface RawChatwootMessage {
  id?: number | string
  message_id?: number | string
  content?: string | null
  private?: boolean
  message_type?: number | string
  created_at?: string | number | null
  created_at_i?: number | null
  inbox_id?: number | null
  sender?: any
  content_attributes?: any
  attachments?: RawChatwootAttachment[]
}

export interface NormalizedChatwootMessage {
  id: string
  content: string
  sender: "user" | "agent"
  createdAt: Date
  attachments: Array<{
    id: string
    name: string
    type: string
    size: number
    url: string
  }>
  audioUrl: string | null
}

export async function fetchChatwootConversationMessages(
  conversationId: string,
): Promise<NormalizedChatwootMessage[]> {
  if (!CHATWOOT_BASE_URL || !CHATWOOT_ACCOUNT_ID || !CHATWOOT_API_TOKEN) {
    console.warn("[chatwoot] Credenciales faltantes para obtener mensajes")
    return []
  }

  const trimmedConversationId = conversationId.trim()
  if (!trimmedConversationId) {
    return []
  }

  const base = CHATWOOT_BASE_URL.replace(/\/$/, "")
  const baseUrl = `${base}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${trimmedConversationId}/messages`

  const MAX_PAGES = 5
  const PAGE_SIZE = 20
  let allRawMessages: RawChatwootMessage[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${baseUrl}?page=${page}`

    let response: Response
    try {
      response = await fetchWithTimeout(
        url,
        {
          headers: {
            "Content-Type": "application/json",
            "api_access_token": CHATWOOT_API_TOKEN,
          },
          cache: "no-store",
        },
        CHATWOOT_MESSAGES_TIMEOUT_MS,
      )
    } catch (error) {
      const isAbortError = error instanceof Error && error.name === "AbortError"
      if (isAbortError) {
        console.warn(
          `[chatwoot] Timeout al obtener mensajes para ${trimmedConversationId} página ${page} (${CHATWOOT_MESSAGES_TIMEOUT_MS}ms)`,
        )
      } else {
        console.error("[chatwoot] Error de red al obtener mensajes (server):", error)
      }
      break
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => null)
      console.error("[chatwoot] Error al obtener mensajes (server):", response.status, errorText)
      break
    }

    const data = await response.json().catch(() => null)

    let rawMessages: RawChatwootMessage[] = []
    if (Array.isArray(data)) {
      rawMessages = data
    } else if (Array.isArray(data?.payload)) {
      rawMessages = data.payload
    } else if (Array.isArray(data?.data)) {
      rawMessages = data.data
    }

    if (!rawMessages || rawMessages.length === 0) {
      break
    }

    allRawMessages = allRawMessages.concat(rawMessages)

    if (rawMessages.length < PAGE_SIZE) {
      break
    }
  }

  if (allRawMessages.length === 0) {
    return []
  }

  return allRawMessages
    .map<NormalizedChatwootMessage | null>((item) => {
      const rawId = item?.id ?? item?.message_id ?? item?.created_at
      const messageId = rawId !== undefined && rawId !== null ? String(rawId) : undefined
      if (!messageId) {
        return null
      }

      const rawType = item?.message_type
      const stringType = typeof rawType === "string" ? rawType.toLowerCase() : null
      const numericType = typeof rawType === "number" ? rawType : null

      const isAgent =
        stringType === "outgoing" ||
        numericType === 1

      const isUser =
        stringType === "incoming" ||
        numericType === 0

      const isActivity =
        stringType === "activity" ||
        numericType === 2 ||
        Boolean(item?.content_attributes?.event)

      const senderType = item?.sender?.type
      const isSystemSender = typeof senderType === "string" && senderType.toLowerCase() === "system"

      if (item?.private) {
        return null
      }

      if (isActivity || isSystemSender || (!isAgent && !isUser)) {
        return null
      }

      const sender: "user" | "agent" = isAgent ? "agent" : "user"

      const attachments: NormalizedChatwootMessage["attachments"] = []
      let audioUrl: string | null = null

      if (Array.isArray(item?.attachments)) {
        item.attachments.forEach((attachment, index) => {
          const rawUrl =
            attachment?.data_url ??
            attachment?.file_url ??
            attachment?.download_url ??
            attachment?.url ??
            null

          if (!rawUrl) {
            return
          }

          const type = attachment?.file_type ?? attachment?.content_type ?? ""
          const size = Number(attachment?.file_size ?? attachment?.byte_size ?? 0)
          const name = attachment?.filename ?? attachment?.name ?? `attachment-${index + 1}`

          attachments.push({
            id: attachment?.id !== undefined ? String(attachment.id) : `${messageId}-attachment-${index + 1}`,
            name,
            type,
            size: Number.isFinite(size) ? size : 0,
            url: rawUrl,
          })

          if (!audioUrl && typeof type === "string" && type.toLowerCase().startsWith("audio")) {
            audioUrl = rawUrl
          }
        })
      }

      let createdAt = new Date()
      const createdRaw = item?.created_at ?? item?.created_at_i
      if (typeof createdRaw === "number") {
        const timestamp = createdRaw > 9999999999 ? createdRaw : createdRaw * 1000
        createdAt = new Date(timestamp)
      } else if (typeof createdRaw === "string") {
        const parsed = Date.parse(createdRaw)
        if (!Number.isNaN(parsed)) {
          createdAt = new Date(parsed)
        }
      }

      return {
        id: messageId,
        content: item?.content ?? "",
        sender,
        createdAt,
        attachments,
        audioUrl,
      }
    })
    .filter((msg): msg is NormalizedChatwootMessage => Boolean(msg))
}
