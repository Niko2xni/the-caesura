import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  batches,
  products,
  purchaseOrderLines,
  purchaseOrders,
  receiptLines,
  receipts,
  stockMovements,
  supplierItems,
  suppliers,
} from '@/db/schema';
import { addDays } from '@/lib/dates';
import { computeUnitCost } from '@/lib/money';
import { normalizeText } from '@/lib/normalise';

export interface ReceiveLineInput {
  productId: string;
  supplierItemId?: string | null;
  purchaseOrderLineId?: string | null;
  descriptionPrinted?: string | null;
  packCount: string;
  packQuantity: string;
  lineCostCents?: number | null;
  expiryDate?: string | null;
  expirySource?: 'printed' | 'estimated' | 'manual' | null;
  lotCode?: string | null;
  matchMethod: 'exact' | 'suggested' | 'manual' | 'new_item';
  saveSupplierAlias?: boolean;
  supplierSku?: string | null;
  packLabel?: string | null;
}

export interface ReceiveDeliveryInput {
  supplierId: string;
  deliveryDate: string; // YYYY-MM-DD
  reference?: string | null;
  source: 'manual' | 'ai_extraction';
  extractionId?: string | null;
  purchaseOrderId?: string | null;
  idempotencyKey: string;
  userId: string;
  lines: ReceiveLineInput[];
}

export interface PoCostVariance {
  purchaseOrderLineId: string;
  productId: string;
  productName: string;
  agreedPackCostCents: number;
  actualPackCostCents: number;
  deltaCents: number;
}

export interface PoFulfillmentSummary {
  purchaseOrderId: string;
  poNumber: string;
  status: 'submitted' | 'partially_received' | 'completed';
  hasShortDelivery: boolean;
  costVariances: PoCostVariance[];
}

export type ReceiveDeliveryResult =
  | {
      ok: true;
      data: {
        receiptId: string;
        movementGroupId: string | null;
        deduplicated: boolean;
        poSummary?: PoFulfillmentSummary | null;
      };
    }
  | { ok: false; code: string; error: string };

class LedgerRollbackError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface TrackedPoLine {
  id: string;
  productId: string;
  ordered: Decimal;
  received: Decimal;
  agreedPackCostCents: number | null;
  dirty: boolean;
}

interface LockedPoState {
  id: string;
  poNumber: string;
  status: 'submitted' | 'partially_received';
  lines: TrackedPoLine[];
}

async function lockAndLoadPurchaseOrder(
  tx: DbTx,
  purchaseOrderId: string,
  supplierId: string,
): Promise<LockedPoState> {
  const [po] = await tx
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .for('update');

  if (!po) {
    throw new LedgerRollbackError('invalid_po', 'Linked purchase order was not found.');
  }

  if (po.status === 'cancelled') {
    throw new LedgerRollbackError('invalid_po_status', 'Cannot receive delivery against a cancelled purchase order.');
  }

  if (po.status === 'completed') {
    throw new LedgerRollbackError('invalid_po_status', 'Cannot receive delivery against a completed purchase order.');
  }

  if (po.status === 'draft') {
    throw new LedgerRollbackError(
      'invalid_po_status',
      'Cannot receive delivery against a draft purchase order. Submit it first.',
    );
  }

  if (po.supplierId !== supplierId) {
    throw new LedgerRollbackError(
      'po_supplier_mismatch',
      'Delivery supplier does not match the linked purchase order supplier.',
    );
  }

  const lines = await tx
    .select({
      id: purchaseOrderLines.id,
      productId: purchaseOrderLines.productId,
      packCount: purchaseOrderLines.packCount,
      receivedPackCount: purchaseOrderLines.receivedPackCount,
      agreedPackCostCents: purchaseOrderLines.agreedPackCostCents,
    })
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, po.id));

  return {
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      ordered: new Decimal(l.packCount),
      received: new Decimal(l.receivedPackCount),
      agreedPackCostCents: l.agreedPackCostCents,
      dirty: false,
    })),
  };
}

