import { describe, it, expect, beforeEach, vi } from 'vitest'

const createClientMock = vi.fn()
const exchangeCodeMock = vi.fn()
const selectMock = vi.fn()
const selectEqMock = vi.fn()
const selectSingleMock = vi.fn()
const updateMock = vi.fn()
const updateEqMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

describe('auth callback route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env.JIRA_WEBHOOK_URL = 'https://example.com/jira'

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: true }),
    })

    selectMock.mockReturnValue({ eq: selectEqMock })
    selectEqMock.mockReturnValue({ single: selectSingleMock })
    selectSingleMock.mockResolvedValue({ data: { role: 'non_client' }, error: null })

    updateMock.mockReturnValue({ eq: updateEqMock })
    updateEqMock.mockResolvedValue({ error: null })

    createClientMock.mockReturnValue({
      auth: {
        exchangeCodeForSession: exchangeCodeMock,
      },
      from: () => ({
        select: selectMock,
        update: updateMock,
      }),
    })

    exchangeCodeMock.mockResolvedValue({
      data: { session: { user: { id: 'user-1', email: 'user@example.com' } } },
      error: null,
    })
  })

  it('updates profile role based on Jira response and redirects home', async () => {
    const { GET } = await import('../app/auth/callback/route')
    const request = new Request('https://app.com/auth/callback?code=abc')

    const response = await GET(request)

    expect(exchangeCodeMock).toHaveBeenCalledWith('abc')
    expect(updateMock).toHaveBeenCalledWith({ role: 'partner' })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'user-1')
    expect(response.headers.get('location')).toBe('https://app.com/')
  })

  it('skips role update for admin profiles', async () => {
    selectSingleMock.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })

    const { GET } = await import('../app/auth/callback/route')
    const request = new Request('https://app.com/auth/callback?code=abc')

    await GET(request)

    expect(updateMock).not.toHaveBeenCalled()
  })

  it('redirects to login on exchange error', async () => {
    exchangeCodeMock.mockResolvedValueOnce({ data: { session: null }, error: { message: 'invalid' } })

    const { GET } = await import('../app/auth/callback/route')
    const request = new Request('https://app.com/auth/callback?code=bad')

    const response = await GET(request)

    expect(response.headers.get('location')).toBe('https://app.com/auth/login?error=oauth_failed')
  })
})
