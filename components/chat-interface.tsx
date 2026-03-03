'use client'

import type React from "react"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Send, Bot, UserRound } from "lucide-react"
import MessageBubble from "./message-bubble"
import FileUpload from "./file-upload"
import AudioRecorder from "./audio-recorder"
import { toast } from "sonner"
import { User } from "@supabase/supabase-js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Separator } from "./ui/separator"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useChatContext } from "@/lib/chat-context"
import { useMessages } from "@/hooks/use-messages"
import { useQueryClient } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import { queryKeys } from "@/lib/query-keys"
import type { FetchMessagesResult } from "@/lib/actions/fetchMessages"

export interface Agent {
  id: string
  name: string
  description: string
  webhookurl: string
  path: string
  color: string
  icon: string
  access_level: "public" | "non_client" | "partner" | "admin"
  requires_email?: boolean
  chatwoot_inbox_identifier?: string | null
}

export interface AgentPromptSuggestion {
  id?: string
  content: string
}

export interface Message {
  id: string
  content: string
  sender: "user" | "agent"
  timestamp: Date
  agentId: string
  conversationId?: string
  attachments?: Array<{
    name: string
    type: string
    url: string
    size: number
  }>
  audioUrl?: string
}

interface ChatInterfaceProps {
  agent: Agent
  user: User | null
  agentPath: string
  initialConversationId?: string
  initialMessageData?: FetchMessagesResult
  initialSessionId?: string | null
  initialPrompts?: AgentPromptSuggestion[]
  initialChatwootConversationId?: string | null
}

function MessageListSkeleton() {
  return (
    <div className="w-full space-y-4" aria-hidden="true">
      <div className="flex items-start gap-3 max-w-xs lg:max-w-md">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="flex items-start justify-end gap-3">
        <div className="space-y-2 w-full max-w-xs lg:max-w-md">
          <Skeleton className="h-4 w-40 ml-auto" />
          <Skeleton className="h-4 w-52 ml-auto" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="flex items-start gap-3 max-w-xs lg:max-w-md">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    </div>
  )
}

