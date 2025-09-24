"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Mic, Square } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface AudioRecorderProps {
  onAudioSend: (audioBlob: Blob) => void
  disabled?: boolean
}

export default function AudioRecorder({ onAudioSend, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
        onAudioSend(audioBlob)

        // Detener todas las pistas de audio
        stream.getTracks().forEach((track) => track.stop())

        toast({
          title: "Audio grabado",
          description: `Grabación de ${recordingTime}s enviada.`,
        })
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      // Iniciar contador de tiempo
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 60) {
            // Máximo 60 segundos
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } catch (error) {
      console.error("Error accessing microphone:", error)
      toast({
        title: "Error de micrófono",
        description: "No se pudo acceder al micrófono. Verifica los permisos.",
        variant: "destructive",
      })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingTime(0)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex items-center gap-2">
      {isRecording && (
        <div className="flex items-center gap-2 px-2 py-1 bg-destructive/20 rounded-lg">
          <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
          <span className="text-xs text-destructive font-mono">{formatTime(recordingTime)}</span>
        </div>
      )}

      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="sm"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled}
        className={isRecording ? "" : "glass-effect border-border hover:bg-white/5"}
      >
        {isRecording ? <Square className="" /> : <Mic />}
      </Button>
    </div>
  )
}
