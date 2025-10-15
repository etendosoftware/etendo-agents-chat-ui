import crypto from 'node:crypto'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalEnv = { ...process.env }
const broadcastConversationEventMock = vi.fn()

vi.mock('../lib/chatwootEvents', () => ({
  broadcastConversationEvent: broadcastConversationEventMock,
}))

describe('Chatwoot webhook route', () => {
  beforeEach(() => {
    vi.resetModules()
    broadcastConversationEventMock.mockReset()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it('rejects payloads with invalid signature when token is configured', async () => {
    process.env.CHATWOOT_WEBHOOK_TOKEN = 'secret'

    const payload = JSON.stringify({ event: 'message_created' })
    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-signature': 'invalid',
      },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(broadcastConversationEventMock).not.toHaveBeenCalled()
  })

  it('broadcasts outgoing messages to connected clients', async () => {
    process.env.CHATWOOT_WEBHOOK_TOKEN = 'secret'

    const body = {
      event: 'message_created',
      message: {
        conversation_id: 'chat-1',
        message_type: 'outgoing',
        content: 'Hello from agent',
      },
      conversation: {
        id: 'chat-1',
        labels: [],
      },
    }

    const payload = JSON.stringify(body)
    const signature = crypto.createHmac('sha256', 'secret').update(payload).digest('hex')

    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-signature': signature,
      },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(broadcastConversationEventMock).toHaveBeenCalledWith(
      'chat-1',
      'chatwoot_message',
      expect.objectContaining({ conversationId: 'chat-1' }),
    )
  })

  it('emits handoff events when humano label toggles', async () => {
    process.env.CHATWOOT_WEBHOOK_TOKEN = 'secret'

    const firstPayload = JSON.stringify({
      event: 'conversation_updated',
      conversation: {
        id: 'chat-2',
        labels: ['Humano'],
      },
      message: {
        conversation_id: 'chat-2',
        message_type: 'incoming',
        private: true,
      },
    })

    const signature = crypto.createHmac('sha256', 'secret').update(firstPayload).digest('hex')

    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: firstPayload,
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-signature': signature,
      },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    await POST(request)

    expect(broadcastConversationEventMock).toHaveBeenCalledWith(
      'chat-2',
      'chatwoot_handoff',
      expect.objectContaining({ human: true }),
    )

    broadcastConversationEventMock.mockClear()

    const repeatRequest = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: firstPayload,
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-signature': signature,
      },
    })

    await POST(repeatRequest)
    expect(broadcastConversationEventMock).not.toHaveBeenCalled()
  })
})
