#!/usr/bin/env bash
# Deploy the latest main to the VPS: the site (Next.js, PM2 "maple-studios-web")
# and the growth-platform API (backend/, PM2 "maple-studios-api").
# Safe to re-run. Nothing live is restarted unless its build succeeded.
# Installed on the server as ~/deploy-maplestudios.sh; this file is the source.
set -euo pipefail

APP=/home/deploy/maplestudios-site
cd "$APP"
export NEXT_TELEMETRY_DISABLED=1

echo "==> current: $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo DETACHED)"
LOCK_BEFORE=$(md5sum package-lock.json | cut -d' ' -f1)
API_LOCK_BEFORE=$(md5sum backend/package-lock.json | cut -d' ' -f1)

git checkout main -q
git pull --ff-only origin main -q
echo "==> target:  $(git rev-parse --short HEAD)  $(git log -1 --format=%s)"

# ---------- API ----------
if [ -f backend/.env ]; then
  if grep -q CHANGE_ME backend/.env; then
    echo "!! backend/.env still has CHANGE_ME values — API not started (fill them, then re-run)"
    API_READY=0
  else
    pushd backend > /dev/null
    if [ "$API_LOCK_BEFORE" != "$(md5sum package-lock.json | cut -d' ' -f1)" ] || [ ! -d node_modules ]; then
      echo "==> api: installing deps"; npm ci --no-audit --no-fund
    fi
    echo "==> api: building"
    if ! npm run build > ../api-build.log 2>&1; then
      echo "!! API BUILD FAILED — API untouched"; tail -30 ../api-build.log; exit 1
    fi
    # indexes + owner account; idempotent (seed.ts leaves existing records alone)
    echo "==> api: seeding indexes/owner"
    npm run seed > ../api-seed.log 2>&1 || { echo "!! seed failed (is Mongo up?)"; tail -15 ../api-seed.log; exit 1; }
    pm2 startOrRestart pm2.config.cjs --update-env > /dev/null
    popd > /dev/null
    sleep 5
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:4006/readyz || true)
    echo "    api /readyz  $code"
    [ "$code" = "200" ] || { echo "!! API not ready — check: pm2 logs maple-studios-api"; exit 1; }
    API_READY=1
  fi
else
  echo "!! backend/.env missing — API skipped (copy backend/.env.example)"
  API_READY=0
fi

# ---------- site ----------
if [ -d .next ]; then rm -rf .next.prev; cp -r .next .next.prev; echo "==> site: backed up running build -> .next.prev"; fi
if [ "$LOCK_BEFORE" != "$(md5sum package-lock.json | cut -d' ' -f1)" ]; then
  echo "==> site: lockfile changed — npm ci"; npm ci --no-audit --no-fund
else
  echo "==> site: deps unchanged — skipping npm ci"
fi
echo "==> site: building (still serving the old build)"
if ! npm run build > build.log 2>&1; then
  echo "!! SITE BUILD FAILED — site untouched, still serving the previous build"; tail -30 build.log; exit 1
fi
pm2 restart maple-studios-web --update-env > /dev/null
sleep 6

FAIL=0
for p in / /work /services /about /contact; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://127.0.0.1:3006$p")
  printf "    %-12s %s\n" "$p" "$code"; [ "$code" = "200" ] || FAIL=1
done
[ "$FAIL" = "0" ] || { echo "!! HEALTH CHECK FAILED — roll back with: bash ~/rollback-maplestudios.sh"; exit 1; }

echo "==> LIVE: $(git rev-parse --short HEAD) — https://maplestudios.co.in  (api: $([ "$API_READY" = 1 ] && echo up || echo 'not started'))"
