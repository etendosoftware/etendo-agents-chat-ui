import { vi, describe, it, expect, beforeEach } from 'vitest'

const getConversationHistoryMock = vi.fn()
const createClientMock = vi.fn()

vi.mock('../lib/actions/chat', async (importOriginal) => {
  const actual = await importOriginal()
  return Object.assign({}, actual, {
    getConversationHistory: getConversationHistoryMock,
  })
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

describe('fetchConversations action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty list when user is unauthenticated', async () => {
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })

    const { fetchConversations } = await import('../lib/actions/conversations')
    const result = await fetchConversations('agent-1')

    expect(result).toEqual([])
    expect(getConversationHistoryMock).not.toHaveBeenCalled()
  })

  it('delegates to getConversationHistory for authenticated users', async () => {
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'demo@example.com' } } }),
      },
    })
    getConversationHistoryMock.mockResolvedValue([
      { _id: '1', conversationTitle: 'Hola', email: 'demo@example.com', sessionId: 'sess', createdAt: new Date(), updatedAt: new Date() },
    ])

    const { fetchConversations } = await import('../lib/actions/conversations')
    const result = await fetchConversations('agent-1', { searchTerm: 'hola', page: 2 })

    expect(getConversationHistoryMock).toHaveBeenCalledWith('demo@example.com', 'agent-1', { searchTerm: 'hola', page: 2 })
    expect(result).toHaveLength(1)
  })
})
