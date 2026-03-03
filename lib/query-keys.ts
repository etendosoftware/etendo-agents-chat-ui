export const queryKeys = {
  conversations: {
    all: (agentId: string) => ['conversations', agentId] as const,
    list: (agentId: string, searchTerm: string) =>
      ['conversations', agentId, 'list', searchTerm] as const,
  },
  messages: {
    byConversation: (
      conversationId: string,
      agentId: string,
      chatwootInboxIdentifier?: string | null,
    ) =>
      [
        'messages',
        conversationId,
        agentId,
        chatwootInboxIdentifier ?? null,
      ] as const,
  },
  linkPreview: {
    byUrl: (url: string) => ['linkPreview', url] as const,
  },
} as const
