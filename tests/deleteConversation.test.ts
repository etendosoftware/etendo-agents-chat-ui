import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deleteConversation } from '../lib/actions/deleteConversation'

const getUserMock = vi.hoisted(() => vi.fn())
const deleteOneMock = vi.hoisted(() => vi.fn())
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('deleteConversation', () => {
  const conversationId = '507f1f77bcf86cd799439011'

  beforeEach(() => {
    getUserMock.mockReset()
    deleteOneMock.mockReset()
    connectToDatabaseMock.mockReset()
    connectToDatabaseMock.mockResolvedValue({
      db: {
        collection: () => ({
          deleteOne: deleteOneMock,
        }),
      },
    })
  })

  it('returns error when user is not authenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const result = await deleteConversation(conversationId)

    expect(result).toEqual({ success: false, error: 'User not authenticated' })
    expect(deleteOneMock).not.toHaveBeenCalled()
  })

  it('deletes conversation for authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    deleteOneMock.mockResolvedValue({ deletedCount: 1 })

    const result = await deleteConversation(conversationId)

    expect(result).toEqual({ success: true })
    expect(deleteOneMock).toHaveBeenCalled()
  })

  it('returns error when no document is removed', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    deleteOneMock.mockResolvedValue({ deletedCount: 0 })

    const result = await deleteConversation(conversationId)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Conversation not found or user does not have permission')
  })
})
