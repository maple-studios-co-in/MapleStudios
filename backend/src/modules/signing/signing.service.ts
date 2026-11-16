import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/AppError.js";
import { getMailProvider } from "../../lib/mail/provider.js";
import { registerTick } from "../../lib/scheduler.js";
import { AdminUser } from "../auth/admin.model.js";
import { agreementTemplateFields } from "../business/documents.schema.js";
import { fillTemplate, findDraft, validateAgreementText, type DraftSnapshot } from "../business/documents.service.js";
import { getReadiness, getSecurityPolicy, requireReady } from "../security/security.service.js";
import {
  DeliveryBudget, Envelope, type EventType, type Signature, type SigningEnvelope, type SigningSnapshot,
} from "./signing.model.js";
import { renderSigningPdf, requirePrintable } from "./signing.pdf.js";
import { clientConsent, ownerConsent, type AgreementDetails, type PreviewInput } from "./signing.schema.js";

type EnvelopeView = Omit<SigningEnvelope, "pdf">;

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const secret = () => randomBytes(32).toString("base64url");
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const contentDigest = (value: SigningSnapshot) => digest(JSON.stringify(value));
const privateDigest = (value: string) => createHmac("sha256", Buffer.from(env.APP_ENCRYPTION_KEY, "hex"))
  .update("maple-signing-v1\0" + value).digest("hex");
const event = (type: EventType, at: Date, actorId?: string, reason?: string) => ({
  type, at, ...(actorId ? { actorId } : {}), ...(reason ? { reason } : {}),
});
const clientStates = ["awaiting-client", "awaiting-owner", "completed"];
const incompleteStates = ["awaiting-client", "awaiting-owner"];
const clearAccess = { otp: 1, session: 1 };
const inactiveLink = () => AppError.notFound("This agreement link is unavailable. Ask your Maple Studios contact for a current link.");
const inactiveSession = () => AppError.unauthorized("Your private session expired. Open your original link and verify by email.");
const invalidCode = () => AppError.unauthorized("The code could not be verified. Check the code or request a new one.");
const throttled = () => AppError.tooMany("Code requests are temporarily limited. Wait before asking for another code.");
const changed = () => AppError.conflict("The agreement changed or this action was already recorded. Refresh and review the current record.");

function publicOrigin() {
  const url = new URL(env.PUBLIC_BASE_URL);
  if (url.username || url.password || (env.isProd && url.protocol !== "https:") || !["http:", "https:"].includes(url.protocol))
    throw AppError.unavailable("The private signing site is not configured.");
  return url.origin;
}
const mailAvailable = () => Boolean(env.MAIL_FROM_EMAIL && getMailProvider().name === "resend");
const retentionAvailable = (policy: Awaited<ReturnType<typeof getSecurityPolicy>>) =>
  typeof policy.agreementRetentionMonths === "number" &&
  Number.isInteger(policy.agreementRetentionMonths) &&
  policy.agreementRetentionMonths >= 1 && policy.agreementRetentionMonths <= 1200 &&
  !!policy.retentionBasis.trim() && !!policy.legalHoldPolicy.trim();

