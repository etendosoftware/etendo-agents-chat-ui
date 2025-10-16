import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalEnv = { ...process.env }
const originalFetch = global.fetch

describe('Chatwoot messages API route', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it('requires conversationId query parameter', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const { GET } = await import('../app/api/chatwoot/messages/route')
    const request = new NextRequest('https://app.test/api/chatwoot/messages')
    const response = await GET(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'conversationId es requerido' })
  })

  it('returns 500 when credentials are missing', async () => {
    delete process.env.CHATWOOT_BASE_URL
    delete process.env.CHATWOOT_ACCOUNT_ID
    delete process.env.CHATWOOT_API_TOKEN

    const { GET } = await import('../app/api/chatwoot/messages/route')
    const request = new NextRequest('https://app.test/api/chatwoot/messages?conversationId=123')
    const response = await GET(request)

    expect(response.status).toBe(500)
  })

  it('forwards message list from Chatwoot', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ payload: { messages: [{ id: 1 }, { id: 2 }] } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const { GET } = await import('../app/api/chatwoot/messages/route')
    const request = new NextRequest('https://app.test/api/chatwoot/messages?conversationId=abc')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatwoot.test/api/v1/accounts/1/conversations/abc/messages',
      expect.any(Object),
    )
    expect(data).toEqual({ messages: [{ id: 1 }, { id: 2 }] })
  })

  it('bubbles up Chatwoot errors', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('missing', {
        status: 404,
        statusText: 'Not Found',
      }),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const { GET } = await import('../app/api/chatwoot/messages/route')
    const request = new NextRequest('https://app.test/api/chatwoot/messages?conversationId=missing')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toContain('Error de Chatwoot')
  })
})
