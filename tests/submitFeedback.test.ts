import { describe, it, expect, vi, beforeEach } from 'vitest'

const createClientMock = vi.hoisted(() => vi.fn())
const insertMock = vi.hoisted(() => vi.fn())
const getUserMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

describe('submitFeedback action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createClientMock.mockReturnValue({
      auth: {
        getUser: getUserMock,
      },
      from: () => ({ insert: insertMock }),
    })
  })

  it('rejects guests without session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })

    const { submitFeedback } = await import('../lib/actions/feedback')
    const result = await submitFeedback({
      messageId: null,
      conversationId: 'conv-1',
      agentId: 'agent-1',
      rating: 'good',
    })

    expect(result).toEqual({ error: 'User not authenticated' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserta feedback para usuarios autenticados', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    insertMock.mockResolvedValue({ error: null })

    const { submitFeedback } = await import('../lib/actions/feedback')
    const result = await submitFeedback({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      rating: 'bad',
      feedbackText: 'needs work',
    })

    expect(result).toEqual({ success: true })
    expect(insertMock).toHaveBeenCalledWith([
      {
        message_id: 'msg-1',
        conversation_id: 'conv-1',
        agent_id: 'agent-1',
        rating: 'bad',
        feedback_text: 'needs work',
        user_id: 'user-1',
      },
    ])
  })
})
