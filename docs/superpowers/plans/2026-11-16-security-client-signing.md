# Security and Private Client Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy account hardening, encrypted company-Drive recovery, and private email-verified client signing with truthful readiness gates.
**Architecture:** Extend the existing Next.js BFF, Express API and standalone MongoDB. Separate account MFA/readiness, backup operations and signing envelopes; frozen signatures and PDFs use atomic envelope writes. Operator setup is separate from deployed feature availability.
**Tech Stack:** Node 22, TypeScript, Next 15, Express 5, MongoDB/Mongoose, maintained TOTP and PDF libraries, Python 3, age, rclone, existing Resend mail transport.
**Spec:** docs/superpowers/specs/2026-11-16-security-client-signing-design.md

## Global Constraints

- No paid subscription or enterprise plan is introduced. Existing email and Drive quotas still apply.
- Keep real company identities, agreements, recipients, recovery material and provider configuration outside this public repository.
- Daily backups at the existing 07:45 IST time; maximum 30 calendar days of backup retention; seven-day private links; email verification codes valid for ten minutes; signing sessions valid for fifteen minutes.
- Client signs first; Owner explicitly countersigns as the configured authorised Maple representative with recent MFA; no agent signs for either party.
- Keep agreement state separate from link state; expiry/revocation does not erase signatures or prevent an already accepted document's Maple countersignature.
- Only Owner can issue/revoke links, configure policy, publish confidentiality templates and attest readiness. Admin may prepare; members have no contract access.
- Agreement retention remains configurable and unset initially (user approved 16 November). No production link issuing until required retention policy and readiness are configured.
- Tests use synthetic data and fake mail. No real client sending or signing. Deploy after checks and review under existing user authorization.

## Review Focus

- Simultaneous MFA recovery or OTP use must not succeed twice; task 1/3 concurrency tests pin atomic consumption.
- A failed upload/backup or terminating process must restart only previously running Maple applications and must never create a false healthy status; task 2 failure-injection tests.
- A changed source draft or company profile must not alter an issued agreement or stored PDF; task 3 snapshot tests.
- An expired link must deny client reads even when an old signing session remains, but must not cancel previously accepted signatures; task 3 lifecycle tests.
- A deployment must not lock out the only owner or silently disable MFA on rollback; task 1 staged enforcement and task 4 rollout checks.

### Task 1: Account MFA, server hardening and readiness

**Files:** modify backend/src/modules/auth/{admin.model,auth.routes,auth.service,auth.schema}.ts, backend/src/middleware/auth.ts, backend/src/config/env.ts, backend/src/lib/logger.ts, backend/src/server.ts, backend/src/routes.ts; create backend/src/modules/security/{mfa,security.model,security.service,security.routes}.ts; modify src/app/api/admin/session/route.ts, src/lib/admin/{access-policy,session-client}.ts, src/components/pages/admin/AdminShell.tsx, src/middleware.ts, next.config.ts; create src/app/admin/security/page.tsx and src/components/pages/admin/security/Security.tsx. Tests in backend/src/__tests__/{mfa,security-readiness,session-bff}.test.ts.

**Interfaces:** `getReadiness(): Promise<{ready:boolean;checks:Array<{id:string;ok:boolean;detail:string}>;policy:...}>`; `requireReady():Promise<void>`; `requireRecentMfa` Express middleware checking a server-signed `mfaAt` claim no older than 300 seconds. Security policy has `agreementRetentionMonths:number|null`, `retentionBasis:string`, `legalHoldPolicy:string`, `attestations` dated/attributed and `revision`. MFA enforcement is server configuration `MFA_REQUIRED` default false until supervised owner enrolment. Backup status file path is `BACKUP_STATUS_PATH`, with safe schema `{version:1,lastAttemptAt,lastSuccessAt,lastUploadVerifiedAt,lastRestoreVerifiedAt,retentionDays:30,encryption:'age',offsite:'google-drive',legacyPlaintextCleared:boolean,ok:boolean,error?:string}`; stale >26 hours blocks readiness. Missing status never passes. Expose safe authenticated MFA summary/second-factor status. Preserve backward-compatible non-MFA login response while disabled.

