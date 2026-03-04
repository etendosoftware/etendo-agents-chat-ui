"use client"

import React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Download, FileText, ImageIcon, Play, Pause, ThumbsUp, ThumbsDown } from "lucide-react"
import { useState, useRef, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import type { Message, Agent } from "./chat-interface"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import type { Components } from "react-markdown"
import { visit } from "unist-util-visit"
import type { Plugin } from "unified"
import { User } from "@supabase/supabase-js"
import { toast } from "sonner"
import { useFeedback } from "@/hooks/use-feedback"
import LinkPreview from "./link-preview"
import CodeBlock from "./code-block"

const YOUTUBE_URL_REGEX = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/[\w?=&\-#\/]+|youtu\.be\/[\w\-]+)/gi
const URL_REGEX = /https?:\/\/[^\s<>()\"]+/gi

const extractYouTubeVideoId = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "")

    if (hostname === "youtu.be") {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0]
      return videoId ? videoId.split("?")[0] : null
    }

    if (hostname.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v")
      }

      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null
      }
    }
  } catch (error) {
    return null
  }

  return null
}

const getYouTubeVideoIds = (text: string) => {
  const matches = text.match(YOUTUBE_URL_REGEX)
  if (!matches) return []

  const ids = matches
    .map((match) => extractYouTubeVideoId(match))
    .filter((id): id is string => Boolean(id))

  return Array.from(new Set(ids))
}

const getOtherUrls = (text: string) => {
  const allUrls = text.match(URL_REGEX) || [];
  // We need to reset the lastIndex because we are using a global regex.
  YOUTUBE_URL_REGEX.lastIndex = 0;
  const otherUrls = allUrls.filter(url => {
    YOUTUBE_URL_REGEX.lastIndex = 0; // Reset before every test
    return !YOUTUBE_URL_REGEX.test(url);
  });
  return Array.from(new Set(otherUrls));
}

interface MessageBubbleProps {
  message: Message
  agent: Agent
  user: User | null
  userAvatarUrl: string | null
  highlightTerm?: string
  isActiveMatch?: boolean
}

// Rehype plugin that wraps matched text in <mark> elements.
// Runs after rehypeSanitize so marks are never stripped.
function rehypeHighlightTerm(term: string): Plugin {
  return () => (tree: unknown) => {
    if (!term) return
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`(${escaped})`, "gi")
    visit(tree as Parameters<typeof visit>[0], "text", (node: { type: string; value: string }, index, parent: { children: unknown[] } | null) => {
      if (typeof index !== "number" || !parent) return
      regex.lastIndex = 0
      if (!regex.test(node.value)) return
      regex.lastIndex = 0
      const parts = node.value.split(regex).filter(Boolean)
      if (parts.length <= 1) return
      const newNodes = parts.map((part) => {
        if (part.toLowerCase() === term.toLowerCase()) {
          return {
            type: "element",
            tagName: "mark",
            properties: { className: ["bg-yellow-200", "rounded-sm"] },
            children: [{ type: "text", value: part }],
          }
        }
        return { type: "text", value: part }
      })
      parent.children.splice(index, 1, ...newNodes)
      return index + newNodes.length
    })
  }
}

