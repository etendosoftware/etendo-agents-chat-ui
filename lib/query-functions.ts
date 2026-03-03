import { fetchConversations } from './actions/conversations'
import { fetchMessages } from './actions/fetchMessages'

const MESSAGES_QUERY_TIMEOUT_MS = 12000

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error(`messages_query_timeout_${timeoutMs}`))
    }, timeoutMs)

    promise
      .then((result) => {
        globalThis.clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        globalThis.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export async function fetchConversationList(
  agentId: string,
  options: { searchTerm?: string; page?: number; limit?: number } = {},
) {
  return fetchConversations(agentId, options)
}

export async function fetchMessagesForConversation(
  conversationId: string,
  agentId: string,
  chatwootInboxIdentifier?: string | null,
) {
  return withTimeout(
    fetchMessages(conversationId, agentId, chatwootInboxIdentifier),
    MESSAGES_QUERY_TIMEOUT_MS,
  )
}

export async function fetchLinkPreviewData(url: string) {
  const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch preview')
  }
  return response.json() as Promise<{
    title?: string
    description?: string
    image?: string
  }>
}
