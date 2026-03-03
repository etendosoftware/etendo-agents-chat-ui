import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.hoisted(() => vi.fn())
const findOneMock = vi.hoisted(() => vi.fn())
const connectToDatabaseMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
    },
  }),
}))

vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: connectToDatabaseMock,
}))

describe('getSingleConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    connectToDatabaseMock.mockResolvedValue({
      db: {
        collection: () => ({
          findOne: findOneMock,
        }),
      },
    })
  })

  it('returns null when user is unauthenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')

    const result = await getSingleConversation('507f1f77bcf86cd799439011')

    expect(result).toBeNull()
    expect(findOneMock).not.toHaveBeenCalled()
  })

  it('returns null for invalid object id', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')

    const result = await getSingleConversation('invalid-id')

    expect(result).toBeNull()
    expect(findOneMock).not.toHaveBeenCalled()
  })

  it('returns normalized conversation with fallback title from first human message', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    const now = new Date('2026-01-01T00:00:00Z')
    findOneMock.mockResolvedValue({
      _id: { toHexString: () => '507f1f77bcf86cd799439011' },
      sessionId: 'session-1',
      email: 'demo@example.com',
      conversationTitle: '',
      messages: [
        { type: 'human', data: { content: 'Need support with my order urgently please' } },
      ],
      createdAt: now,
      updatedAt: now,
    })

    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')
    const result = await getSingleConversation('507f1f77bcf86cd799439011')

    expect(result).toEqual({
      _id: '507f1f77bcf86cd799439011',
      sessionId: 'session-1',
      email: 'demo@example.com',
      conversationTitle: 'Need support with my order urgently please',
      createdAt: now,
      updatedAt: now,
    })
  })

  it('returns null when conversation is not found for user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    findOneMock.mockResolvedValue(null)
    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')

    const result = await getSingleConversation('507f1f77bcf86cd799439011')

    expect(result).toBeNull()
  })

  it('returns DEFAULT_CHAT_TITLE when there are no human messages', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    const now = new Date()
    findOneMock.mockResolvedValue({
      _id: { toHexString: () => '507f1f77bcf86cd799439020' },
      sessionId: 's1',
      email: 'demo@example.com',
      conversationTitle: '',
      messages: [{ type: 'ai', data: { content: 'Hello!' } }],
      createdAt: now,
      updatedAt: now,
    })

    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')
    const result = await getSingleConversation('507f1f77bcf86cd799439020')

    expect(result?.conversationTitle).toBe('New Chat')
  })

  it('does not add ellipsis when first human message is exactly 50 chars', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    const exactContent = 'B'.repeat(50)
    findOneMock.mockResolvedValue({
      _id: { toHexString: () => '507f1f77bcf86cd799439021' },
      sessionId: 's1',
      email: 'demo@example.com',
      conversationTitle: '',
      messages: [{ type: 'human', data: { content: exactContent } }],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')
    const result = await getSingleConversation('507f1f77bcf86cd799439021')

    expect(result?.conversationTitle).toBe(exactContent)
  })

  it('truncates title at 50 chars and appends ellipsis for longer messages', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    const longContent = 'A'.repeat(51)
    findOneMock.mockResolvedValue({
      _id: { toHexString: () => '507f1f77bcf86cd799439022' },
      sessionId: 's1',
      email: 'demo@example.com',
      conversationTitle: '',
      messages: [{ type: 'human', data: { content: longContent } }],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')
    const result = await getSingleConversation('507f1f77bcf86cd799439022')

    expect(result?.conversationTitle).toBe('A'.repeat(50) + '...')
  })

  it('returns null when MongoDB throws', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    connectToDatabaseMock.mockRejectedValue(new Error('db connection failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')
    const result = await getSingleConversation('507f1f77bcf86cd799439023')

    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('uses stored conversationTitle when it is already set', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    findOneMock.mockResolvedValue({
      _id: { toHexString: () => '507f1f77bcf86cd799439024' },
      sessionId: 's1',
      email: 'demo@example.com',
      conversationTitle: 'My saved title',
      messages: [{ type: 'human', data: { content: 'First message' } }],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { getSingleConversation } = await import('../lib/actions/getSingleConversation')
    const result = await getSingleConversation('507f1f77bcf86cd799439024')

    expect(result?.conversationTitle).toBe('My saved title')
  })
})
