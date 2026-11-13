import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { client, db } from '@/db';
import {
  products,
  salesImportLines,
  salesImports,
  settings,
  suppliers,
  user,
} from '@/db/schema';
import { addDays } from '@/lib/dates';
import { getProductDetail } from '../ledger/queries';
import { receiveDelivery } from '../ledger/receive-delivery';
import { createMenuItemSchema, importSalesSchema } from '../validators/recipes';
import {
  archiveMenuItem,
  getMenuItemDetail,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
} from './recipes';
import { importSales, listSalesImports, parseSalesCsv } from './import-sales';

const testRunId = crypto.randomUUID().slice(0, 8);

let testUserId: string;
let testSupplierId: string;
let businessToday: string;

async function createTestProduct(opts: {
  suffix: string;
  baseUnit: 'each' | 'g' | 'ml';
  tracksExpiry: boolean;
  shelfLifeDays?: number | null;
}) {
  const [prod] = await db
    .insert(products)
    .values({
      sku: `RCP-${testRunId}-${opts.suffix}`,
      name: `Recipe Ing ${opts.suffix} ${testRunId}`,
      nameNormalized: `recipe ing ${opts.suffix.toLowerCase()} ${testRunId}`,
      baseUnit: opts.baseUnit,
      tracksExpiry: opts.tracksExpiry,
      shelfLifeDays: opts.tracksExpiry ? (opts.shelfLifeDays ?? 7) : null,
      reorderPoint: '0.000',
    })
    .returning({ id: products.id });

  return prod.id;
}

describe('Phase 5 Validators & CSV Parser unit tests', () => {
  it('createMenuItemSchema rejects duplicate ingredients and invalid quantities', () => {
    const pid = crypto.randomUUID();

    const dup = createMenuItemSchema.safeParse({
      sku: 'LATTE-TEST',
      name: 'Iced Latte',
      ingredients: [
        { productId: pid, quantity: '18' },
        { productId: pid, quantity: '200' },
      ],
    });
    expect(dup.success).toBe(false);

    const zero = createMenuItemSchema.safeParse({
      sku: 'LATTE-TEST',
      name: 'Iced Latte',
      ingredients: [{ productId: pid, quantity: '0' }],
    });
    expect(zero.success).toBe(false);

    const negPrice = createMenuItemSchema.safeParse({
      sku: 'LATTE-TEST',
      name: 'Iced Latte',
      priceCents: -100,
      ingredients: [{ productId: pid, quantity: '18.5' }],
    });
    expect(negPrice.success).toBe(false);

    const ok = createMenuItemSchema.safeParse({
      sku: 'LATTE-TEST',
      name: 'Iced Latte',
      posItemName: 'Iced Latte 16oz',
      priceCents: 16500,
      ingredients: [{ productId: pid, quantity: '18.5' }],
    });
    expect(ok.success).toBe(true);
  });

  it('importSalesSchema requires identifier and positive integer quantity', () => {
    const missingId = importSalesSchema.safeParse({
      externalBatchId: 'batch-1',
      salesDate: '2026-11-13',
      lines: [{ quantitySold: 2 }],
    });
    expect(missingId.success).toBe(false);

    const decimalQty = importSalesSchema.safeParse({
      externalBatchId: 'batch-1',
      salesDate: '2026-11-13',
      lines: [{ sku: 'LATTE', quantitySold: 1.5 }],
    });
    expect(decimalQty.success).toBe(false);

    const valid = importSalesSchema.safeParse({
      externalBatchId: 'batch-1',
      source: 'webhook',
      salesDate: '2026-11-13',
      lines: [{ itemName: 'Spanish Latte', quantitySold: 3 }],
    });
    expect(valid.success).toBe(true);
  });

  it('parseSalesCsv parses BOM, quoted commas, alternate headers, and generates deterministic hash', () => {
    const csv = [
      '\uFEFF"menu_sku","menu_item","quantity_sold","business_date"',
      '"MENU-SL-01","Spanish Latte, ""Iced"" 16oz","12","2026-11-13"',
      '"","Hot Americano","5","2026-11-13"',
    ].join('\n');

    const res1 = parseSalesCsv(csv);
    const res2 = parseSalesCsv(csv);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    if (!res1.ok || !res2.ok) throw new Error('Expected CSV parse success');

    expect(res1.detectedDate).toBe('2026-11-13');
    expect(res1.lines).toEqual([
      {
        sku: 'MENU-SL-01',
        itemName: 'Spanish Latte, "Iced" 16oz',
        quantitySold: 12,
        rowNumber: 2,
      },
      {
        itemName: 'Hot Americano',
        quantitySold: 5,
        rowNumber: 3,
      },
    ]);
    expect(res1.externalBatchIdSuggestion).toBe(res2.externalBatchIdSuggestion);
    expect(res1.externalBatchIdSuggestion).toMatch(/^csv-[a-f0-9]{24}$/);
  });

  it('parseSalesCsv rejects invalid quantities and missing required columns', () => {
    const missingQty = parseSalesCsv('sku,name\nLATTE,Latte');
    expect(missingQty.ok).toBe(false);

    const badQty = parseSalesCsv('item,qty\nLatte,-3');
    expect(badQty.ok).toBe(false);

    const zeroQty = parseSalesCsv('item,qty\nLatte,0');
    expect(zeroQty.ok).toBe(false);
  });
});

