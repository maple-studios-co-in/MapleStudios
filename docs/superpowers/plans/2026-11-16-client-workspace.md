# Client Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved plan task-by-task.

**Goal:** Deliver client/project tracking and branded editable client document drafts in the existing dashboard.
**Architecture:** Authenticated Express/Mongo business API, existing Next cookie proxy, matching dashboard screens. Snapshot versioning keeps generated drafts and approvals tied to reviewed content.
**Tech Stack:** Node 22, TypeScript, Express, Mongoose, Next/React; docx for Word export; HTML print preview for PDF.
**Spec:** `docs/superpowers/specs/2026-11-16-client-workspace-design.md` — approved by user 16 November 2026.

## Global Constraints

- Reuse existing hosting/auth; no paid platform or AI service; no sending or signing.
- Internal client approvals only. Managers control scope/assignments/deadlines; members update their assigned work.
- Financial/client-private data and documents are manager-only; company/templates changes Owner-only.
- All invoice/agreement exports are drafts, INR only; integer paise arithmetic and explicit tax configuration.
- Private source contracts, employee data and real client information never enter Git.

## Review Focus

- Unassigned/deactivated members cannot obtain client details or documents by guessing IDs.
- Concurrent edits/approval against an old submission fail without altering current approval.
- Changing project/client/company details does not rewrite a saved draft.
- Fractional quantities, rounding, discounts and invalid totals produce correct bounded integer totals.
- Long/malicious document text and unresolved placeholders do not create executable HTML or corrupt exports.

### Task 1: Clients, projects and deliverables API

**Files:** create `backend/src/modules/business/{business.model,business.schema,business.access,projects.routes}.ts`; mount in `backend/src/routes.ts`; test `backend/src/__tests__/projects.test.ts`.
**Interfaces:** `/business/clients`, `/business/projects`, `/business/people`, `/business/projects/:id/deliverables`, `/business/deliverables/:id`, `/business/deliverables/:id/decision`. JSON `{item}`/`{items}`; IDs strings; revision required on updates. Expose `projectFor(req,id)`, `isManager(req)`, `requireBusinessManager`, document-safe schemas and shared model options for Task 2.
- [ ] Write integration tests for client/project create/read/edit/archive, assignments, missing refs/dates, member filtering, revocation, own progress-only writes, submit/decision/version invalidation and stale updates. Expect 404 before route implementation.
- [ ] Implement Mongo schemas and role/reference/concurrency guards, recording immutable submission/decision snapshots in deliverable history.
- [ ] Run full backend tests and lint/typecheck; expect all pass. Commit API.

### Task 2: Company, draft generation, invoice maths and exports

**Files:** create `backend/src/modules/business/{documents.routes,documents.service,document-export,invoice}.ts`; extend business models/schemas; test `backend/src/__tests__/business-documents.test.ts`; add docx dependency to backend.
**Interfaces:** manager `/business/drafts` list/create, `/:id` GET/PATCH, `/:id/versions`, `/:id/export?format=html|docx|txt`; `/business/company` GET manager/PATCH owner; `/business/templates` GET manager/PUT owner with draft/published revisions. Create input `{projectId,kind,onboarding/update fields,invoice?,templateId?}`. Draft snapshot contains subject/body, company/client/project identity, invoice computed totals, source/template revisions and actor; all updates create retained versions using revision compare-and-set.
- [ ] Write failing tests for all four draft kinds, unknown refs, access denial, snapshot immutability, stale revision, required placeholders, owner-only templates, manual tax modes and half-up invoice arithmetic, escaped HTML and valid DOCX ZIP.
- [ ] Implement pure invoice calculator and template rendering with literal placeholders, bounded input and no remote fetching or sending.
- [ ] Add branded HTML/Word exports with shared header/footer, pagination, draft labels and no-store authorization.
- [ ] Run full tests, lint/typecheck/build. Commit document API.

### Task 3: Workspace UI

**Files:** create `src/components/pages/admin/business/{api,Clients,Projects,ProjectDetail,Drafts,Company}.tsx/ts` and `src/app/admin/{clients,projects,projects/[id],drafts,company}/page.tsx`; modify `AdminShell.tsx` navigation and member allowlist.
**Interfaces:** consume Tasks 1–2 `/api/v2/business` endpoints with `sessionFetch`. Shared client-side types match wire snapshots, never raw model fields.
- [ ] Implement client and project search/filter/create/edit/archive, team picker, date controls, project overview and deliverables with revisions. Member UI exposes only assigned project work.
- [ ] Implement client draft generation/edit/history/export, invoice line editor/tax controls, company and template settings. Errors retain form inputs; clear busy/error states and human action labels.
- [ ] Run frontend lint/typecheck/build and full backend suite; browser-check manager/member flows and long document print/Word renders. Commit UI.

### Task 4: Private reference setup and deployment

**Files:** add idempotent private template import script `backend/src/scripts/import-business-reference.ts`, document rollout in `docs/client-workspace-rollout.md`; local private artifacts outside repo.
**Interfaces:** private JSON file supplied via env; company draft and unpublished template only, refuses to overwrite existing configured values. No actual client/project is created from reference documents.
- [ ] Prepare anonymized confidentiality template from supplied private document with explicit placeholders and inspect for leftover client names, identifiers and special commitments. Stage company address as draft, leaving unavailable billing data blank.
- [ ] Request fresh whole-branch code review and resolve important findings. Run final checks and create PR.
- [ ] Take backup, build candidate, create additive indexes, import only private company/template drafts, merge/deploy authorized changes and smoke-test with disposable fixtures. Verify permissions and unchanged team/payroll. Save evidence and report remaining setup fields.
