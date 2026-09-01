import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  // Never let a token or key reach the log sink.
  redact: {
    paths: [
      "req.headers.authorization",
      'req.headers["x-admin-key"]',
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
  ...(env.isProd || env.isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }),
});
