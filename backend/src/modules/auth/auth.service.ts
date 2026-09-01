import { AdminUser, adminWire, hashPassword, verifyPassword } from "./admin.model.js";
import { AppError } from "../../lib/AppError.js";
import { signAccessToken, signRefreshToken, verifyToken } from "../../middleware/auth.js";

export async function login(email: string, password: string) {
  // passwordHash is select:false, so ask for it explicitly.
  const admin = await AdminUser.findOne({ email }).select("+passwordHash").exec();

  // Same message for both failure modes, so the response cannot be used to
  // enumerate which email addresses exist.
  const ok = admin ? await verifyPassword(password, admin.passwordHash) : false;
  if (!admin || !ok) throw AppError.unauthorized("Email or password is incorrect.");

  admin.lastLoginAt = new Date();
  await admin.save();

  const claims = {
    sub: String(admin._id),
    email: admin.email,
    role: admin.role as "owner" | "admin",
    ver: admin.tokenVersion,
  };

  return {
    token: signAccessToken(claims),
    refreshToken: signRefreshToken({ sub: claims.sub, ver: claims.ver }),
    admin: adminWire(admin),
  };
}

export async function refresh(refreshToken: string) {
  const claims = verifyToken<{ sub: string; ver: number; typ?: string }>(refreshToken);
  if (claims.typ !== "refresh") throw AppError.unauthorized("Not a refresh token.");

  const admin = await AdminUser.findById(claims.sub).exec();
  if (!admin) throw AppError.unauthorized("Account no longer exists.");
  // A password change or forced sign-out bumps tokenVersion, which retires
  // every refresh token issued before it.
  if (admin.tokenVersion !== claims.ver) throw AppError.unauthorized("Session was revoked.");

  return {
    token: signAccessToken({
      sub: String(admin._id),
      email: admin.email,
      role: admin.role as "owner" | "admin",
      ver: admin.tokenVersion,
    }),
  };
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password: string;
  role: "owner" | "admin";
}) {
  const exists = await AdminUser.findOne({ email: input.email }).exec();
  if (exists) throw AppError.conflict("An admin with that email already exists.");

  return AdminUser.create({
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(input.password),
  });
}
