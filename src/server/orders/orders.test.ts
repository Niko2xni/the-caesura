import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { client, db } from '@/db';
import { products, purchaseOrderLines, purchaseOrders, suppliers, user } from '@/db/schema';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  generatePoNumber,
  getPurchaseOrderDetail,
  getPurchaseOrdersList,
} from './orders';

const testRunId = crypto.randomUUID().slice(0, 8);

let testUserId: string;
let activeSupplierId: string;
let inactiveSupplierId: string;
let activeProductAId: string;
let activeProductBId: string;
let inactiveProductId: string;

describe('Purchase Orders engine integration tests', () => {
  beforeAll(async () => {
    testUserId = `order-user-${testRunId}`;
    await db.insert(user).values({
      id: testUserId,
      name: 'Order Tester',
      email: `order-${testRunId}@example.local`,
      role: 'admin',
    });

    const [sup1] = await db
      .insert(suppliers)
      .values({ name: `Active Supplier ${testRunId}`, isActive: true })
      .returning({ id: suppliers.id });
    activeSupplierId = sup1.id;

    const [sup2] = await db
      .insert(suppliers)
      .values({ name: `Inactive Supplier ${testRunId}`, isActive: false })
      .returning({ id: suppliers.id });
    inactiveSupplierId = sup2.id;

    const [prodA] = await db
      .insert(products)
      .values({
        sku: `PO-SKU-A-${testRunId}`,
        name: `PO Test Coffee Beans ${testRunId}`,
        nameNormalized: `po test coffee beans ${testRunId}`,
        baseUnit: 'g',
        tracksExpiry: true,
        shelfLifeDays: 90,
      })
      .returning({ id: products.id });
    activeProductAId = prodA.id;

    const [prodB] = await db
      .insert(products)
      .values({
        sku: `PO-SKU-B-${testRunId}`,
        name: `PO Test Oat Milk ${testRunId}`,
        nameNormalized: `po test oat milk ${testRunId}`,
        baseUnit: 'ml',
        tracksExpiry: true,
        shelfLifeDays: 30,
      })
      .returning({ id: products.id });
    activeProductBId = prodB.id;

    const [prodInactive] = await db
      .insert(products)
      .values({
        sku: `PO-SKU-INACTIVE-${testRunId}`,
        name: `Archived Syrup ${testRunId}`,
        nameNormalized: `archived syrup ${testRunId}`,
        baseUnit: 'ml',
        isActive: false,
      })
      .returning({ id: products.id });
    inactiveProductId = prodInactive.id;
  });

  afterAll(async () => {
    await client.end();
  });

  it('generates sequential PO numbers for a given calendar year', async () => {
    const testYear = '2099-05-10';
    const firstPo = await generatePoNumber(testYear);
    expect(firstPo).toMatch(/^PO-2099-\d{4}$/);

    const seq1 = parseInt(firstPo.slice('PO-2099-'.length), 10);
    const expectedSecondPo = `PO-2099-${(seq1 + 1).toString().padStart(4, '0')}`;

    // Create a PO record with firstPo to test sequence increment
    await db.insert(purchaseOrders).values({
      poNumber: firstPo,
      supplierId: activeSupplierId,
      orderDate: '2099-05-10',
      status: 'submitted',
      createdBy: testUserId,
    });

    const secondPo = await generatePoNumber(testYear);
    expect(secondPo).toBe(expectedSecondPo);
  });

  it('rejects PO creation with empty lines', async () => {
    const result = await createPurchaseOrder({
      supplierId: activeSupplierId,
      orderDate: '2026-11-12',
      lines: [],
      userId: testUserId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('empty_lines');
    }
  });

  it('rejects PO creation for non-existent or inactive supplier', async () => {
    const fakeSupplierId = crypto.randomUUID();
    const resultNonExistent = await createPurchaseOrder({
      supplierId: fakeSupplierId,
      orderDate: '2026-11-12',
      lines: [
        {
          productId: activeProductAId,
          packCount: '5.000',
          packQuantity: '1000.000',
          agreedPackCostCents: 85000,
        },
      ],
      userId: testUserId,
    });

    expect(resultNonExistent.ok).toBe(false);
    if (!resultNonExistent.ok) {
      expect(resultNonExistent.code).toBe('invalid_supplier');
    }

    const resultInactive = await createPurchaseOrder({
      supplierId: inactiveSupplierId,
      orderDate: '2026-11-12',
      lines: [
        {
          productId: activeProductAId,
          packCount: '5.000',
          packQuantity: '1000.000',
          agreedPackCostCents: 85000,
        },
      ],
      userId: testUserId,
    });

    expect(resultInactive.ok).toBe(false);
    if (!resultInactive.ok) {
      expect(resultInactive.code).toBe('invalid_supplier');
    }
  });

  it('rejects PO creation for non-existent or inactive products', async () => {
    const fakeProductId = crypto.randomUUID();
    const resultNonExistent = await createPurchaseOrder({
      supplierId: activeSupplierId,
      orderDate: '2026-11-12',
      lines: [
        {
          productId: fakeProductId,
          packCount: '5.000',
          packQuantity: '1000.000',
        },
      ],
      userId: testUserId,
    });

    expect(resultNonExistent.ok).toBe(false);
    if (!resultNonExistent.ok) {
      expect(resultNonExistent.code).toBe('invalid_product');
    }

    const resultInactive = await createPurchaseOrder({
      supplierId: activeSupplierId,
      orderDate: '2026-11-12',
      lines: [
        {
          productId: inactiveProductId,
          packCount: '5.000',
          packQuantity: '1000.000',
        },
      ],
      userId: testUserId,
    });

    expect(resultInactive.ok).toBe(false);
    if (!resultInactive.ok) {
      expect(resultInactive.code).toBe('invalid_product');
    }
  });

  it('creates purchase order atomically with lines and calculates details correctly', async () => {
    const createResult = await createPurchaseOrder({
      supplierId: activeSupplierId,
      orderDate: '2026-11-12',
      expectedDeliveryDate: '2026-11-15',
      notes: 'Initial opening stock replenishment',
      userId: testUserId,
      lines: [
        {
          productId: activeProductAId,
          packCount: '10.000',
          packQuantity: '1000.000',
          agreedPackCostCents: 85000, // 850.00 PHP * 10 = 8500.00 PHP (850000 cents)
        },
        {
          productId: activeProductBId,
          packCount: '24.000',
          packQuantity: '1000.000',
          agreedPackCostCents: 15500, // 155.00 PHP * 24 = 3720.00 PHP (372000 cents)
        },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { purchaseOrderId, poNumber } = createResult.data;
    expect(poNumber).toMatch(/^PO-2026-\d{4}$/);

    // Verify detail retrieval
    const detail = await getPurchaseOrderDetail(purchaseOrderId);
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.id).toBe(purchaseOrderId);
    expect(detail.poNumber).toBe(poNumber);
    expect(detail.supplierId).toBe(activeSupplierId);
    expect(detail.status).toBe('submitted');
    expect(detail.expectedDeliveryDate).toBe('2026-11-15');
    expect(detail.notes).toBe('Initial opening stock replenishment');
    expect(detail.createdByName).toBe('Order Tester');
    expect(detail.lines).toHaveLength(2);

    const lineA = detail.lines.find((l) => l.productId === activeProductAId);
    expect(lineA).toBeDefined();
    expect(lineA?.packCount).toBe('10.000');
    expect(lineA?.packQuantity).toBe('1000.000');
    expect(lineA?.agreedPackCostCents).toBe(85000);
    expect(lineA?.receivedPackCount).toBe('0.000');
    expect(lineA?.outstandingPackCount).toBe('10.000');
    expect(lineA?.isFullyReceived).toBe(false);
    expect(lineA?.isShortDelivery).toBe(false);

    // Verify listing query and aggregations
    const list = await getPurchaseOrdersList({ supplierId: activeSupplierId });
    const poItem = list.find((item) => item.id === purchaseOrderId);
    expect(poItem).toBeDefined();
    expect(poItem?.lineCount).toBe(2);
    expect(poItem?.totalOrderedPacks).toBe('34.000');
    expect(poItem?.totalReceivedPacks).toBe('0.000');
    expect(poItem?.isFullyReceived).toBe(false);
    // 85000 * 10 + 15500 * 24 = 850000 + 372000 = 1222000 cents
    expect(poItem?.totalEstimatedCostCents).toBe(1222000);
  });

  it('cancels an unfulfilled purchase order with a logged reason', async () => {
    const createResult = await createPurchaseOrder({
      supplierId: activeSupplierId,
      orderDate: '2026-11-12',
      userId: testUserId,
      lines: [
        {
          productId: activeProductAId,
          packCount: '2.000',
          packQuantity: '1000.000',
        },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const poId = createResult.data.purchaseOrderId;

    const cancelResult = await cancelPurchaseOrder(poId, testUserId, 'Supplier out of stock');
    expect(cancelResult.ok).toBe(true);

    const cancelledPo = await getPurchaseOrderDetail(poId);
    expect(cancelledPo?.status).toBe('cancelled');
    expect(cancelledPo?.notes).toContain('[Cancelled: Supplier out of stock]');

    // Cancelling again should fail
    const repeatCancel = await cancelPurchaseOrder(poId, testUserId);
    expect(repeatCancel.ok).toBe(false);
    if (!repeatCancel.ok) {
      expect(repeatCancel.code).toBe('already_cancelled');
    }
  });

  it('rejects cancellation when lines have already received deliveries', async () => {
    const createResult = await createPurchaseOrder({
      supplierId: activeSupplierId,
      orderDate: '2026-11-12',
      userId: testUserId,
      lines: [
        {
          productId: activeProductAId,
          packCount: '5.000',
          packQuantity: '1000.000',
        },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const poId = createResult.data.purchaseOrderId;

    // Simulate receiving items on a line
    await db
      .update(purchaseOrderLines)
      .set({ receivedPackCount: '2.000' })
      .where(eq(purchaseOrderLines.purchaseOrderId, poId));

    const cancelResult = await cancelPurchaseOrder(poId, testUserId);
    expect(cancelResult.ok).toBe(false);
    if (!cancelResult.ok) {
      expect(cancelResult.code).toBe('cannot_cancel_received');
    }
  });
});
