# Maple Studios API

TypeScript - Express 5 - MongoDB. Serves the contact form, call booking and
admin dashboard for the marketing site.

## Run it

    cp .env.example .env      # then set JWT_SECRET and SEED_ADMIN_PASSWORD
    npm install
    docker compose up -d mongo
    npm run seed              # indexes + admin user + 14 days of slots
    npm run dev               # http://localhost:4000

Bring across data from the old JSON store (optional, idempotent):

    npm run migrate:json

## Checks

    npm run typecheck
    npm run lint
    npm test

## Notes

- `GET /readyz` returns 503 until Mongo connects - point your load balancer at it.
- Index changes ship via `npm run seed` (`autoIndex` is off in production).
- `LEGACY_ADMIN_KEY` keeps the site's old `x-admin-key` header working during
  the cutover. Unset it once the dashboard logs in properly.
