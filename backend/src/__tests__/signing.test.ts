import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { encrypt } from "../lib/crypto.js";
import { setMailProvider, type MailMessage } from "../lib/mail/provider.js";
import { signAccessToken } from "../middleware/auth.js";
import { AdminUser } from "../modules/auth/admin.model.js";
import { BusinessDraft } from "../modules/business/documents.model.js";
import { SecurityPolicy, attestationIds } from "../modules/security/security.model.js";

let app = createApp();
const staff = "/api/v1/business/signing";
const publicPath = (id: string, action: string) => `/api/v1/signing/${id}/${action}`;
const ids = {
  owner: "400000000000000000000001",
  admin: "400000000000000000000002",
  member: "400000000000000000000003",
};
const auth = (role: keyof typeof ids = "owner", recent = true) => ({
  authorization: `Bearer ${signAccessToken({
    sub: ids[role], email: `${role}@example.test`, role, ver: 0,
    mfaAt: Math.floor(Date.now() / 1000) - (recent ? 0 : 301), mfaEnforced: true,
  })}`,
});
const retention = {
  agreementRetentionMonths: 12,
  retentionBasis: "Synthetic contract administration",
  legalHoldPolicy: "Synthetic owner review before deletion",
};
const base = {
  draftRevision: 0,
  signerName: "Amara Example",
  signerEmail: "amara@example.test",
  signerCapacity: "Director",
  sowReference: "SO-SYNTHETIC-1",
  sowDate: "2026-11-16",
  feesPaise: 123456,
  personalOrProductionData: true,
  personalDataSchedule: "Schedule A",
  personalDataScheduleDate: "2026-11-16",
  providers: [{ name: "Synthetic Processor", purpose: "Restricted processing", usesAi: false }],
  providerApprovalReference: "Approval A",
  providerApprovalDate: "2026-11-16",
  backupRetentionDays: 30,
  incidentEmail: "incident@example.test",
};
const body = [
  "1. Synthetic approved clause. Use and disclosure remain restricted.",
  "2. SOW {{agreement.sowReference}} dated {{agreement.sowDate}}. Fees: {{agreement.fees}}.",
  "3. Schedule {{agreement.personalDataSchedule}}. Processors {{agreement.providerApprovalReference}}.",
  "4. Backups: {{agreement.backupRetentionDays}} days. Notice: {{agreement.incidentEmail}}.",
  "",
  "Signatures",
  "Name: ________",
  "Title: ________",
  "Place and date: ________",
  "Signature: ________",
].join("\n");
let dir: string;
let deliveries: MailMessage[];
let draftId: string;
let failMail: boolean;
const original = { ...env };
const envelope = () => mongoose.connection.collection("signingenvelopes");
const budgets = () => mongoose.connection.collection("signingdeliverybudgets");

beforeEach(async () => {
  app = createApp();
  dir = await mkdtemp(join(tmpdir(), "maple-synthetic-signing-"));
  const backup = join(dir, "backup.json");
  const now = new Date();
  const timestamp = now.toISOString();
  await writeFile(backup, JSON.stringify({
    version: 1, lastAttemptAt: timestamp, lastSuccessAt: timestamp,
    lastUploadVerifiedAt: timestamp, lastRestoreVerifiedAt: timestamp,
    retentionDays: 30, encryption: "age", offsite: "google-drive", legacyPlaintextCleared: true, ok: true,
  }), { mode: 0o600 });
  Object.assign(env, { MFA_REQUIRED: true, BACKUP_STATUS_PATH: backup, MAIL_FROM_EMAIL: "mail@example.test" });
  await AdminUser.insertMany(Object.entries(ids).map(([role, _id]) => ({
    _id, name: role === "owner" ? "Owner Example" : role, role, email: `${role}@example.test`,
    passwordHash: "unused", mfaEnrolledAt: now, mfaSecretEnc: encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"),
    mfaRecoveryHashes: ["a".repeat(64)], mfaRecoveryLastUsedAt: now,
  })));
  await SecurityPolicy.create({
    _id: "studio", ...retention,
    attestations: attestationIds.map(id => ({
      id, scope: "Synthetic readiness", confirmedAt: now,
      confirmedBy: { id: ids.owner, email: "owner@example.test" },
    })),
  });
  const draft = await BusinessDraft.create({
    projectId: "500000000000000000000001", clientId: "500000000000000000000002",
    kind: "confidentiality", title: "Synthetic data and confidentiality agreement", body,
    snapshot: {
      templateId: "500000000000000000000003", templateRevision: 1,
      company: { name: "Synthetic Studio", legalName: "Synthetic Studio Ltd", bankAccount: "00000000000000" },
      client: { name: "Synthetic Client Ltd" },
    },
  });
  draftId = String(draft._id);
  failMail = false;
  deliveries = [];
  setMailProvider({
    name: "resend",
    async send(mail) {
      deliveries.push(mail);
      if (failMail) throw new Error("Synthetic delivery rejected");
      return { id: "fake" };
    },
  });
});
afterEach(async () => {
  Object.assign(env, original);
  setMailProvider(null);
  await rm(dir, { recursive: true, force: true });
});

