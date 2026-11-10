import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { formatQuantity, type BaseUnit } from '@/lib/units';

export type WasteReason = 'expired' | 'spoiled' | 'damaged' | 'other';

export interface RecordWasteInput {
  batchId: string;
  quantity: string; // positive amount to write off in base units
  wasteReason: WasteReason;
  note?: string | null;
  userId: string;
}

export type RecordWasteResult =
  | { ok: true; data: { movementGroupId: string; batchId: string; quantity: string } }
  | { ok: false; code: string; error: string };

/**
 * Records a waste write-off against a specific batch (including expired batches).
 * Locks the target batch row with FOR UPDATE before reading batch_stock.
 */
export async function recordWaste(input: RecordWasteInput): Promise<RecordWasteResult> {
  const wasteQty = new Decimal(input.quantity);
  if (wasteQty.lte(0)) {
    return {
      ok: false,
      code: 'invalid_quantity',
      error: 'Write-off quantity must be greater than zero.',
    };
  }

  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string; product_id: string }>(sql`
      SELECT id, product_id
      FROM batches
      WHERE id = ${input.batchId}::uuid
      FOR UPDATE
    `);

    if (locked.length === 0) {
      return {
        ok: false,
        code: 'batch_not_found',
        error: 'The selected batch was not found.',
      };
    }

    const batch = locked[0];
    const [product] = await tx
      .select({ name: products.name, baseUnit: products.baseUnit })
      .from(products)
      .where(eq(products.id, batch.product_id));

    const stockRows = await tx.execute<{ quantity_on_hand: string }>(sql`
      SELECT quantity_on_hand::text AS quantity_on_hand
      FROM batch_stock
      WHERE batch_id = ${input.batchId}::uuid
    `);

    const onHand = new Decimal(stockRows[0]?.quantity_on_hand ?? '0');
    if (wasteQty.gt(onHand)) {
      const unit = (product?.baseUnit ?? 'each') as BaseUnit;
      return {
        ok: false,
        code: 'insufficient_batch_stock',
        error: `Only ${formatQuantity(onHand, unit)} remains in this batch. Enter ${formatQuantity(onHand, unit)} or less.`,
      };
    }

    const movementGroupId = crypto.randomUUID();

    await tx.insert(stockMovements).values({
      movementGroupId,
      batchId: batch.id,
      productId: batch.product_id,
      type: 'waste',
      quantity: wasteQty.negated().toFixed(3),
      wasteReason: input.wasteReason,
      note: input.note?.trim() || null,
      createdBy: input.userId,
    });

    return {
      ok: true,
      data: {
        movementGroupId,
        batchId: batch.id,
        quantity: wasteQty.toFixed(3),
      },
    };
  });
}

