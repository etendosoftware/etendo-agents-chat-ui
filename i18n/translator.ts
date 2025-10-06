import { createTranslator, type Translate } from 'next-intl'
import { getMessages } from './config'
import type { Locale } from './config'

export async function getTranslator(locale: Locale, namespace?: string): Promise<Translate> {
  const messages = await getMessages(locale)

  const translator = createTranslator({
    locale,
    messages,
    namespace,
  })

  return translator
}
