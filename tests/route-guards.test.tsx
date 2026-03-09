import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from './utils/intl'

const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
}))

const cookieGetMock = vi.hoisted(() => vi.fn(() => undefined))
const cookieSetMock = vi.hoisted(() => vi.fn())

const adminAuthUserMock = vi.hoisted(() => vi.fn())
const adminProfileSingleMock = vi.hoisted(() => vi.fn())

const chatAuthUserMock = vi.hoisted(() => vi.fn())
const chatAgentSingleMock = vi.hoisted(() => vi.fn())
const chatProfileSingleMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/chat/special',
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: cookieGetMock,
    set: cookieSetMock,
  }),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => createTranslator('en', namespace),
}))

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({})),
  createServerClient: () => ({
    auth: {
      getUser: adminAuthUserMock,
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: adminProfileSingleMock }),
          }),
        }
      }

      return {
        select: () => ({ data: [], error: null }),
      }
    },
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: chatAuthUserMock,
    },
    from: (table: string) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({ single: chatAgentSingleMock }),
          }),
        }
      }

      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: chatProfileSingleMock }),
          }),
        }
      }

      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              order: vi.fn().mockResolvedValue({ data: [] }),
            }),
            order: vi.fn().mockResolvedValue({ data: [] }),
          }),
          order: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }
    },
  }),
}))

describe('route guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects unauthenticated user from admin page', async () => {
    adminAuthUserMock.mockResolvedValue({ data: { user: null } })
    const AdminPage = (await import('../app/[locale]/(authenticated)/admin/page')).default

    await expect(AdminPage({ params: { locale: 'en' } as any })).rejects.toThrow(
      'NEXT_REDIRECT:/auth/login',
    )
  })

  it('redirects non-admin user from admin page', async () => {
    adminAuthUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    adminProfileSingleMock.mockResolvedValue({ data: { role: 'partner' }, error: null })

    const AdminPage = (await import('../app/[locale]/(authenticated)/admin/page')).default

    await expect(AdminPage({ params: { locale: 'en' } as any })).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('redirects unauthenticated user from protected chat route', async () => {
    chatAuthUserMock.mockResolvedValue({ data: { user: null } })
    chatAgentSingleMock.mockResolvedValue({
      data: { id: 'agent-1', access_level: 'partner', path: '/sales' },
      error: null,
    })

    const ChatPage = (await import('../app/[locale]/(authenticated)/chat/[agentPath]/[[...conversationId]]/page')).default

    await expect(
      ChatPage({ params: { locale: 'en', agentPath: 'sales' } as any }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/auth/login')
  })

  it('shows access denied for authenticated user without required role', async () => {
    const t = createTranslator('en', 'chat.errors.accessDenied')
    chatAuthUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'demo@example.com' } } })
    chatProfileSingleMock.mockResolvedValue({ data: { role: 'partner', is_partner: true, is_customer: false }, error: null })
    chatAgentSingleMock.mockResolvedValue({
      data: { id: 'agent-1', access_level: 'non_client', path: '/special' },
      error: null,
    })

    const ChatPage = (await import('../app/[locale]/(authenticated)/chat/[agentPath]/[[...conversationId]]/page')).default
    const element = await ChatPage({ params: { locale: 'en', agentPath: 'special' } as any })

    render(element as React.ReactElement)
    expect(screen.getByText(t('title'))).toBeInTheDocument()
  })
})