export async function signingEligibility() {
  const { checks, policy, ready } = await getReadiness();
  const retention = retentionAvailable(policy);
  const delivery = mailAvailable();
  let origin = true;
  try { publicOrigin(); } catch { origin = false; }
  return {
    ready: ready && retention && delivery && origin,
    checks: [
      ...checks.map(({ id, ok }) => ({ id, ok })),
      { id: "agreement-retention", ok: retention },
      { id: "mail-transport-configured", ok: delivery },
      { id: "signing-origin-configured", ok: origin },
    ],
  };
}
function retentionSnapshot(policy: Awaited<ReturnType<typeof getSecurityPolicy>>): SigningSnapshot["retention"] {
  if (!retentionAvailable(policy))
    throw new AppError(409, "SIGNING_RETENTION_REQUIRED", "The owner must set the agreement retention period, basis and legal hold policy in Security.");
  const months = policy.agreementRetentionMonths!;
  const basis = policy.retentionBasis.trim().replace(/\r\n/g, "\n");
  const legalHoldPolicy = policy.legalHoldPolicy.trim().replace(/\r\n/g, "\n");
  return {
    months, basis, legalHoldPolicy,
    notice: `The studio retains this record, including its PDF, signer identities and identifying audit information, for ${months} calendar month${months === 1 ? "" : "s"} from completion or formal closure if incomplete. At the retention date the record is due for owner review and deletion, subject to any legal hold.\nRetention basis: ${basis}\nLegal holds: ${legalHoldPolicy}`,
  };
}
function completionText(details: AgreementDetails) {
  const fees = "INR " + (details.feesPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const providers = details.providers.map(p => `${p.name} (${p.usesAi ? "AI" : "non-AI"}) for ${p.purpose}`).join("; ") || "None approved";
  return {
    sowReference: details.sowReference,
    sowDate: details.sowDate,
    fees,
    signerName: details.signerName,
    signerEmail: details.signerEmail,
    signerCapacity: details.signerCapacity,
    personalOrProductionData: details.personalOrProductionData ? "Yes" : "No",
    personalDataSchedule: details.personalDataSchedule || "Not applicable",
    personalDataScheduleDate: details.personalDataScheduleDate || "Not applicable",
    providers,
    providerApprovalReference: details.providerApprovalReference || "Not applicable",
    providerApprovalDate: details.providerApprovalDate || "Not applicable",
    backupRetentionDays: String(details.backupRetentionDays),
    incidentEmail: details.incidentEmail,
  } satisfies Record<typeof agreementTemplateFields[number], string>;
}

export async function signingPreview({ draftId, draftRevision, linkDays: _linkDays, ...details }: PreviewInput) {
  void _linkDays;
  const [draft, policy] = await Promise.all([findDraft(draftId, false), getSecurityPolicy()]);
  if (draft.revision !== draftRevision)
    throw AppError.conflict("The source draft changed. Reopen it and review the new revision.");
  const source = draft.snapshot as DraftSnapshot;
  if (draft.kind !== "confidentiality" || !source.templateId || !Number.isInteger(source.templateRevision))
    throw AppError.badRequest("Choose a confidentiality draft generated from a published template.");

  const fields = completionText(details);
  const replacements = Object.fromEntries(agreementTemplateFields.map(key => [`agreement.${key}`, fields[key]]));
  const title = fillTemplate(draft.title, replacements);
  const body = fillTemplate(draft.body, replacements).replace(/\r\n/g, "\n");
  // Review and sign the actual body. Subject is only draft metadata.
  const completion = [
    `Statement of work: ${fields.sowReference} · ${fields.sowDate}`,
    `Fees: ${fields.fees}`,
    `Client signer: ${fields.signerName} · ${fields.signerCapacity} · ${fields.signerEmail}`,
    `Personal or production data: ${fields.personalOrProductionData}`,
    `Data schedule: ${fields.personalDataSchedule}${details.personalDataScheduleDate ? ` · ${fields.personalDataScheduleDate}` : ""}`,
    `Approved providers and AI: ${fields.providers}`,
    `Provider approval: ${fields.providerApprovalReference}${details.providerApprovalDate ? ` · ${fields.providerApprovalDate}` : ""}`,
    `Maximum backup retention: ${fields.backupRetentionDays} days`,
    `Client incident contact: ${fields.incidentEmail}`,
  ].join("\n");
  const retention = retentionSnapshot(policy);
  if (body.length > 60_000 || title.length > 300)
    throw AppError.badRequest("The frozen agreement exceeds the document size limit.");
  validateAgreementText(title, body);
  validateAgreementText(draft.subject, completion + "\n" + retention.notice);
  requirePrintable(title, body, completion, retention.notice);
  const snapshot: SigningSnapshot = {
    version: 1,
    source: { draftId: String(draft._id), draftRevision, templateId: source.templateId, templateRevision: source.templateRevision! },
    title, body, completion, details, retention,
    consent: { client: clientConsent, owner: ownerConsent },
  };
  return { snapshot, contentHash: contentDigest(snapshot) };
}

export const signerDocument = ({ title, body, completion, retention, consent }: SigningSnapshot) =>
  ({ title, body, completion, retention, consent });

function mintLink(id: string, days: number, mode: "sign" | "view", now: Date) {
  const raw = secret();
  return {
    href: `${publicOrigin()}/sign/${id}#${raw}`,
    link: { hash: digest(raw), createdAt: now, expiresAt: new Date(now.getTime() + days * day), mode },
  };
}

export async function issueAgreement(input: PreviewInput & { previewHash: string }, actorId: string) {
  const { previewHash, ...fields } = input;
  await requireReady();
  if (!mailAvailable()) throw AppError.unavailable("Private email verification is not configured.");
  const { snapshot, contentHash } = await signingPreview(fields);
  if (contentHash !== previewHash)
    throw AppError.conflict("The agreement or retention policy changed. Review a new preview before issuing.");
  const now = new Date();
  const id = randomBytes(12).toString("hex");
  const { href, link } = mintLink(id, fields.linkDays, "sign", now);
  const item = await Envelope.create({
    _id: id, snapshot, contentHash, link, status: "awaiting-client", createdAt: now,
    revision: 0, linkChanges: 0, holdChanges: 0, held: false, events: [event("issued", now, actorId)],
  });
  return { item: staffView(item), link: href };
}

function openAccess(now: Date) {
  return {
    status: { $in: clientStates },
    "link.revokedAt": { $exists: false },
    "link.expiresAt": { $gt: now },
    $or: [{ retentionDueAt: { $exists: false } }, { retentionDueAt: { $gt: now } }],
  };
}
const linkFilter = (id: string, raw: string, now: Date) => ({
  ...openAccess(now), _id: id, "link.hash": digest(raw),
});
const sessionFilter = (id: string, raw: string, now: Date) => ({
  ...openAccess(now), _id: id, "session.hash": digest(raw), "session.expiresAt": { $gt: now },
});

async function takeDeliveryBudget(scope: string, max: number, width: number, now: Date) {
  const start = Math.floor(now.getTime() / width) * width;
  const id = `${scope}:${start}`;
  try {
    await DeliveryBudget.updateOne(
      { _id: id, count: { $lt: max } },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(start + width) } },
      { upsert: true },
    );
  } catch (error) {
    // The _id index turns a competing upsert or exhausted window into a safe denial.
    if (typeof error === "object" && error && "code" in error && error.code === 11000) throw throttled();
    throw error;
  }
}

