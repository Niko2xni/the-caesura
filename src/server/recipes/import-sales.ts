import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  menuItems,
  products,
  recipeIngredients,
  salesImportLines,
  salesImports,
  user,
} from '@/db/schema';
import { normalizeText } from '@/lib/normalise';
import type { BaseUnit } from '@/lib/units';
import { recordUsageInTransaction } from '../ledger/record-usage';
import { importSalesSchema, type ImportSalesInput } from '../validators/recipes';

export interface ParsedSalesCsvLine {
  sku?: string;
  itemName?: string;
  quantitySold: number;
  rowNumber: number;
}

export type ParseSalesCsvResult =
  | {
      ok: true;
      lines: ParsedSalesCsvLine[];
      detectedDate: string | null;
      externalBatchIdSuggestion: string;
    }
  | { ok: false; error: string };

export interface SalesDepletionSummary {
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  quantityDepleted: string;
}

export interface SalesShortfallDetail {
  productId: string;
  productName: string;
  requested: string;
  available: string;
  shortfall: string;
}

export interface ImportSalesData {
  salesImportId: string;
  externalBatchId: string;
  deduplicated: boolean;
  movementGroupId: string;
  salesDate: string;
  totalItemsSold: number;
  depletions: SalesDepletionSummary[];
}

export type ImportSalesResult =
  | { ok: true; data: ImportSalesData }
  | {
      ok: false;
      code: 'invalid_input' | 'unknown_item' | 'inactive_item' | 'empty_recipe' | 'shortfall' | 'db_error';
      error: string;
      unmatchedItems?: string[];
      shortfalls?: SalesShortfallDetail[];
    };

export interface SalesImportHistoryItem {
  id: string;
  externalBatchId: string;
  source: 'csv' | 'webhook' | 'manual';
  salesDate: string;
  fileName: string | null;
  movementGroupId: string;
  totalItemsSold: number;
  importedByName: string;
  createdAt: Date;
  lines: Array<{
    id: string;
    menuItemId: string;
    menuItemNameSnapshot: string;
    quantitySold: number;
  }>;
}

class SalesImportRollbackError extends Error {
  constructor(public readonly result: Extract<ImportSalesResult, { ok: false }>) {
    super(result.error);
    this.name = 'SalesImportRollbackError';
  }
}

const SKU_HEADER_ALIASES = new Set(['sku', 'menu_sku', 'item_sku', 'plu']);
const ITEM_HEADER_ALIASES = new Set([
  'item',
  'item_name',
  'menu_item',
  'name',
  'product',
  'product_name',
  'description',
]);
const QTY_HEADER_ALIASES = new Set([
  'qty',
  'quantity',
  'quantity_sold',
  'sold',
  'units',
  'count',
  'qty_sold',
]);
const DATE_HEADER_ALIASES = new Set(['date', 'sales_date', 'order_date', 'business_date']);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeaderName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parses a POS daily sales CSV into structured lines plus a deterministic batch hash.
 */
