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

  // Behind Vercel/nginx, req.ip must come from X-Forwarded-For or every
  // rate limiter buckets the whole internet into one proxy address.
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" ? incoming : crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/healthz" || req.url === "/readyz" },
    })
  );

  app.use(helmet());
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
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
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