- [ ] Add failing tests: enrolled users require password then MFA; restricted enrolment token cannot access any business route; recovery/OTP race yields only one success; TOTP replay, stale challenge, attempt cap, wrong token type, expired MFAAt rejected. Unknown user cannot be enumerated by success messages.
- [ ] Run focused tests and establish relevant failure.
- [ ] Implement TOTP using a maintained package, encrypt secrets with existing crypto helpers, bounded database challenges, single-use hashed recovery codes, staged enrolment/confirmation with saved-code acknowledgement, recent MFA reauthentication and enforce-aware refresh. Login creates no full session for pending second-factor/enrolment. No owner-user lockout default.
- [ ] Add owner-only security policy/readiness endpoints and UI. Technical checks from server state only; manually entered attestations clearly labelled. Confidentiality publication uses requireReady; unset retention is a signing gate, not an unrelated invoice gate. Preserve existing template tests via explicit fake ready configuration, never a production bypass.
- [ ] Add production loopback configuration, strict JWT algorithm verification, sensitive-log redaction, safe proxy IP handling, HTTPS security headers and admin/signing CSP compatible with existing iframe previews. Preserve redirect middleware.
- [ ] Run focused suite, backend/frontend typechecks and build as applicable; commit a cohesive task with report. Include exact auth and readiness response contracts for task 3.

### Task 2: Encrypted backups and operator recovery tooling

**Files:** create operations/security/backup.py, operations/security/backup_watchdog.py, operations/security/test_backup.py, operations/security/restore_check.py and operations/security/README.md. No production secrets or credentials in files. Use task 1 BACKUP_STATUS_PATH safe schema.

**Interfaces:** `backup.py --config /private/config.json` runs a generation; config identifies exact Maple applications, absolute tool paths, private output dir, age public recipient, rclone remote plus pinned folder ID, excluded backup-auth paths, status path and source paths. No arbitrary shell interpolation. `--verify-config` validates without mutation. `restore_check.py` consumes downloaded encrypted archive, off-server key through protected input and isolated target only; refuses production paths/ports. Watchdog checks staleness independently of backup execution and records/sends bounded failure alerts to the configured company incident mailbox.

- [ ] Write failing unit/integration tests using injectable command runner and temporary synthetic payloads: dump failure, age failure, upload/check failure, timeout/SIGTERM, low disk, stale run, expiration boundary, Drive trash disabled, unknown manifest/path traversal rejected and only previously online named apps restarted. Assert no plaintext archive and no false success.
- [ ] Run tests to establish failures.
- [ ] Implement non-overlap/deploy lock, bounded stop/drain of only Maple writers, dump/tar streams piped into age, encrypted staging and atomic manifests; unconditional recovery of app availability before upload; watchdog fallback for killed parent; idempotent restart. Never stop Mongo or unrelated apps.
- [ ] Upload to pinned private Drive folder with rclone, verify downloaded encrypted bytes/hash, then mark upload success. Expire only recognized job-owned generations older than 30 days, including incomplete generation cleanup and permanent Drive expiry. Do not erase legacy backups before explicit successful migration/key custody/restore evidence. Keep evidence flags false until verified.
- [ ] Implement safe status file and quota/stale/expiry alerts without exporting confidential payload. Document official tool installation/version verification, company OAuth minimum scope, off-server recovery custody, shared deployment lock, credential exclusions, legacy ciphertext migration, monthly restore drill and rollback.
- [ ] Run tests; commit and report prerequisites for controller-led operational activation. Do not deploy, create keys or authorize Drive from this task.

### Task 3: Frozen agreements and private client signing

**Files:** create backend/src/modules/signing/{signing.model,signing.schema,signing.service,signing.routes,signing.pdf}.ts and backend/src/__tests__/signing.test.ts; modify backend/src/routes.ts, backend/src/modules/business/{documents.schema,documents.service,documents.routes}.ts; create src/app/sign/[id]/page.tsx, src/app/api/sign/[...path]/route.ts, src/components/pages/sign/ClientSigning.tsx and src/components/pages/admin/business/SigningRequests.tsx, src/app/admin/signing/page.tsx; integrate Drafts.tsx/AdminShell.tsx and business/api.ts. Pin maintained PDF library in backend package files.

