# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build (TypeScript/ESLint errors are intentionally ignored)
npm run lint         # Run ESLint
npm run test         # Run Vitest in watch mode
npm run test -- --run          # Run tests once (CI mode)
npm run test -- --run tests/path/to/file.test.ts  # Run a single test file
npm run db:create-indexes      # Create MongoDB indexes (run once on new DB)
```

> Always use `--legacy-peer-deps` when installing packages — there's a peer conflict between `@vitest/coverage-v8` and the vitest version.

## Architecture Overview

### Routing

Next.js 14 App Router with locale prefix via `next-intl`:

- `/[locale]/auth/*` — unauthenticated pages (login, register, OAuth callback)
- `/[locale]/(authenticated)/*` — auth-gated routes (middleware enforces this)
- `/[locale]/(authenticated)/chat/[agentPath]/[[...conversationId]]` — main chat page
- `/api/webhook` — entry point for all chat messages; routes to n8n or Chatwoot
- `/api/chatwoot/stream` — SSE endpoint for real-time Chatwoot message polling

### Data Flow

1. User submits a message in `chat-interface.tsx`
2. Server action in `lib/actions/chat.ts` posts to `/api/webhook`
3. Webhook determines whether to call the **n8n** webhook URL or the **Chatwoot** API based on `agentPath`
4. For Chatwoot agents, `chat-interface.tsx` polls `/api/chatwoot/stream` (SSE) to receive replies
5. Conversations are persisted in **MongoDB** (`conversations` collection); user/agent metadata lives in **Supabase**

### State & Data Fetching

- **React Query** (`@tanstack/react-query`) handles server state: conversations list, messages, link previews
- Query keys are defined in `lib/query-keys.ts` using a factory pattern
- Client-callable wrappers are in `lib/query-functions.ts`; actual server actions are in `lib/actions/`
- `lib/chat-context.tsx` — provides `conversationId` and `navigateToConversation`/`navigateToNewChat` via `pushState` (no full page reload)
- `lib/notification-context.tsx` — manages unread counts and browser notification permission

### Access Control

Access levels (lowest → highest): `public`, `non_client`, `partner`, `customer`, `admin`

- Supabase `profiles` table stores `role` and `is_partner`/`is_customer` flags
- `lib/auth/access-state.ts` — `buildProfileAccessState()` converts raw profile + Jira membership data into a `ProfileAccessState`
- `lib/agents/access.ts` — `canUserAccessAgent()` / `shouldListAgentOnHome()` gate agent visibility
- Admin users bypass all restrictions; public agents are hidden from authenticated users

### Key Conventions

- **Path alias:** `@/` maps to repo root (e.g., `@/lib/utils`, `@/components/ui/button`)
- **i18n:** All UI strings go through `next-intl`; translation files live in `messages/en/` and `messages/es/`
- **Security:** `rehype-sanitize` on all markdown output; `escapeRegExp` on MongoDB search terms; ObjectId validation before DB queries; SSRF check in `/api/link-preview`
- **Streaming messages:** `chat-interface.tsx` maintains `localMessages` state for in-flight/streamed content; React Query cache holds persisted messages

### Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MONGODB_URI=
MONGODB_DB_NAME=
JIRA_WEBHOOK_URL=          # Called on signup to resolve partner/customer membership
```

Optional:
```
CHATWOOT_BASE_URL=
CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=
NEXT_PUBLIC_GA_ID=         # Google Analytics
```

### Testing

- Tests live in `tests/` and mirror the source structure
- Setup file: `tests/setup.ts` (jest-dom matchers, browser API polyfills, `server-only` mock)
- Coverage excludes `components/ui/` (Shadcn generated components)
- Test reports output to `reports/vitest/`