function applyLineToPurchaseOrder(
  line: ReceiveLineInput,
  productName: string,
  poState: LockedPoState,
  costVariances: PoCostVariance[],
): void {
  let matchedPoLine: TrackedPoLine | undefined;

  if (line.purchaseOrderLineId) {
    matchedPoLine = poState.lines.find((l) => l.id === line.purchaseOrderLineId);
    if (!matchedPoLine) {
      throw new LedgerRollbackError(
        'invalid_po_line',
        'Referenced purchase order line does not belong to the linked purchase order.',
      );
    }
    if (matchedPoLine.productId !== line.productId) {
      throw new LedgerRollbackError(
        'po_line_product_mismatch',
        'Received product does not match the linked purchase order line.',
      );
    }
  } else {
    matchedPoLine =
      poState.lines.find((l) => l.productId === line.productId && l.received.lt(l.ordered)) ??
      poState.lines.find((l) => l.productId === line.productId);
  }

  if (!matchedPoLine) return;

  matchedPoLine.received = matchedPoLine.received.plus(new Decimal(line.packCount));
  matchedPoLine.dirty = true;

  if (matchedPoLine.agreedPackCostCents !== null && line.lineCostCents !== undefined && line.lineCostCents !== null) {
    const actualPackCostCents = new Decimal(line.lineCostCents)
      .div(new Decimal(line.packCount))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (actualPackCostCents !== matchedPoLine.agreedPackCostCents) {
      costVariances.push({
        purchaseOrderLineId: matchedPoLine.id,
        productId: line.productId,
        productName,
        agreedPackCostCents: matchedPoLine.agreedPackCostCents,
        actualPackCostCents,
        deltaCents: actualPackCostCents - matchedPoLine.agreedPackCostCents,
      });
    }
  }
}

async function finalizePurchaseOrderFulfillment(
  tx: DbTx,
  poState: LockedPoState,
  costVariances: PoCostVariance[],
): Promise<PoFulfillmentSummary> {
  for (const poLine of poState.lines) {
    if (!poLine.dirty) continue;
    await tx
      .update(purchaseOrderLines)
      .set({ receivedPackCount: poLine.received.toFixed(3) })
      .where(eq(purchaseOrderLines.id, poLine.id));
  }

  const allFulfilled = poState.lines.length > 0 && poState.lines.every((l) => l.received.gte(l.ordered));
  const anyReceived = poState.lines.some((l) => l.received.gt(0));
  const hasShortDelivery = poState.lines.some((l) => l.received.lt(l.ordered));

  const nextStatus: 'submitted' | 'partially_received' | 'completed' = allFulfilled
    ? 'completed'
    : anyReceived
      ? 'partially_received'
      : poState.status;

  await tx
    .update(purchaseOrders)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, poState.id));

  return {
    purchaseOrderId: poState.id,
    poNumber: poState.poNumber,
    status: nextStatus,
    hasShortDelivery,
    costVariances,
  };
}

/**
 * Records a delivery receipt, its batches, receipt lines, and ledger movements
 * inside a single atomic database transaction. Idempotent on idempotencyKey.
 */
