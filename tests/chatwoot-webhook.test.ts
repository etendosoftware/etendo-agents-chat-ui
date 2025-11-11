import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

const originalEnv = { ...process.env }

function sign(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('Chatwoot webhook route', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
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
})
