import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { ConversationHistoryContent } from '../components/conversation-history-content-logic'
import { SidebarProvider } from '../components/ui/sidebar'
import { renderWithIntl, createTranslator } from './utils/intl'

const fetchConversationsMock = vi.hoisted(() => vi.fn())
const getSingleConversationMock = vi.hoisted(() => vi.fn())
const deleteConversationMock = vi.hoisted(() => vi.fn())
const updateConversationTitleMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())
const pushMock = vi.fn()

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock('@/lib/actions/conversations', () => ({
  fetchConversations: fetchConversationsMock,
}))

vi.mock('@/lib/actions/getSingleConversation', () => ({
  getSingleConversation: getSingleConversationMock,
}))

vi.mock('@/lib/actions/deleteConversation', () => ({
  deleteConversation: deleteConversationMock,
}))

vi.mock('@/lib/actions/updateConversationTitle', () => ({
  updateConversationTitle: updateConversationTitleMock,
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
  beforeEach(() => {
    vi.clearAllMocks()
    pushMock.mockClear()

    if (!('matchMedia' in window)) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })
    }
  })

  const renderWithProvider = (ui: React.ReactNode) =>
    renderWithIntl(<SidebarProvider>{ui}</SidebarProvider>)

  it('adds "New chat" shortcut when no active conversation', async () => {
    fetchConversationsMock.mockResolvedValueOnce([])

    const tHistory = createTranslator('en', 'chat.history')

    renderWithProvider(
      <ConversationHistoryContent initialConversations={[]} agentPath="support" agentId="agent-1" />,
    )

    expect(await screen.findByText(tHistory('newChat'))).toBeInTheDocument()
  })

  it('navigates with a unique query param when starting another new chat', async () => {
    fetchConversationsMock.mockResolvedValueOnce([])
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1720000000000)

    try {
      const tHistory = createTranslator('en', 'chat.history')

      renderWithProvider(
        <ConversationHistoryContent initialConversations={[]} agentPath="support" agentId="agent-1" />,
      )

      const newChatButtons = await screen.findAllByRole('button', { name: new RegExp(tHistory('newChat'), 'i') })
      fireEvent.click(newChatButtons[0])

      expect(pushMock).toHaveBeenCalledWith('/en/chat/support?newChat=1720000000000')
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('loads additional pages when clicking Load More', async () => {
    const initial = Array.from({ length: 10 }, (_, index) => buildConversation(`conv-${index}`, `Conversation ${index}`))
    fetchConversationsMock
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce([buildConversation('conv-extra', 'Extra conversation')])

    const tHistory = createTranslator('en', 'chat.history')

    renderWithProvider(
      <ConversationHistoryContent
        initialConversations={initial}
        agentPath="support"
        agentId="agent-1"
      />,
    )

    const loadMoreButton = await screen.findByRole('button', { name: new RegExp(tHistory('loadMore'), 'i') })
    fireEvent.click(loadMoreButton)

    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledWith('agent-1', { searchTerm: '', page: 2, limit: 10 }))
    expect(await screen.findByText('Extra conversation')).toBeInTheDocument()
  })

  it('deletes conversation and navigates away when active conversation removed', async () => {
    const activeConversation = buildConversation('conv-1', 'Active conversation')
    fetchConversationsMock.mockResolvedValueOnce([activeConversation])
    deleteConversationMock.mockResolvedValue({ success: true })

    const tHistory = createTranslator('en', 'chat.history')

    renderWithProvider(
      <ConversationHistoryContent
        initialConversations={[activeConversation]}
        agentPath="support"
        agentId="agent-1"
        activeConversationId="conv-1"
      />,
    )

    // Open contextual menu
    const menuButton = (await screen.findAllByRole('button')).find(button => button.className.includes('h-7'))
    expect(menuButton).toBeDefined()
    fireEvent.click(menuButton as HTMLButtonElement)

    const deleteOption = await screen.findByText(tHistory('delete'))
    fireEvent.click(deleteOption)

    const continueButton = await screen.findByRole('button', { name: tHistory('deleteDialog.continue') })
    fireEvent.click(continueButton)

    await waitFor(() => expect(deleteConversationMock).toHaveBeenCalledWith('conv-1'))
    expect(pushMock).toHaveBeenCalledWith('/en/chat/support')
  })
})
