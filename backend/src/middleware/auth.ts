import { AdminUser, type AdminRole } from "../modules/auth/admin.model.js";
import crypto from "node:crypto";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

export interface AccessClaims {
  sub: string;
  email: string;
  role: AdminRole;
  typ?: "access";
  ver: number;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign({ ...claims, typ: "access" }, env.JWT_SECRET, {
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
    return jwt.verify(token, env.JWT_SECRET, {
      issuer: "maple-studios-api",
    }) as T;
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
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get("authorization");

  if (header?.startsWith("Bearer ")) {
    try {
      const claims = verifyToken<AccessClaims>(header.slice(7).trim());
      if (claims.typ !== "access" || !/^[a-f0-9]{24}$/i.test(claims.sub || ""))
        throw AppError.unauthorized();
      const admin = await AdminUser.findById(claims.sub).exec();
      if (!admin || admin.active === false || admin.tokenVersion !== claims.ver)
        throw AppError.unauthorized("Session was revoked. Sign in again.");
      req.admin = {
        id: String(admin._id),
        email: admin.email,
        role: admin.role,
      };
      next();
    } catch (err) {
      next(err);
    }
    return;
  }

  const legacy = req.get("x-admin-key");
  if (env.legacyAdminKey && legacy && safeEqual(legacy, env.legacyAdminKey)) {
    logger.warn(
      { path: req.path },
      "auth: legacy x-admin-key used - migrate to JWT",
    );
    req.admin = {
      id: "legacy",
      email: "legacy@maplestudios",
      role: "owner",
      legacy: true,
    };
    next();
    return;
  }

  next(AppError.unauthorized());
};

/** Route guard for owner-only actions (e.g. creating other admins). */
export const requireRole =
  (...roles: Array<AdminRole>): RequestHandler =>
  (req, _res, next) => {
    if (!req.admin) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.admin.role as AdminRole)) {
      next(AppError.forbidden("Your role cannot perform that action."));
      return;
    }
    next();
  };

/** Studio routes exclude members even if a valid session was supplied. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  void authenticate(req, res, (error?: unknown) => {
    if (error) return next(error);
    return requireRole("owner", "admin")(req, res, next);
  });
};
