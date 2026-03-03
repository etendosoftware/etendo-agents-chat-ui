'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'

interface ChatContextValue {
  conversationId: string | undefined
  navigateToConversation: (id: string, agentPath: string, locale: string) => void
  navigateToConversationSoft: (id: string, agentPath: string, locale: string) => void
  navigateToNewChat: (agentPath: string, locale: string) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatContextProvider({
  children,
  initialConversationId,
}: {
  children: ReactNode
  initialConversationId?: string
}) {
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId,
  )

  // Sync with browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const pathParts = window.location.pathname.split('/')
      const chatIndex = pathParts.indexOf('chat')
      // URL format: /locale/chat/agentPath/conversationId
      const id =
        chatIndex !== -1 && pathParts.length > chatIndex + 2
          ? pathParts[chatIndex + 2]
          : undefined
      setConversationId(id || undefined)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateToConversation = useCallback(
    (id: string, agentPath: string, locale: string) => {
      setConversationId(id)
      router.push(`/${locale}/chat/${agentPath}/${id}`, { scroll: false })
    },
    [router],
  )

  // Updates conversationId and URL without triggering a server re-render.
  // Use this when all data is already available client-side (e.g. right after
  // creating a Chatwoot conversation) to avoid intermediate render flickers
  // caused by router.push's RSC round-trip.
  const navigateToConversationSoft = useCallback(
    (id: string, agentPath: string, locale: string) => {
      setConversationId(id)
      window.history.pushState({}, '', `/${locale}/chat/${agentPath}/${id}`)
    },
    [],
  )

  const navigateToNewChat = useCallback(
    (agentPath: string, locale: string) => {
      setConversationId(undefined)
      router.push(`/${locale}/chat/${agentPath}`, { scroll: false })
    },
    [router],
  )

  return (
    <ChatContext.Provider
      value={{ conversationId, navigateToConversation, navigateToConversationSoft, navigateToNewChat }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChatContext must be used within a ChatContextProvider')
  }
  return context
}
