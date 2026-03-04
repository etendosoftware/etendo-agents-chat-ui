import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import MessageBubble from '../components/message-bubble'
import { renderWithIntl, createTranslator } from './utils/intl'

const submitFeedbackMutationMock = vi.hoisted(() => vi.fn())
const LinkPreviewMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-feedback', () => ({
  useFeedback: () => ({ mutate: submitFeedbackMutationMock }),
}))

vi.mock('../components/link-preview', () => ({
  __esModule: true,
  default: (props: { url: string }) => {
    LinkPreviewMock(props)
    return <div data-testid="link-preview" data-url={props.url} />
  },
}))

describe('MessageBubble', () => {
  const baseAgent = {
    id: 'agent-1',
    name: 'Support Agent',
    description: 'Helps you',
    webhookurl: 'https://example.com',
    path: '/support',
    color: 'bg-green-500',
    icon: '🤖',
    access_level: 'partner',
  } as const

  const baseUser = { id: 'user-1', email: 'user@example.com' } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders markdown, youtube embeds and link previews', () => {
    const message = {
      id: 'msg-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      sender: 'agent' as const,
      content: 'Check this video https://www.youtube.com/watch?v=dQw4w9WgXcQ and site https://example.com',
      timestamp: new Date(),
    }

    renderWithIntl(
      <MessageBubble
        message={message}
        agent={baseAgent}
        user={baseUser}
        userAvatarUrl={null}
      />,
    )

    expect(document.querySelector('iframe')).toBeInTheDocument()
    expect(LinkPreviewMock).toHaveBeenCalledWith({ url: 'https://example.com' })
    expect(screen.getByTestId('link-preview')).toBeInTheDocument()
  })

  it('submits positive feedback immediately when thumbs up clicked', async () => {
    const message = {
      id: 'msg-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      sender: 'agent' as const,
      content: 'Response content',
      timestamp: new Date(),
    }

    renderWithIntl(
      <MessageBubble
        message={message}
        agent={baseAgent}
        user={baseUser}
        userAvatarUrl={null}
      />,
    )

    const thumbsUp = screen.getAllByRole('button').find(btn => btn.querySelector('svg')) as HTMLButtonElement
    fireEvent.click(thumbsUp)

    await waitFor(() => expect(submitFeedbackMutationMock).toHaveBeenCalled())

    const [payload] = submitFeedbackMutationMock.mock.calls[0]
    expect(payload).toEqual({
      rating: 'good',
      feedbackText: undefined,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
    })
  })

  describe('search highlighting', () => {
    const highlightMessage = {
      id: 'msg-h',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      sender: 'agent' as const,
      content: 'Spring Boot 3.1.4 is the latest release.',
      timestamp: new Date(),
    }

    it('renders <mark> tags around matched text when highlightTerm is provided', async () => {
      const { container } = renderWithIntl(
        <MessageBubble
          message={highlightMessage}
          agent={baseAgent}
          user={baseUser}
          userAvatarUrl={null}
          highlightTerm="Spring Boot"
        />,
      )

      await waitFor(() => {
        const marks = container.querySelectorAll('mark')
        expect(marks.length).toBeGreaterThan(0)
        expect(marks[0].textContent).toBe('Spring Boot')
      })
    })

    it('matching is case-insensitive', async () => {
      const { container } = renderWithIntl(
        <MessageBubble
          message={highlightMessage}
          agent={baseAgent}
          user={baseUser}
          userAvatarUrl={null}
          highlightTerm="spring boot"
        />,
      )

      await waitFor(() => {
        const marks = container.querySelectorAll('mark')
        expect(marks.length).toBeGreaterThan(0)
      })
    })

    it('renders no <mark> tags when highlightTerm does not match', async () => {
      const { container } = renderWithIntl(
        <MessageBubble
          message={highlightMessage}
          agent={baseAgent}
          user={baseUser}
          userAvatarUrl={null}
          highlightTerm="Django"
        />,
      )

      await waitFor(() => {
        expect(container.querySelectorAll('mark').length).toBe(0)
        expect(container.textContent).toContain('Spring Boot 3.1.4')
      })
    })

    it('renders no <mark> tags when highlightTerm is not provided', async () => {
      const { container } = renderWithIntl(
        <MessageBubble
          message={highlightMessage}
          agent={baseAgent}
          user={baseUser}
          userAvatarUrl={null}
        />,
      )

      await waitFor(() => {
        expect(container.querySelectorAll('mark').length).toBe(0)
        expect(container.textContent).toContain('Spring Boot 3.1.4')
      })
    })

    it('applies ring class when isActiveMatch is true', async () => {
      const { container } = renderWithIntl(
        <MessageBubble
          message={highlightMessage}
          agent={baseAgent}
          user={baseUser}
          userAvatarUrl={null}
          highlightTerm="Spring Boot"
          isActiveMatch={true}
        />,
      )

      await waitFor(() => {
        const bubble = container.querySelector('.ring-2.ring-yellow-400')
        expect(bubble).toBeInTheDocument()
      })
    })

    it('does not apply ring class when isActiveMatch is false', async () => {
      const { container } = renderWithIntl(
        <MessageBubble
          message={highlightMessage}
          agent={baseAgent}
          user={baseUser}
          userAvatarUrl={null}
          highlightTerm="Spring Boot"
          isActiveMatch={false}
        />,
      )

      await waitFor(() => {
        const bubble = container.querySelector('.ring-2.ring-yellow-400')
        expect(bubble).not.toBeInTheDocument()
      })
    })
  })

  it('opens dialog for negative feedback and sends comment', async () => {
    const message = {
      id: 'msg-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
      sender: 'agent' as const,
      content: 'Response content',
      timestamp: new Date(),
    }

    renderWithIntl(
      <MessageBubble
        message={message}
        agent={baseAgent}
        user={baseUser}
        userAvatarUrl={null}
      />,
    )

    const buttons = screen.getAllByRole('button') as HTMLButtonElement[]
    const thumbsDown = buttons[buttons.length - 1]
    fireEvent.click(thumbsDown)

    const tFeedback = createTranslator('en', 'chat.feedback')
    const textarea = await screen.findByPlaceholderText(tFeedback('dialog.placeholder'))
    fireEvent.change(textarea, { target: { value: 'Too generic' } })

    const submitButton = screen.getByRole('button', { name: tFeedback('dialog.submit') })
    fireEvent.click(submitButton)

    await waitFor(() => expect(submitFeedbackMutationMock).toHaveBeenCalled())

    const [payload] = submitFeedbackMutationMock.mock.calls[0]
    expect(payload).toEqual({
      rating: 'bad',
      feedbackText: 'Too generic',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      agentId: 'agent-1',
    })
  })
})
