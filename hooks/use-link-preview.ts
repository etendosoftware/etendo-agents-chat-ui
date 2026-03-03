'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { fetchLinkPreviewData } from '@/lib/query-functions'

interface UseLinkPreviewOptions {
  enabled?: boolean
}

export function useLinkPreview(url: string, options: UseLinkPreviewOptions = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: queryKeys.linkPreview.byUrl(url),
    queryFn: () => fetchLinkPreviewData(url),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })
}
