import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ConversationHistoryContent } from '../components/conversation-history-content-logic'
import { SidebarProvider } from '../components/ui/sidebar'

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
    render(<SidebarProvider>{ui}</SidebarProvider>)

  it('adds "New chat" shortcut when no active conversation', async () => {
    fetchConversationsMock.mockResolvedValueOnce([])

    renderWithProvider(
      <ConversationHistoryContent initialConversations={[]} agentPath="support" agentId="agent-1" />,
    )

    expect(await screen.findByText('New Chat')).toBeInTheDocument()
  })

  it('loads additional pages when clicking Load More', async () => {
    const initial = Array.from({ length: 10 }, (_, index) => buildConversation(`conv-${index}`, `Conversation ${index}`))
    fetchConversationsMock
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce([buildConversation('conv-extra', 'Extra conversation')])

    renderWithProvider(
      <ConversationHistoryContent
        initialConversations={initial}
        agentPath="support"
        agentId="agent-1"
      />,
    )

    const loadMoreButton = await screen.findByRole('button', { name: /load more/i })
    fireEvent.click(loadMoreButton)

    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledWith('agent-1', { searchTerm: '', page: 2, limit: 10 }))
    expect(await screen.findByText('Extra conversation')).toBeInTheDocument()
  })

  it('deletes conversation and navigates away when active conversation removed', async () => {
    const activeConversation = buildConversation('conv-1', 'Active conversation')
    fetchConversationsMock.mockResolvedValueOnce([activeConversation])
    deleteConversationMock.mockResolvedValue({ success: true })

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

    const deleteOption = await screen.findByText(/delete/i)
    fireEvent.click(deleteOption)

    const continueButton = await screen.findByRole('button', { name: /continue/i })
    fireEvent.click(continueButton)

    await waitFor(() => expect(deleteConversationMock).toHaveBeenCalledWith('conv-1'))
    expect(pushMock).toHaveBeenCalledWith('/chat/support')
  })
})
