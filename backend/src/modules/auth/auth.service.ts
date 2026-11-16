import type { FilterQuery, UpdateQuery } from "mongoose";
import { AdminUser, adminWire, hashPassword, verifyPassword, type AdminDoc, type IAdmin } from "./admin.model.js";
import { AppError } from "../../lib/AppError.js";
import { decrypt, encrypt, hmac } from "../../lib/crypto.js";
import { registerTick } from "../../lib/scheduler.js";
import { env } from "../../config/env.js";
import {
  allowsAccountSession, hasRecentMfa, signAccessToken, signRefreshToken, verifyToken, type AccessClaims,
} from "../../middleware/auth.js";
import {
  acceptedTotpStep, ENROLMENT_SECONDS, FACTOR_ATTEMPTS, newAuthenticator, newRecoveryCodes,
  nonceDigest, parsePending, pendingToken, recoveryDigest, type PendingClaims,
} from "../security/mfa.js";

const fields = "+passwordHash +mfaSecretEnc +mfaLastStep +mfaRecoveryHashes +mfaSetup";
const wrongCredentials = () => AppError.unauthorized("Email or password is incorrect.");
const wrongFactor = () => AppError.unauthorized("Invalid or expired verification. Sign in again if needed.");
const activeAccount = (sub: string, ver: number): FilterQuery<IAdmin> => ({ _id: sub, tokenVersion: ver, active: { $ne: false } });
// Comparable bcrypt work for an unknown account. The username and input are never logged.
const dummyPasswordHash = "$2b$12$MaQoEo5u6am/1AOR1ksdx.WAAyWRWMkllPLmLLlh.YOWFP27ypa6u";
const unix = () => Math.floor(Date.now() / 1000);

export function mfaSummary(admin: IAdmin, mfaAt?: number) {
  return {
    enrolled: Boolean(admin.mfaEnrolledAt),
    enforced: env.MFA_REQUIRED,
    verified: Boolean(mfaAt),
    recent: hasRecentMfa(mfaAt),
    verifiedAt: mfaAt ? new Date(mfaAt * 1000).toISOString() : null,
    recoveryCodesRemaining: admin.mfaRecoveryHashes?.length ?? 0,
  };
}

function session(admin: AdminDoc, mfaAt?: number) {
  const factors = mfaAt ? { mfaAt, ...(env.MFA_REQUIRED ? { mfaEnforced: true as const } : {}) } : {};
  const claims = { sub: admin.id as string, ver: admin.tokenVersion, ...factors };
  return {
    token: signAccessToken({ ...claims, email: admin.email, role: admin.role }),
    refreshToken: signRefreshToken(claims),
    admin: adminWire(admin),
    ...(mfaAt ? { mfa: mfaSummary(admin, mfaAt) } : {}),
  };
}

export async function login(email: string, password: string) {
  const admin = await AdminUser.findOne({ email }).select("+passwordHash").exec();
  const ok = await verifyPassword(password, admin?.passwordHash ?? dummyPasswordHash);
  if (!admin || !ok || admin.active === false) throw wrongCredentials();

  let update: UpdateQuery<IAdmin>;
  let pending: ReturnType<typeof pendingToken> | undefined;
  let state: "mfa_required" | "enrolment_required" | undefined;
  const account = activeAccount(admin.id, admin.tokenVersion);
  if (admin.mfaEnrolledAt) {
    pending = pendingToken({ sub: admin.id, ver: admin.tokenVersion, typ: "mfa-login" });
    update = { $set: { mfaLogin: pending.state } };
    state = "mfa_required";
  } else if (env.MFA_REQUIRED) {
    pending = pendingToken({ sub: admin.id, ver: admin.tokenVersion, typ: "mfa-enrolment" });
    update = { $set: { mfaEnrollment: pending.state }, $unset: { mfaSetup: 1 } };
    state = "enrolment_required";
  } else {
    update = { $set: { lastLoginAt: new Date() } };
  }
  const current = await AdminUser.findOneAndUpdate(account, update, { new: true });
  if (!current) throw wrongCredentials();
  return pending && state
    ? { state, pendingToken: pending.token, expiresAt: pending.state.expiresAt.toISOString() }
    : session(current);
}

