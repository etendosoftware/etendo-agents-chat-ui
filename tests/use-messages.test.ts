import { beforeEach, describe, expect, it, vi } from 'vitest'

const useQueryMock = vi.hoisted(() => vi.fn())
const useQueryClientMock = vi.hoisted(() => vi.fn())
const fetchMessagesForConversationMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useQueryClient: useQueryClientMock,
}))

vi.mock('@/lib/query-functions', () => ({
  fetchMessagesForConversation: fetchMessagesForConversationMock,
}))

describe('use-messages hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQueryMock.mockReturnValue({ data: null })
  })

  it('configures disabled query when conversation id is missing', async () => {
    const { useMessages } = await import('../hooks/use-messages')
    useMessages(undefined, 'agent-1')

    const options = useQueryMock.mock.calls[0][0]
    expect(options.queryKey).toEqual(['messages', '', 'agent-1', null])
    expect(options.enabled).toBe(false)
    expect(options.initialData).toBeUndefined()
    expect(options.refetchOnWindowFocus).toBe(true)
  })

  it('configures query with initial data and chatwoot options', async () => {
    const { useMessages } = await import('../hooks/use-messages')
    const initialData = { messages: [{ id: 'm1' }], sessionId: 's1' } as any

    useMessages('conv-1', 'agent-1', 'inbox-1', initialData)

    const options = useQueryMock.mock.calls[0][0]
    expect(options.queryKey).toEqual(['messages', 'conv-1', 'agent-1', 'inbox-1'])
    expect(options.enabled).toBe(true)
    expect(options.refetchOnWindowFocus).toBe(false)
    expect(options.initialData).toEqual(initialData)
  })

  it('messages query function delegates to query-functions module', async () => {
    fetchMessagesForConversationMock.mockResolvedValue({ messages: [{ id: 'm1' }], sessionId: 's1' })
    const { useMessages } = await import('../hooks/use-messages')

    useMessages('conv-2', 'agent-2', null)
    const options = useQueryMock.mock.calls[0][0]
    const data = await options.queryFn()

    expect(fetchMessagesForConversationMock).toHaveBeenCalledWith('conv-2', 'agent-2', null)
    expect(data).toEqual({ messages: [{ id: 'm1' }], sessionId: 's1' })
  })

  it('disables network fetch for draft conversation ids', async () => {
    const { useMessages } = await import('../hooks/use-messages')

    useMessages('draft:agent-1:session-1', 'agent-1')
    const options = useQueryMock.mock.calls[0][0]

    expect(options.enabled).toBe(false)
  })

  it('prefetch helper enqueues query with expected key and stale time', async () => {
    const prefetchQuery = vi.fn()
    useQueryClientMock.mockReturnValue({ prefetchQuery })
    fetchMessagesForConversationMock.mockResolvedValue({ messages: [], sessionId: null })

    const { usePrefetchMessages } = await import('../hooks/use-messages')
    const prefetch = usePrefetchMessages()

    prefetch('conv-9', 'agent-9', 'inbox-9')

    expect(prefetchQuery).toHaveBeenCalled()
    const options = prefetchQuery.mock.calls[0][0]
    expect(options.queryKey).toEqual(['messages', 'conv-9', 'agent-9', 'inbox-9'])
    expect(options.staleTime).toBe(5 * 60 * 1000)

    await options.queryFn()
    expect(fetchMessagesForConversationMock).toHaveBeenCalledWith('conv-9', 'agent-9', 'inbox-9')
  })
})
