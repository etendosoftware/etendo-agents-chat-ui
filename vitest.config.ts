import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    pool: 'forks',
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: 'reports/vitest/results.json',
      junit: 'reports/vitest/junit.xml',
    },
    coverage: {
      reporter: ['text', 'html'],
      exclude: [
        'tests/**',
        'coverage/**',
        'reports/**',
        '**/*.d.ts',
        'node_modules/**',
        '.next/**',
        'components/ui/**',
        'next.config.mjs',
        'postcss.config.mjs',
        'next-intl.config.ts',
        'scripts/**',
        'app/layout.tsx',
        'app/global-error.tsx',
        'app/[locale]/layout.tsx',
        'app/[locale]/auth/layout.tsx',
        'app/[locale]/(authenticated)/layout.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
