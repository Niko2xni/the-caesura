import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { client, db } from '@/db';
import { batches, products, receipts, settings, stockMovements, suppliers, user } from '@/db/schema';
import { receiveDelivery } from './receive-delivery';
import { recordUsage } from './record-usage';
import { recordWaste } from './record-waste';
import { recordAdjustment } from './record-adjustment';
import { getProductDetail, getProductStockList, getTodayWorkLists } from './queries';

const testRunId = crypto.randomUUID().slice(0, 8);

let testUserId: string;
let testSupplierId: string;

async function createProduct(opts: {
  suffix: string;
  baseUnit?: 'each' | 'g' | 'ml';
  tracksExpiry?: boolean;
  shelfLifeDays?: number | null;
  reorderPoint?: string;
}) {
  const [prod] = await db
    .insert(products)
    .values({
      sku: `SKU-${testRunId}-${opts.suffix}`,
      name: `Test Product ${opts.suffix} ${testRunId}`,
      nameNormalized: `test product ${opts.suffix.toLowerCase()} ${testRunId}`,
      baseUnit: opts.baseUnit ?? 'ml',
      tracksExpiry: opts.tracksExpiry ?? true,
      shelfLifeDays: opts.shelfLifeDays === undefined ? 7 : opts.shelfLifeDays,
      reorderPoint: opts.reorderPoint ?? '0.000',
    })
    .returning({ id: products.id });

  return prod.id;
}

