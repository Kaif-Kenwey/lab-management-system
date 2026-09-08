import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { ApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { DOCUMENT_ENTITY_TYPES } from "@/lib/constants";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const MAGIC_STRICT_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

/** Magic-byte sniffing of the first bytes: %PDF / 0x89PNG / 0xFFD8FF */
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf.length >= 4 && buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

const documentQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const parsed = documentQuerySchema.safeParse({
      entityType: ctx.searchParams.get("entityType") ?? undefined,
      entityId: ctx.searchParams.get("entityId") ?? undefined,
    });
    const filters = parsed.success ? parsed.data : {};

    const documents = await db.document.findMany({
      where: {
        organizationId: ctx.session.orgId,
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.entityId ? { entityId: filters.entityId } : {}),
      },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(documents);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const form = await req.formData().catch(() => null);
    if (!form) {
      throw ValidationError("multipart/form-data body with a 'file' field is required");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw ValidationError("A file is required (form field 'file')");
    }

    const entityType = String(form.get("entityType") ?? "").trim();
    const entityId = String(form.get("entityId") ?? "").trim();
    if (!(DOCUMENT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw ValidationError(`Invalid entityType — must be one of: ${DOCUMENT_ENTITY_TYPES.join(", ")}`);
    }
    if (!entityId) throw ValidationError("entityId is required");

    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError("VALIDATION_ERROR", "File exceeds 5MB limit", 413);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";

    if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
      throw new ApiError("VALIDATION_ERROR", "Unsupported file type", 415);
    }
    const sniffed = sniffMime(bytes);
    if (sniffed && sniffed !== mime) {
      throw new ApiError("VALIDATION_ERROR", "File content does not match its declared type", 415);
    }
    if (!sniffed && MAGIC_STRICT_MIME.has(mime)) {
      throw new ApiError("VALIDATION_ERROR", "File content does not match its declared type", 415);
    }

    // The linked entity must exist inside this organization
    const orgId = ctx.session.orgId;
    let exists = false;
    switch (entityType) {
      case "EQUIPMENT":
        exists = !!(await db.equipment.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
        break;
      case "LAB":
        exists = !!(await db.lab.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
        break;
      case "CHEMICAL":
        exists = !!(await db.chemical.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
        break;
      case "INCIDENT":
        exists = !!(await db.incident.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
        break;
      case "VENDOR":
        exists = !!(await db.vendor.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
        break;
      case "PURCHASE_ORDER":
        exists = !!(await db.purchaseOrder.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
        break;
      case "CALIBRATION":
        exists = !!(await db.calibrationRecord.findFirst({ where: { id: entityId, organizationId: orgId }, select: { id: true } }));
        break;
    }
    if (!exists) throw NotFoundError(`${entityType} not found in your organization`);

    const ext = EXT_BY_MIME[mime] ?? ".bin";
    const storageDir = path.join(process.cwd(), "uploads", orgId);
    await mkdir(storageDir, { recursive: true });
    const storagePath = path.join(storageDir, `${randomUUID()}${ext}`);
    await writeFile(storagePath, bytes);

    const document = await db.document.create({
      data: {
        organizationId: orgId,
        name: file.name || `upload${ext}`,
        mimeType: mime,
        size: bytes.length,
        entityType,
        entityId,
        storagePath,
        uploadedById: ctx.session.userId,
      },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
    });

    await audit(orgId, ctx.session.userId, "DOCUMENT_UPLOADED", "Document", document.id, {
      name: document.name,
      entityType,
      entityId,
      size: document.size,
    });
    return ok(document, 201);
  });
}
