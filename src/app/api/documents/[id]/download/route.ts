import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";

// Streams the stored file as an attachment download (org-scoped).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(req, async (ctx) => {
    const document = await db.document.findFirst({
      where: { id, organizationId: ctx.session.orgId },
      select: { id: true, name: true, mimeType: true, storagePath: true },
    });
    if (!document) throw NotFoundError("Document not found");

    let size: number;
    try {
      size = (await stat(document.storagePath)).size;
    } catch {
      throw NotFoundError("File is missing from storage");
    }

    const safeName = document.name.replace(/[^A-Za-z0-9._-]/g, "_") || "download";
    const stream = createReadStream(document.storagePath);

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
