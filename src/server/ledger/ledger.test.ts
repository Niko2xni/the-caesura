import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { client, db } from '@/db';
import { batches, products, receiptLines, receipts, settings, stockMovements, supplierItems, suppliers, user } from '@/db/schema';
import { receiveDelivery } from './receive-delivery';
import { recordUsage } from './record-usage';
import { recordWaste } from './record-waste';
import { recordAdjustment } from './record-adjustment';
import { getProductDetail, getProductStockList, getTodayWorkLists } from './queries';
import { cancelPurchaseOrder, createPurchaseOrder, getPurchaseOrderDetail } from '../orders/orders';

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

  it('atomically creates and reuses supplier_items alias when saveSupplierAlias is requested during intake', async () => {
    const productId = await createProduct({ suffix: 'LEARNING-LOOP' });
    const [{ today }] = await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`);
    const rawPrintedDesc = `Barista Oat Milk 1L Box ${testRunId}`;

    const res = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'ai_extraction',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '6',
          packQuantity: '1000',
          expiryDate: today,
          expirySource: 'printed',
          matchMethod: 'manual',
          saveSupplierAlias: true,
          descriptionPrinted: rawPrintedDesc,
          supplierSku: 'B-OAT-1L',
          packLabel: '1L Box',
          lineCostCents: 120000,
        },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Verify supplier_items entry was created with normalized description
    const [createdAlias] = await db
      .select()
      .from(supplierItems)
      .where(
        and(
          eq(supplierItems.supplierId, testSupplierId),
          eq(supplierItems.productId, productId),
        ),
      );

    expect(createdAlias).toBeDefined();
    expect(createdAlias?.description).toBe(rawPrintedDesc);
    expect(createdAlias?.descriptionNormalized).toBe(rawPrintedDesc.toLowerCase());
    expect(createdAlias?.supplierSku).toBe('B-OAT-1L');
    expect(createdAlias?.packLabel).toBe('1L Box');
    expect(createdAlias?.packQuantity).toBe('1000.000');

    // Verify receipt_line links to the created supplier_item_id
    const [lineRecord] = await db
      .select()
      .from(receiptLines)
      .where(eq(receiptLines.receiptId, res.data.receiptId));

    expect(lineRecord).toBeDefined();
    expect(lineRecord?.supplierItemId).toBe(createdAlias?.id);

    // Second delivery: same rawPrintedDesc should reuse the existing alias rather than creating a duplicate
    const res2 = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'ai_extraction',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId,
          packCount: '3',
          packQuantity: '1000',
          expiryDate: today,
          expirySource: 'printed',
          matchMethod: 'manual',
          saveSupplierAlias: true,
          descriptionPrinted: rawPrintedDesc,
          packLabel: '1L Box',
        },
      ],
    });

    expect(res2.ok).toBe(true);
    if (!res2.ok) return;

    const matchingAliases = await db
      .select()
      .from(supplierItems)
      .where(
        and(
          eq(supplierItems.supplierId, testSupplierId),
          eq(supplierItems.productId, productId),
        ),
      );

    expect(matchingAliases).toHaveLength(1);

    const [lineRecord2] = await db
      .select()
      .from(receiptLines)
      .where(eq(receiptLines.receiptId, res2.data.receiptId));

    expect(lineRecord2?.supplierItemId).toBe(createdAlias?.id);
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

  it('links partial and split deliveries to a PO, tracks cost variance, and transitions status to completed', async () => {
    const [{ today }] = await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`);
    const prodA = await createProduct({ suffix: 'PO-LINK-A', tracksExpiry: false, shelfLifeDays: null });
    const prodB = await createProduct({ suffix: 'PO-LINK-B', tracksExpiry: false, shelfLifeDays: null });

    const poRes = await createPurchaseOrder({
      supplierId: testSupplierId,
      orderDate: today,
      userId: testUserId,
      lines: [
        {
          productId: prodA,
          packCount: '5.000',
          packQuantity: '1000.000',
          agreedPackCostCents: 85000,
        },
        {
          productId: prodB,
          packCount: '10.000',
          packQuantity: '1000.000',
          agreedPackCostCents: 15500,
        },
      ],
    });
    expect(poRes.ok).toBe(true);
    if (!poRes.ok) return;

    const poId = poRes.data.purchaseOrderId;
    const initialDetail = await getPurchaseOrderDetail(poId);
    expect(initialDetail).not.toBeNull();
    const lineA = initialDetail!.lines.find((l) => l.productId === prodA)!;
    const lineB = initialDetail!.lines.find((l) => l.productId === prodB)!;

    // Delivery 1: partial delivery of prodA (3 of 5 packs) at higher pack cost (90000 vs 85000)
    const idem1 = crypto.randomUUID();
    const del1Payload = {
      supplierId: testSupplierId,
      deliveryDate: today,
      reference: 'DR-PARTIAL-1',
      source: 'manual' as const,
      purchaseOrderId: poId,
      idempotencyKey: idem1,
      userId: testUserId,
      lines: [
        {
          productId: prodA,
          purchaseOrderLineId: lineA.id,
          packCount: '3.000',
          packQuantity: '1000.000',
          lineCostCents: 270000, // 90000/pack (+5000 variance)
          matchMethod: 'manual' as const,
        },
      ],
    };

    const del1 = await receiveDelivery(del1Payload);
    expect(del1.ok).toBe(true);
    if (!del1.ok) return;
    expect(del1.data.deduplicated).toBe(false);
    expect(del1.data.poSummary?.status).toBe('partially_received');
    expect(del1.data.poSummary?.hasShortDelivery).toBe(true);
    expect(del1.data.poSummary?.costVariances).toHaveLength(1);
    expect(del1.data.poSummary?.costVariances[0]).toMatchObject({
      purchaseOrderLineId: lineA.id,
      productId: prodA,
      agreedPackCostCents: 85000,
      actualPackCostCents: 90000,
      deltaCents: 5000,
    });

    // Idempotency check: retrying same key must NOT double-increment receivedPackCount
    const del1Retry = await receiveDelivery(del1Payload);
    expect(del1Retry.ok).toBe(true);
    if (del1Retry.ok) {
      expect(del1Retry.data.deduplicated).toBe(true);
    }

    const midDetail = await getPurchaseOrderDetail(poId);
    expect(midDetail?.status).toBe('partially_received');
    expect(midDetail?.linkedReceipts).toHaveLength(1);
    const midLineA = midDetail?.lines.find((l) => l.id === lineA.id);
    expect(midLineA?.receivedPackCount).toBe('3.000');
    expect(midLineA?.outstandingPackCount).toBe('2.000');
    expect(midLineA?.isShortDelivery).toBe(true);

    // Physical stock reflects actual received qty (3000), not ordered qty (5000)
    const stockMid = await getProductStockList();
    expect(stockMid.find((p) => p.id === prodA)?.usableQuantity).toBe('3000.000');

    // Delivery 2: completes remaining 2 packs of prodA and all 10 packs of prodB (without explicit line IDs)
    const del2 = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      reference: 'DR-FINAL-2',
      source: 'manual',
      purchaseOrderId: poId,
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: prodA,
          packCount: '2.000',
          packQuantity: '1000.000',
          lineCostCents: 170000, // 85000/pack (matches agreed cost)
          matchMethod: 'manual',
        },
        {
          productId: prodB,
          purchaseOrderLineId: lineB.id,
          packCount: '10.000',
          packQuantity: '1000.000',
          lineCostCents: 155000, // 15500/pack
          matchMethod: 'manual',
        },
      ],
    });
    expect(del2.ok).toBe(true);
    if (!del2.ok) return;
    expect(del2.data.poSummary?.status).toBe('completed');
    expect(del2.data.poSummary?.hasShortDelivery).toBe(false);
    expect(del2.data.poSummary?.costVariances).toHaveLength(0);

    const finalDetail = await getPurchaseOrderDetail(poId);
    expect(finalDetail?.status).toBe('completed');
    expect(finalDetail?.linkedReceipts).toHaveLength(2);
    expect(finalDetail?.lines.every((l) => l.isFullyReceived)).toBe(true);

    // Delivery 3 against completed PO is rejected
    const del3 = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'manual',
      purchaseOrderId: poId,
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: prodA,
          packCount: '1.000',
          packQuantity: '1000.000',
          matchMethod: 'manual',
        },
      ],
    });
    expect(del3.ok).toBe(false);
    if (!del3.ok) expect(del3.code).toBe('invalid_po_status');
  });

  it('rejects delivery linked to a cancelled PO or mismatched supplier PO', async () => {
    const [{ today }] = await db.execute<{ today: string }>(sql`SELECT business_today()::text AS today`);
    const prodId = await createProduct({ suffix: 'PO-GUARD', tracksExpiry: false, shelfLifeDays: null });
    const [otherSupplier] = await db
      .insert(suppliers)
      .values({ name: `Other PO Supplier ${testRunId}` })
      .returning({ id: suppliers.id });

    const poRes = await createPurchaseOrder({
      supplierId: testSupplierId,
      orderDate: today,
      userId: testUserId,
      lines: [
        {
          productId: prodId,
          packCount: '4.000',
          packQuantity: '1000.000',
        },
      ],
    });
    expect(poRes.ok).toBe(true);
    if (!poRes.ok) return;
    const poId = poRes.data.purchaseOrderId;

    // Mismatched supplier
    const mismatchRes = await receiveDelivery({
      supplierId: otherSupplier.id,
      deliveryDate: today,
      source: 'manual',
      purchaseOrderId: poId,
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: prodId,
          packCount: '4.000',
          packQuantity: '1000.000',
          matchMethod: 'manual',
        },
      ],
    });
    expect(mismatchRes.ok).toBe(false);
    if (!mismatchRes.ok) expect(mismatchRes.code).toBe('po_supplier_mismatch');

    // Cancel PO then try receiving
    await cancelPurchaseOrder(poId, testUserId, 'Test cancellation');
    const cancelledRes = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: today,
      source: 'manual',
      purchaseOrderId: poId,
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: prodId,
          packCount: '4.000',
          packQuantity: '1000.000',
          matchMethod: 'manual',
        },
      ],
    });
    expect(cancelledRes.ok).toBe(false);
    if (!cancelledRes.ok) expect(cancelledRes.code).toBe('invalid_po_status');
  });
});

