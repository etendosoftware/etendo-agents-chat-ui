import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatContextProvider, useChatContext } from '../lib/chat-context'

const pushMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

describe('ChatContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Reset URL to root after each test that manipulates history
    window.history.pushState({}, '', '/')
  })

  function renderContext(initialConversationId?: string) {
    return renderHook(() => useChatContext(), {
      wrapper: ({ children }) => (
        <ChatContextProvider initialConversationId={initialConversationId}>
          {children}
        </ChatContextProvider>
      ),
    })
  }

  it('throws when useChatContext is used outside ChatContextProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useChatContext())).toThrow(
      'useChatContext must be used within a ChatContextProvider',
    )
    consoleSpy.mockRestore()
  })

  it('initializes conversationId from the initialConversationId prop', () => {
    const { result } = renderContext('conv-initial')
    expect(result.current.conversationId).toBe('conv-initial')
  })

  it('initializes conversationId as undefined when no prop is provided', () => {
    const { result } = renderContext()
    expect(result.current.conversationId).toBeUndefined()
  })

  it('navigateToConversation updates conversationId and calls router.push', () => {
    const { result } = renderContext()

    act(() => {
      result.current.navigateToConversation('conv-1', 'my-agent', 'en')
    })

    expect(result.current.conversationId).toBe('conv-1')
    expect(pushMock).toHaveBeenCalledWith('/en/chat/my-agent/conv-1', { scroll: false })
  })

  it('navigateToConversationSoft updates conversationId via history.pushState without router.push', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    const { result } = renderContext()

    act(() => {
      result.current.navigateToConversationSoft('conv-soft', 'my-agent', 'es')
    })

    expect(result.current.conversationId).toBe('conv-soft')
    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/es/chat/my-agent/conv-soft')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('navigateToNewChat clears conversationId and calls router.push to agent root', () => {
    const { result } = renderContext('existing-conv')

    act(() => {
      result.current.navigateToNewChat('my-agent', 'en')
    })

    expect(result.current.conversationId).toBeUndefined()
    expect(pushMock).toHaveBeenCalledWith('/en/chat/my-agent', { scroll: false })
  })

  it('popstate event extracts conversationId from the URL pathname', () => {
    const { result } = renderContext()

    // pushState updates window.location.pathname without firing popstate
    window.history.pushState({}, '', '/en/chat/my-agent/conv-from-url')

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current.conversationId).toBe('conv-from-url')
  })

  it('popstate sets conversationId to undefined when URL has no conversation segment', () => {
    const { result } = renderContext('prev-conv')

    window.history.pushState({}, '', '/en/chat/my-agent')

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current.conversationId).toBeUndefined()
  })
})
