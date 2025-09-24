"use client"

import type React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Download, FileText, ImageIcon, Play, Pause, ThumbsUp, ThumbsDown } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import type { Message, Agent } from "./chat-interface"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { User } from "@supabase/supabase-js"
import { submitFeedback } from "@/lib/actions/feedback"
import LinkPreview from "./link-preview"

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
}

export default function MessageBubble({ message, agent, user, userAvatarUrl }: MessageBubbleProps) {
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
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
        console.error("Conversation ID is missing");
        return;
    }
    
    setFeedbackSubmitted(true);
    if (isFeedbackDialogOpen) {
      setIsFeedbackDialogOpen(false);
    }

    await submitFeedback({
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

  const cleanedContent = message.content ? message.content.replace(/(\n\nUser email:.*|\n\nFilesAttached:.*)/gs, "").trim() : "";
  const youtubeVideoIds = cleanedContent ? getYouTubeVideoIds(cleanedContent) : []
  const otherUrls = cleanedContent ? getOtherUrls(cleanedContent) : []

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <Avatar className={`${agent.color} border border-white/20 flex-shrink-0`}>
          <AvatarFallback className="bg-transparent">{agent.icon}</AvatarFallback>
        </Avatar>
      )}

      <div className={`flex flex-col gap-1 max-w-xs lg:max-w-md ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`glass-effect rounded-2xl p-3 ${
            isUser ? "bg-primary/20 border-primary/30" : "bg-white border-white/10"
          }`}
        >
          {cleanedContent && (
            <div className="prose prose-invert max-w-none text-sm leading-relaxed overflow-x-auto">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                }}
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
              {otherUrls.map((url) => (
                <LinkPreview key={url} url={url} />
              ))}
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
                    onClick={() => {
                      const link = document.createElement("a")
                      link.href = attachment.url
                      link.download = attachment.name
                      link.click()
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

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatTime(message.timestamp)}</span>
        </div>
        {!isUser && user && (
          <div className="flex items-center gap-1 text-muted-foreground h-7">
            {feedbackSubmitted ? (
              <p className="text-xs italic">Thank you for your feedback!</p>
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
            <DialogTitle>Provide additional feedback</DialogTitle>
            <DialogDescription>
              Your feedback is valuable in helping us improve the agent.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="What did you not like about this response?"
          />
          <DialogFooter>
            <Button onClick={() => setIsFeedbackDialogOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button onClick={() => handleFeedbackSubmit('bad', feedbackText)}>
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