export function parseSalesCsv(csvText: string, defaultSalesDate?: string): ParseSalesCsvResult {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const rawLines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (rawLines.length < 2) {
    return { ok: false, error: 'CSV must include a header row and at least one sales row' };
  }

  const headers = parseCsvLine(rawLines[0]).map(normalizeHeaderName);
  const skuIdx = headers.findIndex((h) => SKU_HEADER_ALIASES.has(h));
  const itemIdx = headers.findIndex((h) => ITEM_HEADER_ALIASES.has(h));
  const qtyIdx = headers.findIndex((h) => QTY_HEADER_ALIASES.has(h));
  const dateIdx = headers.findIndex((h) => DATE_HEADER_ALIASES.has(h));

  if (qtyIdx === -1) {
    return {
      ok: false,
      error: 'CSV header must contain a quantity column (e.g. qty, quantity, quantity_sold, sold)',
    };
  }
  if (skuIdx === -1 && itemIdx === -1) {
    return {
      ok: false,
      error: 'CSV header must contain an item or SKU column (e.g. item, item_name, menu_item, sku)',
    };
  }

  const lines: ParsedSalesCsvLine[] = [];
  let detectedDate: string | null = defaultSalesDate && ISO_DATE_RE.test(defaultSalesDate) ? defaultSalesDate : null;

  for (let i = 1; i < rawLines.length; i += 1) {
    const rowNumber = i + 1;
    const cells = parseCsvLine(rawLines[i]);
    const sku = skuIdx >= 0 ? (cells[skuIdx] ?? '').trim() : '';
    const itemName = itemIdx >= 0 ? (cells[itemIdx] ?? '').trim() : '';
    const rawQty = (cells[qtyIdx] ?? '').trim();

    if (!sku && !itemName) {
      return { ok: false, error: `Row ${rowNumber}: missing both SKU and item name` };
    }

    if (!/^\d+$/.test(rawQty)) {
      return {
        ok: false,
        error: `Row ${rowNumber}: quantity "${rawQty}" must be a positive whole integer`,
      };
    }

    const quantitySold = Number.parseInt(rawQty, 10);
    if (!Number.isSafeInteger(quantitySold) || quantitySold <= 0) {
      return {
        ok: false,
        error: `Row ${rowNumber}: quantity "${rawQty}" must be greater than zero`,
      };
    }

    if (dateIdx >= 0) {
      const rawDate = (cells[dateIdx] ?? '').trim();
      if (rawDate.length > 0) {
        if (!ISO_DATE_RE.test(rawDate)) {
          return {
            ok: false,
            error: `Row ${rowNumber}: invalid date "${rawDate}" (expected YYYY-MM-DD)`,
          };
        }
        if (!detectedDate) {
          detectedDate = rawDate;
        }
      }
    }

    lines.push({
      ...(sku ? { sku } : {}),
      ...(itemName ? { itemName } : {}),
      quantitySold,
      rowNumber,
    });
  }

  if (lines.length === 0) {
    return { ok: false, error: 'CSV contains no valid sales rows' };
  }

  const canonical = JSON.stringify({
    date: detectedDate ?? 'undated',
    lines: lines.map((l) => ({
      sku: l.sku?.toUpperCase() ?? null,
      itemName: l.itemName ? normalizeText(l.itemName) : null,
      quantitySold: l.quantitySold,
    })),
  });
  const digest = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24);

  return {
    ok: true,
    lines,
    detectedDate,
    externalBatchIdSuggestion: `csv-${digest}`,
  };
}

/**
 * Atomically imports a POS sales batch, verifies recipes, aggregates ingredient demand,
 * depletes batches via FEFO (`recordUsageInTransaction`), and guarantees idempotency.
 */
