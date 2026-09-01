import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const shared = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  // Limiters are noise in tests; every assertion would need a fresh IP.
  skip: () => env.isTest,
};

/** Broad ceiling for read endpoints. */
export const publicLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 120,
  message: { error: "Too many requests - try again shortly.", code: "RATE_LIMITED" },
});

/** Anything that writes on behalf of an anonymous visitor. */
export const writeLimiter = rateLimit({
  ...shared,
  windowMs: 10 * 60_000,
  limit: 5,
  message: { error: "Too many submissions - try again shortly.", code: "RATE_LIMITED" },
});

/**
 * Brute-force guard. Successful logins are not counted, so a legitimate
 * admin is never locked out by their own sign-ins. Keyed on IP (the library
 * default), which handles IPv6 prefixes correctly.
 */
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts - try again later.", code: "RATE_LIMITED" },
});
