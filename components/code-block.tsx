'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
}

async function copyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined') return

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

export default function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const t = useTranslations('chat.codeBlock')
  const totalLines = code.split('\n').length
  const isLongCode = totalLines > 18

  const handleCopy = async () => {
    try {
      await copyText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-300/40 bg-slate-950/95 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-900/90 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-300">
          {language || t('plain')}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className="h-7 gap-1.5 px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>

      <pre className={cn("overflow-auto px-4 py-3 text-sm leading-6", !isExpanded && "max-h-[320px]")}>
        <code className={cn('font-mono whitespace-pre', className)}>{code}</code>
      </pre>
      {isLongCode ? (
        <div className="border-t border-slate-800/80 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="h-7 px-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {isExpanded ? t('collapse') : t('expand')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
