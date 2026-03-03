"use client"

import type React from "react"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Paperclip } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from "@/lib/constants"

interface FileUploadProps {
  onFileUpload: (files: File[]) => void
  disabled?: boolean
}

export default function FileUpload({ onFileUpload, disabled }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('chat.interface.fileUpload')
  const tInterface = useTranslations('chat.interface')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    if (files.length === 0) return

    // Validate MIME types
    const invalidTypeFiles = files.filter(
      (file) => file.type && !ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])
    )

    if (invalidTypeFiles.length > 0) {
      toast.error(t('invalidType'), {
        description: t('invalidTypeDesc', { files: invalidTypeFiles.map(f => f.name).join(', ') }),
      })
      return
    }

    // Validate file size (max 10MB per file)
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
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,audio/*,video/*"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="w-full justify-start rounded-md px-2 py-1.5 text-sm hover:bg-gray-100"
      >
        <Paperclip className="w-4 h-4" />
        {tInterface('attachFiles')}
      </Button>
    </>
  )
}
