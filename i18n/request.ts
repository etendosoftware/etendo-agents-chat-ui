import { cookies, headers } from 'next/headers'
import { defaultLocale, getMessages, locales, type Locale } from './config'

function normalizeLocale(value: string | undefined | null): Locale {
  if (!value) {
    return defaultLocale
  }

  const normalized = value.split('-')[0]?.toLowerCase()
  const match = locales.find(locale => locale === normalized)

  return match ?? defaultLocale
}

export async function getRequestLocale(): Promise<Locale> {
  const localeFromCookie = cookies().get('NEXT_LOCALE')?.value
  if (localeFromCookie) {
    return normalizeLocale(localeFromCookie)
  }

  const acceptLanguage = headers().get('accept-language')
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(',')[0]
    return normalizeLocale(preferred)
  }

  return defaultLocale
}

export default async function getRequestConfig() {
  const locale = await getRequestLocale()

  return {
    locale,
    messages: await getMessages(locale),
  }
}
