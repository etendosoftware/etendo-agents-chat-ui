# Etendo Chat Interface

Next.js application for Etendo support and customer chat. It authenticates users with Supabase, stores conversation history in MongoDB, proxies messages to n8n workflows, and can route selected agents through Chatwoot.

## What this project does

- Provides email/password and Google OAuth authentication.
- Classifies authenticated users with Jira-based memberships.
- Enforces per-agent access control for `public`, `non_client`, `partner`, `customer`, and `admin` experiences.
- Renders a chat UI with attachments, audio messages, link previews, conversation history, and feedback.
- Sends messages either to n8n workflows or to Chatwoot inboxes, depending on agent configuration.

## Stack

- `Next.js 14` with App Router
- `Supabase` for auth and application tables
- `MongoDB` for conversation persistence
- `n8n` for automation and AI workflows
- `Chatwoot` for inbox-based conversations
- `next-intl` for `en` and `es`
- `Vitest` for tests

## High-level architecture

- `app/` contains the localized UI, auth flows, authenticated pages, and API routes.
- `components/` contains the chat UI, admin UI, and shared interface components.
- `lib/` contains access control, auth helpers, MongoDB access, Supabase helpers, and server actions.
- `workflow/` contains exported n8n workflows used by the app.
- `supabase/migrations/` contains SQL migrations for the application schema.

## Main flows

### Authentication

- Email/password login is handled with Supabase client auth.
- Google OAuth is completed in `app/[locale]/auth/callback/route.ts`.
- After sign up or OAuth login, the app calls `JIRA_WEBHOOK_URL` to resolve Jira memberships.

### Jira membership resolution

The Jira webhook is expected to return:

```json
{
  "isJiraUser": true,
  "isESD": true,
  "isCSP": false
}
```

The app maps that response to profile memberships:

- `isESD -> is_partner`
- `isCSP -> is_customer`
- `role` is kept for backward compatibility and admin handling

This allows one user to belong to both Service Desks at the same time.

### Chat delivery

- `app/api/webhook/route.ts` is the main entry point used by the chat UI.
- Standard agents forward requests to the configured n8n webhook.
- Agents with `chatwoot_inbox_identifier` are routed through Chatwoot instead.
- Chatwoot live updates are streamed from `app/api/chatwoot/stream/route.ts` with Server-Sent Events.

## Access model

### Profile access state

`profiles` now supports both legacy role information and explicit Jira memberships:

- `role`
- `is_partner`
- `is_customer`

The effective access state is built in `lib/auth/access-state.ts`.

### Agent access levels

Each record in `agents.access_level` must be one of:

- `public`: guest-only access
- `non_client`: authenticated users without Jira memberships
- `partner`: users with `is_partner = true`
- `customer`: users with `is_customer = true`
- `admin`: admins only

Access rules are enforced in `lib/agents/access.ts`.

### Important behavior

- `admin` bypasses all agent restrictions.
- `partner + customer` users can access both partner and customer agents.
- `non_client` means authenticated but not matched to ESD or CSP.
- `public` agents are for unauthenticated visitors only.

## Data model

### Supabase tables

Minimum expected tables:

- `profiles`
  - `id uuid`
  - `role text`
  - `is_partner boolean`
  - `is_customer boolean`
- `agents`
  - `id uuid`
  - `name text`
  - `description text`
  - `webhookurl text`
  - `path text`
  - `color text`
  - `icon text`
  - `access_level text`
  - `requires_email boolean`
  - `chatwoot_inbox_identifier text`
- `agent_translations`
  - localized `name` and `description`
- `agent_prompts`
  - localized initial prompts per agent
- `feedback`
  - message feedback submitted from the chat UI

### MongoDB

The app stores conversation history in the `conversations` collection.

Typical fields include:

- `sessionId`
- `agentId`
- `email`
- `conversationTitle`
- `messages`
- `createdAt`
- `updatedAt`
- optional Chatwoot metadata such as `chatwootConversationId`

## Included n8n workflows

- `workflow/check-jira-user-webhook.json`
  - receives an email
  - checks Jira user existence and Service Desk memberships
  - returns `isJiraUser`, `isESD`, `isCSP`
- `workflow/support-agent.json`
  - support-oriented workflow used by the app for technical assistance

## API routes

- `app/api/webhook/route.ts`
  - main chat entry point
  - forwards requests to n8n or Chatwoot
- `app/api/chatwoot/stream/route.ts`
  - SSE polling bridge for Chatwoot conversations
- `app/api/chatwoot/webhook/route.ts`
  - validates Chatwoot webhook signatures
- `app/api/chatwoot/messages/route.ts`
  - Chatwoot message retrieval endpoint used by the UI
- `app/api/link-preview/route.ts`
  - safe HTML metadata extraction for link previews
- `app/api/email/validate/route.ts`
  - proxies email validation to an external provider

## Environment variables

Create `.env.local` with the values required by your environment.

### Required for the app

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
MONGODB_URI=
JIRA_WEBHOOK_URL=
```

### Optional but commonly needed

```bash
MONGODB_DB_NAME=
CHATWOOT_BASE_URL=
CHATWOOT_ACCOUNT_ID=
CHATWOOT_API_TOKEN=
CHATWOOT_WEBHOOK_TOKEN=
CHATWOOT_MESSAGE_POLL_INTERVAL_MS=
CHATWOOT_LABEL_POLL_INTERVAL_MS=
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_SITE_URL=
```

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Configure `.env.local`.

3. Prepare Supabase:
   - create the expected tables
   - ensure at least one `admin` profile exists
   - apply migrations from `supabase/migrations/`

4. Import and configure the n8n workflows you need.

5. Run the app.

```bash
npm run dev
```

6. Open `http://localhost:3000`.

## Database migration notes

The repository includes `supabase/migrations/20260306120000_add_profile_memberships.sql`.

That migration is additive:

- adds `is_partner`
- adds `is_customer`
- backfills `is_partner` for existing `partner` users

It does not rename or drop `profiles.role`.

## Admin usage

Admins can manage agents from `/[locale]/admin`.

For each agent, the admin UI supports:

- base metadata
- translated name and description
- localized initial prompts
- access level selection
- optional Chatwoot inbox identifier
- `requires_email` gating before chat starts

## Development commands

```bash
npm run dev
npm run build
npm start
npm test
npm run db:create-indexes
```

## Testing

- Unit and integration tests run with `Vitest`.
- The most relevant access and auth flows are covered under `tests/`.
- If you run full TypeScript checks, note that the repository may contain unrelated pre-existing type issues outside the core chat/auth flow.

## Operational notes

- Middleware only handles locale routing; auth and ACL checks are done in the pages and server logic.
- Public agents are intentionally hidden from authenticated users.
- Chatwoot support requires valid Chatwoot credentials and inbox identifiers stored on agents.
- Link previews are restricted to safe external HTTP/HTTPS targets and reject localhost/private addresses.

## Recommended deployment checklist

- Supabase auth configured for your site URL and OAuth callbacks
- MongoDB reachable from the deployment environment
- `JIRA_WEBHOOK_URL` pointing to the active n8n Jira membership workflow
- Chatwoot variables configured if any agent uses Chatwoot
- n8n workflows published and reachable from the app
