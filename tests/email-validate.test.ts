import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalFetch = global.fetch

describe('email validation API route', () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = originalFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('../app/api/email/validate/route')
    const request = new NextRequest('https://app.test/api/email/validate', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'email es requerido' })
  })

  it('returns 502 when provider fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('upstream error', {
        status: 500,
        statusText: 'Server Error',
      }),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/email/validate/route')
    const request = new NextRequest('https://app.test/api/email/validate', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com' }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toBe('validation_failed')
  })

  it('passes through provider payload on success', async () => {
    const providerResponse = { status: 'VALID', score: 0.9 }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(providerResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    global.fetch = fetchMock as unknown as typeof fetch

    const { POST } = await import('../app/api/email/validate/route')
    const request = new NextRequest('https://app.test/api/email/validate', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com' }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ status: 'VALID', provider: providerResponse })
  })
})
