import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

const createClientMock = vi.fn()
const signUpMock = vi.fn()
const fromMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

describe('signUpWithJiraCheck', () => {
  const originalEnv = process.env.JIRA_WEBHOOK_URL

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.JIRA_WEBHOOK_URL = 'https://example.com/jira'

    global.fetch = vi.fn()

    createClientMock.mockReturnValue({
      auth: {
        signUp: signUpMock,
      },
      from: fromMock,
    })

    fromMock.mockReturnValue({
      upsert: upsertMock,
    })

    upsertMock.mockResolvedValue({ error: null })

    signUpMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
  })

  afterEach(() => {
    process.env.JIRA_WEBHOOK_URL = originalEnv
  })

  it('assigns partner role when Jira webhook confirms membership', async () => {
    ;(global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: true }),
    })

    const { signUpWithJiraCheck } = await import('../app/[locale]/auth/register/actions')
    const result = await signUpWithJiraCheck({ email: 'user@example.com', password: 'secret123' })

    expect(result).toEqual({ success: true })
    expect(signUpMock).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret123' })
    expect(upsertMock).toHaveBeenCalledWith({ id: 'user-1', role: 'partner' })
  })

  it('defaults to non_client when Jira webhook returns false', async () => {
    ;(global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: false }),
    })

    const { signUpWithJiraCheck } = await import('../app/[locale]/auth/register/actions')
    const result = await signUpWithJiraCheck({ email: 'user@example.com', password: 'secret123' })

    expect(result).toEqual({ success: true })
    expect(upsertMock).toHaveBeenCalledWith({ id: 'user-1', role: 'non_client' })
  })

  it('returns error when sign up fails', async () => {
    ;(global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: false }),
    })

    signUpMock.mockResolvedValue({ data: { user: null }, error: { message: 'duplicate' } })

    const { signUpWithJiraCheck } = await import('../app/[locale]/auth/register/actions')
    const result = await signUpWithJiraCheck({ email: 'user@example.com', password: 'secret123' })

    expect(result).toEqual({ error: 'Failed to sign up: duplicate' })
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('propagates configuration error when webhook url missing', async () => {
    process.env.JIRA_WEBHOOK_URL = ''

    const { signUpWithJiraCheck } = await import('../app/[locale]/auth/register/actions')
    const result = await signUpWithJiraCheck({ email: 'user@example.com', password: 'secret123' })

    expect(result).toEqual({ error: 'Server configuration error. Please contact support.' })
    expect(signUpMock).not.toHaveBeenCalled()
  })
})
