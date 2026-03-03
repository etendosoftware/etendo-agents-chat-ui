import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieGetMock = vi.hoisted(() => vi.fn())
const headerGetMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: cookieGetMock,
  }),
  headers: () => ({
    get: headerGetMock,
  }),
}))

describe('getRequestLocale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieGetMock.mockReturnValue(undefined)
    headerGetMock.mockReturnValue(null)
  })

  it('prefers NEXT_LOCALE cookie over Accept-Language', async () => {
    cookieGetMock.mockReturnValue({ value: 'es' })
    headerGetMock.mockReturnValue('en-US,en;q=0.8')

    const { getRequestLocale } = await import('../i18n/request')
    const locale = await getRequestLocale()

    expect(locale).toBe('es')
  })

  it('falls back to Accept-Language when cookie is absent', async () => {
    headerGetMock.mockReturnValue('es-AR,es;q=0.9,en;q=0.8')

    const { getRequestLocale } = await import('../i18n/request')
    const locale = await getRequestLocale()

    expect(locale).toBe('es')
  })

  it('uses default locale when no hints are present', async () => {
    const { getRequestLocale } = await import('../i18n/request')
    const locale = await getRequestLocale()

    expect(locale).toBe('en')
  })
})