export default function ChatInterface({
  agent,
  user,
  agentPath,
  initialConversationId,
  initialMessageData,
  initialSessionId,
  initialPrompts,
  initialChatwootConversationId,
}: ChatInterfaceProps) {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('chat.interface');
  const tErrors = useTranslations('chat.errors');
  const queryClient = useQueryClient()
  const { conversationId, navigateToConversation, navigateToConversationSoft } = useChatContext()

  const [selectedAgent] = useState<Agent>(agent)
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const isLoadingRef = useRef(false)
  const [isResponding, setIsResponding] = useState(false)
  const isRespondingRef = useRef(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [isVideoAnalysis, setIsVideoAnalysis] = useState(false)
  const [localSessionId, setLocalSessionId] = useState<string>(
    () => initialSessionId ?? `${user?.id || "anon"}-${Date.now()}`
  )
  const [draftConversationId, setDraftConversationId] = useState<string | null>(null)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [promptSuggestions, setPromptSuggestions] = useState<AgentPromptSuggestion[]>(
    () => initialPrompts ?? [],
  )
  const [contactEmail, setContactEmail] = useState<string>(() => user?.email ?? "")
  const [emailDraft, setEmailDraft] = useState<string>(() => user?.email ?? "")
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [isValidatingEmail, setIsValidatingEmail] = useState(false)
  const [emailValidationError, setEmailValidationError] = useState<string | null>(null)
  const [isConversationSwitching, setIsConversationSwitching] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevDisplayCountRef = useRef(0)
  const pendingInitialScrollRef = useRef(false)
  const userInteractedSinceConversationChangeRef = useRef(false)
  // Tracks if the view should stay pinned to the bottom (cleared when user scrolls up).
  // Used to re-scroll after the virtualizer remeasures items and changes scrollHeight.
  const isStickyBottomRef = useRef(false)
  const previousLocalMessagesRef = useRef<Message[]>([])
  const localBlobUrlsRef = useRef<Set<string>>(new Set())
  const loadingWatchdogRef = useRef<number | null>(null)
  const hydratingWatchdogRef = useRef<number | null>(null)
  const conversationsInvalidateTimeoutRef = useRef<number | null>(null)
  const agentMessageIdRef = useRef<string | null>(null)
  const prevAgentIdRef = useRef<string | null>(null);
  const navigatingFromNewChatRef = useRef(false)
  const responseVisibilityWatchdogRef = useRef<number | null>(null)
  const pendingResponseDebugRef = useRef<{
    conversationId: string
    expectedAgentContent: string
    agentMessageId: string | null
    startedAt: number
  } | null>(null)
  const requiresEmail = selectedAgent?.requires_email ?? false
  const isChatwootAgent = Boolean(selectedAgent?.chatwoot_inbox_identifier)

  // Chatwoot conversation ID: local state (set by webhook response), overridden by cached data
  const [localChatwootConversationId, setLocalChatwootConversationId] = useState<string | null>(
    initialChatwootConversationId ?? null,
  )
  const chatwootKnownMessageIdsRef = useRef<Set<string>>(new Set())
  const chatwootPendingSinceRef = useRef<number | null>(null)
  const chatwootEventSourceRef = useRef<EventSource | null>(null)
  const chatwootBootstrapFetchDoneRef = useRef<Set<string>>(new Set())
  const chatwootBootstrapFetchInFlightRef = useRef<Set<string>>(new Set())
  const [chatwootHasHuman, setChatwootHasHuman] = useState(false)
  const isDraftConversationId = useCallback((value?: string | null) => {
    return Boolean(value && value.startsWith('draft:'))
  }, [])

  // Fetch cached/server messages via TanStack Query
  const activeConversationKey =
    conversationId ?? (isDraftConversationId(draftConversationId) && draftConversationId ? draftConversationId : undefined)

  const {
    data: messageData,
    isPending: isMessagesPending,
    isFetching: isMessagesFetching,
    isError: isMessagesError,
    refetch: refetchMessages,
  } = useMessages(
    activeConversationKey,
    agent.id,
    agent.chatwoot_inbox_identifier,
    // Only seed with initial data for the initial conversation
    conversationId === initialConversationId ? initialMessageData : undefined,
  )

  // Effective session ID: from cache or local
  const sessionId = messageData?.sessionId ?? localSessionId

  // Effective chatwoot conversation ID: from cache or local
  const chatwootConversationId = messageData?.chatwootConversationId ?? localChatwootConversationId

  const effectiveEmail = (user?.email ?? contactEmail).trim()
  const canSendMessages = !requiresEmail || Boolean(effectiveEmail)

  const showVideoAnalysis = pathname.includes("/support-agent")

  const isConversationHydrating =
    Boolean(conversationId) &&
    !messageData &&
    localMessages.length === 0 &&
    !isMessagesError &&
    (isMessagesPending || isMessagesFetching)

  const debugLog = useCallback((_event: string, _payload?: Record<string, unknown>) => {}, [])

  const normalizeForCompare = useCallback((value: string) => {
    return value.replace(/\s+/g, " ").trim()
  }, [])

  const getReconcileSignature = useCallback(
    (message: Message) => {
      const normalizedContent = normalizeForCompare(message.content)
      const attachmentsCount = message.attachments?.length ?? 0
      const hasAudio = message.audioUrl ? '1' : '0'
      return `${message.sender}|${normalizedContent}|${attachmentsCount}|${hasAudio}`
    },
    [normalizeForCompare],
  )

  const mergeMessagesById = useCallback((messages: Message[]) => {
    return Array.from(new Map(messages.map((message) => [message.id, message])).values())
  }, [])

  const invalidateConversationsNow = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.all(selectedAgent.id),
    })
  }, [queryClient, selectedAgent.id])

  const scheduleConversationsRefresh = useCallback(
    (delayMs = 250) => {
      if (typeof window === "undefined") {
        invalidateConversationsNow()
        return
      }

      if (conversationsInvalidateTimeoutRef.current !== null) {
        window.clearTimeout(conversationsInvalidateTimeoutRef.current)
      }

      conversationsInvalidateTimeoutRef.current = window.setTimeout(() => {
        conversationsInvalidateTimeoutRef.current = null
        invalidateConversationsNow()
      }, delayMs)
    },
    [invalidateConversationsNow],
  )

  const trackBlobUrl = useCallback((url: string) => {
    if (url.startsWith("blob:")) {
      localBlobUrlsRef.current.add(url)
    }
    return url
  }, [])

  const revokeBlobUrl = useCallback((url?: string | null) => {
    if (!url || !url.startsWith("blob:")) {
      return
    }

    try {
      URL.revokeObjectURL(url)
    } catch {
      // Ignore revoke failures for stale URLs.
    }

    localBlobUrlsRef.current.delete(url)
  }, [])

  const revokeMessageBlobUrls = useCallback(
    (message: Message) => {
      if (Array.isArray(message.attachments)) {
        message.attachments.forEach((attachment) => {
          revokeBlobUrl(attachment.url)
        })
      }

      revokeBlobUrl(message.audioUrl)
    },
    [revokeBlobUrl],
  )

  const migrateDraftCacheToConversation = useCallback(
    (draftId: string, persistedConversationId: string) => {
      const draftKey = queryKeys.messages.byConversation(
        draftId,
        selectedAgent.id,
        selectedAgent.chatwoot_inbox_identifier,
      )
      const persistedKey = queryKeys.messages.byConversation(
        persistedConversationId,
        selectedAgent.id,
        selectedAgent.chatwoot_inbox_identifier,
      )

      const draftData = queryClient.getQueryData<FetchMessagesResult>(draftKey)
      if (draftData) {
        queryClient.setQueryData<FetchMessagesResult>(persistedKey, (existing) => {
          const merged = mergeMessagesById([...(existing?.messages ?? []), ...(draftData.messages ?? [])]).map(
            (message) =>
              message.conversationId === draftId
                ? { ...message, conversationId: persistedConversationId }
                : message,
          )

          return {
            messages: merged,
            sessionId: existing?.sessionId ?? draftData.sessionId,
            chatwootConversationId:
              existing?.chatwootConversationId ?? draftData.chatwootConversationId ?? null,
          }
        })

        queryClient.removeQueries({ queryKey: draftKey, exact: true })
      }

    },
    [mergeMessagesById, queryClient, selectedAgent.chatwoot_inbox_identifier, selectedAgent.id],
  )

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    isRespondingRef.current = isResponding
  }, [isResponding])

  useEffect(() => {
    if (!conversationId) {
      setIsConversationSwitching(false)
      return
    }

    setIsConversationSwitching(true)
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) {
      return
    }

    if (messageData || isMessagesError || (!isMessagesPending && !isMessagesFetching)) {
      setIsConversationSwitching(false)
    }
  }, [conversationId, messageData, isMessagesError, isMessagesPending, isMessagesFetching])

  useEffect(() => {
    const previousMessages = previousLocalMessagesRef.current
    if (previousMessages.length > 0) {
      const currentIds = new Set(localMessages.map((message) => message.id))
      previousMessages.forEach((message) => {
        if (!currentIds.has(message.id)) {
          revokeMessageBlobUrls(message)
        }
      })
    }

    previousLocalMessagesRef.current = localMessages
  }, [localMessages, revokeMessageBlobUrls])

  useEffect(() => {
    return () => {
      if (
        typeof window !== "undefined" &&
        conversationsInvalidateTimeoutRef.current !== null
      ) {
        window.clearTimeout(conversationsInvalidateTimeoutRef.current)
        conversationsInvalidateTimeoutRef.current = null
      }

      previousLocalMessagesRef.current.forEach((message) => {
        revokeMessageBlobUrls(message)
      })
      localBlobUrlsRef.current.forEach((url) => {
        revokeBlobUrl(url)
      })
      localBlobUrlsRef.current.clear()
    }
  }, [revokeBlobUrl, revokeMessageBlobUrls])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    return () => {
      if (responseVisibilityWatchdogRef.current !== null) {
        window.clearTimeout(responseVisibilityWatchdogRef.current)
        responseVisibilityWatchdogRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!isLoading) {
      if (loadingWatchdogRef.current !== null) {
        window.clearTimeout(loadingWatchdogRef.current)
        loadingWatchdogRef.current = null
      }
      return
    }

    if (loadingWatchdogRef.current !== null) {
      window.clearTimeout(loadingWatchdogRef.current)
    }

    loadingWatchdogRef.current = window.setTimeout(() => {
      debugLog("loading-timeout-15s", {
        isLoading: isLoadingRef.current,
        isResponding: isRespondingRef.current,
        isConversationHydrating,
        isMessagesPending,
        isMessagesFetching,
        hasMessageData: Boolean(messageData),
        messageDataCount: messageData?.messages?.length ?? 0,
        localMessagesCount: localMessages.length,
      })
    }, 15000)

    return () => {
      if (loadingWatchdogRef.current !== null) {
        window.clearTimeout(loadingWatchdogRef.current)
        loadingWatchdogRef.current = null
      }
    }
  }, [
    isLoading,
    isConversationHydrating,
    isMessagesPending,
    isMessagesFetching,
    messageData,
    localMessages.length,
    debugLog,
  ])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!isConversationHydrating) {
      if (hydratingWatchdogRef.current !== null) {
        window.clearTimeout(hydratingWatchdogRef.current)
        hydratingWatchdogRef.current = null
      }
      return
    }

    if (hydratingWatchdogRef.current !== null) {
      window.clearTimeout(hydratingWatchdogRef.current)
    }

    hydratingWatchdogRef.current = window.setTimeout(() => {
      debugLog("hydrating-timeout-10s", {
        conversationId: conversationId ?? null,
        isMessagesPending,
        isMessagesFetching,
        hasMessageData: Boolean(messageData),
        localMessagesCount: localMessages.length,
      })
    }, 10000)

    return () => {
      if (hydratingWatchdogRef.current !== null) {
        window.clearTimeout(hydratingWatchdogRef.current)
        hydratingWatchdogRef.current = null
      }
    }
  }, [
    isConversationHydrating,
    conversationId,
    isMessagesPending,
    isMessagesFetching,
    messageData,
    localMessages.length,
    debugLog,
  ])

  // Reset local state when conversationId changes (replaces key={} remount)
  useEffect(() => {
    userInteractedSinceConversationChangeRef.current = false
    isStickyBottomRef.current = false

    if (navigatingFromNewChatRef.current) {
      // We navigated because of a freshly created conversation.
      // Never reset local UI state on this transition, otherwise
      // the optimistic user message and thinking state can disappear.
      navigatingFromNewChatRef.current = false
      debugLog("conversation-change-skip-reset")
      return
    }
    navigatingFromNewChatRef.current = false
    setLocalMessages([])
    setIsLoading(false)
    setIsResponding(false)
    pendingResponseDebugRef.current = null
    if (typeof window !== "undefined" && responseVisibilityWatchdogRef.current !== null) {
      window.clearTimeout(responseVisibilityWatchdogRef.current)
      responseVisibilityWatchdogRef.current = null
    }
    setInputMessage('')
    setAttachedFiles([])
    setIsVideoAnalysis(false)
    setLocalChatwootConversationId(null)
    chatwootPendingSinceRef.current = null
    chatwootKnownMessageIdsRef.current.clear()
    setChatwootHasHuman(false)
    setPromptSuggestions(initialPrompts ?? [])
    if (!conversationId) {
      // New chat: restore in-flight draft (if any) to avoid losing optimistic UI between navigations.
      if (isDraftConversationId(draftConversationId) && draftConversationId) {
        const draftKey = queryKeys.messages.byConversation(
          draftConversationId,
          selectedAgent.id,
          selectedAgent.chatwoot_inbox_identifier,
        )
        const draftData = queryClient.getQueryData<FetchMessagesResult>(draftKey)
        if (draftData?.messages?.length) {
          setLocalMessages(draftData.messages)
          pendingInitialScrollRef.current = true
          debugLog("conversation-change-restore-draft", {
            draftConversationId,
            restoredMessages: draftData.messages.length,
          })
          return
        }
      }

      // New empty chat: regenerate session ID
      setLocalSessionId(`${user?.id || "anon"}-${Date.now()}`)
      setDraftConversationId(null)
      pendingInitialScrollRef.current = false
      debugLog("conversation-change-new-chat")
    } else {
      pendingInitialScrollRef.current = true
      debugLog("conversation-change-existing-chat")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useEffect(() => {
    if (user?.email) {
      setContactEmail(user.email)
      setEmailDraft(user.email)
      return
    }

    if (typeof window === "undefined") {
      return
    }

    const storageKey = `chat-contact-email-${selectedAgent.id}`
    const storedEmail = sessionStorage.getItem(storageKey)
    setContactEmail(storedEmail ?? "")
    setEmailDraft(storedEmail ?? "")
  }, [selectedAgent.id, user?.email])

  useEffect(() => {
    if (!requiresEmail) {
      setEmailModalOpen(false)
      return
    }

    if (!effectiveEmail) {
      setEmailModalOpen(true)
    }
  }, [requiresEmail, effectiveEmail])

  useEffect(() => {
    if (!emailModalOpen) {
      setEmailValidationError(null)
      setIsValidatingEmail(false)
    }
  }, [emailModalOpen])

  useEffect(() => {
    const avatarFromUser = user?.user_metadata?.avatar_url
    setUserAvatarUrl(typeof avatarFromUser === "string" ? avatarFromUser : null)
  }, [user])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current
    if (!container) {
      return
    }

    isStickyBottomRef.current = true
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })
  }, [])

  const handleMessagesScroll = useCallback(() => {
    if (pendingInitialScrollRef.current) {
      userInteractedSinceConversationChangeRef.current = true
    }
    const container = messagesContainerRef.current
    if (container) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      if (distanceFromBottom > 100) {
        isStickyBottomRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (!isChatwootAgent) {
      return
    }
    chatwootKnownMessageIdsRef.current.clear()
  }, [isChatwootAgent, chatwootConversationId])

  useEffect(() => {
    const currentAgentId = selectedAgent.id;
    const prevAgentId = prevAgentIdRef.current;

    if (prevAgentId !== null && prevAgentId !== currentAgentId) {
      chatwootPendingSinceRef.current = null
      chatwootKnownMessageIdsRef.current.clear()
      chatwootBootstrapFetchDoneRef.current.clear()
      chatwootBootstrapFetchInFlightRef.current.clear()
      setLocalChatwootConversationId(null)
      setChatwootHasHuman(false)
      if (typeof window !== "undefined" && conversationsInvalidateTimeoutRef.current !== null) {
        window.clearTimeout(conversationsInvalidateTimeoutRef.current)
        conversationsInvalidateTimeoutRef.current = null
      }
      if (chatwootEventSourceRef.current) {
        chatwootEventSourceRef.current.close()
        chatwootEventSourceRef.current = null
      }
    }

    prevAgentIdRef.current = currentAgentId;
  }, [selectedAgent.id])

  useEffect(() => {
    setChatwootHasHuman(false)
  }, [chatwootConversationId])

  const normalizeChatwootMessage = useCallback(
    (item: any): Message | null => {
      if (!isChatwootAgent || !chatwootConversationId || !item) {
        return null
      }

      const type = item?.message_type
      const isOutgoing =
        (typeof type === "string" && type.toLowerCase() === "outgoing") ||
        (typeof type === "number" && type === 1)

      if (!isOutgoing || item?.private) {
        return null
      }

      const rawId = item?.id ?? item?.message_id ?? item?.created_at ?? item?.uuid
      if (!rawId) {
        return null
      }

      const messageId = `${chatwootConversationId}-${String(rawId)}`
      if (chatwootKnownMessageIdsRef.current.has(messageId)) {
        return null
      }

      let createdAtMs = Date.now()
      const createdAtRaw = item?.created_at ?? item?.created_at_i ?? item?.timestamp
      if (typeof createdAtRaw === "number") {
        createdAtMs = createdAtRaw > 9999999999 ? createdAtRaw : createdAtRaw * 1000
      } else if (typeof createdAtRaw === "string") {
        const parsed = Date.parse(createdAtRaw)
        if (!Number.isNaN(parsed)) {
          createdAtMs = parsed
        }
      }

      const pendingSince = chatwootPendingSinceRef.current
      if (pendingSince && createdAtMs < pendingSince - 1000) {
        chatwootKnownMessageIdsRef.current.add(messageId)
        return null
      }

      chatwootKnownMessageIdsRef.current.add(messageId)

      const rawAttachments: any[] = Array.isArray(item?.attachments) ? item.attachments : []
      const attachments = rawAttachments
        .map((attachment: any, index: number) => {
          const rawUrl =
            attachment?.data_url ??
            attachment?.file_url ??
            attachment?.download_url ??
            attachment?.url ??
            null

          if (!rawUrl) {
            return null
          }

          const type = typeof attachment?.file_type === 'string' ? attachment.file_type : attachment?.content_type ?? ''
          const name = typeof attachment?.filename === 'string'
            ? attachment.filename
            : typeof attachment?.name === 'string'
              ? attachment.name
              : `attachment-${index + 1}`
          const sizeValue = Number(attachment?.file_size ?? attachment?.byte_size ?? 0)

          return {
            name,
            type,
            url: rawUrl,
            size: Number.isFinite(sizeValue) ? sizeValue : 0,
          }
        })
        .filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment))

      let audioUrl: string | undefined
      const firstAudio = attachments.find((attachment) => attachment.type.toLowerCase().startsWith('audio'))
      if (firstAudio) {
        audioUrl = firstAudio.url
      }

      return {
        id: messageId,
        content: item?.content ?? "",
        sender: "agent",
        timestamp: new Date(createdAtMs),
        agentId: selectedAgent.id,
        conversationId: conversationId ?? chatwootConversationId,
        attachments: attachments.length > 0 ? attachments : undefined,
        audioUrl,
      }
    },
    [chatwootConversationId, conversationId, isChatwootAgent, selectedAgent.id],
  )

  const commitChatwootMessages = useCallback(
    (newMessages: Message[]) => {
      if (newMessages.length === 0) {
        return
      }

      const uniqueNewMessages = Array.from(
        new Map(newMessages.map((message) => [message.id, message])).values(),
      ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      setLocalMessages((prev) => {
        const existingIds = new Set(prev.map((msg) => msg.id))
        const trulyNewMessages = uniqueNewMessages.filter((msg) => !existingIds.has(msg.id))
        if (trulyNewMessages.length === 0) {
          return prev
        }
        return [...prev, ...trulyNewMessages]
      })
      chatwootPendingSinceRef.current = null
      const shouldShowLoader = !isChatwootAgent || !chatwootHasHuman
      if (shouldShowLoader) {
        setIsLoading(false)
      }
      setIsResponding(false)

      // Refresh sidebar title/order without refetching on every single SSE event.
      scheduleConversationsRefresh(350)
    },
    [isChatwootAgent, chatwootHasHuman, scheduleConversationsRefresh],
  )

  const fetchChatwootMessages = useCallback(async (): Promise<boolean> => {
    if (!isChatwootAgent || !chatwootConversationId) {
      return false
    }

    try {
      const response = await fetch(`/api/chatwoot/messages?conversationId=${chatwootConversationId}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        console.error("[chatwoot] Error fetching messages:", errorData)
        return false
      }

      const data = await response.json()
      const rawMessages: any[] = Array.isArray(data?.messages) ? data.messages : []

      if (rawMessages.length === 0) {
        return true
      }

      const newMessages = rawMessages
        .map((item) => normalizeChatwootMessage(item))
        .filter((msg): msg is Message => Boolean(msg))

      if (newMessages.length === 0) {
        return true
      }

      commitChatwootMessages(newMessages)
      return true
    } catch (error) {
      console.error("[chatwoot] Error updating messages", error)
      return false
    }
  }, [chatwootConversationId, commitChatwootMessages, isChatwootAgent, normalizeChatwootMessage])

  useEffect(() => {
    if (!isChatwootAgent || !chatwootConversationId) {
      return
    }

    if (
      chatwootBootstrapFetchDoneRef.current.has(chatwootConversationId) ||
      chatwootBootstrapFetchInFlightRef.current.has(chatwootConversationId)
    ) {
      return
    }

    const hasHydratedMessages = (messageData?.messages?.length ?? 0) > 0
    if (hasHydratedMessages) {
      chatwootBootstrapFetchDoneRef.current.add(chatwootConversationId)
      return
    }

    chatwootBootstrapFetchInFlightRef.current.add(chatwootConversationId)

    void fetchChatwootMessages().then((didSucceed) => {
      chatwootBootstrapFetchInFlightRef.current.delete(chatwootConversationId)
      if (didSucceed) {
        chatwootBootstrapFetchDoneRef.current.add(chatwootConversationId)
      }
    })
  }, [chatwootConversationId, fetchChatwootMessages, isChatwootAgent, messageData?.messages?.length])

  const normalizeChatwootMessageRef = useRef(normalizeChatwootMessage)
  const commitChatwootMessagesRef = useRef(commitChatwootMessages)

  useEffect(() => {
    normalizeChatwootMessageRef.current = normalizeChatwootMessage
    commitChatwootMessagesRef.current = commitChatwootMessages
  }, [normalizeChatwootMessage, commitChatwootMessages])

  useEffect(() => {
    if (!isChatwootAgent || !chatwootConversationId || typeof window === "undefined") {
      return
    }

    const url = `/api/chatwoot/stream?conversationId=${encodeURIComponent(chatwootConversationId)}`
    const eventSource = new EventSource(url)
    chatwootEventSourceRef.current = eventSource

    const handleMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data)
        const rawMessage = payload?.message ?? payload
        const normalized = normalizeChatwootMessageRef.current(rawMessage)
        if (normalized) {
          commitChatwootMessagesRef.current([normalized])
        }
      } catch (error) {
        console.error("[chatwoot] Error procesando SSE", error)
      }
    }

    const handleHandoff = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data)
        const human = Boolean(payload?.human)
        setChatwootHasHuman(human)
        if (human) {
          setIsLoading(false)
          setIsResponding(false)
        }
      } catch (error) {
        console.error("[chatwoot] Error procesando handoff", error)
      }
    }

    eventSource.addEventListener("chatwoot_message", handleMessage)
    eventSource.addEventListener("chatwoot_handoff", handleHandoff)
    eventSource.addEventListener("ping", () => { /* keep-alive */ })

    eventSource.onerror = (event) => {
      console.error("[chatwoot] SSE error", event)
    }

    return () => {
      eventSource.removeEventListener("chatwoot_message", handleMessage)
      eventSource.removeEventListener("chatwoot_handoff", handleHandoff)
      eventSource.close()
      if (chatwootEventSourceRef.current === eventSource) {
        chatwootEventSourceRef.current = null
      }
    }
  }, [chatwootConversationId, isChatwootAgent])

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = emailDraft.trim()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    setEmailValidationError(null)

    if (!emailPattern.test(trimmed)) {
      toast.error(tErrors('invalidEmailTitle'), {
        description: tErrors('invalidEmail'),
      })
      setEmailValidationError(t('emailGate.invalid'))
      return
    }

    try {
      setIsValidatingEmail(true)
      const response = await fetch('/api/email/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: trimmed }),
      })

      if (!response.ok) {
        console.error('[chat] Email validation failed with status', response.status)
        setEmailValidationError(t('emailGate.verificationError'))
        return
      }

      const data = await response.json().catch(() => null)
      const status = typeof data?.status === 'string' ? data.status : null

      if (!status || status.toUpperCase() !== 'VALID') {
        setEmailValidationError(t('emailGate.invalid'))
        return
      }
    } catch (error) {
      console.error('[chat] Error validating email', error)
      setEmailValidationError(t('emailGate.verificationError'))
      return
    } finally {
      setIsValidatingEmail(false)
    }

    setContactEmail(trimmed)

    if (!user?.email && typeof window !== "undefined") {
      sessionStorage.setItem(`chat-contact-email-${selectedAgent.id}`, trimmed)
    }

    toast.success(t('toast.emailSavedTitle'), {
      description: t('toast.emailSaved', { email: trimmed }),
    })

    setEmailModalOpen(false)
  }

  const sendMessage = async (
    content: string,
    files: File[],
    audioBlob?: Blob,
    videoAnalysis?: boolean
  ) => {
    const trimmedContent = content.trim()

    debugLog("send-start", {
      hasConversationId: Boolean(conversationId),
      sessionId,
      isChatwootAgent,
      filesCount: files.length,
      hasAudio: Boolean(audioBlob),
      hasContent: Boolean(trimmedContent),
    })

    if (
      !selectedAgent ||
      (!trimmedContent && files.length === 0 && !audioBlob)
    ) {
      return
    }

    if (requiresEmail && !effectiveEmail) {
      toast.error(tErrors('emailRequiredTitle'), {
        description: tErrors('emailRequired'),
      })
      return
    }

    if (promptSuggestions.length > 0) {
      setPromptSuggestions([])
    }

    const messageContent =
      content ||
      (audioBlob
        ? t('audioMessage')
        : files.length > 0
          ? t('attachments')
          : "");

    const outgoingMessageContent =
      isChatwootAgent && !trimmedContent && (files.length > 0 || Boolean(audioBlob))
        ? ""
        : messageContent;

    const validDraftConversationId =
      isDraftConversationId(draftConversationId) && draftConversationId
        ? draftConversationId
        : null

    const optimisticConversationId =
      conversationId ?? validDraftConversationId ?? `draft:${selectedAgent.id}:${sessionId}`

    if (!conversationId && !validDraftConversationId) {
      setDraftConversationId(optimisticConversationId)
    }

    const conversationKey = conversationId || optimisticConversationId || sessionId || `temp-${Date.now()}`;

    const userMessage: Message = {
      id: `${conversationKey}-${Date.now()}-user`,
      content: messageContent,
      sender: "user",
      timestamp: new Date(),
      agentId: selectedAgent.id,
      conversationId: conversationId ?? optimisticConversationId,
      attachments: files.map(file => ({
        name: file.name,
        type: file.type,
        url: trackBlobUrl(URL.createObjectURL(file)),
        size: file.size,
      })),
      audioUrl: audioBlob ? trackBlobUrl(URL.createObjectURL(audioBlob)) : undefined,
    }

    setLocalMessages(prev => [...prev, userMessage])

    queryClient.setQueryData<FetchMessagesResult>(
      queryKeys.messages.byConversation(
        optimisticConversationId,
        selectedAgent.id,
        selectedAgent.chatwoot_inbox_identifier,
      ),
      (existing) => {
        const mergedMessages = mergeMessagesById([...(existing?.messages ?? []), userMessage])
        return {
          messages: mergedMessages,
          sessionId: existing?.sessionId ?? sessionId,
          chatwootConversationId: existing?.chatwootConversationId ?? null,
        }
      },
    )

    setInputMessage("")
    setAttachedFiles([])
    setIsVideoAnalysis(false)
    setIsResponding(true)

    const shouldShowLoader = !isChatwootAgent || !chatwootHasHuman
    if (shouldShowLoader) {
      setIsLoading(true)
    }

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'agent_message_sent', {
        agent_id: selectedAgent.id,
        agent_path: selectedAgent.path,
        agent_access_level: selectedAgent.access_level,
        conversation_id: conversationId ?? sessionId,
        has_conversation: Boolean(conversationId),
        attachments_count: files.length,
        audio_attached: Boolean(audioBlob),
        video_analysis: Boolean(videoAnalysis),
        user_role: user?.user_metadata?.role || user?.app_metadata?.role || null,
      })
    }

    try {
      const formData = new FormData()
      formData.append("message", outgoingMessageContent)
      formData.append("agentId", selectedAgent.id)
      formData.append("sessionId", sessionId)

      if (isChatwootAgent) {
        if (conversationId && chatwootConversationId) {
          formData.append("conversationId", chatwootConversationId)
        }
      } else if (conversationId) {
        formData.append("conversationId", conversationId)
      }

      if (effectiveEmail) {
        formData.append("userEmail", effectiveEmail)
      }

      const displayName =
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        (user?.user_metadata?.preferred_username as string | undefined) ||
        ""

      if (displayName) {
        formData.append("userName", displayName)
      }

      if (videoAnalysis) {
        formData.append("videoAnalysis", "true")
      }

      if (files.length > 0) {
        files.forEach((file, index) => {
          formData.append(`file_${index}`, file)
        })
      }

      if (audioBlob) {
        formData.append("audio", audioBlob, "audio.webm")
      }

      const response = await fetch("/api/webhook", {
        method: "POST",
        body: formData,
      })

      debugLog("send-response", {
        ok: response.ok,
        status: response.status,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.error || `Error ${response.status}: ${response.statusText}`
        )
      }

      const integrationMode = response.headers.get("x-agent-integration") ?? "n8n"
      debugLog("send-integration-mode", { integrationMode })

      if (integrationMode === "chatwoot") {
        const chatwootData = await response.json()
        const conversationFromHeader = response.headers.get("x-chatwoot-conversation")
        const conversationFromPayload = chatwootData?.conversationId
        const effectiveConversationId = conversationFromHeader ?? conversationFromPayload ?? conversationId ?? null
        const mongoConversationId: string | null = chatwootData?.mongoConversationId ?? null

         if (typeof window === "undefined") {
           setIsLoading(false)
           setIsResponding(false)
           throw new Error(tErrors('connection'))
         }

         // For Chatwoot agents we intentionally skip migrateDraftCacheToConversation.
         // The chatwoot conversation ID is not a valid MongoDB ObjectId, so if
         // useMessages fires with enabled:true it would fetch from the server,
         // receive empty data, and overwrite the optimistic cache — causing the
         // user message and thinking state to disappear.
         // We keep activeConversationKey as the draft key (query stays disabled)
         // and rely on localMessages + isChatwootAgent's shouldMergeLocal to keep
         // messages visible.

        setLocalChatwootConversationId(effectiveConversationId)
        chatwootPendingSinceRef.current = Date.now()
        debugLog("chatwoot-forwarded", {
          effectiveConversationId,
          mongoConversationId,
        })

        // If this is a new chat and we got the MongoDB _id, navigate to it so
        // the conversation is highlighted in the sidebar and the URL reflects
        // the real conversation.
        if (mongoConversationId && !conversationId) {
          // Pre-populate the message cache with the messages snapshot so
          // useMessages(mongoId) won't immediately fetch from Chatwoot and return
          // the user's message with a different ID — which would cause a duplicate.
          // We use [...localMessages, userMessage] because localMessages in the
          // async closure is the pre-send stale value and userMessage is in scope.
          // staleTime=5min on useMessages prevents a background refetch while the
          // conversation is in flight.
          queryClient.setQueryData<FetchMessagesResult>(
            queryKeys.messages.byConversation(
              mongoConversationId,
              selectedAgent.id,
              selectedAgent.chatwoot_inbox_identifier,
            ),
            {
              messages: [...localMessages, userMessage],
              sessionId: localSessionId,
              chatwootConversationId: effectiveConversationId,
            },
          )
          navigatingFromNewChatRef.current = true
          setDraftConversationId(null)
          navigateToConversationSoft(mongoConversationId, agentPath, locale)
        } else {
          // Existing conversation: just refresh the sidebar (title may have changed)
          scheduleConversationsRefresh(200)
        }

        return
      }

      if (!response.body) {
        throw new Error(tErrors('emptyBody'))
      }

      const agentMessageId = `${conversationKey}-${Date.now()}-agent`
      agentMessageIdRef.current = agentMessageId

      const agentMessagePlaceholder: Message = {
        id: agentMessageId,
        content: "",
        sender: "agent",
        timestamp: new Date(),
        agentId: selectedAgent.id,
        conversationId: conversationId ?? optimisticConversationId,
      }
      setLocalMessages(prev => [...prev, agentMessagePlaceholder])

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamedContent = ""
      let streamedConversationId: string | undefined
      let navigated = false
      let streamFlushTimeout: number | null = null

      const applyStreamedAgentContent = () => {
        setLocalMessages((prevMessages) =>
          prevMessages.map((message) =>
            message.id === agentMessageIdRef.current
              ? { ...message, content: streamedContent }
              : message,
          ),
        )
      }

      const scheduleStreamedAgentContentFlush = () => {
        if (streamFlushTimeout !== null) {
          return
        }

        if (typeof window === "undefined") {
          applyStreamedAgentContent()
          return
        }

        streamFlushTimeout = window.setTimeout(() => {
          streamFlushTimeout = null
          applyStreamedAgentContent()
        }, 70)
      }

      const flushStreamedAgentContentNow = () => {
        if (typeof window !== "undefined" && streamFlushTimeout !== null) {
          window.clearTimeout(streamFlushTimeout)
          streamFlushTimeout = null
        }

        applyStreamedAgentContent()
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n').filter(line => line.trim() !== '')

          for (const line of lines) {
            try {
              const data = JSON.parse(line)

              if (data.conversationId && !conversationId && !navigated) {
                debugLog("stream-conversation-id", {
                  streamedConversationId: data.conversationId,
                  navigated,
                })
                streamedConversationId = data.conversationId

                if (optimisticConversationId.startsWith('draft:')) {
                  migrateDraftCacheToConversation(optimisticConversationId, data.conversationId)
                  setDraftConversationId(null)
                }

                setLocalMessages((prevMessages) =>
                  prevMessages.map((msg) =>
                    msg.conversationId === optimisticConversationId || !msg.conversationId
                      ? { ...msg, conversationId: data.conversationId }
                      : msg,
                  ),
                )
                // Mark that we're navigating due to a new message — prevents reset effect
                navigatingFromNewChatRef.current = true
                navigateToConversation(data.conversationId, agentPath, locale)
                navigated = true
              }

              if (data.conversationId) {
                streamedConversationId = data.conversationId
              }

              if (data.type === "item" && data.content) {
                const textChunk = data.content
                streamedContent += textChunk
                scheduleStreamedAgentContentFlush()
              }

            } catch (e) {
              console.error("Could not parse streamed line as JSON:", line, e)
            }
          }
        }
      } finally {
        flushStreamedAgentContentNow()
      }

      const finalStreamConversationId =
        streamedConversationId ?? conversationId ?? optimisticConversationId

      queryClient.setQueryData<FetchMessagesResult>(
        queryKeys.messages.byConversation(
          finalStreamConversationId,
          selectedAgent.id,
          selectedAgent.chatwoot_inbox_identifier,
        ),
        (existing) => {
          const existingMessages = existing?.messages ?? []
          const hasAgentPlaceholder = existingMessages.some(
            (message) => message.id === agentMessageIdRef.current,
          )

          const nextAgentMessage: Message = {
            id: agentMessageIdRef.current ?? agentMessageId,
            content: streamedContent,
            sender: "agent",
            timestamp: new Date(),
            agentId: selectedAgent.id,
            conversationId: finalStreamConversationId,
          }

          const mergedMessages = hasAgentPlaceholder
            ? existingMessages.map((message) =>
                message.id === agentMessageIdRef.current
                  ? { ...message, content: streamedContent }
                  : message,
              )
            : [...existingMessages, nextAgentMessage]

          return {
            messages: mergeMessagesById(mergedMessages),
            sessionId: existing?.sessionId ?? sessionId,
            chatwootConversationId: existing?.chatwootConversationId ?? null,
          }
        },
      )

      const targetConversationId = streamedConversationId ?? conversationId
      debugLog("stream-end", {
        targetConversationId: targetConversationId ?? null,
        streamedConversationId: streamedConversationId ?? null,
        localMessagesCountBeforeCleanup: localMessages.length,
        streamedContentLength: streamedContent.length,
      })
      if (targetConversationId) {
        pendingResponseDebugRef.current = {
          conversationId: targetConversationId,
          expectedAgentContent: streamedContent,
          agentMessageId: agentMessageIdRef.current,
          startedAt: Date.now(),
        }

        if (typeof window !== "undefined") {
          if (responseVisibilityWatchdogRef.current !== null) {
            window.clearTimeout(responseVisibilityWatchdogRef.current)
          }

          responseVisibilityWatchdogRef.current = window.setTimeout(() => {
            const key = queryKeys.messages.byConversation(
              targetConversationId,
              selectedAgent.id,
              selectedAgent.chatwoot_inbox_identifier,
            )
            const queryState = queryClient.getQueryState(key)
            const cached = queryClient.getQueryData<FetchMessagesResult>(key)

            debugLog("response-visibility-timeout-4s", {
              pendingConversationId: targetConversationId,
              expectedLength: streamedContent.length,
              localMessagesCount: localMessages.length,
              cachedMessageCount: cached?.messages?.length ?? 0,
              queryStatus: queryState?.status,
              fetchStatus: queryState?.fetchStatus,
              dataUpdatedAt: queryState?.dataUpdatedAt,
              error: queryState?.error instanceof Error ? queryState.error.message : null,
            })
          }, 4000)
        }

        // Keep local messages until query cache/server confirms persisted state.
        // This avoids a transient empty state after first response.
        debugLog("stream-keep-local-before-invalidate", {
          targetConversationId,
          localMessagesCount: localMessages.length,
        })

        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.byConversation(
            targetConversationId,
            selectedAgent.id,
            selectedAgent.chatwoot_inbox_identifier,
          ),
        })

        scheduleConversationsRefresh(200)

        debugLog("stream-invalidate", {
          targetConversationId,
          invalidatedMessages: true,
          invalidatedConversations: true,
        })
      }

      navigatingFromNewChatRef.current = false
    } catch (error) {
      debugLog("send-error", {
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      console.error("[v0] Error al enviar mensaje:", error)
      if (isChatwootAgent) {
        chatwootPendingSinceRef.current = null
      }
      setIsLoading(false)
      toast.error(tErrors('connection'), {
        description: tErrors('connect', { agentName: selectedAgent.name, error: error instanceof Error ? error.message : tErrors('unknown') }),
      })
    } finally {
      if (!isChatwootAgent) {
        setIsLoading(false)
      }
      setIsResponding(false)
      debugLog("send-finally", {
        isLoadingAfterFinally: isChatwootAgent ? isLoadingRef.current : false,
        isChatwootAgent,
      })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputMessage, attachedFiles, undefined, isVideoAnalysis)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      if (e.ctrlKey && e.shiftKey) {
        return
      } else if (!e.shiftKey && !e.ctrlKey) {
        e.preventDefault()
        if (inputMessage.trim() || attachedFiles.length > 0) {
          sendMessage(inputMessage, attachedFiles, undefined, isVideoAnalysis)
        }
      }
    }
  }

  const handleFileUpload = (files: File[]) => {
    setAttachedFiles(prev => [...prev, ...files])
    setIsVideoAnalysis(false)
  }

  const handleVideoUpload = (files: File[]) => {
    setAttachedFiles(prev => [...prev, ...files])
    setIsVideoAnalysis(true)
  }

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
    if (attachedFiles.length === 1) {
      setIsVideoAnalysis(false)
    }
  }

  const handleAudioSend = (audioBlob: Blob) => {
    sendMessage("", [], audioBlob)
  }

  const handlePromptClick = (prompt: AgentPromptSuggestion) => {
    if (!prompt.content.trim()) {
      return
    }
    sendMessage(prompt.content, [])
  }

  // Combine cached messages with local (in-flight/streaming) messages
  const displayMessages = useMemo(() => {
    const cachedSource = (messageData?.messages ?? []).filter(
      (msg) => msg.agentId === selectedAgent.id,
    )
    const cached = Array.from(
      new Map(cachedSource.map((message) => [message.id, message])).values(),
    )

    const localFiltered = localMessages.filter((msg) => {
      if (msg.agentId !== selectedAgent.id) return false
      if (isChatwootAgent) {
        // For Chatwoot flows keep optimistic/local messages visible for the
        // current agent regardless of conversation-id shape mismatches
        // (app conversation id vs chatwoot conversation id).
        return true
      }

      if (!conversationId) {
        return (
          !msg.conversationId ||
          (isDraftConversationId(draftConversationId)
            ? msg.conversationId === draftConversationId
            : false)
        )
      }
      return msg.conversationId === conversationId
    })

    const cachedSignatureCounts = new Map<string, number>()
    for (const message of cached) {
      const signature = getReconcileSignature(message)
      cachedSignatureCounts.set(signature, (cachedSignatureCounts.get(signature) ?? 0) + 1)
    }

    const seenLocalSignatureCounts = new Map<string, number>()
    const pendingLocal = localFiltered.filter((message) => {
      const signature = getReconcileSignature(message)
      const seenForSignature = (seenLocalSignatureCounts.get(signature) ?? 0) + 1
      seenLocalSignatureCounts.set(signature, seenForSignature)

      const cachedForSignature = cachedSignatureCounts.get(signature) ?? 0
      return seenForSignature > cachedForSignature
    })

    const shouldMergeLocal =
      isResponding ||
      isLoading ||
      !messageData ||
      isChatwootAgent ||
      pendingLocal.length > 0

    if (!shouldMergeLocal) {
      return cached
    }

    // Merge: cached first, then pending local (dedup by id)
    const cachedIds = new Set(cached.map((m) => m.id))
    const uniquePendingLocal = Array.from(
      new Map(
        pendingLocal
          .filter((message) => !cachedIds.has(message.id))
          .map((message) => [message.id, message]),
      ).values(),
    )

    return [...cached, ...uniquePendingLocal].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
  }, [
    messageData,
    localMessages,
    selectedAgent.id,
    isResponding,
    isLoading,
    isChatwootAgent,
    chatwootConversationId,
    conversationId,
    draftConversationId,
    getReconcileSignature,
    isDraftConversationId,
  ])

  const showConversationSkeleton =
    isConversationHydrating ||
    (Boolean(conversationId) && isConversationSwitching && displayMessages.length === 0)

  const messageVirtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: () => 148,
    overscan: 8,
    getItemKey: (index: number) => displayMessages[index]?.id ?? index,
  })

  const messageVirtualItems = messageVirtualizer.getVirtualItems()

  // Re-scroll to bottom when the virtualizer remeasures items and changes the total height.
  // Without this, the initial scrollToBottom (based on estimated heights) ends up in the
  // middle of the content once actual item heights are measured via ResizeObserver.
  const totalVirtualSize = messageVirtualizer.getTotalSize()
  useEffect(() => {
    if (!isStickyBottomRef.current) return
    scrollToBottom("auto")
  }, [totalVirtualSize, scrollToBottom])

  useEffect(() => {
    if (!isChatwootAgent || !conversationId) {
      return
    }

    const localVisibleIds = localMessages
      .filter((msg) => {
        if (msg.agentId !== selectedAgent.id) return false
        if (!msg.conversationId) return true
        if (msg.conversationId === conversationId) return true
        if (chatwootConversationId && msg.conversationId === chatwootConversationId) return true
        return false
      })
      .map((msg) => msg.id)

    debugLog("display-messages-count", {
      displayMessagesCount: displayMessages.length,
      messageDataCount: messageData?.messages?.length ?? 0,
      localMessagesCount: localMessages.length,
      localVisibleCount: localVisibleIds.length,
    })

    debugLog("local-visible-ids", {
      localVisibleIds,
    })
  }, [
    isChatwootAgent,
    conversationId,
    chatwootConversationId,
    localMessages,
    displayMessages.length,
    messageData?.messages?.length,
    selectedAgent.id,
    debugLog,
  ])

  useEffect(() => {
    const pending = pendingResponseDebugRef.current
    if (!pending) {
      return
    }

    if (conversationId !== pending.conversationId) {
      return
    }

    const normalizedExpected = normalizeForCompare(pending.expectedAgentContent)
    const visibleAgentMessages = displayMessages.filter((msg) => msg.sender === "agent")
    const hasExpectedAgentVisible =
      normalizedExpected.length === 0 ||
      visibleAgentMessages.some(
        (msg) => normalizeForCompare(msg.content) === normalizedExpected,
      )

    debugLog("response-visibility-check", {
      pendingConversationId: pending.conversationId,
      expectedLength: pending.expectedAgentContent.length,
      displayCount: displayMessages.length,
      visibleAgentCount: visibleAgentMessages.length,
      hasExpectedAgentVisible,
      isLoading,
      isResponding,
    })

    if (!hasExpectedAgentVisible) {
      return
    }

    debugLog("response-visibility-resolved", {
      pendingConversationId: pending.conversationId,
      elapsedMs: Date.now() - pending.startedAt,
    })

    pendingResponseDebugRef.current = null
    if (responseVisibilityWatchdogRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(responseVisibilityWatchdogRef.current)
      responseVisibilityWatchdogRef.current = null
    }
  }, [
    conversationId,
    displayMessages,
    isLoading,
    isResponding,
    normalizeForCompare,
    debugLog,
  ])

  useEffect(() => {
    if (!pendingInitialScrollRef.current) {
      return
    }

    if (isConversationHydrating || displayMessages.length === 0) {
      return
    }

    if (userInteractedSinceConversationChangeRef.current) {
      pendingInitialScrollRef.current = false
      return
    }

    scrollToBottom("auto")
    pendingInitialScrollRef.current = false
  }, [displayMessages.length, isConversationHydrating, scrollToBottom])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) {
      prevDisplayCountRef.current = displayMessages.length
      return
    }

    const previousCount = prevDisplayCountRef.current
    const hasNewMessages = displayMessages.length > previousCount
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    const isNearBottom = distanceFromBottom < 120

    if (hasNewMessages && (isNearBottom || isResponding || isLoading)) {
      scrollToBottom(previousCount === 0 ? "auto" : "smooth")
    }

    prevDisplayCountRef.current = displayMessages.length
  }, [displayMessages.length, isLoading, isResponding, scrollToBottom])

  return (
    <div className="h-full w-full">
      <div className="w-full h-full">
        <Card className="h-full flex flex-col rounded-none border-0 bg-gradient-to-b from-white via-slate-50/70 to-slate-100/50 py-0 md:py-4">
          {selectedAgent && (
            <div className="border-b border-border/60 bg-white/65 px-4 py-4 md:px-6">
              <div className="flex w-full items-center gap-3">
                <Avatar className={`${selectedAgent.color} border-2 border-white/20`}>
                  <AvatarFallback className="text-2xl bg-transparent">{selectedAgent.icon}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-slate-900">{selectedAgent.name}</h3>
                  <p className="hidden text-sm text-slate-500 md:block">{selectedAgent.description}</p>
                </div>
              </div>
            </div>
          )}

          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto px-3 py-4 md:px-6"
          >
            <div className="w-full space-y-4">
            {showConversationSkeleton ? (
              <div className="w-full py-2" role="status" aria-live="polite">
                <p className="mb-4 text-xs text-muted-foreground">{t('loadingConversation')}</p>
                <MessageListSkeleton />
              </div>
            ) : isMessagesError && displayMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-center">
                  <p className="text-sm text-muted-foreground">{t('conversationLoadError')}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      refetchMessages()
                    }}
                    disabled={isMessagesFetching}
                  >
                    {t('retryConversationLoad')}
                  </Button>
                </div>
              </div>
            ) : displayMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-lg space-y-6">
                  <div >
                    <div className="text-lg md:text-4xl mb-4">{selectedAgent.icon}</div>
                    <h3 className="text-sm md:text-lg font-semibold text-card-foreground mb-2">
                      {t('greeting', { agentName: selectedAgent.name })}
                    </h3>
                    <p className="text-muted-foreground">{selectedAgent.description}</p>
                  </div>
                  {promptSuggestions.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {promptSuggestions.map((prompt, index) => (
                        <button
                          key={prompt.id ?? `prompt-${index}`}
                          type="button"
                          onClick={() => handlePromptClick(prompt)}
                          className="text-left rounded-xl border border-border/60 bg-white/70 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <span className="block text-xs md:text-sm text-card-foreground line-clamp-3">
                            {prompt.content}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${messageVirtualizer.getTotalSize()}px` }}
              >
                {messageVirtualItems.map((virtualItem: { index: number; start: number }) => {
                  const message = displayMessages[virtualItem.index]
                  if (!message) {
                    return null
                  }

                  return (
                    <div
                      key={message.id}
                      data-index={virtualItem.index}
                      ref={messageVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full pb-4"
                      style={{
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <MessageBubble
                        message={message}
                        agent={selectedAgent}
                        user={user}
                        userAvatarUrl={userAvatarUrl}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {isLoading && (
              <div className="flex justify-start" role="status" aria-live="polite">
                <div className="rounded-2xl border border-border/70 bg-white/80 p-3 shadow-sm max-w-xs">
                  <div className="flex items-center gap-2">
                    <Bot className="w-6 h-6 text-primary thinking-robot-smooth" />
                    <p className="text-sm text-muted-foreground">{t('thinking')}</p>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
            </div>
          </div>

          {selectedAgent && (
            <div className="border-t border-border/70 px-4 py-4 md:px-6">
              <div className="w-full">

              {isChatwootAgent && chatwootHasHuman && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <UserRound className="h-4 w-4 shrink-0" />
                  <span>{t('humanAgent.active')}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div
                  className={cn(
                    "rounded-2xl border border-slate-300 bg-white text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-full w-full",
                    "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
                    "has-[:invalid]:ring-destructive/20 dark:has-[:invalid]:ring-destructive/40 has-[:invalid]:border-destructive"
                  )}
                >
                  <Textarea
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('messagePlaceholder')}
                    className="w-full border-0 bg-transparent px-4 py-3 text-base focus:ring-0 focus:border-0 focus-visible:ring-0 focus-visible:border-0 resize-none max-h-16"
                    disabled={isLoading || isResponding || !canSendMessages}
                    rows={1}
                  />
                  {attachedFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2 px-4">
                      {attachedFiles.map((file, index) => (
                        <span
                          key={index}
                          className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${isVideoAnalysis
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                            }`}
                        >
                          {file.name}
                          {isVideoAnalysis && <span className="text-xs ml-1">{t('videoAnalysis')}</span>}
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className={`ml-1 focus:outline-none ${isVideoAnalysis
                              ? 'text-purple-600 hover:text-purple-800'
                              : 'text-blue-600 hover:text-blue-800'
                              }`}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between p-2">
                    <div className="flex gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button disabled={isLoading || isResponding || !canSendMessages} aria-label={t('attachFiles')} className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50">
                            <Plus className="w-4 h-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="mb-2 w-48 bg-white p-2 rounded-lg shadow-lg border" align="start">
                          <FileUpload onFileUpload={handleFileUpload} disabled={isLoading || isResponding || !canSendMessages} />
                          {requiresEmail && !user?.email && contactEmail && (
                            <>
                              <Separator className="my-2" />
                              <button
                                type="button"
                                onClick={() => {
                                  setEmailDraft(contactEmail)
                                  setEmailModalOpen(true)
                                }}
                                className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                {t('emailGate.change')}
                              </button>
                            </>
                          )}
                        </PopoverContent>
                      </Popover>
                      <AudioRecorder
                        onAudioSend={handleAudioSend}
                        disabled={isLoading || isResponding || !canSendMessages}
                      />
                    </div>
                    <Button
                      type="submit"
                      size="icon"
                      aria-label={t('sendMessage')}
                      disabled={
                        (!inputMessage.trim() && attachedFiles.length === 0) ||
                        isLoading || isResponding || !canSendMessages
                      }
                      className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </form>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={emailModalOpen} onOpenChange={(open) => {
        if (!requiresEmail || canSendMessages) {
          setEmailModalOpen(open)
        }
      }}>
        <DialogContent className="sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {t('emailGate.title')}
            </DialogTitle>
            <DialogDescription className="text-sm sm:text-base text-muted-foreground">
              {t('emailGate.description')}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 mt-3" onSubmit={handleEmailSubmit}>
            <div className="space-y-1.5">
              <Label
                htmlFor="contact-email-modal"
                className="text-xs sm:text-sm font-semibold text-muted-foreground"
              >
                {t('emailGate.placeholder')}
              </Label>
              <Input
                id="contact-email-modal"
                type="email"
                value={emailDraft}
                onChange={(event) => {
                  setEmailDraft(event.target.value)
                  if (emailValidationError) {
                    setEmailValidationError(null)
                  }
                }}
                placeholder={t('emailGate.placeholder')}
                required
              />
              {emailValidationError && (
                <p className="text-sm text-red-600">{emailValidationError}</p>
              )}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isValidatingEmail} className="px-4 h-9 text-sm">
                {isValidatingEmail ? t('emailGate.validating') : t('emailGate.submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
