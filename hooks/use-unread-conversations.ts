'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Conversation } from '@/lib/actions/chat'

const STORAGE_KEY = 'chat-last-read-at'

type LastReadMap = Record<string, number> // conversationId -> timestamp ms

function readFromStorage(): LastReadMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LastReadMap) : {}
  } catch {
    return {}
  }
}

function writeToStorage(map: LastReadMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function markConversationRead(conversationId: string): void {
  if (typeof window === 'undefined') return
  const map = readFromStorage()
  map[conversationId] = Date.now()
  writeToStorage(map)
  // Notify other hooks in the same tab
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
}

export function useUnreadConversations(
  conversations: Conversation[],
  activeConversationId?: string
) {
  const [lastReadMap, setLastReadMap] = useState<LastReadMap>(readFromStorage)

  // Sync from storage on mount + cross-tab storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        setLastReadMap(readFromStorage())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Auto-mark active conversation as read
  useEffect(() => {
    if (!activeConversationId) return
    const map = readFromStorage()
    map[activeConversationId] = Date.now()
    writeToStorage(map)
    setLastReadMap({ ...map })
  }, [activeConversationId])

  const isUnread = useCallback(
    (conversation: Conversation): boolean => {
      const lastReadAt = lastReadMap[conversation._id]
      if (!lastReadAt) return false
      const updatedAt = new Date(conversation.updatedAt).getTime()
      return updatedAt > lastReadAt
    },
    [lastReadMap]
  )

  const unreadCount = conversations.filter(
    (c) => c._id !== activeConversationId && isUnread(c)
  ).length

  return { isUnread, unreadCount }
}
