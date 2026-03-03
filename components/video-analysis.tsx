"use client"

import type React from "react"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Paperclip, Video } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { MAX_FILE_SIZE } from "@/lib/constants"

interface FileUploadProps {
  onFileUpload: (files: File[]) => void
  disabled?: boolean
}

export default function VideoAnalysis({ onFileUpload, disabled }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('chat.interface.fileUpload')
  const tInterface = useTranslations('chat.interface')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    if (files.length === 0) return

    const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE)

    if (oversizedFiles.length > 0) {
      toast.error(t('tooLarge'), {
        description: t('tooLargeDesc', { size: 10, count: oversizedFiles.length }),
      })
      return
    }

    onFileUpload(files)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    toast.success(t('attached'), {
      description: t('attachedDesc', { count: files.length }),
    })
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept="video/*"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="w-full justify-start rounded-md px-2 py-1.5 text-sm hover:bg-gray-100"
      >
        <Video className="w-4 h-4" />
        {tInterface('videoAnalysisBtn')}
      </Button>
    </>
  )
}
