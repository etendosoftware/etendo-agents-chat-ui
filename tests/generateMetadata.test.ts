import { generateMetadata } from '../app/(authenticated)/chat/[agentPath]/[[...conversationId]]/page'
import { vi } from 'vitest'

const maybeSingleMock = vi.hoisted(() => vi.fn())
const eqMock = vi.hoisted(() => vi.fn(() => ({ maybeSingle: maybeSingleMock })))
const selectMock = vi.hoisted(() => vi.fn(() => ({ eq: eqMock })))
const fromMock = vi.hoisted(() => vi.fn(() => ({ select: selectMock })))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: fromMock,
  }),
}))

describe('generateMetadata', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset()
    eqMock.mockClear()
    selectMock.mockClear()
    fromMock.mockClear()
  })

  it('returns agent specific metadata when agent exists', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        name: 'Support Agent',
        description: 'Assists with tickets',
        path: '/support',
      },
    })

    const metadata = await generateMetadata({ params: { agentPath: 'support' } })

    expect(metadata.title).toBe('Support Agent | Etendo Agents')
    expect(metadata.description).toBe('Assists with tickets')
    expect(metadata.openGraph?.description).toBe('Assists with tickets')
  })

  it('falls back to generic metadata when agent is missing', async () => {
    maybeSingleMock.mockResolvedValue({ data: null })

    const metadata = await generateMetadata({ params: { agentPath: 'unknown' } })

    expect(metadata.title).toBe('Chat | Etendo Agents')
  })

  it('handles supabase errors gracefully', async () => {
    maybeSingleMock.mockRejectedValue(new Error('boom'))

    const metadata = await generateMetadata({ params: { agentPath: 'error' } })

    expect(metadata.title).toBe('Chat | Etendo Agents')
  })
})
