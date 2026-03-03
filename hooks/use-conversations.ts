'use client'

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { fetchConversationList } from '@/lib/query-functions'
import { deleteConversation } from '@/lib/actions/deleteConversation'
import { updateConversationTitle } from '@/lib/actions/updateConversationTitle'
import type { Conversation } from '@/lib/actions/chat'

export function useConversationsInfinite(
  agentId: string,
  searchTerm: string,
  initialData?: Conversation[],
) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations.list(agentId, searchTerm),
    queryFn: ({ pageParam }) =>
      fetchConversationList(agentId, {
        searchTerm,
        page: pageParam as number,
        limit: 10,
      }),
    getNextPageParam: (lastPage: Conversation[], allPages: Conversation[][]) =>
      lastPage.length === 10 ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
    initialData:
      initialData !== undefined && !searchTerm
        ? {
            pages: [initialData],
            pageParams: [1],
          }
        : undefined,
  })
}

export function useDeleteConversation(agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onMutate: async (conversationId: string) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.conversations.all(agentId),
      })
      const previousData = queryClient.getQueriesData<{
        pages: Conversation[][]
        pageParams: number[]
      }>({ queryKey: queryKeys.conversations.all(agentId) })

      queryClient.setQueriesData(
        { queryKey: queryKeys.conversations.all(agentId) },
        (old: any) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page: Conversation[]) =>
              page.filter((c) => c._id !== conversationId),
            ),
          }
        },
      )

      return { previousData }
    },
    onError: (_err: unknown, _vars: unknown, context: any) => {
      if (context?.previousData) {
        context.previousData.forEach(
          ([queryKey, data]: [readonly unknown[], unknown]) => {
            queryClient.setQueryData(queryKey, data)
          },
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all(agentId),
      })
    },
  })
}

export function useUpdateConversationTitle(agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateConversationTitle(id, title),
    onMutate: async ({ id, title }: { id: string; title: string }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.conversations.all(agentId),
      })
      const previousData = queryClient.getQueriesData<{
        pages: Conversation[][]
        pageParams: number[]
      }>({ queryKey: queryKeys.conversations.all(agentId) })

      queryClient.setQueriesData(
        { queryKey: queryKeys.conversations.all(agentId) },
        (old: any) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page: Conversation[]) =>
              page.map((c) =>
                c._id === id ? { ...c, conversationTitle: title } : c,
              ),
            ),
          }
        },
      )

      return { previousData }
    },
    onError: (_err: unknown, _vars: unknown, context: any) => {
      if (context?.previousData) {
        context.previousData.forEach(
          ([queryKey, data]: [readonly unknown[], unknown]) => {
            queryClient.setQueryData(queryKey, data)
          },
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all(agentId),
      })
    },
  })
}
