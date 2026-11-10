import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { client, db } from './index';
import { batches, products, settings, stockMovements, suppliers, user } from './schema';

const testRunId = crypto.randomUUID().slice(0, 8);

let testUserId: string;
let testSupplierId: string;
let testProductId: string;

async function createBatchWithInitialReceipt(
  quantity: string,
  expiryDate: string | null,
): Promise<string> {
  const [batch] = await db
    .insert(batches)
    .values({
      productId: testProductId,
      supplierId: testSupplierId,
      expiryDate,
      expirySource: expiryDate ? 'printed' : null,
      unitCost: '100.000000',
      initialQuantity: quantity,
    })
    .returning({ id: batches.id });

  await db.insert(stockMovements).values({
    batchId: batch.id,
    productId: testProductId,
    type: 'receipt',
    quantity,
    createdBy: testUserId,
  });

  return batch.id;
}

async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
    expect.unreachable(`Expected query to reject matching ${pattern}`);
  } catch (error) {
    const err = error as { message?: string; cause?: { message?: string } };
    const rootMessage = err.cause?.message ?? err.message ?? '';
    expect(rootMessage).toMatch(pattern);
  }
}

describe('Ledger database constraints, triggers, and stock views', () => {
  beforeAll(async () => {
    // business_today() reads timezone from settings row id = 1
    await db
      .insert(settings)
      .values({
        id: 1,
        businessName: 'The Caesura Test Cafe',
        currency: 'PHP',
        timezone: 'Asia/Manila',
      })
      .onConflictDoNothing({ target: settings.id });

    testUserId = `test-user-${testRunId}`;
    await db.insert(user).values({
      id: testUserId,
      name: 'Test Runner',
      email: `runner-${testRunId}@example.local`,
      role: 'admin',
    });

    const [supplier] = await db
      .insert(suppliers)
      .values({ name: `Test Supplier ${testRunId}` })
      .returning({ id: suppliers.id });
    testSupplierId = supplier.id;

    const [product] = await db
      .insert(products)
      .values({
        sku: `TEST-MILK-${testRunId}`,
        name: `Test Milk ${testRunId}`,
        nameNormalized: `test milk ${testRunId}`,
        baseUnit: 'ml',
        tracksExpiry: true,
        shelfLifeDays: 7,
      })
      .returning({ id: products.id });
    testProductId = product.id;
  });

  afterAll(async () => {
    await client.end();
  });

  it('rejects UPDATE and DELETE on stock_movements via append-only trigger', async () => {
    const batchId = await createBatchWithInitialReceipt('10.000', null);

    const [movement] = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, batchId));

    await expectDbError(
      db
        .update(stockMovements)
        .set({ quantity: '99.000' })
        .where(eq(stockMovements.id, movement.id)),
      /stock_movements is append-only/,
    );

    await expectDbError(
      db.delete(stockMovements).where(eq(stockMovements.id, movement.id)),
      /stock_movements is append-only/,
    );
  });

  it('rejects overdrawing a batch below zero and rolls back the transaction', async () => {
    const batchId = await createBatchWithInitialReceipt('10.000', null);

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(stockMovements).values({
          batchId,
          productId: testProductId,
          type: 'usage',
          quantity: '-15.000',
          createdBy: testUserId,
        });
      }),
    ).rejects.toThrow(/would go negative/);

    const rows = await db.execute<{ quantity_on_hand: string }>(
      sql`SELECT quantity_on_hand FROM batch_stock WHERE batch_id = ${batchId}`,
    );
    expect(rows[0]?.quantity_on_hand).toBe('10.000');
  });

  it('allows dipping negative mid-transaction when balanced to >= 0 before COMMIT', async () => {
    const batchId = await createBatchWithInitialReceipt('10.000', null);

    await db.transaction(async (tx) => {
      // Temporarily leaves batch at -5.000 mid-transaction
      await tx.insert(stockMovements).values({
        batchId,
        productId: testProductId,
        type: 'usage',
        quantity: '-15.000',
        createdBy: testUserId,
      });

      // Restores batch to 0.000 before COMMIT
      await tx.insert(stockMovements).values({
        batchId,
        productId: testProductId,
        type: 'adjustment',
        quantity: '5.000',
        note: 'Reconciled count',
        createdBy: testUserId,
      });
    });

    const rows = await db.execute<{ quantity_on_hand: string }>(
      sql`SELECT quantity_on_hand FROM batch_stock WHERE batch_id = ${batchId}`,
    );
    expect(rows[0]?.quantity_on_hand).toBe('0.000');
  });

  it('computes usable_quantity and expired_quantity in product_stock using business_today()', async () => {
    const [{ yesterday, tomorrow }] = await db.execute<{ yesterday: string; tomorrow: string }>(
      sql`SELECT (business_today() - 1)::text AS yesterday, (business_today() + 1)::text AS tomorrow`,
    );

    const [splitProduct] = await db
      .insert(products)
      .values({
        sku: `TEST-SPLIT-${testRunId}`,
        name: `Test Split ${testRunId}`,
        nameNormalized: `test split ${testRunId}`,
        baseUnit: 'each',
        tracksExpiry: true,
        shelfLifeDays: 5,
      })
      .returning({ id: products.id });

    const [expiredBatch] = await db
      .insert(batches)
      .values({
        productId: splitProduct.id,
        supplierId: testSupplierId,
        expiryDate: yesterday,
        expirySource: 'printed',
        initialQuantity: '4.000',
      })
      .returning({ id: batches.id });

    const [freshBatch] = await db
      .insert(batches)
      .values({
        productId: splitProduct.id,
        supplierId: testSupplierId,
        expiryDate: tomorrow,
        expirySource: 'printed',
        initialQuantity: '12.000',
      })
      .returning({ id: batches.id });

    await db.insert(stockMovements).values([
      {
        batchId: expiredBatch.id,
        productId: splitProduct.id,
        type: 'receipt',
        quantity: '4.000',
        createdBy: testUserId,
      },
      {
        batchId: freshBatch.id,
        productId: splitProduct.id,
        type: 'receipt',
        quantity: '12.000',
        createdBy: testUserId,
      },
      {
        batchId: freshBatch.id,
        productId: splitProduct.id,
        type: 'usage',
        quantity: '-2.500',
        createdBy: testUserId,
      },
    ]);

    const stockRows = await db.execute<{ usable_quantity: string; expired_quantity: string }>(
      sql`SELECT usable_quantity::text, expired_quantity::text FROM product_stock WHERE product_id = ${splitProduct.id}`,
    );

    expect(stockRows[0]).toEqual({
      usable_quantity: '9.500',
      expired_quantity: '4.000',
    });
  });
});
