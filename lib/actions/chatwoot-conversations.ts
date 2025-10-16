"use server"

import { connectToDatabase } from "../mongodb"

const escapeRegExp = (value: string) => value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

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
}: UpsertChatwootConversationParams) {
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

        const fallbackMatch = await conversationCollection.updateOne(fallbackFilter, {
          $set: baseUpdate,
        })

        if (fallbackMatch.matchedCount > 0) {
          return
        }
      }
    }

    await conversationCollection.updateOne(
      { agentId, chatwootConversationId },
      {
        $set: {
          ...baseUpdate,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    )
  } catch (error) {
    console.error("[chatwoot] No se pudo registrar la conversación en DB", error)
  }
}
