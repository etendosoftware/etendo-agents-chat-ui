"use client"

import type React from "react"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Paperclip } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FileUploadProps {
  onFileUpload: (files: File[]) => void
  disabled?: boolean
}

export default function FileUpload({ onFileUpload, disabled }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    if (files.length === 0) return

    // Validar tamaño de archivos (máximo 10MB por archivo)
    const maxSize = 10 * 1024 * 1024 // 10MB
    const oversizedFiles = files.filter((file) => file.size > maxSize)

    if (oversizedFiles.length > 0) {
      toast({
        title: "Archivos demasiado grandes",
        description: `Los archivos deben ser menores a 10MB. ${oversizedFiles.length} archivo(s) exceden este límite.`,
        variant: "destructive",
      })
      return
    }

    onFileUpload(files)

    // Limpiar el input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    toast({
      title: "Archivos adjuntados",
      description: `${files.length} archivo(s) listo(s) para enviar.`,
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
        accept="*"
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
        Upload Files
      </Button>
    </>
  )
}
