import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, products, settings, stockMovements, user } from '@/db/schema';
import { getBusinessToday } from '@/lib/dates';
import type { BaseUnit } from '@/lib/units';

export interface ProductStockSummary {
  id: string;
  sku: string;
  name: string;
  categoryName: string | null;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  shelfLifeDays: number | null;
  reorderPoint: string;
  usableQuantity: string;
  expiredQuantity: string;
  isActive: boolean;
}

export interface UsableBatchInfo {
  id: string;
  productId: string;
  expiryDate: string | null;
  receivedAt: string;
  quantityOnHand: string;
}

export interface BatchDetailRow {
  batchId: string;
  lotCode: string | null;
  receivedAt: string;
  expiryDate: string | null;
  expirySource: 'printed' | 'estimated' | 'manual' | null;
  unitCost: string | null;
  initialQuantity: string;
  quantityOnHand: string;
  isExpired: boolean;
}

export interface MovementHistoryRow {
  id: number;
  movementGroupId: string;
  batchId: string;
  type: 'receipt' | 'usage' | 'waste' | 'adjustment';
  quantity: string;
  wasteReason: 'expired' | 'spoiled' | 'damaged' | 'other' | null;
  note: string | null;
  occurredAt: string;
  createdByName: string;
}

/**
 * Uncached read over product_stock for all active products.
 */
