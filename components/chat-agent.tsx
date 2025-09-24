"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, ArrowLeft } from "lucide-react"
import Link from "next/link"
import MessageBubble from "./message-bubble"
import FileUpload from "./file-upload"
import AudioRecorder from "./audio-recorder"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabaseClient";

export interface Agent {
  id: string
  name: string
  description: string
  webhookurl: string
  path: string
  color: string
  icon: string
  access_level: 'public' | 'non_client' | 'partner' | 'admin'
}

export interface Message {
  id: string
  content: string
  sender: "user" | "agent"
  timestamp: Date
  agentId: string
  attachments?: Array<{
    name: string
    type: string
    url: string
    size: number
  }>
  audioUrl?: string
}

interface ChatAgentProps {
  agent: Agent
}

export default function ChatAgent({ agent }: ChatAgentProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string>("")
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const { toast } = useToast()

  useEffect(() => {
      const getUserAvatar = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.user_metadata?.avatar_url) {
          setUserAvatarUrl(user.user_metadata.avatar_url as string);
        }
      };
      getUserAvatar();
    }, []); // No dependency on supabase, as it's a constant import
  

  useEffect(() => {
    const getOrCreateSessionId = () => {
      const storageKey = `chat-session-${agent.id}`
      let existingSessionId = localStorage.getItem(storageKey)

      if (!existingSessionId) {
        existingSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem(storageKey, existingSessionId)
      }

      return existingSessionId
    }

    setSessionId(getOrCreateSessionId())
  }, [agent.id])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async (content: string, attachments?: File[], audioBlob?: Blob) => {
    const filesToSend = attachments || pendingFiles

    if (!content.trim() && !filesToSend?.length && !audioBlob) return

    const messageId = Date.now().toString()

    let messageContent = content
    if (!content.trim() && filesToSend?.length) {
      messageContent = `[${filesToSend.length} archivo(s) adjunto(s): ${filesToSend.map((f) => f.name).join(", ")}]`
    } else if (!content.trim() && audioBlob) {
      messageContent = "[Mensaje de audio]"
    }

    const userMessage: Message = {
      id: messageId,
      content: messageContent,
      sender: "user",
      timestamp: new Date(),
      agentId: agent.id,
      attachments: filesToSend?.map((file) => ({
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
        size: file.size,
      })),
      audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputMessage("")
    setPendingFiles([])
    setIsLoading(true)

    try {
      const formData = new FormData()
      const fullWebhookUrl = agent.path ? `${agent.webhookurl}${agent.path}` : agent.webhookurl
      formData.append("webhookUrl", fullWebhookUrl)

      formData.append("message", messageContent)
      formData.append("agentId", agent.id)
      formData.append("sessionId", sessionId)

      if (filesToSend?.length) {
        filesToSend.forEach((file, index) => {
          formData.append(`file_${index}`, file)
        })
        formData.append("fileCount", filesToSend.length.toString())
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
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`)
      }

      const agentResponse = await response.json()

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        content:
          agentResponse.output || agentResponse.message || agentResponse.response || "Respuesta recibida del agente",
        sender: "agent",
        timestamp: new Date(),
        agentId: agent.id,
      }

      setMessages((prev) => [...prev, agentMessage])

      toast({
        title: "Mensaje enviado",
        description: `Respuesta recibida de ${agent.name}`,
      })
    } catch (error) {
      console.error("Error al enviar mensaje:", error)
      toast({
        title: "Error de conexión",
        description: `No se pudo conectar con ${agent.name}. ${error instanceof Error ? error.message : "Error desconocido"}`,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputMessage)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      if (e.ctrlKey && e.shiftKey) {
        // Ctrl+Shift+Enter: agregar salto de línea
        return // Permitir comportamiento por defecto (salto de línea)
      } else if (!e.shiftKey && !e.ctrlKey) {
        // Enter solo: enviar mensaje
        e.preventDefault()
        if (inputMessage.trim() || pendingFiles.length > 0) {
          sendMessage(inputMessage)
        }
      }
    }
  }

  const handleFileUpload = (files: File[]) => {
    setPendingFiles((prev) => [...prev, ...files])
  }

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAudioSend = (audioBlob: Blob) => {
    sendMessage("", undefined, audioBlob)
  }

  return (
    <div className="h-[calc(100vh-2rem)]">
      <Card className="glass-effect h-full flex flex-col">
        {/* Header del Chat */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <Avatar className={`${agent.color} border-2 border-white/20`}>
              <AvatarFallback className="text-2xl bg-transparent">{agent.icon}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-card-foreground">{agent.name}</h3>
              <p className="text-sm text-muted-foreground">{agent.description}</p>
            </div>
          </div>
        </div>

        {/* Área de Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-4">{agent.icon}</div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">¡Hola! Soy tu {agent.name}</h3>
                <p className="text-muted-foreground">{agent.description}</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                agent={agent}
                user={supabase.auth.getUser ? (supabase.auth.getUser() as any).data?.user ?? {} : {}}
                userAvatarUrl={userAvatarUrl}
              />
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="glass-effect rounded-2xl p-3 max-w-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                  <div
                    className="w-2 h-2 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de Mensaje */}
        <div className="p-4 border-t border-border">
          {pendingFiles.length > 0 && (
            <div className="mb-3 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground mb-2">Archivos adjuntos:</div>
              <div className="space-y-2">
                {pendingFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-white/5 rounded">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-card-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removePendingFile(index)}
                      className="h-6 w-6 p-0 hover:bg-red-500/20 text-red-400"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1">
              <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Write a message here...`}
                className="glass-effect border-border text-card-foreground placeholder:text-muted-foreground min-h-[40px] max-h-32 resize-none"
                disabled={isLoading}
                rows={1}
              />
            </div>
            <FileUpload onFileUpload={handleFileUpload} disabled={isLoading} />
            <AudioRecorder onAudioSend={handleAudioSend} disabled={isLoading} />
            <Button
              type="submit"
              disabled={(!inputMessage.trim() && pendingFiles.length === 0) || isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
