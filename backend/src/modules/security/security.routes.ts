import { Router } from "express";
import { authenticate, requireRecentMfa, requireRole } from "../../middleware/auth.js";
import { noLegacy } from "../business/business.access.js";
import { body, validate } from "../../middleware/validate.js";
import { getReadiness, policyInput, updatePolicy } from "./security.service.js";
import { env } from "../../config/env.js";

export const securityRoutes = Router();
securityRoutes.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
securityRoutes.use(authenticate, noLegacy, requireRole("owner"));
securityRoutes.get("/readiness", async (_req, res) => res.json(await getReadiness()));
securityRoutes.patch("/policy", (req, res, next) => {
  // Staged owners can configure readiness before site-wide cutover. Owners
  // with an authenticator must confirm their second factor before changes.
  if (env.MFA_REQUIRED || req.admin?.mfaEnrolled) return requireRecentMfa(req, res, next);
  next();
}, validate({ body: policyInput }), async (req, res) => {
  const { id, email } = req.admin!;
  res.json({ policy: await updatePolicy(body(req, policyInput), { id, email }) });
});