export async function importSales(
  rawInput: ImportSalesInput & { userId: string },
): Promise<ImportSalesResult> {
  const parsed = importSalesSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_input',
      error: parsed.error.issues[0]?.message ?? 'Invalid sales import payload',
    };
  }

  const data = parsed.data;
  const totalItemsSold = data.lines.reduce((sum, line) => sum + line.quantitySold, 0);
  const candidateGroupId = crypto.randomUUID();

  try {
    return await db.transaction(async (tx) => {
      // Idempotency lock & early exit on duplicate externalBatchId.
      // Any later validation or stock shortfall throws SalesImportRollbackError,
      // rolling back this insert so the same batch ID can be retried after restocking.
      const inserted = await tx
        .insert(salesImports)
        .values({
          externalBatchId: data.externalBatchId,
          source: data.source,
          salesDate: data.salesDate,
          fileName: data.fileName ?? null,
          movementGroupId: candidateGroupId,
          totalItemsSold,
          importedBy: rawInput.userId,
        })
        .onConflictDoNothing({ target: salesImports.externalBatchId })
        .returning({ id: salesImports.id });

      if (inserted.length === 0) {
        const [existing] = await tx
          .select({
            id: salesImports.id,
            externalBatchId: salesImports.externalBatchId,
            movementGroupId: salesImports.movementGroupId,
            salesDate: salesImports.salesDate,
            totalItemsSold: salesImports.totalItemsSold,
          })
          .from(salesImports)
          .where(eq(salesImports.externalBatchId, data.externalBatchId))
          .limit(1);

        if (!existing) {
          throw new SalesImportRollbackError({
            ok: false,
            code: 'db_error',
            error: 'Duplicate batch detected, but existing import record could not be loaded',
          });
        }

        return {
          ok: true,
          data: {
            salesImportId: existing.id,
            externalBatchId: existing.externalBatchId,
            deduplicated: true,
            movementGroupId: existing.movementGroupId,
            salesDate: existing.salesDate,
            totalItemsSold: existing.totalItemsSold,
            depletions: [],
          },
        };
      }

      const salesImportId = inserted[0].id;

      const allMenuItems = await tx
        .select({
          id: menuItems.id,
          sku: menuItems.sku,
          name: menuItems.name,
          nameNormalized: menuItems.nameNormalized,
          posItemName: menuItems.posItemName,
          isActive: menuItems.isActive,
        })
        .from(menuItems);

      const byId = new Map(allMenuItems.map((m) => [m.id, m]));
      const bySku = new Map(allMenuItems.map((m) => [m.sku.trim().toLowerCase(), m]));
      const byNameNorm = new Map<string, (typeof allMenuItems)[number]>();
      for (const m of allMenuItems) {
        byNameNorm.set(m.nameNormalized, m);
        if (m.posItemName && m.posItemName.trim().length > 0) {
          byNameNorm.set(normalizeText(m.posItemName), m);
        }
      }

      const unmatchedItems: string[] = [];
      const archivedItems: string[] = [];
      const soldByMenuItem = new Map<string, { name: string; quantitySold: number }>();

      for (const line of data.lines) {
        let matched: (typeof allMenuItems)[number] | undefined;

        if (line.menuItemId) {
          matched = byId.get(line.menuItemId);
        } else if (line.sku && line.sku.trim().length > 0) {
          matched = bySku.get(line.sku.trim().toLowerCase());
          if (!matched && line.itemName && line.itemName.trim().length > 0) {
            matched = byNameNorm.get(normalizeText(line.itemName));
          }
        } else if (line.itemName && line.itemName.trim().length > 0) {
          matched = byNameNorm.get(normalizeText(line.itemName));
        }

        const label = line.itemName || line.sku || line.menuItemId || 'unknown';
        if (!matched) {
          unmatchedItems.push(label);
          continue;
        }
        if (!matched.isActive) {
          archivedItems.push(matched.name);
          continue;
        }

        const prev = soldByMenuItem.get(matched.id);
        soldByMenuItem.set(matched.id, {
          name: matched.name,
          quantitySold: (prev?.quantitySold ?? 0) + line.quantitySold,
        });
      }

      if (unmatchedItems.length > 0) {
        const unique = Array.from(new Set(unmatchedItems));
        throw new SalesImportRollbackError({
          ok: false,
          code: 'unknown_item',
          error: `Unmatched menu item(s): ${unique.join(', ')}`,
          unmatchedItems: unique,
        });
      }

      if (archivedItems.length > 0) {
        const unique = Array.from(new Set(archivedItems));
        throw new SalesImportRollbackError({
          ok: false,
          code: 'inactive_item',
          error: `Archived menu item(s) cannot be sold: ${unique.join(', ')}`,
          unmatchedItems: unique,
        });
      }

      const resolvedMenuIds = Array.from(soldByMenuItem.keys());
      const recipeRows = await tx
        .select({
          menuItemId: recipeIngredients.menuItemId,
          productId: recipeIngredients.productId,
          quantity: recipeIngredients.quantity,
          productName: products.name,
          productSku: products.sku,
          baseUnit: products.baseUnit,
        })
        .from(recipeIngredients)
        .innerJoin(products, eq(recipeIngredients.productId, products.id))
        .where(inArray(recipeIngredients.menuItemId, resolvedMenuIds));

      const ingredientsByMenu = new Map<string, typeof recipeRows>();
      for (const row of recipeRows) {
        const arr = ingredientsByMenu.get(row.menuItemId) ?? [];
        arr.push(row);
        ingredientsByMenu.set(row.menuItemId, arr);
      }

      for (const [menuId, info] of soldByMenuItem.entries()) {
        if ((ingredientsByMenu.get(menuId)?.length ?? 0) === 0) {
          throw new SalesImportRollbackError({
            ok: false,
            code: 'empty_recipe',
            error: `Menu item "${info.name}" has no recipe ingredients configured`,
          });
        }
      }

      // Aggregate total required quantity per stock product across all sold items
      const demandByProduct = new Map<
        string,
        { productId: string; productName: string; productSku: string; baseUnit: BaseUnit; quantity: Decimal }
      >();

      for (const [menuId, info] of soldByMenuItem.entries()) {
        const bom = ingredientsByMenu.get(menuId) ?? [];
        for (const ing of bom) {
          const added = new Decimal(ing.quantity).times(info.quantitySold);
          const existing = demandByProduct.get(ing.productId);
          if (existing) {
            existing.quantity = existing.quantity.plus(added);
          } else {
            demandByProduct.set(ing.productId, {
              productId: ing.productId,
              productName: ing.productName,
              productSku: ing.productSku,
              baseUnit: ing.baseUnit,
              quantity: added,
            });
          }
        }
      }

      // Acquire product locks in deterministic lexicographical order to prevent deadlocks
      const sortedProductIds = Array.from(demandByProduct.keys()).sort();
      const shortfalls: SalesShortfallDetail[] = [];
      const depletions: SalesDepletionSummary[] = [];

      for (const productId of sortedProductIds) {
        const demand = demandByProduct.get(productId)!;
        const requestedStr = demand.quantity.toFixed(3);

        const usageRes = await recordUsageInTransaction(tx, {
          productId,
          quantity: requestedStr,
          note: `POS ${data.source.toUpperCase()} sales (${data.salesDate})`,
          userId: rawInput.userId,
          movementGroupId: candidateGroupId,
        });

        if (!usageRes.ok) {
          shortfalls.push({
            productId,
            productName: demand.productName,
            requested: requestedStr,
            available: usageRes.available ?? '0.000',
            shortfall: usageRes.shortfall ?? requestedStr,
          });
        } else {
          depletions.push({
            productId,
            productName: demand.productName,
            productSku: demand.productSku,
            baseUnit: demand.baseUnit,
            quantityDepleted: requestedStr,
          });
        }
      }

      if (shortfalls.length > 0) {
        const summary = shortfalls
          .map((s) => `${s.productName} (need ${s.requested}, usable ${s.available})`)
          .join('; ');
        throw new SalesImportRollbackError({
          ok: false,
          code: 'shortfall',
          error: `Insufficient usable stock for sales depletion: ${summary}`,
          shortfalls,
        });
      }

      await tx.insert(salesImportLines).values(
        Array.from(soldByMenuItem.entries()).map(([menuItemId, info]) => ({
          salesImportId,
          menuItemId,
          menuItemNameSnapshot: info.name,
          quantitySold: info.quantitySold,
        })),
      );

      return {
        ok: true,
        data: {
          salesImportId,
          externalBatchId: data.externalBatchId,
          deduplicated: false,
          movementGroupId: candidateGroupId,
          salesDate: data.salesDate,
          totalItemsSold,
          depletions,
        },
      };
    });
  } catch (err) {
    if (err instanceof SalesImportRollbackError) {
      return err.result;
    }
    console.error('[importSales] Unexpected error:', err);
    return {
      ok: false,
      code: 'db_error',
      error: 'Failed to record POS sales import',
    };
  }
}

