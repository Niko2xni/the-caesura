import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { formatQuantity, type BaseUnit } from '@/lib/units';

export interface RecordAdjustmentInput {
  batchId: string;
  quantityDelta: string; // signed non-zero quantity in base units
  note: string;
  userId: string;
}

export type RecordAdjustmentResult =
  | { ok: true; data: { movementGroupId: string; batchId: string; quantityDelta: string } }
  | { ok: false; code: string; error: string };

/**
 * Records an admin inventory count adjustment on a specific batch.
 * Requires a non-empty note and a non-zero signed delta; locks the batch row first.
 */
export async function recordAdjustment(input: RecordAdjustmentInput): Promise<RecordAdjustmentResult> {
  const trimmedNote = input.note.trim();
  if (!trimmedNote) {
    return {
      ok: false,
      code: 'missing_note',
      error: 'Enter a note explaining the reason for this adjustment.',
    };
  }

  const delta = new Decimal(input.quantityDelta);
  if (delta.isZero()) {
    return {
      ok: false,
      code: 'zero_quantity',
      error: 'Adjustment quantity must be non-zero.',
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
      .select({ baseUnit: products.baseUnit })
      .from(products)
      .where(eq(products.id, batch.product_id));

    const stockRows = await tx.execute<{ quantity_on_hand: string }>(sql`
      SELECT quantity_on_hand::text AS quantity_on_hand
      FROM batch_stock
      WHERE batch_id = ${input.batchId}::uuid
    `);

    const onHand = new Decimal(stockRows[0]?.quantity_on_hand ?? '0');
    const resultingBalance = onHand.plus(delta);

    if (resultingBalance.lt(0)) {
      const unit = (product?.baseUnit ?? 'each') as BaseUnit;
      return {
        ok: false,
        code: 'would_go_negative',
        error: `This adjustment would drop the batch below zero. Current batch stock is ${formatQuantity(onHand, unit)}.`,
      };
    }

    const movementGroupId = crypto.randomUUID();

    await tx.insert(stockMovements).values({
      movementGroupId,
      batchId: batch.id,
      productId: batch.product_id,
      type: 'adjustment',
      quantity: delta.toFixed(3),
      note: trimmedNote,
      createdBy: input.userId,
    });

    return {
      ok: true,
      data: {
        movementGroupId,
        batchId: batch.id,
        quantityDelta: delta.toFixed(3),
      },
    };
  });
}

