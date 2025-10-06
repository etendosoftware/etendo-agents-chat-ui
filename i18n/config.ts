import type { Messages } from 'next-intl'
import { notFound } from 'next/navigation'

import enMessages from '../messages/en'
import esMessages from '../messages/es'

export const locales = ['en', 'es'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

const dictionaries: Record<Locale, Messages> = {
  en: enMessages as Messages,
  es: esMessages as Messages,
}

export async function getMessages(locale: Locale): Promise<Messages> {
  const messages = dictionaries[locale]

  if (!messages) {
    notFound()
  }

  return messages
}