export async function sendCode(id: string, raw: string) {
  const now = new Date();
  const access = linkFilter(id, raw, now);
  const row = await Envelope.findOne(access).select("snapshot.details.signerEmail link lastCodeAt").lean();
  if (!row?.snapshot || !row.link) throw inactiveLink();
  if (!mailAvailable()) throw AppError.unavailable("Email verification is temporarily unavailable.");
  const nonce = secret();
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Math.min(now.getTime() + 10 * minute, row.link.expiresAt.getTime()));
  const cooldown = new Date(now.getTime() - minute);
  const reserved = await Envelope.updateOne({
    ...access,
    $and: [{ $or: [{ lastCodeAt: { $exists: false } }, { lastCodeAt: { $lte: cooldown } }] }],
  }, {
    $set: { lastCodeAt: now, otp: {
      nonce, hash: privateDigest(`otp:${id}:${nonce}:${code}`), expiresAt, attempts: 0, delivered: false,
    } },
  });
  if (!reserved.modifiedCount) throw throttled();
  const recipient = row.snapshot.details.signerEmail;
  try {
    await takeDeliveryBudget(`envelope:${id}`, 3, hour, now);
    await takeDeliveryBudget(`recipient:${privateDigest(`recipient:${recipient}`)}`, 5, day, now);
    await takeDeliveryBudget("global", 100, hour, now);
    try {
      await getMailProvider().send({
        to: recipient,
        from: { name: "Maple Studios", email: env.MAIL_FROM_EMAIL! },
        subject: "Your Maple Studios agreement verification code",
        text: `Your verification code is ${code}. It expires within 10 minutes. Enter it only on the private agreement page you opened. If you did not request it, you can ignore this message.`,
        html: `<p>Your verification code is <strong>${code}</strong>. It expires within 10 minutes.</p><p>Enter it only on the private agreement page you opened. If you did not request it, you can ignore this message.</p>`,
      }, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw AppError.unavailable("The verification email could not be sent. Wait a minute and try again.");
    }
    const delivered = await Envelope.updateOne({ ...linkFilter(id, raw, new Date()), "otp.nonce": nonce }, {
      $set: { "otp.delivered": true },
    });
    if (!delivered.modifiedCount) throw inactiveLink();
  } catch (error) {
    await Envelope.updateOne({ _id: id, "otp.nonce": nonce }, { $unset: { otp: 1 } });
    throw error;
  }
  return { ok: true, retryAt: new Date(now.getTime() + minute) };
}

