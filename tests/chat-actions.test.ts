import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

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

    expect(findMock).toHaveBeenCalledWith(
      {
        agentId: 'agent-1',
        email: {
          $options: 'i',
          $regex: '^demo@example\\.com$',
        },
      },
      expect.objectContaining({
        projection: expect.objectContaining({
          messages: { $slice: 3 },
        }),
      }),
    )
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

    expect(findMock).toHaveBeenCalledWith(
      {
        agentId: 'agent-1',
        email: {
          $options: 'i',
          $regex: '^demo@example\\.com$',
        },
        conversationTitle: { $regex: 'sales', $options: 'i' },
      },
      expect.objectContaining({
        projection: expect.any(Object),
      }),
    )
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

    expect(findOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.any(ObjectId),
        email: {
          $options: 'i',
          $regex: '^demo@example\\.com$',
        },
      }),
      {
        projection: { messages: 1, sessionId: 1, chatwootConversationId: 1 },
      },
    )

    const [queryArg] = findOneMock.mock.calls[0]
    expect(queryArg._id.toHexString()).toBe('507f1f77bcf86cd799439011')
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

    expect(findMock).toHaveBeenCalledWith(
      { agentId: 'agent-1' },
      expect.objectContaining({
        projection: expect.any(Object),
      }),
    )
  })

  it('truncates title at 50 chars and appends ellipsis when content is longer', async () => {
    const longContent = 'A'.repeat(51)
    toArrayMock.mockResolvedValue([
      {
        _id: { toHexString: () => 'id-long' },
        sessionId: 's1',
        email: 'a@b.com',
        conversationTitle: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [{ type: 'human', data: { content: longContent } }],
      },
    ])

    const results = await getConversationHistory('a@b.com', 'agent-1')

    expect(results[0].conversationTitle).toBe('A'.repeat(50) + '...')
  })

  it('does not append ellipsis when content is exactly 50 chars', async () => {
    const exactContent = 'B'.repeat(50)
    toArrayMock.mockResolvedValue([
      {
        _id: { toHexString: () => 'id-exact' },
        sessionId: 's1',
        email: 'a@b.com',
        conversationTitle: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [{ type: 'human', data: { content: exactContent } }],
      },
    ])

    const results = await getConversationHistory('a@b.com', 'agent-1')

    expect(results[0].conversationTitle).toBe(exactContent)
  })

  it('falls back to DEFAULT_CHAT_TITLE when there are no human messages', async () => {
    toArrayMock.mockResolvedValue([
      {
        _id: { toHexString: () => 'id-nohumans' },
        sessionId: 's1',
        email: 'a@b.com',
        conversationTitle: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          { type: 'ai', data: { content: 'Hello!' } },
          { type: 'ai', data: { content: 'How can I help?' } },
        ],
      },
    ])

    const results = await getConversationHistory('a@b.com', 'agent-1')

    expect(results[0].conversationTitle).toBe('New Chat')
  })

  it('falls back to DEFAULT_CHAT_TITLE when messages array is empty', async () => {
    toArrayMock.mockResolvedValue([
      {
        _id: { toHexString: () => 'id-empty' },
        sessionId: 's1',
        email: 'a@b.com',
        conversationTitle: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      },
    ])

    const results = await getConversationHistory('a@b.com', 'agent-1')

    expect(results[0].conversationTitle).toBe('New Chat')
  })

  it('falls back to DEFAULT_CHAT_TITLE when messages field is absent', async () => {
    toArrayMock.mockResolvedValue([
      {
        _id: { toHexString: () => 'id-nomessages' },
        sessionId: 's1',
        email: 'a@b.com',
        conversationTitle: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const results = await getConversationHistory('a@b.com', 'agent-1')

    expect(results[0].conversationTitle).toBe('New Chat')
  })

  it('escapes special regex characters in searchTerm', async () => {
    await getConversationHistory('a@b.com', 'agent-1', { searchTerm: 'test+query (special)' })

    const [queryArg] = findMock.mock.calls[0]
    expect(queryArg.conversationTitle.$regex).toBe('test\\+query \\(special\\)')
  })

  it('returns empty array when MongoDB throws during getConversationHistory', async () => {
    connectToDatabaseMock.mockRejectedValue(new Error('db unreachable'))

    const results = await getConversationHistory('a@b.com', 'agent-1')

    expect(results).toEqual([])
  })

  it('returns empty result when MongoDB throws during getMessagesForConversation', async () => {
    connectToDatabaseMock.mockRejectedValue(new Error('db unreachable'))

    const result = await getMessagesForConversation('507f1f77bcf86cd799439011', 'a@b.com')

    expect(result).toEqual({ messages: [], sessionId: null, chatwootConversationId: null })
  })

  it('returns empty result for invalid ObjectId in getMessagesForConversation', async () => {
    const result = await getMessagesForConversation('not-an-objectid', 'a@b.com')

    expect(result).toEqual({ messages: [], sessionId: null, chatwootConversationId: null })
    expect(findOneMock).not.toHaveBeenCalled()
  })

  it('matches conversations by email ignoring case', async () => {
    findOneMock.mockResolvedValue({
      messages: [],
      sessionId: 'session-case',
      chatwootConversationId: null,
    })

    await getMessagesForConversation('507f1f77bcf86cd799439013', '  Demo@Example.COM  ')

    expect(findOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.any(ObjectId),
        email: {
          $regex: '^Demo@Example\\.COM$',
          $options: 'i',
        },
      }),
      {
        projection: { messages: 1, sessionId: 1, chatwootConversationId: 1 },
      },
    )

    const [queryArg] = findOneMock.mock.calls[0]
    expect(queryArg._id.toHexString()).toBe('507f1f77bcf86cd799439013')
  })

})
