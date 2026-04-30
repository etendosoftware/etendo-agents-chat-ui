import "server-only"
import { connectToDatabase } from "../mongodb"

export interface StoredChatwootMessage {
  id: string
  content: string
  messageType: string
  createdAt: Date
  sender: Record<string, unknown> | null
  attachments: unknown[]
}

function parseTimestamp(raw: unknown): Date {
  if (typeof raw === "number") {
    return new Date(raw > 9_999_999_999 ? raw : raw * 1000)
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw)
    if (!Number.isNaN(parsed)) return new Date(parsed)
  }
  return new Date()
}

export async function saveChatwootWebhookEvent(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== "object") return

  const p = payload as Record<string, unknown>
  const event = p.event

  if (event === "message_created") {
    if (Boolean(p.private)) return

    const messageType = p.message_type
    const isOutgoing =
      messageType === "outgoing" ||
      messageType === 1
    if (!isOutgoing) return

    const conversationId = String((p.conversation as Record<string, unknown>)?.id ?? "")
    if (!conversationId) return

    const message: StoredChatwootMessage = {
      id: String(p.id ?? ""),
      content: typeof p.content === "string" ? p.content : "",
      messageType: String(messageType),
      createdAt: parseTimestamp(p.created_at),
      sender: (p.sender as Record<string, unknown>) ?? null,
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
    }

    const { db } = await connectToDatabase()
    const result = await db.collection("conversations").findOneAndUpdate(
      { chatwootConversationId: conversationId },
      {
        $push: { chatwootMessages: message } as Record<string, unknown>,
        $set: { updatedAt: new Date() },
      },
      { upsert: false },
    )
    return
  }

  if (event === "conversation_updated") {
    const conversationId = String(p.id ?? "")
    if (!conversationId) return

    const labels = Array.isArray(p.labels) ? (p.labels as string[]) : []

    const { db } = await connectToDatabase()
    await db.collection("conversations").findOneAndUpdate(
      { chatwootConversationId: conversationId },
      {
        $set: {
          chatwootLabels: labels,
          chatwootLabelsUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: false },
    )
  }
}

export async function getChatwootPendingMessages(
  chatwootConversationId: string,
): Promise<StoredChatwootMessage[]> {
  const { db } = await connectToDatabase()
  const doc = await db
    .collection("conversations")
    .findOne(
      { chatwootConversationId },
      { projection: { chatwootMessages: 1 } },
    )

  return Array.isArray(doc?.chatwootMessages) ? doc.chatwootMessages : []
}

export async function getChatwootLabelState(
  chatwootConversationId: string,
): Promise<{ labels: string[]; hasHuman: boolean } | null> {
  const { db } = await connectToDatabase()
  const doc = await db
    .collection("conversations")
    .findOne(
      { chatwootConversationId },
      { projection: { chatwootLabels: 1 } },
    )

  if (!doc) return null

  const labels: string[] = Array.isArray(doc.chatwootLabels) ? doc.chatwootLabels : []
  return {
    labels,
    hasHuman: labels.some((l) => l.toLowerCase() === "humano"),
  }
}
