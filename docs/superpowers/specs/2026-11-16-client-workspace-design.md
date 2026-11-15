# Client and project workspace

Status: proposed design for review. Outreach repair is independently authorized and underway.

## Purpose and decisions

Maple Studios needs one low-cost workspace for client work, project delivery and reusable client communications. Extend the existing Next.js / Express / MongoDB dashboard on the current VPS; add no paid platform or AI dependency.

The user requested clients, projects, team assignments, deadlines, deliverables and approvals, plus onboarding/update emails, invoices and confidentiality documents. The user chose **team-recorded client approvals**, rather than client-facing approval links, and requested company logo/details in document headers and footers. Existing Downloads agreements are reference material; source files and client details must remain outside this public repository.

## Approaches

1. **Internal workspace and editable templates — selected by the user.** Staff record decisions received by email and retain their reference. No client portal is needed. Deterministic templates generate editable drafts from stored facts, with no per-generation charge.
2. **Client approval portal — deferred.** Private links would give clients direct submission/approval controls but require additional identity, link lifecycle and external notification handling.
3. **External CRM / paid AI document service — not selected.** It duplicates the dashboard and adds cost/data movement without being needed for this version.

## Clients and projects

Managers (Owner/Admin) can create, edit, search and archive clients. A client has company/display name, primary contact name/email, phone, billing address, optional GSTIN and notes. Archived clients retain their history. No hard-delete UI.

Projects belong to one client and have title, scope summary, start/due dates, status (planned, active, on-hold, completed, archived), and assigned team members selected from existing active sign-in accounts with non-inactive employee records. No automatic import of real clients/projects from the reference contracts.

Owner/Admin manage all projects. Members see only projects they are assigned to; they see the client name and delivery information, not billing details, client-private notes, invoices or agreement drafts. Server authorization applies to lists, record access and mutations. Removing an assignment immediately removes access.

A project detail screen has Overview, Deliverables and Client drafts. The project list supports search and status filters and shows due dates, overdue work and team assignments. All dates are validated calendar dates, displayed in IST; date-only deadlines remain date-only. Project/deliverable edits require the current revision to prevent silently overwriting another person's work.

## Deliverables and approvals

Deliverables contain title, description, assignee (from the project's team), due date, status and a submission URL/reference plus notes. Workflow: planned → in progress → in review → approved / changes requested. Members can update and submit their own assigned deliverables; managers can update all.

Submitting records a version of the submitted content. Owner/Admin record a client decision only against that exact current submission version, with decision, client approver name, decision date and evidence reference (email thread, approved document URL or reference). The UI calls this **Record client approval**, not Send/Approve as client. A stale approval attempt returns a conflict. Changing approved content clears its current approval and requires resubmission while retaining historical decisions. The original evidence remains readable in project history. No automated deemed acceptance or inference from silence.

## Client email and document drafts

Managers can generate and save four types from a client's project:

- Onboarding email: agreed project summary, team contact, dates, initial deliverables, required inputs and next step.
- Progress update email: selected reporting period, completed/in-review/upcoming deliverables, blockers and next decisions. Staff supply explanatory notes; no invented progress.
- Invoice draft: seller/buyer snapshots, invoice reference, dates, line descriptions, SAC/HSN where applicable, quantities, rates, discount, explicit tax mode/rates and payment instructions.
- Confidentiality agreement draft: editable template filled with company, client, project/purpose, date, representatives and agreement reference.

Generated drafts are stored with their source project revision, template revision, actor and creation time. Editing or regenerating creates a new revision; previously saved versions remain accessible. Later client/company edits do not silently rewrite existing documents. Subject and body are editable. Copy subject/body and export HTML/plain text are available for emails; there is no sending action in this release.

Invoices and agreements have a printable branded preview, Save as PDF through the browser print flow, and a real editable DOCX download. Long content must paginate cleanly, including repeated document header/footer and invoice table headings. Exports use saved snapshots, escape all client input and reject executable/unsafe content. Arbitrary remote logo URLs are not fetched by the server. Use the existing local Maple logo asset, with text fallback.

All invoices and agreements in this release are visibly **Draft**. This release does not issue tax invoices, assign statutory final invoice numbers, sign contracts, charge money, email documents, or claim tax/legal compliance. The invoice editor supports the relevant seller/buyer, classification, taxable-value and tax-breakdown fields; applicable tax treatment and missing company registration/payment details are supplied by the Owner. Zero-tax and GST modes are explicit; no assumed GST rate or copied vendor GSTIN. A draft reference is separate from an externally issued invoice reference.

Amounts are calculated on the server in integer paise. Quantity uses hundredths; rates use integer basis points. Round each line's net/tax components to paise with documented half-up rounding. Validate positive quantities, nonnegative rates, discounts not exceeding line value and safe integer bounds. INR only initially; no exchange rates, accounting exports or automatic tax determination.

## Company identity and templates

Owner-only Company & templates settings contain display/legal name, address, website, contact email/phone, optional GSTIN, representative and payment instructions. Managers can use those fields in generated documents but only the Owner can change them. Member responses never contain those settings.

Initialize branding with the site's local logo and Maple Studios name/website. The address from the supplied company agreements can be staged as a private draft, with missing registration/bank fields visibly blank. Do not include financial identifiers, private client terms, actual contracts or employee records in Git.

Email starter templates are included. The supplied confidentiality agreement is imported as an **editable, unpublished template draft** with client/project-specific names and terms replaced by explicit placeholders. Owner reviews and publishes a template revision before it can be used for other clients. Required unresolved placeholders prevent export as a completed draft; show what is missing. Keep the original agreement unchanged. Legal effectiveness and statutory declarations are not inferred from its presence.

The Services Agreement/SOW is a reference for structured project scope, milestones and payment descriptions, not an automatic commitment to its prices, dates, support periods or special clauses for every client. A general SOW generator can be added later without blocking these four draft types.

## Outreach repair

Use API-supported page sizes (100) and the existing Previous/Next controls; reset page on search and make page-local stage counts explicit. Use stable sorting for records with equal update timestamps. Show due/list failures as errors rather than contradictory empty-success messages. Verify create, search, stage advance, notes, template preview and due-date behavior against synthetic data. LinkedIn messages remain manually sent.

## Storage, rollout and validation

Add isolated MongoDB collections for clients, projects, deliverables/decisions, document drafts/revisions and business configuration/templates. Validate references and limits before writes. Keep bounded document/line sizes; enforce unique revision identity and optimistic concurrency. New collections are included automatically in the existing database backup job.

Use the existing cookie session and same-origin proxy. No new client-side access tokens, public client routes or credentials in document links. Preview/export endpoints enforce the same permissions as draft reads and return private/no-store responses.

Test unauthorized and unassigned access, reassignment, inactive accounts, member field filtering, invalid dates/references, stale updates/approvals, approval invalidation, invoice arithmetic/rounding, old snapshots after edits, malicious text/URLs, required placeholders and binary exports. Run the full backend suite, lint/type checks and production build; inspect the core UI and long-document exports. Use only synthetic fixtures in tests and previews.

Deploy through a reviewed PR after verification, with a fresh backup and additive collection/index creation. No legacy data rewrite is needed. Smoke-test using disposable synthetic records, then remove only those fixtures. Keep the current payroll/account behavior intact.

## Remaining inputs and builder choices

The user selected the internal approval workflow and branded templates. UI layout, component decomposition, pagination mechanics, export library and collection schema are implementation choices. Reuse the current visual style and account model. The Owner can complete missing company registration/payment details through settings; these do not block client/project use. No client messages or legally binding documents are sent or signed by this task.
