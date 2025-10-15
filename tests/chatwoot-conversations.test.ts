import { beforeEach, describe, expect, it, vi } from 'vitest'

import { upsertChatwootConversation } from '../lib/actions/chatwoot-conversations'

const connectToDatabaseMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/mongodb', () => ({
  connectToDatabase: connectToDatabaseMock,
}))

describe('upsertChatwootConversation', () => {
  const updateOneMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    updateOneMock.mockReset()

    connectToDatabaseMock.mockResolvedValue({
      db: {
        collection: vi.fn().mockReturnValue({
          updateOne: updateOneMock,
        }),
      },
    })
  })

  it('upserts chatwoot conversation with normalized email and session', async () => {
    updateOneMock.mockResolvedValueOnce({ matchedCount: 0 })
    updateOneMock.mockResolvedValueOnce({ matchedCount: 1 })

    await upsertChatwootConversation({
      email: 'User@example.com',
      agentId: 'agent-1',
      chatwootConversationId: 'chat-123',
      sessionId: 'session-1',
    })

    expect(updateOneMock).toHaveBeenCalledTimes(2)

    const [fallbackFilter, fallbackUpdate] = updateOneMock.mock.calls[0]
    expect(fallbackFilter.agentId).toBe('agent-1')
    expect(Array.isArray(fallbackFilter.$and)).toBe(true)
    const emailMatcher = fallbackFilter.$and.find((item: any) => item.email)
    expect(emailMatcher.email.source).toBe('^User@example\\.com$')
    expect(emailMatcher.email.flags).toBe('i')
    expect(fallbackUpdate.$set.chatwootConversationId).toBe('chat-123')
    expect(fallbackUpdate.$set.sessionId).toBe('session-1')
    expect(fallbackUpdate.$set.email).toBe('User@example.com')

    const [upsertFilter, upsertUpdate, upsertOptions] = updateOneMock.mock.calls[1]
    expect(upsertFilter).toEqual({ agentId: 'agent-1', chatwootConversationId: 'chat-123' })
    expect(upsertUpdate.$set).toMatchObject({
      email: 'User@example.com',
      sessionId: 'session-1',
      chatwootConversationId: 'chat-123',
    })
    expect(upsertUpdate.$set.updatedAt).toBeInstanceOf(Date)
    expect(upsertUpdate.$setOnInsert.createdAt).toBeInstanceOf(Date)
    expect(upsertOptions).toEqual({ upsert: true })
  })

  it('short-circuits when fallback update finds a pending record', async () => {
    updateOneMock.mockResolvedValueOnce({ matchedCount: 1 })

    await upsertChatwootConversation({
      email: '',
      agentId: 'agent-2',
      chatwootConversationId: 'chat-999',
      sessionId: 'session-2',
    })

    expect(updateOneMock).toHaveBeenCalledTimes(1)
    const [filter] = updateOneMock.mock.calls[0]
    expect(filter.agentId).toBe('agent-2')
  })
})
