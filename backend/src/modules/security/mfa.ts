import jwt from "jsonwebtoken";
import { generateSecret, generateURI, verify } from "otplib";
import { crypto } from "@otplib/plugin-crypto-node";
import { env } from "../../config/env.js";
import { hmac, randomToken } from "../../lib/crypto.js";
import { AppError } from "../../lib/AppError.js";
import { verifyToken } from "../../middleware/auth.js";

export const CHALLENGE_SECONDS = 300;
export const ENROLMENT_SECONDS = 900;
export const FACTOR_ATTEMPTS = 5;
const ISSUER = "Maple Studios";

export type PendingType = "mfa-login" | "mfa-enrolment";
export interface PendingClaims {
  sub: string;
  ver: number;
  typ: PendingType;
  nonce: string;
}

export function pendingToken(input: Omit<PendingClaims, "nonce">) {
  const seconds = input.typ === "mfa-login" ? CHALLENGE_SECONDS : ENROLMENT_SECONDS;
  const nonce = randomToken(32);
  return {
    token: jwt.sign({ ...input, nonce }, env.JWT_SECRET, {
      algorithm: "HS256", expiresIn: seconds, issuer: "maple-studios-api",
    }),
    state: { nonceHash: nonceDigest(nonce), expiresAt: new Date(Date.now() + seconds * 1000), attempts: 0 },
  };
}

export function parsePending(token: string, typ?: PendingType): PendingClaims {
  const claims = verifyToken<PendingClaims>(token);
  if (!["mfa-login", "mfa-enrolment"].includes(claims.typ) ||
      (typ && typ !== claims.typ) || !/^[a-f0-9]{24}$/i.test(claims.sub ?? "") ||
      !/^[A-Za-z0-9_-]{43}$/.test(claims.nonce ?? ""))
    throw AppError.unauthorized("Sign in again to continue.");
  return claims;
}

export const nonceDigest = (nonce: string) => hmac(`maple:mfa:nonce:${nonce}`, 64);

export function newAuthenticator(email: string) {
  const manualKey = generateSecret({ crypto });
  return {
    manualKey,
    authenticatorUri: generateURI({ issuer: ISSUER, label: email, secret: manualKey }),
  };
}

export async function acceptedTotpStep(secret: string, code: string, epoch = Math.floor(Date.now() / 1000)) {
  if (!/^\d{6}$/.test(code)) return null;
  const result = await verify({ secret, token: code, epoch, epochTolerance: 30, crypto });
  return result.valid && "timeStep" in result ? result.timeStep : null;
}

export const newRecoveryCodes = () => Array.from({ length: 10 }, () => randomToken(16));
export const recoveryDigest = (accountId: string, code: string) =>
  hmac(`maple:mfa:recovery:${accountId}:${code}`, 64);