**Interfaces:** staff endpoints under `/business/signing`; public `/signing/:id/{code,verify,document,sign,pdf}` proxied through `/api/sign/:id/...`. API public session token never exposed to JS: BFF sets dedicated HttpOnly Secure SameSite Strict 15-minute cookie scoped to signing API. fragment secret posted for requesting/verification only; backend stores SHA256 hash. `requireRecentMfa` and `requireReady` supplied by task 1. Schema includes structured INR fees (integer paise), SOW reference/date, signer name/email/capacity, provider/AI list, incident address, backup retention, personal/production data flag and required schedule. Policy retention duration/basis/holds snapshotted at issuing.

- [ ] Add failing tests for all staff roles, readiness/missing policy/fields, code mail failure, invalid/expired/revoked links, attempt/resend/per-recipient/global budgets across restart, concurrent verify/sign, CSRF BFF, wrong session binding and signature/hash mismatch. Fake delivery yields test-only code, production never logs/exposes it.
- [ ] Run failing focused tests, then implement bounded envelope record with immutable snapshot, independently rotating link lifecycle, persistent hashed OTP/budgets, atomic consent transitions and audit events. No multi-document transaction assumption. Link expiry max30/default7 days; OTP 10min/5 attempts; signing session15min. Only fixed intended email receives a requested code; reject dry-run transport for production signing.
- [ ] Implement snapshot validation and no completed signature if unresolved placeholders/manual completion reminders remain. Structured completion details form part of frozen rendered contract. Source draft modifications never alter issued copy. Preserve required signature blanks for the signature evidence section only.
- [ ] Implement explicit client consent and Owner recent-MFA countersignature. Compute branded bounded PDF before final conditional write; atomically persist completed signatures, PDF bytes and separate content/PDF SHA256 digests. Add owner close-incomplete with reason and view-only link renewal for completed records; no silent invalidation or reopening.
- [ ] Implement responsive client verification/review/consent/download UI using local assets and plain safety copy; no external analytics. Staff UI prepares requests, shows link status separately from signing status, copies newly minted link once, verifies readiness/errors and confirms explicit owner signing. Token never in query/path, analytics, localStorage or logs; scrub fragment and use protected session for subsequent actions.
- [ ] Run tests, typechecks, production build and PDF text/layout checks with synthetic agreement; commit and report exact API contracts and operational limits. Do not send or sign real contracts.

### Task 4: Integration, review and production activation

**Files:** regression tests for any integration defects, deployment/runbook evidence outside Git, updates operations/security/README.md and this checklist.

- [ ] Run full backend suite, frontend/backend lint and typechecks, production builds. Exercise local UI and signed PDF output with synthetic records; check public website and document previews under new CSP. Fix real defects with focused tests before rerunning affected checks.
- [ ] Obtain independent whole-branch security/quality review, address important findings and verify corrections.
- [ ] Use company Google OAuth to authorize smallest required rclone scope; obtain user confirmation at the actual access grant. Generate age key through a protected local workflow; store off-server identity in owner-controlled vault/Keychain and establish recoverable owner custody before retiring plaintext workflow.
- [ ] Install verified tooling; deploy operational config privately. Supervise fresh encrypted backup, upload, download/decrypt/isolated restore comparison; record measured interruption and real evidence. Confirm retention targeted only at new managed folder. Install cron + independent watchdog after recovery verification.
- [ ] Merge/deploy tested software under explicit user authorization, pin release SHA and lock with backup workflow; default MFA enforcement false and signing issuance gated. Verify health, localhost listeners, real HTTPS headers, owner/admin/member access and clean test fixtures. Preserve rollback that cannot disable enforced MFA silently.
- [ ] Assist owner MFA/recovery and FileVault setup with required handoffs; do not attest staff/device facts automatically. Keep configurable retention blank until owner chooses. Publish template/enable client issuance only after gates actually pass. Report deployed vs operationally awaiting-user separately; no false claim that external setup has completed.
