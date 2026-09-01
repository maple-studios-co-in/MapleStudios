import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("maple_studios"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_EXPIRES_IN: z.string().default("7d"),
  LEGACY_ADMIN_KEY: z.string().optional(),

  CORS_ORIGINS: z.string().default("http://localhost:3006"),
  STUDIO_TIMEZONE: z.string().default("Asia/Kolkata"),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().optional(),
});

/** Tests never load a .env; give them a working set so importing env is safe. */
const source =
  process.env.NODE_ENV === "test"
    ? {
        ...process.env,
        MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
        JWT_SECRET:
          process.env.JWT_SECRET ?? "test-secret-value-that-is-long-enough-32",
      }
    : process.env;

const parsed = EnvSchema.safeParse(source);

if (!parsed.success) {
  const lines = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  console.error(`\nInvalid environment - refusing to start:\n${lines}\n`);
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === "production";

// A placeholder secret in production is worse than a missing one, because
// nothing fails until someone forges a token.
if (isProd && raw.JWT_SECRET.includes("replace-me")) {
  console.error("\nJWT_SECRET is still the example value. Refusing to start.\n");
  process.exit(1);
}

export const env = {
  ...raw,
  isProd,
  isTest: raw.NODE_ENV === "test",
  legacyAdminKey: raw.LEGACY_ADMIN_KEY ? raw.LEGACY_ADMIN_KEY : undefined,
  corsOrigins: raw.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
