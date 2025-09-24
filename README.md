# Etendo Agents – n8n Chat Interface

An application that authenticates users with Supabase, proxies chat traffic to n8n workflows, and keeps long-lived conversation history in MongoDB. It includes an admin console for managing chat agents, dynamic
access control per agent, and a rich chat surface supporting files, audio notes, link previews, and feedback collection.

## Feature Highlights
- Email/password and Google OAuth sign-in with Supabase, including Jira-based partner verification and session refresh in middleware.
- Role-aware navigation (admin, partner, non_client/guest) with protected routes, agent-level access tiers, and an admin-only management panel.
- Responsive chat workspace with conversation history, streaming responses from n8n, attachments, audio recording, video-analysis flagging, and feedback prompts.
- Agent catalog sourced from Supabase with inline create/update/delete, icon/color configuration, and webhook endpoints per agent.
- MongoDB-backed conversation archive with rename/delete/search/pagination and per-user isolation.
- Ancillary APIs for link previews and webhook proxying that forward uploaded files and audio to n8n.

## Architecture Overview
- **Next.js App Router** (`app/`) renders public auth flows and authenticated layouts; middleware guards the home dashboard.
- **Supabase** handles authentication, session cookies, and tables (`profiles`, `agents`, `feedback`) accessed through `@/lib/supabase`.
- **MongoDB** stores conversations in the `conversations` collection (documents contain `messages`, `sessionId`, `agentId`, timestamps, etc.).
- **n8n** receives chat payloads via `/api/webhook`, streams newline-delimited JSON chunks, and returns agent replies.
- **UI Layer** is built with Tailwind CSS 4, shadcn/ui components, and custom gradients in `globals.css`.


app/
├─ auth/                Public auth flows (register with Jira check, login redirect by role)
├─ (authenticated)/     Logged-in shell (global header, dashboard, chat, admin)
│  ├─ page.tsx          Home listing of partner/admin agents
│  ├─ chat/[agent]/     Chat workspace with conversation history & ACL check
│  └─ admin/            Admin panel gating and agent management
├─ api/                 Edge/server routes (webhook proxy, link preview)
├─ layout.tsx           Root metadata and font setup
└─ middleware.ts        Session refresh + lightweight route protection
components/
├─ chat-interface.tsx   Client chat surface (stream handling, attachments, audio, video flag)
├─ chat-layout.tsx      Layout that injects sidebar history for signed users
├─ conversation-history-content(-logic).tsx
│                       Search/pagination/rename/delete tied to server actions
├─ global-header.tsx    Role-aware nav + mobile sheet, hides login for guest agents
└─ ui/                  shadcn component library
lib/
├─ actions/             Server actions for conversations, titles, feedback
├─ mongodb.ts           Cached MongoDB connector
└─ supabase/            Browser and server Supabase clients


## Roles & Access Control

| Role        | How assigned                                                               | Home (`/`) | Chat (`/chat/[agent]`)                                  | Admin (`/admin`) |
|-------------|-----------------------------------------------------------------------------|------------|---------------------------------------------------------|------------------|
| `admin`     | Manually set in `profiles` or promoted in Supabase                         | ✅         | ✅ all agents                                           | ✅               |
| `partner`   | Jira webhook returns `isJiraUser: true` during sign up / OAuth              | ✅         | ✅ agents marked `partner`                              | ⛔               |
| `non_client`| Default for regular sign ups (no Jira match)                                | ✅         | ✅ agents marked `non_client`                           | ⛔               |
| Guest       | Unauthenticated visitor                                                     | ⛔ (redirected to login) | ✅ only agents marked `public` (guests only)             | ⛔               |

Additional notes:
- `/` is guarded by middleware and returns only partner/admin agents (public agents are intentionally hidden from authenticated users).
- `/chat/[agent]` revalidates the agent record and enforces the agent-level `access_level` (`public`, `non_client`, `partner`, `admin`) before rendering.
- `/admin` redirects non-admins back to `/`.

## Data Model Expectations

### Supabase Tables
- `profiles`: `{ id (UUID, matches auth.user.id), role text }`
- `agents`: `{ id uuid, name, description, webhookurl, path, color, icon, access_level }`
- `feedback`: `{ id, message_id, conversation_id, agent_id, rating, feedback_text, user_id }`

