"use server"

import { connectToDatabase } from "../mongodb"
import { escapeRegExp } from "@/lib/utils/escape-regexp";

interface UpsertChatwootConversationParams {
  email: string
  agentId: string
  chatwootConversationId: string
  sessionId: string | null
}

export async function upsertChatwootConversation({
  email,
  agentId,
  chatwootConversationId,
  sessionId,
}: UpsertChatwootConversationParams): Promise<string | null> {
  try {
    const { db } = await connectToDatabase()
    const now = new Date()
    const trimmedEmail = (email ?? "").trim()
    const emailRegex = trimmedEmail ? new RegExp(`^${escapeRegExp(trimmedEmail)}$`, 'i') : null

    const conversationCollection = db.collection("conversations")

    const baseUpdate = {
      email: trimmedEmail || null,
      agentId,
      chatwootConversationId,
      sessionId,
      updatedAt: now,
    }

    if (trimmedEmail || sessionId) {
      const conditions: any[] = []
      if (emailRegex) {
        conditions.push({ email: emailRegex })
      }
      if (sessionId) {
        conditions.push({ sessionId })
      }

      if (conditions.length > 0) {
        const fallbackFilter: Record<string, unknown> = {
          agentId,
          $and: [
            ...conditions,
            { $or: [{ chatwootConversationId: null }, { chatwootConversationId: { $exists: false } }] },
          ],
        }

        const fallbackMatch = await conversationCollection.findOneAndUpdate(
          fallbackFilter,
          { $set: baseUpdate },
          { returnDocument: 'after' },
        )

        if (fallbackMatch) {
          return fallbackMatch._id.toHexString()
        }
      }
    }

    const result = await conversationCollection.findOneAndUpdate(
      { agentId, chatwootConversationId },
      {
        $set: {
          ...baseUpdate,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )

    return result?._id?.toHexString() ?? null
  } catch (error) {
    console.error("[chatwoot] No se pudo registrar la conversación en DB", error)
    return null
  }
}
