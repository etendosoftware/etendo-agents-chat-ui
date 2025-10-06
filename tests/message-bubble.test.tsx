import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import MessageBubble from '../components/message-bubble'
import { renderWithIntl, createTranslator } from './utils/intl'

const submitFeedbackMock = vi.hoisted(() => vi.fn())
const LinkPreviewMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/actions/feedback', () => ({
  submitFeedback: submitFeedbackMock,
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
    submitFeedbackMock.mockResolvedValue({ success: true })
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

    await waitFor(() =>
      expect(submitFeedbackMock).toHaveBeenCalledWith({
        rating: 'good',
        feedbackText: undefined,
        messageId: 'msg-1',
        conversationId: 'conv-1',
        agentId: 'agent-1',
      }),
    )
  })

  it('opens dialog for negative feedback and sends comment', async () => {
    submitFeedbackMock.mockResolvedValue({ success: true })
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

    await waitFor(() =>
      expect(submitFeedbackMock).toHaveBeenCalledWith({
        rating: 'bad',
        feedbackText: 'Too generic',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        agentId: 'agent-1',
      }),
    )
  })
})
