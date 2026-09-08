import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseBody } from "@/lib/validation";
import { ApiError } from "@/lib/errors";

function jsonRequest(payload: unknown, invalidJson = false): Request {
  const body = invalidJson ? "{not-json" : JSON.stringify(payload);
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("parseBody", () => {
  const schema = z.object({
    name: z.string().min(1, "Name is required"),
    quantity: z.coerce.number().int().min(1),
  });

  it("returns parsed data on success (with coercion applied)", async () => {
    const data = await parseBody(jsonRequest({ name: "Beaker", quantity: "4" }), schema);
    expect(data).toEqual({ name: "Beaker", quantity: 4 });
  });

  it("throws a 400 VALIDATION_ERROR ApiError with the first issue message on failure", async () => {
    try {
      await parseBody(jsonRequest({ name: "", quantity: 0 }), schema);
      expect.unreachable("expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.status).toBe(400);
      // First issue wins (name is the first failing field)
      expect(err.message).toContain("name");
    }
  });

  it("reports the failing path in the message", async () => {
    const nested = z.object({ item: z.object({ sku: z.string().min(2, "SKU too short") }) });
    try {
      await parseBody(jsonRequest({ item: { sku: "x" } }), nested);
      expect.unreachable("expected ValidationError");
    } catch (e) {
      expect((e as ApiError).message).toContain("item.sku");
      expect((e as ApiError).message).toContain("SKU too short");
    }
  });

  it("treats an unparseable body as an empty object and fails validation", async () => {
    try {
      await parseBody(jsonRequest(null, true), schema);
      expect.unreachable("expected ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("VALIDATION_ERROR");
    }
  });
});