const preview = (fields: Record<string, unknown> = {}, role: keyof typeof ids = "owner") =>
  request(app).post(staff + "/preview").set(auth(role)).send({ ...base, draftId, ...fields });
async function issue(fields: Record<string, unknown> = {}) {
  const p = await preview(fields);
  expect(p.status, p.text).toBe(200);
  const r = await request(app).post(staff).set(auth("admin")).send({
    ...base, draftId, ...fields, previewHash: p.body.contentHash,
  });
  expect(r.status, r.text).toBe(201);
  const link = new URL(r.body.link);
  expect(link.pathname).toBe(`/sign/${r.body.item.id}`);
  expect(link.search).toBe("");
  return { id: r.body.item.id as string, secret: link.hash.slice(1), hash: p.body.contentHash as string };
}
const codeRequest = ({ id, secret }: { id: string; secret: string }, fields: Record<string, unknown> = {}) =>
  request(app).post(publicPath(id, "code")).send({ secret, ...fields });
const capturedCode = () => {
  const code = /\b\d{6}\b/.exec(deliveries.at(-1)?.text ?? "")?.[0];
  if (!code) throw new Error("Fake transport received no six-digit code");
  return code;
};
const verify = ({ id, secret }: { id: string; secret: string }, code: string) =>
  request(app).post(publicPath(id, "verify")).send({ secret, code });
const session = (token: string) => ({ authorization: `Bearer ${token}` });
const getDocument = (id: string, token: string) =>
  request(app).get(publicPath(id, "document")).set(session(token));
const sign = (id: string, token: string, hash: string, fields = {}) =>
  request(app).post(publicPath(id, "sign")).set(session(token)).send({
    contentHash: hash, name: base.signerName, consent: true, ...fields,
  });
const counter = (id: string, hash: string, role: keyof typeof ids = "owner", recent = true) =>
  request(app).post(staff + `/${id}/countersign`).set(auth(role, recent)).send({
    contentHash: hash, name: "Owner Example", capacity: "Director", consent: true,
  });
const pdf = (id: string, token: string) =>
  request(app).get(publicPath(id, "pdf")).set(session(token)).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => done(null, Buffer.concat(chunks)));
  });

it("restricts staff routes to individual owners and admins", async () => {
  for (const role of ["owner", "admin"] as const) {
    expect((await request(app).get(staff).set(auth(role))).status).toBe(200);
    expect((await preview({}, role)).status).toBe(200);
  }
  expect((await request(app).get(staff).set(auth("member"))).status).toBe(403);
  expect((await preview({}, "member")).status).toBe(403);
  expect((await request(app).get(staff)).status).toBe(401);
  Object.assign(env, { MFA_REQUIRED: false, legacyAdminKey: "synthetic" });
  expect((await request(app).get(staff).set("x-admin-key", "synthetic")).status).toBe(403);
});

