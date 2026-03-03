import { describe, expect, it, vi } from 'vitest'

const middlewareFactoryMock = vi.hoisted(() => vi.fn(() => 'middleware-handler'))

vi.mock('next-intl/middleware', () => ({
  default: middlewareFactoryMock,
}))

describe('middleware config', () => {
  it('creates next-intl middleware with expected options', async () => {
    const mod = await import('../middleware')

    expect(middlewareFactoryMock).toHaveBeenCalledWith({
      locales: ['en', 'es'],
      defaultLocale: 'en',
      localePrefix: 'always',
    })
    expect(mod.default).toBe('middleware-handler')
  })

  it('excludes api and static paths via matcher', async () => {
    const mod = await import('../middleware')

    expect(mod.config.matcher).toEqual(['/((?!_next|favicon.ico|.*\\..*|api).*)'])
  })
})
