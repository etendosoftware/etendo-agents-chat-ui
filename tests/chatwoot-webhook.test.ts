import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const saveMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../lib/chatwoot/message-store', () => ({
  saveChatwootWebhookEvent: saveMock,
}))

const originalEnv = { ...process.env }

function sign(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('Chatwoot webhook route', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects payloads with invalid signature', async () => {
    process.env.CHATWOOT_WEBHOOK_TOKEN = 'secret'
    const payload = JSON.stringify({ event: 'message_created' })

    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-signature': 'wrong',
      },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  it('accepts payloads with valid signature', async () => {
    process.env.CHATWOOT_WEBHOOK_TOKEN = 'secret'
    const payload = JSON.stringify({ event: 'message_created' })
    const signature = sign(payload, 'secret')

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
  })

  it('skips signature verification when token is missing', async () => {
    delete process.env.CHATWOOT_WEBHOOK_TOKEN

    const payload = JSON.stringify({ event: 'ping' })
    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    const response = await POST(request)

    expect(response.status).toBe(200)
  })

  it('calls saveChatwootWebhookEvent with the parsed payload', async () => {
    delete process.env.CHATWOOT_WEBHOOK_TOKEN

    const payload = {
      event: 'message_created',
      id: 42,
      content: 'Hello',
      message_type: 'outgoing',
      private: false,
      conversation: { id: 7 },
    }

    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    await POST(request)

    expect(saveMock).toHaveBeenCalledWith(payload)
  })

  it('calls saveChatwootWebhookEvent for conversation_updated events', async () => {
    delete process.env.CHATWOOT_WEBHOOK_TOKEN

    const payload = {
      event: 'conversation_updated',
      id: 7,
      labels: ['humano'],
    }

    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    await POST(request)

    expect(saveMock).toHaveBeenCalledWith(payload)
  })

  it('does not call saveChatwootWebhookEvent when signature is invalid', async () => {
    process.env.CHATWOOT_WEBHOOK_TOKEN = 'secret'
    const payload = JSON.stringify({ event: 'message_created' })

    const request = new NextRequest('https://app.test/api/chatwoot/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-signature': 'bad-sig',
      },
    })

    const { POST } = await import('../app/api/chatwoot/webhook/route')
    await POST(request)

    expect(saveMock).not.toHaveBeenCalled()
  })
})
