import crypto from "node:crypto";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

export interface AccessClaims {
  sub: string;
  email: string;
  role: "owner" | "admin";
  ver: number;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: "maple-studios-api",
  } as jwt.SignOptions);
}

export function signRefreshToken(claims: { sub: string; ver: number }): string {
  return jwt.sign({ ...claims, typ: "refresh" }, env.JWT_SECRET, {
    expiresIn: env.REFRESH_EXPIRES_IN,
    issuer: "maple-studios-api",
  } as jwt.SignOptions);
}

export function verifyToken<T>(token: string): T {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: "maple-studios-api" }) as T;
  } catch {
    throw AppError.unauthorized("Session expired or invalid - sign in again.");
  }
}

/** Constant-time compare so the legacy key cannot be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Accepts a Bearer JWT, or - only while LEGACY_ADMIN_KEY is set - the
 * x-admin-key header the current dashboard sends. Unset that variable to
 * retire the shared secret entirely.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const header = req.get("authorization");

  if (header?.startsWith("Bearer ")) {
    try {
      const claims = verifyToken<AccessClaims>(header.slice(7).trim());
      req.admin = { id: claims.sub, email: claims.email, role: claims.role };
      next();
    } catch (err) {
      next(err);
    }
    return;
  }

  const legacy = req.get("x-admin-key");
  if (env.legacyAdminKey && legacy && safeEqual(legacy, env.legacyAdminKey)) {
    logger.warn({ path: req.path }, "auth: legacy x-admin-key used - migrate to JWT");
    req.admin = { id: "legacy", email: "legacy@maplestudios", role: "owner", legacy: true };
    next();
    return;
  }

  next(AppError.unauthorized());
};

/** Route guard for owner-only actions (e.g. creating other admins). */
export const requireRole =
  (...roles: Array<"owner" | "admin">): RequestHandler =>
  (req, _res, next) => {
    if (!req.admin) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.admin.role as "owner" | "admin")) {
      next(AppError.forbidden("Your role cannot perform that action."));
      return;
    }
    next();
  };