export async function receiveDelivery(input: ReceiveDeliveryInput): Promise<ReceiveDeliveryResult> {
  if (input.lines.length === 0) {
    return {
      ok: false,
      code: 'empty_lines',
      error: 'A delivery receipt must contain at least one line item.',
    };
  }

  for (const line of input.lines) {
    const packs = new Decimal(line.packCount);
    const packQty = new Decimal(line.packQuantity);
    if (packs.lte(0) || packQty.lte(0)) {
      return {
        ok: false,
        code: 'invalid_quantity',
        error: 'Pack count and pack quantity must both be greater than zero.',
      };
    }
    if (line.lineCostCents !== undefined && line.lineCostCents !== null && line.lineCostCents < 0) {
      return {
        ok: false,
        code: 'invalid_cost',
        error: 'Line cost cannot be negative.',
      };
    }
  }

  try {
    const data = await db.transaction(async (tx) => {
      // Lock PO FOR UPDATE before receipt insert so concurrent deliveries serialize cleanly
      const poState = input.purchaseOrderId
        ? await lockAndLoadPurchaseOrder(tx, input.purchaseOrderId, input.supplierId)
        : null;

      // Idempotency guard: if this key already exists, return the original receipt without writing again
      const insertedReceipts = await tx
        .insert(receipts)
        .values({
          supplierId: input.supplierId,
          deliveryDate: input.deliveryDate,
          reference: input.reference ?? null,
          source: input.source,
          extractionId: input.extractionId ?? null,
          purchaseOrderId: input.purchaseOrderId ?? null,
          idempotencyKey: input.idempotencyKey,
          createdBy: input.userId,
        })
        .onConflictDoNothing({ target: receipts.idempotencyKey })
        .returning({ id: receipts.id });

      if (insertedReceipts.length === 0) {
        const [existing] = await tx
          .select({ id: receipts.id })
          .from(receipts)
          .where(eq(receipts.idempotencyKey, input.idempotencyKey));

        if (!existing) {
          throw new LedgerRollbackError('idempotency_lookup_failed', 'Duplicate receipt key could not be resolved.');
        }

        return {
          receiptId: existing.id,
          movementGroupId: null,
          deduplicated: true,
          poSummary: null,
        };
      }

      const receipt = insertedReceipts[0];

      const [supplier] = await tx
        .select({ id: suppliers.id, isActive: suppliers.isActive })
        .from(suppliers)
        .where(eq(suppliers.id, input.supplierId));

      if (!supplier || !supplier.isActive) {
        throw new LedgerRollbackError('invalid_supplier', 'Selected supplier was not found or is archived.');
      }

      const uniqueProductIds = Array.from(new Set(input.lines.map((l) => l.productId)));
      const productRows = await tx
        .select({
          id: products.id,
          name: products.name,
          tracksExpiry: products.tracksExpiry,
          shelfLifeDays: products.shelfLifeDays,
          isActive: products.isActive,
        })
        .from(products)
        .where(inArray(products.id, uniqueProductIds));

      const productMap = new Map(productRows.map((p) => [p.id, p]));
      const movementGroupId = crypto.randomUUID();
      const costVariances: PoCostVariance[] = [];

      for (const line of input.lines) {
        const product = productMap.get(line.productId);
        if (!product || !product.isActive) {
          throw new LedgerRollbackError(
            'invalid_product',
            'One of the selected products does not exist or has been archived.',
          );
        }

        if (poState) {
          applyLineToPurchaseOrder(line, product.name, poState, costVariances);
        }

        const initialQuantity = new Decimal(line.packCount).mul(new Decimal(line.packQuantity)).toFixed(3);

        let resolvedExpiryDate: string | null = line.expiryDate ?? null;
        let resolvedExpirySource: 'printed' | 'estimated' | 'manual' | null = line.expirySource ?? null;

        if (product.tracksExpiry) {
          if (resolvedExpiryDate) {
            resolvedExpirySource =
              resolvedExpirySource ?? (input.source === 'ai_extraction' ? 'printed' : 'manual');
          } else if (product.shelfLifeDays !== null) {
            resolvedExpiryDate = addDays(input.deliveryDate, product.shelfLifeDays);
            resolvedExpirySource = 'estimated';
          } else {
            throw new LedgerRollbackError(
              'missing_expiry',
              `Enter an expiry date for "${product.name}". Its default shelf life is not configured.`,
            );
          }
        } else if (resolvedExpiryDate) {
          resolvedExpirySource = resolvedExpirySource ?? 'manual';
        } else {
          resolvedExpiryDate = null;
          resolvedExpirySource = null;
        }

        const unitCost =
          line.lineCostCents !== undefined && line.lineCostCents !== null
            ? computeUnitCost(line.lineCostCents, initialQuantity)
            : null;

        const [batch] = await tx
          .insert(batches)
          .values({
            productId: line.productId,
            supplierId: input.supplierId,
            lotCode: line.lotCode ?? null,
            expiryDate: resolvedExpiryDate,
            expirySource: resolvedExpirySource,
            unitCost,
            initialQuantity,
          })
          .returning({ id: batches.id });

        let resolvedSupplierItemId = line.supplierItemId ?? null;

        // Learning loop: optionally save newly mapped supplier item alias
        if (line.saveSupplierAlias && line.descriptionPrinted?.trim()) {
          const normDesc = normalizeText(line.descriptionPrinted);
          const [existingItem] = await tx
            .select({ id: supplierItems.id })
            .from(supplierItems)
            .where(
              and(
                eq(supplierItems.supplierId, input.supplierId),
                eq(supplierItems.descriptionNormalized, normDesc),
              ),
            );

          if (existingItem) {
            resolvedSupplierItemId = existingItem.id;
          } else {
            const [newItem] = await tx
              .insert(supplierItems)
              .values({
                supplierId: input.supplierId,
                productId: line.productId,
                supplierSku: line.supplierSku?.trim() || null,
                description: line.descriptionPrinted.trim(),
                descriptionNormalized: normDesc,
                packLabel: line.packLabel?.trim() || 'Pack',
                packQuantity: new Decimal(line.packQuantity).toFixed(3),
                lastPackCostCents: line.lineCostCents ?? null,
              })
              .returning({ id: supplierItems.id });
            resolvedSupplierItemId = newItem.id;
          }
        }

        await tx.insert(receiptLines).values({
          receiptId: receipt.id,
          batchId: batch.id,
          supplierItemId: resolvedSupplierItemId,
          descriptionPrinted: line.descriptionPrinted ?? null,
          packCount: new Decimal(line.packCount).toFixed(3),
          packQuantity: new Decimal(line.packQuantity).toFixed(3),
          lineCostCents: line.lineCostCents ?? null,
          matchMethod: line.matchMethod,
        });

        await tx.insert(stockMovements).values({
          movementGroupId,
          batchId: batch.id,
          productId: line.productId,
          type: 'receipt',
          quantity: initialQuantity,
          note: input.reference ? `Receipt ${input.reference}` : null,
          createdBy: input.userId,
        });
      }

      const poSummary = poState
        ? await finalizePurchaseOrderFulfillment(tx, poState, costVariances)
        : null;

      return {
        receiptId: receipt.id,
        movementGroupId,
        deduplicated: false,
        poSummary,
      };
    });

    return { ok: true, data };
  } catch (error) {
    if (error instanceof LedgerRollbackError) {
      return { ok: false, code: error.code, error: error.message };
    }
    throw error;
  }
}

