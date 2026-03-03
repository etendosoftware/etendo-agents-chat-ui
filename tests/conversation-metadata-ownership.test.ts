import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'

const findOneMock = vi.hoisted(() => vi.fn())
const collectionMock = vi.hoisted(() => vi.fn(() => ({ findOne: findOneMock })))
const connectToDatabaseMock = vi.hoisted(() =>
  vi.fn(async () => ({
    db: {
      collection: collectionMock,
    },
  })),
)

vi.mock('../lib/mongodb', () => ({
  connectToDatabase: connectToDatabaseMock,
}))

describe('getConversationMetadata ownership checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null metadata for invalid ObjectId', async () => {
    const { getConversationMetadata } = await import('../lib/actions/chat')

    const result = await getConversationMetadata('invalid-id', 'demo@example.com')

    expect(result).toEqual({ sessionId: null, chatwootConversationId: null })
    expect(findOneMock).not.toHaveBeenCalled()
  })

  it('returns null metadata when email does not match owner', async () => {
    findOneMock.mockResolvedValue(null)
    const { getConversationMetadata } = await import('../lib/actions/chat')

    const result = await getConversationMetadata('507f1f77bcf86cd799439011', 'other@example.com')

    expect(result).toEqual({ sessionId: null, chatwootConversationId: null })
  })

  it('matches owner email case-insensitively in metadata lookup', async () => {
    findOneMock.mockResolvedValue({
      sessionId: 'session-1',
      chatwootConversationId: 'cw-42',
    })
    const { getConversationMetadata } = await import('../lib/actions/chat')

    const result = await getConversationMetadata('507f1f77bcf86cd799439012', 'Demo@Example.COM')

    expect(findOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.any(ObjectId),
        email: {
          $regex: '^Demo@Example\\.COM$',
          $options: 'i',
        },
      }),
      {
        projection: {
          sessionId: 1,
          chatwootConversationId: 1,
        },
      },
    )

    const [queryArg] = findOneMock.mock.calls[0]
    expect(queryArg._id.toHexString()).toBe('507f1f77bcf86cd799439012')
    expect(result).toEqual({ sessionId: 'session-1', chatwootConversationId: 'cw-42' })
  })
})