export async function refresh(refreshToken: string) {
  const claims = verifyToken<Pick<AccessClaims, "sub" | "ver" | "mfaAt" | "mfaEnforced"> & { typ?: string }>(refreshToken);
  if (claims.typ !== "refresh" || !/^[a-f0-9]{24}$/i.test(claims.sub ?? ""))
    throw AppError.unauthorized("Not a refresh token.");
  const admin = await AdminUser.findOne(activeAccount(claims.sub, claims.ver)).exec();
  if (!admin || !allowsAccountSession(admin, claims))
    throw AppError.unauthorized("Session was revoked.");
  return {
    token: signAccessToken({
      sub: admin.id, email: admin.email, role: admin.role, ver: admin.tokenVersion,
      mfaAt: claims.mfaAt, mfaEnforced: claims.mfaEnforced,
    }),
  };
}

function pendingFilter(claims: PendingClaims) {
  const path = claims.typ === "mfa-login" ? "mfaLogin" : "mfaEnrollment";
  return {
    ...activeAccount(claims.sub, claims.ver),
    [`${path}.nonceHash`]: nonceDigest(claims.nonce),
    [`${path}.expiresAt`]: { $gt: new Date() },
  };
}
export async function pendingStatus(token: string) {
  const claims = parsePending(token);
  const account = await AdminUser.findOne(pendingFilter(claims)).select("+mfaLogin +mfaEnrollment");
  const pending = claims.typ === "mfa-login" ? account?.mfaLogin : account?.mfaEnrollment;
  if (!pending) throw wrongFactor();
  return {
    state: claims.typ === "mfa-login" ? "mfa_required" : "enrolment_required",
    expiresAt: pending.expiresAt.toISOString(),
  };
}
export async function cancelPending(token: string) {
  const claims = parsePending(token);
  await AdminUser.updateOne(pendingFilter(claims), {
    $unset: claims.typ === "mfa-login" ? { mfaLogin: 1 } : { mfaEnrollment: 1, mfaSetup: 1 },
  });
}

async function reserveAccountAttempt(account: FilterQuery<IAdmin>) {
  const now = new Date();
  const started = await AdminUser.updateOne({
    ...account, $or: [{ "mfaBudget.expiresAt": { $lte: now } }, { mfaBudget: { $exists: false } }],
  }, { $set: { mfaBudget: { expiresAt: new Date(now.getTime() + 900_000), attempts: 1 } } });
  if (started.modifiedCount) return;
  const reserved = await AdminUser.updateOne({
    ...account, "mfaBudget.expiresAt": { $gt: now }, "mfaBudget.attempts": { $lt: 24 },
  }, { $inc: { "mfaBudget.attempts": 1 } });
  if (!reserved.modifiedCount) throw AppError.tooMany("Too many security attempts. Try again later.");
}

async function factorMatch(account: AdminDoc, code: string, at: number) {
  if (!account.mfaSecretEnc) throw wrongFactor();
  if (/^\d{6}$/.test(code)) {
    const step = await acceptedTotpStep(decrypt(account.mfaSecretEnc), code, at);
    if (step === null || (account.mfaLastStep !== undefined && step <= account.mfaLastStep))
      throw wrongFactor();
    return {
      filter: { $or: [{ mfaLastStep: { $lt: step } }, { mfaLastStep: { $exists: false } }] },
      update: { $set: { mfaLastStep: step } },
    };
  }
  if (!/^[\w-]{22}$/.test(code)) throw wrongFactor();
  const hash = recoveryDigest(account.id, code);
  return {
    filter: { mfaRecoveryHashes: hash },
    update: { $pull: { mfaRecoveryHashes: hash }, $set: { mfaRecoveryLastUsedAt: new Date() } },
  };
}

