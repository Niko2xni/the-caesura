import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { getBusinessToday } from '@/lib/dates';
import type { BaseUnit } from '@/lib/units';

export type WasteReason = 'expired' | 'spoiled' | 'damaged' | 'other';

export interface WasteReportFilters {
  startDate?: string; // YYYY-MM-DD (Asia/Manila)
  endDate?: string;   // YYYY-MM-DD (Asia/Manila)
  productId?: string;
  reason?: WasteReason;
}

export interface WasteSummaryByReason {
  reason: WasteReason;
  totalQuantity: string;
  totalCostCents: number;
  incidentCount: number;
  costPercentage: number;
}

export interface WasteSummaryByProduct {
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  totalQuantity: string;
  totalCostCents: number;
  incidentCount: number;
}

export interface WasteIncidentRow {
  id: number;
  occurredAt: string;
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  batchId: string;
  lotCode: string | null;
  unitCost: string | null;
  quantity: string;
  costCents: number;
  wasteReason: WasteReason;
  note: string | null;
  createdByName: string;
}

export interface WasteReportData {
  startDate: string;
  endDate: string;
  totalQuantity: string;
  totalCostCents: number;
  totalIncidents: number;
  byReason: WasteSummaryByReason[];
  byProduct: WasteSummaryByProduct[];
  incidents: WasteIncidentRow[];
}

export async function getWasteReport(filters?: WasteReportFilters): Promise<WasteReportData> {
  const today = getBusinessToday();
  const defaultStart = `${today.slice(0, 7)}-01`;
  const startDate = filters?.startDate || defaultStart;
  const endDate = filters?.endDate || today;

  // Build filter conditions
  const conditions = [
    sql`m.type = 'waste'`,
    sql`(m.occurred_at AT TIME ZONE 'Asia/Manila')::date >= ${startDate}::date`,
    sql`(m.occurred_at AT TIME ZONE 'Asia/Manila')::date <= ${endDate}::date`,
  ];

  if (filters?.productId) {
    conditions.push(sql`m.product_id = ${filters.productId}::uuid`);
  }

  if (filters?.reason) {
    conditions.push(sql`m.waste_reason = ${filters.reason}::waste_reason`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // 1. Overall Summary
  const [overall] = await db.execute<{
    total_quantity: string;
    total_cost_cents: string | number;
    incident_count: number;
  }>(sql`
    SELECT
      coalesce(sum(abs(m.quantity)), 0)::numeric(14,3)::text AS total_quantity,
      coalesce(round(sum(abs(m.quantity) * coalesce(b.unit_cost, 0) * 100)), 0)::bigint AS total_cost_cents,
      count(m.id)::int AS incident_count
    FROM stock_movements m
    JOIN batches b ON b.id = m.batch_id
    WHERE ${whereClause}
  `);

  const totalCostCents = Number(overall?.total_cost_cents || 0);
  const totalQuantity = overall?.total_quantity || '0.000';
  const totalIncidents = Number(overall?.incident_count || 0);

  // 2. Summary By Reason
  const reasonRows = await db.execute<{
    waste_reason: WasteReason;
    total_quantity: string;
    total_cost_cents: string | number;
    incident_count: number;
  }>(sql`
    SELECT
      m.waste_reason,
      coalesce(sum(abs(m.quantity)), 0)::numeric(14,3)::text AS total_quantity,
      coalesce(round(sum(abs(m.quantity) * coalesce(b.unit_cost, 0) * 100)), 0)::bigint AS total_cost_cents,
      count(m.id)::int AS incident_count
    FROM stock_movements m
    JOIN batches b ON b.id = m.batch_id
    WHERE ${whereClause}
    GROUP BY m.waste_reason
    ORDER BY total_cost_cents DESC, incident_count DESC
  `);

  // Ensure all 4 reasons exist in the result structure even if 0
  const allReasons: WasteReason[] = ['expired', 'spoiled', 'damaged', 'other'];
  const byReason: WasteSummaryByReason[] = allReasons.map((reason) => {
    const found = reasonRows.find((r) => r.waste_reason === reason);
    const reasonCost = Number(found?.total_cost_cents || 0);
    const percentage = totalCostCents > 0 ? (reasonCost / totalCostCents) * 100 : 0;

    return {
      reason,
      totalQuantity: found?.total_quantity || '0.000',
      totalCostCents: reasonCost,
      incidentCount: Number(found?.incident_count || 0),
      costPercentage: Number(percentage.toFixed(1)),
    };
  }).sort((a, b) => b.totalCostCents - a.totalCostCents);

  // 3. Summary By Product
  const productRows = await db.execute<{
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    total_quantity: string;
    total_cost_cents: string | number;
    incident_count: number;
  }>(sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      coalesce(sum(abs(m.quantity)), 0)::numeric(14,3)::text AS total_quantity,
      coalesce(round(sum(abs(m.quantity) * coalesce(b.unit_cost, 0) * 100)), 0)::bigint AS total_cost_cents,
      count(m.id)::int AS incident_count
    FROM stock_movements m
    JOIN batches b ON b.id = m.batch_id
    JOIN products p ON p.id = m.product_id
    WHERE ${whereClause}
    GROUP BY p.id, p.name, p.sku, p.base_unit
    ORDER BY total_cost_cents DESC, total_quantity DESC
  `);

  const byProduct: WasteSummaryByProduct[] = productRows.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    productSku: r.product_sku,
    baseUnit: r.base_unit,
    totalQuantity: r.total_quantity,
    totalCostCents: Number(r.total_cost_cents || 0),
    incidentCount: Number(r.incident_count || 0),
  }));

  // 4. Itemized Waste Incidents Log
  const incidentRows = await db.execute<{
    id: number;
    occurred_at: Date | string;
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    batch_id: string;
    lot_code: string | null;
    unit_cost: string | null;
    quantity: string;
    cost_cents: string | number;
    waste_reason: WasteReason;
    note: string | null;
    created_by_name: string;
  }>(sql`
    SELECT
      m.id,
      m.occurred_at,
      p.id AS product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      b.id AS batch_id,
      b.lot_code,
      b.unit_cost::text AS unit_cost,
      abs(m.quantity)::numeric(14,3)::text AS quantity,
      coalesce(round(abs(m.quantity) * coalesce(b.unit_cost, 0) * 100), 0)::bigint AS cost_cents,
      m.waste_reason,
      m.note,
      u.name AS created_by_name
    FROM stock_movements m
    JOIN batches b ON b.id = m.batch_id
    JOIN products p ON p.id = m.product_id
    JOIN "user" u ON u.id = m.created_by
    WHERE ${whereClause}
    ORDER BY m.occurred_at DESC, m.id DESC
    LIMIT 200
  `);

  const incidents: WasteIncidentRow[] = incidentRows.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
    productId: r.product_id,
    productName: r.product_name,
    productSku: r.product_sku,
    baseUnit: r.base_unit,
    batchId: r.batch_id,
    lotCode: r.lot_code,
    unitCost: r.unit_cost,
    quantity: r.quantity,
    costCents: Number(r.cost_cents || 0),
    wasteReason: r.waste_reason,
    note: r.note,
    createdByName: r.created_by_name,
  }));

  return {
    startDate,
    endDate,
    totalQuantity,
    totalCostCents,
    totalIncidents,
    byReason,
    byProduct,
    incidents,
  };
}
