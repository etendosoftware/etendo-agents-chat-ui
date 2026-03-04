'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const STORAGE_KEY = 'chat-notifications-enabled'

export type NotificationPermission = 'default' | 'granted' | 'denied'

export interface UseNotificationsReturn {
  supported: boolean
  permissionState: NotificationPermission
  enabled: boolean
  requestPermission: () => Promise<void>
  toggleEnabled: () => void
  notifyNewMessage: (content: string, conversationUrl?: string, options?: { title?: string }) => void
}

export function useNotifications(agentName: string): UseNotificationsReturn {
  const supported = typeof window !== 'undefined' && 'Notification' in window

  const [permissionState, setPermissionState] = useState<NotificationPermission>(() => {
    if (!supported) return 'denied'
    return Notification.permission as NotificationPermission
  })

  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })

  const activeNotificationRef = useRef<Notification | null>(null)

  // Sync permission state on focus (user may have changed settings)
  useEffect(() => {
    if (!supported) return
    const handleFocus = () => {
      setPermissionState(Notification.permission as NotificationPermission)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [supported])

  // Close notification when user returns to tab
  useEffect(() => {
    if (!supported) return
    const handleVisibilityChange = () => {
      if (!document.hidden && activeNotificationRef.current) {
        activeNotificationRef.current.close()
        activeNotificationRef.current = null
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [supported])

  const requestPermission = useCallback(async () => {
    if (!supported) return
    try {
      const result = await Notification.requestPermission()
      setPermissionState(result as NotificationPermission)
    } catch {
      // some browsers throw if called outside user gesture
    }
  }, [supported])

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const notifyNewMessage = useCallback(
    (content: string, conversationUrl?: string, options?: { title?: string }) => {
      if (!supported) return
      if (permissionState !== 'granted') return
      if (!enabled) return
      if (!document.hidden) return

      const title = options?.title ?? agentName
      const body = content.length > 100 ? content.slice(0, 97) + '...' : content

      try {
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
        })

        notification.onclick = () => {
          window.focus()
          if (conversationUrl) {
            window.location.href = conversationUrl
          }
          notification.close()
        }

        activeNotificationRef.current = notification
      } catch {
        // ignore
      }
    },
    [supported, permissionState, enabled, agentName]
  )

  return {
    supported,
    permissionState,
    enabled,
    requestPermission,
    toggleEnabled,
    notifyNewMessage,
  }
}
