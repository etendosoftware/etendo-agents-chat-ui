import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUnreadConversations, markConversationRead } from '@/hooks/use-unread-conversations'
import type { Conversation } from '@/lib/actions/chat'

const STORAGE_KEY = 'chat-last-read-at'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

function makeConversation(id: string, updatedAt: Date): Conversation {
  return {
    _id: id,
    conversationTitle: `Conv ${id}`,
    agentId: 'agent1',
    userId: 'user1',
    sessionId: 'sess1',
    messages: [],
    createdAt: new Date('2024-01-01'),
    updatedAt,
  } as unknown as Conversation
}

describe('markConversationRead', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes timestamp to localStorage', () => {
    markConversationRead('conv-1')
    const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!)
    expect(stored['conv-1']).toBe(new Date('2024-06-01T12:00:00Z').getTime())
  })

  it('merges with existing entries', () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'conv-0': 1000 }))
    markConversationRead('conv-1')
    const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!)
    expect(stored['conv-0']).toBe(1000)
    expect(stored['conv-1']).toBeDefined()
  })

  it('dispatches a storage event', () => {
    const handler = vi.fn()
    window.addEventListener('storage', handler)
    markConversationRead('conv-1')
    expect(handler).toHaveBeenCalledOnce()
    window.removeEventListener('storage', handler)
  })
})

describe('useUnreadConversations', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('isUnread returns false when no lastReadAt exists', () => {
    const conv = makeConversation('c1', new Date('2024-06-01T11:00:00Z'))
    const { result } = renderHook(() => useUnreadConversations([conv], undefined))
    expect(result.current.isUnread(conv)).toBe(false)
  })

  it('isUnread returns false when conversation was updated before lastReadAt', () => {
    const readTime = new Date('2024-06-01T11:00:00Z').getTime()
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'c1': readTime }))
    const conv = makeConversation('c1', new Date('2024-06-01T10:00:00Z'))
    const { result } = renderHook(() => useUnreadConversations([conv], undefined))
    expect(result.current.isUnread(conv)).toBe(false)
  })

  it('isUnread returns true when conversation was updated after lastReadAt', () => {
    const readTime = new Date('2024-06-01T10:00:00Z').getTime()
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'c1': readTime }))
    const conv = makeConversation('c1', new Date('2024-06-01T11:00:00Z'))
    const { result } = renderHook(() => useUnreadConversations([conv], undefined))
    expect(result.current.isUnread(conv)).toBe(true)
  })

  it('unreadCount counts unread non-active conversations', () => {
    const readTime = new Date('2024-06-01T10:00:00Z').getTime()
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'c1': readTime, 'c2': readTime }))
    const c1 = makeConversation('c1', new Date('2024-06-01T11:00:00Z'))
    const c2 = makeConversation('c2', new Date('2024-06-01T11:00:00Z'))
    const { result } = renderHook(() => useUnreadConversations([c1, c2], 'c1'))
    // c1 is active so excluded; c2 is unread
    expect(result.current.unreadCount).toBe(1)
  })

  it('auto-marks activeConversationId as read on change', () => {
    const { rerender } = renderHook(
      ({ active }) => useUnreadConversations([], active),
      { initialProps: { active: undefined as string | undefined } }
    )
    act(() => {
      rerender({ active: 'conv-99' })
    })
    const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!)
    expect(stored['conv-99']).toBeDefined()
  })

  it('syncs state when storage event fires', () => {
    const conv = makeConversation('c1', new Date('2024-06-01T11:00:00Z'))
    const { result } = renderHook(() => useUnreadConversations([conv], undefined))
    expect(result.current.isUnread(conv)).toBe(false)

    act(() => {
      // Simulate another tab marking conversation as read before updatedAt
      const map = { 'c1': new Date('2024-06-01T10:00:00Z').getTime() }
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(map))
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    })

    // c1 updatedAt (11:00) > lastRead (10:00) → unread
    expect(result.current.isUnread(conv)).toBe(true)
  })

  it('unreadCount is 0 when no conversations', () => {
    const { result } = renderHook(() => useUnreadConversations([], undefined))
    expect(result.current.unreadCount).toBe(0)
  })

  it('unreadCount excludes active conversation', () => {
    const readTime = new Date('2024-06-01T10:00:00Z').getTime()
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'c1': readTime }))
    const conv = makeConversation('c1', new Date('2024-06-01T11:00:00Z'))
    const { result } = renderHook(() => useUnreadConversations([conv], 'c1'))
    expect(result.current.unreadCount).toBe(0)
  })
})