/**
 * Returns recent POS sales imports with their resolved line items.
 */
export async function listSalesImports(limit = 20): Promise<SalesImportHistoryItem[]> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const imports = await db
    .select({
      id: salesImports.id,
      externalBatchId: salesImports.externalBatchId,
      source: salesImports.source,
      salesDate: salesImports.salesDate,
      fileName: salesImports.fileName,
      movementGroupId: salesImports.movementGroupId,
      totalItemsSold: salesImports.totalItemsSold,
      importedByName: user.name,
      createdAt: salesImports.createdAt,
    })
    .from(salesImports)
    .innerJoin(user, eq(salesImports.importedBy, user.id))
    .orderBy(desc(salesImports.createdAt))
    .limit(safeLimit);

  if (imports.length === 0) return [];

  const importIds = imports.map((i) => i.id);
  const lines = await db
    .select({
      id: salesImportLines.id,
      salesImportId: salesImportLines.salesImportId,
      menuItemId: salesImportLines.menuItemId,
      menuItemNameSnapshot: salesImportLines.menuItemNameSnapshot,
      quantitySold: salesImportLines.quantitySold,
    })
    .from(salesImportLines)
    .where(inArray(salesImportLines.salesImportId, importIds));

  const linesByImport = new Map<string, SalesImportHistoryItem['lines']>();
  for (const line of lines) {
    const arr = linesByImport.get(line.salesImportId) ?? [];
    arr.push({
      id: line.id,
      menuItemId: line.menuItemId,
      menuItemNameSnapshot: line.menuItemNameSnapshot,
      quantitySold: line.quantitySold,
    });
    linesByImport.set(line.salesImportId, arr);
  }

  return imports.map((imp) => ({
    ...imp,
    lines: linesByImport.get(imp.id) ?? [],
  }));
}

