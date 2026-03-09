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

  it('assigns partner membership when Jira webhook confirms ESD membership', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: true, isESD: true, isCSP: false }),
    })

    const { signUpWithJiraCheck } = await import('../app/[locale]/auth/register/actions')
    const result = await signUpWithJiraCheck({ email: 'user@example.com', password: 'secret123' })

    expect(result).toEqual({ success: true })
    expect(signUpMock).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret123' })
    expect(upsertMock).toHaveBeenCalledWith({
      id: 'user-1',
      role: 'partner',
      is_partner: true,
      is_customer: false,
    })
  })

  it('stores customer membership without breaking legacy non_client role', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: true, isESD: false, isCSP: true }),
    })

    const { signUpWithJiraCheck } = await import('../app/[locale]/auth/register/actions')
    const result = await signUpWithJiraCheck({ email: 'user@example.com', password: 'secret123' })

    expect(result).toEqual({ success: true })
    expect(upsertMock).toHaveBeenCalledWith({
      id: 'user-1',
      role: 'non_client',
      is_partner: false,
      is_customer: true,
    })
  })

  it('stores both memberships when user belongs to both Jira desks', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: true, isESD: true, isCSP: true }),
    })

    const { signUpWithJiraCheck } = await import('../app/[locale]/auth/register/actions')
    const result = await signUpWithJiraCheck({ email: 'user@example.com', password: 'secret123' })

    expect(result).toEqual({ success: true })
    expect(upsertMock).toHaveBeenCalledWith({
      id: 'user-1',
      role: 'partner',
      is_partner: true,
      is_customer: true,
    })
  })

  it('returns error when sign up fails', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isJiraUser: false, isESD: false, isCSP: false }),
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
