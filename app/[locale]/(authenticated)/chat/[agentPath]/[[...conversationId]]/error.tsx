'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[chat] Error boundary caught:', error)
  }, [error])

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="text-center max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-card-foreground">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred while loading the chat. Please try again.
        </p>
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      </div>
    </div>
  )
}