describe('Phase 5 Recipes & Sales Depletion integration tests (PostgreSQL 17)', () => {
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

    testUserId = `recipe-user-${testRunId}`;
    await db.insert(user).values({
      id: testUserId,
      name: 'Recipe Tester',
      email: `recipe-${testRunId}@example.local`,
      role: 'admin',
    });

    const [sup] = await db
      .insert(suppliers)
      .values({ name: `Recipe Supplier ${testRunId}` })
      .returning({ id: suppliers.id });
    testSupplierId = sup.id;

    const [{ today }] = await db.execute<{ today: string }>(
      sql`SELECT business_today()::text AS today`,
    );
    businessToday = today;
  });

  afterAll(async () => {
    await client.end();
  });

  it('CRUD & maxServableUnits: ignores expired batches when computing capacity', async () => {
    const beansId = await createTestProduct({
      suffix: 'BEANS-CAP',
      baseUnit: 'g',
      tracksExpiry: true,
      shelfLifeDays: 60,
    });
    const milkId = await createTestProduct({
      suffix: 'MILK-CAP',
      baseUnit: 'ml',
      tracksExpiry: true,
      shelfLifeDays: 14,
    });

    // Receive 100g beans + 500ml usable milk + 1000ml EXPIRED milk
    const rec = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: businessToday,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: beansId,
          packCount: '1',
          packQuantity: '100',
          expiryDate: addDays(businessToday, 30),
          matchMethod: 'manual',
        },
        {
          productId: milkId,
          packCount: '1',
          packQuantity: '500',
          expiryDate: addDays(businessToday, 5),
          matchMethod: 'manual',
        },
        {
          productId: milkId,
          packCount: '1',
          packQuantity: '1000',
          expiryDate: addDays(businessToday, -1),
          matchMethod: 'manual',
        },
      ],
    });
    expect(rec.ok).toBe(true);

    const created = await createMenuItem({
      sku: `CAP-LATTE-${testRunId}`,
      name: `Capacity Latte ${testRunId}`,
      posItemName: `Cap Latte POS ${testRunId}`,
      category: 'Espresso & Milk',
      priceCents: 16500,
      ingredients: [
        { productId: beansId, quantity: '18.000' },
        { productId: milkId, quantity: '200.000' },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const listed = await listMenuItems();
    const found = listed.find((m) => m.id === created.data.menuItemId);
    expect(found).toBeDefined();
    // floor(100 / 18) = 5, floor(500 / 200) = 2 -> bottleneck is milk at 2
    expect(found?.maxServableUnits).toBe(2);

    // Update recipe: reduce milk requirement to 100ml -> floor(500/100) = 5
    const updated = await updateMenuItem({
      id: created.data.menuItemId,
      sku: `CAP-LATTE-${testRunId}`,
      name: `Capacity Latte ${testRunId}`,
      posItemName: `Cap Latte POS ${testRunId}`,
      category: 'Espresso & Milk',
      priceCents: 17000,
      ingredients: [
        { productId: beansId, quantity: '18.000' },
        { productId: milkId, quantity: '100.000' },
      ],
    });
    expect(updated.ok).toBe(true);

    const detail = await getMenuItemDetail(created.data.menuItemId);
    expect(detail?.priceCents).toBe(17000);
    expect(detail?.maxServableUnits).toBe(5);

    // Archive hides from default listMenuItems
    const archived = await archiveMenuItem(created.data.menuItemId);
    expect(archived.ok).toBe(true);
    const activeOnly = await listMenuItems();
    expect(activeOnly.some((m) => m.id === created.data.menuItemId)).toBe(false);
    const withArchived = await listMenuItems({ includeArchived: true });
    expect(withArchived.some((m) => m.id === created.data.menuItemId)).toBe(true);
  });

  it('multi-item FEFO sales depletion, POS alias match, shared movementGroupId & idempotency', async () => {
    const beansId = await createTestProduct({
      suffix: 'BEANS-FEFO',
      baseUnit: 'g',
      tracksExpiry: true,
      shelfLifeDays: 60,
    });
    const milkId = await createTestProduct({
      suffix: 'MILK-FEFO',
      baseUnit: 'ml',
      tracksExpiry: true,
      shelfLifeDays: 14,
    });
    const cupId = await createTestProduct({
      suffix: 'CUP-FEFO',
      baseUnit: 'each',
      tracksExpiry: false,
      shelfLifeDays: null,
    });

    const expSoon = addDays(businessToday, 1);
    const expLater = addDays(businessToday, 5);
    const expExpired = addDays(businessToday, -2);

    const rec = await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: businessToday,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: beansId,
          packCount: '1',
          packQuantity: '500',
          expiryDate: expLater,
          matchMethod: 'manual',
        },
        // Expired milk (must NOT be touched)
        {
          productId: milkId,
          packCount: '1',
          packQuantity: '500',
          expiryDate: expExpired,
          matchMethod: 'manual',
        },
        // Earliest usable milk batch (300 ml)
        {
          productId: milkId,
          packCount: '1',
          packQuantity: '300',
          expiryDate: expSoon,
          matchMethod: 'manual',
        },
        // Newer usable milk batch (1000 ml)
        {
          productId: milkId,
          packCount: '1',
          packQuantity: '1000',
          expiryDate: expLater,
          matchMethod: 'manual',
        },
        // Non-expiring cups
        {
          productId: cupId,
          packCount: '50',
          packQuantity: '1',
          expiryDate: null,
          matchMethod: 'manual',
        },
      ],
    });
    expect(rec.ok).toBe(true);

    const menuLatte = await createMenuItem({
      sku: `SPANISH-16-${testRunId}`,
      name: `Iced Spanish Latte ${testRunId}`,
      posItemName: `Spanish Latte 16oz ${testRunId}`,
      priceCents: 17500,
      ingredients: [
        { productId: beansId, quantity: '18.000' },
        { productId: milkId, quantity: '200.000' },
        { productId: cupId, quantity: '1.000' },
      ],
    });
    const menuCortado = await createMenuItem({
      sku: `CORTADO-8-${testRunId}`,
      name: `Hot Cortado ${testRunId}`,
      priceCents: 14500,
      ingredients: [
        { productId: beansId, quantity: '18.000' },
        { productId: milkId, quantity: '100.000' },
        { productId: cupId, quantity: '1.000' },
      ],
    });
    expect(menuLatte.ok && menuCortado.ok).toBe(true);

    const batchKey = `pos-batch-fefo-${testRunId}`;
    // Sell 2x Spanish Latte (via POS alias!) + 1x Hot Cortado (via SKU!)
    // Total demand: beans = 54g, milk = 500ml (must drain 300ml expSoon + 200ml expLater), cups = 3 each
    const importRes = await importSales({
      externalBatchId: batchKey,
      source: 'csv',
      salesDate: businessToday,
      fileName: 'daily-sales.csv',
      userId: testUserId,
      lines: [
        { itemName: `Spanish Latte 16oz ${testRunId}`, quantitySold: 2 },
        { sku: `CORTADO-8-${testRunId}`, quantitySold: 1 },
      ],
    });

    expect(importRes.ok).toBe(true);
    if (!importRes.ok) return;

    expect(importRes.data.deduplicated).toBe(false);
    expect(importRes.data.totalItemsSold).toBe(3);

    // Check FEFO milk batch balances and shared movementGroupId via ledger queries
    const milkDetail = await getProductDetail(milkId);
    const beansDetail = await getProductDetail(beansId);
    const cupDetail = await getProductDetail(cupId);

    const byExp = new Map(milkDetail?.batches.map((b) => [b.expiryDate, b.quantityOnHand]));
    expect(byExp.get(expExpired)).toBe('500.000'); // Untouched!
    expect(byExp.get(expSoon)).toBe('0.000'); // Drained completely first!
    expect(byExp.get(expLater)).toBe('800.000'); // 1000 - 200 = 800 remaining

    // Verify all usage movements across ingredients share the single movementGroupId
    const groupMovements = [
      ...(milkDetail?.movements ?? []),
      ...(beansDetail?.movements ?? []),
      ...(cupDetail?.movements ?? []),
    ].filter((m) => m.movementGroupId === importRes.data.movementGroupId);

    expect(groupMovements.length).toBe(4); // 1 beans + 2 milk batches + 1 cup
    expect(groupMovements.every((m) => m.type === 'usage')).toBe(true);

    // Idempotency: importing same batchKey again must return deduplicated: true & NOT move stock again
    const dupRes = await importSales({
      externalBatchId: batchKey,
      source: 'csv',
      salesDate: businessToday,
      fileName: 'daily-sales.csv',
      userId: testUserId,
      lines: [
        { itemName: `Spanish Latte 16oz ${testRunId}`, quantitySold: 2 },
        { sku: `CORTADO-8-${testRunId}`, quantitySold: 1 },
      ],
    });
    expect(dupRes.ok).toBe(true);
    if (!dupRes.ok) return;
    expect(dupRes.data.deduplicated).toBe(true);
    expect(dupRes.data.movementGroupId).toBe(importRes.data.movementGroupId);

    const milkDetailAfterDup = await getProductDetail(milkId);
    const beansDetailAfterDup = await getProductDetail(beansId);
    const cupDetailAfterDup = await getProductDetail(cupId);
    const movementsAfterDup = [
      ...(milkDetailAfterDup?.movements ?? []),
      ...(beansDetailAfterDup?.movements ?? []),
      ...(cupDetailAfterDup?.movements ?? []),
    ].filter((m) => m.movementGroupId === importRes.data.movementGroupId);
    expect(movementsAfterDup.length).toBe(4);

    // History query includes our import and snapshot lines
    const history = await listSalesImports(10);
    const historyRow = history.find((h) => h.externalBatchId === batchKey);
    expect(historyRow).toBeDefined();
    expect(historyRow?.lines.length).toBe(2);
    expect(historyRow?.totalItemsSold).toBe(3);
  });

  it('shortfall triggers complete rollback across all ingredients and permits retry after restock', async () => {
    const beansId = await createTestProduct({
      suffix: 'BEANS-ROLLBACK',
      baseUnit: 'g',
      tracksExpiry: true,
      shelfLifeDays: 60,
    });
    const cupId = await createTestProduct({
      suffix: 'CUP-ROLLBACK',
      baseUnit: 'each',
      tracksExpiry: false,
      shelfLifeDays: null,
    });

    // Only 20g beans (enough for 1 shot, not 2!), plenty of cups (100 each)
    await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: businessToday,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: beansId,
          packCount: '1',
          packQuantity: '20',
          expiryDate: addDays(businessToday, 20),
          matchMethod: 'manual',
        },
        {
          productId: cupId,
          packCount: '100',
          packQuantity: '1',
          expiryDate: null,
          matchMethod: 'manual',
        },
      ],
    });

    const menuRes = await createMenuItem({
      sku: `AMERICANO-RB-${testRunId}`,
      name: `Americano Rollback ${testRunId}`,
      ingredients: [
        { productId: beansId, quantity: '18.000' },
        { productId: cupId, quantity: '1.000' },
      ],
    });
    expect(menuRes.ok).toBe(true);

    const batchKey = `shortfall-retry-${testRunId}`;
    // Try selling 2 shots (needs 36g beans, only 20g available; 2 cups IS available)
    const failRes = await importSales({
      externalBatchId: batchKey,
      source: 'webhook',
      salesDate: businessToday,
      userId: testUserId,
      lines: [{ sku: `AMERICANO-RB-${testRunId}`, quantitySold: 2 }],
    });

    expect(failRes.ok).toBe(false);
    if (failRes.ok) return;
    expect(failRes.code).toBe('shortfall');
    expect(failRes.shortfalls?.length).toBe(1);
    expect(failRes.shortfalls?.[0].productId).toBe(beansId);

    // Ensure ZERO sales_imports row and ZERO cup usage movements leaked!
    const persistedImport = await db
      .select({ id: salesImports.id })
      .from(salesImports)
      .where(eq(salesImports.externalBatchId, batchKey));
    expect(persistedImport.length).toBe(0);

    const cupDetailAfterFail = await getProductDetail(cupId);
    const cupUsages = (cupDetailAfterFail?.movements ?? []).filter((m) => m.type === 'usage');
    expect(cupUsages.length).toBe(0);

    // Restock 50g beans and retry with the EXACT SAME batchKey
    await receiveDelivery({
      supplierId: testSupplierId,
      deliveryDate: businessToday,
      source: 'manual',
      idempotencyKey: crypto.randomUUID(),
      userId: testUserId,
      lines: [
        {
          productId: beansId,
          packCount: '1',
          packQuantity: '50',
          expiryDate: addDays(businessToday, 20),
          matchMethod: 'manual',
        },
      ],
    });

    const retryRes = await importSales({
      externalBatchId: batchKey,
      source: 'webhook',
      salesDate: businessToday,
      userId: testUserId,
      lines: [{ sku: `AMERICANO-RB-${testRunId}`, quantitySold: 2 }],
    });
    expect(retryRes.ok).toBe(true);
    if (!retryRes.ok) return;
    expect(retryRes.data.deduplicated).toBe(false);
    expect(retryRes.data.totalItemsSold).toBe(2);

    const linesPersisted = await db
      .select({ quantitySold: salesImportLines.quantitySold })
      .from(salesImportLines)
      .where(eq(salesImportLines.salesImportId, retryRes.data.salesImportId));
    expect(linesPersisted).toEqual([{ quantitySold: 2 }]);
  });

  it('rejects unknown or archived menu items without modifying ledger or sales_imports', async () => {
    const beansId = await createTestProduct({
      suffix: 'BEANS-UNK',
      baseUnit: 'g',
      tracksExpiry: false,
      shelfLifeDays: null,
    });

    const archivedMenu = await createMenuItem({
      sku: `ARCHIVED-MENU-${testRunId}`,
      name: `Seasonal Drink ${testRunId}`,
      ingredients: [{ productId: beansId, quantity: '15.000' }],
    });
    expect(archivedMenu.ok).toBe(true);
    if (!archivedMenu.ok) return;

    await archiveMenuItem(archivedMenu.data.menuItemId);

    const unknownKey = `unknown-${testRunId}`;
    const unkRes = await importSales({
      externalBatchId: unknownKey,
      source: 'manual',
      salesDate: businessToday,
      userId: testUserId,
      lines: [{ itemName: 'Nonexistent Drink 999', quantitySold: 1 }],
    });
    expect(unkRes.ok).toBe(false);
    if (!unkRes.ok) {
      expect(unkRes.code).toBe('unknown_item');
    }

    const archivedKey = `archived-${testRunId}`;
    const archRes = await importSales({
      externalBatchId: archivedKey,
      source: 'manual',
      salesDate: businessToday,
      userId: testUserId,
      lines: [{ sku: `ARCHIVED-MENU-${testRunId}`, quantitySold: 1 }],
    });
    expect(archRes.ok).toBe(false);
    if (!archRes.ok) {
      expect(archRes.code).toBe('inactive_item');
    }

    const leaked = await db
      .select({ id: salesImports.id })
      .from(salesImports)
      .where(eq(salesImports.externalBatchId, archivedKey));
    expect(leaked.length).toBe(0);
  });
});

