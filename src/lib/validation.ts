import { z } from "zod";
import { ApiError, ValidationError } from "./errors";
import { body } from "./api";

/**
 * Parses and validates a JSON request body against a Zod schema.
 * Throws a 400 VALIDATION_ERROR with a helpful message on failure.
 */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S
): Promise<z.infer<S>> {
  const raw = await body<unknown>(req);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.length ? `${first.path.join(".")}: ` : "";
    throw ValidationError(first ? `${path}${first.message}` : "Invalid request body", result.error.issues);
  }
  return result.data;
}

/** Common reusable field schemas */
export const dateString = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date")
  .transform((v) => new Date(v));

export const optionalDateString = dateString.optional().nullable();

export const cuidish = z.string().min(1).max(64);
export const optionalId = z.string().min(1).max(64).nullable().optional();

export function isPrismaKnownError(e: unknown): e is { code: string; message: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
}

/** Maps unique-constraint violations to a friendly 409 */
export function mapPrismaError(e: unknown, uniqueMessage: string): never {
  if (isPrismaKnownError(e)) {
    if (e.code === "P2002") throw new ApiError("RESOURCE_CONFLICT", uniqueMessage, 409);
    if (e.code === "P2025") throw new ApiError("NOT_FOUND", "Resource not found", 404);
    if (e.code === "P2003") throw new ApiError("RESOURCE_CONFLICT", "Referenced record is missing or still in use", 409);
  }
  throw e;
}
