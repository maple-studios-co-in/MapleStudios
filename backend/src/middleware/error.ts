import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`No route for ${req.method} ${req.originalUrl}`));
};

interface Shaped {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function shape(err: unknown): Shaped {
  if (err instanceof AppError) {
    return { status: err.statusCode, code: err.code, message: err.message, details: err.details };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "BAD_REQUEST",
      message: "Some fields need attention.",
      details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      code: "BAD_REQUEST",
      message: "Some fields need attention.",
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  }

  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, code: "BAD_REQUEST", message: `Malformed value for ${err.path}.` };
  }

  // Duplicate key - the unique index did its job.
  if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
    return { status: 409, code: "CONFLICT", message: "That record already exists." };
  }

  if (err instanceof SyntaxError && "body" in err) {
    return { status: 400, code: "BAD_REQUEST", message: "Invalid JSON body." };
  }

  return { status: 500, code: "INTERNAL", message: "Something went wrong on our end." };
}

// Four arguments - Express identifies error handlers by arity, so _next
// must stay even though it is unused.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, code, message, details } = shape(err);

  if (status >= 500) logger.error({ err, requestId: req.id }, "unhandled error");
  else logger.debug({ code, status, path: req.path }, "handled error");

  res.status(status).json({
    error: message,
    code,
    ...(details ? { details } : {}),
    requestId: req.id,
    ...(env.isProd ? {} : { stack: err instanceof Error ? err.stack : undefined }),
  });
};
