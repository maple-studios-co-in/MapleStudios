import type { RequestHandler } from "express";

/**
 * Strips keys that MongoDB would treat as operators. Replaces
 * express-mongo-sanitize, which mutates req.query and therefore throws on
 * Express 5 (req.query is a getter there). Query strings are covered by
 * schema whitelisting instead.
 */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("$") || key.includes(".")) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = scrub(val, depth + 1);
  }
  return out;
}

export const sanitize: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = scrub(req.body) as typeof req.body;
  }
  if (req.params && typeof req.params === "object") {
    Object.assign(req.params, scrub(req.params));
  }
  next();
};
