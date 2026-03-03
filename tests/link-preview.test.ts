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

  it('returns 400 when url query param is missing', async () => {
    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest('https://app.com/api/link-preview')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('URL is required')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['file:// scheme',       'file:///etc/passwd'],
    ['javascript: scheme',   'javascript:alert(1)'],
    ['localhost',            'http://localhost/admin'],
    ['127.0.0.1 loopback',  'http://127.0.0.1/'],
    ['127.x.x.x range',     'http://127.0.0.2/sensitive'],
    ['10.x.x.x private',    'http://10.0.0.1/internal'],
    ['172.16 private',      'http://172.16.0.1/'],
    ['172.31 private',      'http://172.31.255.255/'],
    ['192.168.x.x private', 'http://192.168.1.100/router'],
    ['169.254 link-local',  'http://169.254.169.254/latest/meta-data/'],
    ['0.x.x.x reserved',   'http://0.0.0.0/'],
    ['IPv6 loopback',       'http://[::1]/'],
    ['IPv6 ULA fc range',   'http://[fc00::1]/'],
    ['IPv6 ULA fd range',   'http://[fd00::1]/'],
  ])('blocks SSRF attempt: %s → 400', async (_label, blockedUrl) => {
    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest(`https://app.com/api/link-preview?url=${encodeURIComponent(blockedUrl)}`)

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('URL not allowed')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('relays upstream non-200 status to the client', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest('https://app.com/api/link-preview?url=https://example.com/missing')

    const response = await GET(request)

    expect(response.status).toBe(404)
  })

  it('og:title takes precedence over <title> element', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve(
        `<html><head><title>Page Title</title><meta property="og:title" content="OG Title"/></head></html>`
      ),
    })

    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest('https://app.com/api/link-preview?url=https://example.com')

    const response = await GET(request)
    const data = await response.json()

    expect(data.title).toBe('OG Title')
  })

  it('falls back to <title> when no og:title is present', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve('<html><head><title>Fallback Title</title></head></html>'),
    })

    const { GET } = await import('../app/api/link-preview/route')
    const request = new NextRequest('https://app.com/api/link-preview?url=https://example.com')

    const response = await GET(request)
    const data = await response.json()

    expect(data.title).toBe('Fallback Title')
  })

  it('falls back to url when no title meta or <title> exists', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve('<html><head></head><body>No title here</body></html>'),
    })

    const { GET } = await import('../app/api/link-preview/route')
    const targetUrl = 'https://example.com/notitle'
    const request = new NextRequest(`https://app.com/api/link-preview?url=${encodeURIComponent(targetUrl)}`)

    const response = await GET(request)
    const data = await response.json()

    expect(data.title).toBe(targetUrl)
  })

  it('allows public IPs on the boundary of blocked ranges (172.15 and 172.32)', async () => {
    ;(global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve('<html><head><title>Public</title></head></html>'),
    })

    const { GET } = await import('../app/api/link-preview/route')

    for (const ip of ['172.15.0.1', '172.32.0.1']) {
      const request = new NextRequest(`https://app.com/api/link-preview?url=${encodeURIComponent(`http://${ip}/`)}`)
      const response = await GET(request)
      // These IPs are outside the blocked 172.16-31 range, so they should not be blocked by SSRF rules
      expect(response.status).not.toBe(400)
    }
  })
})
