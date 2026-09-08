// Inventory ledger (Phase 5) — the ONLY way stock levels change.
// Every mutation is transactional, records previous/new balance and
// triggers low-stock notifications.

import { db } from "./db";
import { ApiError } from "./errors";
import { ledgerDirection } from "./business-rules";
import { notify } from "./notify";

export type LedgerType = "RECEIPT" | "ISSUE" | "RETURN" | "TRANSFER" | "ADJUSTMENT" | "DAMAGE" | "EXPIRY";

export interface LedgerEntryInput {
  organizationId: string;
  itemId: string;
  type: LedgerType;
  quantity: number;
  reason?: string | null;
  transferToLabId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  performedById?: string | null;
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Applies a stock movement inside an existing Prisma transaction.
 * Rules:
 *  - RECEIPT/RETURN: quantity > 0 (adds stock)
 *  - ISSUE/DAMAGE/EXPIRY: quantity > 0 and cannot exceed current balance
 *  - TRANSFER: quantity > 0, balance unchanged, requires transferToLabId
 *  - ADJUSTMENT: signed quantity (corrections), balance cannot go negative
 */
export async function applyInventoryTransaction(tx: TxClient, input: LedgerEntryInput) {
  const { organizationId, itemId, type, quantity } = input;

  const item = await tx.inventoryItem.findFirst({
    where: { id: itemId, organizationId },
  });
  if (!item) throw new ApiError("NOT_FOUND", "Inventory item not found", 404);

  const direction = ledgerDirection(type);
  let newBalance = item.quantity;

  if (type === "TRANSFER") {
    if (quantity <= 0) throw new ApiError("VALIDATION_ERROR", "Transfer quantity must be positive");
    if (!input.transferToLabId) throw new ApiError("VALIDATION_ERROR", "Transfer requires a destination lab");
    if (input.transferToLabId === item.labId) {
      throw new ApiError("VALIDATION_ERROR", "Source and destination labs must differ");
    }
    const targetLab = await tx.lab.findFirst({
      where: { id: input.transferToLabId, organizationId },
    });
    if (!targetLab) throw new ApiError("NOT_FOUND", "Destination lab not found", 404);
    // Balance unchanged org-wide; the item moves labs.
  } else if (direction === 1) {
    if (quantity <= 0) throw new ApiError("VALIDATION_ERROR", `${type} quantity must be positive`);
    newBalance = item.quantity + quantity;
  } else if (direction === -1) {
    if (quantity <= 0) throw new ApiError("VALIDATION_ERROR", `${type} quantity must be positive`);
    if (quantity > item.quantity) {
      throw new ApiError(
        "RESOURCE_CONFLICT",
        `Cannot ${type.toLowerCase()} ${quantity} ${item.unit} — only ${item.quantity} available`
      );
    }
    newBalance = item.quantity - quantity;
  } else {
    // ADJUSTMENT — signed correction
    if (quantity === 0) throw new ApiError("VALIDATION_ERROR", "Adjustment quantity cannot be zero");
    newBalance = item.quantity + quantity;
  }

  if (newBalance < 0) {
    throw new ApiError("RESOURCE_CONFLICT", "Stock balance cannot go negative");
  }

  const record = await tx.inventoryTransaction.create({
    data: {
      organizationId,
      itemId,
      type,
      quantity,
      previousBalance: item.quantity,
      newBalance,
      transferToLabId: type === "TRANSFER" ? input.transferToLabId ?? null : null,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      performedById: input.performedById ?? null,
    },
  });

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      quantity: newBalance,
      ...(type === "TRANSFER" && input.transferToLabId ? { labId: input.transferToLabId } : {}),
    },
  });

  // Low-stock crossing → notification (best-effort inside tx)
  const crossedBelow = item.quantity > item.minQuantity && newBalance <= item.minQuantity;
  if (crossedBelow) {
    await notify(tx, {
      organizationId,
      userId: null,
      title: "Low stock alert",
      body: `${item.name} (${item.sku}) is at or below its reorder level: ${newBalance} ${item.unit} remaining.`,
      type: "WARNING",
      entityType: "InventoryItem",
      entityId: item.id,
    });
  }

  return record;
}

/** Convenience wrapper that opens its own transaction */
export function recordStockMovement(input: LedgerEntryInput) {
  return db.$transaction((tx) => applyInventoryTransaction(tx, input));
}
