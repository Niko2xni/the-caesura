import Decimal from 'decimal.js';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  products,
  purchaseOrderLines,
  purchaseOrders,
  receipts,
  supplierItems,
  suppliers,
  user,
} from '@/db/schema';
import type { CreatePurchaseOrderInput } from '../validators/orders';

export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

export type OrderOperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

/**
 * Generates the next sequential PO number for a given calendar year.
 * Format: "PO-YYYY-####" (e.g. "PO-2026-0001")
 */
export async function generatePoNumber(orderDate: string, tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db): Promise<string> {
  const year = orderDate.slice(0, 4);
  const prefix = `PO-${year}-`;

  const [latest] = await tx
    .select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(sql`${purchaseOrders.poNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(purchaseOrders.poNumber))
    .limit(1);

  if (!latest) {
    return `${prefix}0001`;
  }

  const latestSeq = parseInt(latest.poNumber.slice(prefix.length), 10);
  const nextSeq = Number.isNaN(latestSeq) ? 1 : latestSeq + 1;
  return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
}

/**
 * Creates a new Purchase Order and its planned line items atomically.
 */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput & { userId: string },
): Promise<OrderOperationResult<{ purchaseOrderId: string; poNumber: string }>> {
  if (input.lines.length === 0) {
    return {
      ok: false,
      code: 'empty_lines',
      error: 'At least one line item is required.',
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Verify supplier is active
      const [supplier] = await tx
        .select({ id: suppliers.id, isActive: suppliers.isActive })
        .from(suppliers)
        .where(eq(suppliers.id, input.supplierId));

      if (!supplier || !supplier.isActive) {
        throw new OrderError('invalid_supplier', 'Selected supplier was not found or has been archived.');
      }

      // 2. Verify all products are active
      const uniqueProductIds = Array.from(new Set(input.lines.map((l) => l.productId)));
      const productRows = await tx
        .select({ id: products.id, isActive: products.isActive, name: products.name })
        .from(products)
        .where(inArray(products.id, uniqueProductIds));

      if (productRows.length !== uniqueProductIds.length || productRows.some((p) => !p.isActive)) {
        throw new OrderError('invalid_product', 'One or more selected products do not exist or have been archived.');
      }

      // 3. Generate sequential PO number
      const poNumber = await generatePoNumber(input.orderDate, tx);

      // 4. Insert purchase order
      const [insertedPo] = await tx
        .insert(purchaseOrders)
        .values({
          poNumber,
          supplierId: input.supplierId,
          orderDate: input.orderDate,
          expectedDeliveryDate: input.expectedDeliveryDate ?? null,
          status: 'submitted',
          notes: input.notes?.trim() || null,
          createdBy: input.userId,
        })
        .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });

      // 5. Insert lines
      const lineRows = input.lines.map((l) => ({
        purchaseOrderId: insertedPo.id,
        productId: l.productId,
        supplierItemId: l.supplierItemId ?? null,
        packCount: new Decimal(l.packCount).toFixed(3),
        packQuantity: new Decimal(l.packQuantity).toFixed(3),
        agreedPackCostCents: l.agreedPackCostCents ?? null,
        receivedPackCount: '0.000',
      }));

      await tx.insert(purchaseOrderLines).values(lineRows);

      return {
        purchaseOrderId: insertedPo.id,
        poNumber: insertedPo.poNumber,
      };
    });

    return { ok: true, data: result };
  } catch (err: unknown) {
    if (err instanceof OrderError) {
      return { ok: false, code: err.code, error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Failed to create purchase order';
    return { ok: false, code: 'db_error', error: message };
  }
}

/**
 * Cancels a purchase order if no items have been received against it yet.
 */
export async function cancelPurchaseOrder(
  purchaseOrderId: string,
  userId: string,
  reason?: string,
): Promise<OrderOperationResult<{ purchaseOrderId: string }>> {
  try {
    const result = await db.transaction(async (tx) => {
      const [po] = await tx
        .select({ id: purchaseOrders.id, status: purchaseOrders.status, notes: purchaseOrders.notes })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, purchaseOrderId))
        .for('update');

      if (!po) {
        throw new OrderError('not_found', 'Purchase order not found.');
      }

      if (po.status === 'cancelled') {
        throw new OrderError('already_cancelled', 'Purchase order is already cancelled.');
      }

      if (po.status === 'completed') {
        throw new OrderError('already_completed', 'Cannot cancel a completed purchase order.');
      }

      // Check if any lines have received inventory
      const lines = await tx
        .select({ receivedPackCount: purchaseOrderLines.receivedPackCount })
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));

      const hasReceipts = lines.some((l) => new Decimal(l.receivedPackCount).gt(0));
      if (hasReceipts) {
        throw new OrderError(
          'cannot_cancel_received',
          'Cannot cancel a purchase order that has already received stock deliveries.',
        );
      }

      const cancellationNote = reason?.trim() ? `[Cancelled: ${reason.trim()}]` : '[Cancelled]';
      const updatedNotes = po.notes ? `${po.notes}\n${cancellationNote}` : cancellationNote;

      await tx
        .update(purchaseOrders)
        .set({
          status: 'cancelled',
          notes: updatedNotes,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, purchaseOrderId));

      return { purchaseOrderId };
    });

    return { ok: true, data: result };
  } catch (err: unknown) {
    if (err instanceof OrderError) {
      return { ok: false, code: err.code, error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Failed to cancel purchase order';
    return { ok: false, code: 'db_error', error: message };
  }
}

export interface PurchaseOrderListItem {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  status: 'draft' | 'submitted' | 'partially_received' | 'completed' | 'cancelled';
  lineCount: number;
  totalEstimatedCostCents: number;
  totalOrderedPacks: string;
  totalReceivedPacks: string;
  isFullyReceived: boolean;
  createdAt: Date;
}

/**
 * Retrieves a list of Purchase Orders with aggregated line item counts and progress.
 */
export async function getPurchaseOrdersList(opts?: {
  supplierId?: string;
  status?: 'draft' | 'submitted' | 'partially_received' | 'completed' | 'cancelled';
}): Promise<PurchaseOrderListItem[]> {
  const conditions = [];
  if (opts?.supplierId) {
    conditions.push(eq(purchaseOrders.supplierId, opts.supplierId));
  }
  if (opts?.status) {
    conditions.push(eq(purchaseOrders.status, opts.status));
  }

  const baseQuery = db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      orderDate: purchaseOrders.orderDate,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      status: purchaseOrders.status,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(purchaseOrders.createdAt));

  const rows = await baseQuery;
  if (rows.length === 0) return [];

  const poIds = rows.map((r) => r.id);
  const lineRows = await db
    .select({
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      packCount: purchaseOrderLines.packCount,
      receivedPackCount: purchaseOrderLines.receivedPackCount,
      agreedPackCostCents: purchaseOrderLines.agreedPackCostCents,
    })
    .from(purchaseOrderLines)
    .where(inArray(purchaseOrderLines.purchaseOrderId, poIds));

  const statsMap = new Map<
    string,
    {
      lineCount: number;
      totalEstimatedCostCents: number;
      totalOrderedPacks: Decimal;
      totalReceivedPacks: Decimal;
    }
  >();

  for (const l of lineRows) {
    const existing = statsMap.get(l.purchaseOrderId) || {
      lineCount: 0,
      totalEstimatedCostCents: 0,
      totalOrderedPacks: new Decimal(0),
      totalReceivedPacks: new Decimal(0),
    };

    existing.lineCount += 1;
    existing.totalOrderedPacks = existing.totalOrderedPacks.plus(l.packCount);
    existing.totalReceivedPacks = existing.totalReceivedPacks.plus(l.receivedPackCount);

    if (l.agreedPackCostCents !== null) {
      existing.totalEstimatedCostCents += new Decimal(l.packCount)
        .mul(l.agreedPackCostCents)
        .toDecimalPlaces(0)
        .toNumber();
    }

    statsMap.set(l.purchaseOrderId, existing);
  }

  return rows.map((r) => {
    const stats = statsMap.get(r.id) || {
      lineCount: 0,
      totalEstimatedCostCents: 0,
      totalOrderedPacks: new Decimal(0),
      totalReceivedPacks: new Decimal(0),
    };

    const isFullyReceived =
      stats.lineCount > 0 && stats.totalReceivedPacks.gte(stats.totalOrderedPacks);

    return {
      ...r,
      lineCount: stats.lineCount,
      totalEstimatedCostCents: stats.totalEstimatedCostCents,
      totalOrderedPacks: stats.totalOrderedPacks.toFixed(3),
      totalReceivedPacks: stats.totalReceivedPacks.toFixed(3),
      isFullyReceived,
    };
  });
}

export interface PurchaseOrderDetailLine {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: string;
  supplierItemId: string | null;
  supplierSku: string | null;
  packCount: string; // ordered
  packQuantity: string;
  agreedPackCostCents: number | null;
  receivedPackCount: string;
  outstandingPackCount: string;
  isShortDelivery: boolean;
  isFullyReceived: boolean;
}

export interface PurchaseOrderDetail {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierContact: string | null;
  orderDate: string;
  expectedDeliveryDate: string | null;
  status: 'draft' | 'submitted' | 'partially_received' | 'completed' | 'cancelled';
  notes: string | null;
  createdByName: string;
  createdAt: Date;
  lines: PurchaseOrderDetailLine[];
  linkedReceipts: {
    id: string;
    deliveryDate: string;
    reference: string | null;
    source: string;
    createdAt: Date;
  }[];
}

/**
 * Retrieves comprehensive details for a specific Purchase Order,
 * including ordered vs received line comparisons and linked deliveries.
 */
export async function getPurchaseOrderDetail(purchaseOrderId: string): Promise<PurchaseOrderDetail | null> {
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      supplierContact: suppliers.contactName,
      orderDate: purchaseOrders.orderDate,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      status: purchaseOrders.status,
      notes: purchaseOrders.notes,
      createdByName: user.name,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(user, eq(purchaseOrders.createdBy, user.id))
    .where(eq(purchaseOrders.id, purchaseOrderId));

  if (!po) return null;

  const lines = await db
    .select({
      id: purchaseOrderLines.id,
      productId: purchaseOrderLines.productId,
      productName: products.name,
      productSku: products.sku,
      baseUnit: products.baseUnit,
      supplierItemId: purchaseOrderLines.supplierItemId,
      supplierSku: supplierItems.supplierSku,
      packCount: purchaseOrderLines.packCount,
      packQuantity: purchaseOrderLines.packQuantity,
      agreedPackCostCents: purchaseOrderLines.agreedPackCostCents,
      receivedPackCount: purchaseOrderLines.receivedPackCount,
    })
    .from(purchaseOrderLines)
    .innerJoin(products, eq(purchaseOrderLines.productId, products.id))
    .leftJoin(supplierItems, eq(purchaseOrderLines.supplierItemId, supplierItems.id))
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId))
    .orderBy(products.name);

  const formattedLines: PurchaseOrderDetailLine[] = lines.map((l) => {
    const ordered = new Decimal(l.packCount);
    const received = new Decimal(l.receivedPackCount);
    const outstanding = Decimal.max(0, ordered.minus(received));
    const isFullyReceived = received.gte(ordered);
    const isShortDelivery = (po.status === 'partially_received' || po.status === 'completed') && received.lt(ordered);

    return {
      ...l,
      outstandingPackCount: outstanding.toFixed(3),
      isShortDelivery,
      isFullyReceived,
    };
  });

  const linkedReceipts = await db
    .select({
      id: receipts.id,
      deliveryDate: receipts.deliveryDate,
      reference: receipts.reference,
      source: receipts.source,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .where(eq(receipts.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(receipts.deliveryDate));

  return {
    ...po,
    lines: formattedLines,
    linkedReceipts,
  };
}