async function acceptFactor(
  account: AdminDoc, code: string, criteria: FilterQuery<IAdmin>, consumeLogin = false,
) {
  const at = unix();
  const { filter, update } = await factorMatch(account, code, at);
  const result = await AdminUser.findOneAndUpdate(
    { ...criteria, ...filter },
    {
      ...update,
      ...(consumeLogin ? {
        $set: { ...update.$set, lastLoginAt: new Date() },
        $unset: { mfaLogin: 1 },
      } : {}),
    },
    { new: true },
  ).select("+mfaRecoveryHashes");
  if (!result) throw wrongFactor();
  return session(result, at);
}

export async function completeChallenge(token: string, code: string) {
  const claims = parsePending(token, "mfa-login");
  const filter = pendingFilter(claims);
  const account = await AdminUser.findOneAndUpdate(
    { ...filter, "mfaLogin.attempts": { $lt: FACTOR_ATTEMPTS } },
    { $inc: { "mfaLogin.attempts": 1 } },
    { new: true },
  ).select(fields);
  if (!account) throw wrongFactor();
  await reserveAccountAttempt(activeAccount(claims.sub, claims.ver));
  return acceptFactor(account, code, pendingFilter(claims), true);
}

function accessState(token: string) {
  const claims = verifyToken<AccessClaims>(token);
  if (claims.typ !== "access" || !/^[a-f0-9]{24}$/i.test(claims.sub ?? ""))
    throw AppError.unauthorized("Sign in again to continue.");
  return claims;
}

export async function reauthenticate(token: string, password: string, code: string) {
  const claims = accessState(token);
  const filter = activeAccount(claims.sub, claims.ver);
  const account = await AdminUser.findOne(filter).select(fields);
  if (!account?.mfaEnrolledAt || !allowsAccountSession(account, claims)) throw wrongFactor();
  await reserveAccountAttempt(filter);
  if (!(await verifyPassword(password, account.passwordHash))) throw wrongCredentials();
  return acceptFactor(account, code, filter);
}

const setupBinding = (token: string) => hmac(`maple:mfa:setup:${token}`, 64);
async function setupAccess(token: string, starting = false) {
  const kind = verifyToken<{ typ?: string }>(token).typ;
  if (kind === "mfa-enrolment") {
    const claims = parsePending(token, "mfa-enrolment");
    const filter = { ...pendingFilter(claims), mfaEnrolledAt: { $exists: false } };
    return { filter, expiresAt: new Date(Date.now() + ENROLMENT_SECONDS * 1000) };
  }
  const claims = accessState(token);
  const filter = activeAccount(claims.sub, claims.ver);
  const account = await AdminUser.findOne(filter);
  if (!account || !allowsAccountSession(account, claims)) throw wrongFactor();
  if (starting && account.mfaEnrolledAt && !hasRecentMfa(claims.mfaAt))
    throw new AppError(403, "RECENT_MFA_REQUIRED", "Confirm your password and second factor before replacing your authenticator.");
  return { filter, expiresAt: new Date(Date.now() + ENROLMENT_SECONDS * 1000) };
}

export async function startEnrolment(token: string, password: string) {
  const { filter, expiresAt } = await setupAccess(token, true);
  const account = await AdminUser.findOne(filter).select("+passwordHash");
  if (!account) throw wrongFactor();
  await reserveAccountAttempt(activeAccount(account.id, account.tokenVersion));
  if (!(await verifyPassword(password, account.passwordHash))) throw wrongCredentials();
  const authenticator = newAuthenticator(account.email);
  const result = await AdminUser.updateOne(filter, {
    $set: { mfaSetup: { nonceHash: setupBinding(token), expiresAt, attempts: 0, secretEnc: encrypt(authenticator.manualKey) } },
  });
  if (!result.matchedCount) throw wrongFactor();
  return { ...authenticator, expiresAt: expiresAt.toISOString() };
}

