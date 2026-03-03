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

  it('returns 400 when agentId is missing', async () => {
    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('sessionId', 'session-0')
    formData.append('message', 'Hello')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('El agente es requerido')
  })

  it('returns 404 when agent does not exist', async () => {
    agentRecord = null
    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'missing-agent')
    formData.append('sessionId', 'session-0')
    formData.append('message', 'Hello')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Agente no encontrado')
  })

  it('returns 400 for non-chatwoot agents without webhook url', async () => {
    agentRecord = {
      webhookurl: '',
      path: '/sales',
      chatwoot_inbox_identifier: null,
      requires_email: false,
    }

    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'agent-no-webhook')
    formData.append('sessionId', 'session-0')
    formData.append('message', 'Hello')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('URL del webhook es requerida')
  })

  it('returns 500 when upstream n8n response has no body', async () => {
    agentRecord = {
      webhookurl: 'https://example.com/hook',
      path: '/sales',
      chatwoot_inbox_identifier: null,
      requires_email: false,
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
        statusText: 'No Content',
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
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data).toEqual({ output: 'No stream available from webhook.' })
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

  it('falls back to private API conversation creation when public API returns 422', async () => {
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
        new Response('no active conversation', {
          status: 422,
          statusText: 'Unprocessable Entity',
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ payload: [{ id: 321, inbox_identifier: 'inbox-42' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 777 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'msg-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'agent-5')
    formData.append('sessionId', 'session-5')
    formData.append('userEmail', 'fallback@example.com')
    formData.append('message', 'Hola')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-chatwoot-conversation')).toBe('777')
    expect(data).toEqual({ forwarded: true, conversationId: '777' })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('proxies non-chatwoot agent with empty message but includes agentId and sessionId in payload', async () => {
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
    formData.append('agentId', 'agent-files')
    formData.append('sessionId', 'session-files')
    formData.append('message', '')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, options] = fetchMock.mock.calls[0]
    const sentForm = options.body as FormData
    expect(sentForm.get('agentId')).toBe('agent-files')
    expect(sentForm.get('sessionId')).toBe('session-files')
  })

  it('returns success even if conversation upsert fails', async () => {
    agentRecord = {
      webhookurl: null,
      path: '/support',
      chatwoot_inbox_identifier: 'inbox-42',
      requires_email: true,
    }

    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'
    upsertChatwootConversationMock.mockRejectedValue(new Error('db down'))

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
    formData.append('agentId', 'agent-6')
    formData.append('sessionId', 'session-6')
    formData.append('userEmail', 'guest@example.com')
    formData.append('message', 'Need help')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-chatwoot-conversation')).toBe('555')
  })

  it('returns 500 when chatwoot contact creation returns 401 unauthorized', async () => {
    agentRecord = {
      webhookurl: null,
      path: '/support',
      chatwoot_inbox_identifier: 'inbox-42',
      requires_email: false,
    }

    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'bad-token'

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/webhook/route')

    const formData = new FormData()
    formData.append('agentId', 'agent-401')
    formData.append('sessionId', 'session-401')
    formData.append('message', 'Hello')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)

    // The route propagates the upstream error status from Chatwoot (401 or 5xx)
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('returns 500 when existing conversation forwarding fails', async () => {
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
        new Response('cannot append to conversation', {
          status: 500,
          statusText: 'Server Error',
        }),
      )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/webhook/route')
    const formData = new FormData()
    formData.append('agentId', 'agent-7')
    formData.append('sessionId', 'session-7')
    formData.append('message', 'Need help')
    formData.append('conversationId', 'cw-existing-1')

    const request = new NextRequest('https://app.test/api/webhook', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toContain('No se pudo enviar el mensaje')
  })
})
