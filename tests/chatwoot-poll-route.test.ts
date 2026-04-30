import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getPendingMessagesMock = vi.hoisted(() => vi.fn())
const getLabelStateMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/chatwoot/message-store', () => ({
  getChatwootPendingMessages: getPendingMessagesMock,
  getChatwootLabelState: getLabelStateMock,
}))

describe('chatwoot poll route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getPendingMessagesMock.mockResolvedValue([])
    getLabelStateMock.mockResolvedValue(null)
  })

  it('returns 400 when conversationId is missing', async () => {
    const { GET } = await import('../app/api/chatwoot/poll/route')
    const request = new NextRequest('https://app.test/api/chatwoot/poll')
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('returns 200 with messages and labelState', async () => {
    const messages = [
      { id: '1', content: 'Hola', messageType: 'outgoing', createdAt: new Date(), sender: null, attachments: [] },
    ]
    getPendingMessagesMock.mockResolvedValue(messages)
    getLabelStateMock.mockResolvedValue({ labels: ['vip'], hasHuman: false })

    const { GET } = await import('../app/api/chatwoot/poll/route')
    const request = new NextRequest('https://app.test/api/chatwoot/poll?conversationId=123')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].id).toBe('1')
    expect(body.labelState).toEqual({ labels: ['vip'], hasHuman: false })
  })

  it('returns empty messages array when no messages exist', async () => {
    getPendingMessagesMock.mockResolvedValue([])

    const { GET } = await import('../app/api/chatwoot/poll/route')
    const request = new NextRequest('https://app.test/api/chatwoot/poll?conversationId=456')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.messages).toEqual([])
  })

  it('returns labelState null when no conversation found', async () => {
    getLabelStateMock.mockResolvedValue(null)

    const { GET } = await import('../app/api/chatwoot/poll/route')
    const request = new NextRequest('https://app.test/api/chatwoot/poll?conversationId=789')
    const response = await GET(request)

    const body = await response.json()
    expect(body.labelState).toBeNull()
  })

  it('queries by the given conversationId', async () => {
    const { GET } = await import('../app/api/chatwoot/poll/route')
    const request = new NextRequest('https://app.test/api/chatwoot/poll?conversationId=abc-999')
    await GET(request)

    expect(getPendingMessagesMock).toHaveBeenCalledWith('abc-999')
    expect(getLabelStateMock).toHaveBeenCalledWith('abc-999')
  })

  it('returns 500 when MongoDB throws', async () => {
    getPendingMessagesMock.mockRejectedValue(new Error('DB down'))

    const { GET } = await import('../app/api/chatwoot/poll/route')
    const request = new NextRequest('https://app.test/api/chatwoot/poll?conversationId=123')
    const response = await GET(request)

    expect(response.status).toBe(500)
  })
})
