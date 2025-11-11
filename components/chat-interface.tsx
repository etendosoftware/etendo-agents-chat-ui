'use client'

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useLocale, useTranslations } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Send, Bot, UserRound } from "lucide-react"
import MessageBubble from "./message-bubble"
import FileUpload from "./file-upload"
import AudioRecorder from "./audio-recorder"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabaseClient"
import { User } from "@supabase/supabase-js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import VideoAnalysis from "./video-analysis"
import { Separator } from "./ui/separator"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

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
  initialMessages: Message[]
  conversationId?: string
  initialSessionId?: string | null
  initialPrompts?: AgentPromptSuggestion[]
  initialChatwootConversationId?: string | null
}

export default function ChatInterface({
  agent,
  user,
  initialMessages,
  conversationId,
  initialSessionId,
  initialPrompts,
  initialChatwootConversationId,
}: ChatInterfaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('chat.interface');
  const tErrors = useTranslations('chat.errors');
  const localePrefix = `/${locale}`
  const [selectedAgent] = useState<Agent>(agent)
  const [messages, setMessages] = useState<Message[]>(
    initialMessages
  )
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [isVideoAnalysis, setIsVideoAnalysis] = useState(false)
  const [sessionId, setSessionId] = useState<string>("")
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [promptSuggestions, setPromptSuggestions] = useState<AgentPromptSuggestion[]>(
    () => initialPrompts ?? [],
  )
  const [contactEmail, setContactEmail] = useState<string>(() => user?.email ?? "")
  const [emailDraft, setEmailDraft] = useState<string>(() => user?.email ?? "")
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [isValidatingEmail, setIsValidatingEmail] = useState(false)
  const [emailValidationError, setEmailValidationError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const agentMessageIdRef = useRef<string | null>(null)
  const prevAgentIdRef = useRef<string | null>(null);
  const { toast } = useToast()

  const requiresEmail = selectedAgent?.requires_email ?? false
  const isChatwootAgent = Boolean(selectedAgent?.chatwoot_inbox_identifier)
  const [chatwootConversationId, setChatwootConversationId] = useState<string | null>(
    initialChatwootConversationId ?? null,
  )
  const chatwootKnownMessageIdsRef = useRef<Set<string>>(new Set())
  const chatwootPendingSinceRef = useRef<number | null>(null)
  const chatwootEventSourceRef = useRef<EventSource | null>(null)
  const [chatwootHasHuman, setChatwootHasHuman] = useState(false)

  const effectiveEmail = (user?.email ?? contactEmail).trim()
  const canSendMessages = !requiresEmail || Boolean(effectiveEmail)

  const showVideoAnalysis = pathname.includes("/support-agent")

  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId)
    }
    else {
      setSessionId(`${user?.id || "anon"}-${Date.now()}`)
    }
  }, [initialSessionId, user?.id])

  useEffect(() => {
    if (conversationId === undefined) {
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages as Message[])
    }

    if (isChatwootAgent && chatwootConversationId && initialMessages.length > 0) {
      const knownIds = chatwootKnownMessageIdsRef.current
      knownIds.clear()
      initialMessages.forEach((message) => {
        if (
          message?.id &&
          message.sender === "agent" &&
          message.conversationId === chatwootConversationId
        ) {
          knownIds.add(message.id)
        }
      })
    }
  }, [initialMessages, isChatwootAgent, chatwootConversationId])

  useEffect(() => {
    setChatwootConversationId(initialChatwootConversationId ?? null)
  }, [initialChatwootConversationId])

  useEffect(() => {
    if (initialPrompts) {
      setPromptSuggestions(initialPrompts)
    }
  }, [initialPrompts])

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
    const getUserAvatar = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user && user.user_metadata?.avatar_url) {
        setUserAvatarUrl(user.user_metadata.avatar_url as string)
      }
    }
    getUserAvatar()
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!isChatwootAgent) {
      return
    }
    chatwootKnownMessageIdsRef.current.clear()
  }, [isChatwootAgent, chatwootConversationId])


  useEffect(() => {
    const currentAgentId = selectedAgent.id;
    const prevAgentId = prevAgentIdRef.current;

    // Only reset if the agent ID has actually changed from a previous one
    if (prevAgentId !== null && prevAgentId !== currentAgentId) {
        chatwootPendingSinceRef.current = null
        chatwootKnownMessageIdsRef.current.clear()
        setChatwootConversationId(null)
        setChatwootHasHuman(false)
        if (chatwootEventSourceRef.current) {
          chatwootEventSourceRef.current.close()
          chatwootEventSourceRef.current = null
        }
    }

    // Store current agent ID for next render
    prevAgentIdRef.current = currentAgentId;
  }, [selectedAgent.id])

  useEffect(() => {
    setChatwootHasHuman(false)
  }, [chatwootConversationId])

  useEffect(() => {
    if (conversationId === undefined || conversationId === null) {
      setChatwootConversationId(null)
      chatwootPendingSinceRef.current = null
      chatwootKnownMessageIdsRef.current.clear()
      if (chatwootEventSourceRef.current) {
        chatwootEventSourceRef.current.close()
      }
    }
  }, [conversationId])

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
        conversationId: chatwootConversationId,
        attachments: attachments.length > 0 ? attachments : undefined,
        audioUrl,
      }
    },
    [chatwootConversationId, isChatwootAgent, selectedAgent.id],
  )

  const commitChatwootMessages = useCallback(
    (newMessages: Message[], emitToast = true) => {
      if (newMessages.length === 0) {
        return
      }

      newMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      setMessages((prev) => {
        const existingIds = new Set(prev.map((msg) => msg.id))
        const trulyNewMessages = newMessages.filter((msg) => !existingIds.has(msg.id))
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

      if (emitToast) {
        toast({
          title: t('toast.sent'),
          description: t('toast.received', { agentName: selectedAgent.name }),
        })
      }
    },
    [selectedAgent.name, t, toast, isChatwootAgent, chatwootHasHuman],
  )

  const fetchChatwootMessages = useCallback(async () => {
    if (!isChatwootAgent || !chatwootConversationId) {
      return
    }

    try {
      const response = await fetch(`/api/chatwoot/messages?conversationId=${chatwootConversationId}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        console.error("[chatwoot] Error fetching messages:", errorData)
        return
      }

      const data = await response.json()
      const rawMessages: any[] = Array.isArray(data?.messages) ? data.messages : []
      
      if (rawMessages.length === 0) {
        return
      }

      const newMessages = rawMessages
        .map((item) => normalizeChatwootMessage(item))
        .filter((msg): msg is Message => Boolean(msg))

      if (newMessages.length === 0) {
        return
      }

      commitChatwootMessages(newMessages, false)
    } catch (error) {
      console.error("[chatwoot] Error updating messages", error)
    }
  }, [chatwootConversationId, commitChatwootMessages, isChatwootAgent, normalizeChatwootMessage])

  useEffect(() => {
    if (!isChatwootAgent || !chatwootConversationId) {
      return
    }

    fetchChatwootMessages()
  }, [fetchChatwootMessages, isChatwootAgent, chatwootConversationId])

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
    }
  }, [chatwootConversationId, isChatwootAgent])

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = emailDraft.trim()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    setEmailValidationError(null)

    if (!emailPattern.test(trimmed)) {
      toast({
        title: tErrors('invalidEmailTitle'),
        description: tErrors('invalidEmail'),
        variant: "destructive",
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

    toast({
      title: t('toast.emailSavedTitle'),
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

    if (
      !selectedAgent ||
      (!trimmedContent && files.length === 0 && !audioBlob)
    ) {
      return
    }

    if (requiresEmail && !effectiveEmail) {
      toast({
        title: tErrors('emailRequiredTitle'),
        description: tErrors('emailRequired'),
        variant: "destructive",
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

    const conversationKey = conversationId || sessionId || `temp-${Date.now()}`;
    setMessages(prev => {
      const userMessageIndex = prev.length;
      const userMessage: Message = {
        id: `${conversationKey}-${userMessageIndex}`,
        content: messageContent,
        sender: "user",
        timestamp: new Date(),
        agentId: selectedAgent.id,
        conversationId: conversationId,
        attachments: files.map(file => ({
          name: file.name,
          type: file.type,
          url: URL.createObjectURL(file),
          size: file.size,
        })),
        audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
      }
      return [...prev, userMessage];
    })
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
        conversation_id: conversationId ?? conversationKey,
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
        if (chatwootConversationId) {
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

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.error || `Error ${response.status}: ${response.statusText}`
        )
      }

      const integrationMode = response.headers.get("x-agent-integration") ?? "n8n"

      if (integrationMode === "chatwoot") {
        const chatwootData = await response.json()
        const conversationFromHeader = response.headers.get("x-chatwoot-conversation")
        const conversationFromPayload = chatwootData?.conversationId
        const effectiveConversationId = conversationFromHeader ?? conversationFromPayload ?? conversationId ?? null

      if (typeof window === "undefined") {
        setIsLoading(false)
        setIsResponding(false)
        throw new Error(tErrors('connection'))
      }

      setChatwootConversationId(effectiveConversationId)
      chatwootPendingSinceRef.current = Date.now()

      toast({
        title: t('toast.sent'),
        description: t('toast.forwarded', { agentName: selectedAgent.name }),
      })

        return
      }

      if (!response.body) {
        throw new Error(tErrors('emptyBody'))
      }

      setMessages(prev => {
        const conversationKey = conversationId || sessionId || `temp-${Date.now()}`;
        const agentMessageIndex = prev.length;
        const newAgentMessageId = `${conversationKey}-${agentMessageIndex}`;
        agentMessageIdRef.current = newAgentMessageId;

        const agentMessagePlaceholder: Message = {
          id: newAgentMessageId,
          content: "",
          sender: "agent",
          timestamp: new Date(),
          agentId: selectedAgent.id,
          conversationId: conversationId,
        }
        return [...prev, agentMessagePlaceholder];
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamedContent = ""
      let navigated = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim() !== '')

        for (const line of lines) {
          try {
            const data = JSON.parse(line)

            if (data.conversationId && !conversationId && !navigated) {
              router.push(`${localePrefix}/chat/${agent.path.substring(1)}/${data.conversationId}`)
              navigated = true
            }

            if (data.type === "item" && data.content) {
              const textChunk = data.content;
              streamedContent += textChunk

              setMessages(prevMessages =>
                prevMessages.map(msg =>
                  msg.id === agentMessageIdRef.current
                    ? { ...msg, content: streamedContent }
                    : msg
                )
              )
            }

          } catch (e) {
            console.error("Could not parse streamed line as JSON:", line, e)
          }
        }
      }

      toast({
        title: t('toast.sent'),
        description: t('toast.received', { agentName: selectedAgent.name }),
      })
    } catch (error) {
      console.error("[v0] Error al enviar mensaje:", error)
      if (isChatwootAgent) {
        chatwootPendingSinceRef.current = null
      }
      setIsLoading(false)
      toast({
        title: tErrors('connection'),
        description: tErrors('connect', { agentName: selectedAgent.name, error: error instanceof Error ? error.message : tErrors('unknown') }),
        variant: "destructive",
      })
    } finally {
      if (!isChatwootAgent) {
        setIsLoading(false)
      }
      setIsResponding(false)
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
    // Si se eliminan todos los archivos, resetear el flag
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

  return (
    <div className="h-full w-full">
      <div className="w-full h-full">
        <Card className="glass-effect h-full flex flex-col bg-gradient-to-br from-purple-100 via-blue-50 to-green-50 rounded-none py-0 md:py-4">
          {selectedAgent && (
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Avatar className={`${selectedAgent.color} border-2 border-white/20`}>
                  <AvatarFallback className="text-2xl bg-transparent">{selectedAgent.icon}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-card-foreground">{selectedAgent.name}</h3>
                  <p className="text-sm text-muted-foreground hidden md:block">{selectedAgent.description}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
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
              messages
                .filter(msg => msg.agentId === selectedAgent.id)
                .map(message => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      agent={selectedAgent}
                      user={user}
                      userAvatarUrl={userAvatarUrl}
                    />
                ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="glass-effect rounded-2xl p-3 max-w-xs">
                  <div className="flex items-center gap-2">
                    <Bot className="w-6 h-6 text-primary thinking-robot-smooth" />
                    <p className="text-sm text-muted-foreground">{t('thinking')}</p>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {selectedAgent && (
            <div className="p-4 border-t border-border">

              {isChatwootAgent && chatwootHasHuman && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <UserRound className="h-4 w-4 shrink-0" />
                  <span>{t('humanAgent.active')}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div
                  className={cn(
                    "rounded-2xl bg-card/80 backdrop-blur-sm border border-input placeholder:text-muted-foreground dark:bg-input/30 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-full w-full",
                    // Aplicar estilos de focus cuando el textarea dentro tiene focus
                    "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
                    // Aplicar estilos de invalid cuando el textarea dentro es inválido
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
                          <button disabled={isLoading || isResponding || !canSendMessages} className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50">
                            <Plus className="w-4 h-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="mb-2 w-48 bg-white p-2 rounded-lg shadow-lg border" align="start">
                          {/* {showVideoAnalysis && (
                            <>
                              <VideoAnalysis onFileUpload={handleVideoUpload} disabled={isLoading || isResponding || !canSendMessages} />
                              <Separator />
                            </>
                          )} */}
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
