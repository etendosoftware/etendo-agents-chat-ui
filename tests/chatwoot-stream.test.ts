import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const registerConversationStreamMock = vi.fn()

vi.mock('../lib/chatwootEvents', () => ({
  registerConversationStream: registerConversationStreamMock,
}))

describe('Chatwoot stream route', () => {
  beforeEach(() => {
    vi.resetModules()
    registerConversationStreamMock.mockReset()
  })

  it('requires a conversationId parameter', async () => {
    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream')
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('returns an SSE stream when conversationId is provided', async () => {
    const stream = new ReadableStream()
    registerConversationStreamMock.mockReturnValue(stream)

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=abc')
    const response = await GET(request)

    expect(registerConversationStreamMock).toHaveBeenCalledWith('abc')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.body).toBe(stream)
  })
})
