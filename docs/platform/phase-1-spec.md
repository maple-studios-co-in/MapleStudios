# Growth platform — Phase 1 contract

The console grows five modules — leads, templates, campaigns, social, outreach —
built in `backend/` (Express 5 + Mongoose + zod) and surfaced in the existing
Next.js console. This file is the contract the backend and console are built
against in parallel. If the code and this file disagree, fix the code.

## Ground rules

- **Zero new runtime dependencies.** HTTP via Node's `fetch`, crypto via
  `node:crypto`, CSV parsing hand-rolled (`lib/csvParse.ts`), multipart avoided
  (CSV uploads arrive as `text/csv` request bodies).
- **Match the existing modules exactly**: `x.model.ts` (interface + schema +
  `xWire()` + model reuse guard), `x.schema.ts` (zod), `x.service.ts` (never
  imports express), `x.routes.ts` (public + admin routers; admin routers call
  `requireAdmin` themselves). Errors via `AppError`. Validation via
  `validate({body,query,params})` and the typed accessors.
- **Wire shapes**: ids are strings, dates are ISO strings. Lists return
  `{ items, meta: { total, page, limit, pages } }`, single records `{ item }`,
  bare mutations `{ ok: true }`. Errors come from the shared handler:
  `{ error, code, details?, requestId }`.
