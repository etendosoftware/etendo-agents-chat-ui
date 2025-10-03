import React, { type ReactNode } from 'react'
import { render, waitFor } from '@testing-library/react'
import ChatLayout from '../components/chat-layout'
import { vi } from 'vitest'

vi.mock('../components/chat-interface', () => ({
  __esModule: true,
  default: () => <div data-testid="chat-interface" />,
}))

vi.mock('../components/ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <div data-testid="sidebar-provider">{children}</div>,
  SidebarInset: ({ children }: { children: ReactNode }) => <div data-testid="sidebar-inset">{children}</div>,
  Sidebar: ({ children }: { children: ReactNode }) => <div data-testid="sidebar">{children}</div>,
}))

vi.mock('../components/conversation-history-content', () => ({
  SidebarConversations: () => <div data-testid="sidebar-conversations" />,
}))

vi.mock('../components/global-header', () => ({
  GlobalHeader: () => <header data-testid="global-header" />,
}))

describe('ChatLayout', () => {
  const agent = {
    id: 'agent-1',
    name: 'Support Agent',
    description: 'Helps customers',
    webhookurl: 'https://example.com/hook',
    path: '/support',
    color: 'bg-green-500',
    icon: '🤖',
    access_level: 'partner',
  } as any

  const baseProps = {
    agent,
    conversationId: 'conv-1',
    initialMessages: [],
    initialSessionId: 'session-1',
    initialConversations: [],
    agentPath: 'support',
    userRole: 'partner' as const,
  }

  beforeEach(() => {
    window.gtag = vi.fn()
  })

  afterEach(() => {
    delete window.gtag
  })

  it('fires agent_view analytics for authenticated users', async () => {
    render(
      <ChatLayout
        {...baseProps}
        user={{ id: 'user-1' } as any}
      />,
    )

    await waitFor(() =>
      expect(window.gtag).toHaveBeenCalledWith(
        'event',
        'agent_view',
        expect.objectContaining({
          agent_id: 'agent-1',
          user_role: 'partner',
          has_conversation: true,
        }),
      ),
    )
  })

  it('marks guests correctly when no user session is present', async () => {
    render(
      <ChatLayout
        {...baseProps}
        user={null}
        conversationId={undefined}
        userRole={null}
      />,
    )

    await waitFor(() =>
      expect(window.gtag).toHaveBeenCalledWith(
        'event',
        'agent_view',
        expect.objectContaining({
          user_role: 'guest',
          has_conversation: false,
        }),
      ),
    )
  })
})
