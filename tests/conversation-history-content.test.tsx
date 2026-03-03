import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'

import { ConversationHistoryContent } from '../components/conversation-history-content-logic'
import { SidebarProvider } from '../components/ui/sidebar'
import { renderWithIntl, createTranslator } from './utils/intl'

const fetchNextPageMock = vi.hoisted(() => vi.fn())
const mutateDeleteMock = vi.hoisted(() => vi.fn())
const mutateUpdateMock = vi.hoisted(() => vi.fn())
const prefetchMessagesMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())
const navigateToConversationMock = vi.hoisted(() => vi.fn())
const navigateToNewChatMock = vi.hoisted(() => vi.fn())

const useConversationsInfiniteMock = vi.hoisted(() => vi.fn())
const useDeleteConversationMock = vi.hoisted(() => vi.fn())
const useUpdateConversationTitleMock = vi.hoisted(() => vi.fn())

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock('@/lib/chat-context', () => ({
  useChatContext: () => ({
    navigateToConversation: navigateToConversationMock,
    navigateToNewChat: navigateToNewChatMock,
  }),
}))

vi.mock('@/hooks/use-messages', () => ({
  usePrefetchMessages: () => prefetchMessagesMock,
}))

vi.mock('@/hooks/use-conversations', () => ({
  useConversationsInfinite: (...args: unknown[]) => useConversationsInfiniteMock(...args),
  useDeleteConversation: (...args: unknown[]) => useDeleteConversationMock(...args),
  useUpdateConversationTitle: (...args: unknown[]) => useUpdateConversationTitleMock(...args),
}))

const buildConversation = (id: string, title: string): any => ({
  _id: id,
  conversationTitle: title,
  agentId: 'agent-1',
  sessionId: `session-${id}`,
  email: 'demo@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('ConversationHistoryContent', () => {
  const renderWithProvider = (ui: React.ReactNode) =>
    renderWithIntl(<SidebarProvider>{ui}</SidebarProvider>)

  beforeEach(() => {
    vi.clearAllMocks()

    useConversationsInfiniteMock.mockReturnValue({
      data: {
        pages: [[buildConversation('conv-1', 'Active conversation')]],
      },
      fetchNextPage: fetchNextPageMock,
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      isFetching: false,
    })

    useDeleteConversationMock.mockReturnValue({
      mutate: mutateDeleteMock,
      isPending: false,
    })

    useUpdateConversationTitleMock.mockReturnValue({
      mutate: mutateUpdateMock,
      isPending: false,
    })
  })

  it('renders New chat shortcut when no active conversation', async () => {
    const tHistory = createTranslator('en', 'chat.history')

    renderWithProvider(
      <ConversationHistoryContent initialConversations={[]} agentPath="support" agentId="agent-1" />,
    )

    const newChatButtons = await screen.findAllByRole('button', {
      name: new RegExp(tHistory('newChat'), 'i'),
    })

    expect(newChatButtons.length).toBeGreaterThan(0)
  })

  it('navigates to new chat on shortcut click', async () => {
    const tHistory = createTranslator('en', 'chat.history')

    renderWithProvider(
      <ConversationHistoryContent initialConversations={[]} agentPath="support" agentId="agent-1" />,
    )

    const newChatButtons = await screen.findAllByRole('button', {
      name: new RegExp(tHistory('newChat'), 'i'),
    })
    fireEvent.click(newChatButtons[0])

    expect(navigateToNewChatMock).toHaveBeenCalledWith('support', 'en')
  })

  it('loads next page when clicking Load More', async () => {
    const initial = Array.from({ length: 10 }, (_, index) =>
      buildConversation(`conv-${index}`, `Conversation ${index}`),
    )

    useConversationsInfiniteMock.mockReturnValue({
      data: { pages: [initial] },
      fetchNextPage: fetchNextPageMock,
      hasNextPage: true,
      isFetchingNextPage: false,
      isLoading: false,
      isFetching: false,
    })

    const tHistory = createTranslator('en', 'chat.history')

    renderWithProvider(
      <ConversationHistoryContent
        initialConversations={initial}
        agentPath="support"
        agentId="agent-1"
      />,
    )

    const loadMoreButton = await screen.findByRole('button', {
      name: new RegExp(tHistory('loadMore'), 'i'),
    })
    fireEvent.click(loadMoreButton)

    expect(fetchNextPageMock).toHaveBeenCalled()
  })

  it('deletes active conversation and navigates to new chat', async () => {
    const activeConversation = buildConversation('conv-1', 'Active conversation')
    const tHistory = createTranslator('en', 'chat.history')

    mutateDeleteMock.mockImplementation(
      (_id: string, options?: { onSuccess?: (result: { success: boolean; error?: string }) => void }) => {
        options?.onSuccess?.({ success: true })
      },
    )

    renderWithProvider(
      <ConversationHistoryContent
        initialConversations={[activeConversation]}
        agentPath="support"
        agentId="agent-1"
        activeConversationId="conv-1"
      />,
    )

    const menuButtons = await screen.findAllByRole('button')
    const menuButton = menuButtons.find((button) =>
      (button.className || '').includes('h-7 w-7'),
    )
    expect(menuButton).toBeDefined()
    fireEvent.click(menuButton as HTMLButtonElement)

    fireEvent.click(await screen.findByText(tHistory('delete')))
    fireEvent.click(await screen.findByRole('button', { name: tHistory('deleteDialog.continue') }))

    await waitFor(() => expect(mutateDeleteMock).toHaveBeenCalled())
    expect(navigateToNewChatMock).toHaveBeenCalledWith('support', 'en')
  })
})
