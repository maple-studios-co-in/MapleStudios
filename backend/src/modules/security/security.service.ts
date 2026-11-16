import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/AppError.js";
import { decrypt } from "../../lib/crypto.js";
import { AdminUser } from "../auth/admin.model.js";
import { SecurityPolicy, attestationIds, type Attestation, type AttestationId } from "./security.model.js";

const statusDate = z.string().datetime({ offset: true }).nullable();
const backupSchema = z.object({
  version: z.literal(1),
  lastAttemptAt: statusDate,
  lastSuccessAt: statusDate,
  lastUploadVerifiedAt: statusDate,
  lastRestoreVerifiedAt: statusDate,
  retentionDays: z.literal(30),
  encryption: z.literal("age"),
  offsite: z.literal("google-drive"),
  legacyPlaintextCleared: z.boolean(),
  ok: z.boolean(),
  error: z.string().max(1024).optional(),
});
const MAX_BACKUP_STATUS_BYTES = 4096;
async function readBackupStatus() {
  if (!env.BACKUP_STATUS_PATH) return null;
  try {
    const file = await open(env.BACKUP_STATUS_PATH, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      // The service account may read via a restricted group, but the summary
      // cannot be group-writable or accessible to unrelated accounts.
      if (!stat.isFile() || stat.size > MAX_BACKUP_STATUS_BYTES || (stat.mode & 0o137) !== 0)
        return null;
      const buffer = Buffer.alloc(MAX_BACKUP_STATUS_BYTES + 1);
      const { bytesRead } = await file.read(buffer);
      if (bytesRead > MAX_BACKUP_STATUS_BYTES) return null;
      return backupSchema.parse(JSON.parse(buffer.toString("utf8", 0, bytesRead)));
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}

const recent = (at: string | null | undefined, maxAge: number, now: number): boolean => {
  if (!at) return false;
  const age = now - Date.parse(at);
  return age >= 0 && age <= maxAge;
};
const auditWire = (a: Attestation) => ({
  scope: a.scope, confirmedAt: a.confirmedAt.toISOString(), confirmedBy: { id: a.confirmedBy.id, email: a.confirmedBy.email },
});
export async function getSecurityPolicy() {
  const doc = await SecurityPolicy.findById("studio").lean();
  return {
    revision: doc?.revision ?? 0,
    agreementRetentionMonths: doc?.agreementRetentionMonths ?? null,
    retentionBasis: doc?.retentionBasis ?? "",
    legalHoldPolicy: doc?.legalHoldPolicy ?? "",
    attestations: Object.fromEntries((doc?.attestations ?? []).map(a => [a.id, auditWire(a)])) as Partial<Record<AttestationId, ReturnType<typeof auditWire>>>,
  };
}

const active = { active: { $ne: false } } as const;
async function ownersWithRecovery() {
  const matches = await AdminUser.find({
    ...active, role: "owner", mfaEnrolledAt: { $type: "date" }, "mfaRecoveryHashes.0": { $exists: true },
  }).select("+mfaSecretEnc +mfaRecoveryLastUsedAt").lean();
  return matches.filter(account => {
    try {
      return !!account.mfaSecretEnc && /^[A-Z2-7]{32}$/.test(decrypt(account.mfaSecretEnc))
        && !!account.mfaRecoveryLastUsedAt && !!account.mfaEnrolledAt
        && account.mfaRecoveryLastUsedAt >= account.mfaEnrolledAt
        && account.mfaRecoveryLastUsedAt <= new Date();
    } catch {
      return false;
    }
  }).length;
}

/** Enabling enforcement is deliberate and must not strand the only owner. */
export async function assertMfaCutover() {
  const doc = await SecurityPolicy.findById("studio").select("+mfaEnforcedAt").lean();
  if (doc?.mfaEnforcedAt) {
    if (!env.MFA_REQUIRED) throw new Error("MFA was already enforced. Restore MFA_REQUIRED=true before starting.");
    return;
  }
  if (!env.MFA_REQUIRED) return;
  if (!(await ownersWithRecovery()))
    throw new Error("Enrol an active owner, safely store recovery codes, and test one recovery login before enabling MFA_REQUIRED.");
  await SecurityPolicy.updateOne(
    { _id: "studio" },
    { $set: { mfaEnforcedAt: new Date() } },
    { upsert: true },
  );
}

type Check = { id: string; ok: boolean; detail: string };
export async function getReadiness() {
  const [policy, backup, owners, total, enrolled] = await Promise.all([
    getSecurityPolicy(),
    readBackupStatus(),
    ownersWithRecovery(),
    AdminUser.countDocuments(active),
    AdminUser.countDocuments({ ...active, mfaEnrolledAt: { $type: "date" } }),
  ]);
  const now = Date.now();
  const maxBackupAge = 26 * 60 * 60 * 1000;
  const checks: Check[] = [
    { id: "mfa-enforcement", ok: env.MFA_REQUIRED, detail: env.MFA_REQUIRED
      ? `Enforced. ${enrolled} of ${total} active accounts enrolled; others can only enrol.`
      : `Enrolment period. ${enrolled} of ${total} active accounts enrolled.` },
    { id: "owner-mfa", ok: owners > 0, detail: owners > 0
      ? `${owners} active owner account(s) have an enrolled authenticator, a recorded recovery login, and unused recovery codes.`
      : "No active owner has verified recovery for their current authenticator with codes still available." },
    { id: "backup-upload", ok: !!backup?.ok
      && recent(backup.lastAttemptAt, maxBackupAge, now)
      && recent(backup.lastSuccessAt, maxBackupAge, now)
      && recent(backup.lastUploadVerifiedAt, maxBackupAge, now), detail: backup?.lastUploadVerifiedAt
      ? `Last verified upload: ${backup.lastUploadVerifiedAt}. Latest job: ${backup.ok ? "reported successful" : "failed"}.`
      : "No valid private evidence of a verified offsite upload." },
    { id: "backup-retention", ok: Boolean(backup?.ok), detail: backup
      ? "The backup job reports a 30-day maximum for encrypted local and Google Drive backups."
      : "No valid backup retention evidence." },
    { id: "backup-restore", ok: recent(backup?.lastRestoreVerifiedAt, 31 * 86_400_000, now), detail: backup?.lastRestoreVerifiedAt
      ? `Last isolated restore verification: ${backup.lastRestoreVerifiedAt}.`
      : "No verified isolated restore. Upload integrity does not prove recovery." },
    { id: "backup-legacy", ok: backup?.legacyPlaintextCleared === true, detail: backup?.legacyPlaintextCleared
      ? "The recovery workflow reports that inventoried plaintext backups were addressed."
      : "Legacy plaintext backup cleanup is not verified." },
    ...attestationIds.map(id => ({
      id: `attestation:${id}`, ok: Boolean(policy.attestations[id]),
      detail: policy.attestations[id] ? "Recorded owner attestation." : "Owner attestation required.",
    })),
  ];
  return { ready: checks.every(check => check.ok), checks, policy };
}

export async function requireReady() {
  const report = await getReadiness();
  if (!report.ready)
    throw AppError.conflict("Studio security readiness is incomplete. Review the checks under Security.");
}

export const policyInput = z.object({
  revision: z.number().int().min(0),
  agreementRetentionMonths: z.number().int().positive().max(1200).nullable().optional(),
  retentionBasis: z.string().trim().max(1500).optional(),
  legalHoldPolicy: z.string().trim().max(1500).optional(),
  attestations: z.array(z.object({
    id: z.enum(attestationIds), scope: z.string().trim().min(1).max(400), confirmed: z.boolean(),
  }).strict()).min(1).max(attestationIds.length)
    .refine(v => new Set(v.map(a => a.id)).size === v.length, "Use each attestation once per request.").optional(),
}).strict().refine(v => Object.keys(v).length > 1, "Provide a policy change.");

export async function updatePolicy(input: z.infer<typeof policyInput>, actor: { id: string; email: string }) {
  const { revision, attestations, ...patch } = input;
  const current = await SecurityPolicy.findById("studio").lean();
  if ((current?.revision ?? 0) !== revision)
    throw AppError.conflict("Security policy changed. Reload and try again.");
  const latest = new Map((current?.attestations ?? []).map(a => [a.id, a]));
  const events = (attestations ?? []).map(a => ({
    ...a, confirmedBy: actor, confirmedAt: new Date(), revision: revision + 1,
  }));
  for (const { confirmed, revision: _revision, ...event } of events) {
    if (confirmed) latest.set(event.id, event);
    else latest.delete(event.id);
  }
  const doc = await SecurityPolicy.findOneAndUpdate(
    { _id: "studio", revision },
    {
      $set: { ...patch, attestations: [...latest.values()] },
      $inc: { revision: 1 },
      ...(events.length ? { $push: { attestationHistory: { $each: events } } } : {}),
    },
    { new: true, upsert: !current },
  );
  if (!doc) throw AppError.conflict("Security policy changed. Reload and try again.");
  return getSecurityPolicy();
}
