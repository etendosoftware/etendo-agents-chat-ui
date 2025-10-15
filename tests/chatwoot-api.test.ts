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
      'https://chatwoot.test/api/v1/accounts/1/conversations/456/messages',
      expect.objectContaining({
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
})
