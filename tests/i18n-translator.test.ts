import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMessagesMock = vi.hoisted(() => vi.fn())
const createTranslatorMock = vi.hoisted(() => vi.fn())

vi.mock('../i18n/config', async () => {
  const actual = await vi.importActual<typeof import('../i18n/config')>('../i18n/config')
  return {
    ...actual,
    getMessages: getMessagesMock,
  }
})

vi.mock('next-intl', () => ({
  createTranslator: createTranslatorMock,
}))

describe('getTranslator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds translator with locale and namespace', async () => {
    const messages = { common: { hello: 'Hello' } }
    const translatorFn = vi.fn()
    getMessagesMock.mockResolvedValue(messages)
    createTranslatorMock.mockReturnValue(translatorFn)

    const { getTranslator } = await import('../i18n/translator')
    const result = await getTranslator('en', 'common')

    expect(getMessagesMock).toHaveBeenCalledWith('en')
    expect(createTranslatorMock).toHaveBeenCalledWith({
      locale: 'en',
      messages,
      namespace: 'common',
    })
    expect(result).toBe(translatorFn)
  })

  it('works without namespace', async () => {
    getMessagesMock.mockResolvedValue({})
    const translatorFn = vi.fn()
    createTranslatorMock.mockReturnValue(translatorFn)

    const { getTranslator } = await import('../i18n/translator')
    const result = await getTranslator('es')

    expect(createTranslatorMock).toHaveBeenCalledWith({
      locale: 'es',
      messages: {},
      namespace: undefined,
    })
    expect(result).toBe(translatorFn)
  })
})