export async function getProductStockList(): Promise<ProductStockSummary[]> {
  const rows = await db.execute<{
    id: string;
    sku: string;
    name: string;
    category_name: string | null;
    base_unit: BaseUnit;
    tracks_expiry: boolean;
    shelf_life_days: number | null;
    reorder_point: string;
    usable_quantity: string;
    expired_quantity: string;
    is_active: boolean;
  }>(sql`
    SELECT
      p.id,
      p.sku,
      p.name,
      c.name AS category_name,
      p.base_unit,
      p.tracks_expiry,
      p.shelf_life_days,
      p.reorder_point::text AS reorder_point,
      coalesce(ps.usable_quantity, 0)::numeric(14,3)::text AS usable_quantity,
      coalesce(ps.expired_quantity, 0)::numeric(14,3)::text AS expired_quantity,
      p.is_active
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_stock ps ON ps.product_id = p.id
    WHERE p.is_active = true
    ORDER BY p.name ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryName: row.category_name,
    baseUnit: row.base_unit,
    tracksExpiry: row.tracks_expiry,
    shelfLifeDays: row.shelf_life_days,
    reorderPoint: row.reorder_point,
    usableQuantity: row.usable_quantity,
    expiredQuantity: row.expired_quantity,
    isActive: row.is_active,
  }));
}

/**
 * Fresh read of usable (non-expired, non-empty) batches in FEFO order for a product.
 */
export async function getUsableBatchesForProduct(productId: string): Promise<UsableBatchInfo[]> {
  const rows = await db.execute<{
    batch_id: string;
    product_id: string;
    expiry_date: string | null;
    received_at: Date | string;
    quantity_on_hand: string;
  }>(sql`
    SELECT
      batch_id,
      product_id,
      expiry_date::text AS expiry_date,
      received_at,
      quantity_on_hand::text AS quantity_on_hand
    FROM batch_stock
    WHERE product_id = ${productId}::uuid
      AND quantity_on_hand > 0
      AND (expiry_date IS NULL OR expiry_date >= business_today())
    ORDER BY expiry_date NULLS LAST, received_at ASC, batch_id ASC
  `);

  return rows.map((row) => ({
    id: row.batch_id,
    productId: row.product_id,
    expiryDate: row.expiry_date,
    receivedAt:
      row.received_at instanceof Date ? row.received_at.toISOString() : String(row.received_at),
    quantityOnHand: row.quantity_on_hand,
  }));
}

/**
 * Fresh read of a single product, its stock totals, its batches in FEFO order,
 * and its recent movement history.
 */
export async function getProductDetail(productId: string) {
  const [product] = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      nameNormalized: products.nameNormalized,
      categoryId: products.categoryId,
      categoryName: categories.name,
      baseUnit: products.baseUnit,
      tracksExpiry: products.tracksExpiry,
      shelfLifeDays: products.shelfLifeDays,
      reorderPoint: products.reorderPoint,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, productId));

  if (!product) {
    return null;
  }

  const [totals] = await db.execute<{
    usable_quantity: string;
    expired_quantity: string;
  }>(sql`
    SELECT
      coalesce(usable_quantity, 0)::numeric(14,3)::text AS usable_quantity,
      coalesce(expired_quantity, 0)::numeric(14,3)::text AS expired_quantity
    FROM product_stock
    WHERE product_id = ${productId}::uuid
  `);

  const batchRows = await db.execute<{
    batch_id: string;
    lot_code: string | null;
    received_at: Date | string;
    expiry_date: string | null;
    expiry_source: 'printed' | 'estimated' | 'manual' | null;
    unit_cost: string | null;
    initial_quantity: string;
    quantity_on_hand: string;
    is_expired: boolean;
  }>(sql`
    SELECT
      b.id AS batch_id,
      b.lot_code,
      b.received_at,
      b.expiry_date::text AS expiry_date,
      b.expiry_source,
      b.unit_cost::text AS unit_cost,
      b.initial_quantity::text AS initial_quantity,
      bs.quantity_on_hand::text AS quantity_on_hand,
      (b.expiry_date IS NOT NULL AND b.expiry_date < business_today()) AS is_expired
    FROM batches b
    JOIN batch_stock bs ON bs.batch_id = b.id
    WHERE b.product_id = ${productId}::uuid
    ORDER BY
      (bs.quantity_on_hand > 0) DESC,
      b.expiry_date ASC NULLS LAST,
      b.received_at ASC,
      b.id ASC
  `);

  const movementRows = await db
    .select({
      id: stockMovements.id,
      movementGroupId: stockMovements.movementGroupId,
      batchId: stockMovements.batchId,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      wasteReason: stockMovements.wasteReason,
      note: stockMovements.note,
      occurredAt: stockMovements.occurredAt,
      createdByName: user.name,
    })
    .from(stockMovements)
    .innerJoin(user, eq(stockMovements.createdBy, user.id))
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id))
    .limit(100);

  return {
    product,
    usableQuantity: totals?.usable_quantity ?? '0.000',
    expiredQuantity: totals?.expired_quantity ?? '0.000',
    batches: batchRows.map(
      (b): BatchDetailRow => ({
        batchId: b.batch_id,
        lotCode: b.lot_code,
        receivedAt:
          b.received_at instanceof Date ? b.received_at.toISOString() : String(b.received_at),
        expiryDate: b.expiry_date,
        expirySource: b.expiry_source,
        unitCost: b.unit_cost,
        initialQuantity: b.initial_quantity,
        quantityOnHand: b.quantity_on_hand,
        isExpired: b.is_expired,
      }),
    ),
    movements: movementRows.map(
      (m): MovementHistoryRow => ({
        id: m.id,
        movementGroupId: m.movementGroupId,
        batchId: m.batchId,
        type: m.type,
        quantity: m.quantity,
        wasteReason: m.wasteReason,
        note: m.note,
        occurredAt: m.occurredAt.toISOString(),
        createdByName: m.createdByName,
      }),
    ),
  };
}

export interface ExpiringBatchAlert {
  batchId: string;
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  lotCode: string | null;
  expiryDate: string;
  quantityOnHand: string;
  daysRemaining: number;
}

export async function getExpiringBatchAlerts(daysAhead: number = 3): Promise<ExpiringBatchAlert[]> {
  const rows = await db.execute<{
    batch_id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    lot_code: string | null;
    expiry_date: string;
    quantity_on_hand: string;
    days_remaining: number;
  }>(sql`
    SELECT
      bs.batch_id,
      bs.product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      b.lot_code,
      bs.expiry_date::text AS expiry_date,
      bs.quantity_on_hand::text AS quantity_on_hand,
      (bs.expiry_date - business_today())::int AS days_remaining
    FROM batch_stock bs
    JOIN batches b ON b.id = bs.batch_id
    JOIN products p ON p.id = bs.product_id
    WHERE bs.quantity_on_hand > 0
      AND bs.expiry_date IS NOT NULL
      AND bs.expiry_date >= business_today()
      AND bs.expiry_date <= (business_today() + (${daysAhead} || ' days')::interval)::date
    ORDER BY bs.expiry_date ASC, p.name ASC
  `);

  return rows.map((r) => ({
    batchId: r.batch_id,
    productId: r.product_id,
    productName: r.product_name,
    productSku: r.product_sku,
    baseUnit: r.base_unit,
    lotCode: r.lot_code,
    expiryDate: r.expiry_date,
    quantityOnHand: r.quantity_on_hand,
    daysRemaining: Number(r.days_remaining),
  }));
}

export interface OnHandBatchOption {
  batchId: string;
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  lotCode: string | null;
  expiryDate: string | null;
  quantityOnHand: string;
  isExpired: boolean;
}

export async function getOnHandBatches(): Promise<OnHandBatchOption[]> {
  const rows = await db.execute<{
    batch_id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    lot_code: string | null;
    expiry_date: string | null;
    quantity_on_hand: string;
    is_expired: boolean;
  }>(sql`
    SELECT
      bs.batch_id,
      bs.product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      b.lot_code,
      bs.expiry_date::text AS expiry_date,
      bs.quantity_on_hand::text AS quantity_on_hand,
      (bs.expiry_date IS NOT NULL AND bs.expiry_date < business_today()) AS is_expired
    FROM batch_stock bs
    JOIN batches b ON b.id = bs.batch_id
    JOIN products p ON p.id = bs.product_id
    WHERE bs.quantity_on_hand > 0
    ORDER BY p.name ASC, bs.expiry_date NULLS LAST, b.received_at ASC
  `);

  return rows.map((r) => ({
    batchId: r.batch_id,
    productId: r.product_id,
    productName: r.product_name,
    productSku: r.product_sku,
    baseUnit: r.base_unit,
    lotCode: r.lot_code,
    expiryDate: r.expiry_date,
    quantityOnHand: r.quantity_on_hand,
    isExpired: Boolean(r.is_expired),
  }));
}

export interface ExpiredBatchWorkItem {
  batchId: string;
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  lotCode: string | null;
  expiryDate: string;
  quantityOnHand: string;
  daysExpired: number;
}

export interface UseSoonBatchWorkItem {
  batchId: string;
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  lotCode: string | null;
  expiryDate: string;
  quantityOnHand: string;
  daysRemaining: number;
}

export interface ReorderProductWorkItem {
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  usableQuantity: string;
  reorderPoint: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierLeadTimeDays: number | null;
}

export interface TodayWorkListsData {
  businessDate: string;
  expiryWarningDays: number;
  expiredBatches: ExpiredBatchWorkItem[];
  useSoonBatches: UseSoonBatchWorkItem[];
  reorderProducts: ReorderProductWorkItem[];
}

/**
 * Real-time, uncached query fetching the 3 actionable work lists for the Today screen (FR-11):
 * 1. Write off (expired batches with remaining stock)
 * 2. Use first (batches expiring within expiry_warning_days)
 * 3. Reorder (products at or below reorder point)
 */
export async function getTodayWorkLists(): Promise<TodayWorkListsData> {
  const businessDate = getBusinessToday();

  // Get warning days threshold from settings (default 3)
  const [settingRow] = await db
    .select({ expiryWarningDays: settings.expiryWarningDays })
    .from(settings)
    .where(eq(settings.id, 1));
  const expiryWarningDays = settingRow?.expiryWarningDays ?? 3;

  // 1. Expired batches on hand (Write off)
  const expiredRows = await db.execute<{
    batch_id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    lot_code: string | null;
    expiry_date: string;
    quantity_on_hand: string;
    days_expired: number;
  }>(sql`
    SELECT
      bs.batch_id,
      bs.product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      b.lot_code,
      bs.expiry_date::text AS expiry_date,
      bs.quantity_on_hand::text AS quantity_on_hand,
      (business_today() - bs.expiry_date)::int AS days_expired
    FROM batch_stock bs
    JOIN batches b ON b.id = bs.batch_id
    JOIN products p ON p.id = bs.product_id
    WHERE bs.quantity_on_hand > 0
      AND bs.expiry_date IS NOT NULL
      AND bs.expiry_date < business_today()
    ORDER BY bs.expiry_date ASC, p.name ASC
  `);

  // 2. Batches expiring soon (Use first)
  const useSoonRows = await db.execute<{
    batch_id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    lot_code: string | null;
    expiry_date: string;
    quantity_on_hand: string;
    days_remaining: number;
  }>(sql`
    SELECT
      bs.batch_id,
      bs.product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      b.lot_code,
      bs.expiry_date::text AS expiry_date,
      bs.quantity_on_hand::text AS quantity_on_hand,
      (bs.expiry_date - business_today())::int AS days_remaining
    FROM batch_stock bs
    JOIN batches b ON b.id = bs.batch_id
    JOIN products p ON p.id = bs.product_id
    WHERE bs.quantity_on_hand > 0
      AND bs.expiry_date IS NOT NULL
      AND bs.expiry_date >= business_today()
      AND bs.expiry_date <= (business_today() + (${expiryWarningDays} || ' days')::interval)::date
    ORDER BY bs.expiry_date ASC, p.name ASC
  `);

  // 3. Products at or below reorder point (Reorder)
  const reorderRows = await db.execute<{
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    usable_quantity: string;
    reorder_point: string;
    supplier_id: string | null;
    supplier_name: string | null;
    supplier_lead_time_days: number | null;
  }>(sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      coalesce(ps.usable_quantity, 0)::numeric(14,3)::text AS usable_quantity,
      p.reorder_point::text AS reorder_point,
      sup.id AS supplier_id,
      sup.name AS supplier_name,
      sup.lead_time_days AS supplier_lead_time_days
    FROM products p
    LEFT JOIN product_stock ps ON ps.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT s.id, s.name, s.lead_time_days
      FROM supplier_items si
      JOIN suppliers s ON s.id = si.supplier_id
      WHERE si.product_id = p.id AND s.is_active = true
      LIMIT 1
    ) sup ON true
    WHERE p.is_active = true
      AND p.reorder_point > 0
      AND coalesce(ps.usable_quantity, 0) <= p.reorder_point
    ORDER BY p.name ASC
  `);

  return {
    businessDate,
    expiryWarningDays,
    expiredBatches: expiredRows.map((r) => ({
      batchId: r.batch_id,
      productId: r.product_id,
      productName: r.product_name,
      productSku: r.product_sku,
      baseUnit: r.base_unit,
      lotCode: r.lot_code,
      expiryDate: r.expiry_date,
      quantityOnHand: r.quantity_on_hand,
      daysExpired: Number(r.days_expired),
    })),
    useSoonBatches: useSoonRows.map((r) => ({
      batchId: r.batch_id,
      productId: r.product_id,
      productName: r.product_name,
      productSku: r.product_sku,
      baseUnit: r.base_unit,
      lotCode: r.lot_code,
      expiryDate: r.expiry_date,
      quantityOnHand: r.quantity_on_hand,
      daysRemaining: Number(r.days_remaining),
    })),
    reorderProducts: reorderRows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      productSku: r.product_sku,
      baseUnit: r.base_unit,
      usableQuantity: r.usable_quantity,
      reorderPoint: r.reorder_point,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      supplierLeadTimeDays: r.supplier_lead_time_days !== null ? Number(r.supplier_lead_time_days) : null,
    })),
  };
}



