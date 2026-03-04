import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { NotificationProvider, useNotificationContext } from '@/lib/notification-context'

// Mock Notification API
const MockNotification = vi.fn() as any
MockNotification.permission = 'default' as NotificationPermission
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

describe('useNotificationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    MockNotification.permission = 'default' as NotificationPermission
    MockNotification.requestPermission = vi.fn().mockResolvedValue('granted')
  })

  it('returns null when used outside provider', () => {
    const { result } = renderHook(() => useNotificationContext())
    expect(result.current).toBeNull()
  })

  it('returns notification context when inside provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider agentName="TestAgent">{children}</NotificationProvider>
    )
    const { result } = renderHook(() => useNotificationContext(), { wrapper })
    expect(result.current).not.toBeNull()
    expect(result.current?.supported).toBeDefined()
  })

  it('auto-requests permission when permission is default', async () => {
    MockNotification.permission = 'default' as NotificationPermission
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider agentName="TestAgent">{children}</NotificationProvider>
    )
    renderHook(() => useNotificationContext(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(MockNotification.requestPermission).toHaveBeenCalled()
  })

  it('does not auto-request permission when already granted', async () => {
    MockNotification.permission = 'granted' as NotificationPermission
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider agentName="TestAgent">{children}</NotificationProvider>
    )
    renderHook(() => useNotificationContext(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(MockNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('does not auto-request permission when already denied', async () => {
    MockNotification.permission = 'denied' as NotificationPermission
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider agentName="TestAgent">{children}</NotificationProvider>
    )
    renderHook(() => useNotificationContext(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(MockNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('exposes notifyNewMessage function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider agentName="TestAgent">{children}</NotificationProvider>
    )
    const { result } = renderHook(() => useNotificationContext(), { wrapper })
    expect(typeof result.current?.notifyNewMessage).toBe('function')
  })

  it('exposes toggleEnabled function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider agentName="TestAgent">{children}</NotificationProvider>
    )
    const { result } = renderHook(() => useNotificationContext(), { wrapper })
    expect(typeof result.current?.toggleEnabled).toBe('function')
  })

  it('exposes requestPermission function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NotificationProvider agentName="TestAgent">{children}</NotificationProvider>
    )
    const { result } = renderHook(() => useNotificationContext(), { wrapper })
    expect(typeof result.current?.requestPermission).toBe('function')
  })
})
