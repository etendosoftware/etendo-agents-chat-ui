import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getPendingMessagesMock = vi.hoisted(() => vi.fn())
const getLabelStateMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/chatwoot/message-store', () => ({
  getChatwootPendingMessages: getPendingMessagesMock,
  getChatwootLabelState: getLabelStateMock,
}))

const originalEnv = { ...process.env }

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
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    getPendingMessagesMock.mockResolvedValue([])
    getLabelStateMock.mockResolvedValue(null)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns 400 when conversationId is missing', async () => {
    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream')
    const response = await GET(request)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('conversationId es requerido')
  })

  it('does not require Chatwoot env vars to start streaming', async () => {
    delete process.env.CHATWOOT_BASE_URL
    delete process.env.CHATWOOT_ACCOUNT_ID
    delete process.env.CHATWOOT_API_TOKEN

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=123')
    const response = await GET(request)

    expect(response.status).toBe(200)
  })

  it('emits connected event immediately on stream start', async () => {
    process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS = '9999'
    process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS = '9999'

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=42')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const firstChunk = await readChunkWithTimeout(reader, 1500)
    await reader.cancel()

    expect(firstChunk).toContain('event: connected')
    expect(firstChunk).toContain('"conversationId":"42"')
  })

  it('emits chatwoot_message event when MongoDB has a pending message', async () => {
    process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS = '1'
    process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS = '9999'

    getPendingMessagesMock.mockResolvedValue([
      {
        id: '99',
        content: 'Respuesta del bot',
        messageType: 'outgoing',
        createdAt: new Date(),
        sender: { name: 'Bot' },
        attachments: [],
      },
    ])

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=55')
    const response = await GET(request)

    const reader = response.body!.getReader()
    const firstChunk = await readChunkWithTimeout(reader, 1500)
    const secondChunk = await readChunkWithTimeout(reader, 1500)
    await reader.cancel()

    const combined = `${firstChunk}\n${secondChunk}`
    expect(combined).toContain('event: chatwoot_message')
    expect(combined).toContain('"id":"99"')
    expect(combined).toContain('Respuesta del bot')
  })

  it('does not re-emit a message that was already sent', async () => {
    process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS = '1'
    process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS = '9999'

    const message = {
      id: '77',
      content: 'Solo una vez',
      messageType: 'outgoing',
      createdAt: new Date(),
      sender: null,
      attachments: [],
    }
    getPendingMessagesMock.mockResolvedValue([message])

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=88')
    const response = await GET(request)

    const reader = response.body!.getReader()
    // Read enough chunks to let the poll loop run at least twice
    const chunks: string[] = []
    for (let i = 0; i < 4; i++) {
      try {
        chunks.push(await readChunkWithTimeout(reader, 300))
      } catch {
        break
      }
    }
    await reader.cancel()

    const combined = chunks.join('\n')
    const occurrences = (combined.match(/"id":"77"/g) ?? []).length
    expect(occurrences).toBe(1)
  })

  it('emits chatwoot_handoff when humano label appears in MongoDB', async () => {
    process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS = '9999'
    process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS = '1'

    getLabelStateMock.mockResolvedValue({ labels: ['humano'], hasHuman: true })

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=33')
    const response = await GET(request)

    const reader = response.body!.getReader()
    const firstChunk = await readChunkWithTimeout(reader, 1500)
    const secondChunk = await readChunkWithTimeout(reader, 1500)
    await reader.cancel()

    const combined = `${firstChunk}\n${secondChunk}`
    expect(combined).toContain('event: chatwoot_handoff')
    expect(combined).toContain('"human":true')
  })

  it('does not call Chatwoot API directly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    process.env.CHATWOOT_MESSAGE_POLL_INTERVAL_MS = '1'
    process.env.CHATWOOT_LABEL_POLL_INTERVAL_MS = '1'

    const { GET } = await import('../app/api/chatwoot/stream/route')
    const request = new NextRequest('https://app.test/api/chatwoot/stream?conversationId=11')
    const response = await GET(request)

    const reader = response.body!.getReader()
    await readChunkWithTimeout(reader, 500).catch(() => {})
    await reader.cancel()

    const chatwootCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('chatwoot'),
    )
    expect(chatwootCalls).toHaveLength(0)
  })
})
