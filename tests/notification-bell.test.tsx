import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { NotificationBell } from '@/components/notification-bell'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock sonner
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

// Mock Notification API
const MockNotification = vi.fn() as any
MockNotification.permission = 'granted' as NotificationPermission
MockNotification.requestPermission = vi.fn().mockResolvedValue('granted')
Object.defineProperty(global, 'Notification', {
  value: MockNotification,
  writable: true,
  configurable: true,
})

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

function makeCtx(overrides = {}) {
  return {
    supported: true,
    permissionState: 'granted' as const,
    enabled: true,
    requestPermission: vi.fn(),
    toggleEnabled: vi.fn(),
    notifyNewMessage: vi.fn(),
    ...overrides,
  }
}

// We need to expose the context for testing - import the actual context
// Since notification-context exports useNotificationContext but not NotificationContext directly,
// we'll test through the provider or mock the hook
vi.mock('@/lib/notification-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notification-context')>()
  return {
    ...actual,
    useNotificationContext: vi.fn(),
  }
})

import { useNotificationContext } from '@/lib/notification-context'
const mockUseNotificationContext = vi.mocked(useNotificationContext)

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('renders nothing when ctx is null', () => {
    mockUseNotificationContext.mockReturnValue(null)
    const { container } = render(<NotificationBell />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when not supported', () => {
    mockUseNotificationContext.mockReturnValue(makeCtx({ supported: false }) as any)
    const { container } = render(<NotificationBell />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Bell icon when active (granted + enabled)', () => {
    mockUseNotificationContext.mockReturnValue(makeCtx({ permissionState: 'granted', enabled: true }) as any)
    render(<NotificationBell />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('renders BellOff icon when disabled (granted + enabled=false)', () => {
    mockUseNotificationContext.mockReturnValue(makeCtx({ permissionState: 'granted', enabled: false }) as any)
    render(<NotificationBell />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls requestPermission when permission is default', () => {
    const ctx = makeCtx({ permissionState: 'default' })
    mockUseNotificationContext.mockReturnValue(ctx as any)
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(ctx.requestPermission).toHaveBeenCalledOnce()
  })

  it('calls toggleEnabled when permission is granted', () => {
    const ctx = makeCtx({ permissionState: 'granted', enabled: true })
    mockUseNotificationContext.mockReturnValue(ctx as any)
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(ctx.toggleEnabled).toHaveBeenCalledOnce()
  })

  it('shows toast when permission is denied', async () => {
    const { toast } = await import('sonner')
    const ctx = makeCtx({ permissionState: 'denied' })
    mockUseNotificationContext.mockReturnValue(ctx as any)
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(toast.info).toHaveBeenCalled()
  })

  it('button has aria-label', () => {
    mockUseNotificationContext.mockReturnValue(makeCtx() as any)
    render(<NotificationBell />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label')
  })

  it('does not call toggleEnabled when permission is default', () => {
    const ctx = makeCtx({ permissionState: 'default' })
    mockUseNotificationContext.mockReturnValue(ctx as any)
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(ctx.toggleEnabled).not.toHaveBeenCalled()
  })

  it('does not call requestPermission when permission is granted', () => {
    const ctx = makeCtx({ permissionState: 'granted' })
    mockUseNotificationContext.mockReturnValue(ctx as any)
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(ctx.requestPermission).not.toHaveBeenCalled()
  })

  it('does not call requestPermission when permission is denied', () => {
    const ctx = makeCtx({ permissionState: 'denied' })
    mockUseNotificationContext.mockReturnValue(ctx as any)
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(ctx.requestPermission).not.toHaveBeenCalled()
  })
})