- **Auth**: every admin route is behind `requireAdmin`. Phase 1 console calls
  use the `x-admin-key` bridge (`LEGACY_ADMIN_KEY` = the console's key).
  Accounts exist for Phase 2's console sign-in.
- **Tests**: vitest + supertest + mongodb-memory-server, one `*.test.ts` per
  module under `src/__tests__/`, covering the happy path, validation, auth
  (401 without key) and the one invariant that matters most per module.
- **Scheduler**: never runs in tests. Modules expose `tick()` functions that
  tests call directly; `lib/scheduler.ts` only wires them to a timer.
- **Nothing is sent or published without configuration.** Missing provider
  keys mean dry-run (mail) or 503 `NOT_CONFIGURED` (social connect), never a
  crash and never a silent no-op the operator can't see.

## URLs

| From the browser | Proxied to (next.config rewrites) |
|---|---|
| `/api/v2/*` | `http://127.0.0.1:4006/api/v1/*` |
| `/api/connect/:platform/callback` | `/api/v1/connect/:platform/callback` |
| `/unsubscribe/:token` | `/api/v1/unsubscribe/:token` |
| `/webhooks/resend` | `/api/v1/webhooks/resend` |

`PUBLIC_BASE_URL` (`https://maplestudios.co.in`) is what the backend puts in
links and OAuth redirect URIs.

## Environment (backend/.env)

```
PUBLIC_BASE_URL=https://maplestudios.co.in
APP_ENCRYPTION_KEY=<64 hex chars>          # AES-256-GCM for OAuth tokens
SCHEDULER_ENABLED=true                     # false in tests, automatically
MAIL_FROM_NAME=Maple Studios
MAIL_FROM_EMAIL=hello@<sending-domain>
RESEND_API_KEY=placeholder                 # dry-run until a real re_… key
RESEND_WEBHOOK_SECRET=                     # webhook returns 503 until set
X_CLIENT_ID= / X_CLIENT_SECRET=
META_APP_ID= / META_APP_SECRET=
LINKEDIN_CLIENT_ID= / LINKEDIN_CLIENT_SECRET=
```

All optional except `PUBLIC_BASE_URL` and `APP_ENCRYPTION_KEY` (tests get
fixed defaults). See `config/env.ts`.

---

## 1. Leads (`modules/leads`)

### Lead

```
id, firstName, lastName, email?, phone?, company?, role?, website?, industry?,
city?, segment?, tags: string[], source?, stage, owner?, nextAction?: { at, note },
lastContactedAt?, unsubscribedAt?, suppressed: boolean, custom: Record<string,string>,
notes: [{ at, by, text }], activities: [{ at, type, summary, ref? }],
importBatchId?, createdAt, updatedAt
```

- `stage`: `new | contacted | replied | qualified | meeting | proposal | won | lost | unsubscribed`
- `activities[].type`: `import | note | stage | email_queued | email_sent | email_bounced | email_complained | unsubscribed | outreach`
- `email` lowercased, unique **sparse**; `phone` E.164, unique sparse. At least one of email/phone is required.
- Phone normalisation (`lib/phone.ts`, default country +91): strip spaces/dashes/parens; `+` prefix kept; `0XXXXXXXXXX` → `+91XXXXXXXXXX`; 10 digits → `+91…`; `91` + 10 digits → `+91…`; anything else 8–15 digits with `+` kept; else invalid.
- Indexes: `{email:1}` unique sparse, `{phone:1}` unique sparse, `{stage:1, updatedAt:-1}`, `{tags:1}`, `{owner:1}`, text on firstName/lastName/company/email.

### Segment (saved filter)

`id, name, filter: LeadFilter, createdAt, updatedAt` where
`LeadFilter = { stage?: Stage[], tags?: string[], segment?: string, owner?: string, industry?: string, city?: string, hasEmail?: boolean, hasPhone?: boolean, q?: string }`.
Filters are AND-ed; `tags` means "has any of".

### Routes (all under `/admin`, requireAdmin)

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /leads` | `LeadFilter` as query (`stage` and `tags` comma-separated) + `page,limit,sort(updatedAt\|createdAt\|company)` | `{ items, meta }` |
| `POST /leads` | Lead fields (no id/activities) | `201 { item }` |
| `GET /leads/:id` | | `{ item }` |
| `PATCH /leads/:id` | any editable fields; a `stage` change appends a `stage` activity | `{ item }` |
| `DELETE /leads/:id` | | `{ ok }` |
| `POST /leads/:id/notes` | `{ text }` | `{ item }` |
| `POST /leads/bulk` | `{ ids: string[], set?: { stage?, owner? }, addTags?: string[], removeTags?: string[] }` | `{ ok, updated: n }` |
| `GET /leads.csv` | `LeadFilter` as query | CSV (`toCsv`) |
| `POST /leads/import/preview` | body `text/csv` (≤ 10 MB) | `{ columns: string[], sample: string[][] (≤5 rows), rows: n, mapping: Record<col, leadField\|"custom:<name>"\|"ignore"> }` — mapping is the server's best guess from header names |
| `POST /leads/import` | body `text/csv`; query `mapping=<json>`, `dedupe=skip\|update` (default `skip`), `tags=a,b`, `source=…` | `{ ok, batchId, imported, updated, skipped, invalid: [{ row, reason }] }` |
| `GET /segments` · `POST /segments` · `PATCH /segments/:id` · `DELETE /segments/:id` | `{ name, filter }` | `{ items }` / `{ item }` / `{ ok }` |
| `GET /segments/:id/count` | | `{ count }` |

Import dedupes on email first, then phone. `skip` leaves existing leads
untouched; `update` fills **empty** fields only (never overwrites data the
operator has edited). Every imported/updated lead gets an `import` activity
and the `importBatchId`. Invalid rows (no email and no phone, bad email, bad
phone) are reported, never silently dropped. The service must expose
`findLeadsForAudience(filter | leadIds)` for campaigns.

---

## 2. Templates (`modules/templates`)

### EmailTemplate

```
id, name, channel: "email" | "linkedin", category: "cold" | "followup" | "nurture" | "other",
subject?, preheader?, html?, text, mergeFields: string[] (derived on save),
createdAt, updatedAt
```

- `channel: email` requires `subject` and `html` (text is auto-derived from
  html if empty); `channel: linkedin` is plain text only (≤ 3000 chars).
- Merge syntax (`lib/merge.ts`): `{{field}}` and `{{field|fallback}}`. Context
  keys: every Lead field (`first_name`, `last_name`, `email`, `company`, `role`,
  `city`, `industry`, …, snake_case), `custom.*` flattened as `custom_<name>`,
  `sender_name`, `sender_email`, `unsubscribe_url`, `today`. Values are
  HTML-escaped when rendered into `html`, raw into `text`/`subject`. Missing
  field without fallback renders empty and is reported in `missing[]`.

### Routes (`/admin`)

| Method & path | Body | Returns |
|---|---|---|
| `GET /templates` (`?channel=`) | | `{ items, meta }` |
| `POST /templates` · `GET /templates/:id` · `PATCH /templates/:id` · `DELETE /templates/:id` | | `{ item }` / `{ ok }` |
| `POST /templates/:id/render` | `{ leadId? , sample?: Record<string,string> }` | `{ subject, html, text, missing: string[] }` |
| `POST /templates/:id/test-send` | `{ to, leadId? }` | `{ ok, dryRun: boolean, providerId? }` |

Deleting a template referenced by a non-completed campaign returns 409.

---

## 3. Campaigns (`modules/campaigns`)

### Campaign

```
id, name, status: "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled",
from: { name, email }, replyTo?,
audience: { segmentId? } | { leadIds: string[] } | { filter: LeadFilter },
steps: [{ templateId, delayDays: number (0 for the first), stopIfReplied: true }],
schedule: { startAt, dailyCap (default 30), window: { start: "09:30", end: "18:00" }, weekdaysOnly: true, timezone },
stats: { recipients, queued, sent, delivered, bounced, complained, unsubscribed, replied, failed },
startedAt?, completedAt?, createdAt, updatedAt
```

### CampaignMessage

```
id, campaignId, leadId, step, status: "queued" | "sending" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "skipped" | "cancelled",
scheduledFor, sentAt?, providerMessageId?, error?, unsubscribeToken
```

### Behaviour

- **Start** (`draft|scheduled → running`): resolve the audience, drop leads
  that are suppressed, unsubscribed, have no email, or are already in this
  campaign; create step-0 messages with `scheduledFor = max(startAt, now)`.
  Record `email_queued` on each lead. `stats.recipients` = count.
- **Tick** (`runCampaignTick(now)`): for each running campaign, in the send
  window (campaign timezone; skip weekends if `weekdaysOnly`), while today's
  sent count < `dailyCap`: take `queued` messages with `scheduledFor <= now`,
  oldest first; re-check suppression and lead stage at send time (`replied |
  won | lost | unsubscribed` → `skipped`); render the step's template; send
  via the mail provider with headers `List-Unsubscribe: <url>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; on success mark `sent`,
  bump stats, record `email_sent`, set `lead.lastContactedAt`, and if a next
  step exists create its message at `sentAt + delayDays` (same clock time,
  campaign timezone). Provider failure → `failed` with `error`, retried at
  most twice by re-queueing with +15 min. When no message is queued or
  sending, the campaign is `completed`.
- **Pause/resume/cancel**: pause stops the tick for that campaign; cancel
  marks all queued messages `cancelled`.
- **Unsubscribe** (`GET /unsubscribe/:token`, public): token is
  `base64url(messageId) + "." + hmac_sha256(APP_ENCRYPTION_KEY, messageId)`
  truncated to 32 hex chars. Valid token → lead `unsubscribedAt`, stage
  `unsubscribed`, a `Suppression`, cancel that lead's queued messages across
  all campaigns, respond with a small HTML page ("You're unsubscribed"). Also
  accept `POST` (one-click). Invalid token → 404 page, never an error that
  reveals anything.
- **Webhook** (`POST /webhooks/resend`): verify the Svix signature
  (`svix-id`, `svix-timestamp`, `svix-signature`, secret base64 after
  `whsec_`) with `node:crypto`; 503 `NOT_CONFIGURED` when the secret is unset.
  Handle `email.delivered | email.bounced | email.complained` by
  `providerMessageId`; bounce/complaint also create a `Suppression` and set
  the lead's `suppressed`. Unknown events → 200 ignored.
- **Mail provider** (`lib/mail/`): `MailProvider.send(msg) → { id }`.
  `ResendProvider` (POST `https://api.resend.com/emails`, bearer key).
  `DryRunProvider` when `RESEND_API_KEY` is missing or not `re_…`-shaped:
  logs the rendered message and returns `{ id: "dry-<uuid>" }`. Messages sent
  dry-run are marked `sent` with `providerMessageId` prefixed `dry-` so the
  operator can see the campaign would have gone out.

### Suppression

`id, email, reason: "unsubscribe" | "bounce" | "complaint" | "manual", note?, createdAt`; unique on email.

### Routes (`/admin`)

| Method & path | Body | Returns |
|---|---|---|
| `GET /campaigns` (`?status=`) | | `{ items, meta }` |
| `POST /campaigns` · `GET /campaigns/:id` · `PATCH /campaigns/:id` (draft/scheduled only) · `DELETE /campaigns/:id` (draft/cancelled/completed only) | | |
| `POST /campaigns/:id/start` · `/pause` · `/resume` · `/cancel` | | `{ item }` |
| `GET /campaigns/:id/preview` | `?limit=5` | `{ recipients: n, samples: [{ leadId, email, subject, html, text }] }` |
| `GET /campaigns/:id/messages` | `?status=&page=&limit=` | `{ items, meta }` (joined with lead email/name) |
| `GET /suppressions` · `POST /suppressions` `{ email, note? }` · `DELETE /suppressions/:id` | | |

---

## 4. Social (`modules/social`)

### SocialAccount

```
id, platform: "x" | "instagram" | "linkedin", externalId, handle, displayName,
avatarUrl?, scopes: string[], expiresAt?, status: "connected" | "expired" | "revoked",
meta: { pageId?, igUserId?, personUrn? }, connectedAt, updatedAt
```
Tokens are stored encrypted (`accessTokenEnc`, `refreshTokenEnc`, `lib/crypto.ts`
AES-256-GCM, `APP_ENCRYPTION_KEY`) and **never** appear on the wire.

### SocialPost

```
id, text, mediaUrls: string[] (absolute https), platforms: Platform[],
scheduledAt?, status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed",
results: [{ platform, status: "pending" | "published" | "failed", externalId?, url?, error?, publishedAt? }],
publishedAt?, createdAt, updatedAt
```

### Behaviour

- **Connect**: `GET /admin/social/connect/:platform` → `{ url }` (authorize
  URL; `state` is a signed random nonce stored for 10 min; X uses PKCE S256).
  503 `NOT_CONFIGURED` when that platform's client id/secret is unset. The
  public callback `GET /connect/:platform/callback?code&state` exchanges the
  code, resolves the account (X `GET /2/users/me`; LinkedIn `GET
  /v2/userinfo` → `urn:li:person:{sub}`; Meta: long-lived token → `GET
  /me/accounts` → first page with `instagram_business_account`, store page +
  IG ids), upserts the SocialAccount, and redirects to
  `/admin/social?connected=<platform>` (or `?error=<code>`).
- **Publish** (`runSocialTick(now)`): posts `scheduled` with `scheduledAt <=
  now` → `publishing`; for each platform with a connected account call its
  publisher; collect per-platform results; final status `published` (all ok),
  `partial`, or `failed`. `publish-now` runs the same path immediately.
- **Publishers** (`lib/social/<platform>.ts`), each `publish(account, post) →
  { externalId, url }`, with the API version in one constant:
  - X: `POST https://api.x.com/2/tweets { text }` (text only in Phase 1).
    Refresh with `grant_type=refresh_token` when `expiresAt` is near.
  - Instagram: requires ≥ 1 image URL (the API has no text-only post):
    `POST /{igUserId}/media { image_url, caption }` → `POST
    /{igUserId}/media_publish { creation_id }` on `graph.facebook.com`.
  - LinkedIn: `POST https://api.linkedin.com/rest/posts` with
    `LinkedIn-Version` header, `author: personUrn`, `commentary`,
    `visibility: "PUBLIC"`, `lifecycleState: "PUBLISHED"`; post id from the
    `x-restli-id` response header. Text only in Phase 1.
  - Publishers are called through an injectable registry so tests substitute
    fakes; no test performs network I/O.
- Token expiry → account `expired`; the post result says "reconnect".

### Routes (`/admin`)

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /social/accounts` · `DELETE /social/accounts/:id` | | `{ items }` / `{ ok }` |
| `GET /social/connect/:platform` | | `{ url }` or 503 |
| `GET /social/posts` | `?from=YYYY-MM-DD&to=YYYY-MM-DD&platform=&status=` | `{ items }` (calendar range, no paging; capped 500) |
| `POST /social/posts` · `GET /social/posts/:id` · `PATCH /social/posts/:id` (not while publishing/published) · `DELETE /social/posts/:id` | | |
| `POST /social/posts/:id/schedule` `{ scheduledAt }` · `/publish-now` · `/cancel` (→ draft) | | `{ item }` |

---

## 5. Outreach — LinkedIn, human-sent (`modules/outreach`)

No automation: LinkedIn offers no API for invitations or messages and bans
automating them. The platform tracks the pipeline and writes the message;
the operator sends it.

### OutreachTarget

```
id, leadId?, name, company?, role?, linkedinUrl,
stage: "identified" | "connection_sent" | "connected" | "messaged" | "replied" | "meeting" | "won" | "lost" | "not_interested",
templateId?, lastActionAt?, nextActionAt?, notes: [{ at, by, text }],
history: [{ at, stage, note? }], createdAt, updatedAt
```

### Routes (`/admin`)

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /outreach` | `?stage=&q=&due=true&page&limit` | `{ items, meta }` |
| `POST /outreach` (from a lead: `{ leadId, linkedinUrl }` or inline) · `GET /outreach/:id` · `PATCH /outreach/:id` · `DELETE /outreach/:id` | | |
| `POST /outreach/:id/advance` | `{ stage, note?, nextActionAt? }` | `{ item }` (appends history; sets `lastActionAt`; a `replied` stage also marks the linked lead `replied`) |
| `POST /outreach/:id/render` | `{ templateId }` (channel `linkedin`) | `{ text, missing }` |
| `GET /outreach/due` | | `{ items }` (nextActionAt ≤ now, oldest first) |

---

## 6. Console (Next.js)

- New nav group **Growth** in `AdminShell`: Leads, Campaigns, Templates,
  Social, Outreach → `/admin/leads`, `/admin/campaigns`, `/admin/templates`,
  `/admin/social`, `/admin/outreach` (thin `page.tsx` wrappers like the CMS).
- Data access: `src/components/pages/admin/growth/api.ts` — `useApi()` built
  on `useAdmin().key`, base `/api/v2`, header `x-admin-key`, `unwrap()` that
  throws `Error(body.error)` on non-2xx. Hooks `useList(path, params)`,
  `useItem(path)`, `mutate(method, path, body)`; CSV upload posts the file's
  text with `content-type: text/csv`.
- Reuse `cms/ui.tsx` (Btn, Card, Field, Input, Textarea, Select, Check, Modal,
  Confirm, Table/Tr/Td, Badge, Spinner, useToast, PageHead, downloadCsv) and
  `cms/MarkdownEditor` where it fits. Same look as the CMS screens.
- Screens:
  - **Leads**: filter bar (stage, tags, search, owner), table (name, company,
    email/phone, stage badge, owner, last contacted), row drawer (edit fields,
    stage select, notes, activity timeline, "Add to outreach"), bulk bar (set
    stage, add/remove tags, owner), **Import wizard** (paste or choose CSV →
    preview + column mapping → dedupe choice → result summary with invalid
    rows), Segments manager (save current filter; counts).
  - **Templates**: list by channel; editor with name/category/subject/
    preheader, HTML + text tabs, merge-field palette (click to insert), live
    preview using `render` with sample data, "Send test to…" (shows dry-run
    clearly).
  - **Campaigns**: list with status + stats; composer wizard (name & sender →
    audience: segment / filter / pick leads, live recipient count → steps:
    template + delay per step → schedule: start, daily cap, window, weekdays →
    review with 3 rendered samples); detail: stats tiles, controls
    (start/pause/resume/cancel), messages table with status filter.
    A banner states **"Dry-run mode — RESEND_API_KEY is a placeholder"** when
    test-send reports `dryRun: true`.
  - **Social**: accounts panel (connect buttons per platform; shows handle,
    expiry, reconnect; 503 → "Not configured — see docs/platform/social-apps-setup.md");
    month calendar (posts by day, platform dots, status colour) + week list;
    composer (text with per-platform character counts: X 280, LinkedIn 3000,
    IG 2200; media URLs — can pick from the Media library; platform
    toggles; schedule date-time in IST or publish now); post drawer with
    per-platform results and errors.
  - **Outreach**: kanban by stage (drag optional — buttons are fine), "Due
    today" list, target drawer (profile link, template picker → rendered
    message with Copy button, advance stage with note, next action date).
- Every write surfaces its error in a toast; buttons disable while in flight.

---

## 7. Deployment (handled by the integration PR)

- `backend/` runs as PM2 `maple-studios-api` on `127.0.0.1:4006`
  (`node dist/server.js`, cwd `backend/`, `.env` loaded by dotenv).
- Next rewrites as in the URL table. nginx unchanged.
- `scripts/deploy` builds the backend (`npm ci` only if its lockfile moved,
  `npm run build`), runs `npm run seed` (indexes + owner account, idempotent),
  restarts the API, then the site.
- Mongo 8 on the VPS: `docs/platform/mongo-on-vps.md`.