function MessageBubbleComponent({ message, agent, user, userAvatarUrl, highlightTerm, isActiveMatch }: MessageBubbleProps) {
  const t = useTranslations("chat.feedback")
  const tInterface = useTranslations("chat.interface")
  const { mutate: submitFeedbackMutation } = useFeedback()
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showAllLinkPreviews, setShowAllLinkPreviews] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [message.audioUrl])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatAudioTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const handleAudioPlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return

    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = clickX / rect.width
    const newTime = percentage * duration

    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleFeedbackSubmit = async (rating: 'good' | 'bad', text?: string) => {
    if (!message.conversationId) {
        toast.error(t('missingConversationTitle'), {
          description: t('missingConversationDesc'),
        });
        return;
    }
    
    setFeedbackSubmitted(true);
    if (isFeedbackDialogOpen) {
      setIsFeedbackDialogOpen(false);
    }

    submitFeedbackMutation({
      rating: rating,
      feedbackText: text,
      messageId: message.id,
      conversationId: message.conversationId,
      agentId: agent.id,
    });

    setTimeout(() => {
        setFeedbackSubmitted(false);
        setFeedbackText('');
    }, 3000);
  };

  const isUser = message.sender === "user"

  const cleanedContent = useMemo(
    () => message.content ? message.content.replace(/(\n\nUser email:.*|\n\nFilesAttached:.*)/gs, "").trim() : "",
    [message.content]
  );
  const youtubeVideoIds = useMemo(
    () => cleanedContent ? getYouTubeVideoIds(cleanedContent) : [],
    [cleanedContent]
  );
  const otherUrls = useMemo(
    () => cleanedContent ? getOtherUrls(cleanedContent) : [],
    [cleanedContent]
  );
  const visibleLinkPreviews = showAllLinkPreviews ? otherUrls : otherUrls.slice(0, 2)

  const markdownComponents = useMemo<Components>(() => ({
    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
    pre: ({ children }) => {
      const child = Array.isArray(children) ? children[0] : children

      if (!React.isValidElement(child)) {
        return <pre>{children}</pre>
      }

      const childProps = child.props as { className?: string; children?: React.ReactNode }
      const code = String(childProps?.children ?? "").replace(/\n$/, "")
      const languageMatch = /language-([\w-]+)/.exec(childProps?.className || "")
      const language = languageMatch?.[1]

      return (
        <CodeBlock
          code={code}
          language={language}
          className={childProps?.className}
        />
      )
    },
    code: ({ className, children, ...props }) => {
      return (
        <code
          {...props}
          className={`rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em] ${className ?? ""}`.trim()}
        >
          {children}
        </code>
      )
    },
  }), [])

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <Avatar className={`${agent.color} border border-white/20 flex-shrink-0`}>
          <AvatarFallback className="bg-transparent">{agent.icon}</AvatarFallback>
        </Avatar>
      )}

      <div
        className={`flex flex-col gap-1 ${
          isUser
            ? "max-w-[86%] md:max-w-[74%] lg:max-w-[66%] items-end"
            : "max-w-[94%] md:max-w-[88%] lg:max-w-[82%] items-start"
        }`}
      >
        <div
          className={`rounded-2xl border p-3 shadow-sm ${
            isUser ? "border-primary/40 bg-primary/10" : "border-slate-200/80 bg-white"
          }${isActiveMatch ? " ring-2 ring-yellow-400" : ""}`}
        >
          {cleanedContent && (
            <div className="max-w-none text-sm leading-relaxed break-words [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_a]:text-primary [&_a]:underline [&_code]:font-mono">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={
                  highlightTerm
                    ? [rehypeSanitize, rehypeHighlightTerm(highlightTerm)]
                    : [rehypeSanitize]
                }
                components={markdownComponents}
              >
                {cleanedContent}
              </ReactMarkdown>
            </div>
          )}

          {youtubeVideoIds.length > 0 && (
            <div className="mt-3 space-y-3">
              {youtubeVideoIds.map((videoId) => (
                <div key={videoId} className="relative w-full overflow-hidden rounded-lg border border-white/10">
                  <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title="YouTube video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {otherUrls.length > 0 && (
            <div className="mt-3 space-y-3">
              {visibleLinkPreviews.map((url) => (
                <LinkPreview key={url} url={url} />
              ))}
              {otherUrls.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setShowAllLinkPreviews((prev) => !prev)}
                >
                  {showAllLinkPreviews
                    ? tInterface('showLessLinks')
                    : tInterface('showMoreLinks', { count: otherUrls.length - 2 })}
                </Button>
              )}
            </div>
          )}

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                  {attachment.type.startsWith("image/") ? (
                    <ImageIcon className="w-4 h-4 text-primary" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-card-foreground truncate">{attachment.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const newWindow = window.open(attachment.url, '_blank')
                        if (newWindow) {
                          newWindow.opener = null
                        } else {
                          window.location.href = attachment.url
                        }
                      }
                    }}
                    className="h-6 w-6 p-0 hover:bg-white/10"
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {message.audioUrl && (
            <div className="mt-2 flex items-center gap-2 p-2 bg-white/5 rounded-lg">
              <Button size="sm" variant="ghost" onClick={handleAudioPlay} className="h-8 w-8 p-0 hover:bg-white/10">
                {isPlaying ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-primary" />}
              </Button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="h-1 bg-white/20 rounded-full flex-1 cursor-pointer" onClick={handleProgressClick}>
                    <div
                      className="h-1 bg-primary rounded-full transition-all duration-100"
                      style={{
                        width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%",
                      }}
                    ></div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
                  </span>
                </div>
              </div>
              <audio ref={audioRef} src={message.audioUrl} className="hidden" preload="metadata" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] text-muted-foreground/90">{formatTime(message.timestamp)}</span>
        </div>
        {!isUser && user && (
          <div className="flex items-center gap-1 text-muted-foreground h-7">
            {feedbackSubmitted ? (
              <p className="text-xs italic">{t("thanks")}</p>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-white/5"
                  onClick={() => handleFeedbackSubmit('good')}
                >
                  <ThumbsUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-white/5"
                  onClick={() => setIsFeedbackDialogOpen(true)}
                >
                  <ThumbsDown className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {isUser && user && (
        <Avatar className="bg-primary/20 border border-primary/30 flex-shrink-0">
          {userAvatarUrl ? (
            <AvatarImage src={userAvatarUrl} alt={message.sender} />
          ) : (
            <AvatarFallback className="bg-transparent text-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
      )}
      <Dialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialog.title")}</DialogTitle>
            <DialogDescription>
              {t("dialog.description")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder={t("dialog.placeholder")}
          />
          <DialogFooter>
            <Button onClick={() => setIsFeedbackDialogOpen(false)} variant="ghost">
              {t("dialog.cancel")}
            </Button>
            <Button onClick={() => handleFeedbackSubmit('bad', feedbackText)}>
              {t("dialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function areAttachmentsEqual(
  previous: Message["attachments"],
  next: Message["attachments"],
) {
  if (previous === next) {
    return true
  }

  if (!previous || !next) {
    return !previous && !next
  }

  if (previous.length !== next.length) {
    return false
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousItem = previous[index]
    const nextItem = next[index]

    if (
      previousItem.name !== nextItem.name ||
      previousItem.type !== nextItem.type ||
      previousItem.url !== nextItem.url ||
      previousItem.size !== nextItem.size
    ) {
      return false
    }
  }

  return true
}

function getTimestampValue(value: Date) {
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function areMessageBubblePropsEqual(previous: MessageBubbleProps, next: MessageBubbleProps) {
  if (previous.highlightTerm !== next.highlightTerm || previous.isActiveMatch !== next.isActiveMatch) {
    return false
  }

  if (previous.userAvatarUrl !== next.userAvatarUrl) {
    return false
  }

  if (previous.agent.id !== next.agent.id || previous.agent.color !== next.agent.color || previous.agent.icon !== next.agent.icon) {
    return false
  }

  if (previous.user?.id !== next.user?.id || previous.user?.email !== next.user?.email) {
    return false
  }

  const previousMessage = previous.message
  const nextMessage = next.message

  if (previousMessage === nextMessage) {
    return true
  }

  if (
    previousMessage.id !== nextMessage.id ||
    previousMessage.sender !== nextMessage.sender ||
    previousMessage.content !== nextMessage.content ||
    previousMessage.agentId !== nextMessage.agentId ||
    previousMessage.conversationId !== nextMessage.conversationId ||
    previousMessage.audioUrl !== nextMessage.audioUrl ||
    getTimestampValue(previousMessage.timestamp) !== getTimestampValue(nextMessage.timestamp)
  ) {
    return false
  }

  return areAttachmentsEqual(previousMessage.attachments, nextMessage.attachments)
}

const MessageBubble = React.memo(MessageBubbleComponent, areMessageBubblePropsEqual)

MessageBubble.displayName = "MessageBubble"

export default MessageBubble
