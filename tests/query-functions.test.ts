import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchConversationsMock = vi.hoisted(() => vi.fn())
const fetchMessagesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/actions/conversations', () => ({
  fetchConversations: fetchConversationsMock,
}))

vi.mock('@/lib/actions/fetchMessages', () => ({
  fetchMessages: fetchMessagesMock,
}))

describe('query functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('delegates conversation list fetch to conversations action', async () => {
    fetchConversationsMock.mockResolvedValue([{ _id: '1' }])
    const { fetchConversationList } = await import('../lib/query-functions')

    const result = await fetchConversationList('agent-1', { searchTerm: 'sales', page: 2, limit: 5 })

    expect(fetchConversationsMock).toHaveBeenCalledWith('agent-1', {
      searchTerm: 'sales',
      page: 2,
      limit: 5,
    })
    expect(result).toEqual([{ _id: '1' }])
  })

  it('resolves messages query before timeout', async () => {
    fetchMessagesMock.mockResolvedValue({ messages: [{ id: 'm1' }], sessionId: 's1' })
    const { fetchMessagesForConversation } = await import('../lib/query-functions')

    const result = await fetchMessagesForConversation('conv-1', 'agent-1', 'inbox-1')

    expect(fetchMessagesMock).toHaveBeenCalledWith('conv-1', 'agent-1', 'inbox-1')
    expect(result).toEqual({ messages: [{ id: 'm1' }], sessionId: 's1' })
  })

  it('rejects messages query when timeout is reached', async () => {
    vi.useFakeTimers()
    fetchMessagesMock.mockReturnValue(new Promise(() => {}))
    const { fetchMessagesForConversation } = await import('../lib/query-functions')

    const pending = fetchMessagesForConversation('conv-timeout', 'agent-1')
    const assertion = expect(pending).rejects.toThrow('messages_query_timeout_12000')
    await vi.advanceTimersByTimeAsync(12000)
    await assertion
  })

  it('fetches link preview payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: 'Title', description: 'Desc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { fetchLinkPreviewData } = await import('../lib/query-functions')

    const data = await fetchLinkPreviewData('https://example.com/a path')

    expect(fetchMock).toHaveBeenCalledWith('/api/link-preview?url=https%3A%2F%2Fexample.com%2Fa%20path')
    expect(data).toEqual({ title: 'Title', description: 'Desc' })
  })

  it('throws when link preview endpoint responds with error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('fail', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchLinkPreviewData } = await import('../lib/query-functions')

    await expect(fetchLinkPreviewData('https://example.com')).rejects.toThrow('Failed to fetch preview')
  })
})
