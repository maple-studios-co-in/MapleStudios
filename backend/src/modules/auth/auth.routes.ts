import { Router } from "express";
import { validate, body } from "../../middleware/validate.js";
import { loginLimiter } from "../../middleware/rateLimit.js";
import { requireAdmin, requireRole } from "../../middleware/auth.js";
import { AdminUser, adminWire } from "./admin.model.js";
import { createAdminSchema, loginSchema, refreshSchema } from "./auth.schema.js";
import * as auth from "./auth.service.js";

export const authRoutes = Router();

authRoutes.post("/login", loginLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = body(req, loginSchema);
  res.json(await auth.login(email, password));
});

authRoutes.post("/refresh", validate({ body: refreshSchema }), async (req, res) => {
  const { refreshToken } = body(req, refreshSchema);
  res.json(await auth.refresh(refreshToken));
});

authRoutes.get("/me", requireAdmin, async (req, res) => {
  if (req.admin?.legacy) {
    res.json({ admin: { id: "legacy", name: "Legacy key", email: null, role: "owner" } });
    return;
  }
  const admin = await AdminUser.findById(req.admin?.id).exec();
  res.json({ admin: admin ? adminWire(admin) : null });
});

/** Owner-only: add another admin. */
authRoutes.post(
  "/admins",
  requireAdmin,
  requireRole("owner"),
  validate({ body: createAdminSchema }),
  async (req, res) => {
    const created = await auth.createAdmin(body(req, createAdminSchema));
    res.status(201).json({ admin: adminWire(created) });
  }
);
