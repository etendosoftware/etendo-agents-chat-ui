import { describe, expect, it, vi } from 'vitest'

const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

describe('RootPage', () => {
  it('redirects to default locale', async () => {
    const RootPage = (await import('../app/page')).default

    expect(() => RootPage()).toThrow('NEXT_REDIRECT:/en')
    expect(redirectMock).toHaveBeenCalledWith('/en')
  })
})
