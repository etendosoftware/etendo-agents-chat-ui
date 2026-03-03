'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { fetchMessagesForConversation } from '@/lib/query-functions'
import type { FetchMessagesResult } from '@/lib/actions/fetchMessages'

export function useMessages(
  conversationId: string | undefined,
  agentId: string,
  chatwootInboxIdentifier?: string | null,
  initialData?: FetchMessagesResult,
) {
  const isDraftConversation = Boolean(conversationId?.startsWith('draft:'))

  return useQuery({
    queryKey: queryKeys.messages.byConversation(
      conversationId ?? '',
      agentId,
      chatwootInboxIdentifier,
    ),
    queryFn: () =>
      fetchMessagesForConversation(
        conversationId!,
        agentId,
        chatwootInboxIdentifier,
      ),
    enabled: Boolean(conversationId) && !isDraftConversation,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: !chatwootInboxIdentifier,
    initialData: conversationId && initialData ? initialData : undefined,
  })
}

export function usePrefetchMessages() {
  const queryClient = useQueryClient()

  return (
    conversationId: string,
    agentId: string,
    chatwootInboxIdentifier?: string | null,
  ) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.messages.byConversation(
        conversationId,
        agentId,
        chatwootInboxIdentifier,
      ),
      queryFn: () =>
        fetchMessagesForConversation(
          conversationId,
          agentId,
          chatwootInboxIdentifier,
        ),
      staleTime: 5 * 60 * 1000,
    })
  }
}
