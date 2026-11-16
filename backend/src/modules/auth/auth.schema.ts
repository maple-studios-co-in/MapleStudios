import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().max(254).toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, "Missing refresh token."),
});

export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12, "Use at least 12 characters.").max(200),
  role: z.enum(["owner", "admin", "member"]).default("member"),
});

export const mfaPasswordSchema = z.object({ password: z.string().min(1).max(200) }).strict();
export const mfaCodeSchema = z.object({ code: z.string().trim().min(1).max(64) }).strict();
export const mfaReauthSchema = mfaCodeSchema.extend(mfaPasswordSchema.shape).strict();
export const mfaConfirmSchema = z.object({ savedRecoveryCodes: z.literal(true) }).strict();