export async function proveEnrolment(token: string, code: string) {
  const { filter } = await setupAccess(token);
  const pending = {
    ...filter,
    "mfaSetup.nonceHash": setupBinding(token),
    "mfaSetup.expiresAt": { $gt: new Date() },
    "mfaSetup.proofStep": { $exists: false },
  };
  const account = await AdminUser.findOneAndUpdate(
    { ...pending, "mfaSetup.attempts": { $lt: FACTOR_ATTEMPTS } },
    { $inc: { "mfaSetup.attempts": 1 } },
    { new: true },
  ).select("+mfaSetup");
  if (!account?.mfaSetup) throw wrongFactor();
  await reserveAccountAttempt(activeAccount(account.id, account.tokenVersion));
  const at = unix();
  const step = await acceptedTotpStep(decrypt(account.mfaSetup.secretEnc), code, at);
  if (step === null) throw wrongFactor();

  const recoveryCodes = newRecoveryCodes();
  const result = await AdminUser.updateOne(
    { ...pending, "mfaSetup.secretEnc": account.mfaSetup.secretEnc },
    { $set: {
      "mfaSetup.proofStep": step, "mfaSetup.proofAt": at,
      "mfaSetup.recoveryHashes": recoveryCodes.map((recoveryCode) => recoveryDigest(account.id, recoveryCode)),
    } },
  );
  if (!result.modifiedCount) throw wrongFactor();
  return { recoveryCodes };
}

export async function confirmEnrolment(token: string) {
  const { filter } = await setupAccess(token);
  const pending = { ...filter, "mfaSetup.nonceHash": setupBinding(token), "mfaSetup.expiresAt": { $gt: new Date() } };
  const account = await AdminUser.findOne(pending).select("+mfaSetup");
  const setup = account?.mfaSetup;
  if (!setup?.recoveryHashes?.length || setup.proofStep === undefined || setup.proofAt === undefined)
    throw AppError.conflict("Verify your authenticator before confirming setup.");
  const result = await AdminUser.findOneAndUpdate(
    { ...pending, "mfaSetup.secretEnc": setup.secretEnc, "mfaSetup.proofStep": setup.proofStep },
    {
      $set: {
        mfaSecretEnc: setup.secretEnc, mfaLastStep: setup.proofStep, mfaEnrolledAt: new Date(),
        mfaRecoveryHashes: setup.recoveryHashes, lastLoginAt: new Date(),
      },
      $inc: { tokenVersion: 1 },
      $unset: { mfaSetup: 1, mfaEnrollment: 1, mfaLogin: 1, mfaBudget: 1, mfaRecoveryLastUsedAt: 1 },
    },
    { new: true },
  ).select("+mfaRecoveryHashes");
  if (!result) throw wrongFactor();
  return session(result, setup.proofAt);
}

export async function createAdmin(input: {
  email: string; name: string; password: string; role: "owner" | "admin" | "member";
}) {
  const exists = await AdminUser.findOne({ email: input.email }).exec();
  if (exists) throw AppError.conflict("An admin with that email already exists.");
  return AdminUser.create({
    email: input.email, name: input.name, role: input.role, passwordHash: await hashPassword(input.password),
  });
}

/** Intentionally available only to the local operating-system recovery command. */
export async function resetAuthenticatorForOperator(id: string, actor: string, reference: string) {
  if (!/^[a-f0-9]{24}$/i.test(id) || !actor || !/^[A-Z0-9][A-Z0-9._-]{3,79}$/i.test(reference))
    throw AppError.badRequest("Use an account ID and a valid incident reference.");
  const result = await AdminUser.updateOne(
    { _id: id, active: { $ne: false }, mfaEnrolledAt: { $exists: true } },
    {
      $inc: { tokenVersion: 1 },
      $unset: {
        mfaSecretEnc: 1, mfaEnrolledAt: 1, mfaLastStep: 1, mfaRecoveryHashes: 1,
        mfaLogin: 1, mfaEnrollment: 1, mfaSetup: 1, mfaBudget: 1, mfaRecoveryLastUsedAt: 1,
      },
      $push: { mfaOperatorResets: { at: new Date(), by: actor, reference } },
    },
  );
  if (!result.modifiedCount) throw AppError.notFound("No matching active enrolled account.");
}

export async function clearExpiredMfaState(now = new Date()) {
  await Promise.all(["mfaLogin", "mfaEnrollment", "mfaSetup", "mfaBudget"].map(field =>
    AdminUser.updateMany({ [`${field}.expiresAt`]: { $lte: now } }, { $unset: { [field]: 1 } })));
}
registerTick("expired-mfa-state", clearExpiredMfaState);
