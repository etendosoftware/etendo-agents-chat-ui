'use server'

import { createClient } from '@/lib/supabase/server'
import { getConversationMetadata, getMessagesForConversation } from './chat'
import { fetchChatwootConversationMessages } from '@/lib/chatwoot/api'

export interface TransformedMessage {
  id: string
  content: string
  sender: 'user' | 'agent'
  timestamp: Date
  agentId: string
  conversationId?: string
  attachments?: Array<{
    name: string
    type: string
    url: string
    size: number
  }>
  audioUrl?: string
}

export interface FetchMessagesResult {
  messages: TransformedMessage[]
  sessionId: string | null
  chatwootConversationId: string | null
}

function dedupeMessagesById(messages: TransformedMessage[]): TransformedMessage[] {
  return Array.from(new Map(messages.map((message) => [message.id, message])).values())
}

function transformMongoMessages(
  rawMessages: Array<{ type: 'human' | 'ai'; data: { content: string } }>,
  conversationId: string,
  agentId: string,
): TransformedMessage[] {
  return rawMessages.map((message, index) => ({
    id: `${conversationId}-${index}`,
    content: message.data.content,
    sender: message.type === 'human' ? ('user' as const) : ('agent' as const),
    timestamp: new Date(),
    agentId,
    conversationId,
  }))
}

export async function fetchMessages(
  conversationId: string,
  agentId: string,
  chatwootInboxIdentifier?: string | null,
): Promise<FetchMessagesResult> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { messages: [], sessionId: null, chatwootConversationId: null }
  }

  if (chatwootInboxIdentifier && conversationId) {
    const { sessionId, chatwootConversationId } = await getConversationMetadata(
      conversationId,
      user.email!,
    )

    // Legacy or partially-migrated conversations may not have a mapped
    // Chatwoot conversation ID. In that case, fall back to DB messages.
    if (!chatwootConversationId) {
      const fallback = await getMessagesForConversation(conversationId, user.email!)
      return {
        messages: transformMongoMessages(fallback.messages, conversationId, agentId),
        sessionId: sessionId ?? fallback.sessionId,
        chatwootConversationId: fallback.chatwootConversationId,
      }
    }

    const effectiveChatwootId = chatwootConversationId
    const chatwootMessages =
      await fetchChatwootConversationMessages(effectiveChatwootId)

    let transformedMessages: TransformedMessage[] = []

    if (chatwootMessages.length > 0) {
      transformedMessages = chatwootMessages
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((message) => ({
          id: `${effectiveChatwootId}-${message.id}`,
          content: message.content,
          sender: message.sender,
          timestamp: message.createdAt,
          agentId,
          conversationId,
          attachments:
            message.attachments.length > 0
              ? message.attachments.map((attachment) => ({
                  name: attachment.name,
                  type: attachment.type,
                  url: attachment.url,
                  size: attachment.size,
                }))
              : undefined,
          audioUrl: message.audioUrl ?? undefined,
        }))

      transformedMessages = dedupeMessagesById(transformedMessages)
    }

    if (transformedMessages.length === 0) {
      const fallback = await getMessagesForConversation(conversationId, user.email!)
      const fallbackMessages = transformMongoMessages(
        fallback.messages,
        conversationId,
        agentId,
      )

      if (fallbackMessages.length > 0) {
        return {
          messages: fallbackMessages,
          sessionId: sessionId ?? fallback.sessionId,
          chatwootConversationId,
        }
      }
    }

    return { messages: transformedMessages, sessionId, chatwootConversationId }
  }

  const { messages: rawMessages, sessionId, chatwootConversationId } =
    await getMessagesForConversation(conversationId, user.email!)

  const transformedMessages: TransformedMessage[] = transformMongoMessages(
    rawMessages,
    conversationId,
    agentId,
  )

  return {
    messages: dedupeMessagesById(transformedMessages),
    sessionId,
    chatwootConversationId,
  }
}
