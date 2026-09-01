import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, "Missing refresh token."),
});

export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(10, "Use at least 10 characters."),
  role: z.enum(["owner", "admin"]).default("admin"),
});
