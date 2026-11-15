import { z } from "zod";
import { AppError } from "../../lib/AppError.js";
import { Router } from "express";
import { validate, body } from "../../middleware/validate.js";
import { loginLimiter } from "../../middleware/rateLimit.js";
import {
  authenticate,
  requireAdmin,
  requireRole,
} from "../../middleware/auth.js";
import {
  AdminUser,
  adminWire,
  hashPassword,
  verifyPassword,
} from "./admin.model.js";
import {
  createAdminSchema,
  loginSchema,
  refreshSchema,
} from "./auth.schema.js";
import * as auth from "./auth.service.js";

export const authRoutes = Router();

authRoutes.post(
  "/login",
  loginLimiter,
  validate({ body: loginSchema }),
  async (req, res) => {
    const { email, password } = body(req, loginSchema);
    res.json(await auth.login(email, password));
  },
);

authRoutes.post(
  "/refresh",
  validate({ body: refreshSchema }),
  async (req, res) => {
    const { refreshToken } = body(req, refreshSchema);
    res.json(await auth.refresh(refreshToken));
  },
);

authRoutes.get("/me", authenticate, async (req, res) => {
  if (req.admin?.legacy) {
    res.json({
      admin: { id: "legacy", name: "Legacy key", email: null, role: "owner" },
    });
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
  },
);

authRoutes.get(
  "/admins",
  authenticate,
  requireRole("owner"),
  async (_req, res) => {
    res.json({
      items: (await AdminUser.find().sort({ name: 1 })).map(adminWire),
    });
  },
);
const updateAccount = z
  .object({
    active: z.boolean().optional(),
    role: z.enum(["owner", "admin", "member"]).optional(),
  })
  .strict();
authRoutes.patch(
  "/admins/:id",
  authenticate,
  requireRole("owner"),
  validate({ body: updateAccount }),
  async (req, res) => {
    const id = String(req.params.id);
    if (!/^[a-f0-9]{24}$/i.test(id))
      throw AppError.badRequest("Invalid account id.");
    if (id === req.admin?.id)
      throw AppError.conflict("Ask another owner to change your access.");
    const admin = await AdminUser.findByIdAndUpdate(
      id,
      { $set: body(req, updateAccount), $inc: { tokenVersion: 1 } },
      { new: true, runValidators: true },
    );
    if (!admin) throw AppError.notFound();
    res.json({ admin: adminWire(admin) });
  },
);
authRoutes.post("/logout", authenticate, async (req, res) => {
  if (req.admin?.id !== "legacy")
    await AdminUser.updateOne(
      { _id: req.admin?.id },
      { $inc: { tokenVersion: 1 } },
    );
  res.json({ ok: true });
});
const changePassword = z.object({
  currentPassword: z.string().min(1),
  password: z.string().min(12).max(200),
});
authRoutes.post(
  "/password",
  authenticate,
  validate({ body: changePassword }),
  async (req, res) => {
    if (req.admin?.legacy)
      throw AppError.forbidden("Use an individual account.");
    const input = body(req, changePassword);
    const admin = await AdminUser.findById(req.admin?.id).select(
      "+passwordHash",
    );
    if (
      !admin ||
      !(await verifyPassword(input.currentPassword, admin.passwordHash))
    )
      throw AppError.unauthorized("Current password is incorrect.");
    admin.passwordHash = await hashPassword(input.password);
    admin.tokenVersion += 1;
    await admin.save();
    res.json({ ok: true });
  },
);
