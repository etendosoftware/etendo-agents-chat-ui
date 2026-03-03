'use client'

import { useMutation } from '@tanstack/react-query'
import { submitFeedback } from '@/lib/actions/feedback'

export function useFeedback() {
  return useMutation({
    mutationFn: submitFeedback,
  })
}
