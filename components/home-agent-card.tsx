'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { queryKeys } from '@/lib/query-keys'
import { fetchConversationList } from '@/lib/query-functions'
import type { Agent } from '@/components/chat-interface'
import type { Conversation } from '@/lib/actions/chat'

interface HomeAgentCardProps {
  agent: Agent
  localePrefix: string
  chatLabel: string
}

export default function HomeAgentCard({ agent, localePrefix, chatLabel }: HomeAgentCardProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isNavigating, setIsNavigating] = useState(false)
  const hasPrefetchedRef = useRef(false)
  const href = `${localePrefix}/chat/${agent.path.replace('/', '')}`

  const prefetchAgent = useCallback(() => {
    if (hasPrefetchedRef.current) {
      return
    }

    hasPrefetchedRef.current = true
    router.prefetch(href)
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.conversations.list(agent.id, ''),
      queryFn: ({ pageParam }) =>
        fetchConversationList(agent.id, {
          searchTerm: '',
          page: pageParam as number,
          limit: 10,
        }),
      initialPageParam: 1,
      staleTime: 2 * 60 * 1000,
      getNextPageParam: (lastPage: Conversation[], allPages: Conversation[][]) =>
        lastPage.length === 10 ? allPages.length + 1 : undefined,
    })
  }, [agent.id, href, queryClient, router])

  return (
    <Card className="border-border/60 bg-white/85 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-4">
          <span className="text-3xl">{agent.icon}</span>
          <div className="min-w-0">
            <CardTitle className="truncate text-slate-900">{agent.name}</CardTitle>
            <CardDescription className="pt-1 line-clamp-2 text-sm text-slate-600">{agent.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="flex items-center justify-between pt-0">
        <span className="rounded-full border border-[#e7c514] bg-[#fad614]/35 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[#202452]">
          AI
        </span>
        <Button asChild className="min-w-[110px] gap-1" aria-disabled={isNavigating}>
          <Link
            href={href}
            onMouseEnter={prefetchAgent}
            onFocus={prefetchAgent}
            onTouchStart={prefetchAgent}
            onClick={(event) => {
              if (isNavigating) {
                event.preventDefault()
                return
              }
              setIsNavigating(true)
            }}
            className={isNavigating ? 'pointer-events-none' : undefined}
          >
            {isNavigating ? <Loader2 className="h-4 w-4 animate-spin" /> : chatLabel}
            {!isNavigating ? <ArrowUpRight className="h-4 w-4" /> : null}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
