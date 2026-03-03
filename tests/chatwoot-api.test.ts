import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const originalEnv = { ...process.env }
const originalFetch = global.fetch

describe('fetchChatwootConversationMessages', () => {
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

  it('returns empty array when credentials are missing', async () => {
    delete process.env.CHATWOOT_BASE_URL
    delete process.env.CHATWOOT_ACCOUNT_ID
    delete process.env.CHATWOOT_API_TOKEN

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('123')

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith('[chatwoot] Credenciales faltantes para obtener mensajes')
  })

  it('normalizes messages and filters unsupported ones', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload: [
            {
              id: 1,
              message_type: 'outgoing',
              content: 'Agent',
              created_at: 1700000000000,
              attachments: [
                {
                  id: 11,
                  data_url: 'https://files.example.com/image.png',
                  file_type: 'image/png',
                  file_size: 2048,
                  filename: 'image.png',
                },
                {
                  id: 12,
                  data_url: 'https://files.example.com/audio.mp3',
                  file_type: 'audio/mpeg',
                  file_size: 1024,
                  filename: 'audio.mp3',
                },
              ],
            },
            { id: 2, message_type: 'incoming', content: 'User', created_at: '2024-02-20T10:00:00Z' },
            { id: 3, message_type: 'activity', content: 'Ignored' },
            { id: 4, message_type: 'outgoing', content: 'Private', private: true },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('456')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatwoot.test/api/v1/accounts/1/conversations/456/messages?page=1',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({ 'api_access_token': 'token' }),
      }),
    )

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: '1',
      content: 'Agent',
      sender: 'agent',
    })
    expect(result[0].createdAt).toBeInstanceOf(Date)
    expect(result[0].attachments).toHaveLength(2)
    expect(result[0].attachments[0]).toMatchObject({
      name: 'image.png',
      type: 'image/png',
      size: 2048,
      url: 'https://files.example.com/image.png',
    })
    expect(result[0].audioUrl).toBe('https://files.example.com/audio.mp3')
    expect(result[1]).toMatchObject({
      id: '2',
      content: 'User',
      sender: 'user',
    })
    expect(result[1].attachments).toHaveLength(0)
    expect(result[1].audioUrl).toBeNull()
  })

  it('returns empty array when Chatwoot responds with an error', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('error', {
        status: 500,
        statusText: 'Server Error',
      }),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')

    const result = await fetchChatwootConversationMessages('999')

    expect(result).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns empty array for empty conversationId without fetching', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('')

    expect(result).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns empty array for whitespace-only conversationId without fetching', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('   ')

    expect(result).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('extracts messages from data.data array response format', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 10, message_type: 'outgoing', content: 'From data.data', created_at: 1700000000000 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('123')

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('From data.data')
    expect(result[0].sender).toBe('agent')
  })

  it('interprets unix timestamp in seconds by multiplying by 1000', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const unixSeconds = 1700000000 // less than 9999999999 → should be multiplied by 1000
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload: [
            { id: 20, message_type: 'incoming', content: 'Timed', created_at: unixSeconds },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('555')

    expect(result[0].createdAt.getTime()).toBe(unixSeconds * 1000)
  })

  it('returns empty string when message content is null', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload: [
            { id: 30, message_type: 'outgoing', content: null, created_at: 1700000000000 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('666')

    expect(result[0].content).toBe('')
  })

  it('skips messages that have no id, message_id, or created_at field', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload: [
            { message_type: 'outgoing', content: 'No ID here' }, // no id, message_id, or created_at
            { id: 40, message_type: 'incoming', content: 'Has ID', created_at: 1700000000000 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('777')

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Has ID')
  })

  it('handles numeric message_type: 0 = user, 1 = agent, 2 = activity (filtered)', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload: [
            { id: 50, message_type: 1, content: 'Agent numeric', created_at: 1700000000000 },
            { id: 51, message_type: 0, content: 'User numeric', created_at: 1700000000001 },
            { id: 52, message_type: 2, content: 'Activity numeric', created_at: 1700000000002 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const { fetchChatwootConversationMessages } = await import('../lib/chatwoot/api')
    const result = await fetchChatwootConversationMessages('888')

    expect(result).toHaveLength(2)
    expect(result[0].sender).toBe('agent')
    expect(result[1].sender).toBe('user')
  })
})
