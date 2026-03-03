import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.hoisted(() => vi.fn())
const getConversationMetadataMock = vi.hoisted(() => vi.fn())
const getMessagesForConversationMock = vi.hoisted(() => vi.fn())
const fetchChatwootConversationMessagesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
    },
  }),
}))

vi.mock('../lib/actions/chat', () => ({
  getConversationMetadata: getConversationMetadataMock,
  getMessagesForConversation: getMessagesForConversationMock,
}))

vi.mock('@/lib/chatwoot/api', () => ({
  fetchChatwootConversationMessages: fetchChatwootConversationMessagesMock,
}))

describe('fetchMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
  })

  it('uses mongo fallback when chatwoot conversation id is missing', async () => {
    getConversationMetadataMock.mockResolvedValue({
      sessionId: 'session-meta',
      chatwootConversationId: null,
    })
    getMessagesForConversationMock.mockResolvedValue({
      messages: [{ type: 'human', data: { content: 'From mongo' } }],
      sessionId: 'session-db',
      chatwootConversationId: null,
    })

    const { fetchMessages } = await import('../lib/actions/fetchMessages')
    const result = await fetchMessages('507f1f77bcf86cd799439011', 'agent-1', 'inbox-1')

    expect(fetchChatwootConversationMessagesMock).not.toHaveBeenCalled()
    expect(result.sessionId).toBe('session-meta')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toBe('From mongo')
  })

  it('falls back to mongo when chatwoot returns no messages', async () => {
    getConversationMetadataMock.mockResolvedValue({
      sessionId: 'session-meta',
      chatwootConversationId: 'cw-123',
    })
    fetchChatwootConversationMessagesMock.mockResolvedValue([])
    getMessagesForConversationMock.mockResolvedValue({
      messages: [{ type: 'ai', data: { content: 'DB fallback answer' } }],
      sessionId: 'session-db',
      chatwootConversationId: 'cw-123',
    })

    const { fetchMessages } = await import('../lib/actions/fetchMessages')
    const result = await fetchMessages('507f1f77bcf86cd799439012', 'agent-1', 'inbox-1')

    expect(fetchChatwootConversationMessagesMock).toHaveBeenCalledWith('cw-123')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toBe('DB fallback answer')
  })

  it('deduplicates repeated chatwoot messages by id', async () => {
    const createdAt = new Date('2026-01-01T10:00:00Z')
    getConversationMetadataMock.mockResolvedValue({
      sessionId: 'session-meta',
      chatwootConversationId: 'cw-789',
    })
    fetchChatwootConversationMessagesMock.mockResolvedValue([
      {
        id: 'msg-1',
        content: 'Hello',
        sender: 'agent',
        createdAt,
        attachments: [],
        audioUrl: null,
      },
      {
        id: 'msg-1',
        content: 'Hello duplicate',
        sender: 'agent',
        createdAt,
        attachments: [],
        audioUrl: null,
      },
    ])

    const { fetchMessages } = await import('../lib/actions/fetchMessages')
    const result = await fetchMessages('507f1f77bcf86cd799439013', 'agent-1', 'inbox-1')

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].id).toBe('cw-789-msg-1')
    expect(result.messages[0].content).toBe('Hello duplicate')
  })

  it('returns empty result when user is not authenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const { fetchMessages } = await import('../lib/actions/fetchMessages')
    const result = await fetchMessages('507f1f77bcf86cd799439020', 'agent-1', 'inbox-1')

    expect(result).toEqual({ messages: [], sessionId: null, chatwootConversationId: null })
    expect(getConversationMetadataMock).not.toHaveBeenCalled()
    expect(getMessagesForConversationMock).not.toHaveBeenCalled()
  })

  it('goes straight to mongodb when chatwootInboxIdentifier is not provided', async () => {
    getMessagesForConversationMock.mockResolvedValue({
      messages: [{ type: 'human', data: { content: 'Direct mongo message' } }],
      sessionId: 'session-direct',
      chatwootConversationId: null,
    })

    const { fetchMessages } = await import('../lib/actions/fetchMessages')
    const result = await fetchMessages('507f1f77bcf86cd799439021', 'agent-1')

    expect(getConversationMetadataMock).not.toHaveBeenCalled()
    expect(fetchChatwootConversationMessagesMock).not.toHaveBeenCalled()
    expect(getMessagesForConversationMock).toHaveBeenCalledWith('507f1f77bcf86cd799439021', 'demo@example.com')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toBe('Direct mongo message')
    expect(result.sessionId).toBe('session-direct')
  })

  it('maps chatwoot message attachments into the result', async () => {
    getConversationMetadataMock.mockResolvedValue({
      sessionId: 'session-attach',
      chatwootConversationId: 'cw-attach',
    })
    fetchChatwootConversationMessagesMock.mockResolvedValue([
      {
        id: 'att-1',
        content: 'See attached',
        sender: 'agent',
        createdAt: new Date('2026-01-01T10:00:00Z'),
        attachments: [{ id: '10', name: 'doc.pdf', type: 'application/pdf', url: 'https://example.com/doc.pdf', size: 4096 }],
        audioUrl: null,
      },
    ])

    const { fetchMessages } = await import('../lib/actions/fetchMessages')
    const result = await fetchMessages('507f1f77bcf86cd799439022', 'agent-1', 'inbox-1')

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].attachments).toHaveLength(1)
    expect(result.messages[0].attachments![0]).toMatchObject({
      name: 'doc.pdf',
      type: 'application/pdf',
      url: 'https://example.com/doc.pdf',
      size: 4096,
    })
  })

  it('returns chatwoot messages sorted chronologically', async () => {
    getConversationMetadataMock.mockResolvedValue({
      sessionId: 'session-sort',
      chatwootConversationId: 'cw-sort',
    })
    fetchChatwootConversationMessagesMock.mockResolvedValue([
      { id: 'later', content: 'Later', sender: 'agent', createdAt: new Date('2026-01-01T12:00:00Z'), attachments: [], audioUrl: null },
      { id: 'earlier', content: 'Earlier', sender: 'user', createdAt: new Date('2026-01-01T10:00:00Z'), attachments: [], audioUrl: null },
    ])

    const { fetchMessages } = await import('../lib/actions/fetchMessages')
    const result = await fetchMessages('507f1f77bcf86cd799439023', 'agent-1', 'inbox-1')

    expect(result.messages[0].content).toBe('Earlier')
    expect(result.messages[1].content).toBe('Later')
  })
})
