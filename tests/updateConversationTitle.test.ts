import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.hoisted(() => vi.fn())
const updateOneMock = vi.hoisted(() => vi.fn())
const connectToDatabaseMock = vi.hoisted(() => vi.fn())
const revalidatePathMock = vi.hoisted(() => vi.fn())

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

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

describe('updateConversationTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    connectToDatabaseMock.mockResolvedValue({
      db: {
        collection: () => ({
          updateOne: updateOneMock,
        }),
      },
    })
  })

  it('rejects unauthenticated users', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { updateConversationTitle } = await import('../lib/actions/updateConversationTitle')

    const result = await updateConversationTitle('507f1f77bcf86cd799439011', 'New title')

    expect(result).toEqual({ success: false, error: 'User not authenticated' })
    expect(updateOneMock).not.toHaveBeenCalled()
  })

  it('rejects empty title input', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    const { updateConversationTitle } = await import('../lib/actions/updateConversationTitle')

    const result = await updateConversationTitle('507f1f77bcf86cd799439011', '   ')

    expect(result.success).toBe(false)
    expect(result.error).toContain('non-empty title')
    expect(updateOneMock).not.toHaveBeenCalled()
  })

  it('returns success and revalidates path when update matches a record', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    updateOneMock.mockResolvedValue({ matchedCount: 1 })
    const { updateConversationTitle } = await import('../lib/actions/updateConversationTitle')

    const result = await updateConversationTitle('507f1f77bcf86cd799439011', '  Updated title  ')

    expect(result).toEqual({ success: true })
    expect(updateOneMock).toHaveBeenCalled()
    expect(updateOneMock).toHaveBeenCalledWith(
      expect.any(Object),
      { $set: { conversationTitle: 'Updated title' } },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/chat', 'layout')
  })

  it('returns permission error when no conversation is matched', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    updateOneMock.mockResolvedValue({ matchedCount: 0 })
    const { updateConversationTitle } = await import('../lib/actions/updateConversationTitle')

    const result = await updateConversationTitle('507f1f77bcf86cd799439011', 'Updated title')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Conversation not found or user does not have permission')
  })
})
