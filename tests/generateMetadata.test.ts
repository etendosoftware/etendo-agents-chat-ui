import { generateMetadata } from '../app/[locale]/(authenticated)/chat/[agentPath]/[[...conversationId]]/page'
import { vi } from 'vitest'
import { createTranslator } from './utils/intl'

const maybeSingleMock = vi.hoisted(() => vi.fn())
const eqMock = vi.hoisted(() => vi.fn(() => ({ maybeSingle: maybeSingleMock })))
const selectMock = vi.hoisted(() => vi.fn(() => ({ eq: eqMock })))
const fromMock = vi.hoisted(() => vi.fn(() => ({ select: selectMock })))

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

    const metadata = await generateMetadata({ params: { locale: 'en', agentPath: 'support' } })

    const tMetadata = createTranslator('en', 'chat.metadata')

    expect(metadata.title).toBe(tMetadata('agentTitle', { agentName: 'Support Agent' }))
    expect(metadata.description).toBe('Assists with tickets')
    expect(metadata.openGraph?.title).toBe(tMetadata('agentTitle', { agentName: 'Support Agent' }))
    expect(metadata.openGraph?.description).toBe('Assists with tickets')
  })

  it('falls back to generic metadata when agent is missing', async () => {
    maybeSingleMock.mockResolvedValue({ data: null })

    const metadata = await generateMetadata({ params: { locale: 'en', agentPath: 'unknown' } })

    const tMetadata = createTranslator('en', 'chat.metadata')
    expect(metadata.title).toBe(tMetadata('title'))
  })

  it('handles supabase errors gracefully', async () => {
    maybeSingleMock.mockRejectedValue(new Error('boom'))

    const metadata = await generateMetadata({ params: { locale: 'en', agentPath: 'error' } })

    const tMetadata = createTranslator('en', 'chat.metadata')
    expect(metadata.title).toBe(tMetadata('title'))
  })
})
