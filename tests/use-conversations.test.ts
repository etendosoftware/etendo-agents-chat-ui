import { beforeEach, describe, expect, it, vi } from 'vitest'

const useInfiniteQueryMock = vi.hoisted(() => vi.fn())
const useMutationMock = vi.hoisted(() => vi.fn())
const useQueryClientMock = vi.hoisted(() => vi.fn())

const fetchConversationListMock = vi.hoisted(() => vi.fn())
const deleteConversationMock = vi.hoisted(() => vi.fn())
const updateConversationTitleMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: useInfiniteQueryMock,
  useMutation: useMutationMock,
  useQueryClient: useQueryClientMock,
  keepPreviousData: 'KEEP_PREVIOUS_DATA',
}))

vi.mock('@/lib/query-functions', () => ({
  fetchConversationList: fetchConversationListMock,
}))

vi.mock('@/lib/actions/deleteConversation', () => ({
  deleteConversation: deleteConversationMock,
}))

vi.mock('@/lib/actions/updateConversationTitle', () => ({
  updateConversationTitle: updateConversationTitleMock,
}))

describe('use-conversations hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInfiniteQueryMock.mockReturnValue({ data: null })
    useMutationMock.mockImplementation((config) => config)
  })

  it('configures infinite query with initialData when search term is empty', async () => {
    const { useConversationsInfinite } = await import('../hooks/use-conversations')
    const initialData = [{ _id: 'c1', conversationTitle: 'One' } as any]

    useConversationsInfinite('agent-1', '', initialData)

    const options = useInfiniteQueryMock.mock.calls[0][0]
    expect(options.queryKey).toEqual(['conversations', 'agent-1', 'list', ''])
    expect(options.initialPageParam).toBe(1)
    expect(options.placeholderData).toBe('KEEP_PREVIOUS_DATA')
    expect(options.initialData).toEqual({ pages: [initialData], pageParams: [1] })
  })

  it('omits initialData when search term is not empty', async () => {
    const { useConversationsInfinite } = await import('../hooks/use-conversations')
    useConversationsInfinite('agent-1', 'sales', [{ _id: 'c1' } as any])

    const options = useInfiniteQueryMock.mock.calls[0][0]
    expect(options.initialData).toBeUndefined()
  })

  it('calculates next page param based on page size', async () => {
    const { useConversationsInfinite } = await import('../hooks/use-conversations')
    useConversationsInfinite('agent-1', '')

    const options = useInfiniteQueryMock.mock.calls[0][0]
    expect(options.getNextPageParam(new Array(10).fill({}), [[], []])).toBe(3)
    expect(options.getNextPageParam(new Array(3).fill({}), [[], []])).toBeUndefined()
  })

  it('delete mutation optimistic update and rollback behavior works', async () => {
    const queryClient = {
      cancelQueries: vi.fn().mockResolvedValue(undefined),
      getQueriesData: vi.fn().mockReturnValue([[['conversations', 'agent-1'], { pages: [[{ _id: 'a' }, { _id: 'b' }]], pageParams: [1] }]]),
      setQueriesData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
    }
    useQueryClientMock.mockReturnValue(queryClient)

    const { useDeleteConversation } = await import('../hooks/use-conversations')
    const mutation = useDeleteConversation('agent-1') as any

    await mutation.mutationFn('conv-1')
    expect(deleteConversationMock).toHaveBeenCalledWith('conv-1')

    const context = await mutation.onMutate('b')
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: ['conversations', 'agent-1'] })
    expect(queryClient.setQueriesData).toHaveBeenCalled()

    mutation.onError(new Error('x'), 'b', context)
    expect(queryClient.setQueryData).toHaveBeenCalled()

    mutation.onSettled()
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations', 'agent-1'] })
  })

  it('update title mutation optimistic update and rollback behavior works', async () => {
    const queryClient = {
      cancelQueries: vi.fn().mockResolvedValue(undefined),
      getQueriesData: vi.fn().mockReturnValue([[['conversations', 'agent-1'], { pages: [[{ _id: 'a', conversationTitle: 'Old' }]], pageParams: [1] }]]),
      setQueriesData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
    }
    useQueryClientMock.mockReturnValue(queryClient)

    const { useUpdateConversationTitle } = await import('../hooks/use-conversations')
    const mutation = useUpdateConversationTitle('agent-1') as any

    await mutation.mutationFn({ id: 'a', title: 'New' })
    expect(updateConversationTitleMock).toHaveBeenCalledWith('a', 'New')

    const context = await mutation.onMutate({ id: 'a', title: 'New' })
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: ['conversations', 'agent-1'] })
    expect(queryClient.setQueriesData).toHaveBeenCalled()

    mutation.onError(new Error('x'), { id: 'a', title: 'New' }, context)
    expect(queryClient.setQueryData).toHaveBeenCalled()

    mutation.onSettled()
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations', 'agent-1'] })
  })

  it('conversation list query function forwards page/search options', async () => {
    fetchConversationListMock.mockResolvedValue([{ _id: 'x' }])
    const { useConversationsInfinite } = await import('../hooks/use-conversations')

    useConversationsInfinite('agent-1', 'term')
    const options = useInfiniteQueryMock.mock.calls[0][0]

    const result = await options.queryFn({ pageParam: 3 })
    expect(fetchConversationListMock).toHaveBeenCalledWith('agent-1', {
      searchTerm: 'term',
      page: 3,
      limit: 10,
    })
    expect(result).toEqual([{ _id: 'x' }])
  })
})
