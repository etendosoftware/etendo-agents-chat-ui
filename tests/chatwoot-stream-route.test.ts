import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalEnv = { ...process.env }
const originalFetch = global.fetch

async function readChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<string> {
  const result = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Timed out waiting for SSE chunk')), timeoutMs)
    }),
  ])

  if (result.done || !result.value) {
    return ''
  }

  return new TextDecoder().decode(result.value)
}

describe('chatwoot stream route', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it('returns 500 when required env vars are missing', async () => {
    delete process.env.CHATWOOT_BASE_URL
    delete process.env.CHATWOOT_ACCOUNT_ID
    delete process.env.CHATWOOT_API_TOKEN

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=123')
    const response = await GET(request)

    expect(response.status).toBe(500)
    expect(await response.text()).toContain('Faltan variables de entorno')
  })

  it('returns 400 when conversationId is missing', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream')
    const response = await GET(request)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('conversationId es requerido')
  })

  it('emits connected event and streams only outgoing non-private messages', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chatwoot.test'
    process.env.CHATWOOT_ACCOUNT_ID = '1'
    process.env.CHATWOOT_API_TOKEN = 'token'
    process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS = '1'
    process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS = '1'

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/messages')) {
        return new Response(
          JSON.stringify({
            messages: [
              { id: 1, message_type: 'outgoing', private: false, content: 'visible' },
              { id: 2, message_type: 'incoming', private: false, content: 'hidden incoming' },
              { id: 3, message_type: 'outgoing', private: true, content: 'hidden private' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response(JSON.stringify({ labels: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    global.fetch = fetchMock as unknown as typeof fetch

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=321')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.body).toBeTruthy()

    const reader = response.body!.getReader()
    const firstChunk = await readChunkWithTimeout(reader, 1500)
    const secondChunk = await readChunkWithTimeout(reader, 1500)

    await reader.cancel()

    const combined = `${firstChunk}\n${secondChunk}`
    expect(combined).toContain('event: connected')
    expect(combined).toContain('event: chatwoot_message')
    expect(combined).toContain('"id":1')
    expect(combined).not.toContain('"id":2')
    expect(combined).not.toContain('"id":3')
  })
})
