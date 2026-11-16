import request from "supertest";
import { generate } from "otplib";
import { beforeEach, afterEach, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { encrypt } from "../lib/crypto.js";
import { AdminUser, hashPassword } from "../modules/auth/admin.model.js";
import { signAccessToken, signRefreshToken } from "../middleware/auth.js";

const app = createApp();
const base = "/api/v1/auth";
const credentials = { email: "owner@example.test", password: "synthetic-owner-password" };
const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
let id: string;

beforeEach(async () => {
  const account = await AdminUser.create({
    email: credentials.email, name: "Owner", role: "owner",
    passwordHash: await hashPassword(credentials.password),
  });
  id = account.id;
});
afterEach(() => { Object.assign(env, { MFA_REQUIRED: false }); });
const login = (body = credentials) => request(app).post(base + "/login").send(body);
const post = (path: string, token: string, body: object) =>
  request(app).post(base + path).auth(token, { type: "bearer" }).send(body);
const get = (path: string, token: string) => request(app).get(path).auth(token, { type: "bearer" });
const code = (value = secret, epoch = Date.now() / 1000) => generate({ secret: value, epoch });

async function syntheticEnrolled() {
  await AdminUser.collection.updateOne({ email: credentials.email }, {
    $set: { mfaSecretEnc: encrypt(secret), mfaEnrolledAt: new Date() },
  });
}
async function enrol(token: string) {
  const start = await post("/mfa/enrolment/start", token, { password: credentials.password });
  expect(start.status).toBe(200);
  expect(start.body.manualKey).toMatch(/^[A-Z2-7]{32}$/);
  const verified = await post("/mfa/enrolment/prove", token, {
    code: await code(start.body.manualKey),
  });
  expect(verified.status).toBe(200);
  expect(verified.body.recoveryCodes).toHaveLength(10);
  expect((await post("/mfa/enrolment/confirm", token, { savedRecoveryCodes: false })).status).toBe(400);
  const confirm = await post("/mfa/enrolment/confirm", token, { savedRecoveryCodes: true });
  expect(confirm.status).toBe(200);
  return { confirm, verified };
}

it("stages unenrolled users, but enforcement invalidates password-only access and refresh", async () => {
  const before = await login();
  expect(before.body.token).toBeTruthy();
  Object.assign(env, { MFA_REQUIRED: true });
  expect((await get("/api/v1/auth/me", before.body.token)).status).toBe(401);
  expect((await request(app).post(base + "/refresh").send({ refreshToken: before.body.refreshToken })).status).toBe(401);
  const staged = await login();
  expect(staged.body.state).toBe("enrolment_required");
  expect(staged.body.token).toBeUndefined();
  expect(staged.body.refreshToken).toBeUndefined();
  for (const path of ["/api/v1/business/company", "/api/v1/team/payroll", "/api/v1/admin/summary", "/api/v1/auth/me"]) {
    expect((await get(path, staged.body.pendingToken)).status).toBe(401);
  }
  const { confirm } = await enrol(staged.body.pendingToken);
  expect((await get("/api/v1/auth/me", confirm.body.token)).status).toBe(200);
});

it("requires password then MFA for enrolled accounts even during staging", async () => {
  const before = await login();
  await syntheticEnrolled();
  expect((await get("/api/v1/auth/me", before.body.token)).status).toBe(401);
  expect((await request(app).post(base + "/refresh").send({ refreshToken: before.body.refreshToken })).status).toBe(401);
  const wrong = await login({ ...credentials, password: "wrong" });
  const unknown = await login({ ...credentials, email: "unknown@example.test", password: "wrong" });
  expect([wrong.status, unknown.status]).toEqual([401, 401]);
  expect(wrong.body.error).toBe(unknown.body.error);
  const staged = await login();
  expect(staged.body).toMatchObject({ state: "mfa_required", pendingToken: expect.any(String) });
  expect(staged.body.admin).toBeUndefined();
  expect(staged.body.token).toBeUndefined();
  expect((await get("/api/v1/auth/me", staged.body.pendingToken)).status).toBe(401);
  const accepted = await post("/mfa/challenge", staged.body.pendingToken, { code: await code() });
  expect(accepted.status).toBe(200);
  expect((await get("/api/v1/auth/me", accepted.body.token)).body.mfa).toMatchObject({ enrolled: true, verified: true, recent: true });
});

it("consumes an accepted TOTP step only once across concurrent requests and fresh challenges", async () => {
  await syntheticEnrolled();
  const token = (await login()).body.pendingToken;
  const current = await code();
  const results = await Promise.all([
    post("/mfa/challenge", token, { code: current }),
    post("/mfa/challenge", token, { code: current }),
  ]);
  expect(results.map(r => r.status).sort()).toEqual([200, 401]);
  const fresh = (await login()).body.pendingToken;
  expect((await post("/mfa/challenge", fresh, { code: current })).status).toBe(401);
});

it("consumes a recovery code only once and stores no plaintext recovery codes", async () => {
  const stage = await login();
  const { verified, confirm } = await enrol(stage.body.token);
  const current = verified.body.recoveryCodes[0];
  const db = await AdminUser.collection.findOne({ email: credentials.email });
  expect(db?.mfaSecretEnc).not.toContain(secret);
  expect(JSON.stringify(db)).not.toContain(current);
  const token = (await login()).body.pendingToken;
  const results = await Promise.all([
    post("/mfa/challenge", token, { code: current }),
    post("/mfa/challenge", token, { code: current }),
  ]);
  expect(results.map(r => r.status).sort()).toEqual([200, 401]);
  expect((await get("/api/v1/auth/mfa", confirm.body.token)).body.recoveryCodesRemaining).toBe(9);
  const fresh = (await login()).body.pendingToken;
  expect((await post("/mfa/challenge", fresh, { code: current })).status).toBe(401);
});

it("caps guesses, expires challenges, and rejects ordinary JWTs as challenge tokens", async () => {
  await syntheticEnrolled();
  const token = (await login()).body.pendingToken;
  for (let i = 0; i < 5; i++) {
    expect((await post("/mfa/challenge", token, { code: "invalid" })).status).toBe(401);
  }
  expect((await post("/mfa/challenge", token, { code: await code() })).status).toBe(401);
  const expired = (await login()).body.pendingToken;
  await AdminUser.collection.updateOne({ email: credentials.email }, {
    $set: { "mfaLogin.expiresAt": new Date(Date.now() - 1000) },
  });
  expect((await post("/mfa/challenge", expired, { code: await code() })).status).toBe(401);
  expect((await post("/mfa/challenge", signRefreshToken({ sub: id, ver: 0 }), { code: await code() })).status).toBe(401);
});

it("requires recent MFA for changing an already enrolled authenticator; refresh preserves MFA age", async () => {
  await syntheticEnrolled();
  const mfaAt = Math.floor(Date.now() / 1000) - 301;
  const access = signAccessToken({ sub: id, email: credentials.email, role: "owner", ver: 0, mfaAt });
  const refresh = signRefreshToken({ sub: id, ver: 0, mfaAt });
  expect((await post("/mfa/enrolment/start", access, { password: credentials.password })).status).toBe(403);
  const renewed = await request(app).post(base + "/refresh").send({ refreshToken: refresh });
  expect(renewed.status).toBe(200);
  expect((await get("/api/v1/auth/mfa", renewed.body.token)).body.recent).toBe(false);
});

it("matches the RFC 6238 SHA-1 value in the account verifier", async () => {
  const { acceptedTotpStep } = await import("../modules/security/mfa.js");
  expect(await acceptedTotpStep(secret, "287082", 59)).toBe(1);
  expect(await acceptedTotpStep(secret, "000000", 59)).toBeNull();
});

it("records recovery use, and an operator reset revokes sessions and preserves a recovery audit entry", async () => {
  const staged = await login();
  const { confirm, verified } = await enrol(staged.body.token);
  const pending = await login();
  const verifiedRecovery = await post("/mfa/challenge", pending.body.pendingToken, { code: verified.body.recoveryCodes[0] });
  expect(verifiedRecovery.status).toBe(200);
  expect((await AdminUser.collection.findOne({ email: credentials.email }))?.mfaRecoveryLastUsedAt).toBeInstanceOf(Date);
  const { resetAuthenticatorForOperator } = await import("../modules/auth/auth.service.js");
  await resetAuthenticatorForOperator(id, "synthetic-operator", "SYNTHETIC-001");
  expect((await get("/api/v1/auth/me", confirm.body.token)).status).toBe(401);
  expect((await get("/api/v1/auth/me", verifiedRecovery.body.token)).status).toBe(401);
  const record = await AdminUser.collection.findOne({ email: credentials.email });
  expect(record).not.toHaveProperty("mfaSecretEnc");
  expect(record?.mfaOperatorResets).toEqual([{
    at: expect.any(Date), by: "synthetic-operator", reference: "SYNTHETIC-001",
  }]);
  Object.assign(env, { MFA_REQUIRED: true });
  expect((await login()).body.state).toBe("enrolment_required");
});
