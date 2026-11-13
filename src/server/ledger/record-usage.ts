import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import { allocateFefo, type Allocation, type BatchCandidate } from './allocate-fefo';

export interface RecordUsageInput {
  productId: string;
  quantity: string; // positive base units
  note?: string | null;
  userId: string;
}

export type RecordUsageResult =
  | { ok: true; data: { movementGroupId: string; allocations: Allocation[] } }
  | { ok: false; code: string; error: string; shortfall?: string; available?: string };

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Records FEFO usage inside an existing database transaction.
 * Callers locking multiple products in one transaction must sort productIds
 * lexicographically before invoking this helper to prevent lock-order deadlocks.
 */
export async function recordUsageInTransaction(
  tx: DbTx,
  input: RecordUsageInput & { movementGroupId?: string },
): Promise<RecordUsageResult> {
  const requested = new Decimal(input.quantity);
  if (requested.lte(0)) {
    return {
      ok: false,
      code: 'invalid_quantity',
      error: 'Usage quantity must be greater than zero.',
    };
  }

  const [product] = await tx
    .select({
      id: products.id,
      name: products.name,
      baseUnit: products.baseUnit,
      isActive: products.isActive,
    })
    .from(products)
    .where(eq(products.id, input.productId));

  if (!product || !product.isActive) {
    return {
      ok: false,
      code: 'product_not_found',
      error: 'Product was not found or has been archived.',
    };
  }

  // L5: Lock underlying batch rows first; views with aggregates cannot be locked directly.
  const lockedBatches = await tx.execute<{ id: string }>(sql`
    SELECT id
    FROM batches
    WHERE product_id = ${input.productId}::uuid
      AND (expiry_date IS NULL OR expiry_date >= business_today())
    ORDER BY expiry_date NULLS LAST, received_at, id
    FOR UPDATE
  `);

  const lockedIds = lockedBatches.map((row) => row.id);
  let candidates: BatchCandidate[] = [];

  if (lockedIds.length > 0) {
    const idList = sql.join(
      lockedIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );

    const stockRows = await tx.execute<{
      batch_id: string;
      expiry_date: string | null;
      received_at: Date | string;
      quantity_on_hand: string;
    }>(sql`
      SELECT
        batch_id,
        expiry_date::text AS expiry_date,
        received_at,
        quantity_on_hand::text AS quantity_on_hand
      FROM batch_stock
      WHERE batch_id IN (${idList})
        AND quantity_on_hand > 0
    `);

    candidates = stockRows.map((row) => ({
      id: row.batch_id,
      expiryDate: row.expiry_date,
      receivedAt: row.received_at,
      quantityOnHand: row.quantity_on_hand,
    }));
  }

  const allocationResult = allocateFefo(candidates, requested);
  if (!allocationResult.ok) {
    const unit = product.baseUnit as BaseUnit;
    const availableLabel = formatQuantity(allocationResult.available, unit);
    const shortfallLabel = formatQuantity(allocationResult.shortfall, unit);
    return {
      ok: false,
      code: 'shortfall',
      error: `Only ${availableLabel} of ${product.name} is usable. You need ${shortfallLabel} more.`,
      shortfall: allocationResult.shortfall,
      available: allocationResult.available,
    };
  }

  const movementGroupId = input.movementGroupId ?? crypto.randomUUID();
  const trimmedNote = input.note?.trim() || null;

  await tx.insert(stockMovements).values(
    allocationResult.allocations.map((alloc) => ({
      movementGroupId,
      batchId: alloc.batchId,
      productId: input.productId,
      type: 'usage' as const,
      quantity: new Decimal(alloc.quantity).negated().toFixed(3),
      note: trimmedNote,
      createdBy: input.userId,
    })),
  );

  return {
    ok: true,
    data: {
      movementGroupId,
      allocations: allocationResult.allocations,
    },
  };
}

/**
 * Records consumption of a product in FEFO order.
 * Locks all usable batches for the product with SELECT ... FOR UPDATE before reading
 * batch_stock and writing negative usage movements under a shared movement_group_id.
 */
export async function recordUsage(input: RecordUsageInput): Promise<RecordUsageResult> {
  const requested = new Decimal(input.quantity);
  if (requested.lte(0)) {
    return {
      ok: false,
      code: 'invalid_quantity',
      error: 'Usage quantity must be greater than zero.',
    };
  }

  return db.transaction((tx) => recordUsageInTransaction(tx, input));
}

