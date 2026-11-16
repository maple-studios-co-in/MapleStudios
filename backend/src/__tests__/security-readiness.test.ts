import { mkdtemp, rm, writeFile, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { signAccessToken } from "../middleware/auth.js";
import { AdminUser } from "../modules/auth/admin.model.js";
import { encrypt } from "../lib/crypto.js";

const app = createApp();
const security = "/api/v1/security";
const templates = "/api/v1/business/templates";
const ids = { owner: "300000000000000000000001", admin: "300000000000000000000002", member: "300000000000000000000003" };
const auth = (role: keyof typeof ids = "owner") => ({
  authorization: `Bearer ${signAccessToken({ sub: ids[role], email: `${role}@example.test`, role, ver: 0, mfaAt: Math.floor(Date.now() / 1000), mfaEnforced: true })}`,
});
const evidence = () => {
  const now = new Date().toISOString();
  return {
    version: 1, lastAttemptAt: now, lastSuccessAt: now, lastUploadVerifiedAt: now, lastRestoreVerifiedAt: now,
    retentionDays: 30, encryption: "age", offsite: "google-drive", legacyPlaintextCleared: true, ok: true,
  };
};
const attestationIds = ["devices", "staff-confidentiality", "offboarding", "cloud-mfa", "provider-permissions", "incident-response"];
const nda = { name: "Synthetic NDA", kind: "confidentiality", body: "Synthetic mutual obligations.", status: "published", revision: 0 };
let dir: string;
let backupPath: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "maple-readiness-"));
  backupPath = join(dir, "backup.json");
  Object.assign(env, { BACKUP_STATUS_PATH: backupPath, MFA_REQUIRED: true, legacyAdminKey: undefined });
  await AdminUser.insertMany(Object.entries(ids).map(([role, _id]) => ({
    _id, name: role, role, email: `${role}@example.test`, passwordHash: "unused",
    mfaEnrolledAt: new Date(), mfaSecretEnc: encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"),
    mfaRecoveryHashes: ["a".repeat(64)], mfaRecoveryLastUsedAt: new Date(),
  })));
});
afterEach(async () => {
  Object.assign(env, { BACKUP_STATUS_PATH: undefined, MFA_REQUIRED: false, legacyAdminKey: undefined });
  await rm(dir, { recursive: true, force: true });
});
const get = () => request(app).get(security + "/readiness").set(auth());
const publish = (input = nda) => request(app).put(templates).set(auth()).send(input);
const write = (status = evidence()) => writeFile(backupPath, JSON.stringify(status), { mode: 0o600 });

it("only allows an individual owner to inspect readiness or edit policy", async () => {
  for (const role of ["admin", "member"] as const) {
    expect((await request(app).get(security + "/readiness").set(auth(role))).status).toBe(403);
    expect((await request(app).patch(security + "/policy").set(auth(role)).send({ revision: 0 })).status).toBe(403);
  }
  expect((await request(app).get(security + "/readiness")).status).toBe(401);
});

it("fails closed for missing, permissive, stale, failed or symlinked backup evidence", async () => {
  expect((await get()).body.ready).toBe(false);
  await write();
  await chmod(backupPath, 0o644);
  expect((await get()).body.checks).toContainEqual(expect.objectContaining({ id: "backup-upload", ok: false }));
  await chmod(backupPath, 0o600);
  await write({ ...evidence(), lastUploadVerifiedAt: new Date(Date.now() - 27 * 3600_000).toISOString() });
  expect((await get()).body.checks).toContainEqual(expect.objectContaining({ id: "backup-upload", ok: false }));
  const failed = { ...evidence(), ok: false, error: "this must not be returned" };
  await write(failed);
  const report = await get();
  expect(report.body.checks).toContainEqual(expect.objectContaining({ id: "backup-upload", ok: false }));
  expect(report.text).not.toContain(failed.error);
  await rm(backupPath);
  const target = join(dir, "target");
  await writeFile(target, JSON.stringify(evidence()), { mode: 0o600 });
  await symlink(target, backupPath);
  expect((await get()).body.checks).toContainEqual(expect.objectContaining({ id: "backup-upload", ok: false }));
});

it("requires observed backup and account state plus attributed owner attestations to publish an NDA, without gating other templates or invoices", async () => {
  await write();
  expect((await publish()).status).toBe(409);
  expect((await publish({ ...nda, kind: "onboarding" })).status).toBe(201);
  const patch = await request(app).patch(security + "/policy").set(auth()).send({
    revision: 0, attestations: attestationIds.map(id => ({ id, confirmed: true, scope: "Synthetic authorised roles and devices" })),
  });
  expect(patch.status).toBe(200);
  expect(patch.body.policy.attestations.devices).toMatchObject({
    confirmedBy: { id: ids.owner, email: "owner@example.test" }, confirmedAt: expect.any(String),
  });
  expect((await request(app).patch(security + "/policy").set(auth()).send({ revision: 0, agreementRetentionMonths: 36 })).status).toBe(409);
  expect((await get()).body).toMatchObject({
    ready: true, policy: { agreementRetentionMonths: null, retentionBasis: "", legalHoldPolicy: "" },
  });
  expect((await publish()).status).toBe(201);
  await write({ ...evidence(), legacyPlaintextCleared: false });
  expect((await publish()).status).toBe(409);
});

it("rejects client assertions of observed checks", async () => {
  const res = await request(app).patch(security + "/policy").set(auth()).send({ revision: 0, backupVerified: true });
  expect(res.status).toBe(400);
});

it("requires a tested recovery path before the first cutover and prevents accidental rollback", async () => {
  const { assertMfaCutover } = await import("../modules/security/security.service.js");
  await AdminUser.updateOne({ _id: ids.owner }, { $unset: { mfaRecoveryLastUsedAt: 1 } });
  await expect(assertMfaCutover()).rejects.toThrow(/recovery/);
  await AdminUser.updateOne({ _id: ids.owner }, { $set: { mfaRecoveryLastUsedAt: new Date() } });
  await expect(assertMfaCutover()).resolves.toBeUndefined();
  Object.assign(env, { MFA_REQUIRED: false });
  await expect(assertMfaCutover()).rejects.toThrow(/already enforced/);
});