it("gates issuing on real readiness and an explicit retention policy separately", async () => {
  const p = await preview();
  expect(p.status).toBe(200);
  const send = () => request(app).post(staff).set(auth()).send({ ...base, draftId, previewHash: p.body.contentHash });
  await SecurityPolicy.updateOne({ _id: "studio" }, { $set: { attestations: [] } });
  expect((await send()).status).toBe(409);
  await SecurityPolicy.updateOne({ _id: "studio" }, { $set: {
    attestations: attestationIds.map(id => ({ id, scope: "Test", confirmedAt: new Date(), confirmedBy: { id: ids.owner, email: "owner@example.test" } })),
    agreementRetentionMonths: null,
  } });
  expect((await send()).body).toMatchObject({ code: "SIGNING_RETENTION_REQUIRED" });
});

it("requires structured completion, rejects raw reminders, and pins the preview to a draft revision", async () => {
  for (const missing of [
    { feesPaise: 1.5 }, { sowDate: "2026-02-31" }, { signerName: "" },
    { personalDataSchedule: "" }, { providerApprovalReference: "" },
    { incidentEmail: "wrong" }, { linkDays: 31 },
  ]) expect((await preview(missing)).status).toBe(400);
  const p = await preview();
  expect(p.body.document.body).toContain("Fees: INR 1,234.56.");
  expect(p.body.document.body).toContain("Name: ________");
  await BusinessDraft.updateOne({ _id: draftId }, { $set: { body: body.replace("Fees: {{agreement.fees}}.", "Fees: ________") } });
  expect((await preview()).status).toBe(400);
  await BusinessDraft.updateOne({ _id: draftId }, { $set: { body: body + "\n[Complete manually before signing.]" } });
  expect((await preview()).status).toBe(400);
  await BusinessDraft.updateOne({ _id: draftId }, { $set: { body }, $inc: { revision: 1 } });
  const issued = await request(app).post(staff).set(auth()).send({ ...base, draftId, previewHash: p.body.contentHash });
  expect(issued.status).toBe(409);
});

it("sends a code only to the frozen recipient, keeps responses clean and invalidates failed deliveries", async () => {
  const link = await issue();
  expect((await codeRequest(link, { email: "intruder@example.test" })).status).toBe(400);
  expect(deliveries).toHaveLength(0);
  failMail = true;
  expect((await codeRequest(link)).status).toBe(503);
  expect(deliveries[0]?.to).toBe(base.signerEmail);
  expect((await verify(link, capturedCode())).status).toBe(401);
  failMail = false;
  await envelope().updateOne({ _id: link.id }, { $set: { lastCodeAt: new Date(Date.now() - 61_000) } });
  const response = await codeRequest(link);
  expect(response.status, response.text).toBe(200);
  const issued = capturedCode();
  expect(response.text).not.toContain(issued);
  expect(response.text).not.toContain(base.signerEmail);
  const row = await envelope().findOne({ _id: link.id });
  expect(JSON.stringify(row)).not.toContain(issued);
  expect(JSON.stringify(row)).not.toContain(link.secret);
});

it("refuses dry-run mail at issuing", async () => {
  const p = await preview();
  setMailProvider({ name: "dry-run", async send() { throw new Error("Must never call a dry-run signing transport"); } });
  const response = await request(app).post(staff).set(auth()).send({ ...base, draftId, previewHash: p.body.contentHash });
  expect(response.status).toBe(503);
});

it("rejects a bad secret, expired link, revoked link and a session from another envelope or old link", async () => {
  const link = await issue();
  expect((await codeRequest({ ...link, secret: "A".repeat(43) })).status).toBe(404);
  expect((await codeRequest(link)).status).toBe(200);
  const verified = await verify(link, capturedCode());
  expect(verified.status, verified.text).toBe(200);
  const token = verified.body.sessionToken as string;
  const other = await issue({ signerEmail: "other@example.test" });
  expect((await getDocument(other.id, token)).status).toBe(401);
  await envelope().updateOne({ _id: other.id }, { $set: { "link.expiresAt": new Date(Date.now() - 1000) } });
  expect((await codeRequest(other)).status).toBe(404);
  expect((await request(app).delete(staff + `/${link.id}/link`).set(auth("admin"))).status).toBe(200);
  expect((await codeRequest(link)).status).toBe(404);
  const reissued = await request(app).post(staff + `/${link.id}/link`).set(auth("admin")).send({ days: 3 });
  expect(reissued.status).toBe(200);
  expect((await getDocument(link.id, token)).status).toBe(401);
});

