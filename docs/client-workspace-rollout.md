# Client workspace

Adds Clients, Projects, Client drafts and Company & templates to the existing dashboard. No paid service, external client portal, email sending or signature workflow is added.

## Access

- Owner/Admin: client details, all projects, recorded client decisions, draft generation and exports.
- Owner only: company details and reusable template editing/publication.
- Members: assigned projects and progress on their own deliverables. No billing, client directory, templates or documents. Account or employee deactivation removes access.
- Existing payroll permissions remain Owner only.

Client approval records cite a specific submission version and evidence reference. Editing submitted content invalidates approval. Concurrent stale edits fail. Drafts retain immutable company/client/project snapshots and prior versions; regeneration explicitly uses current facts.

## Documents

Onboarding/update emails use recorded facts and editable text. Invoices use INR fixed-point arithmetic with explicit no-tax, CGST/SGST or IGST modes. All documents are drafts. Word exports contain shared branding, headers, footers and page numbers; browser print provides PDF. Confidentiality drafts require a published template, and unresolved placeholders block export. Exported documents should be reviewed before use. No statutory invoice issuance or legal validity is asserted.

Company tax/payment information is intentionally not inferred. Private reference input is kept outside Git. The importer creates only missing company settings and an unpublished agreement; reruns preserve existing settings. It creates additive indexes and no client/project records.

## Release and recovery

Build frontend/backend and install backend dependencies in an isolated candidate. Run API tests, typechecks and lint; inspect browser and exported document layouts. Before cutover run the existing full database/data/config backup job and retain the old `.next`, API `dist` and backend `node_modules` as a matched rollback set. Deploy only `maple-studios-web` and `maple-studios-api`. Import reference data with `BUSINESS_REFERENCE_FILE` and `DOTENV_CONFIG_PATH` pointing to private files. No existing collections need migration.

Verify readiness, authenticated workflow/role checks and existing team/payroll access using disposable test fixtures. Remove only those fixtures. If rollback is needed, stop the two Maple processes, restore the prior commit and matched artifacts/dependencies, then restart and verify readiness. The additive collections may remain; do not overwrite business data with a pre-release backup unless data recovery has been explicitly assessed.
