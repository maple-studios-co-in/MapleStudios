# Growth platform

Leads, email campaigns, templates, social scheduling and LinkedIn outreach
for Maple Studios, built into the `backend/` API and surfaced in the site's
`/admin` console under **Growth**.

| Piece | Where | Runs as |
|---|---|---|
| API | `backend/` — Express 5, Mongoose, zod | PM2 `maple-studios-api`, `127.0.0.1:4006` |
| Database | MongoDB 8 on the VPS ([mongo-on-vps.md](./mongo-on-vps.md)) | `mongod`, localhost, auth on |
| Console | `src/components/pages/admin/growth/` | part of the site, PM2 `maple-studios-web` |
| Proxy | `next.config.ts` rewrites `/api/v2/*`, `/api/connect/*`, `/unsubscribe/*`, `/webhooks/resend` to the API | — |

The contract between console and API is [phase-1-spec.md](./phase-1-spec.md).

## How things move

- **Leads** come in by CSV import (`/admin/leads` → Import), by hand, or later
  from the contact form. Segments are saved filters.
- **Campaigns** take a template and an audience, enrol leads, and send on a
  schedule inside a daily cap and a send window (IST). Every message carries
  a one-click unsubscribe; bounces and complaints arrive on the Resend
  webhook and suppress the address for good. With `RESEND_API_KEY=placeholder`
  every send is a **dry run** — logged, marked, nothing leaves the server.
- **Social** posts are drafted, scheduled by date, and published by the API
  when due to whichever accounts are connected ([social-apps-setup.md](./social-apps-setup.md)).
- **Outreach** tracks LinkedIn conversations the operator has by hand.
- One in-process **scheduler** (every 60 s) runs the campaign and social
  ticks; it is off under test and assumes a single API instance.

## Auth

The console still signs in with its single key; the API accepts that same
key as `x-admin-key` (`LEGACY_ADMIN_KEY`) during Phase 1. The API also has
real accounts (`aditya@maplestudios.co.in`, created by `npm run seed` from
`SEED_ADMIN_*`); Phase 2 moves the console sign-in onto them.

## Running locally

```bash
cd backend && cp .env.example .env   # set JWT_SECRET, APP_ENCRYPTION_KEY, MONGODB_URI
npm install && npm run seed && npm run dev        # API on :4000
cd .. && GROWTH_API_ORIGIN=http://127.0.0.1:4000 npm run dev   # site on :3006
```

Tests: `cd backend && npm test` (in-memory Mongo; no database needed).

## Deploying

`scripts/deploy.sh` is installed on the server as `~/deploy-maplestudios.sh`.
It builds and restarts the API first (skipping it with a warning while
`backend/.env` still has `CHANGE_ME` values), then the site.
