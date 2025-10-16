import { vi, describe, it, expect, beforeEach } from 'vitest'

import { getConversationHistory, getMessagesForConversation } from '../lib/actions/chat'

const connectToDatabaseMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/mongodb', () => ({
  connectToDatabase: connectToDatabaseMock,
}))

describe('chat actions', () => {
  const findMock = vi.fn()
  const sortMock = vi.fn()
  const skipMock = vi.fn()
  const limitMock = vi.fn()
  const toArrayMock = vi.fn()
  const findOneMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    toArrayMock.mockResolvedValue([])

    limitMock.mockReturnValue({ toArray: toArrayMock })
    skipMock.mockReturnValue({ limit: limitMock })
    sortMock.mockReturnValue({ skip: skipMock })
    findMock.mockReturnValue({ sort: sortMock })
    findOneMock.mockResolvedValue(null)

    connectToDatabaseMock.mockResolvedValue({
      db: {
        collection: vi.fn().mockReturnValue({
          find: findMock,
          findOne: findOneMock,
        }),
      },
    })
  })

  it('returns normalized conversation history with fallback title', async () => {
    const now = new Date()
    toArrayMock.mockResolvedValue([
      {
        _id: { toHexString: () => 'abc123' },
        sessionId: 'session-1',
        email: 'demo@example.com',
        conversationTitle: '',
        createdAt: now,
        updatedAt: now,
        messages: [
          { type: 'human', data: { content: 'First message that is quite long' } },
        ],
      },
    ])

    const results = await getConversationHistory('demo@example.com', 'agent-1')

    expect(findMock).toHaveBeenCalledWith({
      agentId: 'agent-1',
      email: {
        $options: 'i',
        $regex: '^demo@example\\.com$',
      },
    })
    expect(sortMock).toHaveBeenCalledWith({ updatedAt: -1, _id: -1 })
    expect(skipMock).toHaveBeenCalledWith(0)
    expect(limitMock).toHaveBeenCalledWith(10)
    expect(results).toEqual([
      {
        _id: 'abc123',
        sessionId: 'session-1',
        email: 'demo@example.com',
        conversationTitle: 'First message that is quite long',
        createdAt: now,
        updatedAt: now,
      },
    ])
  })

  it('applies pagination and search filters when provided', async () => {
    toArrayMock.mockResolvedValue([])

    await getConversationHistory('demo@example.com', 'agent-1', { searchTerm: 'sales', page: 2, limit: 5 })

    expect(findMock).toHaveBeenCalledWith({
      agentId: 'agent-1',
      email: {
        $options: 'i',
        $regex: '^demo@example\\.com$',
      },
      conversationTitle: { $regex: 'sales', $options: 'i' },
    })
    expect(skipMock).toHaveBeenCalledWith(5)
    expect(limitMock).toHaveBeenCalledWith(5)
  })

  it('returns messages and session id for existing conversation', async () => {
    findOneMock.mockResolvedValue({
      messages: [{ type: 'ai', data: { content: 'Hello there' } }],
      sessionId: 'session-xyz',
      chatwootConversationId: '12345',
    })

    const result = await getMessagesForConversation('507f1f77bcf86cd799439011', 'demo@example.com')

    expect(findOneMock).toHaveBeenCalledWith({
      _id: expect.any(Object),
      email: {
        $options: 'i',
        $regex: '^demo@example\\.com$',
      },
    })
    expect(result).toEqual({
      messages: [{ type: 'ai', data: { content: 'Hello there' } }],
      sessionId: 'session-xyz',
      chatwootConversationId: '12345',
    })
  })

  it('handles missing conversations gracefully', async () => {
    findOneMock.mockResolvedValue(null)

    const result = await getMessagesForConversation('507f1f77bcf86cd799439012', 'demo@example.com')

    expect(result).toEqual({ messages: [], sessionId: null, chatwootConversationId: null })
  })

  it('skips email filter when user email is empty', async () => {
    await getConversationHistory('   ', 'agent-1')

    expect(findMock).toHaveBeenCalledWith({ agentId: 'agent-1' })
  })

  it('matches conversations by email ignoring case', async () => {
    findOneMock.mockResolvedValue({
      messages: [],
      sessionId: 'session-case',
      chatwootConversationId: null,
    })

    await getMessagesForConversation('507f1f77bcf86cd799439013', '  Demo@Example.COM  ')

    expect(findOneMock).toHaveBeenCalledWith({
      _id: expect.any(Object),
      email: {
        $regex: '^Demo@Example\\.COM$',
        $options: 'i',
      },
    })
  })

})
