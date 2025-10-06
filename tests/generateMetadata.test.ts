import { generateMetadata } from '../app/[locale]/(authenticated)/chat/[agentPath]/[[...conversationId]]/page'
import { vi } from 'vitest'
import { createTranslator } from './utils/intl'

const agentsMaybeSingleMock = vi.hoisted(() => vi.fn())
const translationsMaybeSingleMock = vi.hoisted(() => vi.fn())

const agentSelectMock = vi.hoisted(() => vi.fn(() => ({
  eq: vi.fn(() => ({ maybeSingle: agentsMaybeSingleMock })),
})))

const translationSelectMock = vi.hoisted(() => vi.fn(() => ({
  eq: vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: translationsMaybeSingleMock })),
  })),
})))

const fromMock = vi.hoisted(() =>
  vi.fn((table: string) => {
    if (table === 'agents') {
      return { select: agentSelectMock }
    }

    if (table === 'agent_translations') {
      return { select: translationSelectMock }
    }

    return { select: vi.fn() }
  })
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: fromMock,
  }),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => createTranslator('en', namespace),
}))

describe('generateMetadata', () => {
  beforeEach(() => {
    agentsMaybeSingleMock.mockReset()
    translationsMaybeSingleMock.mockReset()
    agentSelectMock.mockClear()
    translationSelectMock.mockClear()
    fromMock.mockClear()
  })

  it('returns agent specific metadata when agent exists', async () => {
    agentsMaybeSingleMock.mockResolvedValue({
      data: {
        id: 'agent-1',
        name: 'Support Agent',
        description: 'Assists with tickets',
        path: '/support',
      },
    })
    translationsMaybeSingleMock.mockResolvedValue({ data: null })

    const metadata = await generateMetadata({ params: { locale: 'en', agentPath: 'support' } })

    const tMetadata = createTranslator('en', 'chat.metadata')

    expect(metadata.title).toBe(tMetadata('agentTitle', { agentName: 'Support Agent' }))
    expect(metadata.description).toBe('Assists with tickets')
    expect(metadata.openGraph?.title).toBe(tMetadata('agentTitle', { agentName: 'Support Agent' }))
    expect(metadata.openGraph?.description).toBe('Assists with tickets')
  })

  it('falls back to generic metadata when agent is missing', async () => {
    agentsMaybeSingleMock.mockResolvedValue({ data: null })

    const metadata = await generateMetadata({ params: { locale: 'en', agentPath: 'unknown' } })

    const tMetadata = createTranslator('en', 'chat.metadata')
    expect(metadata.title).toBe(tMetadata('title'))
  })

  it('handles supabase errors gracefully', async () => {
    agentsMaybeSingleMock.mockRejectedValue(new Error('boom'))

    const metadata = await generateMetadata({ params: { locale: 'en', agentPath: 'error' } })

    const tMetadata = createTranslator('en', 'chat.metadata')
    expect(metadata.title).toBe(tMetadata('title'))
  })
})
