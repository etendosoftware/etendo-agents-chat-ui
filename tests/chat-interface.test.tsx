import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChatInterface, { Agent } from '../components/chat-interface'
import { vi } from 'vitest'

const pushMock = vi.hoisted(() => vi.fn())
const pathnameMock = vi.hoisted(() => vi.fn(() => '/chat/sales'))
const createObjectURLMock = vi.hoisted(() => vi.fn(() => 'blob://file'))

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: pathnameMock,
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

vi.mock('../components/video-analysis', () => ({
  __esModule: true,
  default: ({ onFileUpload, disabled }: { onFileUpload: (files: File[]) => void; disabled?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onFileUpload([new File(['video'], 'clip.mp4', { type: 'video/mp4' })])}
    >
      Video Analysis
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
    global.URL.createObjectURL = createObjectURLMock
    pathnameMock.mockReturnValue('/chat/sales')
    window.fetch = vi.fn(() =>
      Promise.resolve(
        new Response('{"type":"item","content":"Hello from agent"}\n', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch
    window.gtag = vi.fn()
  })

  afterEach(() => {
    delete window.gtag
    pushMock.mockClear()
  })

  it('sends a message and forwards payload to webhook', async () => {
    const { container } = render(
      <ChatInterface
        agent={agent}
        user={null}
        conversationId="conv-1"
        initialMessages={[]}
        initialSessionId="session-1"
      />,
    )

    const textarea = screen.getByPlaceholderText('Write a message here...')
    fireEvent.change(textarea, { target: { value: 'Hola agente' } })

    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => expect(window.fetch).toHaveBeenCalledTimes(1))

    const fetchMock = window.fetch as unknown as jest.Mock
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
    const { container } = render(
      <ChatInterface
        agent={agent}
        user={null}
        initialMessages={[]}
        initialSessionId="session-xyz"
      />,
    )

    const textarea = screen.getByPlaceholderText('Write a message here...')
    fireEvent.change(textarea, { target: { value: 'Nuevo chat' } })

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => expect(window.fetch).toHaveBeenCalled())

    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'agent_message_sent',
      expect.objectContaining({
        agent_id: 'agent-1',
        conversation_id: 'session-xyz',
        has_conversation: false,
      }),
    )
  })

  it('navigates to newly created conversation when streaming response provides id', async () => {
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

    const { container } = render(
      <ChatInterface
        agent={agent}
        user={null}
        initialMessages={[]}
        initialSessionId="session-1"
      />,
    )

    const textarea = screen.getByPlaceholderText('Write a message here...')
    fireEvent.change(textarea, { target: { value: 'Hola' } })

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await screen.findByText('Streamed reply')
    expect(pushMock).toHaveBeenCalledWith('/chat/sales/new-conv')
  })

  it('envía adjuntos y marca video analysis en el payload', async () => {
    pathnameMock.mockReturnValue('/chat/support-agent')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'item', content: 'Respuesta' })}\n`))
        controller.close()
      },
    })

    window.fetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const { container } = render(
      <ChatInterface
        agent={agent}
        user={{ email: 'demo@example.com' } as any}
        conversationId="conv-files"
        initialMessages={[]}
        initialSessionId="session-attachments"
      />,
    )

    fireEvent.click(screen.getByText('Upload Mock'))
    fireEvent.click(screen.getByText('Video Analysis'))

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => expect(window.fetch).toHaveBeenCalled())

    const [[, options]] = (window.fetch as unknown as jest.Mock).mock.calls
    const payload = options!.body as FormData

    expect(payload.get('file_0')).toBeInstanceOf(File)
    expect((payload.get('file_0') as File).name).toBe('notes.txt')
    expect(payload.get('videoAnalysis')).toBe('true')
  })
})