it("persists resend cooldown and fifth-attempt exhaustion when the app restarts", async () => {
  const link = await issue();
  expect((await codeRequest(link)).status).toBe(200);
  const code = capturedCode();
  const bad = code === "999999" ? "111111" : "999999";
  const results = await Promise.all(Array.from({ length: 4 }, () => verify(link, bad)));
  expect(results.map(r => r.status)).toEqual([401, 401, 401, 401]);
  app = createApp();
  expect((await codeRequest(link)).status).toBe(429);
  expect((await verify(link, bad)).status).toBe(401);
  expect((await verify(link, code)).status).toBe(401);
});

it("persists per-recipient and global send budgets across app restarts", async () => {
  for (let n = 0; n < 5; n++) expect((await codeRequest(await issue())).status).toBe(200);
  app = createApp();
  expect((await codeRequest(await issue())).status).toBe(429);
  expect(deliveries).toHaveLength(5);
  await budgets().updateMany({ _id: /^global:/ }, { $set: { count: 100 } });
  const unrelated = await issue({ signerEmail: "unrelated@example.test" });
  expect((await codeRequest(unrelated)).status).toBe(429);
  expect(deliveries).toHaveLength(5);
});

it("expires OTPs and signing sessions across app restarts", async () => {
  const expiredCode = await issue();
  expect((await codeRequest(expiredCode)).status).toBe(200);
  await envelope().updateOne({ _id: expiredCode.id }, { $set: { "otp.expiresAt": new Date(Date.now() - 1000) } });
  app = createApp();
  expect((await verify(expiredCode, capturedCode())).status).toBe(401);
  const expiredSession = await issue();
  await codeRequest(expiredSession);
  const accepted = await verify(expiredSession, capturedCode());
  expect(accepted.status).toBe(200);
  await envelope().updateOne({ _id: expiredSession.id }, { $set: { "session.expiresAt": new Date(Date.now() - 1000) } });
  expect((await getDocument(expiredSession.id, accepted.body.sessionToken)).status).toBe(401);
});

it("consumes the OTP and explicit client acceptance once under concurrency and freezes source edits", async () => {
  const link = await issue();
  await BusinessDraft.updateOne({ _id: draftId }, { $set: { body: "Source edited after issue" }, $inc: { revision: 1 } });
  await codeRequest(link);
  const code = capturedCode();
  const verified = await Promise.all([verify(link, code), verify(link, code)]);
  expect(verified.map(r => r.status).sort()).toEqual([200, 401]);
  const token = verified.find(r => r.status === 200)!.body.sessionToken;
  const doc = await getDocument(link.id, token);
  expect(doc.body).toMatchObject({ contentHash: link.hash, status: "awaiting-client" });
  expect(doc.body.document.body).toContain("Synthetic approved clause");
  expect(doc.text).not.toContain("00000000000000");
  expect((await sign(link.id, token, "a".repeat(64))).status).toBe(409);
  expect((await sign(link.id, token, link.hash, { name: "Someone else" })).status).toBe(400);
  expect((await sign(link.id, token, link.hash, { consent: false })).status).toBe(400);
  const results = await Promise.all([sign(link.id, token, link.hash), sign(link.id, token, link.hash)]);
  expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  expect((await counter(link.id, link.hash, "admin")).status).toBe(403);
  expect((await counter(link.id, link.hash, "owner", false)).body).toMatchObject({ code: "RECENT_MFA_REQUIRED" });
  expect((await counter(link.id, "a".repeat(64))).status).toBe(409);
  const counters = await Promise.all([counter(link.id, link.hash), counter(link.id, link.hash)]);
  expect(counters.map(r => r.status).sort()).toEqual([200, 409]);
  const download = await pdf(link.id, token);
  expect(download.status).toBe(200);
  expect(download.headers["content-type"]).toMatch(/^application\/pdf/);
  expect(download.body.subarray(0, 5).toString()).toBe("%PDF-");
  const record = counters.find(r => r.status === 200)!.body.item;
  expect(record.contentHash).toBe(link.hash);
  expect(record.pdfHash).toBe(createHash("sha256").update(download.body).digest("hex"));
});

