'use client'

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useNotifications } from '@/hooks/use-notifications'

type NotificationContextValue = ReturnType<typeof useNotifications>

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({
  children,
  agentName,
}: {
  children: ReactNode
  agentName: string
}) {
  const notifications = useNotifications(agentName)
  const hasAutoRequestedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default' && !hasAutoRequestedRef.current) {
      hasAutoRequestedRef.current = true
      notifications.requestPermission()
    }
  }, [])

  return (
    <NotificationContext.Provider value={notifications}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotificationContext(): NotificationContextValue | null {
  return useContext(NotificationContext)
}