> Ensure row-level security policies allow the application to read/write rows owned by the current user (and full access for admin users where required).

### MongoDB (`conversations` collection)
Each document resembles:
```json
{
  "_id": ObjectId,
  "sessionId": "uuid-or-random",
  "agentId": "supabase_agent_id",
  "email": "user@example.com",
  "conversationTitle": "First prompt…",
  "messages": [{ "type": "human"|"ai", "data": { "content": "..." } }],
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

Queries always include email to enforce per-user isolation.

## Integrating n8n

- Each agent’s webhookurl should point to the base n8n endpoint that will receive chat payloads.
- The proxy (/api/webhook) forwards FormData fields:

  | Field         | Description                                                |
  |---------------|------------------------------------------------------------|
  | message     | Trimmed user text or placeholder ([Audio message], etc.) |
  | agentId     | Supabase agent UUID                                        |
  | sessionId   | Stable ID (userId + timestamp or stored conversation)      |
  | conversationId | Current Mongo _id, when available                      |
  | userEmail   | Authenticated user email (optional for guests)             |
  | videoAnalysis | "true" when a video upload should trigger extra logic  |
  | file_*      | Any uploaded files                                         |
  | audio       | Recorded audio clip (audio/webm)                         |
- n8n should respond with a streaming body where each line is JSON; chat-interface looks for objects like:

  {"type":"item","content":"partial response text"}

  and may emit an early line containing { "conversationId": "<mongo-id>" } to update the URL.

## Environment Configuration

Create .env.local with:

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=chat_history         # optional override
JIRA_WEBHOOK_URL=https://...         # POST endpoint returning { isJiraUser: boolean }

If you run locally, also provide NEXT_PUBLIC_SITE_URL to n8n if needed (not referenced in code).

## Getting Started

1. Install dependencies

    npm install            # or pnpm install / yarn
2. Configure environment
    - Populate .env.local with the variables above.
    - Seed Supabase with at least one admin profile and a starter agent.
3. Run development server

    npm run dev
    Visit http://localhost:3000.
4. Production build

    npm run build
    npm start

## Admin Workflow

- Navigate to /admin as an admin user.
- Use “New Agent” to create entries; required fields are name, description, webhook URL (base), path (leading /), icon emoji, color class, and access level.
- Existing agents can be edited or deleted; operations call Supabase directly and toast success/error feedback.

## Chat Experience

- Sidebar lists 10 most recent conversations (with infinite scroll, search, rename, delete) via server actions (fetchConversations, updateConversationTitle, deleteConversation).
- Chat composer supports:
    - Enter to send, Shift/Ctrl+Enter for new line.
    - File uploads (up to 10 MB each), audio recording (webm), and optional video analysis flag.
    - Markdown rendering, link previews via /api/link-preview, YouTube embeds, attachment download buttons, and rating/feedback submission.
- Session IDs persist per conversation; guests get a generated UUID, authenticated users load existing history.

## Authentication Flow

- Register: uses signUpWithJiraCheck server action; Jira webhook determines initial role (partner vs non_client).
- Login: fetches profiles.role to route admins to /admin, others to /.
- Google OAuth: handled under /auth/callback, including Jira role detection and skip if existing admin.
- Sign-out: /auth/signout clears Supabase session tokens.

## Deployment Notes

- Audio recording requires HTTPS in browsers.
- Supabase server client relies on cookies; middleware refreshes sessions so pages stay up to date.
- MongoDB connection is cached; adjust maxPoolSize in lib/mongodb.ts for high throughput.
- Consider enabling Vercel edge runtime for streaming routes if deploying there (current webhook route runs on Node runtime).

## Troubleshooting

- Agents not visible: ensure access_level matches the user role; home page excludes public agents by design.
- “Access Denied” in chat: confirm agent path (prefixed with /) and role assignment in profiles.
- Link preview errors: only HTML content is parsed; non-HTML responses return a fallback. Network restrictions may block outbound fetches locally.
- Streaming stalls: verify n8n returns newline-delimited JSON and does not buffer entire response.