it("renews a completed record as view-only and enforces holds and auditable retention purge", async () => {
  const link = await issue();
  await codeRequest(link);
  const verified = await verify(link, capturedCode());
  await sign(link.id, verified.body.sessionToken, link.hash);
  const completed = await counter(link.id, link.hash);
  expect(completed.status, completed.text).toBe(200);
  const remove = () => request(app).post(staff + `/${link.id}/purge`).set(auth()).send({ confirm: true });
  expect((await remove()).status).toBe(409);
  const refreshed = await request(app).post(staff + `/${link.id}/link`).set(auth()).send({ days: 7 });
  expect(refreshed.body.item.link.mode).toBe("view");
  const newLink = { id: link.id, secret: new URL(refreshed.body.link).hash.slice(1) };
  expect((await codeRequest(newLink)).status).toBe(429); // rotation cannot reset resend cooldown
  await envelope().updateOne({ _id: link.id }, { $set: { lastCodeAt: new Date(Date.now() - 61_000) } });
  expect((await codeRequest(newLink)).status).toBe(200);
  const downloadSession = await verify(newLink, capturedCode());
  expect((await sign(link.id, downloadSession.body.sessionToken, link.hash)).status).toBe(409);
  expect((await pdf(link.id, downloadSession.body.sessionToken)).status).toBe(200);
  const hold = (held: boolean) => request(app).patch(staff + `/${link.id}/hold`).set(auth()).send({ held, reason: "Synthetic hold reason" });
  expect((await hold(true)).status).toBe(200);
  await envelope().updateOne({ _id: link.id }, { $set: { retentionDueAt: new Date(Date.now() - 1000) } });
  expect((await pdf(link.id, downloadSession.body.sessionToken)).status).toBe(401);
  expect((await request(app).get(staff + `/${link.id}`).set(auth("admin"))).body.item).toMatchObject({ retentionDue: true, held: true });
  expect((await remove()).status).toBe(409);
  expect((await hold(false)).status).toBe(200);
  expect((await remove()).status).toBe(200);
  const row = await envelope().findOne({ _id: link.id });
  expect(Object.keys(row!).sort()).toEqual(["_id", "events", "purgedAt", "retentionDueAt", "status"]);
  const serialized = JSON.stringify(row);
  for (const privateValue of [base.signerName, base.signerEmail, link.hash, "Synthetic hold reason", ids.owner, "Synthetic approved clause"])
    expect(serialized).not.toContain(privateValue);
  expect(row?.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "purged" }), expect.objectContaining({ type: "hold-released" })]));
});

it("closes incomplete records explicitly, without changing them into completed agreements", async () => {
  const link = await issue();
  const close = (role: keyof typeof ids, reason: string) =>
    request(app).post(staff + `/${link.id}/close`).set(auth(role)).send({ reason });
  expect((await close("admin", "Synthetic reason")).status).toBe(403);
  expect((await close("owner", "")).status).toBe(400);
  const closed = await close("owner", "Synthetic reason");
  expect(closed.body.item).toMatchObject({ status: "closed-incomplete", retentionDueAt: expect.any(String) });
  expect((await codeRequest(link)).status).toBe(404);
  expect((await request(app).post(staff + `/${link.id}/link`).set(auth()).send({ days: 7 })).status).toBe(409);
  expect((await counter(link.id, link.hash)).status).toBe(409);
});

