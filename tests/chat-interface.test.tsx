import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Mock, vi } from 'vitest'

import ChatInterface, { Agent } from '../components/chat-interface'
import { renderWithIntl, createTranslator } from './utils/intl'

const pathnameMock = vi.hoisted(() => vi.fn(() => '/en/chat/sales'))
const createObjectURLMock = vi.hoisted(() => vi.fn(() => 'blob://file'))
const navigateToConversationMock = vi.hoisted(() => vi.fn())
const useMessagesMock = vi.hoisted(() => vi.fn())

const chatContextState = vi.hoisted(() => ({
  conversationId: 'conv-1' as string | undefined,
}))

const queryClientMock = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  refetchQueries: vi.fn(),
  getQueryState: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
}))

class NoopEventSource {
  url: string
  onerror: ((event: any) => void) | null = null
  constructor(url: string) {
    this.url = url
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: pathnameMock,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => queryClientMock,
  }
})

vi.mock('@/hooks/use-messages', () => ({
  useMessages: (...args: unknown[]) => useMessagesMock(...args),
}))

vi.mock('@/lib/chat-context', () => ({
  useChatContext: () => ({
    conversationId: chatContextState.conversationId,
    navigateToConversation: navigateToConversationMock,
    navigateToNewChat: vi.fn(),
  }),
}))

vi.mock('../components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/file-upload', () => ({
  __esModule: true,
  default: ({ onFileUpload, disabled }: { onFileUpload: (files: File[]) => void; disabled?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onFileUpload([new File(['hello'], 'notes.txt', { type: 'text/plain' })])}
    >
      Upload Mock
    </button>
  ),
}))

