import { beforeEach, describe, expect, it, vi } from 'vitest'

import { upsertChatwootConversation } from '../lib/actions/chatwoot-conversations'

const connectToDatabaseMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/mongodb', () => ({
  connectToDatabase: connectToDatabaseMock,
}))

describe('upsertChatwootConversation', () => {
  const findOneAndUpdateMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    findOneAndUpdateMock.mockReset()

    connectToDatabaseMock.mockResolvedValue({
      db: {
        collection: vi.fn().mockReturnValue({
          findOneAndUpdate: findOneAndUpdateMock,
        }),
      },
    })
  })

  it('upserts chatwoot conversation with normalized email and session', async () => {
    // First call (fallback): no match found → returns null
    findOneAndUpdateMock.mockResolvedValueOnce(null)
    // Second call (upsert): returns the upserted document
    findOneAndUpdateMock.mockResolvedValueOnce({ _id: { toHexString: () => 'mongo-id-1' } })

    await upsertChatwootConversation({
      email: 'User@example.com',
      agentId: 'agent-1',
      chatwootConversationId: 'chat-123',
      sessionId: 'session-1',
    })

    expect(findOneAndUpdateMock).toHaveBeenCalledTimes(2)

    const [fallbackFilter, fallbackUpdate] = findOneAndUpdateMock.mock.calls[0]
    expect(fallbackFilter.agentId).toBe('agent-1')
    expect(Array.isArray(fallbackFilter.$and)).toBe(true)
    const emailMatcher = fallbackFilter.$and.find((item: any) => item.email)
    expect(emailMatcher.email.source).toBe('^User@example\\.com$')
    expect(emailMatcher.email.flags).toBe('i')
    expect(fallbackUpdate.$set.chatwootConversationId).toBe('chat-123')
    expect(fallbackUpdate.$set.sessionId).toBe('session-1')
    expect(fallbackUpdate.$set.email).toBe('User@example.com')

    const [upsertFilter, upsertUpdate, upsertOptions] = findOneAndUpdateMock.mock.calls[1]
    expect(upsertFilter).toEqual({ agentId: 'agent-1', chatwootConversationId: 'chat-123' })
    expect(upsertUpdate.$set).toMatchObject({
      email: 'User@example.com',
      sessionId: 'session-1',
      chatwootConversationId: 'chat-123',
    })
    expect(upsertUpdate.$set.updatedAt).toBeInstanceOf(Date)
    expect(upsertUpdate.$setOnInsert.createdAt).toBeInstanceOf(Date)
    expect(upsertOptions).toEqual({ upsert: true, returnDocument: 'after' })
  })

  it('short-circuits when fallback update finds a pending record', async () => {
    // Fallback finds and updates a match → short-circuits, no upsert
    findOneAndUpdateMock.mockResolvedValueOnce({ _id: { toHexString: () => 'mongo-id-2' } })

    await upsertChatwootConversation({
      email: '',
      agentId: 'agent-2',
      chatwootConversationId: 'chat-999',
      sessionId: 'session-2',
    })

    expect(findOneAndUpdateMock).toHaveBeenCalledTimes(1)
    const [filter] = findOneAndUpdateMock.mock.calls[0]
    expect(filter.agentId).toBe('agent-2')
  })

  it('skips fallback and goes straight to upsert when both email and sessionId are empty', async () => {
    findOneAndUpdateMock.mockResolvedValueOnce({ _id: { toHexString: () => 'mongo-id-3' } })

    const result = await upsertChatwootConversation({
      email: '',
      agentId: 'agent-3',
      chatwootConversationId: 'chat-empty',
      sessionId: null,
    })

    // Only the main upsert call is made, no fallback search
    expect(findOneAndUpdateMock).toHaveBeenCalledTimes(1)
    const [filter, , options] = findOneAndUpdateMock.mock.calls[0]
    expect(filter).toEqual({ agentId: 'agent-3', chatwootConversationId: 'chat-empty' })
    expect(options.upsert).toBe(true)
    expect(result).toBe('mongo-id-3')
  })

  it('returns the mongo id returned by the fallback match', async () => {
    findOneAndUpdateMock.mockResolvedValueOnce({ _id: { toHexString: () => 'fallback-id' } })

    const result = await upsertChatwootConversation({
      email: 'user@example.com',
      agentId: 'agent-4',
      chatwootConversationId: 'chat-fb',
      sessionId: 'session-4',
    })

    expect(result).toBe('fallback-id')
    expect(findOneAndUpdateMock).toHaveBeenCalledTimes(1)
  })

  it('returns the mongo id from the upsert when no fallback match', async () => {
    findOneAndUpdateMock.mockResolvedValueOnce(null)
    findOneAndUpdateMock.mockResolvedValueOnce({ _id: { toHexString: () => 'upsert-id' } })

    const result = await upsertChatwootConversation({
      email: 'user@example.com',
      agentId: 'agent-5',
      chatwootConversationId: 'chat-up',
      sessionId: 'session-5',
    })

    expect(result).toBe('upsert-id')
    expect(findOneAndUpdateMock).toHaveBeenCalledTimes(2)
  })

  it('escapes special regex characters in email (plus addressing)', async () => {
    findOneAndUpdateMock.mockResolvedValueOnce(null)
    findOneAndUpdateMock.mockResolvedValueOnce({ _id: { toHexString: () => 'id-plus' } })

    await upsertChatwootConversation({
      email: 'test+tag@example.com',
      agentId: 'agent-6',
      chatwootConversationId: 'chat-plus',
      sessionId: null,
    })

    const [fallbackFilter] = findOneAndUpdateMock.mock.calls[0]
    const emailMatcher = fallbackFilter.$and.find((item: any) => item.email)
    // The + must be escaped in the regex source
    expect(emailMatcher.email.source).toBe('^test\\+tag@example\\.com$')
    expect(emailMatcher.email.flags).toBe('i')
  })

  it('returns null and does not throw when MongoDB throws', async () => {
    findOneAndUpdateMock.mockRejectedValue(new Error('connection timeout'))

    const result = await upsertChatwootConversation({
      email: 'user@example.com',
      agentId: 'agent-7',
      chatwootConversationId: 'chat-err',
      sessionId: 'session-7',
    })

    expect(result).toBeNull()
  })
})