it("blocks public verification through the generic proxy, including encoded aliases", async () => {
  const { POST } = await import("../../../src/app/api/v2/[...path]/route");
  const url = "http://localhost/api/v2/signing/1234567890abcdef12345678/verify";
  for (const namespace of ["signing", "sIgNiNg", "%73igning"]) {
    const result = await POST(new Request(url, { method: "POST", body: "{}" }), {
      params: Promise.resolve({ path: [namespace, "1234567890abcdef12345678", "verify"] }),
    });
    expect(result.status).toBe(404);
  }
});

it("requires same origin for public mutations and moves the verified token into a scoped cookie", async () => {
  const handler = await import("../../../src/app/api/sign/[...path]/route");
  const link = await issue();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const originalOrigin = process.env.GROWTH_API_ORIGIN;
  process.env.GROWTH_API_ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const context = (action: string) => ({ params: Promise.resolve({ path: [link.id, action] }) });
  function call(action: string, body?: object, origin?: string, cookie?: string) {
    return new Request(`https://localhost/api/sign/${link.id}/${action}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(origin ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  try {
    for (const origin of [undefined, "https://other.example"]) {
      const denied = await handler.POST(call("code", { secret: link.secret }, origin), context("code"));
      expect(denied.status).toBe(403);
    }
    expect(deliveries).toHaveLength(0);
    const sent = await handler.POST(call("code", { secret: link.secret }, "https://localhost"), context("code"));
    expect(sent.status).toBe(200);
    const signedSession = await handler.POST(call("verify", { secret: link.secret, code: capturedCode() }, "https://localhost"), context("verify"));
    expect(signedSession.status).toBe(200);
    const cookie = signedSession.cookies.get("__Secure-maple-signing");
    expect(cookie).toMatchObject({
      httpOnly: true, secure: true, sameSite: "strict", path: `/api/sign/${link.id}`, maxAge: 900,
    });
    expect(await signedSession.json()).toEqual({ expiresAt: expect.any(String) });
    expect(signedSession.headers.get("Cache-Control")).toBe("no-store");
    expect((await handler.GET(call("document"), context("document"))).status).toBe(401);
    const cookieHeader = `${cookie.name}=${cookie.value}`;
    expect((await handler.GET(call("document", undefined, undefined, cookieHeader), context("document"))).status).toBe(200);
    expect((await handler.POST(call("sign", { name: base.signerName, contentHash: link.hash, consent: true }, "https://other.example", cookieHeader), context("sign"))).status).toBe(403);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (originalOrigin) process.env.GROWTH_API_ORIGIN = originalOrigin;
    else delete process.env.GROWTH_API_ORIGIN;
  }
});

it("prevents link renewal when the current retention policy is cleared", async () => {
  const link = await issue();
  await SecurityPolicy.updateOne({ _id: "studio" }, { $set: { agreementRetentionMonths: null } });
  const result = await request(app).post(staff + `/${link.id}/link`).set(auth()).send({ days: 7 });
  expect(result.body).toMatchObject({ code: "SIGNING_RETENTION_REQUIRED" });
  expect((await codeRequest(link)).status).toBe(200);
});

it("cannot sign an altered snapshot or download altered executed bytes", async () => {
  const link = await issue();
  await codeRequest(link);
  const verified = await verify(link, capturedCode());
  const token = verified.body.sessionToken;
  const row = await envelope().findOne({ _id: link.id });
  await envelope().updateOne({ _id: link.id }, { $set: { "snapshot.body": "Synthetic changed content" } });
  expect((await sign(link.id, token, link.hash)).status).toBe(409);
  await envelope().updateOne({ _id: link.id }, { $set: { snapshot: row!.snapshot } });
  expect((await sign(link.id, token, link.hash)).status).toBe(200);
  expect((await counter(link.id, link.hash)).status).toBe(200);
  await envelope().updateOne({ _id: link.id }, { $set: { pdf: Buffer.from("%PDF- changed bytes") } });
  expect((await pdf(link.id, token)).status).toBe(409);
});
