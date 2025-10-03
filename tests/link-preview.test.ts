import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/server', async (importOriginal: () => Promise<object>) => {
  const actual = await importOriginal()
  return {
    ...actual,
  }
})

describe('link preview API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('returns metadata extracted from HTML pages', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve(`<!doctype html><html><head><title>Example</title><meta property="og:description" content="Description"/><meta property="og:image" content="https://example.com/image.png"/></head><body></body></html>`),
    })

    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest('https://app.com/api/link-preview?url=https://example.com')

    const response = await GET(request)
    const data = await response.json()

    expect(data).toEqual({
      title: 'Example',
      description: 'Description',
      image: 'https://example.com/image.png',
    })
  })

  it('returns fallback for non HTML content', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      text: () => Promise.resolve(''),
    })

    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest('https://app.com/api/link-preview?url=https://example.com/file.pdf')

    const response = await GET(request)
    const data = await response.json()

    expect(data).toEqual({
      title: 'https://example.com/file.pdf',
      description: 'Link to a non-HTML resource.',
      image: null,
    })
  })

  it('handles fetch errors gracefully', async () => {
    ;(global.fetch as Mock).mockRejectedValue(new Error('network error'))

    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest('https://app.com/api/link-preview?url=https://bad.example.com')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to fetch link preview')
  })
})
