import type { Request, RequestHandler } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError } from "../lib/AppError.js";

export interface ValidSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Parsed, typed input. Express 5 makes req.query read-only, so
          validated values live here rather than overwriting the originals. */
      valid?: { body?: unknown; query?: unknown; params?: unknown };
      admin?: { id: string; email: string; role: string; legacy?: boolean };
    }
  }
}

export const validate =
  (schemas: ValidSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      req.valid = {
        body: schemas.body ? schemas.body.parse(req.body) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
      };
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          AppError.badRequest(
            "Some fields need attention.",
            err.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
          )
        );
        return;
      }
      next(err);
    }
  };

/* Typed accessors - keep the casts in one place. The schema argument is only
   there to carry the type; it is never read at runtime. */
export const body = <S extends ZodTypeAny>(req: Request, _schema: S) =>
  req.valid?.body as z.infer<S>;
export const query = <S extends ZodTypeAny>(req: Request, _schema: S) =>
  req.valid?.query as z.infer<S>;
export const params = <S extends ZodTypeAny>(req: Request, _schema: S) =>
  req.valid?.params as z.infer<S>;
