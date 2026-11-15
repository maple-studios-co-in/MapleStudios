# Company payment settings

User requested bank details and UPI/QR controls in settings, plus certificate-based company details. Extend the approved client workspace; keep existing Owner-only edits and manager-only reads/exports.

Use structured optional beneficiary, bank name, account number, IFSC, UPI ID and UPI payee fields, with an optional uploaded QR (PNG/JPEG converted to bounded PNG in browser, validated and re-encoded on server). Preview/remove before saving. No external media URLs, public uploads, payment processing or automatic QR generation. Existing payment instructions remain editable. This fits an existing bank-issued QR without introducing provider integrations or paid services.

New invoice snapshots embed payment fields and QR privately. Existing snapshots are unchanged; regenerating explicitly adopts current settings. HTML and Word show a payment table and QR with preserved aspect ratio and recipient-check text. Bank account numbers stay strings. Invalid IFSC/UPI/images, oversized payloads and unauthorized writes fail without changing the profile.

Certificate and bank data stay outside public Git. The legal/trade names and GSTIN are entered through the authenticated production API, with private before/after evidence. Signatory authority is user-confirmed, separate from proprietor identity. NDA remains unpublished until its outstanding term decisions are resolved.

Implementation: add API validation/export coverage first (RED), extend schema/image helper and exports, then settings UI; verify full suite, builds, uploaded QR preview, generated document rendering and live permissions. Reuse backed-up release workflow.
