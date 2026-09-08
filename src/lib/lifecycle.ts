// Equipment lifecycle (Phase 6) — the ONLY way EquipmentEvent rows are written.
// Equipment status changes must ALWAYS be accompanied by an event via this
// helper. It never throws: a failed event write must never break the primary
// operation (same contract as notify()).
//
// Usage:
//   await recordEquipmentEvent(db, { organizationId, equipmentId, type: "CHECKED_OUT", newStatus: "IN_USE" });
//   await db.$transaction(async (tx) => {
//     await tx.equipment.update({ ... });
//     await recordEquipmentEvent(tx, { ... });
//   });

import type { Prisma, PrismaClient } from "@prisma/client";
import { logError } from "./request-context";

type DbLike = PrismaClient | Prisma.TransactionClient;

export interface EquipmentEventInput {
  organizationId: string;
  equipmentId: string;
  /** One of EQUIPMENT_EVENT_TYPES (src/lib/constants.ts) */
  type: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

/** Writes an EquipmentEvent (never throws — best effort by design). */
export async function recordEquipmentEvent(db: DbLike, input: EquipmentEventInput) {
  try {
    return await db.equipmentEvent.create({
      data: {
        organizationId: input.organizationId,
        equipmentId: input.equipmentId,
        type: input.type,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus ?? null,
        notes: input.notes ?? null,
        actorId: input.actorId ?? null,
      },
    });
  } catch (e) {
    logError("equipment_event_write_failed", e);
    return null;
  }
}
