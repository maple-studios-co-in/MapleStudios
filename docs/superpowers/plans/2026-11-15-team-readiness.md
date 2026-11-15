# Maple team readiness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace unreliable enquiry/booking storage, connect individual accounts, and establish restricted team operations.
**Architecture:** Keep the existing Next.js application and MongoDB/Express API. Next forwards authenticated requests to the API; MongoDB owns enquiries, bookings, accounts and employee/payroll records. No new paid service.
**Tech Stack:** Node 22, Next 15, Express 5, MongoDB/Mongoose, Vitest.
**Spec:** The approved dashboard audit and implementation request; public rollout contract in docs/team-rollout.md.

## Global constraints
- Preserve existing production data; no live migration, invitations, payments or deployment during local implementation.
- Reuse existing hosting and database.
- Authorize every request server-side; salary access is separate from ordinary team access.
- Keep the approved employee roster in a private deployment input; do not commit employee data.

## Review focus
- Parallel submissions, booking/removal races and outages must not produce false success.
- Repeated migration must neither duplicate enquiries nor overwrite current bookings.
- Revoked, inactive or refresh credentials must not access admin APIs.
- Ordinary team members must not read other employees' payroll or CMS/growth data.
- Payroll approval/payment transitions must preserve amounts and actor history.

### Task 1: Durable enquiries and bookings
Files: src/lib/{inquiries,bookings,growth-server}.ts, public API routes, ContactBody.tsx, backend slots services/routes, scripts/migrate.ts, tests.
Interfaces: Preserve Inquiry and Slot wire shapes and helper signatures. growthRequest<T>(path, init, authenticated) forwards caller credentials and surfaces backend errors. Migration takes validated legacy objects and only inserts absent records.
- [x] Add regression tests for website-to-Mongo persistence, concurrent claims, cancellation, all inquiry pages and outage errors; run to observe failure.
- [x] Replace JSON helpers with backend adapters, preserve calendar cancellation, make form wait for acknowledged success.
- [x] Test migration reruns against changed booking/status; implement insert-only validation and dry-run reporting.
- [x] Run backend suite, frontend typecheck/lint/build. Commit storage changes.

### Task 2: Individual accounts and permission enforcement
Files: backend auth models/middleware/routes/tests; Next session/proxy routes, CMS guard, AdminShell and audit.
Interfaces: Roles owner/admin/member. Owner manages accounts/payroll; admin operates studio/content; member accesses own team records only. HttpOnly session cookie at Next boundary, bearer credentials only forwarded server-side.
- [x] Add tests for refresh-token rejection, revocation, disabled accounts, role boundaries and owner-only account management; observe failures.
- [x] Implement account/session lifecycle, guarded UI and route access, actor attribution and account management.
- [x] Run regression suite and browser verification. Commit identity changes.

### Task 3: Team operations foundation
Files: backend team module/tests; admin team/payroll pages.
Interfaces: Employee directory, leave requests, monthly payroll drafts/approval/paid records; payments occur externally. No automatic statutory calculations or banking integration.
- [x] Confirm payroll scope and roles with user; document defaults if optional answers remain absent.
- [x] Test cross-user restrictions, amount validation and immutable payroll state transitions; implement matching API and UI.
- [x] Run full checks, review branch, document migration/first-owner/bootstrap steps and remaining rollout requirements.

## Execution record
- Isolated branch codex/team-readiness; original checkout untouched.
- Roles confirmed by the user: one Owner and one Admin. Payroll remains Owner-only; new contract start 2026-12-01. Approved roster retained privately, no production access granted.
- Storage regressions reproduced before fixes; auth and team failures reproduced before implementation. Website integration exercises the real API and an isolated MongoDB instance.
- Whole-change fresh review found five important issues. Fixed employee payload projection, encoded CMS paths, revision-checked payroll approval/edit, claim-specific cancellation, and logout revocation after access expiry. Regression suite passed after fixes.
- Browser verified owner login, employee edits, attendance, synthetic payroll draft/approve/paid, member leave and restricted navigation.
- Ruling: initial payroll uses manual INR amounts and explicit leave adjustments, with external payments, as approved. No automated statutory calculation, signing or banking service is claimed.
- Ruling: production rollout remains separate: verified backup/restore, final data snapshot/import, account provisioning and legacy-key retirement must precede activation. Skipping these risks lost historical records or retained shared-key access.
- Existing CMS/media file persistence and bounded audit retention remain outside this enquiry/booking migration; backups must include them.
- Deferred existing audit work: Outreach pagination error and public content routes are not repaired by this team-operations release.
- Build initially hit local disk exhaustion; removed only task-generated build caches, then production build passed.
