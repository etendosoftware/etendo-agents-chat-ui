'use client'

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useLocale, useTranslations } from 'next-intl'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Send, Bot } from "lucide-react"
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
}

export default function ChatInterface({
  agent,
  user,
  initialMessages,
  conversationId,
  initialSessionId,
  initialPrompts,
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

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
    setMessages(initialMessages as Message[])
  }, [initialMessages])

  useEffect(() => {
    if (initialPrompts) {
      setPromptSuggestions(initialPrompts)
    }
  }, [initialPrompts])

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

  const sendMessage = async (
    content: string,
    files: File[],
    audioBlob?: Blob,
    videoAnalysis?: boolean
  ) => {
    if (
      !selectedAgent ||
      (!content.trim() && files.length === 0 && !audioBlob)
    )
      return

    if (promptSuggestions.length > 0) {
      setPromptSuggestions([])
    }

    const conversationKey = conversationId || sessionId || `temp-${Date.now()}`;
    const userMessageIndex = messages.length;
    const userMessage: Message = {
      id: `${conversationKey}-${userMessageIndex}`,
      content:
        content ||
        (audioBlob
          ? t('audioMessage')
          : files.length > 0
            ? t('attachments')
            : ""),
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

    setMessages(prev => [...prev, userMessage])
    setInputMessage("")
    setAttachedFiles([])
    setIsVideoAnalysis(false)
    setIsResponding(true)
    setIsLoading(true)

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
      const fullWebhookUrl = selectedAgent.webhookurl
      formData.append("webhookUrl", fullWebhookUrl)
      formData.append("message", content)
      formData.append("agentId", selectedAgent.id)
      formData.append("sessionId", sessionId)

      if (conversationId) {
        formData.append("conversationId", conversationId)
      }

      if (user?.email) {
        formData.append("userEmail", user.email)
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

      setIsLoading(false)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.error || `Error ${response.status}: ${response.statusText}`
        )
      }

      if (!response.body) {
        throw new Error(tErrors('emptyBody'))
      }

      const agentMessageIndex = messages.length + 1; // Calculate index after userMessage is added
      const newAgentMessageId = `${conversationKey}-${agentMessageIndex}`; // Store the ID in a variable
      const agentMessagePlaceholder: Message = {
        id: newAgentMessageId, // Use the stored ID
        content: "",
        sender: "agent",
        timestamp: new Date(),
        agentId: selectedAgent.id,
        conversationId: conversationId,
      }
      setMessages(prev => [...prev, agentMessagePlaceholder])

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
                  msg.id === newAgentMessageId
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
      toast({
        title: tErrors('connection'),
        description: tErrors('connect', { agentName: selectedAgent.name, error: error instanceof Error ? error.message : tErrors('unknown') }),
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
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
                    disabled={isLoading || isResponding}
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
                          <button disabled={isLoading || isResponding} className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50">
                            <Plus className="w-4 h-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="mb-2 w-48 bg-white p-2 rounded-lg shadow-lg border" align="start">
                          {showVideoAnalysis && (
                            <>
                              <VideoAnalysis onFileUpload={handleVideoUpload} disabled={isLoading || isResponding} />
                              <Separator />
                            </>
                          )}
                          <FileUpload onFileUpload={handleFileUpload} disabled={isLoading || isResponding} />
                        </PopoverContent>
                      </Popover>
                      <AudioRecorder
                        onAudioSend={handleAudioSend}
                        disabled={isLoading || isResponding}
                      />
                    </div>
                    <Button
                      type="submit"
                      size="icon"
                      disabled={
                        (!inputMessage.trim() && attachedFiles.length === 0) ||
                        isLoading || isResponding
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
    </div>
  )
}
