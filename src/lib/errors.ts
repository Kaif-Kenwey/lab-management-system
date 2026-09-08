// Structured error envelope (Phase 26) + request context (Phase 27).
// Every API error responds as:
//   { "error": { "code": "RESOURCE_CONFLICT", "message": "...", "requestId": "..." } }

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RESOURCE_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RESOURCE_CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(code: ErrorCode, message: string, status?: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const ValidationError = (message: string, details?: unknown) =>
  new ApiError("VALIDATION_ERROR", message, undefined, details);
export const UnauthorizedError = (message = "Unauthorized — please sign in") =>
  new ApiError("UNAUTHORIZED", message);
export const ForbiddenError = (message = "Forbidden — insufficient permissions") =>
  new ApiError("FORBIDDEN", message);
export const NotFoundError = (message = "Resource not found") => new ApiError("NOT_FOUND", message);
export const ConflictError = (message: string) => new ApiError("RESOURCE_CONFLICT", message);
export const RateLimitedError = (message = "Too many requests — please slow down") =>
  new ApiError("RATE_LIMITED", message);
