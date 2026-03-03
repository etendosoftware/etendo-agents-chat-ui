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

  it('returns error for empty conversationId', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })

    const result = await deleteConversation('')

    expect(result).toEqual({ success: false, error: 'Conversation ID is required' })
    expect(deleteOneMock).not.toHaveBeenCalled()
  })

  it('returns error for invalid ObjectId format', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })

    const result = await deleteConversation('not-a-valid-object-id')

    expect(result).toEqual({ success: false, error: 'Invalid conversation ID' })
    expect(deleteOneMock).not.toHaveBeenCalled()
  })

  it('returns database error when MongoDB throws', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    deleteOneMock.mockRejectedValue(new Error('connection timeout'))

    const result = await deleteConversation(conversationId)

    expect(result).toEqual({ success: false, error: 'Database error' })
  })

  it('uses exact email match (case-sensitive) for security isolation', async () => {
    // deleteConversation uses `email: user.email` — a direct equality check,
    // NOT case-insensitive regex like other actions. This test documents that
    // behavior: a user with email "Demo@Example.com" cannot delete a document
    // stored with "demo@example.com".
    getUserMock.mockResolvedValue({ data: { user: { email: 'Demo@Example.com' } } })
    deleteOneMock.mockResolvedValue({ deletedCount: 0 })

    const result = await deleteConversation(conversationId)

    expect(result.success).toBe(false)
    // Verify the query passed email as-is (exact match, not regex)
    const [queryArg] = deleteOneMock.mock.calls[0]
    expect(queryArg.email).toBe('Demo@Example.com')
    expect(queryArg.email).not.toHaveProperty('$regex')
  })

  it('passes the correct ObjectId to deleteOne', async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: 'demo@example.com' } } })
    deleteOneMock.mockResolvedValue({ deletedCount: 1 })

    await deleteConversation(conversationId)

    const [queryArg] = deleteOneMock.mock.calls[0]
    expect(queryArg._id.toHexString()).toBe(conversationId)
    expect(queryArg.email).toBe('demo@example.com')
  })
})
