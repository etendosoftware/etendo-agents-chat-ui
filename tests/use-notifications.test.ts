import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNotifications } from '@/hooks/use-notifications'

// Mock Notification API
const mockNotificationInstance = {
  close: vi.fn(),
  onclick: null as ((e: Event) => void) | null,
}

const MockNotification = vi.fn(() => mockNotificationInstance)
MockNotification.permission = 'default' as NotificationPermission
MockNotification.requestPermission = vi.fn().mockResolvedValue('granted')

Object.defineProperty(global, 'Notification', {
  value: MockNotification,
  writable: true,
  configurable: true,
})

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

// Mock document.hidden
Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true })

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    MockNotification.permission = 'default' as NotificationPermission
    MockNotification.requestPermission = vi.fn().mockResolvedValue('granted')
    ;(document as any).hidden = true
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns supported=true when Notification is available', () => {
    const { result } = renderHook(() => useNotifications('TestAgent'))
    expect(result.current.supported).toBe(true)
  })

  it('initializes permissionState from Notification.permission', () => {
    MockNotification.permission = 'granted' as NotificationPermission
    const { result } = renderHook(() => useNotifications('TestAgent'))
    expect(result.current.permissionState).toBe('granted')
  })

  it('initializes enabled=true when no localStorage value', () => {
    const { result } = renderHook(() => useNotifications('TestAgent'))
    expect(result.current.enabled).toBe(true)
  })

  it('reads enabled from localStorage', () => {
    localStorageMock.setItem('chat-notifications-enabled', 'false')
    const { result } = renderHook(() => useNotifications('TestAgent'))
    expect(result.current.enabled).toBe(false)
  })

  it('requestPermission calls Notification.requestPermission', async () => {
    const { result } = renderHook(() => useNotifications('TestAgent'))
    await act(async () => {
      await result.current.requestPermission()
    })
    expect(MockNotification.requestPermission).toHaveBeenCalledOnce()
  })

  it('updates permissionState after requestPermission resolves granted', async () => {
    MockNotification.requestPermission = vi.fn().mockResolvedValue('granted')
    const { result } = renderHook(() => useNotifications('TestAgent'))
    await act(async () => {
      await result.current.requestPermission()
    })
    expect(result.current.permissionState).toBe('granted')
  })

  it('updates permissionState after requestPermission resolves denied', async () => {
    MockNotification.requestPermission = vi.fn().mockResolvedValue('denied')
    const { result } = renderHook(() => useNotifications('TestAgent'))
    await act(async () => {
      await result.current.requestPermission()
    })
    expect(result.current.permissionState).toBe('denied')
  })

  it('toggleEnabled flips enabled state', () => {
    const { result } = renderHook(() => useNotifications('TestAgent'))
    expect(result.current.enabled).toBe(true)
    act(() => { result.current.toggleEnabled() })
    expect(result.current.enabled).toBe(false)
    act(() => { result.current.toggleEnabled() })
    expect(result.current.enabled).toBe(true)
  })

  it('toggleEnabled persists to localStorage', () => {
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.toggleEnabled() })
    expect(localStorageMock.getItem('chat-notifications-enabled')).toBe('false')
  })

  it('notifyNewMessage creates a Notification when conditions are met', () => {
    MockNotification.permission = 'granted' as NotificationPermission
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.notifyNewMessage('Hello!') })
    expect(MockNotification).toHaveBeenCalledWith('TestAgent', expect.objectContaining({ body: 'Hello!' }))
  })

  it('notifyNewMessage does not fire when tab is visible', () => {
    MockNotification.permission = 'granted' as NotificationPermission
    ;(document as any).hidden = false
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.notifyNewMessage('Hello!') })
    expect(MockNotification).not.toHaveBeenCalled()
  })

  it('notifyNewMessage does not fire when permission is denied', () => {
    MockNotification.permission = 'denied' as NotificationPermission
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.notifyNewMessage('Hello!') })
    expect(MockNotification).not.toHaveBeenCalled()
  })

  it('notifyNewMessage does not fire when enabled=false', async () => {
    MockNotification.permission = 'granted' as NotificationPermission
    localStorageMock.setItem('chat-notifications-enabled', 'false')
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.notifyNewMessage('Hello!') })
    expect(MockNotification).not.toHaveBeenCalled()
  })

  it('notifyNewMessage truncates long content to 100 chars', () => {
    MockNotification.permission = 'granted' as NotificationPermission
    const { result } = renderHook(() => useNotifications('TestAgent'))
    const long = 'a'.repeat(150)
    act(() => { result.current.notifyNewMessage(long) })
    expect(MockNotification).toHaveBeenCalledWith('TestAgent', expect.objectContaining({ body: 'a'.repeat(97) + '...' }))
  })

  it('notifyNewMessage uses custom title from options', () => {
    MockNotification.permission = 'granted' as NotificationPermission
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.notifyNewMessage('Hello!', undefined, { title: 'Custom Title' }) })
    expect(MockNotification).toHaveBeenCalledWith('Custom Title', expect.anything())
  })

  it('notification onclick navigates to conversationUrl', () => {
    MockNotification.permission = 'granted' as NotificationPermission
    const mockFocus = vi.fn()
    vi.spyOn(window, 'focus').mockImplementation(mockFocus)
    const originalLocation = window.location
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
      configurable: true,
    })
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.notifyNewMessage('Hello!', '/en/chat/support/conv-123') })
    act(() => {
      if (mockNotificationInstance.onclick) {
        mockNotificationInstance.onclick(new Event('click'))
      }
    })
    expect(mockFocus).toHaveBeenCalled()
    expect(window.location.href).toBe('/en/chat/support/conv-123')
    Object.defineProperty(window, 'location', { value: originalLocation, configurable: true })
  })

  it('notification onclick focuses window even without conversationUrl', () => {
    MockNotification.permission = 'granted' as NotificationPermission
    const mockFocus = vi.fn()
    vi.spyOn(window, 'focus').mockImplementation(mockFocus)
    const { result } = renderHook(() => useNotifications('TestAgent'))
    act(() => { result.current.notifyNewMessage('Hello!') })
    act(() => {
      if (mockNotificationInstance.onclick) {
        mockNotificationInstance.onclick(new Event('click'))
      }
    })
    expect(mockFocus).toHaveBeenCalled()
  })
})
