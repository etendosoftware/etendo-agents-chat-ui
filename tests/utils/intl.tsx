import React from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import enMessages from '@/messages/en'
import esMessages from '@/messages/es'

const LOCALE_MESSAGES = {
  en: enMessages,
  es: esMessages,
} as const

export type SupportedLocale = keyof typeof LOCALE_MESSAGES

const PLACEHOLDER_REGEX = /\{(\w+)\}/g

function getNestedMessage(source: any, path: string): any {
  return path.split('.').reduce((acc: any, segment: string) => {
    if (acc == null) return undefined
    return acc[segment]
  }, source)
}

function formatMessage(template: string, values?: Record<string, unknown>) {
  if (!values) return template
  return template.replace(PLACEHOLDER_REGEX, (_, token: string) => {
    const replacement = values[token]
    return replacement !== undefined ? String(replacement) : `{${token}}`
  })
}

export function getMessages(locale: SupportedLocale = 'en') {
  return LOCALE_MESSAGES[locale]
}

export function renderWithIntl(
  ui: React.ReactElement,
  { locale = 'en', messages }: { locale?: SupportedLocale; messages?: Record<string, any> } = {},
  options?: RenderOptions
) {
  const resolvedMessages = messages ?? getMessages(locale)

  return render(
    <NextIntlClientProvider locale={locale} messages={resolvedMessages}>
      {ui}
    </NextIntlClientProvider>,
    options
  )
}

export function createTranslator(locale: SupportedLocale = 'en', namespace?: string) {
  const localeMessages = getMessages(locale)
  const base = namespace ? getNestedMessage(localeMessages, namespace) ?? {} : localeMessages

  return (key: string, values?: Record<string, any>) => {
    const message = getNestedMessage(base, key)
    if (typeof message === 'string') {
      return formatMessage(message, values)
    }
    return namespace ? `${namespace}.${key}` : key
  }
}
