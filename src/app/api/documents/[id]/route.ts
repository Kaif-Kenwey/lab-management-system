import { NextRequest } from "next/server";
import { unlink } from "node:fs/promises";
import { db } from "@/lib/db";
import { ok, withAuth, audit } from "@/lib/api";
import { can } from "@/lib/permissions";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

async function loadDocument(id: string, orgId: string) {
  const document = await db.document.findFirst({
    where: { id, organizationId: orgId },
    include: { uploadedBy: { select: { id: true, name: true, email: true } } },
  });
  if (!document) throw NotFoundError("Document not found");
  return document;
}

// JSON metadata for a single document
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const document = await loadDocument(id, ctx.session.orgId);
    return ok(document);
  });
}

// Uploader or labs.manage may delete (file + row)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const document = await loadDocument(id, ctx.session.orgId);

    const isUploader = document.uploadedById === ctx.session.userId;
    if (!isUploader && !can(ctx.session.role, "labs.manage")) {
      throw ForbiddenError("Forbidden — only the uploader or a lab manager can delete documents");
    }

    await db.document.delete({ where: { id } });
    try {
      await unlink(document.storagePath);
    } catch {
      // file already gone — row deletion is the source of truth
    }

    await audit(ctx.session.orgId, ctx.session.userId, "DOCUMENT_DELETED", "Document", id, {
      name: document.name,
      entityType: document.entityType,
      entityId: document.entityId,
    });
    return ok({ success: true });
  });
}
