import crypto from "node:crypto";
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { isDbHealthy } from "./config/db.js";
import { logger } from "./lib/logger.js";
import { sanitize } from "./middleware/sanitize.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { api } from "./routes.js";

export function createApp(): Express {
  const app = express();

  // Only the local BFF is trusted, and it supplies a single IP from the
  // nginx-overwritten X-Real-IP header. Never follow user-supplied hop chains.
  app.set("trust proxy", (ip: string, hop: number) =>
    hop === 0 && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip));
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req: (req: { url?: string; query?: unknown; params?: unknown }) => {
          const pathname = req.url?.split("?")[0];
          // Unsubscribe URLs encode a live credential in a path segment.
          return {
            ...req,
            url: pathname?.replace(/(\/unsubscribe)\/[^/]+/, "$1/[redacted]"),
            query: undefined, params: undefined,
          };
        },
      },
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" ? incoming : crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/healthz" || req.url === "/readyz" },
    })
  );

  app.use(helmet({
    strictTransportSecurity: env.isProd ? { maxAge: 31536000, includeSubDomains: false } : false,
    referrerPolicy: { policy: "no-referrer" },
  }));
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header = same-origin, curl, or a server-side call.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} is not allowed.`));
      },
      credentials: true,
      maxAge: 86_400,
    })
  );
  app.use(compression());
  // Keep the exact bytes: the Resend webhook verifies an HMAC over the raw
  // body, and a re-serialised (and sanitised) object would not match.
  app.use(
    express.json({
      limit: "100kb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  // CSV imports arrive as the file's text — no multipart parser needed.
  app.use(express.text({ type: "text/csv", limit: "10mb" }));
  app.use(sanitize);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get("/readyz", (_req, res) => {
    const db = isDbHealthy();
    res.status(db ? 200 : 503).json({ ok: db, db: db ? "connected" : "disconnected" });
  });

  app.use("/api/v1", api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
