import {defineConfig} from 'next-intl/config'
import { locales, defaultLocale } from './i18n/config'

export default defineConfig({
  locales,
  defaultLocale,
})
