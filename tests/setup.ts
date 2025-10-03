import '@testing-library/jest-dom/vitest'
import React from 'react'

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/test'
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'

// Expose React globally for components compiled in Next.js style
// (avoids "React is not defined" when running in jsdom environment)
// This mirrors what Next does via automatic runtime.
;(globalThis as any).React = React

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function scrollIntoViewMock() {
    // no-op polyfill for tests
  }
}