export async function verifyCode(id: string, raw: string, code: string) {
  const now = new Date();
  const access = linkFilter(id, raw, now);
  const row = await Envelope.findOne(access).select("otp link retentionDueAt").lean();
  if (!row?.link) throw inactiveLink();
  if (!row.otp?.delivered || row.otp.expiresAt <= now || row.otp.attempts >= 5) throw invalidCode();
  const sessionToken = secret();
  const expiresAt = new Date(Math.min(now.getTime() + 15 * minute, row.link.expiresAt.getTime(), row.retentionDueAt?.getTime() ?? Infinity));
  const hash = privateDigest(`otp:${id}:${row.otp.nonce}:${code}`);
  const active = {
    ...access, "otp.nonce": row.otp.nonce, "otp.delivered": true,
    "otp.expiresAt": { $gt: now }, "otp.attempts": { $lt: 5 },
  };
  const accepted = await Envelope.updateOne({ ...active, "otp.hash": hash }, {
    $set: { session: { hash: digest(sessionToken), expiresAt, verifiedAt: now } }, $unset: { otp: 1 },
  });
  if (!accepted.modifiedCount) {
    await Envelope.updateOne({ ...active, "otp.hash": { $ne: hash } }, { $inc: { "otp.attempts": 1 } });
    throw invalidCode();
  }
  return { sessionToken, expiresAt };
}

function checkedSnapshot(row: EnvelopeView, expected = row.contentHash) {
  if (!row.snapshot || !row.contentHash || row.contentHash !== expected || contentDigest(row.snapshot) !== row.contentHash)
    throw AppError.conflict("The agreement content could not be matched. Reopen and review the current agreement.");
  validateAgreementText(row.snapshot.title, row.snapshot.body);
  validateAgreementText("", row.snapshot.completion + "\n" + row.snapshot.retention.notice);
  return row.snapshot;
}

export async function clientDocument(id: string, token: string) {
  const row = await Envelope.findOne(sessionFilter(id, token, new Date())).lean();
  if (!row?.session) throw inactiveSession();
  const snapshot = checkedSnapshot(row);
  return {
    status: row.status, contentHash: row.contentHash, document: signerDocument(snapshot),
    signer: { name: snapshot.details.signerName, capacity: snapshot.details.signerCapacity },
    clientSignedAt: row.clientSignature?.signedAt, completedAt: row.completedAt,
    sessionExpiresAt: new Date(Math.min(row.session.expiresAt.getTime(), row.retentionDueAt?.getTime() ?? Infinity)),
    retentionDueAt: row.retentionDueAt, pdfHash: row.pdfHash,
  };
}

export async function acceptAgreement(id: string, token: string, input: { name: string; place: string; contentHash: string }) {
  const now = new Date();
  const access = sessionFilter(id, token, now);
  const row = await Envelope.findOne(access).lean();
  if (!row?.session) throw inactiveSession();
  if (row.status !== "awaiting-client" || row.link?.mode !== "sign") throw changed();
  const snapshot = checkedSnapshot(row, input.contentHash);
  if (input.name !== snapshot.details.signerName)
    throw AppError.badRequest("Type your name exactly as it appears on the agreement.");
  requirePrintable(input.name, input.place);
  const clientSignature: Signature = {
    name: input.name, capacity: snapshot.details.signerCapacity, place: input.place,
    signedAt: now, verifiedAt: row.session.verifiedAt,
  };
  const updated = await Envelope.updateOne({
    ...sessionFilter(id, token, new Date()), status: "awaiting-client", "link.mode": "sign",
    contentHash: input.contentHash,
  }, {
    $set: { status: "awaiting-owner", clientSignature }, $inc: { revision: 1 },
    $push: { events: event("client-signed", now) },
  });
  if (!updated.modifiedCount) throw changed();
  return { status: "awaiting-owner", clientSignedAt: now };
}

function addCalendarMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const end = new Date(next);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  next.setUTCDate(Math.min(date.getUTCDate(), end.getUTCDate()));
  return next;
}

export async function countersignAgreement(
  id: string, admin: NonNullable<Request["admin"]>,
  input: { name: string; place: string; capacity: string; contentHash: string },
) {
  const [row, owner] = await Promise.all([
    Envelope.findById(id).lean(), AdminUser.findById(admin.id).select("name").lean(),
  ]);
  if (!row) throw AppError.notFound("Agreement not found.");
  if (row.status !== "awaiting-owner" || !row.clientSignature) throw changed();
  if (!owner || input.name !== owner.name.trim())
    throw AppError.badRequest("Type the name on your owner account exactly as displayed.");
  const snapshot = checkedSnapshot(row, input.contentHash);
  requirePrintable(input.name, input.capacity, input.place);
  const now = new Date();
  const ownerSignature = {
    name: input.name, place: input.place, capacity: input.capacity, signedAt: now,
    verifiedAt: new Date(admin.mfaAt! * 1000),
  };
  const pdf = await renderSigningPdf(snapshot, input.contentHash, row.clientSignature, ownerSignature);
  const updated = await Envelope.findOneAndUpdate({
    _id: id, status: "awaiting-owner", contentHash: input.contentHash,
    "clientSignature.signedAt": row.clientSignature.signedAt,
  }, {
    $set: {
      status: "completed", ownerSignature, pdf, pdfHash: digest(pdf), completedAt: now, "link.mode": "view",
      retentionDueAt: addCalendarMonths(now, snapshot.retention.months),
    },
    $inc: { revision: 1 }, $push: { events: event("owner-signed", now, admin.id) },
  }, { new: true }).lean();
  if (!updated) throw changed();
  return staffView(updated);
}

export function staffView(row: EnvelopeView, full = false) {
  const link = row.link;
  const now = new Date();
  return {
    id: row._id, status: row.status, title: row.snapshot?.title,
    source: row.snapshot?.source, signer: row.snapshot ? {
      name: row.snapshot.details.signerName, email: row.snapshot.details.signerEmail, capacity: row.snapshot.details.signerCapacity,
    } : undefined,
    contentHash: row.contentHash, pdfHash: row.pdfHash,
    createdAt: row.createdAt, completedAt: row.completedAt, closedAt: row.closedAt, retentionDueAt: row.retentionDueAt,
    retentionDue: Boolean(row.retentionDueAt && row.retentionDueAt <= now), held: Boolean(row.held), purgedAt: row.purgedAt,
    link: link ? {
      mode: link.mode, createdAt: link.createdAt, expiresAt: link.expiresAt, revokedAt: link.revokedAt,
      status: link.revokedAt ? "revoked" : link.expiresAt <= now ? "expired" : "active",
    } : undefined,
    ...(full ? {
      document: row.snapshot && signerDocument(row.snapshot), events: row.events,
      clientSignature: row.clientSignature, ownerSignature: row.ownerSignature,
    } : {}),
  };
}

export async function manageLink(id: string, actorId: string, days?: number) {
  const row = await Envelope.findById(id).lean();
  if (!row) throw AppError.notFound("Agreement not found.");
  if (!clientStates.includes(row.status) || !row.link) throw changed();
  const now = new Date();
  if (days !== undefined) {
    await requireReady();
    retentionSnapshot(await getSecurityPolicy());
    if (!mailAvailable()) throw AppError.unavailable("Private email verification is not configured.");
    if (row.retentionDueAt && row.retentionDueAt <= now)
      throw AppError.conflict("This record is due for retention review. Client access cannot be renewed.");
  } else if (row.link.revokedAt) throw changed();
  if ((row.linkChanges ?? 0) >= 60) throw AppError.conflict("The record reached its link change limit.");
  const renewal = days === undefined ? undefined : mintLink(id, days, row.status === "completed" ? "view" : "sign", now);
  const updated = await Envelope.findOneAndUpdate({ _id: id, revision: row.revision }, {
    $set: renewal ? { link: renewal.link } : { "link.revokedAt": now },
    $unset: clearAccess, $inc: { revision: 1, linkChanges: 1 },
    $push: { events: event(renewal ? "link-renewed" : "link-revoked", now, actorId) },
  }, { new: true }).lean();
  if (!updated) throw changed();
  return { item: staffView(updated), ...(renewal ? { link: renewal.href } : {}) };
}

