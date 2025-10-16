import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { broadcastConversationEvent } from "@/lib/chatwootEvents"

const CHATWOOT_WEBHOOK_TOKEN = process.env.CHATWOOT_WEBHOOK_TOKEN

const conversationLabelsCache = new Map<string, Set<string>>()

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function timingSafeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)

  if (bufferA.length !== bufferB.length) {
    return false
  }

  return crypto.timingSafeEqual(bufferA, bufferB)
}

function verifySignature(rawBody: string, signatureHeader: string | null) {
  if (!CHATWOOT_WEBHOOK_TOKEN) {
    return true
  }

  if (!signatureHeader) {
    console.warn("[chatwoot] Webhook sin firma")
    return false
  }

  try {
    const digest = crypto
      .createHmac("sha256", CHATWOOT_WEBHOOK_TOKEN)
      .update(rawBody)
      .digest("hex")

    return timingSafeEqual(digest, signatureHeader)
  } catch (error) {
    console.error("[chatwoot] Error verificando firma", error)
    return false
  }
}

function extractMessage(payload: any) {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const candidates = [
    payload.message,
    payload.payload?.message,
    payload.data?.message,
    payload.payload,
    payload.data,
    payload.conversation?.messages?.[0],
    payload.payload?.conversation?.messages?.[0],
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const hasConversation =
        candidate.conversation_id !== undefined ||
        candidate.conversation?.id !== undefined
      const hasContent =
        candidate.content !== undefined ||
        candidate.attachments !== undefined

      if (hasConversation || hasContent) {
        return candidate
      }
    }
  }

  return null
}

function extractConversation(payload: any, message: any) {
  const candidates = [
    payload?.conversation,
    payload?.payload?.conversation,
    payload?.data?.conversation,
    message?.conversation,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate
    }
  }

  return null
}

function resolveConversationId(payload: any, message: any, conversation: any) {
  const ids = [
    message?.conversation_id,
    message?.conversation?.id,
    conversation?.id,
    payload?.conversation?.id,
    payload?.payload?.conversation?.id,
    payload?.conversation_id,
    payload?.payload?.conversation_id,
  ]

  for (const id of ids) {
    if (id === null || id === undefined) {
      continue
    }
    return String(id)
  }

  return null
}

function isOutgoingMessage(message: any) {
  const type = message?.message_type
  if (typeof type === "string") {
    return type.toLowerCase() === "outgoing"
  }

  if (typeof type === "number") {
    return type === 1
  }

  return false
}

function toLabelSet(labels: any): Set<string> {
  const set = new Set<string>()
  if (Array.isArray(labels)) {
    labels.forEach((label) => {
      if (typeof label === "string" && label.trim()) {
        set.add(label.trim().toLowerCase())
      }
    })
  }
  return set
}

function updateConversationLabels(conversationId: string, labels: any) {
  const nextSet = toLabelSet(labels)
  const prevSet = conversationLabelsCache.get(conversationId)
  const prevHasHuman = prevSet ? prevSet.has("humano") : null
  const nextHasHuman = nextSet.has("humano")

  conversationLabelsCache.set(conversationId, nextSet)

  const shouldBroadcast =
    (prevSet === undefined && nextHasHuman) ||
    (prevSet !== undefined && prevHasHuman !== nextHasHuman)

  if (!shouldBroadcast) {
    return
  }

  broadcastConversationEvent(conversationId, "chatwoot_handoff", {
    conversationId,
    human: nextHasHuman,
    labels: Array.from(nextSet),
  })
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-chatwoot-signature")

    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
    }

    if (!rawBody) {
      return NextResponse.json({ ok: true })
    }

    const payload = JSON.parse(rawBody)
    const eventType: string = payload?.event ?? payload?.event_name ?? payload?.type ?? "unknown"

    const message = extractMessage(payload)
    const conversation = extractConversation(payload, message)
    const conversationId = resolveConversationId(payload, message, conversation)

    if (!conversationId) {
      console.warn("[chatwoot] Webhook sin conversationId", payload)
      return NextResponse.json({ ok: true })
    }

    if (conversation?.labels !== undefined) {
      try {
        updateConversationLabels(conversationId, conversation.labels)
      } catch (error) {
        console.error("[chatwoot] Error actualizando etiquetas", error)
      }
    }

    if (!message) {
      return NextResponse.json({ ok: true })
    }

    const privateMessage = Boolean(message?.private)
    const outgoing = isOutgoingMessage(message)

    if (!outgoing || privateMessage) {
      return NextResponse.json({ ok: true })
    }

    const broadcastPayload = {
      event: eventType,
      conversationId,
      message,
    }

    const listeners = broadcastConversationEvent(
      conversationId,
      "chatwoot_message",
      broadcastPayload,
    )

    return NextResponse.json({ forwarded: true, listeners })
  } catch (error) {
    console.error("[chatwoot] Error procesando webhook", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