describe('ChatInterface', () => {
  const agent: Agent = {
    id: 'agent-1',
    name: 'Sales Agent',
    description: 'Helps with sales questions',
    webhookurl: 'https://example.com/webhook',
    path: '/sales',
    color: 'bg-blue-500',
    icon: '🤖',
    access_level: 'partner',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    global.URL.createObjectURL = createObjectURLMock
    pathnameMock.mockReturnValue('/en/chat/sales')
    chatContextState.conversationId = 'conv-1'

    useMessagesMock.mockReturnValue({
      data: {
        messages: [],
        sessionId: 'session-1',
        chatwootConversationId: null,
      },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    })

    window.fetch = vi.fn(() =>
      Promise.resolve(
        new Response('{"type":"item","content":"Hello from agent"}\n', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch
    window.gtag = vi.fn()
    ;(window as any).EventSource = NoopEventSource as any
  })

  afterEach(() => {
    delete window.gtag
    ;(window as any).EventSource = NoopEventSource as any
  })

  // ------------------------------------------------------------------ //
  // Search bar
  // ------------------------------------------------------------------ //

  describe('search bar', () => {
    const tSearch = createTranslator('en', 'chat.interface.search')
    const tInterface = createTranslator('en', 'chat.interface')

    const messagesWithContent = {
      messages: [
        {
          id: 'm1',
          conversationId: 'conv-1',
          agentId: 'agent-1',
          sender: 'agent' as const,
          content: 'Spring Boot 3.1.4 is available.',
          timestamp: new Date(),
        },
        {
          id: 'm2',
          conversationId: 'conv-1',
          agentId: 'agent-1',
          sender: 'user' as const,
          content: 'Thanks for the Spring Boot info.',
          timestamp: new Date(),
        },
        {
          id: 'm3',
          conversationId: 'conv-1',
          agentId: 'agent-1',
          sender: 'agent' as const,
          content: 'No problem at all.',
          timestamp: new Date(),
        },
      ],
      sessionId: 'session-1',
      chatwootConversationId: null,
    }

    function renderChat() {
      useMessagesMock.mockReturnValue({
        data: messagesWithContent,
        isPending: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      })

      return renderWithIntl(
        <ChatInterface
          agent={agent}
          user={null}
          agentPath="sales"
          initialConversationId="conv-1"
          initialMessageData={messagesWithContent}
          initialSessionId="session-1"
        />,
      )
    }

    it('opens the search bar when the search icon button is clicked', async () => {
      renderChat()

      expect(screen.queryByPlaceholderText(tSearch('placeholder'))).not.toBeInTheDocument()

      const searchBtn = screen.getByRole('button', { name: '' })
      // Find the search button (magnifying glass) — it is the first icon-only button in the header
      const allIconBtns = screen.getAllByRole('button')
      const headerSearchBtn = allIconBtns.find((btn) =>
        btn.querySelector('svg') && btn.closest('.border-b'),
      )!
      fireEvent.click(headerSearchBtn)

      expect(await screen.findByPlaceholderText(tSearch('placeholder'))).toBeInTheDocument()
    })

    it('opens the search bar on Ctrl+F and closes on Escape', async () => {
      renderChat()

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true })

      const input = await screen.findByPlaceholderText(tSearch('placeholder'))
      expect(input).toBeInTheDocument()

      fireEvent.keyDown(input, { key: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(tSearch('placeholder'))).not.toBeInTheDocument()
      })
    })

    it('shows correct match count when search term matches messages', async () => {
      renderChat()

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
      const input = await screen.findByPlaceholderText(tSearch('placeholder'))

      fireEvent.change(input, { target: { value: 'Spring Boot' } })

      await waitFor(() => {
        expect(screen.getByText(tSearch('matchCount', { current: 1, total: 2 }))).toBeInTheDocument()
      })
    })

    it('shows "No results" when the search term has no matches', async () => {
      renderChat()

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
      const input = await screen.findByPlaceholderText(tSearch('placeholder'))

      fireEvent.change(input, { target: { value: 'Django' } })

      await waitFor(() => {
        expect(screen.getByText(tSearch('noResults'))).toBeInTheDocument()
      })
    })

    it('clears search and closes bar when X button is clicked', async () => {
      renderChat()

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
      const input = await screen.findByPlaceholderText(tSearch('placeholder'))
      fireEvent.change(input, { target: { value: 'Spring Boot' } })

      // X button is the last button inside the search bar
      const searchBarContainer = input.closest('div')!.parentElement!
      const buttons = searchBarContainer.querySelectorAll('button')
      const closeBtn = buttons[buttons.length - 1] as HTMLButtonElement
      fireEvent.click(closeBtn)

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(tSearch('placeholder'))).not.toBeInTheDocument()
      })
    })

    it('navigates to next match when Enter is pressed and to previous on Shift+Enter', async () => {
      renderChat()

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
      const input = await screen.findByPlaceholderText(tSearch('placeholder'))
      fireEvent.change(input, { target: { value: 'Spring Boot' } })

      // Start at 1 of 2
      await waitFor(() => {
        expect(screen.getByText(tSearch('matchCount', { current: 1, total: 2 }))).toBeInTheDocument()
      })

      // Next match
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => {
        expect(screen.getByText(tSearch('matchCount', { current: 2, total: 2 }))).toBeInTheDocument()
      })

      // Wraps back to first
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => {
        expect(screen.getByText(tSearch('matchCount', { current: 1, total: 2 }))).toBeInTheDocument()
      })

      // Shift+Enter goes to previous (wraps to last)
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
      await waitFor(() => {
        expect(screen.getByText(tSearch('matchCount', { current: 2, total: 2 }))).toBeInTheDocument()
      })
    })
  })

  it('sends a message and forwards payload to webhook', async () => {
    const { container } = renderWithIntl(
      <ChatInterface
        agent={agent}
        user={null}
        agentPath="sales"
        initialConversationId="conv-1"
        initialMessageData={{ messages: [], sessionId: 'session-1', chatwootConversationId: null }}
        initialSessionId="session-1"
      />,
    )

    const tInterface = createTranslator('en', 'chat.interface')
    const textarea = screen.getAllByPlaceholderText(tInterface('messagePlaceholder'))[0] as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hola agente' } })

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => expect(window.fetch).toHaveBeenCalledTimes(1))

    const fetchMock = window.fetch as unknown as Mock
    const [[, options]] = fetchMock.mock.calls
    const formData = options!.body as FormData

    expect(formData.get('message')).toBe('Hola agente')
    expect(formData.get('agentId')).toBe('agent-1')
    expect(formData.get('conversationId')).toBe('conv-1')
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'agent_message_sent',
      expect.objectContaining({
        agent_id: 'agent-1',
        conversation_id: 'conv-1',
        has_conversation: true,
      }),
    )
  })

  it('falls back to session id when conversation id is missing', async () => {
    chatContextState.conversationId = undefined

    const { container } = renderWithIntl(
      <ChatInterface
        agent={agent}
        user={null}
        agentPath="sales"
        initialSessionId="session-xyz"
      />,
    )

    const tInterface = createTranslator('en', 'chat.interface')
    const textarea = screen.getAllByPlaceholderText(tInterface('messagePlaceholder'))[0] as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Nuevo chat' } })

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => expect(window.fetch).toHaveBeenCalled())

    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'agent_message_sent',
      expect.objectContaining({
        agent_id: 'agent-1',
        conversation_id: 'session-1',
        has_conversation: false,
      }),
    )
  })

  it('navigates to newly created conversation when streaming response provides id', async () => {
    chatContextState.conversationId = undefined
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ conversationId: 'new-conv' })}\n`))
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'item', content: 'Streamed' })}\n`))
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'item', content: ' reply' })}\n`))
        controller.close()
      },
    })

    window.fetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const { container } = renderWithIntl(
      <ChatInterface
        agent={agent}
        user={null}
        agentPath="sales"
        initialSessionId="session-1"
      />,
    )

    const tInterface = createTranslator('en', 'chat.interface')
    const textarea = screen.getAllByPlaceholderText(tInterface('messagePlaceholder'))[0] as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hola' } })

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(navigateToConversationMock).toHaveBeenCalledWith('new-conv', 'sales', 'en')
    })
  })

  it('sends attachments and marks video analysis in payload', async () => {
    pathnameMock.mockReturnValue('/en/chat/support-agent')

    const { container } = renderWithIntl(
      <ChatInterface
        agent={agent}
        user={{ email: 'demo@example.com' } as any}
        agentPath="sales"
        initialConversationId="conv-files"
        initialMessageData={{ messages: [], sessionId: 'session-attachments', chatwootConversationId: null }}
        initialSessionId="session-attachments"
      />,
    )

    fireEvent.click(screen.getByText('Upload Mock'))

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => expect(window.fetch).toHaveBeenCalled())

    const [[, options]] = (window.fetch as unknown as Mock).mock.calls
    const payload = options!.body as FormData

    expect(payload.get('file_0')).toBeInstanceOf(File)
    expect((payload.get('file_0') as File).name).toBe('notes.txt')
    expect(payload.get('videoAnalysis')).toBeNull()
  })

  it('sends attachments to chatwoot with empty message and mapped conversation id', async () => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-agent-integration': 'chatwoot',
      'x-chatwoot-conversation': 'chatwoot-321',
    })

    useMessagesMock.mockReturnValue({
      data: {
        messages: [],
        sessionId: 'session-chatwoot',
        chatwootConversationId: 'chatwoot-321',
      },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    })

    const fetchMock = window.fetch as unknown as Mock
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ forwarded: true, conversationId: 'chatwoot-321' }), {
        status: 200,
        headers,
      }),
    )

    const { container } = renderWithIntl(
      <ChatInterface
        agent={{ ...agent, chatwoot_inbox_identifier: 'inbox-2' }}
        user={{ email: 'guest@example.com' } as any}
        agentPath="sales"
        initialConversationId="chatwoot-conv"
        initialMessageData={{ messages: [], sessionId: 'session-chatwoot', chatwootConversationId: 'chatwoot-321' }}
        initialSessionId="session-chatwoot"
      />,
    )

    fireEvent.click(screen.getByText('Upload Mock'))

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const webhookCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/webhook')
    expect(webhookCall).toBeDefined()

    const [, options] = webhookCall!
    const formData = options!.body as FormData
    expect(formData.get('message')).toBe('')
    expect(formData.get('conversationId')).toBe('chatwoot-321')
    expect(formData.get('file_0')).toBeInstanceOf(File)
    expect((formData.get('file_0') as File).name).toBe('notes.txt')
  })
})