export async function closeAgreement(id: string, actorId: string, reason: string) {
  const row = await Envelope.findById(id).lean();
  if (!row) throw AppError.notFound("Agreement not found.");
  if (!incompleteStates.includes(row.status) || !row.snapshot) throw changed();
  const now = new Date();
  const updated = await Envelope.findOneAndUpdate({ _id: id, revision: row.revision }, {
    $set: {
      status: "closed-incomplete", closedAt: now, "link.revokedAt": row.link?.revokedAt ?? now,
      retentionDueAt: addCalendarMonths(now, row.snapshot.retention.months),
    },
    $unset: clearAccess, $inc: { revision: 1 },
    $push: { events: event("closed-incomplete", now, actorId, reason) },
  }, { new: true }).lean();
  if (!updated) throw changed();
  return staffView(updated);
}

export async function changeHold(id: string, actorId: string, held: boolean, reason: string) {
  const updated = await Envelope.findOneAndUpdate({
    _id: id, status: { $ne: "purged" }, held: { $ne: held }, holdChanges: { $lt: 120 },
  }, {
    $set: { held }, $inc: { revision: 1, holdChanges: 1 },
    $push: { events: event(held ? "hold-placed" : "hold-released", new Date(), actorId, reason) },
  }, { new: true }).lean();
  if (!updated) throw changed();
  return staffView(updated);
}

export async function purgeAgreement(id: string) {
  const row = await Envelope.findById(id).lean();
  if (!row) throw AppError.notFound("Agreement not found.");
  const now = new Date();
  if (row.held || (row.status !== "completed" && row.status !== "closed-incomplete") || !row.retentionDueAt || row.retentionDueAt > now)
    throw AppError.conflict("Only an expired record without a legal hold can be deleted.");
  const tombstone: SigningEnvelope = {
    _id: row._id, status: "purged", retentionDueAt: row.retentionDueAt, purgedAt: now,
    events: [...row.events.map(({ type, at }) => ({ type, at })), event("purged", now)],
  };
  // Replace the entire record in one conditional write, including fields introduced in a prior release.
  const collection = Envelope.db.collection<SigningEnvelope>(Envelope.collection.collectionName);
  const result = await collection.replaceOne({ _id: id, revision: row.revision }, tombstone);
  if (!result.modifiedCount) throw changed();
  return staffView(tombstone);
}

export async function executedPdf(id: string, token?: string) {
  const row = await Envelope.findOne(token ? sessionFilter(id, token, new Date()) : { _id: id }).select("+pdf");
  if (!row) throw token ? inactiveSession() : AppError.notFound("Agreement not found.");
  if (row.status !== "completed" || !row.pdf || !row.pdfHash) throw AppError.notFound("The signed PDF is not available.");
  const snapshot = checkedSnapshot(row);
  if (digest(row.pdf) !== row.pdfHash) throw AppError.conflict("The stored PDF could not be verified.");
  return { bytes: row.pdf, hash: row.pdfHash, title: snapshot.title };
}

export async function clearExpiredSigningAccess(now = new Date()) {
  await Promise.all([
    Envelope.updateMany({ "otp.expiresAt": { $lte: now } }, { $unset: { otp: 1 } }),
    Envelope.updateMany({ "session.expiresAt": { $lte: now } }, { $unset: { session: 1 } }),
    Envelope.updateMany({ lastCodeAt: { $lte: new Date(now.getTime() - minute) } }, { $unset: { lastCodeAt: 1 } }),
    DeliveryBudget.deleteMany({ expiresAt: { $lte: now } }),
  ]);
}
registerTick("signing-private-access-expiry", clearExpiredSigningAccess);
