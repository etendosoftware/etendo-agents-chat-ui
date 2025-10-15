import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalEnv = { ...process.env }
const originalFetch = global.fetch

let agentRecord: any = null

const createClientMock = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: agentRecord, error: null }),
      }),
    }),
  }),
}))

const upsertChatwootConversationMock = vi.fn()

describe('webhook POST route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    agentRecord = null
    upsertChatwootConversationMock.mockReset()
    global.fetch = originalFetch
    process.env = { ...originalEnv }

    vi.mock('@/lib/supabase/server', () => ({
      createClient: createClientMock,
    }))

    vi.mock('../lib/actions/chatwoot-conversations', () => ({
      upsertChatwootConversation: upsertChatwootConversationMock,
    }))
  })

  afterEach(() => {
    vi.resetModules()
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('proxies non-chatwoot agents to their webhook', async () => {
    agentRecord = {
      webhookurl: 'https://example.com/hook',
      path: '/sales',
      chatwoot_inbox_identifier: null,
      requires_email: false,
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('ok', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'agent-1')
    formData.append('sessionId', 'session-1')
    formData.append('message', 'Hello')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-agent-integration')).toBe('n8n')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects chatwoot agents when credentials are missing', async () => {
    agentRecord = {
      webhookurl: null,
      path: '/support',
      chatwoot_inbox_identifier: 'inbox-1',
      requires_email: false,
    }

    delete process.env.CHATWOOT_BASE_URL

    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'agent-2')
    formData.append('sessionId', 'session-2')
    formData.append('message', 'Hola')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
  })

  it('forwards messages to chatwoot and stores the conversation id', async () => {
    agentRecord = {
      webhookurl: null,
      path: '/support',
      chatwoot_inbox_identifier: 'inbox-42',
      requires_email: true,
    }

    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 99 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversation_id: 555 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'agent-3')
    formData.append('sessionId', 'session-3')
    formData.append('userEmail', 'guest@example.com')
    formData.append('message', 'Need help')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-agent-integration')).toBe('chatwoot')
    expect(response.headers.get('x-chatwoot-conversation')).toBe('555')
    expect(data).toEqual({ forwarded: true, conversationId: '555' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(upsertChatwootConversationMock).toHaveBeenCalledWith({
      agentId: 'agent-3',
      chatwootConversationId: '555',
      email: 'guest@example.com',
      sessionId: 'session-3',
    })
  })

  it('propagates chatwoot errors when message forwarding fails', async () => {
    agentRecord = {
      webhookurl: null,
      path: '/support',
      chatwoot_inbox_identifier: 'inbox-42',
      requires_email: false,
    }

    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 99 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('failed', {
          status: 500,
          statusText: 'Server Error',
        }),
      )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'agent-4')
    formData.append('sessionId', 'session-4')
    formData.append('message', 'Ping')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Error de Chatwoot')
  })
})
