import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionMock = vi.hoisted(() => vi.fn())
const signOutMock = vi.hoisted(() => vi.fn())
const cookieGetMock = vi.hoisted(() => vi.fn(() => undefined))
const cookieSetMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: cookieGetMock,
    set: cookieSetMock,
  }),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getSession: getSessionMock,
      signOut: signOutMock,
    },
  }),
}))

describe('signout route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls signOut when session exists and redirects to locale root', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    const { POST } = await import('../app/[locale]/auth/signout/route')

    const response = await POST(new Request('https://app.test/es/auth/signout'), {
      params: { locale: 'es' },
    })

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://app.test/es')
  })

  it('skips signOut when no session and still redirects', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })
    const { POST } = await import('../app/[locale]/auth/signout/route')

    const response = await POST(new Request('https://app.test/en/auth/signout'), {
      params: { locale: 'en' },
    })

    expect(signOutMock).not.toHaveBeenCalled()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://app.test/en')
  })
})