describe('Ledger integration tests against real PostgreSQL 17', () => {
  beforeAll(async () => {
    await db
      .insert(settings)
      .values({
        id: 1,
        businessName: 'The Caesura Test Cafe',
        currency: 'PHP',
        timezone: 'Asia/Manila',
      })
      .onConflictDoNothing({ target: settings.id });

    testUserId = `ledger-user-${testRunId}`;
    await db.insert(user).values({
      id: testUserId,
      name: 'Ledger Tester',
      email: `ledger-${testRunId}@example.local`,
      role: 'admin',
    });

    const [sup] = await db
      .insert(suppliers)
      .values({ name: `Ledger Supplier ${testRunId}` })
      .returning({ id: suppliers.id });
    testSupplierId = sup.id;
  });

  afterAll(async () => {
    await client.end();
  });

  it('idempotency: confirming the same receipt twice creates exactly one receipt and one batch', async () => {
    const productId = await createProduct({ suffix: 'IDEMPOTENT' });
    const idempotencyKey = crypto.randomUUID();

    const [{ today }] = await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`);

    const payload = {
      supplierId: testSupplierId,
      deliveryDate: today,
      reference: 'DN-1001',
      source: 'manual' as const,
      idempotencyKey,
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '2',
          packQuantity: '1000',
          lineCostCents: 24000,
          matchMethod: 'manual' as const,
        },
      ],
    };

    const first = await receiveDelivery(payload);
    const second = await receiveDelivery(payload);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.data.deduplicated).toBe(false);
    expect(second.data.deduplicated).toBe(true);
    expect(second.data.receiptId).toBe(first.data.receiptId);

    const receiptCount = await db
      .select({ id: receipts.id })
      .from(receipts)
      .where(eq(receipts.idempotencyKey, idempotencyKey));
    expect(receiptCount).toHaveLength(1);

    const detail = await getProductDetail(productId);
    expect(detail?.usableQuantity).toBe('2000.000');
    expect(detail?.batches).toHaveLength(1);
    expect(detail?.batches[0]?.expirySource).toBe('estimated');
    expect(detail?.batches[0]?.unitCost).toBe('0.120000');
  });

  it('rejects receiving a tracked product with no printed expiry and null shelfLifeDays', async () => {
    const productId = await createProduct({
      suffix: 'NO-SHELF-LIFE',
      tracksExpiry: true,
      shelfLifeDays: null,
    });

    const [{ today }] = await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`);

    const res = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '1',
          packQuantity: '500',
          matchMethod: 'manual',
        },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('missing_expiry');
    }
  });

  it('allocates usage by FEFO, skips expired batches, shares movement_group_id, and writes nothing on shortfall', async () => {
    const productId = await createProduct({ suffix: 'FEFO-USAGE', baseUnit: 'ml' });

    const [{ yesterday, day3, day6, today }] = await db.execute<{
      yesterday: string;
      day3: string;
      day6: string;
      today: string;
    }>(sql`
      SELECT
        (business_today() - 1)::text AS yesterday,
        (business_today() + 3)::text AS day3,
        (business_today() + 6)::text AS day6,
        business_today()::text AS today
    `);

    // Receive expired batch (5000 ml), batch A expiring in 3 days (4000 ml), batch B expiring in 6 days (10000 ml)
    const r = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '5',
          packQuantity: '1000',
          expiryDate: yesterday,
          expirySource: 'printed',
          matchMethod: 'manual',
        },
        {
          productId,
          packCount: '10',
          packQuantity: '1000',
          expiryDate: day6,
          expirySource: 'printed',
          matchMethod: 'manual',
        },
        {
          productId,
          packCount: '4',
          packQuantity: '1000',
          expiryDate: day3,
          expirySource: 'printed',
          matchMethod: 'manual',
        },
      ],
    });
    expect(r.ok).toBe(true);

    // Use 6000 ml: should skip expired (5000), drain day3 (4000), and take 2000 from day6
    const usageOk = await recordUsage({
      productId,
      quantity: '6000',
      note: 'Morning espresso shift',
      userId: testUserId,
    });

    expect(usageOk.ok).toBe(true);
    if (!usageOk.ok) return;

    expect(usageOk.data.allocations).toHaveLength(2);
    expect(usageOk.data.allocations[0]?.quantity).toBe('4000.000');
    expect(usageOk.data.allocations[1]?.quantity).toBe('2000.000');

    // Both movements must share the same movement_group_id
    const groupMovements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.movementGroupId, usageOk.data.movementGroupId));
    expect(groupMovements).toHaveLength(2);

    const detail = await getProductDetail(productId);
    expect(detail?.usableQuantity).toBe('8000.000');
    expect(detail?.expiredQuantity).toBe('5000.000');

    // Shortfall: requesting 20000 ml when only 8000 ml is usable must write nothing
    const shortfall = await recordUsage({
      productId,
      quantity: '20000',
      userId: testUserId,
    });
    expect(shortfall.ok).toBe(false);
    if (!shortfall.ok) {
      expect(shortfall.code).toBe('shortfall');
      expect(shortfall.shortfall).toBe('12000.000');
    }

    const detailAfterShortfall = await getProductDetail(productId);
    expect(detailAfterShortfall?.usableQuantity).toBe('8000.000');
  });

  it('concurrency: two simultaneous usages on the same batch cannot overdraw it', async () => {
    const productId = await createProduct({ suffix: 'CONCURRENT', baseUnit: 'g' });
    const [{ today }] = await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`);

    const recv = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '1',
          packQuantity: '1000',
          matchMethod: 'manual',
        },
      ],
    });
    expect(recv.ok).toBe(true);

    // Two concurrent requests each try to take 700 g out of 1000 g
    const [resA, resB] = await Promise.all([
      recordUsage({ productId, quantity: '700', userId: testUserId }),
      recordUsage({ productId, quantity: '700', userId: testUserId }),
    ]);

    const successes = [resA, resB].filter((r) => r.ok);
    const failures = [resA, resB].filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failures[0].ok) {
      expect(failures[0].code).toBe('shortfall');
    }

    const detail = await getProductDetail(productId);
    expect(detail?.usableQuantity).toBe('300.000');
  });

  it('writes off expired and usable stock via recordWaste and prevents over-write-off', async () => {
    const productId = await createProduct({ suffix: 'WASTE', baseUnit: 'each' });
    const [{ yesterday }] = await db.execute<{ yesterday: string }>(
      sql`SELECT (business_today() - 1)::text AS yesterday`,
    );

    await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: yesterday,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '12',
          packQuantity: '1',
          expiryDate: yesterday,
          expirySource: 'printed',
          matchMethod: 'manual',
        },
      ],
    });

    const [batch] = await db
      .select({ id: batches.id })
      .from(batches)
      .where(eq(batches.productId, productId));

    const overWriteOff = await recordWaste({
      batchId: batch.id,
      quantity: '15',
      wasteReason: 'expired',
      userId: testUserId,
    });
    expect(overWriteOff.ok).toBe(false);

    const validWriteOff = await recordWaste({
      batchId: batch.id,
      quantity: '12',
      wasteReason: 'expired',
      note: 'End-of-day disposal',
      userId: testUserId,
    });
    expect(validWriteOff.ok).toBe(true);

    const detail = await getProductDetail(productId);
    expect(detail?.expiredQuantity).toBe('0.000');
    expect(detail?.usableQuantity).toBe('0.000');
  });

  it('records positive and negative admin adjustments with mandatory notes', async () => {
    const productId = await createProduct({ suffix: 'ADJUST', baseUnit: 'g', tracksExpiry: false, shelfLifeDays: null });
    const [{ today }] = await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`);

    await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '1',
          packQuantity: '500',
          matchMethod: 'manual',
        },
      ],
    });

    const [batch] = await db
      .select({ id: batches.id })
      .from(batches)
      .where(eq(batches.productId, productId));

    const noNote = await recordAdjustment({
      batchId: batch.id,
      quantityDelta: '-100',
      note: '   ',
      userId: testUserId,
    });
    expect(noNote.ok).toBe(false);
    if (!noNote.ok) expect(noNote.code).toBe('missing_note');

    const negativeOver = await recordAdjustment({
      batchId: batch.id,
      quantityDelta: '-600',
      note: 'Count correction',
      userId: testUserId,
    });
    expect(negativeOver.ok).toBe(false);
    if (!negativeOver.ok) expect(negativeOver.code).toBe('would_go_negative');

    const positiveAdj = await recordAdjustment({
      batchId: batch.id,
      quantityDelta: '150',
      note: 'Found unopened pack during stocktake',
      userId: testUserId,
    });
    expect(positiveAdj.ok).toBe(true);

    const list = await getProductStockList();
    const item = list.find((p) => p.id === productId);
    expect(item?.usableQuantity).toBe('650.000');
  });

  it('populates today actionable work lists: expired, use soon, and reorder', async () => {
    const today = (await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`))[0].today;
    const [year, month, day] = today.split('-').map(Number);
    const useSoonDate = new Date(Date.UTC(year, month - 1, day + 2)).toISOString().slice(0, 10);
    const expiredDate = new Date(Date.UTC(year, month - 1, day - 3)).toISOString().slice(0, 10);

    const productId = await createProduct({
      suffix: 'TODAY-WL',
      baseUnit: 'ml',
      tracksExpiry: true,
      reorderPoint: '5000.000',
    });

    // Receive expired batch
    const [expBatch] = await db
      .insert(batches)
      .values({
        productId,
        expiryDate: expiredDate,
        expirySource: 'printed',
        initialQuantity: '1000.000',
      })
      .returning({ id: batches.id });

    await db.insert(stockMovements).values({
      batchId: expBatch.id,
      productId,
      type: 'receipt',
      quantity: '1000.000',
      createdBy: testUserId,
    });

    // Receive use-soon batch
    const [soonBatch] = await db
      .insert(batches)
      .values({
        productId,
        expiryDate: useSoonDate,
        expirySource: 'printed',
        initialQuantity: '1200.000',
      })
      .returning({ id: batches.id });

    await db.insert(stockMovements).values({
      batchId: soonBatch.id,
      productId,
      type: 'receipt',
      quantity: '1200.000',
      createdBy: testUserId,
    });

    const workLists = await getTodayWorkLists();

    // 1. Expired batch check
    const foundExpired = workLists.expiredBatches.find((b) => b.batchId === expBatch.id);
    expect(foundExpired).toBeDefined();
    expect(foundExpired?.quantityOnHand).toBe('1000.000');
    expect(foundExpired?.daysExpired).toBeGreaterThanOrEqual(3);

    // 2. Use-soon batch check
    const foundUseSoon = workLists.useSoonBatches.find((b) => b.batchId === soonBatch.id);
    expect(foundUseSoon).toBeDefined();
    expect(foundUseSoon?.quantityOnHand).toBe('1200.000');
    expect(foundUseSoon?.daysRemaining).toBe(2);

    // 3. Reorder check (usable is 1200 <= 5000 reorder point)
    const foundReorder = workLists.reorderProducts.find((p) => p.productId === productId);
    expect(foundReorder).toBeDefined();
    expect(foundReorder?.usableQuantity).toBe('1200.000');
    expect(foundReorder?.reorderPoint).toBe('5000.000');
  });
});

