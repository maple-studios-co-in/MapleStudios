/**
 * An error we *meant* to produce. The central handler trusts the status and
 * message of these and reports anything else as an unexpected 500.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(message = "Authentication required.") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Not allowed.") {
    return new AppError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Not found.") {
    return new AppError(404, "NOT_FOUND", message);
  }
  static conflict(message: string) {
    return new AppError(409, "CONFLICT", message);
  }
  static gone(message: string) {
    return new AppError(410, "GONE", message);
  }
  static tooMany(message = "Too many requests - try again shortly.") {
    return new AppError(429, "RATE_LIMITED", message);
  }
  static unavailable(message = "Service unavailable.") {
    return new AppError(503, "UNAVAILABLE", message);
  }
}
